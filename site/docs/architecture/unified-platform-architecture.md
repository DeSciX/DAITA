# Unified Platform Development & Routing Architecture (V2)

## Overview

This document defines the architecture for **Local Platform Development** and **Production Routing** in the DeSciX V2 platform. It unifies the development and production models by treating the "Platform" (DeSciX Store + Cloud Core) as a standard App (the "Root App") and leveraging `descix-serve` as a local mirror of the production load balancer's discovery logic.

**Key Principle:** All Apps (DeSciX Store, Powch, App X) are **Isolated Peers** running in their own security domains (Origins).

*   **Production:** `descix.net` (Store), `powch.descix.net` (Powch), `app-x.descix.net` (App X).
*   **Local Dev:**
    *   **Gateway:** `localhost:5173` (The "Public" Face / Load Balancer).
    *   **Store (Shell):** `localhost:5174` (Upstream for Gateway).
    *   **Powch:** `localhost:5175` (Isolated Peer).
    *   **App X:** `localhost:5176+` (Isolated Peer).

## 1. The "Root App" Concept

The "Platform" is simply the App that claims the Root Route (`/`).
*   **App ID:** `daita` (DeSciX Community Token Symbol).
*   **Role:** The "Shell" or "Store" that users visit first.
*   **Production:** Maps `https://descix.net` -> `daita` App.
*   **Local:** Maps `https://localhost:5173` -> `daita` App (running on `localhost:5174`).

## 2. Standardized Workspace Structure

The `.descix/workspace.json` file drives the local routing configuration.

```json
{
  "version": "2.1",
  "workspaceRoot": "/Users/essam/Code/DeSciX",
  "type": "workspace",
  "env": {
    "environment": "DEV",
    "platform": {
      "appId": "daita",
      "localPath": "DeSciX_Cloud",
      "site": { "port": 5174, "devCommand": "npm run dev:site" },
      "microservice": { "port": 4000, "devCommand": "npm run dev:service" }
    },
    "products": [
      {
        "appId": "powch",
        "localPath": "DeSciX_Powch",
        "site": { "port": 5175, "devCommand": "npm run dev:site" },
        "microservice": { "port": 3003, "devCommand": "npm run dev:service" }
      },
      {
        "appId": "descix-docs",
        "localPath": "descix-docs",
        "site": { "port": 5176, "devCommand": "npm run dev", "protocol": "http" }
      }
    ]
  }
}
```

## 3. `descix-serve`: The Universal Discovery Map

`descix-serve` runs on the **Gateway Port (5173)**. Its primary role is **Discovery** and **Routing**.

### A. Routing Logic (Local vs. Prod)

| Request Path | Prod Target (Load Balancer) | Local Target (`descix-serve` :5173) |
| :--- | :--- | :--- |
| **`/` (Root)** | `daita` App (GCS `prod/daita/site`) | `daita` App (Localhost :5174) |
| **`/apifront`** | `daita` Service (Cloud Run) | `daita` Service (Localhost :4000) |
| **`/s/{appId}`** | `{appId}` Service (Cloud Run) | `{appId}` Service (Localhost :{microservice.port}) |
| **`/p/{appId}`** | `{appId}` App (GCS `prod/{appId}/site`) | `{appId}` App (Localhost :{site.port}, NO path rewrite) |

### B. The Discovery Map (`__WORKSPACE_PRODUCTS__`)

To solve the "URL Mismatch" (DB says GCS, Local says Localhost), `descix serve` builds a **Discovery Map** from `workspace.json` (`buildWorkspaceProducts()`) and supplies it as a Vite `define` — a compile-time substitution, not a runtime `window` assignment.

**Every URL in the map is on the GATEWAY origin.** That is the contract, not an implementation detail: the shell feeds these URLs straight to the CodeSite iframe, and SplitView dispatches actions by reaching into `iframe.contentWindow` — direct interframe scripting, no postMessage bridge. Hand the shell an app's own dev-server origin and that reach throws a cross-origin `SecurityError`, so SplitView dies silently for exactly the apps a developer is working on.

```javascript
// Vite define, built from workspace.json
__WORKSPACE_PRODUCTS__ = {
  "daita": "https://localhost:5173/",          // env.platform -> gateway ROOT
  "app-x": "https://localhost:5173/p/app-x"    // products -> gateway /p/{appId}
};
```

`5173` above is whatever the gateway resolved to (`--port` > `env.gateway.port` > `5173`); the port is baked in at build time, so a prebuilt shell bundle reused behind a gateway on a different port loads the ORIGINAL port's app.

**Powch is deliberately absent from this map.** It is the ZK-SSO identity silo and is cross-origin by design — same-origin would let every hosted app read its DOM and memory through the same reach SplitView uses. Its location has one owner, `resolvePowchUrl`.

