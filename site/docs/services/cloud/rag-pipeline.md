# RAG Pipeline Architecture

This document describes the RAG (Retrieval-Augmented Generation) pipeline for knowledge base vectorization and retrieval.

## Git Mode (CLI developers — primary path)

CLI developers use `descix kb corpus sync` as the canonical KB sync path. The corpus command walks the app's `.descix/manifests/` corpus manifest, uses git blob SHAs to detect changed files, chunks them, and upserts/deletes vectors in Pinecone via the API.

```
Local MD files in {appPath}/kb/{kbId}/  (tracked by corpus manifest)
     ↓  descix kb corpus sync -a <app_id>
         ↓  CorpusWalker (git blob SHA change detection)
         ↓  kb_sync_chunks API call
         ↓  Pinecone (vectors upserted/deleted directly)
```

To pull Drive source docs to local markdown: `descix drive pull`.
To push local staging docs to Drive: `descix drive push`.

Drift detection: `descix kb doctor -a <app_id> -k <kb_name>` (compares local sync-state to live Pinecone vector count).

## Drive Mode (PWA users — server-side only)

Non-developer users upload files via the PWA. The server-side pipeline handles extraction and vectorization. This path is **never triggered by the CLI**.

## Storage Split

### Pinecone (Vector Database)
- **Stores**: Chunk text + vectors (via integrated embeddings)
- **Purpose**: Semantic search and retrieval
- **Metadata**: `community_id`, `app_id`, `knowledgebase_name`, `file_id`, `chunk_id`, `gcs_uri`

### GCS (Google Cloud Storage)
- **Stores**: 
  - Original files (Source of truth)
  - Extracted text files (Performance cache for vectorization)
- **Purpose**: Document provenance and full-text access
- **Path pattern**: `cache/community/Community/{cid}/Apps/{aid}/KnowledgeBases/{kb}/files/{file_id}`

### Firestore (Document Database)
- **Stores**: 
  - `IPDocMetadata`: Tracking sync state, extraction dates, and chunk counts
  - `Community`, `App`, `KnowledgeBase`: Entity configurations
- **Purpose**: Structured metadata and relationship management

## Retrieval Process (Ask Agent)

### Entry Point
**API Command:** `ask_question_to_app`  
**File:** `apiFront.js` → `ragCommands.js`

### Complete Call Stack

```
ask_question_to_app(params)                                  [ragCommands.js]
│
├── [1] CONTEXT PREPARATION
│   └── prepare_chat_context(params)                 [communityManagement.js]
│       ├── Load Community, App, and KnowledgeBase from Firestore
│       └── Check access controls (is_private, ownership)
│
├── [2] AI CALL WITH RAG
│   └── ask_with_interactions(kb, prompt, ...)               [geminiAPI.js]
│       │
│       ├── [2a] RETRIEVAL (common_setup_rag)                [geminiAPI.js]
│       │   └── pineconeService.searchChunksByText()
│       │       ├── Uses metadata filtering for multi-tenancy
│       │       └── Returns top N chunks with text (integrated embeddings)
│       │
│       └── [2b] GENERATION (Gemini Interactions API)    [geminiInteractions.js]
│           └── model.generateContent() with retrieved chunks as context
│
└── [3] RESPONSE HANDLING
    └── Return text response + source citations (filenames, scores)
```

## Pinecone Integrated Embeddings

**Status: ✅ IMPLEMENTED**

The production retrieval architecture uses:

- **Pinecone Integrated Embeddings** – Pinecone handles embedding generation automatically during upsert and search operations
- **Direct Pinecone SDK Integration** – Using `@pinecone-database/pinecone` JavaScript SDK v6+ with `upsertRecords()` and `searchRecords()` methods
- **Gemini Interactions API** – For response generation with conversation state management via `previous_interaction_id`

### Key Benefits

- ✅ **No Firestore full scans** – All vector queries go through Pinecone directly
- ✅ **Chunk text in Pinecone** – With integrated embeddings, chunk text is stored directly in Pinecone and returned in search results (no Firestore hydration needed)
- ✅ **Full documents in GCS** – Complete document text stored in GCS for grounding reference links
- ✅ **Strict KB segregation** – Metadata filtering on `community_id`, `app_id`, `knowledgebase_name` ensures tenant isolation

## Gemini Interactions API

### Session Management

**Client-side storage:**
- **CLI**: Stores `interaction_id` in `~/.descix/sessions/{community}_{app}.json`
- **PWA**: Stores `interaction_id` in React state and `localStorage`
- **MCP**: Stateless (no session history)

**Server-side:**
- `geminiInteractions.js`: Manages Gemini Interactions API calls
- Generates `interaction_id` based on session hash
- Conversation history managed by Gemini server-side

### Benefits

- **Conversation memory maintained server-side** – Reduces token resends
- **System instructions cached** – No need to resend on every query
- **80-90% token reduction** for follow-up queries
- **Sub-second response times** for cached conversations

## Performance Characteristics

| Component | Implementation | Performance |
|-----------|----------------|------------|
| **Vector Search** | Pinecone ANN search with metadata filtering | O(log n) search, ~100-500ms latency |
| **Embedding** | Automatic during upsert/search (Pinecone Integrated) | No separate embedding API calls |
| **Conversation State** | Gemini Interactions API with `previous_interaction_id` | Server-side memory, reduced token resends |
| **Single KB Search** | Metadata filtering on `community_id`, `app_id`, `knowledgebase_name` | Strict tenant isolation |

### Typical Latency

- **Small KB (100 vectors)**: ~0.5-1 second
- **Medium KB (1000 vectors)**: ~0.5-1.5 seconds
- **Large KB (10000 vectors)**: ~0.5-2 seconds

## Related Documentation

- [Services Architecture](services.md) – Service layer design
- [API Reference](api-reference.md) – Complete command inventory
- [Platform Architecture](../../architecture/index.md) – Overall platform architecture
