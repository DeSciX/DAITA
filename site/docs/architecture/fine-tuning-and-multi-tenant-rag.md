# Fine-Tuning Tool & Multi-Tenant RAG — Design Document

> As of 2026-03-22. Covers the fine-tuning Q&A tool, multi-tenant vector isolation model, and how both relate to the DeSciX community/app/knowledgebase hierarchy.

---

## 1. Motivation

The DeSciX platform operates as a virtual university with three project groups (DeSciX, EGPT, SSG-Studio), each managed by an EVP agent. These agents need deep, always-current knowledge of their project domains — but loading that knowledge by re-reading source codebases burns LLM context windows and doesn't scale.

The solution is twofold:

1. **RAG-backed knowledge bases** — each EVP agent has a DeSciX app whose KB contains curated project documentation, queryable via MCP tools
2. **Fine-tuned models** — a model trained on the platform's conceptual framework becomes the base layer for all EVP RAG responses, so agents inherently understand DeSciX without retrieving platform docs for every query

This document describes the fine-tuning tool built to enable (2) and the multi-tenant isolation model that makes (1) safe for multi-community, multi-app deployments on a single Pinecone index.

---

## 2. DeSciX Entity Hierarchy

DeSciX organizes knowledge in a strict three-level hierarchy, mirrored in both Firestore and Pinecone:

```
Community
  └── App
        └── KnowledgeBase
              └── Document (file)
                    └── Chunk (vector)
```

### Firestore Paths

```
Community/{community_id}
  ├── default_app_id: string         ← fallback when no app_id in request
  │
  └── Apps/{app_id}
        ├── default_app_model: string  ← informational only
        ├── knowledgebase_name: string ← default KB (usually "General")
        ├── repo_url, repo_branch      ← Git source for KB sync
        │
        └── KnowledgeBases/{knowledgebase_name}
              ├── cache_model_name: string      ← ACTIVE model for RAG (base or tuned)
              ├── tuned_model_name: string|null  ← currently deployed tuned model
              ├── system_instructions: string    ← system prompt (per-KB CLAUDE.md equivalent)
              ├── rag_enabled: boolean
              ├── rag_vector_count: number
              ├── owner_id: string|null          ← for private KBs
              ├── is_private: boolean
              │
              ├── TuningData/{doc_id}            ← Q&A pairs for fine-tuning
              │     ├── text_input, output, enabled, source
              │     └── created_at, updated_at
              │
              └── TuningJobs/{job_id}            ← fine-tuning job records
                    ├── operation_name, tuned_model_name
                    ├── base_model, status, epoch_count
                    └── created_at, completed_at, error
```

### Naming Convention

| Type | Pattern | Example |
|------|---------|---------|
| Community default app | `{community_id}` | `daita`, `egpt` |
| Community utility app | `{community_id}-{short_name}` | `descix-ssg`, `descix-evp` |
| NFT-associated app | Token symbol directly | `daita`, `powch` |

App IDs are opaque to routing — `community_id` is always resolved from `Products/{app_id}` via `hydrateCommunityIdFromProducts()`, never parsed from the app_id string.

---

## 3. Multi-Tenant Isolation via Metadata Filters

### Why Not Namespaces?

Pinecone namespaces provide hard partitioning — vectors in one namespace are invisible to queries in another. This sounds like multi-tenancy, but it creates a problem: **cross-scope queries are impossible.**

If community A's documentation references community B's APIs, a namespace-isolated query in A can never retrieve B's relevant chunks. The `tell_me_how` discovery command, which searches across all apps a user has access to, would require querying every namespace separately — an N-query fan-out that doesn't scale.

### DeSciX's Approach: Single Namespace + Metadata Filters

All vectors live in a single Pinecone namespace (`default`). Multi-tenancy is enforced at query time through metadata filters, which Pinecone evaluates server-side before returning results.

```
const DEFAULT_NAMESPACE = 'default';  // All vectors share one namespace

export function getNamespaceForKB(kbContext) {
    return DEFAULT_NAMESPACE;  // community_id is a metadata filter, not a namespace
}
```

