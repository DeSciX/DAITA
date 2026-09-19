# Services Architecture

This document describes the service layer architecture, including call stacks for key operations and data flow patterns.

## Create Community Flow

### Entry Point
**API Command:** `create_community_from_drive_folder`  
**File:** `apiFront.js` → `CommandHandler.invoke()`

### Authentication & Authorization

```
┌─────────────────────────────────────────────────────────────────┐
│                    AUTHENTICATION FLOW                          │
├─────────────────────────────────────────────────────────────────┤
│ 1. Request arrives at cloud_function_route()                   │
│ 2. Check Authorization header for bot token OR access_token    │
│ 3. For PWA: UserSession.is_authenticated(req)                  │
│ 4. Load User from Firestore via User.from_firestore(user_id)   │
│ 5. Determine LoginStatus: GUEST | AUTHENTICATED | CONNECTED    │
│    (feature access is an entitlement query, not a login state) │
└─────────────────────────────────────────────────────────────────┘
```

**Permission Check:**
```javascript
if (commandName === 'create_community_from_drive_folder') {
    authorized = await checkUserPermission(user, PERMISSIONS.PLATFORM_MANAGE_COMMUNITIES);
    permissionErrorMsg = 'Requires PLATFORM_MANAGE_COMMUNITIES permission.';
}
```

### Complete Call Stack

```
cloud_function_route (apiFront.js)
│
├── [Auth] UserSession.is_authenticated(req)  ──────────────► storageUtils.js
├── [Auth] User.from_firestore(user_id)       ──────────────► ipStorageUtils.js
│
└── CommandHandler.invoke('create_community_from_drive_folder', params)
    │
    ├── [Permission] checkUserPermission(user, PLATFORM_MANAGE_COMMUNITIES)
    │                                                        ──► permissionService.js
    │
    └── create_community_from_drive_folder(params)  ────────► apiFront.js (local)
        │
        └── CM.create_community_with_app(...)  ─────────────► communityManagement.js
            │
            ├── [1] googleStorage.get_folder_id('Apps', source_folder_id)
            │                                                ──► googleStorageService.js
            │
            ├── [2] googleStorage.find_fileid_by_name('icon.png', ...)
            │   └── googleStorage.uploadPublicAsset(...)
            │       │
            │       └── Storage.bucket().file().save()       ──► GCS
            │
            ├── [3] googleStorage.find_fileid_by_name('community_description')
            │   └── googleStorage.get_gfile_text_content(file_id)
            │
            ├── [4] new Community(...).to_firestore()        ──► ipStorageUtils.js
            │   └── CacheFirestore.put_doc()                 ──► Firestore
            │
            └── [5] create_app_for_community(...)            ──► (See App Flow)
```

## Create App Flow

### Entry Point
**API Command:** `create_app_from_drive_folder`  
**File:** `apiFront.js` → `CommandHandler.invoke()`

### Permission Check

```javascript
if (commandName === 'create_app_from_drive_folder') {
    const communityId = params.community_id;
    const hasCommunityPerm = await checkUserPermission(user, PERMISSIONS.COMMUNITY_MANAGE_APPS, { communityId });
    const hasPlatformPerm = await checkUserPermission(user, PERMISSIONS.PLATFORM_MANAGE_APPS);
    authorized = hasCommunityPerm || hasPlatformPerm;
}
```

### Complete Call Stack

```
CommandHandler.invoke('create_app_from_drive_folder', params)
│
├── [Permission] checkUserPermission(user, COMMUNITY_MANAGE_APPS | PLATFORM_MANAGE_APPS)
│
└── create_app_from_drive_folder(params)  ──────────────────► apiFront.js
    │
    ├── Community.from_firestore(community_id)  ────────────► ipStorageUtils.js
    │
    └── CM.create_app_for_community(communityObj, ...)  ────► communityManagement.js
        │
        ├── [1] googleStorage.get_folder_id(knowledgebase_name, app_folder_id)
        │                                                    ──► googleStorageService.js
        │
        ├── [2] googleStorage.find_fileid_by_name('icon.png')
        │   └── googleStorage.uploadPublicAsset()              ──► GCS
        │
        ├── [3] googleStorage.find_fileid_by_name('app_description')
        │   └── googleStorage.get_gfile_text_content()
        │
        ├── [4] googleStorage.find_fileid_by_name('system_instructions')
        │   └── googleStorage.get_gfile_text_content()
        │
        ├── [5] new App(...).to_firestore()                  ──► ipStorageUtils.js
        │   └── CacheFirestore.put_doc()                     ──► Firestore
        │
        ├── [6] vectorizeUploadedFile()                      ──► geminiAPI.js
        │   │
        │   ├── googleStorage.recursive_list_folder_tree()     ──► googleStorageService.js
        │   │
        │   └── FOR EACH FILE:
        │       │
        │       ├── googleStorage.uploadKnowledgeFileToGCS()    ──► GCS
        │       │
        │       └── vectorizeUploadedFile()                  ──► geminiAPI.js
        │           │
        │           ├── googleStorage.get_gfile_text_content()
        │           │
        │           └── chunkingUtils.chunkDriveFile()       ──► chunkingUtils.js
        │               │
        │               └── pineconeService.upsertChunkRecords() ──► Pinecone
        │
        └── [7] new KnowledgeBase(...).to_firestore()        ──► ipStorageUtils.js
            └── CacheFirestore.put_doc()                     ──► Firestore
```

