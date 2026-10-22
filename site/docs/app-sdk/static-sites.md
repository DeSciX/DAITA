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

Each app repo's own `.descix/workspace.json` holds one app, `env.app`; the repo root is the workspace root. Set the static site with `descix app set-site`:

```bash
descix app set-site -a egpt --static .
```

It writes `site.static` into `env.app`:

```json
{
  "env": {
    "app": {
      "appId": "egpt",
      "communityId": "egpt",
      "kbId": "General",
      "site": { "static": "." }
    }
  }
}
```

### The `site.static` Value

The value is a **directory relative to the repo root**:

| Value | Resolves To | Use When |
|-------|------------|----------|
| `"."` | `{repoRoot}/` | Your `index.html` is at the root of the repo |
| `"site"` | `{repoRoot}/site/` | Standard app folder structure with `site/` directory |
| `"dist"` | `{repoRoot}/dist/` | Build output from a bundler |
| `"../scratch"` | a sibling directory of the repo | The built site lives outside the repo |

A blank, absolute, `~` or URL value is refused, both by `descix app set-site` and by the gateway when it reads `workspace.json`.

Setting `--static` clears `site.port`, and setting `--port` clears `site.static`. Passing both flags in one call keeps both; the gateway then serves the dev server at `site.port`, and the `descix serve` banner says so under "Site modes".

After running `descix serve` from the repo, the site is available at:
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
  App:       <app_id>   [<source>]   mode: standalone
  Open:      https://localhost:<port>/   → App Shell; reads /__descix/app-binding.json and boots <app_id> standalone
  App route: https://localhost:<port>/p/<app_id>   → this app's route on the gateway (the URL the shell loads it from)
  First view: <view>   [share.json: <source>]

  Proxy routes:
    /apifront                                → <api origin>
    /api                                     → <api origin>
    ...

  Static sites:
    /p/<app_id>                              → <absolute site.static directory>
```

Every value in that banner is printed with the source it came from. Read the banner rather than
assuming a port or an origin.

### Live Reload

The gateway watches `.descix/workspace.json` (in a gateway workspace, each listed repo's own file too) for changes. If you set, change or clear `site.static`, the gateway restarts automatically — no manual restart needed. Edits to the site's files need no restart: they are read from disk on each request.

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

In production, `{appId}.descix.net/` serves the App Shell, which frames the app's site at `/prod/{appId}/site/index.html` on the same host. The Cloudflare Worker `descix-edge-router` serves the site files from Google Cloud Storage (`descix-assets-public/prod/{appId}/site/`). `/p/{appId}/` exists only on the local gateway.

## End-to-End: From workspace.json to the Framed Site

The full chain for how a static site reaches the user under `descix serve`:

1. **workspace.json** — `env.app.site.static` names the site directory
2. **Gateway static route** — the gateway serves that directory at `/p/{appId}/`
3. **App binding** — the gateway answers `GET /__descix/app-binding.json` at its root with `appUrl` = `https://localhost:<gateway-port>/p/{appId}`
4. **App Shell** — opened at the gateway root, the shell reads the binding and boots standalone on the app
5. **CodeSiteWidget** — loads `appUrl` in a same-origin iframe

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
- Ensure `site.static` in `.descix/workspace.json` names the directory that holds `index.html`, relative to the repo root
- Check that `index.html` exists at the resolved static root
- Verify the gateway started with your static site listed in the "Static sites" table

### Relative assets don't load
- Always access the site with a trailing slash: `/p/egpt/` not `/p/egpt`
- The gateway redirects bare paths, but bookmarks may bypass this

### MIME type issues
- The plugin recognizes common web file types (HTML, JS, CSS, JSON, images, fonts, video, WASM, PDF, etc.)
- Unknown extensions are served as `application/octet-stream`
