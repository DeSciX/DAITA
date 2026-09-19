# SDK Architecture Reference

**Status:** Implemented  
**Version:** 2.1  
**Last Updated:** June 2026

This document is the canonical reference for the DeSciX SDK architecture, covering the CLI-centric KB processing pipeline, Drive synchronization, and folder structure conventions.

---

## 1. Architecture Overview

### Core Philosophy

1. **Git as Truth:** The local Git repository is the canonical source for processed text and code. KB content is versioned and synced via corpus manifests tracked in Git.
2. **Drive as Raw Asset Store (server-side only):** Google Drive holds raw assets (PDFs, documents, images). Drive-to-Pinecone processing is a **server-side, PWA-only pipeline** — the CLI never triggers it.
3. **Corpus Manifest as Sync Contract:** `descix kb corpus sync` reads `.descix/manifests/` corpus manifest files, walks Git blob SHAs to detect changes, and syncs only changed chunks to Pinecone.

### Data Flow Summary

**Git Mode (CLI — canonical):**
```
Local Git (markdown + corpus manifest) → kb corpus sync → Backend API → Pinecone
```

**Drive Mode (server-side / PWA-only — never CLI-triggered):**
```
Google Drive → server-side pipeline → GCS → Pinecone
```

---

## 2. Core Components

All core SDK logic resides in `DeSciX_Core/descix-cli/lib/core/`.

### 2.1 Hydrator (`Hydrator.js`)

**Responsibilities:**
- Pull content from Drive to local filesystem (via `descix drive pull`)
- Push staging files to Drive (via `descix drive push`)
- Convert files using Drive's native capabilities (PDF/Image → Google Doc → Markdown)
- Conflict detection and resolution during hydration

**Key Functions:**

| Function | Description |
|----------|-------------|
| `hydrateWorkspace(root, config, driveConfig, options)` | Full workspace setup with folder creation and Drive sync |
| `hydrateApp(config, options)` | Pull entire app from Drive |
| `hydrateKb(config, options)` | Pull and convert KB files from Drive |
| `pushStaging(config, options)` | Upload files from `kb/staging/` to Drive |
| `convertAndSave(driveFile, localDir)` | Convert and save a single file |

**Drive-Native Conversion Logic:**
1. PDF/DOCX/Images: Copy with `convert=true` → Creates temp Google Doc → Export as Markdown → Delete temp doc
2. Google Docs: Export directly as `text/markdown`
3. Google Sheets: Export as `text/csv`
4. Plain text files: Download as-is

### 2.2 Chunker (`Chunker.js`)

**Responsibilities:**
- Chunk documents for RAG embedding
- Support multiple chunking strategies (semantic, sliding window)
- Generate chunk records with metadata for Pinecone

**Key Functions:**

| Function | Description |
|----------|-------------|
| `categorizeFile(fileName, mimeType)` | Detect file type (code/docs/papers/generic) |
| `chunkFile(fileInfo, options)` | Chunk a file based on its type |
| `chunkDocument(content, metadata, rules)` | Markdown-aware section-based chunking |
| `processKb(config, options)` | Process entire KB directory into chunks |
| `loadChunks(config)` | Load all chunks from JSON files |

**Chunking Parameters (defaults):**
- `maxChunkSize`: 2000 characters
- `maxCodeFileSize`: 8000 characters
- `overlapSize`: 500 characters

**Chunking Strategies:**
- **Documents:** Split by Markdown headers (`#`, `##`, `###`) with overlap
- **Code:** Split by logical boundaries (functions, classes, contracts)
- **Generic:** Sliding window with overlap

### 2.3 Syncer (`Syncer.js`)

**Responsibilities:**
- Sync local chunks to Pinecone via backend API
- Compute delta between local and remote chunks
- Manage chunk lifecycle (upsert/delete)

**Key Functions:**

| Function | Description |
|----------|-------------|
| `syncKb(apiClient, config, options)` | Full sync workflow (delta + upsert + delete) |
| `computeChunkDelta(localChunks, remoteIds)` | Compare local vs remote chunks |
| `getRemoteChunkIds(apiClient, communityId, appId, kbId)` | Get existing chunk IDs from Pinecone |
| `upsertChunks(apiClient, ...)` | Push chunks to backend |
| `deleteStaleChunks(apiClient, ...)` | Remove deleted chunks |
| `getSyncStatus(apiClient, config)` | Check sync state |

