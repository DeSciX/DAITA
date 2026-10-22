# Static Site Serving — Architecture

How the DeSciX gateway serves static files for products configured with `site.static` in workspace.json, from local dev to production deployment.

## System Overview

```
workspace.json                  createViteProxyConfig.js
  env.products[].site.static ──→  resolves absolute path
                                  attaches to proxy._staticRoutes
                                         │
                                         ▼
gateway.js                      staticSitePlugin.js
  extracts _staticRoutes ──────→  Vite middleware at /p/{appId}/
  passes to plugin                serves files from disk
                                         │
                                         ▼
serveBinding.js                 the shell at the gateway root
  appUrl from gatewayProductUrl ─→ GET /__descix/app-binding.json
  https://localhost:<gw-port>/p/X STANDALONE_APP → AppSurfaceWidget → CodeSiteWidget (iframe)
```

## Module Reference

### staticSitePlugin.js

**Location:** `src/dev/staticSitePlugin.js` in the published `@descix/app-sdk` package; internal to the gateway (`src/dev/gateway.js` imports it), not re-exported from `@descix/app-sdk/dev`

**Purpose:** Vite plugin that registers middleware to serve static files at `/p/{appId}/` paths. Runs BEFORE Vite's own middleware so static routes are handled before Vite tries to process them.

**Input:** `staticRoutes` object — `{ [appId]: absolutePath }` mapping app IDs to filesystem directories.

**Request Handling Flow:**

```
Request: GET /p/egpt/demos/fractal.html
                │
                ▼
   1. URL starts with /p/ ? ─── No ──→ next() (skip)
                │ Yes
                ▼
   2. Extract appId = "egpt", filePath = "demos/fractal.html"
                │
                ▼
   3. staticRoutes["egpt"] exists? ─── No ──→ next() (skip)
                │ Yes
                ▼
   4. Trailing slash redirect: /p/egpt → 302 → /p/egpt/
                │
                ▼
   5. Resolve: path.join(staticRoot, filePath)
                │
                ▼
   6. Security: resolved.startsWith(staticRoot)? ─── No ──→ 403
                │ Yes
                ▼
   7. File resolution:
      a. Is directory? → serve index.html
      b. File not found + no extension? → try .html → SPA fallback (root index.html)
      c. File exists → serve it
                │
                ▼
   8. Set Content-Type from extension (MIME_TYPES map)
      Set Cache-Control: no-cache
      200 + file content
```

**MIME Types:** Covers HTML, JS, CSS, JSON, JSONL, images (PNG, JPG, GIF, SVG, ICO, WebP), fonts (WOFF, WOFF2, TTF, OTF), video (MP4, WebM), PDF, Markdown, TXT, XML, WASM, and source maps. Unknown extensions fall back to `application/octet-stream`.

**SPA Fallback:** When a path has no file extension and no matching `.html` file exists, the plugin serves the root `index.html`. This supports client-side routing frameworks (React Router, Vue Router, etc.) where the server should always return the app shell.

**No-op Mode:** If `staticRoutes` is empty or null, returns a plugin with an empty `configureServer` — zero overhead when no static sites are configured.

### createViteProxyConfig.js — Static Route Extraction

**Location:** `src/dev/createViteProxyConfig.js` in the published `@descix/app-sdk` package (export `@descix/app-sdk/dev`)

**Relevant Section:** Lines 71-84 — the `env.products` loop.

**Logic for `site.static` products:**

```javascript
if (p.site?.static) {
  const localPath = p.localPath || '.';
  const staticDir = p.site.static === '.'
    ? localPath
    : path.join(localPath, p.site.static);
  staticRoutes[appId] = path.resolve(workspaceRoot, staticDir);
}
```

**Path Resolution:**
- `localPath` comes from the product's `localPath` field in workspace.json
- `site.static` is joined relative to `localPath`
- Special case: `site.static === "."` means use `localPath` directly (not `path.join(localPath, ".")` which would be equivalent, but the intent is clearer)
- Final path is resolved to absolute against `workspaceRoot`

**Integration with proxy object:** Static routes are attached as `proxy._staticRoutes` rather than as proxy rules. This is a backward-compatible mechanism — `createViteProxyConfig` returns a proxy config object, and `gateway.js` extracts `_staticRoutes` before passing the rest to Vite's proxy.

### gateway.js — Static Route Orchestration

**Location:** `src/dev/gateway.js` in the published `@descix/app-sdk` package (export `@descix/app-sdk/dev`)

**How it wires static sites:**

1. Calls `createViteProxyConfig()` which returns proxy rules + `_staticRoutes`
2. Extracts `staticRoutes` from `proxyRules._staticRoutes`, then deletes the property
3. Logs a "Static sites" table showing each `/p/{appId}` → directory mapping
4. Passes `staticRoutes` to `staticSitePlugin()` as a Vite plugin
5. On workspace.json hot-reload, repeats the entire process with updated config

**Key architectural decision:** Static sites are served via a Vite plugin (middleware), not via Vite proxy rules. This is because Vite proxy rules require a target URL (another server), but static sites have no server — they're files on disk. The plugin approach uses Vite's `configureServer` hook to insert Connect middleware that serves files directly.

### workspaceProducts.js — Product URL Mapping

**Location:** `src/dev/workspaceProducts.js` in the published `@descix/app-sdk` package (export `@descix/app-sdk/dev`)

