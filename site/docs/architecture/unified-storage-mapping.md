# Unified Storage & URL Mapping (V2)

## Overview

This document defines the deterministic mapping rules for Google Cloud Storage (GCS) paths and public URLs in the DeSciX V2 platform.

**Goal:** Eliminate the "App Discovery Gap" by using a globally unique Product ID and environment-prefixed paths to ensure consistent, O(1) resource location across all environments (Dev, Demo, Prod).

## Core Concepts

1.  **Globally Unique Product ID:** Every app/product has a unique ID (e.g., `powch`, `daita`, `tokenomics`).
    *   Legacy `Community/{id}/Apps/{id}` paths are **deprecated**.
2.  **Environment Prefix:** All storage paths are prefixed with the deployment environment (`dev`, `demo`, `prod`).
3.  **Slash-Based Mapping:** We use slash-based prefixes (e.g., `bucket/prod/...`) rather than hyphenated bucket names for environments.
4.  **Hard Cutover:** V2 assumes this new structure; no backward compatibility for legacy paths.

## Storage Buckets

We use two primary buckets:
*   **`descix-assets` (Private/Internal):** `utils.STORAGE_BUCKET`
*   **`descix-assets-public` (Public Web):** `utils.STORAGE_BUCKET_PUBLIC`

## Deterministic Mapping Rules

### 1. Public App Site (CodeSite)

*   **Bucket:** `descix-assets-public` (`utils.STORAGE_BUCKET_PUBLIC`)
*   **GCS Path:** `{ENV}/{APP_ID}/site/{FILE_PATH}`
*   **Public URL:** `https://storage.googleapis.com/{BUCKET}/{ENV}/{APP_ID}/site/{FILE_PATH}`
*   **Field Name:** `ip_site_gcs_path_url` (Stored in `Products` collection)

**Example (Prod - Powch):**
*   **Env:** `prod`
*   **App ID:** `powch`
*   **GCS Path:** `prod/powch/site/index.html`
*   **URL:** `https://storage.googleapis.com/descix-assets-public/prod/powch/site/index.html`

**Example (Demo - Powch):**
*   **Env:** `demo`
*   **App ID:** `powch`
*   **GCS Path:** `demo/powch/site/index.html`
*   **URL:** `https://storage.googleapis.com/descix-assets-public/demo/powch/site/index.html`

### 2. Public App Assets (Icons, Media)

*   **Bucket:** `descix-assets-public` (`utils.STORAGE_BUCKET_PUBLIC`)
*   **GCS Path:** `{ENV}/{APP_ID}/assets/{ASSET_TYPE}/{FILENAME}`
*   **Public URL:** `https://storage.googleapis.com/{BUCKET}/{ENV}/{APP_ID}/assets/{ASSET_TYPE}/{FILENAME}`

**Example (Prod - Powch Icon):**
*   **GCS Path:** `prod/powch/assets/icon/icon.png`

### 3. Internal/Private App Data

*   **Bucket:** `descix-assets` (`utils.STORAGE_BUCKET`)
*   **GCS Path:** `{ENV}/{APP_ID}/data/{FILE_PATH}`

## Implementation Details

### `googleStorageService.js` Updates

The `GCSPaths` helper must be updated to inject `utils.DEPLOY_ENV`.

```javascript
// Pseudo-code
const ENV = utils.DEPLOY_ENV || 'dev'; // Default to dev if missing

export const GCSPaths = {
    // New Flat Structure
    appSite: (appId, filePath = '', preview = false) => {
         // Note: communityId is removed/ignored in V2 flat structure
        const basePath = `${ENV}/${appId}/site`;
        const previewPath = preview ? `${basePath}/_preview` : basePath;
        return filePath ? `${previewPath}/${filePath}` : previewPath;
    },
    // ...
};
```

### `Products` Collection Schema

The `Products` collection in Firestore (`descix-{env}`) will store the fully qualified URL.

*   **Field:** `ip_site_gcs_path_url`
*   **Value:** Load-balancer subdomain URL, e.g. `https://powch.descix.net` (prod) or `https://powch.demo.descix.net` (demo)
*   **Set by:** `confirm_site_deploy` in `appCommands.js` via `GCSPaths.toSubdomainUrl(appId)`
*   **NOT:** a raw GCS storage path (those return 404 — GCS bucket is not configured for direct HTTP serving of sites)

## Local Development Override

In local development, the `ip_site_gcs_path_url` stored in the database is **overridden** by the local gateway.

1.  **Database:** `Products/powch` -> `ip_site_gcs_path_url: "https://powch.descix.net"`
2.  **Local Gateway (`descix serve`):** builds `__WORKSPACE_PRODUCTS__` from `workspace.json`, mapping each app to its **gateway-origin** URL (`https://localhost:{gatewayPort}/p/{appId}`). Powch is deliberately EXCLUDED — it is the ZK-SSO identity silo and stays cross-origin by design; its location has one owner, `resolvePowchUrl`.
3.  **Client (`AppData`):**
    ```javascript
    // AppData.jsx
    getProductUrl(product) {
        // 1. Prefer Local Dev URL
        if (__WORKSPACE_PRODUCTS__[product.id]) return __WORKSPACE_PRODUCTS__[product.id];
        // 2. Fallback to subdomain URL
        return product.ip_site_gcs_path_url;
    }
    ```

This ensures that developers see their local changes (`localhost:5175`) while the same code running in production sees the deployed site via the load balancer subdomain.

## Migration Strategy

*   **Legacy:** `Community/{communityId}/Apps/{appId}/site`
*   **New:** `{ENV}/{appId}/site`

**Hard Cutover:**
*   Existing apps must be redeployed using the V2 CLI/SDK to populate the correct `ip_site_gcs_path_url` and move files to the new GCS location.
*   The migration script `createOperationalProductsCollection.js` will copy existing `ip_site_gcs_path` values to `ip_site_gcs_path_url` for reference, but these may be legacy relative paths until redeployment.
