# SDK Architecture Reference

**Status:** Implemented  
**Version:** 2.0  
**Last Updated:** January 2026

This document is the canonical reference for the DeSciX SDK architecture, covering the CLI-centric KB processing pipeline, Drive synchronization, and folder structure conventions.

---

## 1. Architecture Overview

### Core Philosophy

1. **Git as Truth:** The git repository — whatever files a corpus manifest names — is the
   canonical source for what gets published to a knowledge base. There is no required KB folder.
2. **Manifest-Driven Publish:** `descix kb corpus sync` walks the sources a manifest names at a
   git ref, chunks what changed, and upserts/purges against Pinecone in one pass. This is the
   ONE sync surface; there is no separate chunk step or push step for the developer to run.
3. **Drive as an optional authoring front-end:** Google Drive is one way to *author* raw content
   (PDFs, documents, images) before it lands in git — via `descix drive pull`/`descix drive push`
   (ADC-based, client-side, no server-side proxy for the file transfer). It is not required, and
   it is not itself a sync step — content still has to be committed and named in a manifest.
4. **No Local Tools:** Drive-based conversion (OCR, Doc-to-Markdown) uses Drive's own capabilities
   instead of bundling heavy local dependencies.

### Data Flow Summary

```
Any git-tracked source, optionally authored via Drive:
Drive (raw assets, optional) → CLI (pull + convert) → committed to git
                                                              │
                                            named in .descix/manifests/<KB>.json
                                                              │
                                                              ▼
                                          descix kb corpus sync → Backend API → Pinecone
```

---

## 2. Core Components (SDK internals — not a developer-facing API)

These modules are internal to the CLI. A developer never calls them directly; they run underneath
the CLI verbs below.

### 2.1 Hydrator

Drive-side operations, invoked by `descix drive pull` / `descix drive push`:
- Pulls content from Drive to the local filesystem, converting Drive's native formats to Markdown
  (PDF/DOCX/Image → temp Google Doc → Markdown export; Google Docs → direct Markdown export;
  Sheets → CSV; plain text → downloaded as-is)
- Pushes staging files to Drive
- Also copies the `site`/`microservice` scaffold into an app (`descix site init` /
  `descix microservice init`)

### 2.2 Chunker and Syncer

Invoked by `descix kb corpus sync`, never called separately: chunk documents (Markdown-aware
section splitting, with a code-aware and a generic sliding-window strategy for non-Markdown files),
then upsert/delete against Pinecone via the backend API — computing the delta between what the
manifest's git walk found and what is already indexed. **The CLI never communicates with Pinecone
directly.** All chunk operations go through the backend API, which validates metadata and manages
Pinecone credentials.

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
│   └── manifests/
│       └── General.json        # Corpus manifest — names the KB's git-tracked sources
├── kb/                          # OPTIONAL — content can live anywhere; kb/ is a common convention
│   ├── staging/                # (if using Drive) Local files to push to Drive
│   │   └── research.pdf
│   └── General/                # (if using Drive) Text-converted mirror of Drive
│       ├── research.md         # Converted from PDF
│       └── notes.md            # Converted from Google Doc
├── site/                       # Static site files (push-only)
│   ├── index.html
│   └── DeSciXAppSDK.js         # The DeSciX bridge (generated)
└── microservice/               # Service code (push-only)
    ├── app.js                  # Entry point
    └── services/               # Service code — there is no src/