**Security Note:** The CLI never communicates with Pinecone directly. All chunk operations go through the backend API, which validates metadata and manages Pinecone credentials.

---

## 3. Folder Structure

### Local App Structure

```
[app]/
├── assets/                     # App metadata (bidirectional sync)
│   ├── icon.png
│   ├── app_description.md
│   └── system_instructions.md
├── .descix/
│   ├── manifests/              # Corpus manifests — one per KB, e.g. General.json
│   │   └── General.json
│   └── sync-state/             # Per-KB sync state written by `kb corpus sync`
├── docs/                       # Your own markdown, wherever you keep it
│   ├── research.md
│   └── notes.md
├── site/                       # Static site files (push-only)
│   └── index.html
└── microservice/               # Service code (push-only)
    └── src/index.js
```

### Folder Purposes

| Folder | Sync Direction | Purpose |
|--------|----------------|---------|
| `assets/` | Bidirectional | App metadata (icon, description, instructions) |
| `.descix/manifests/` | Local only | Corpus manifests — the declaration of which files belong to which KB |
| `.descix/sync-state/` | Local only | What the last `kb corpus sync` walked, per KB |
| `site/` | Local → GCS | Static site deployment |
| `microservice/` | Local → GCS | Backend service deployment |

**KB content has no required directory.** Source files stay where they live in your repo; a corpus manifest at `.descix/manifests/<KB>.json` names them by path. There is no `kb/<KB>/` convention to copy files into — `descix kb corpus sync` reads the manifest, and with no manifest it fails naming the directory it looked in.

### Configuration Files

**`.descix/workspace.json`** - The **sole** configuration file for CLI operations:

```json
{
  "version": "2.1",
  "workspaceRoot": "<absolute path to your workspace>",
  "type": "workspace",
  "env": {
    "environment": "DEV",
    "apiUrl": "https://dev.descix.net",
    "products": [
      {
        "appId": "<your app id>",
        "localPath": "<path to the app, relative to workspaceRoot>",
        "kbId": "General",
        "site": {
          "port": 3000,
          "devCommand": "npm run docs:dev"
        },
        "microservice": {
          "port": 4001,
          "devCommand": "npm run start"
        }
      }
    ]
  }
}
```

A file carrying a top-level `communities` block and no `env` block is the v1 format; the CLI refuses it by name rather than reading it. So is a top-level `apiUrl` — the origin is read from `env.apiUrl` only, and is set with `descix config init --env dev|demo|prod` or `descix config set-env <env>`.

**Note:** `.descix.app/context.json` files are no longer used. All app configuration is stored in `workspace.json`. The CLI auto-detects app context from the current working directory by matching against registered app paths.

---

## 4. CLI Commands

### 4.1 KB Corpus Sync (`descix kb corpus`) — Canonical Sync Path

`descix kb corpus sync` is the **one canonical KB sync path**. It reads corpus manifests from `.descix/manifests/`, walks Git blob SHAs to detect changed files, chunks only changed content, and upserts/deletes vectors in Pinecone via the backend API.

| Command | Description |
|---------|-------------|
| `descix kb corpus sync -a <app_id>` | Sync KB to Pinecone via corpus manifest (delta, git-aware) |
| `descix kb corpus sync --rebuild` | Reconcile against REMOTE file_ids when the local sync-state is untrustworthy — plain `sync` already purges deleted files (prompts; `--yes` to skip) |
| `descix kb corpus sync --dry-run` | Report what would change without writing |
| `descix kb corpus status -a <app_id>` | Show last sync commit, file counts, chunk counts, and git diff since last sync |
| `descix kb doctor -a <app_id> -k <kb>` | Drift detection: live Pinecone vector count vs local sync state; exits 1 if drift exceeds threshold |

### 4.2 Other KB Commands (`descix kb`)

