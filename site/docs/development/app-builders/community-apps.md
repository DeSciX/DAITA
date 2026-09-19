# Creating Community Apps

This guide explains how to create apps in DeSciX communities.

## Prerequisites

- **Authenticated Account**: You need a DeSciX account (Powch auth, TOS accepted) — `descix login`
- **Community Access**: You need permission to create apps in the community
- **Drive Folder Registered** (Drive mode only): register a Google Drive folder in the PWA — see [Drive Setup](drive-setup.md)

## App Creation Workflow

### Step 1: Create App

You can create apps via PWA or CLI:

**Via PWA**: Use Device Setup / App Manager to create apps (recommended).

**Via CLI**:
```bash
descix app init -a myapp -c <community_id>
```

The community must already be materialized in the environment you are targeting. `app init`
creates the app record, its default `General` KB, and the local scaffold, and registers the app
in `.descix/workspace.json`.

### Step 2: Add Knowledge

**Git mode (CLI)** — declare the source files in a corpus manifest and sync:

```bash
# 1. Create <app dir>/.descix/manifests/General.json naming your git-tracked markdown
# 2. Preview, then sync
descix kb corpus sync -a myapp --dry-run
descix kb corpus sync -a myapp
```

**Drive mode (PWA)** — upload files to the registered Drive folder and let the server-side
pipeline ingest them.

### Step 3: Verify

```bash
descix kb corpus status -a myapp
descix chat -a myapp --new "a question your documents answer"
```

## Folder Structure

When you create an app, DeSciX automatically creates this structure:

```
UserBaseFolder/                          # Your registered base folder
  └── {community_id}_{app_name}/        # App folder (auto-created)
      └── General/                       # Knowledge base folder (auto-created)
          ├── README.md                  # Your uploaded files
          ├── docs/                      # Subfolders supported
          └── code/                       # Any structure you prefer
```

**Example:**
```
MyDeSciXProjects/                        # Your base folder
  └── descix_agent/                      # App folder (community_id: daita, app_name: agent)
      └── General/                       # Default knowledge base
          ├── README.md
          ├── DeSciX_Platform_Architecture.md
          └── docs/
              └── ...
```

## App Configuration

### App Metadata

- **App Name**: Friendly display name
- **App ID**: Auto-generated from name (lowercase, alphanumeric)
- **Description**: App description for store listing
- **Icon**: App icon URL (uploaded to GCS)
- **Price**: Purchase price (0 = free)

### Knowledge Base Setup

Each app has at least one knowledge base:
- **Default KB**: `General` (auto-created)
- **Custom KBs**: Create additional KBs for different content types
- **RAG Enabled**: declare the KB's source files in `<app dir>/.descix/manifests/<KB>.json`, then run `descix kb corpus sync -a <app_id>` to vectorize them for AI chat

## API Flow

The typical workflow:

1. **Register Base Folder** (`register_base_folder`)
   - User shares Drive folder with `dip@descix.net`
   - Folder ID stored in user's Firestore document

2. **Create Skeleton App** (`create_skeleton_app`)
   - Creates app and KB subfolders in your base folder
   - Creates Firestore documents (Community/App/KnowledgeBase)
   - Does NOT upload files yet

3. **Upload Files** (`upload_files_to_kb`, or from git via `descix kb corpus sync`)
   - Uploads files from Drive, or chunks the files a corpus manifest names
   - Processes files: Drive → GCS (full text) → Pinecone (vectors + chunks)
   - Files remain in your Drive folder

## Related Documentation

- [Drive Setup](drive-setup.md) – Google Drive folder configuration
- [Roles](roles.md) – Role-based access control
- [RAG Pipeline](../../services/cloud/rag-pipeline.md) – Knowledge base vectorization
