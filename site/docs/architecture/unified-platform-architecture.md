# Unified Platform Development & Routing Architecture (V2)

## Overview

This document defines the architecture for **Local Platform Development** and **Production Routing** in the DeSciX V2 platform. It unifies the development and production models by treating the "Platform" (DeSciX Store + Cloud Core) as a standard App (the "Root App") and leveraging `descix-serve` as the local gateway that puts the shell, the apps and `/apifront` on one origin, as the Cloudflare Worker `descix-edge-router` does for a production host.

**Key Principle:** All Apps (DeSciX Store, Powch, App X) are peers built on the same SDK. The Shell frames every app from its own origin; Powch, the identity silo, is the one app on a separate origin.

*   **Production:** `descix.net` (Store), `powch.descix.net` (Powch), `{app}.descix.net` (an app's own host).
*   **Local Dev:** one HTTPS gateway origin, `https://localhost:<port>`, where the port is `--port`, else `env.gateway.port`, else `5173`, printed with its source at startup.
    *   **Shell:** `/` — `env.siteUrl`, else the `env.gateway.shell` repo's local site, else the API origin.
    *   **App X:** `/p/<appId>` on the gateway origin (the app's dev server or static directory).
    *   **Powch:** its own origin, from `resolvePowchUrl`.

## 1. The "Root App" Concept

The "Platform" is simply the App that claims the Root Route (`/`).
*   **App ID:** `daita` (DeSciX Community Token Symbol).
*   **Role:** The "Shell" or "Store" that users visit first.
*   **Production:** Maps `https://descix.net` -> `daita` App.
*   **Local:** Maps the gateway root `https://localhost:<port>/` -> the Shell (`env.siteUrl`, else the `env.gateway.shell` repo's local site, else the API origin).

## 2. Standardized Workspace Structure

The `.descix/workspace.json` file drives the local routing configuration. It is version 3.0: each app repo holds its own file with exactly one `env.app`. A gateway workspace that serves several local app repos behind one `descix serve` lists them under `env.gateway`, with paths relative to its own root:

```json
"gateway": { "port": 5599, "shell": "../platform-shell", "appRepos": ["../my-app", "../other-app"] }
```

`env.gateway.shell` is the repo whose app the gateway serves at `/`; each repo in `env.gateway.appRepos[]` is served at `/p/<appId>`, and that repo's own workspace file is the sole authority on its app's id, site and microservice. The schema and the verb that owns each key: `agent-assets/reference/workspace-config.md` in the published `@descix/cli` package.

## 3. `descix-serve`: The Universal Discovery Map

`descix-serve` runs on the **Gateway Port** (`--port`, else `env.gateway.port`, else `5173`). Its primary role is **Discovery** and **Routing**.

### A. Routing Logic (Local vs. Prod)

| Request Path | Prod Target (Cloudflare Worker `descix-edge-router`) | Local Target (`descix-serve`) |
| :--- | :--- | :--- |
| **`/` (Root)** | The shell's site: GCS `descix-assets-public/prod/daita/site/index.html`, on `descix.net` and on every `{appId}.descix.net` except `powch.descix.net`, which serves Powch's own site | The Shell: `env.siteUrl`, else the `env.gateway.shell` repo's local site, else the API origin |
| **`/apifront`, `/mcp`, `/oauth`** | The shared broker, Cloud Run `apifront-http-prod`, on every host | The CLI's resolved API origin (the `--api-url` flag, else the workspace's `env.apiUrl`) |
| **`/api/*`** | On `{appId}.descix.net`: the app's Cloud Run service `{appId}-prod` | The CLI's resolved API origin |
| **`/prod/{appId}/site/*`** | The app's site files: GCS `descix-assets-public/prod/{appId}/site/*` | The Shell target, as for every path no other row matches |
| **`/s/{appId}`** | No route | `{appId}` Service (Localhost :{microservice.port}) |
| **`/p/{appId}`** | No route | `{appId}` App: its dev server (`site.port`, NO path rewrite) or its static directory (`site.static`) |

In production, a path with no route is looked up as a file of the site served at the host's root; a browser request for a missing extensionless path gets that site's `index.html`.

### B. The Discovery Map (`__WORKSPACE_PRODUCTS__`)

To solve the "URL Mismatch" (DB says GCS, Local says Localhost), `descix serve` builds a **Discovery Map** from `workspace.json` (`buildWorkspaceProducts()`) and supplies it as a Vite `define` — a compile-time substitution, not a runtime `window` assignment.

**Every URL in the map is on the GATEWAY origin.** That is the contract, not an implementation detail: the shell feeds these URLs straight to the CodeSite iframe, and SplitView dispatches actions by reaching into `iframe.contentWindow` — direct interframe scripting, no postMessage bridge. Hand the shell an app's own dev-server origin and that reach throws a cross-origin `SecurityError`, so SplitView dies silently for exactly the apps a developer is working on.

```javascript
// Vite define, built from workspace.json
__WORKSPACE_PRODUCTS__ = {
  "daita": "https://localhost:5173/",          // env.gateway.shell -> gateway ROOT
  "app-x": "https://localhost:5173/p/app-x"    // env.gateway.appRepos -> gateway /p/{appId}
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
    *   The Shell, on the gateway origin, frames each app from `/p/<appId>` on that same origin, and loads the Powch iframe from the URL `resolvePowchUrl` returns.
    *   **Cross-Origin Isolation is Preserved for Powch** (the gateway origin vs Powch's own origin).
    *   `postMessage` works correctly because the PWA knows the *actual* origin of the peer.

## 4. Powch Origin Isolation

Powch is the one app the Shell does not frame from `/p/`: it stays on its own origin, so no hosted app can reach its DOM.
*   **Its URL has one owner, `resolvePowchUrl`:** an explicit override, else `env.powchUrl`, else the site origin of a Powch repo listed in `env.gateway.appRepos`.
*   **Every other app** in `env.gateway.appRepos` is served at `/p/<appId>` on the gateway origin.

## 5. Directory Structure (Standardized)

Every app, the root app (`daita`) and Powch included, uses the layout `descix app init` creates:

*   `site/` (the web front end; any framework)
*   `microservice/` (the backend service; optional, the slot always exists)
*   `assets/` (`system_instructions.md` and `app_description.md`)

## 6. Airdrop Onboarding

A three-path onboarding menu is presented to new users who reach
`AuthFlowController.AIRDROP_ONBOARDING_CHOICE`. Rendered by
Powch's `OnboardingEntryChoice` view.

Paths:
- **I have an airdrop private key** → passkey ceremony fires first →
  `CollectEmailTosPkView` consolidated form collects email + TOS + (optional)
  airdrop PK → `descix_accept_tos` verifies the EIP-191 signature and calls
  `confirm_wallet_any_registered_token` (any-token gate). Gate PASS writes a
  `pending_migrations` row; gate FAIL rejects without mutating the user record.
- **Buy with Card** → `FiatStubScreen`, the fiat purchase rail:
  reached only after the user is CONNECTED, it calls Powch `create_checkout_session`
  (`PowchNetworkAPI.createCheckoutSession`, priced by Cloud `price_catalogue_purchase`,
  `purchase_type` `community_token`) and redirects to hosted Stripe Checkout. Powch's Stripe
  webhook hands the event to Cloud `settle_confirmed_funds_from_powch` → `settleConfirmedFunds`
  → `batchUpdateBalances` mint delivers the community token to the user's master wallet.
- **Buy with Crypto** → `CryptoStubScreen`: there is no crypto purchase rail; the screen
  says "Crypto purchase is not available yet; buy with a card." and calls nothing.

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