| Command | Description |
|---------|-------------|
| `descix kb list -a <app_id>` | List KBs for an app (names, model overrides, vector counts, last-sync dates) |

There is no step-by-step local pipeline to drive by hand: `kb corpus sync` chunks in memory and upserts in one pass. `kb chunk`, `kb sync`, `kb build`, `kb status`, `kb compare` and the top-level `descix sync` are removed — invoking any of them errors and names `kb corpus sync` as the replacement.

### Scaffold Commands

| Command | Description |
|---------|-------------|
| `descix site init` | Copy site template to current app's `site/` folder |
| `descix site upload` | Deploy site to GCS |
| `descix app set-site -a <app_id> --port <port>` | Register the local dev-server port for the app's site (`env.products[].site.port`) |
| `descix microservice init` | Copy microservice template to current app's `microservice/` folder |
| `descix microservice register` | Register microservice with gateway |

**Note:** Site and microservice commands are Git-based code operations on code (HTML, JS, Dockerfile, etc.); app content and KB sources are handled by `assets/` and the corpus manifest.

### Common Options

| Option | Description |
|--------|-------------|
| `-c, --community <id>` | Community ID (inferred if single) |
| `-a, --app <id>` | App ID (inferred if single) |
| `-k, --kb <id>` | KB name (default: General) |
| `-v, --verbose` | Show detailed output |

### Setup Commands

```bash
descix quickstart -c <community_id> -a <app name>
```

`quickstart` is the one-command path: sign in → workspace → app → agent instruction files → MCP config. The same steps run individually:

| Command | Description |
|---------|-------------|
| `descix login` | Device login in the browser, via Powch |
| `descix init` | Initialize the workspace (`.descix/workspace.json`) for app development |
| `descix app init -c <community_id> -a <app name>` | Create the app record + its default KB, register it in the workspace, and scaffold its folders |
| `descix doctor` | Diagnose environment issues (Node, auth, gcloud, ADC) |
| `descix status` | Show the state of the developer environment |

---

## 5. Backend API

### KB Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `kb_sync_chunks` | POST | Upsert chunks to Pinecone |
| `kb_get_chunk_ids` | GET | Get existing chunk IDs for delta |
| `kb_delete_chunks` | DELETE | Remove stale chunks |

### `kb_sync_chunks` Request

```json
{
  "community_id": "daita",
  "app_id": "agent",
  "kb_id": "General",
  "chunks": [
    {
      "id": "descix_agent_General_research_0",
      "text": "...",
      "entity_type": "CHUNK",
      "community_id": "daita",
      "app_id": "agent",
      "knowledgebase_name": "General",
      "file_id": "research.md",
      "chunk_id": "0"
    }
  ]
}
```

### Pinecone Integration

The platform uses **Pinecone Integrated Embeddings**:
- Vectorization happens inside Pinecone, not in the backend
- The CLI/backend sends text + metadata only
- Pinecone's `llama-text-embed-v2` model handles embedding
- No local embedding libraries required

**Backend Flow:**
```
CLI → kb_sync_chunks API → pineconeService.upsertChunkRecords() → Pinecone (embeds + stores)
```

### RAG Query

The canonical backend command for querying a KB is `ask_question_to_app`. The CLI surface is `descix chat`.

---

## 6. Data Flows

### Git-Mode KB Sync (Canonical)

```mermaid
flowchart LR
    subgraph local [Local Filesystem]
        sources[your markdown, anywhere in the repo]
        manifests[.descix/manifests/]
        syncstate[.descix/sync-state/]
    end

    subgraph backend [Backend]
        api[kb_sync_chunks]
        pinecone[Pinecone]
    end

    manifests -->|"kb corpus sync (git blob SHA walk)"| sources
    sources -->|"chunk changed files"| api
    syncstate -->|"delta: only changed since last sync"| api
    api --> pinecone
```

### Typical Developer Workflow