Every chunk record carries mandatory multi-tenancy fields:

```javascript
{
    id: "${community_id}:${app_id}:${kb_id}:${file_id}:${chunk_idx}",
    text: "chunk content",                    // embedded by Pinecone server-side
    // Multi-tenancy metadata (ALL REQUIRED)
    community_id: "daita",
    app_id: "descix-evp",
    knowledgebase_name: "General",
    file_id: "local:abc123",
    entity_type: "CHUNK",
    // Document metadata
    owner_id: "user@example.com",
    file_name: "architecture.md",
    chunk_idx: 0,
    total_chunks: 12
}
```

Records are validated before upsert — `validateChunkRecord()` rejects any record missing `community_id`, `app_id`, or `knowledgebase_name`.

### Isolation Granularity

The `buildMetadataFilter()` function constructs Pinecone filters at any combination of levels:

| Granularity | Filter | Use Case |
|-------------|--------|----------|
| **Community** | `{ community_id: { $eq: "daita" } }` | All daita apps' knowledge |
| **App** | `+ app_id: { $eq: "descix-evp" }` | Single app's KB |
| **KnowledgeBase** | `+ knowledgebase_name: { $eq: "General" }` | Single KB within app |
| **Document** | `+ file_id: { $eq: "local:abc123" }` | Single file's chunks |
| **Entity type** | `+ entity_type: { $eq: "SERVICE_DOC" }` | Only service READMEs |
| **Owner** | `+ owner_id: { $eq: "user@example.com" }` | User's private documents |
| **Cross-community** | `{ community_ids: { $in: ["daita", "egpt"] } }` | Multi-community discovery |

The filter builder supports both single values (`$eq`) and arrays (`$in`) for any field:

```javascript
export function buildMetadataFilter(kbContext) {
    const filter = {};
    if (kbContext.community_ids?.length > 0) {
        filter.community_id = { $in: kbContext.community_ids };
    } else if (kbContext.community_id) {
        filter.community_id = { $eq: kbContext.community_id };
    }
    // Same pattern for app_id/app_ids, knowledgebase_name, file_id, entity_type/entity_types
    return filter;
}
```

### Private KBs and Entitlement-Gated Access

When `KnowledgeBase.is_private = true`, the `prepare_chat_context()` function checks that the requesting user's ID matches `kb.owner_id` before proceeding. The Pinecone filter adds `owner_id` to scope results to that user's documents.

This means a shared Pinecone index can host:
- Public community KBs (anyone can query)
- Private user KBs (only the owner sees their vectors)
- Mixed KBs (some documents are owner-restricted, others are public)

### Vector ID Format

Chunk IDs encode the full hierarchy for deterministic upsert/delete:

```
{community_id}:{app_id}:{kb_id}:{file_id}:{chunk_idx}
```

Example: `descix:descix-evp:General:local_abc123:0`

This format enables:
- **Deduplication** — re-chunking the same file produces the same IDs, so upserts overwrite cleanly
- **Targeted deletion** — delete all chunks for a file, KB, app, or community using ID prefix patterns
- **Audit** — any vector can be traced back to its source document and KB

### Comparison: Namespace vs Metadata Filter Isolation

| Capability | Namespace Isolation | Metadata Filter Isolation |
|------------|-------------------|--------------------------|
| Hard tenant boundary | Yes | Yes (server-side filter) |
| Cross-tenant queries | No (N fan-out) | Yes (single query, `$in` filter) |
| Granularity | Namespace-level only | Any metadata field combination |
| Index cost | One namespace per tenant | Single namespace, shared index |
| Discovery (`tell_me_how`) | Query all namespaces | Single query with entity_type + entitlement filter |
| Private documents | Separate namespace per user | `owner_id` filter within shared namespace |
| Performance | Slightly faster (smaller scan set) | Pinecone optimizes filters natively |

---

## 4. Fine-Tuning Tool Architecture

### Purpose

