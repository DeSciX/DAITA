# Google Drive Folder Setup Guide

To create apps and upload knowledge to DeSciX, you need to register a Google Drive folder. This folder will be used to store your app documents and knowledge bases. You maintain full ownership of the folder and can revoke DeSciX access at any time.

## Step-by-Step Instructions

### Step 1: Create a Folder in Your Google Drive

1. Go to [Google Drive](https://drive.google.com)
2. Click **"New"** → **"Folder"**
3. Name your folder (e.g., "MyDeSciXProjects" or "DeSciX Knowledge")
4. Click **"Create"**

### Step 2: Share Folder with DeSciX

1. Right-click on the folder you just created
2. Select **"Share"**
3. In the "Add people and groups" field, enter: **`dip@descix.net`**
4. Set the permission to **"Editor"** (not Viewer)
5. **Uncheck** "Notify people" (optional – DeSciX doesn't need email notifications)
6. Click **"Share"**

**Important**: DeSciX needs **Editor** access (not Viewer) so it can create subfolders and upload files on your behalf.

### Step 3: Get the Folder Link

1. Right-click on the folder
2. Select **"Get link"** or **"Share"**
3. Click **"Copy link"**
4. The link will look like: `https://drive.google.com/drive/folders/1ABC123xyz...`

Alternatively, you can copy just the folder ID from the URL:
- The folder ID is the long string after `/folders/` in the URL
- Example: If the URL is `https://drive.google.com/drive/folders/1ABC123xyz`, the folder ID is `1ABC123xyz`

### Step 4: Register Folder

Register your folder in the DeSciX PWA:

1. Log in to the DeSciX PWA (via Powch)
2. Navigate to **Developer Settings** or **Upload Knowledge** section
3. Paste the folder link (or folder ID) into the "Drive Folder URL or ID" field
4. Click **"Register Folder"**
5. Wait for confirmation that the folder has been registered

After registration, your folder ID is stored in your user profile and will be used automatically when creating apps.

## Folder Structure

DeSciX uses a **user-owned folder model** where you maintain full ownership of your base folder. When you create an app, DeSciX automatically creates the necessary subfolder structure within your registered base folder.

### Automatic Folder Structure

When you create an app using `create_skeleton_app` (via CLI or API), DeSciX automatically creates this structure:

```
UserBaseFolder/                          # Your registered base folder (shared with dip@descix.net)
  └── {community_id}_{app_name}/        # App folder (auto-created by DeSciX)
      └── General/                       # Knowledge base folder (auto-created by DeSciX)
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

### Folder Naming Convention

- **App folder name**: `{community_id}_{app_name}` (e.g., `descix_agent`, `egpt_periodic`)
- **Knowledge base folder name**: `General` (default) or custom name you specify
- **File organization**: You can organize files however you want within the KB folder

## Benefits of User-Owned Folders

- **Full Control**: You own the folder and all its contents
- **Easy Management**: Use Google Drive's familiar interface to organize files
- **No Lock-in**: You can revoke DeSciX access anytime
- **Existing Content**: You can share folders that already contain documents
- **Privacy**: You control what DeSciX can access

## Revoking Access

If you want to revoke DeSciX access to your folder:

1. Go to Google Drive
2. Right-click on the folder
3. Select **"Share"**
4. Find `dip@descix.net` in the list
5. Click the dropdown next to it
6. Select **"Remove"**

**Note**: Revoking access will prevent DeSciX from:
- Creating new apps or knowledge bases
- Syncing files to GCS and Pinecone
- Accessing files for vectorization

However, existing data in Firestore, GCS, and Pinecone will remain (you can delete these separately if needed).

## Troubleshooting

### "DeSciX does not have access to this folder"

**Solution**: Make sure you:
1. Shared the folder with `dip@descix.net` (not a typo)
2. Set the permission to **"Editor"** (not Viewer)
3. The folder is not in "Restricted" sharing mode

### "Provided URL/ID is not a folder"

**Solution**: Make sure you copied the folder link, not a file link. Folder links contain `/folders/` in the URL.

### "User not found" or Authentication Error

**Solution**: Make sure you are logged in to the DeSciX PWA with an authenticated account (TOS accepted via Powch).

## Related Documentation

- [Creating Apps](community-apps.md) – App creation workflow
- [Platform Architecture](../../architecture/index.md) – Overall platform architecture