1. **Declare:** List the source files in `.descix/manifests/<KB>.json` (schema: [corpus-manifest-schema.md](../architecture/corpus-manifest-schema.md))
2. **Edit:** Add or update those markdown files where they already live
3. **Sync:** `descix kb corpus sync -a <app_id>` — detects changed files via git blob SHAs, chunks them, upserts to Pinecone; deletes vectors for removed files
4. **Verify:** `descix kb corpus status -a <app_id>` or `descix kb doctor -a <app_id> -k General`, then ask a question with `descix chat -a <app_id> --new`

The sync walks git blobs at the manifest's `ref` (default `main`), not your working tree. An edit on an unmerged branch re-syncs as unchanged unless you pass `--ref <branch>`. Use `--dry-run` to see what a sync would add and remove before it writes.

---

## 7. Authentication

### ADC (Application Default Credentials)

The CLI uses Google Cloud ADC for Drive access:

```bash
gcloud auth application-default login \
  --scopes=https://www.googleapis.com/auth/drive.file,https://www.googleapis.com/auth/drive
```

**Verification:**
- `descix doctor` reports gcloud and ADC status
- `Hydrator` calls `verifyDriveAuth()` before operations

### Backend Authentication

CLI authenticates to backend via device login:
1. `descix login` opens browser
2. User authenticates via Powch
3. CLI receives session token
4. Token stored in `.descix/wallet.json`

---

## 8. Migration Notes

### From `kb/src/` to `kb/staging/`

The v2 architecture renamed `kb/src/` to `kb/staging/` for clarity. The Hydrator includes automatic migration:

```javascript
// If old kb/src/ exists, rename to kb/staging/
const oldSrcDir = path.join(kbBaseDir, 'src');
if (await exists(oldSrcDir)) {
  await rename(oldSrcDir, stagingDir);
}
```

### Git Mode vs Drive Mode

Apps operate in one of two modes, determined by how they are managed:

| Mode | Source of Truth | Versioning | User Type | Tool |
|------|-----------------|------------|-----------|------|
| **Git** | Local Git repo | Git | Developers | CLI (`descix kb corpus sync`) |
| **Drive** | Google Drive | GCS/Firestore | Non-developers | PWA only (server-side pipeline) |

**Important:** The CLI only supports **Git-mode** operations. Drive-mode apps are managed entirely through the PWA with server-side processing. There is no CLI flag to switch modes — if you're using the CLI, you're in Git mode.

Both modes can source content from Google Drive. The difference is:
- **Git mode:** the developer keeps markdown in the repo, declares it in a corpus manifest, and syncs via `descix kb corpus sync`
- **Drive mode:** PWA triggers a server-side pipeline (Drive → GCS → Pinecone) automatically — the CLI is never involved

---

## 9. File References

| Component | Path | Description |
|-----------|------|-------------|
| WorkspaceConfig | `DeSciX_Core/descix-cli/lib/workspace-config.js` | Sole configuration class |
| GlobalConfig | `DeSciX_Core/descix-cli/lib/global-config.js` | User-level settings (~/.descix) |
| Hydrator | `DeSciX_Core/descix-cli/lib/core/Hydrator.js` | Drive sync operations |
| Chunker | `DeSciX_Core/descix-cli/lib/core/Chunker.js` | KB chunking |
| Syncer | `DeSciX_Core/descix-cli/lib/core/Syncer.js` | Pinecone sync |
| ManifestLoader | `DeSciX_Core/descix-cli/lib/core/ManifestLoader.js` | Corpus manifest loading and validation |
| Corpus Commands | `DeSciX_Core/descix-cli/lib/commands/corpus.js` | Canonical KB corpus sync |
| Workspace Init | `DeSciX_Core/descix-cli/lib/commands/init.js` | Workspace initialization |
| App Init | `DeSciX_Core/descix-cli/lib/commands/appInit.js` | App record, default KB, scaffold |
| Drive ADC | `DeSciX_Core/descix-cli/lib/google-storage-adc.js` | Google Drive API wrapper |
| Backend KB API | `DeSciX_Cloud/microservice/services/commandHandlers/appCommands.js` | Server-side processing |
| Pinecone Service | `DeSciX_Cloud/microservice/services/pineconeService.js` | Vector database |
| Server Chunking | `DeSciX_Cloud/microservice/services/chunkingUtils.js` | Drive-mode chunking |