### C. Client-Side Routing (App SDK)

The App SDK (`AppData` / `AppShell`) uses this map to determine the **Iframe Source URL**.

*   **Logic:**
    ```javascript
    function getProductUrl(product) {
       // 1. Check Local Discovery Map (Dev Mode Overlay). AppData reads the
       //    MUTABLE AppData._workspaceProducts, which the define only SEEDS at
       //    module init — so workspaceProductsPlugin can push a fresh map over
       //    Vite's WebSocket when workspace.json changes, with no restart.
       const local = AppData.getWorkspaceProducts();
       if (local && local[product.id]) return local[product.id];
       // 2. Fallback to DB Value (Production / GCS)
       return product.ip_site_gcs_path_url;
    }
    ```

*   **Result:**
    *   The Store (`:5173` -> proxied from `:5174`) loads Powch Iframe from `https://localhost:5175`.
    *   **Cross-Origin Isolation is Preserved.** (`:5173` vs `:5175`).
    *   `postMessage` works correctly because the PWA knows the *actual* origin of the peer.

## 4. Port-Based Isolation

We explicitly **DO NOT** proxy peer apps through the Gateway Port (`:5173/p/powch`) for UI loading.
*   **Why?** Proxying makes them Same-Origin (`:5173`), breaking the security model.
*   **Instead:** Peer Apps run on their own ports (`:5175`).
*   **Access:** The Store PWA loads them via full URL (`https://localhost:5175`).

## 5. Directory Structure (Standardized)

*   `DeSciX_Cloud/` (The Platform / Root App)
    *   `site/` (React PWA - formerly `DeSciX_PWA`)
    *   `microservice/` (Node Service - formerly `cloud`)
*   `DeSciX_Powch/` (Peer App)
    *   `site/` (React PWA)
    *   `microservice/` (Node Service)

## 6. Airdrop Onboarding (WS-ADMIN-B1 + T-FLOW-PASSKEY-FIRST)

New in WS-ADMIN-B1: a three-path onboarding menu presented to new users who
reach `AuthFlowController.AIRDROP_ONBOARDING_CHOICE`. Rendered by
`OnboardingEntryChoice` in `DeSciX_Powch/packages/react/src/views/`.

Paths (post T-FLOW-PASSKEY-FIRST restructure, 2026-04-22):
- **I have an airdrop private key** → passkey ceremony fires first →
  `CollectEmailTosPkView` consolidated form collects email + TOS + (optional)
  airdrop PK → `descix_accept_tos` verifies the EIP-191 signature and calls
  `confirm_wallet_any_registered_token` (any-token gate). Gate PASS writes a
  `pending_migrations` row; gate FAIL rejects without mutating the user record.
- **Buy with Card** → `FiatStubScreen` (now a real fiat purchase rail; WS-AUTH-STATE-PURGE):
  reached only after the user is CONNECTED, it calls the canonical
  `create_stripe_checkout_session` rail (`PowchNetworkAPI.createStripeCheckoutSession`)
  and redirects to hosted Stripe Checkout. The webhook → `settleConfirmedFunds` →
  `batchUpdateBalances` mint delivers the community token to the user's master wallet.
- **Buy with Crypto** → `CryptoStubScreen` (now a real crypto purchase rail; WS-AUTH-STATE-PURGE):
  reached only after CONNECTED, it calls `create_crypto_quote`
  (`PowchNetworkAPI.createCryptoQuote`) to return a fixed-price quote + treasury deposit
  address. Full settlement (deposit detection → chain-watcher → mint) is deferred to the
  deployed phase (CryptoAPIs caller-IP ban blocks the local/dev chain-watcher egress).

Restructured AuthFlowController state machine (new-user path):
`CHECK_SESSION → PROMPT_TYPE → AIRDROP_ONBOARDING_CHOICE → CREATE_PASSKEY_BLOB
 → COLLECT_EMAIL_TOS_PK → CONSENT_GATE → FINISH (CONNECTED)`

The legacy pre-passkey `VERIFY_AIRDROP_WALLET` / `TokenGateView` preview was
removed — the gate now runs server-side inside `descix_accept_tos`, guaranteeing
the user cannot reach CONNECTED without passing it. Any rejection leaves the
user at NOT_AUTHENTICATED (passkey exists, session does not).

The pending queue is executed by `airdrop_execute_queue` (service-account-only,
Cloud Scheduler cron). The on-chain broadcast boundary is preserved in B1 —
the handler stops at `stopped_at_broadcast_boundary` until a separate
CEO-authorized round lifts it.

**Any-token gate (`confirm_wallet_any_registered_token`):** extends the
classic single-token onboarding gate to check any registered DeSciX community
token, plus pending_migrations entries for the given user_id. Wired through
`apiFront.js` via the `authCommands.js` wrapper (T20b Gap B fix).