**Static site mapping (lines 32-34):**

```javascript
} else if (p.appId && p.site?.static) {
  products[p.appId] = `https://localhost:${gatewayPort}/p/${p.appId}`;
}
```

**How this reaches the PWA:**
- `buildWorkspaceProducts()` is called by `gateway.js` → `buildDefines()`
- The result is injected as `__WORKSPACE_PRODUCTS__` — a build-time define replacement
- The define reaches only a shell the gateway builds locally. A shell proxied from a deployed origin (the default whenever the API origin is remote) is pre-built and never sees it.
- The shell finds the served app through the binding instead: `serveBinding.js` answers `GET /__descix/app-binding.json` with `appUrl` = `gatewayProductUrl(port, appId)` = `https://localhost:<gw-port>/p/<appId>`
- The shell boots in its `STANDALONE_APP` view, and `AppSurfaceWidget` → `CodeSiteWidget` loads `appUrl` in a same-origin iframe

**Gateway port source:** `src/dev/gatewayPort.js::resolveGatewayPort` — the ONE owner, shared by the server and by this product map so the two can never name different ports. Chain: `--port`, then `env.gateway.port`, then the built-in default `5173`.

## Configuration Contract

### workspace.json Product Entry

```json
{
  "appId": "egpt",           // Required: unique app identifier
  "localPath": "EGPT",       // Required: path from workspace root to project
  "kbId": "General",         // Optional: KB for RAG indexing
  "site": {
    "static": "."            // Path relative to localPath; "." = localPath root
  }
}
```

### Precedence Rules

When a product has both `site.port` and `site.static`, the proxy config code checks `site.port` first (via `if/else if`). A product cannot be both a port-proxied site and a static site simultaneously.

A product can have `site.static` and `microservice.port` — the static site serves the frontend while the microservice handles API calls.

## Production Path

### Local Dev
```
Browser → https://localhost:<gw-port>/p/{appId}/ → staticSitePlugin middleware → disk
```

### Production
```
Browser → {appId}.{env}.descix.net → LB host rule → GCS bucket (/{env}/{appId}/site/)
```

**Note:** `/p/{appId}/` is LOCAL DEV ONLY (staticSitePlugin in gateway). Cloud uses subdomain-based routing via platform LB provisioned at env standup (`provision-platform-lb.js`), with rewrites to `/{env}/{appId}/site/`.

### Deployment
```bash
descix site upload -c {community} -a {appId} -p {path}
```

The `site upload` command:
1. Resolves the file list: the sources in `.descix/manifests/site.json` when it exists (running its `buildCommand` first), otherwise the `-p` directory.
2. Refuses the whole upload if any file is backend source (`microservice/`), an agent persona (`system_instructions.md`), a credential (`wallet*.json`, `.env*`, `dev-overrides*.json`, `secret*.json`, keys, certificates) or workspace/tooling state (`.descix/`, `.claude/`, `.git/`). The refusal names each file; nothing is uploaded, dry runs included.
3. Requests a deploy token (`get_site_deploy_token`) with the full file list and uploads **every** file of the build to GCS at `{env}/{appId}/site/`.
4. Confirms the deploy (`confirm_site_deploy`). The server deletes every object under the site prefix that the build does not name, keeping `.descix_site_manifest.json` (a live deploy never touches `_preview/`), and sets `ip_site_gcs_path_url` on the app.

A deploy therefore **replaces** the site: rolling back means re-uploading the earlier build. `--dry-run` lists what would be uploaded and what would be removed.

The GCS path follows the convention: `{env}/{app_id}/site/` — the `/site/` segment separates static site files from `/assets/` and `/data/`.

## Trailing Slash Redirect

The plugin redirects `/p/{appId}` (no trailing slash) to `/p/{appId}/` (with trailing slash) via HTTP 302. This is critical because:

- HTML files use relative paths for assets (`./styles.css`, `./app.js`)
- Without the trailing slash, the browser resolves relative paths against `/p/` instead of `/p/{appId}/`
- This matches the production behavior where GCS serves directories with trailing slashes

## Security

**Path traversal protection:** After resolving the file path with `path.join(staticRoot, filePath)`, the plugin checks that the resolved path starts with `staticRoot`. This prevents `../../etc/passwd` style attacks.

**No authentication:** Static sites served locally are unauthenticated (same as all local dev). In production, entitlement checks happen at the load balancer / API layer before the static files are served from GCS.

## Design Decisions

### Why a Vite Plugin Instead of Proxy Rules

Vite proxy rules (`server.proxy`) require a target URL — they forward requests to another HTTP server. Static files have no server; they're on disk. Using a Vite plugin with `configureServer` gives us direct access to the Connect middleware stack, allowing synchronous file reads and responses without spawning a separate static file server.

### Why `_staticRoutes` on the Proxy Object

`createViteProxyConfig` was designed to return proxy rules. Adding static routes as a new return value would break the API. Attaching `_staticRoutes` as a non-proxy property on the returned object is backward-compatible — consumers that only read proxy entries ignore it, while `gateway.js` explicitly extracts and deletes it.

### Why Cache-Control: no-cache

In local dev, files change frequently. `no-cache` ensures the browser always validates with the server, preventing stale content during development. Production GCS serving uses its own cache headers.
