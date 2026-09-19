# Unified Product Registry — Schema & Identity

> **Scope note:** This document covers **schema + identity** for the `Products` collection.
> **Routing semantics live in [`platform-must-know-briefer.md`](./platform-must-know-briefer.md) §3.** That briefer is canonical for how requests reach apps. If anything below appears to describe runtime routing, the briefer wins.

## Overview

This document defines the **Globally Unique Product ID** identity model and the schema of the `Products` Firestore collection. Products is consumed by:
1.  **Entitlements / purchases / metadata hydration** at the apifront-or-downstream layer (e.g., `hydrateCommunityIdFromProducts()`).
2.  **Provisioning bootstrap** — `admin/bootstrap.js hydrate-env` and platform env standup (`provision-platform-lb.js` via `deploy-backend-env.sh`).
3.  **Immutable Registry:** `descix-chain` is the canonical registry for all products (Communities, Apps, Funding Assets).

**Products is NOT the request router.** Mesh discovery is runtime via Firestore `ServiceManifests` + Core `/apifront`. The LB URL map is provisioned once per env (core NEG + static host rules). See the briefer §3.

## Architecture

The system separates concerns between the **Immutable Registry** (Identity) and the **Operational Catalog** (Runtime Configuration).

### 1. Immutable Registry (`descix-chain`)

**Purpose:** The single source of truth for global asset identity. Persists across all environments.
**Collection:** `Products`
**Key:** `GlobalProductID` (Slug, e.g., `daita`, `powch`, `tokenomics`)

| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | string | **Key.** Global unique slug. |
| `assetType` | enum | `COMMUNITY`, `APP`, `FUNDING` |
| `tokenSymbol` | string | On-chain symbol (e.g., `DAITA`). |
| `contractAddress` | string | Blockchain address. |
| `network` | string | Chain network (e.g., `polygon`). |
| `owner` | string | Wallet/User ID of owner. |
| `iconUrl` | string | Public URL for the product icon. |

**Policy:**
- First-come-first-served global namespace.
- Publicly published apps must be registered here.
- Local/Private apps do not exist here.

### 2. Operational Catalog (`descix-{env}`)

**Purpose:** The runtime configuration for a specific environment (Dev, Demo, Prod). Maps global IDs to internal storage paths.
**Collection:** `Products` (Root Level)
**Key:** `GlobalProductID` (Matches `descix-chain`)

| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | string | **Key.** Global unique slug. |
| `productPath` | string | **The Pointer.** Internal Firestore path (e.g., `Community/descix/Apps/chat`). |
| `gcsPath` | string | **The Site.** Bucket path for UI assets (e.g., `gs://.../uuid`). |
| `ip_site_gcs_path_url` | string | **The URL.** Load-balancer subdomain URL (e.g., `https://egpt.demo.descix.net`). Set by `confirm_site_deploy`. |
| `type` | enum | `COMMUNITY`, `APP` |
| `price` | number | Purchase price in the community's token sale currency. **`USDCX` is dead terminology**; on-chain purchases settle via `batchUpdateBalances`, and platform AI-consumption is billed via the separate USD credits ledger. |
| `currency` | string | Currency code (default `USDSCI`). |
| `metadata` | map | Runtime metadata (e.g., `is_public`, `owner_id`). |

### 3. Consumers of Products (NOT routing)

Products is consulted at three distinct layers — **never by the LB at request time**. The canonical routing model is in [`platform-must-know-briefer.md`](./platform-must-know-briefer.md) §3.

**Runtime readers (post-LB, apifront-or-downstream):**
- `hydrateCommunityIdFromProducts()` middleware in `apiFront.js` — resolves `community_id` from `Products/{app_id}` after the request has already been routed to the central command-broker Cloud Function.
- Purchase / entitlement handlers (e.g., `purchase_product`) — look up `Products/{id}` for price, type, ownership, contract bindings.
- App-metadata handlers — read `productPath`, `gcsPath`, `ip_site_gcs_path_url` for UI surfaces.

**Provisioning-time consumers (build/deploy step, not request time):**
- `admin/bootstrap.js hydrate-env` — populates the per-env operational `Products` collection from `descix-chain`.
- `provision-platform-lb.js` (via `deploy-backend-env.sh`) — platform env standup: core NEG + apex singleton + platform peer hosts (`PLATFORM_PEER_APPS`). Not read from Products; configured once per env.
- `confirm_site_deploy` — writes `ip_site_gcs_path_url` after a successful site deploy.

**What Products is NOT:**
- NOT read by the LB. The LB has no Firestore client at request time.
- NOT the trigger for adding a new app. Adding a new app requires (a) `Products` row insert, (b) optional `deploy-service-env.sh` + manifest registration if the app has a microservice, (c) optional `descix site upload` if the app has a site. **No NEG or LB script on routine deploy for non-core apps.**
- NOT keyed by `community_id`. The key is `app_id` (== `product_id`). `community_id` is metadata inside the document.

## Migration Strategy

### Step 1: Refactor `descix-chain` (Done)
The `descix-chain` schema has been updated to support `assetType` and clean IDs.

### Step 2: Create Operational `Products` Collection (Done)
We populated the `Products` collection in the operational database (`descix-dev`) by crawling existing `Community` and `App` documents.

**Mapping Logic:**
1.  **Communities:**
    - ID: `token_symbol` (lowercase) if available, else `community_id`.
    - Path: `Community/{community_id}`.
    - Type: `COMMUNITY`.
2.  **Apps:**
    - ID: `app_id` (assuming globally unique or namespaced).
    - Path: `Community/{community_id}/Apps/{app_id}`.
    - Type: `APP`.

### Step 3: Update Services
1.  **Purchase Service:** Update `purchase_product` to look up `Products/{id}` instead of constructing paths.
2.  **Bootstrap Script:** Use `admin/bootstrap.js hydrate-env` to hydrate `Products` from `descix-chain`.
3.  **Platform LB (env standup only):** `deploy-backend-env.sh {env}` invokes `provision-platform-lb.js` (core NEG + apex + platform peer hosts). Extend `PLATFORM_PEER_APPS` when a new peer host is needed at platform tier — not per-app NEG on routine deploy. See [`platform-must-know-briefer.md`](./platform-must-know-briefer.md) §3–§4.

## Local Development Flow

Developers define their active products in `workspace.json`:

```json
{
  "env": {
    "platform": {
      "appId": "daita",
      "localPath": "DeSciX_Cloud",
      "site": { "port": 5174 }
    },
    "products": {
      "powch": {
        "type": "APP",
        "localPath": "DeSciX_Powch",
        "site": { "port": 5175 }
      }
    }
  }
}
```

The CLI/Gateway (`descix-serve`) uses this to:
1.  Serve the Platform Shell at the gateway origin (proxied from the platform site's `env.platform.site.port`).
2.  Build `__WORKSPACE_PRODUCTS__` so the Shell knows each app's **gateway-origin** URL (`/p/{appId}`). Powch is NOT in that map — it stays cross-origin by design and is resolved separately by `resolvePowchUrl`.