```

Chunking happens in memory during `descix kb corpus sync` — there is no persisted `kb/chunks/`
folder of JSON chunk files to manage.

### Folder Purposes

| Folder | Sync Direction | Purpose |
|--------|----------------|---------|
| `assets/` | Bidirectional | App metadata (icon, description, instructions) |
| `.descix/manifests/<KB>.json` | Local, git-tracked | Names the sources `descix kb corpus sync` walks — REQUIRED for a KB to sync |
| `kb/staging/` | Local → Drive (optional) | Raw files waiting to be pushed via `descix drive push` |
| `kb/General/` | Drive → Local (optional) | Text-converted files from `descix drive pull` |
| `site/` | Local → GCS | Static site deployment |
| `microservice/` | Local → GCS | Backend service deployment |

### Configuration Files

**`.descix/workspace.json`** - The **sole** configuration file for CLI operations:

```json
{
  "version": "3.0",
  "type": "workspace",
  "workspaceRoot": "/path/to/daita-agent-repo",
  "env": {
    "environment": "PROD",
    "apiUrl": "https://descix.net",
    "gateway": { "port": 5599 },
    "app": {
      "appId": "daita-agent",
      "communityId": "daita",
      "kbId": "General",
      "site": { "port": 3000 },
      "microservice": { "port": 4001 }
    }
  },
  "driveConfig": { "base_folder_id": "1ABC..." }
}
```

Every key is written by a CLI verb (`descix config init --env …`, `descix app init`, `descix app set-site`, `descix app set-port`, …) — see `workspace-config.md` for the key → verb table. One repo holds one app (`env.app`), and the repo root is the workspace root. A `communities` block without `env` (the v1 shape) and an `env.platform` / `env.products` block (the v2.1 multi-app shape) are refused on load.

**Note:** `.descix.app/context.json` files are no longer used. All app configuration is stored in `workspace.json`. The CLI auto-detects the app (`env.app`) when the current working directory is the repo root or below it.

---

## 4. CLI Commands

The DeSciX CLI publishes content with one verb per plane. Each command resolves app context from `workspace.json` based on the current working directory, or takes `-a <app_id>` explicitly.

### 4.1 Publish Commands

| Command | Description |
|---------|-------------|
| `descix app sync-assets` | Sync app assets (`system_instructions.md`, `app_description.md`, `icon.png`) to the platform |
| `descix kb corpus sync` | Sync a knowledge base from the git files its manifest names to Pinecone |
| `descix site upload` | Deploy the site to GCS and record its path on the app |

### 4.2 KB Commands (`descix kb`, `descix drive`)

| Command | Description |
|---------|-------------|
| `descix kb create -a <app_id> --kb <kb_name>` | Create a knowledge base on an existing app (refuses one that already exists) |
| `descix kb corpus sync` | Sync the manifest's git files to Pinecone |
| `descix kb corpus status` | Show corpus sync state (files, chunks, last sync, resolved ref) |
| `descix kb list` | List knowledge bases for an app |
| `descix kb delete` | Delete a knowledge base (refuses a non-empty KB unless `--force`) |
| `descix drive pull` | Pull content from Drive and convert to local markdown |
| `descix drive push` | Push staging files to Drive |

### Scaffold Commands

| Command | Description |
|---------|-------------|
| `descix site init` | Copy site template to current app's `site/` folder |
| `descix site upload` | Deploy site to GCS |
| `descix app set-site -a <app_id> --port <port>` | Register the local dev-server port for the app's site (`env.app.site.port`) |
| `descix microservice init` | Copy microservice template to current app's `microservice/` folder |
| `descix microservice register -r SERVICE_README.md` | Register microservice AND vectorize the README for `tell_me_how` discovery, in one step |

**Note:** Site and microservice commands are Git-based code operations. Drive templates contain content (assets, KB), while site/microservice commands handle code (HTML, JS, Dockerfile, etc.).

### Common Options

| Option | Description |
|--------|-------------|
| `-c, --community <id>` | Community ID (inferred if single) |
| `-a, --app <id>` | App ID (inferred if single) |
| `-k, --kb <id>` | KB name (default: General) |
| `-v, --verbose` | Show detailed output |

### Setup Command

```bash
descix quickstart
```

Flow:
1. Device login in the browser (skipped when `.descix/wallet.json` holds a valid session)
2. Create `.descix/workspace.json` (skipped when a workspace already exists up the tree)
3. Write agent instruction files (`CLAUDE.md`, `.github/copilot-instructions.md`, `.cursorrules`, `.clinerules`)
4. Write `.vscode/mcp.json` (skipped when the DeSciX extension handles MCP)
5. Copy the SDK agent assets to `.descix/sdk-assets/` (fails loud if the package's assets are missing)

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
      "id": "daita_agent_General_research_0",
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

---

## 6. Data Flows

### Publish Cycle

```mermaid
flowchart LR
    subgraph drive [Google Drive — optional authoring]
        driveKb[Drive folder]
    end

    subgraph local [Local Git repo]
        staging[kb/staging/ — optional]
        docs[docs (or any git-tracked path)]
        manifest[".descix/manifests/&lt;KB&gt;.json"]
    end

    subgraph backend [Backend]
        api[kb_sync_chunks]
        pinecone[Pinecone]
    end

    staging -->|"descix drive push"| driveKb
    driveKb -->|"descix drive pull (convert)"| docs
    docs -->|"named as a source in"| manifest
    manifest -->|"descix kb corpus sync (walk + chunk in memory + upsert)"| api
    api --> pinecone
```

### Detailed Flow

1. **(Optional) Stage:** User adds `paper.pdf` to `kb/staging/`
2. **(Optional) Push:** `descix drive push` uploads to a Drive folder
3. **(Optional) Pull:** `descix drive pull` downloads and converts:
   - Sees `paper.pdf` in Drive
   - Copies with `convert=true` → temp Google Doc
   - Exports as Markdown → local `paper.md`
   - Deletes temp doc
4. **Commit + name:** commit `paper.md` and name its folder as a source in
   `.descix/manifests/<KB>.json` (skip steps 1-3 entirely if the content already lives in git —
   Drive is optional)
5. **Sync:** `descix kb corpus sync` does the rest in one pass:
   - Walks the manifest's sources at a git ref, chunking each file in memory (nothing is written
     to disk)
   - Pushes changed chunks to the backend, which validates metadata and forwards to Pinecone
   - Purges any chunk that is live in Pinecone but no longer in the manifest's walk

---

## 7. Authentication

### ADC (Application Default Credentials)

The CLI uses Google Cloud ADC for Drive access:

```bash
gcloud auth application-default login \
  --scopes=https://www.googleapis.com/auth/drive.file,https://www.googleapis.com/auth/drive
```

**Verification:**
- `Hydrator` calls `verifyDriveAuth()` before operations

### Backend Authentication

CLI authenticates to backend via device login:
1. `descix login` opens browser
2. User authenticates via Powch
3. CLI receives session token
4. Token stored in `.descix/wallet.json`

---

## 8. Git Mode vs Drive Mode

Apps operate in one of two modes, determined by how they are managed:

| Mode | Source of Truth | Versioning | User Type | Tool |
|------|-----------------|------------|-----------|------|
| **git** | Local Git repo | Git | Developers | CLI (`descix kb corpus sync`, `descix drive pull/push`) |
| **drive** | Google Drive | GCS/Firestore | Non-developers | PWA only |

**Important:** The CLI only supports **git-mode** operations. Drive-mode apps are managed entirely through the PWA with server-side processing. There is no CLI flag to switch modes - if you're using the CLI, you're in git-mode.

Git mode does not require Drive at all: content can be authored directly in the repo. Drive is one
optional way to bring raw content (PDFs, images) in as converted Markdown, via `descix drive pull`.
- **Git mode**: developer commits content (optionally pulled from Drive first), names it in a
  corpus manifest, and `descix kb corpus sync` publishes it
- **Drive mode**: PWA triggers a server-side pipeline (Drive → GCS → Pinecone) automatically; the
  CLI never triggers it