The fine-tuning tool lets platform admins:
1. **Curate Q&A pairs** — the training dataset for a Gemini fine-tuned model
2. **Preview behavior** — by loading all Q&A pairs as system context into a large-context model (zero-cost simulation)
3. **Train** — submit a Gemini fine-tuning job via the `generativelanguage_v1beta` API
4. **Deploy** — set the tuned model as the active model for a KB, so all subsequent `ask_question_to_app` calls use it

### Data Flow

```
                    ┌──────────────────────────────────────────────┐
                    │              Admin (PWA)                      │
                    │                                              │
                    │  ┌─────────────┐    ┌──────────────────┐   │
                    │  │  Q&A Editor  │    │  Preview Chat    │   │
                    │  │  (editable   │    │  (simulates      │   │
                    │  │   cards)     │    │   tuned model)   │   │
                    │  └──────┬──────┘    └────────┬─────────┘   │
                    │         │                     │              │
                    └─────────┼─────────────────────┼──────────────┘
                              │                     │
                    ┌─────────▼─────────────────────▼──────────────┐
                    │              apiFront.js                      │
                    │         POST /apifront/                       │
                    └─────────┬─────────────────────┬──────────────┘
                              │                     │
              ┌───────────────▼────┐    ┌───────────▼─────────────┐
              │  save_tuning_qa    │    │  preview_tuned_chat     │
              │  list_tuning_qa    │    │                         │
              │                    │    │  Loads all enabled Q&A  │
              │  Persists to       │    │  pairs → formats as     │
              │  Firestore         │    │  system instruction →   │
              │  TuningData/       │    │  sends to large-context │
              │                    │    │  model (e.g. gemini-    │
              └────────────────────┘    │  2.5-pro)               │
                                        └─────────────────────────┘
                              │
              ┌───────────────▼────────────────────────────────────┐
              │  start_tuning_job                                  │
              │                                                    │
              │  Load enabled Q&A pairs (≥10 required)             │
              │       │                                            │
              │       ▼                                            │
              │  geminiTuningService.createTunedModel()             │
              │       │                                            │
              │       ▼                                            │
              │  googleapis generativelanguage_v1beta               │
              │  POST tunedModels.create({                         │
              │    base_model: "models/gemini-2.0-flash-001",      │
              │    tuning_task: { training_data: { examples } },   │
              │    hyperparameters: { epoch_count, learning_rate }  │
              │  })                                                │
              │       │                                            │
              │       ▼                                            │
              │  Store job in Firestore TuningJobs/                │
              └────────────────────────────────────────────────────┘
                              │
              ┌───────────────▼────┐
              │  get_tuning_status │   (polls operation, updates job doc)
              └───────────────┬────┘
                              │
              ┌───────────────▼────────────────────────────────────┐
              │  deploy_tuned_model                                │
              │                                                    │
              │  Verify job.status === 'ACTIVE'                    │
              │       │                                            │
              │       ▼                                            │
              │  kb.cache_model_name = job.tuned_model_name        │
              │  kb.tuned_model_name = job.tuned_model_name        │
              │  kb.to_firestore()                                 │
              │       │                                            │
              │       ▼                                            │
              │  All ask_question_to_app calls now use tuned model │
              └────────────────────────────────────────────────────┘
```

### Backend Commands

| Command | Purpose | Key Params |
|---------|---------|------------|
| `list_tuning_qa` | Load Q&A pairs for a KB | `app_id`, `knowledgebase_name` |
| `save_tuning_qa` | Create/update/delete Q&A pairs | `app_id`, `qa_pairs[]`, `delete_ids[]` |
| `preview_tuned_chat` | Simulate fine-tuned responses | `app_id`, `message`, `preview_model` |
| `start_tuning_job` | Submit Gemini fine-tuning | `app_id`, `base_model`, `epoch_count` |
| `get_tuning_status` | Poll training progress | `app_id`, `job_id` |
| `list_tuning_jobs` | List all jobs for a KB | `app_id` |
| `deploy_tuned_model` | Set tuned model as active | `app_id`, `job_id` |

