# Creating Community Apps

This guide explains how to create apps in DeSciX communities.

## Prerequisites

- **Authenticated Account**: You need a DeSciX account (Powch auth, TOS accepted)
- **Drive Folder Registered**: You must register a Google Drive folder (see [Drive Setup](drive-setup.md))
- **Community Access**: You need permission to create apps in the community

## App Creation Workflow

### Step 1: Register Drive Folder

First, register your Google Drive folder (see [Drive Setup](drive-setup.md) for details):

```bash
# Via CLI
descix app register-folder -u https://drive.google.com/drive/folders/YOUR_FOLDER_ID

# Or via PWA: Developer Settings / App Manager → Register Folder
```

### Step 2: Create App

You can create apps via PWA or CLI:

**Via PWA**: Use Device Setup / App Manager to create apps (recommended).

**Via CLI**:
```bash
descix app init -a myapp -c descix
```

### Step 3: Upload Knowledge

Upload files to your knowledge base:

```bash
# Via CLI
descix app upload -c descix -a myapp -p ./local-folder-path -k General

# Or via PWA: Upload files directly to Drive folder
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
- **RAG Enabled**: Use `descix kb build` to vectorize for AI chat

## API Flow

The typical workflow:

1. **Register Base Folder** (`register_base_folder`)
   - User shares Drive folder with `dip@descix.net`
   - Folder ID stored in user's Firestore document

2. **Create Skeleton App** (`create_skeleton_app`)
   - Creates app and KB subfolders in your base folder
   - Creates Firestore documents (Community/App/KnowledgeBase)
   - Does NOT upload files yet

3. **Upload Files** (`upload_files_to_kb` or local → `descix kb build`)
   - Uploads files from local path or Drive
   - Processes files: Drive → GCS (full text) → Pinecone (vectors + chunks)
   - Files remain in your Drive folder

## Related Documentation

- [Drive Setup](drive-setup.md) – Google Drive folder configuration
- [Roles](roles.md) – Role-based access control
- [RAG Pipeline](../../services/cloud/rag-pipeline.md) – Knowledge base vectorization
