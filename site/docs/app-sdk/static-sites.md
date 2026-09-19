# Static Site Serving (CodeSite)

How to serve a pre-built static site (HTML/CSS/JS) through the DeSciX gateway — no dev server required.

## Two Site Types

DeSciX supports two ways to serve an app's site through the gateway:

| Type | Config | How It Works | Use When |
|------|--------|-------------|----------|
| `site.port` | `"site": { "port": 3000 }` | App runs its own dev server; gateway proxies to it | React, Vue, VitePress — anything with `npm run dev` |
| `site.static` | `"site": { "static": "." }` | Gateway serves static files directly from disk | Pre-built HTML, documentation output, SPAs with no build step |

Both types are served at the same gateway path, on whatever port the gateway resolved: `https://localhost:<gateway-port>/p/{appId}/`

The key difference: `site.port` requires a running dev server process, `site.static` does not. The gateway reads files directly from the filesystem.

## Configuring workspace.json

Add your app to `env.products[]` in `.descix/workspace.json` with a `site.static` field:

```json
{
  "appId": "egpt",
  "localPath": "EGPT",
  "site": { "static": "." }
}
```

### The `site.static` Value

The value is a **path relative to `localPath`**:

| Value | Resolves To | Use When |
|-------|------------|----------|
| `"."` | `{workspaceRoot}/{localPath}/` | Your `index.html` is at the root of the project |
| `"site"` | `{workspaceRoot}/{localPath}/site/` | Standard app folder structure with `site/` directory |
| `"dist"` | `{workspaceRoot}/{localPath}/dist/` | Build output from a bundler |

### Full Example: EGPT as a Static Site

The EGPT project has its `index.html` at the project root. In workspace.json:

```json
{
  "env": {
    "products": [
      {
        "appId": "egpt",
        "localPath": "EGPT",
        "kbId": "General",
        "site": { "static": "." }
      }
    ]
  }
}
```

After running `descix serve`, the site is available at:
```
https://localhost:<gateway-port>/p/egpt/
```

## Running Locally with `descix serve`

Start the unified gateway:

```bash
descix serve
```

The gateway auto-discovers static sites from workspace.json. You'll see them in the startup log:

```
  descix-serve — Unified Local Gateway

  Workspace: <workspace root>
  API:       <api origin>     [<source>]
  Shell:     <shell origin>   [<source>]
  Port:      <port>           [<source>]

  Proxy routes:
    /apifront                                → <api origin>
    /api                                     → <api origin>
    ...

  Static sites:
    /p/<app_id>                              → <workspace root>/<localPath>
```

Every value in that banner is printed with the source it came from. Read the banner rather than
assuming a port or an origin.

### Live Reload

The gateway watches `workspace.json` for changes. If you add or remove a static site product, the gateway restarts automatically — no manual restart needed.

### How Static Serving Works

The gateway's `staticSitePlugin` handles requests to `/p/{appId}/`:

1. **Trailing slash redirect**: `/p/egpt` redirects to `/p/egpt/` so relative asset paths resolve correctly
2. **File serving**: Requests map to files on disk with proper MIME types (HTML, JS, CSS, images, fonts, WASM, etc.)
3. **Directory index**: Directory requests serve `index.html`
4. **Clean URLs**: `/p/egpt/about` tries `about.html` before falling back
5. **SPA fallback**: Unmatched paths serve root `index.html` for client-side routing
6. **Path traversal protection**: Requests cannot escape the static root directory

## Deploying to Production

Once your static site works locally, deploy to GCS:

```bash
descix site upload -c <community_id> -a <app_id> -p <path>
```

Run it with `--dry-run` first to see what would be uploaded and which server files would be
removed.

### Upload Options

| Flag | Purpose |
|------|---------|
| `-c, --community <id>` | Community ID (auto-detects from context) |
| `-a, --app <id>` | App ID (auto-detects from context) |
| `-p, --path <localPath>` | Local directory to deploy (default: `./site`) |
| `--preview` | Deploy to preview path |
| `--dry-run` | Show what would be uploaded and removed |
| `--no-cache` | Set Cache-Control: no-cache |

The upload command:
1. Hashes local files
2. Uploads every file to GCS
3. Confirms the deploy: the server writes the site manifest, deletes every site file the build does not contain (the `_preview/` site is kept on a production deploy), and updates the app's `ip_site_gcs_path_url`
4. Prints the removed files; a failed upload stops before the confirm, so nothing is removed

In production, the site is served at the app's public URL (e.g., `egpt.descix.net` or via the platform's `/p/egpt/` route through the load balancer).

## End-to-End: From workspace.json to the Launch Button

The full chain for how a static site reaches the user in the PWA:

1. **workspace.json** — Product has `site.static` configured
2. **workspaceProducts.js** — Maps `site.static` products to `https://localhost:{gatewayPort}/p/{appId}`
3. **Gateway define** — Injects the URL into `__WORKSPACE_PRODUCTS__` at build time
4. **AppData.getProductUrl()** — Returns the gateway URL for the app
5. **AppStoreWidget** — Shows "Launch Code Site" button
6. **CodeSiteWidget** — Loads the static site in an iframe

## Comparison with site.port

| Aspect | `site.static` | `site.port` |
|--------|--------------|-------------|
| Dev server needed | No | Yes |
| Hot module reload | No (manual refresh) | Yes (via framework HMR) |
| File changes | Instant (served from disk) | Depends on framework |
| Framework support | Any (pre-built output) | Vite, Webpack, etc. |
| Gateway routing | Vite middleware plugin | Vite proxy rule |
| Production deploy | `descix site upload` | `descix site upload` (build first) |
| Best for | Documentation, demos, SPAs | Active development |

## Troubleshooting

### Site returns 404
- Ensure `localPath` in workspace.json points to the correct directory
- Check that `index.html` exists at the resolved static root
- Verify the gateway started with your static site listed in the "Static sites" table

### Relative assets don't load
- Always access the site with a trailing slash: `/p/egpt/` not `/p/egpt`
- The gateway redirects bare paths, but bookmarks may bypass this

### MIME type issues
- The plugin recognizes common web file types (HTML, JS, CSS, JSON, images, fonts, video, WASM, PDF, etc.)
- Unknown extensions are served as `application/octet-stream`