All commands follow the standard DeSciX pattern:
1. Receive `app_id` from client
2. Call `hydrateCommunityIdFromProducts(params)` to resolve `community_id` authoritatively from `Products/{app_id}`
3. Load the `KnowledgeBase` from Firestore at `Community/{cid}/Apps/{aid}/KnowledgeBases/{kbName}`
4. Operate within that scope

### Model Selection After Deployment

The model selection chain is unchanged — the fine-tuning tool just writes to the same field that was always there:

```
Priority (highest → lowest):
  1. params.model_name_override     ← request-time override (e.g., user picks premium model)
  2. kb.cache_model_name            ← Firestore KnowledgeBase document (tuned model ID goes here)
  3. utils.DEFAULT_AI_MODEL         ← "gemini-2.0-flash" (global fallback)
```

When a tuned model is deployed, `cache_model_name` is set to something like `tunedModels/descix-evp-general-1711100000`. The Gemini SDK's `getGenerativeModel({ model: modelName })` accepts tuned model IDs in the same parameter as base model names — no code change required in the RAG pipeline.

### Preview vs Fine-Tuning: Two Different Mechanisms

**Preview** uses context injection, not fine-tuning:
- All enabled Q&A pairs are loaded from Firestore
- Formatted as a system instruction: `"You have been fine-tuned on the following Q&A pairs..."`
- Sent to a large-context model (e.g., gemini-2.5-pro with 1M context window)
- The model "behaves like" a fine-tuned model because it has the Q&A in its prompt
- Cost: standard inference pricing (no training cost)
- Use: rapid iteration on Q&A set quality

**Fine-tuning** creates a new model:
- Q&A pairs are sent to the Gemini fine-tuning API
- Google trains a new model variant on those examples over multiple epochs
- The result is a new model ID (`tunedModels/...`) that inherently knows the Q&A content
- Cost: training token pricing × epochs
- Use: production deployment where the Q&A set is stable

### Gemini API Integration

The `@google/generative-ai` JS SDK (v0.24.1) does not support fine-tuning operations. The tool uses two separate clients:

| Operation | SDK | Why |
|-----------|-----|-----|
| Inference (preview chat, RAG) | `@google/generative-ai` → `GoogleGenerativeAI` | Standard generation, function calling |
| Fine-tuning (create, monitor, list) | `googleapis` → `google.generativelanguage('v1beta')` | Only SDK with tuning API surface |

Auth for the `googleapis` client uses the existing service account JWT in `geminiAPI.js`, which already declares the `generative-language.tuning` scope.

---

## 5. Knowledge Hierarchy for EVP Agents

The fine-tuning tool enables a layered knowledge architecture:

```
Layer 1: Fine-Tuned Base Model (descix-evp)
  │  Platform concepts, CLI, architecture, community/app model
  │  Baked into model weights — no retrieval needed
  │
  ├── Layer 2: RAG (egpt-evp KB)
  │     EGPT-specific proofs, math, course materials
  │     Retrieved from Pinecone at query time
  │
  ├── Layer 2: RAG (descix-ssg-evp KB)
  │     SSG pipeline, audio processing, lecture production
  │     Retrieved from Pinecone at query time
  │
  └── Layer 2: RAG (descix-evp KB)
        DeSciX platform docs, deployment, services
        Retrieved from Pinecone at query time
```

To implement this:
1. Fine-tune a model on `descix-evp`'s full Q&A set
2. Deploy it to `descix-evp`'s KB as `cache_model_name`
3. Set the same tuned model ID on `egpt-evp` and `descix-ssg-evp` KBs
4. Each EVP's system_instructions and RAG chunks provide domain-specific context
5. The tuned model provides platform context that all three share

This means `egpt-evp` doesn't need DeSciX architecture docs in its own KB — the fine-tuned model already knows that context from training.

---

## 6. UI Components

### AdminPanel Tab Structure