## Key Service Files

| File | Purpose |
|------|---------|
| `apiFront.js` | Command router, auth, permissions, subscription checks |
| `communityManagement.js` | Community/App CRUD, folder operations, KB management |
| `ipStorageUtils.js` | Data models (User, Community, App, KB, Role) |
| `purchase.js` | Payment processing, role/product purchases |
| `geminiAPI.js` | LLM integration, vectorization orchestration, RAG setup |
| `googleStorageService.js` | Unified Drive and GCS operations |
| `pineconeService.js` | Pinecone vector operations (upsert, search) |
| `chunkingUtils.js` | Document chunking utilities |
| `authHandlers.js` | OAuth, Powch session management |
| `permissionService.js` | RBAC permission checking |
| `tokenService.js` | On-chain token balance checks |

## Service Dependencies

```
apiFront.js
    → communityManagement.js → ipStorageUtils.js → Firestore
    → purchase.js → ipStorageUtils.js → Firestore
    → geminiAPI.js → pineconeService.js → Pinecone
                   → googleStorageService.js → Drive/GCS
                   → chunkingUtils.js
    → authHandlers.js → ipStorageUtils.js → Firestore
    → permissionService.js → ipStorageUtils.js → Firestore
```

**Key Dependency Rules**:
- Services import from `ipStorageUtils.js` for data models
- Services import from `googleStorageService.js` for file operations
- Services import from `pineconeService.js` for vector operations
- `apiFront.js` imports services but never business logic directly

## Drive → GCS → Pinecone Pipeline

### Complete Pipeline Call Stack

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     DOCUMENT INGESTION PIPELINE                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  STAGE 1: Drive Discovery                                                   │
│  ─────────────────────────                                                  │
│  recursive_list_folder_tree(folder_id)          [googleStorageService.js]     │
│  └── Returns: [[path, filename, file_id, mimeType], ...]                    │
│                                                                             │
│  STAGE 2: File Upload to GCS                                                │
│  ──────────────────────────                                                 │
│  FOR EACH FILE in file_list:                                                │
│  │                                                                          │
│  └── uploadKnowledgeFileToGCS(community_id, app_id, file_id, ...)           │
│      │                                                     [googleStorageService.js]│
│      │                                                                      │
│      ├── get_gfile_text_content(file_id)                                    │
│      │   │                                                                  │
│      │   ├── Google Docs → export as text/plain                             │
│      │   ├── Presentations → export as text/plain                           │
│      │   ├── Spreadsheets → export as text/csv                              │
│      │   ├── DOCX → mammoth.extractRawText()                                │
│      │   ├── PDF → Document AI processDocument()                            │
│      │   └── Text files → direct download                                   │
│      │                                                                      │
│      └── Storage.bucket().file().save(content, metadata)                    │
│          └── gs://{bucket}/cache/community/Community/{cid}/Apps/{aid}/      │
│              KnowledgeBases/{kb}/files/{file_id}                             │
│                                                                             │
│  STAGE 3: Vectorization (via Pinecone Integrated Embeddings)                 │
│  ─────────────────────────────────────────────────────────────              │
│  upsertChunkRecords(namespace, records)                                      │
│  │                                    [pineconeService.js]                  │
│  │                                                                          │
│  └── Pinecone.upsertRecords()                                               │
│      │                                                                      │
│      ├── Pinecone automatically embeds text field                           │
│      │   (using index's configured embedding model)                         │
│      │                                                                      │
│      └── Pinecone stores:                                                   │
│          - id: chunk_id                                                      │
│          - values: embedding vector (auto-generated)                         │
│          - metadata: {community_id, app_id, kb_name, file_id, chunk_id, gcs_uri}
```

### App Purchase Gating (V2)

In V2, app and role purchases use the **pure DEX model**. Users pay with USDC/USDT from their own wallet (via Powch). The backend validates eligibility and records entitlements; payment flows through Powch/on-chain, not custodial balance. See [Powch: DeFi Banking + SSO](../../architecture/powch-defi-sso.md) and [crypto-payments](crypto-payments.md).

## Related Documentation

- [API Reference](api-reference.md) – Complete command inventory
- [RAG Pipeline](rag-pipeline.md) – Knowledge base vectorization
- [Platform Architecture](../../architecture/index.md) – Overall platform architecture
