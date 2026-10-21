# RAG / Chat Pipeline — As-Built Design

> As of 2026-03-21. Covers `ask_question_to_app` end-to-end flow, model selection, system prompts, and conversation threading.

---

## Request Flow

```
Client (CLI / MCP / Discord / PWA)
  │
  ▼
apiFront.js  →  CommandHandler.invoke("ask_question_to_app", params)
  │
  ▼
ragCommands.js  →  ask_question_to_app(params)
  │
  ├─ hydrateCommunityIdFromProducts(params)   // resolve community_id from Products/{app_id}
  │
  ├─ prepare_chat_context(params)             // communityManagement.js
  │   ├─ Load Community, App, KnowledgeBase from Firestore
  │   ├─ Model selection: model_name_override || kb.cache_model_name || DEFAULT_AI_MODEL
  │   ├─ System prompt: kb.system_instructions (loaded from Drive system_instructions.md)
  │   ├─ Document-anchored chat: prepend file content if file_id provided
  │   └─ Multi-doc context: prepend doc contents if doc_ids provided
  │
  ▼
geminiInteractions.js  →  ask_with_interactions(kb, prompt, previous_interaction_id)
  │
  ├─ buildInitialContents()
  │   ├─ First message: Pinecone search → top-K chunks as context prefix
  │   └─ Continuation: skip initial search, use chat history
  │
  ├─ Create Gemini model:
  │   model = genAI.getGenerativeModel({
  │     model: kb.cache_model_name,
  │     systemInstruction: kb.system_instructions,
  │     tools: [search_pinecone function declaration]
  │   })
  │
  ├─ Function calling loop (up to 5 iterations):
  │   └─ If Gemini calls search_pinecone(query, topK):
  │       → Execute Pinecone search scoped to {community_id, app_id, kb_name}
  │       → Append results as function response
  │       → Loop again
  │
  └─ Return: { text, sources[], interaction_id, advertisements[] }
```

---

## Firestore Schema

### KnowledgeBase

**Path:** `Community/{community_id}/Apps/{app_id}/KnowledgeBases/{knowledgebase_name}`

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `cache_model_name` | string | `DEFAULT_AI_MODEL` | **Active model for RAG.** Fine-tuned model ID goes here. |
| `system_instructions` | string\|null | null | **System prompt.** Loaded from `system_instructions.md` in Drive. |
| `use_cache` | boolean | false | Gemini prompt caching |
| `cache_ttl` | number | 2880 (hrs) | Cache TTL |
| `gemini_cache_id` | string | "" | Gemini cache token |
| `rag_enabled` | boolean | false | RAG indexing active |
| `rag_vector_count` | number | 0 | Pinecone vector count |
| `rag_last_sync` | Timestamp | null | Last sync time |
| `rag_sync_state` | object | null | Sync progress |
| `is_private` | boolean | false | Entitlement-gated |
| `owner_id` | string\|null | null | For private KBs |

### App

**Path:** `Community/{community_id}/Apps/{app_id}`

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `default_app_model` | string | `DEFAULT_AI_MODEL` | Informational only — **not used for RAG queries** |
| `knowledgebase_name` | string | "General" | Default KB |
| `repo_url` | string\|null | null | Git repo for KB sync |
| `repo_branch` | string\|null | null | Git branch |
| `repo_subfolder` | string\|null | null | Subfolder within repo |

### Community

**Path:** `Community/{community_id}`

| Field | Notes |
|-------|-------|
| `default_app_id` | Fallback when no `app_id` in request |

---

## Model Selection Chain

```
Priority (highest → lowest):
  1. params.model_name_override     ← request-time override
  2. kb.cache_model_name            ← Firestore KnowledgeBase document
  3. utils.DEFAULT_AI_MODEL         ← "gemini-2.0-flash" (defaults-config.json)
```

To use a fine-tuned model: set `cache_model_name` on the KnowledgeBase document in Firestore. The Gemini API accepts fine-tuned model IDs (`tunedModels/my-model-abc123`) in the same `model` field as base model names.

---

## System Prompt Pipeline

1. Create `system_instructions.md` in the app's Google Drive folder
2. Call `kb.loadSystemInstructions()` — searches Drive by filename
3. Stored in `KnowledgeBase.system_instructions` field in Firestore
4. Injected into `genAI.getGenerativeModel({ systemInstruction: ... })`

The system prompt acts as the per-app "CLAUDE.md equivalent" — it shapes all RAG responses for that KB.

---

## Conversation Threading

- Each response returns an `interaction_id`
- Client passes it back as `previous_interaction_id` on next message
- When continuing: initial Pinecone search is skipped (Gemini has prior context)
- Gemini's function calling can still do additional searches mid-conversation

**MCP support:** The `ask_question_to_app` MCP tool now exposes `previous_interaction_id` in its inputSchema (as of 2026-03-21).

---

## Pinecone Scoping

- **Namespace:** `{community_id}/{app_id}/{knowledgebase_name}`
- **Metadata filter:** `{ community_id, app_id, knowledgebase_name }` (+ optional `file_id`)
- **Embedding model:** `llama-text-embed-v2` (Pinecone integrated)
- **Chunk metadata:** `{ community_id, app_id, knowledgebase_name, file_id, entity_type, file_name, gcs_uri }`

---

## Generation Config

```json
{
  "temperature": 0.3,
  "topK": 40,
  "topP": 0.95,
  "maxOutputTokens": 8192
}
```

---

## Key Files

The command dispatch, the `ask_question_to_app` handler, chat-context preparation, the Gemini function-calling loop and the Pinecone search all run in the DeSciX Cloud service, which is not a published package. The pieces that ship in public packages:

| Package | Path | Role |
|---------|------|------|
| `@descix/platform-api` | `src/mcp-tools/nativeTools.js` (`@descix/platform-api/mcp-tools`) | MCP tool definitions (`NATIVE_MCP_TOOLS`), shared by the CLI's stdio server and the Cloud's HTTP MCP path |
| `@descix/cli` | `bin/mcp-server.js` | The CLI's stdio MCP server: relays tool calls to `/apifront` |

---

## Fine-Tuned Model Integration Point

To swap a KB to a fine-tuned model:

1. **Create the tuned model** via Gemini API (`tunedModels/` prefix)
2. **Update Firestore:** Set `KnowledgeBase.cache_model_name = "tunedModels/my-model-id"`
3. **No code changes needed** — `getGenerativeModel({ model: modelName })` accepts tuned model IDs natively
4. **System instructions still apply** — they're injected alongside the model, layering app-specific behavior on top of fine-tuning

For a base model that underlies all EVP KBs: fine-tune on `descix-evp`'s KB, then set that tuned model ID as `cache_model_name` on all EVP KnowledgeBase documents.