```
AdminPanel.jsx
  ├── Tab 0: Users (DriveSettings)
  ├── Tab 1: Community (AppManager)
  ├── Tab 2: Pools (Stake/LP/Reserves/IPO)
  ├── Tab 3: Marketing (Airdrop)
  └── Tab 4: Fine-Tuning (FineTuningPanel)    ← NEW
```

### FineTuningPanel Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  Fine-Tuning: descix/descix-evp                                 │
│  [Preview Model ▼]  [Training Base Model ▼]  ~$0.01 est.       │
├──────────────────────────────────┬──────────────────────────────┤
│  Q&A Editor (60%)                │  Preview + Deploy (40%)      │
│                                  │                              │
│  [+ Add] [Select All] [Deselect]│  ┌──────────────────────┐   │
│  42 enabled / 50 total           │  │  Preview Chat        │   │
│                                  │  │  (large-context       │   │
│  ☑ Q: What is DeSciX?           │  │   model simulation)   │   │
│    A: DeSciX is a DEX...        │  │                       │   │
│                           [✓][✕]│  │  User: What is...     │   │
│                                  │  │  Bot: DeSciX is...    │   │
│  ☑ Q: How do apps work?         │  └──────────────────────┘   │
│    A: Apps belong to...          │                              │
│                           [✓][✕]│  ┌──────────────────────┐   │
│                                  │  │  Fine-Tuning Jobs     │   │
│  ☐ Q: (disabled pair)           │  │  [Start Fine-Tuning]  │   │
│    A: ...                        │  │                       │   │
│                                  │  │  ● gemini-2.0-flash   │   │
│                                  │  │    ACTIVE  [Deploy]   │   │
│                                  │  └──────────────────────┘   │
└──────────────────────────────────┴──────────────────────────────┘
```

### Component Hierarchy

| Component | File | Role |
|-----------|------|------|
| `FineTuningPanel` | `admin/FineTuningPanel.jsx` | Container: model selectors, cost estimate, split layout |
| `QAPairEditor` | `admin/QAPairEditor.jsx` | Single Q&A card: checkbox, question/answer TextFields, save/delete |
| `TuningPreviewChat` | `admin/TuningPreviewChat.jsx` | Chat widget: calls `preview_tuned_chat`, renders markdown responses |
| `TuningJobMonitor` | `admin/TuningJobMonitor.jsx` | Start/poll/deploy: job list, progress bar, 30s polling interval |

---

## 7. Key Files

The tuning command handlers, the Gemini tuning wrapper and the admin Fine-Tuning tab are part of the DeSciX Cloud service and its PWA, which are not published packages. The pieces that ship in public packages:

| Package | Path | Role |
|---------|------|------|
| `@descix/cloud-core` | `src/storageUtils.js` | `FirestoreCollections.KB_TUNING_DATA()`, `KB_TUNING_JOBS()` |
| `@descix/platform-api` | `src/mcp-tools/nativeTools.js` (`@descix/platform-api/mcp-tools`) | The `ask_question_to_app` tool schema, including `previous_interaction_id` |

---

## 8. Cost Estimation

Fine-tuning cost is estimated client-side based on Gemini's published pricing:

```javascript
const PRICING = {  // per 1K training tokens
  'models/gemini-2.0-flash-001': 0.0001,
  'models/gemini-2.5-flash-preview-04-17': 0.00015,
};

// estimate = (qaCount × ~200 tokens/pair × epochs) / 1000 × rate
```

A typical EVP KB with 50 Q&A pairs trained for 5 epochs ≈ 50,000 tokens ≈ $0.005–$0.05 depending on the base model. This is displayed in the UI header as an informational estimate; actual billing flows through the GCP project.

---

## 9. Related Documents

- [RAG/Chat As-Built](rag-chat-as-built.md) — end-to-end request flow, model selection chain, Pinecone scoping
- [Unified Product Registry](unified-product-registry.md) — `Products/{app_id}` as canonical lookup, `hydrateCommunityIdFromProducts()`
- [Federated MCP Mesh](federated-mcp-mesh.md) — MCP server tool definitions, service discovery
