# App Developer Runbook

This is the one page an app developer follows from a cloned repository to a locally served,
deployed DeSciX app. You need only two published npm packages — `@descix/cli` and
`@descix/app-sdk` — and this page. You never need platform source, a local backend, or any
platform checkout.

**The wall rule:** when this runbook and `descix tell-me-how` do not answer a question, stop,
write the question down with its evidence (the command you ran, its output, and the `env:` line
it printed), and hand it to the platform team. Do not read platform source to answer it.

Every command here targets the production platform, `https://descix.net`, as an external
developer. Other environments exist for platform development and are out of scope for this page.

Every quoted output below is what the CLI printed on a real run against the reference app
`egpt-frqtl` (community `egpt`). Substitute your own `<app_id>` and `<community>`.

## 1. Prerequisites

| | |
|---|---|
| Node | `>= 24` |
| git | your app lives in a git repository — the knowledge-base sync walks **committed** files at a git ref, never the working tree |
| Browser | any; sign-in opens one and the passkey ceremony runs in it |
| a community | apps are created inside an existing community. Creating a community is a platform act; you do not need one of your own |

## 2. Run the CLI

Run the published CLI with the package name spelled out and the version pinned:

```bash
npx -y -p @descix/cli@4.2.0 descix <command>
```

- Plain `npx descix` fails — the package is `@descix/cli`, not `descix`.
- Bare `npx @descix/cli` stops with `could not determine executable to run`, because the
  package ships two executables (`descix` and `descix-mcp`).
- To shorten every later command, pin the CLI in your repo's `package.json`
  (`"devDependencies": { "@descix/cli": "4.2.0" }`), run `npm install` once, and then
  `npx descix <command>` runs the pinned copy. The long form is used throughout this page so
  that every command works in a bare clone.

**Verify:** `npx -y -p @descix/cli@4.2.0 descix --version` prints `4.2.0`.

## 3. Pin production, then sign in

The CLI resolves its API origin in this precedence: a `--env`/`--api-url` flag on the
invocation, then the `DESCIX_API_URL` environment variable, then `.descix/workspace.json`
`env.apiUrl`, then global config, and only then the shipped default — which is production.

Production is the default, but pin it explicitly anyway, so every command's first line names the
workspace as the source instead of a default:

```bash
cd <your app repo>
npx -y -p @descix/cli@4.2.0 descix config init --env prod
```

```
✅ Configuration initialized!

   Environment: PROD
   API URL:     https://descix.net
   Saved to:    <your app repo>/.descix/workspace.json
   (new workspace created here — this directory is now the workspace root)
```

**Never export `DESCIX_API_URL` from any settings file, shell profile or hook.** It silently
outranks the workspace pin for every command in every repo on the machine. If a command ever
prints `env: … (DESCIX_API_URL environment variable) …`, find the export and delete it at its
source; `descix config show` also prints a ⚠ line when the variable overrides the pin.

Now sign in:

```bash
npx -y -p @descix/cli@4.2.0 descix login
```

`descix login` is a device-code flow: the CLI requests a code, opens your browser at
`https://descix.net/device?code=<code>` and polls until the browser confirms. In the browser you
see **Complete CLI Login**, then one button, **Sign In with Powch**; clicking it opens the Powch
panel on the right edge of the window, the passkey ceremony runs in that panel, and the page
ends with **CLI Login Complete — You can return to your terminal.** The credentials are saved to
`.descix/wallet.json` in your workspace root. A first-time account is created by the same
ceremony; there is no separate sign-up.

**The passkey trap:** `descix login` signs in with whichever passkey the browser offers first.
If the account is wrong, run `descix logout`, then `descix login` again and pick the right
passkey in the browser's chooser.

**Verify** — the first line and the `Email:` line are the gate, and re-check them in every new
shell before any command that changes anything:

```bash
npx -y -p @descix/cli@4.2.0 descix whoami
```

```
env: prod (.descix/workspace.json env.apiUrl) https://descix.net
```

followed by your User ID, Email, Wallet, `Session: Valid` and the hours remaining.
`descix doctor` runs the full environment check and ends with
`✨ All checks passed! Your environment is ready.`

## 4. Connect the repository to its app

One repo, one app: the workspace is **single-app** (v3) and your repo's root IS its workspace
root. Run `app init` **from the repo root**, in a checkout that is not inside another workspace
(see **Repository hygiene** below).

### An app that already exists (the usual clone path)

```bash
npx -y -p @descix/cli@4.2.0 descix app init -a <app_id>
```

Omit `-c`: without it, `app init` initializes an app that already exists on the platform, and
the command is idempotent. Exactly what it touches:

- writes `.descix/workspace.json` `env.app` (appId, communityId, default kbId) — THE app this
  repo holds; a repo that already holds a different app is refused loudly;
- creates `site/`, `microservice/`, `assets/` — a no-op for any directory that already exists;
- writes `assets/system_instructions.md` and `assets/app_description.md` **only if absent** —
  existing files are never overwritten;
- copies **no** site scaffold into an existing `site/`;
- makes one idempotent call that guarantees the app's default knowledge base exists;
- agent-instruction files (`CLAUDE.md` and editor-rules files): a file that does not carry the
  CLI's own BOOTSTRAP marker is left alone.

If the repo did not previously have `assets/` or `microservice/` and you do not want the
placeholders, delete them and check `git status --short` is clean.

### A new app

```bash
npx -y -p @descix/cli@4.2.0 descix app init -a <name> -c <community>
```

With `-c`, `-a` is the app **name** and the platform composes the id as `<community>-<name>`
(`-s <short>` overrides the suffix; no hyphens in the short name). This creates the platform
record, writes `env.app`, scaffolds the three directories, and creates the default KB
(`--kb <name>`, default `General`). `descix app list` then shows the app, and
`descix purchases` shows everything you own.

### Repository hygiene

`.descix/workspace.json` carries repo facts (the app's id, community, site and service config)
and belongs IN git — every clone then serves the same app with no re-init. `.descix/wallet.json`
is your credential and `.descix/sync-state/` is machine-local; neither is ever committed, and
`.descix/wallet.json` is git-ignored in every repository where it exists. The manifests and
provenance files are deployable config and stay tracked.

- **Every checkout is a sibling, never nested.** A checkout inside another DeSciX workspace is
  not a supported layout. `app init` refuses to run there (`This directory is nested inside
  another DeSciX workspace.`); `init`, `set-site` and `serve` run there without refusing.
- **Never copy `.descix/workspace.json` or `.descix/wallet.json` into another checkout.** A
  copied workspace file is accepted silently: that directory becomes a second workspace for the
  same app id, it shadows any workspace above it for every command run inside it, and it
  bypasses the `app init` refusal. Give each checkout its own `app init` and `login`; to preview
  another directory's files, use §5.1.

```bash
cat >> .gitignore <<'EOF'
.descix/wallet.json
.descix/sync-state/
EOF
```

**Verify:** `git check-ignore -v .descix/wallet.json` prints the rule that ignores it
(`.gitignore:<line>:.descix/wallet.json` followed by the path) — no output means the wallet is
not ignored; `git check-ignore .descix/workspace.json` prints nothing and exits 1.

## 5. Run it locally: `descix serve`

First declare how your site is served. One write sets one mode, and each write clears the other
mode's fields:

```bash
npx -y -p @descix/cli@4.2.0 descix app set-site -a <app_id> --static site
```

```
✓ site config set for egpt-frqtl
  site is now:   {"static":"site"}
  site.port and site.protocol cleared (one active mode per write) — /p/egpt-frqtl/ now serves the static dir.
  Written to env.app.site in workspace.json; `descix serve` picks it up.
```

- `--static <dir>` serves a directory of built files from disk. `<dir>` is a path **relative to
  the workspace root** (the repo root), whichever directory you run `set-site` from; `../` is
  allowed and serves normally (§5.1). An absolute path is refused and nothing is written:
  `--static takes a path relative to the workspace root (the repo root), e.g. site or ../scratch; got "/abs/x" (it is absolute). Nothing was written for <app_id>.`
- `--port <n>` routes to a framework dev server (Vite, VitePress, Next) instead; `site.protocol`
  (`http` or `https`) names the scheme the gateway uses to reach it, for dev servers that insist
  on one. Set the framework's base path to `/p/<app_id>/` — the gateway does not rewrite paths.
- A configured route whose backend is not answering fails loud with a 502 that names the target,
  not a silent blank page.

Then, from the repo root or any directory below it:

```bash
npx -y -p @descix/cli@4.2.0 descix serve
```

`descix serve` walks up from the current directory to the nearest `.descix/workspace.json`, reads
its `env.app` — `site.static` / `site.port` / `site.protocol` — and serves THE app this repo
holds. From outside the checkout, name both the workspace and the app:
`descix serve -w <repo root> -a <app_id>`. With `-w` and no `-a`, serve exits 1 with
`[serve binding] cannot tell which app to serve from <current directory>` and lists the apps in
the workspace. The port resolves in order: `--port` flag,
then `env.gateway.port` in `workspace.json`, then the built-in default `5173`. Read the banner —
every line names its source:

```
  descix-serve — Unified Local Gateway

  Workspace: <your app repo>
  API:       https://descix.net   [workspace env.apiUrl]
  Shell:     https://descix.net   [same origin as API (workspace env.apiUrl)]
  Port:      5173   [env.gateway.port]
  App:       egpt-frqtl   [cwd]   mode: standalone
  Open:      https://localhost:5173/   → App Shell; reads /__descix/app-binding.json and boots egpt-frqtl standalone
  App route: https://localhost:5173/p/egpt-frqtl   → this app's route on the gateway (the URL the shell loads it from)
  First view: SplitView (shell default; the site declares no default_view)   [share.json: /home/you/egpt-frqtl/site/share.json]
```

**Open the root, `https://localhost:<Port>/`.** That is your app inside the App Shell with Powch
sign-in. `/p/<app_id>` — despite the banner printing it — is the bare iframe target the shell
loads, with no shell and no sign-in around it; it is not a second way to run your app, and it
exists only on your local gateway, never on the deployed platform.

Static serving is a **live, per-request disk read**: rebuild your bundle into the static
directory and refresh the browser — no gateway restart.

Passkey sign-in in the shell needs the gateway's certificate trusted:
`descix dev-certs check` exits 0 when it is (`Status: trusted`); if not, run
`descix dev-certs trust` once, then quit and reopen the browser. A `User cancelled` on sign-in
is this.

**Verify:**

```bash
curl -sk https://localhost:5173/__descix/app-binding.json
# {"mode":"standalone","appId":"egpt-frqtl","appUrl":"https://localhost:5173/p/egpt-frqtl","source":"cwd"}
curl -sk -o /dev/null -w "%{http_code}\n" https://localhost:5173/      # 200
```

and in the browser the root URL shows your app inside the shell. The banner's `Static sites:`
line prints the absolute directory the app route reads from.

### 5.1 Preview a scratch directory in the shell

To see files that live outside `site/` — a build output, a prototype, another branch's export —
inside the shell with sign-in, point THIS app's static route at them for the session, then put
the tracked config back. From the app's own checkout, with the scratch directory beside it:

```bash
npx -y -p @descix/cli@4.2.0 descix app set-site -a <app_id> --static ../<dir>
npx -y -p @descix/cli@4.2.0 descix serve
```

Open the root, `https://localhost:<Port>/`. Verify the route reads the scratch directory:

```bash
curl -sk https://localhost:<Port>/__descix/app-binding.json
# {"mode":"standalone","appId":"<app_id>","appUrl":"https://localhost:<Port>/p/<app_id>","source":"cwd"}
curl -sk https://localhost:<Port>/p/<app_id>/      # the scratch directory's index.html
```

and the banner's `Static sites:` line names the scratch directory. When you are done, stop the
gateway (Ctrl-C) and restore the tracked file — `git status --short` shows
` M .descix/workspace.json` until you do:

```bash
git checkout -- .descix/workspace.json
```

**Verify:** `git status --short` prints nothing for `.descix/`. Never commit the scratch path.

This is the only preview form. Not a preview: copying `workspace.json` or `wallet.json` into the
scratch directory or another checkout (§4, **Repository hygiene**), a second app id, or
`app init` run for the preview.

### 5.2 Views: NoChrome and browser full screen

Your app picks its layout in the shell with `DeSciX.view.set(mode)`. There are four views,
owned by `VIEW_MODES` in `@descix/app-sdk`: `CodeSite` (your app gets the whole frame, inside
the shell chrome), `SplitView` (your app beside chat, the default), `Chat` (chat only) and
`NoChrome`. `DeSciX.view.set('NoChrome')` is the chromeless phone view: the shell renders no
top bar, no padding and no chat, and your app fills the viewport inside the browser tab.
`NoChrome` needs `@descix/app-sdk` 0.3.4 or later; 0.3.3 throws on it. The view your app's face
paints first is declared in `share.json` `default_view` — see
[§7.3, Starting view](#_7-3-share-json-—-the-link-preview-card).

Browser full screen is a different thing: the browser's Fullscreen API, which the shell's app
iframe delegates (`allow="fullscreen"`). Your app calls `element.requestFullscreen()` from a
user tap, on top of any view. Android and desktop browsers support it; iPhone Safari does not,
and there `document.fullscreenEnabled` is `false`.

```js
DeSciX.view.set('NoChrome');
if (document.fullscreenEnabled) {
  fsButton.hidden = false;
  fsButton.onclick = () => document.documentElement.requestFullscreen();
}
```

`DeSciX.view.set()` returns the mode you asked for even when no shell is listening, so its return
value never tells you the layout moved. `requestView(mode, { fallback })` does: it finds the shell
that hosts your page at any frame depth, asks it for `mode` (or for `fallback` when the shell does
not offer `mode`), and returns `{ outcome, mode, requested, bridge, reason }`. `requestView` needs
`@descix/app-sdk` 0.5.0 or later.

From the npm module:

```js
import { requestView, VIEW_OUTCOMES } from '@descix/app-sdk';

const r = requestView('NoChrome', { fallback: 'CodeSite' });
if (r.outcome !== VIEW_OUTCOMES.REQUESTED) console.info(r.outcome, r.bridge, r.reason);
```

From the plain script, the `DeSciXAppSDK.js` that `descix site init` copies into your site:

```html
<script src="DeSciXAppSDK.js"></script>
<script>
  const r = DeSciX.requestView('NoChrome', { fallback: 'CodeSite' });
  if (r.outcome !== DeSciX.VIEW_OUTCOMES.REQUESTED) console.info(r.outcome, r.bridge, r.reason);
</script>
```

`DeSciX.VIEW_MODES` and `DeSciX.VIEW_OUTCOMES` are the same lists the npm module exports.

| `outcome` | `mode` | What happened |
|---|---|---|
| `requested` | the asked mode | a listening shell set it |
| `fallback` | your fallback | the shell's `view.MODES` lacks the asked mode; it set your fallback |
| `unoffered` | `null` | nothing was set: no shell (`bridge: 'standalone'`); a framed page with no readable shell bus, a cross-origin shell included (`bridge: 'embedded-no-bridge'`); a shell with no view member or no listening host; or a shell that offers neither the mode nor the fallback |
| `view-no-modes` | `null` | you gave a fallback and the shell publishes no `view.MODES` to choose by |
| `set-threw` | `null` | the shell's `view.set()` threw; `reason` carries its message |

`requestView` never throws because of where your page runs. It throws for a mode or fallback that
is not one of the four views (`requestView('FullScreen')` is "not a view"), for a fallback equal
to the mode, and, with `err.code === 'VIEW_CONTRACT_VIOLATED'`, for a shell that breaks the view
contract.

**Verify** from the root, `https://localhost:<Port>/`, signed in: the shell's top bar and chat
are gone and your app fills the tab; a tap on the button takes the page full screen on Android
or desktop. Never verify views or full screen at `/p/<app_id>`: that frame has no shell, so
there is no chrome to drop.

## 6. Knowledge bases

Each KB is fed from **git**, by a manifest at `.descix/manifests/<kb_name>.json`. `path` is
relative to the repository root; `ref` is the git ref the sync walks (default `main`):

```json
{
  "kb_name": "General",
  "sync_mode": "local",
  "sources": [
    { "path": "kb/General", "ref": "main", "tier": 1, "doc_type": "documentation" }
  ]
}
```

Three rules that save you an afternoon:

- **Only committed files sync.** The sync takes each file's content at the manifest `ref`; a
  tracked file edited but not committed is silently treated as unchanged. Sync from a clean,
  pulled `main` (`git status --short` empty), or pass `--ref <branch>` for a branch.
- **A manifest for a KB the platform does not know is refused**, dry run included. The refusal
  names the fix on a `Fix: run` line: `descix kb create -a <app_id> --kb <kb_name>`.
- **`--dry-run` exits 1 when there is drift. That is normal before a sync** — read the `Drift:`
  line, it is the plan, not an error.

```bash
npx -y -p @descix/cli@4.2.0 descix kb corpus sync -a <app_id> -k General --dry-run
npx -y -p @descix/cli@4.2.0 descix kb corpus sync -a <app_id> -k General
npx -y -p @descix/cli@4.2.0 descix kb corpus status -a <app_id> -k General
```

The dry-run prints `[source-gate] PASS — all <n> file(s) tracked by git at their manifest ref.`
and the plan (`Would-upsert chunks: <n>`, `Would-delete refs: <n>`). The real sync upserts what
changed and purges what you deleted; a plain re-run is always safe. `descix kb list -a <app_id>`
shows every KB with its live vector count (`Source` column `live`).

**A second KB on an existing app** is created with `descix kb create`, which needs
`@descix/cli` 4.1.0 or later:

```bash
npx -y -p @descix/cli@4.2.0 descix kb create -a <app_id> --kb <kb_name> [--system-instructions <text>]
```

It needs the app's owner, or an app, community or platform admin. A KB that already exists is a
refusal (`KB_EXISTS`, exit 1), never a success; `descix kb list -a <app_id>` shows the app's KBs.
On success it prints the next step: add `.descix/manifests/<kb_name>.json`, then
`descix kb corpus sync -a <app_id> -k <kb_name>`.

`app init --kb` never creates a KB on an existing app. There, `--kb` names the existing KB this
repo syncs, and a name the app does not have is refused with the `descix kb create` command that
would make it. Only `app init -c`, which creates the app, creates its first KB.

**Verify** — an answer from your own documents, with the source pinned to the committed blob:

```bash
npx -y -p @descix/cli@4.2.0 descix chat -a <app_id> "<a question only your docs answer>"
git rev-parse main:kb/General/<file>
```

The reply's `📚 Sources:` line reads `<file> [ID: corpus:<sha>]`, and `<sha>` equals the
`git rev-parse` output. Measured on the reference app: the answer cited
`getting-started.md [ID: corpus:255bc8befe4c8b9ec83412931e4034705aa30b9d]`, equal to
`git rev-parse main:kb/General/getting-started.md`. (Chat draws on your AI-credit balance; `descix credits buy --usd <10|25|100|200>` prints a Stripe Checkout URL to top it up, and patronage from $20 is in the Powch Buy menu.)

## 7. The site bundle: allowlist, base path, share card

### 7.1 The site manifest is an allowlist

`.descix/manifests/site.json` names exactly what `descix site upload` ships:

```json
{
  "sources": [
    {
      "path": "site",
      "include": [
        "index.html",
        "share.json",
        "images/**",
        "app-assets/**"
      ]
    }
  ],
  "buildCommand": null
}
```

- **The only source is `site`.** Never `.` — that walks the whole repo, including `kb/` and
  `scripts/`, onto a public, unsigned, never-expiring URL.
- **A newly added file MUST be added to `include`, or the upload silently skips it.** This is
  the single most common "I deployed it but it is not there": you add `share.json` to `site/`,
  forget the manifest line, and the upload ships everything except it.
- An **empty** `include` matches everything under the source; once `include` is non-empty, it is
  the complete list.
- `exclude` is tested **before** `include`, and a bare directory name in `exclude` matches that
  name at **any depth** — so never exclude repo directories by bare name (`assets` would drop
  any `assets/` folder inside your bundle too).

### 7.2 Every URL in the bundle is page-relative

Deployed, the App Shell at `https://<app_id>.descix.net/` loads your site from its storage path,
`https://<app_id>.descix.net/prod/<app_id>/site/index.html`. Locally, `descix serve` serves the
same bundle under `/p/<app_id>/`. One hard-coded root-absolute base cannot serve both, so every
URL your build emits must be relative to the page: `./images/logo.png`, never `/images/logo.png`.
A root-absolute path renders the chrome and 404s the payload.

The shell forwards your site's query string and hash (open
`https://<app_id>.descix.net/?x=1#y` and your app receives `?x=1#y`) but not a path — put deep
state in the query or hash.

### 7.3 `share.json` — the link-preview card

An optional `share.json` at the top of your site bundle controls how links to your app's host
render in chat apps and social cards. The platform edge injects it into the served page's
`<head>`; when the file is absent, the app serves with the platform's generic head — absence
never breaks the app.

```json
{
  "title": "FRQTL — Impossible things, running",
  "description": "The physics engine that knows no physics equations: interference, gravity and atoms emerge from integer rules, live in your browser.",
  "icon": "images/share/favicon.ico",
  "og_image": "images/share/share-1200x630.png",
  "twitter_card": "summary_large_image",
  "apple_touch_icon": "images/share/icon-180.png"
}
```

| Field | Required | Value |
|---|---|---|
| `title` | yes | a non-empty string |
| `description` | yes | a non-empty string |
| `icon` | no | the favicon path; a non-empty string when present |
| `og_image` | no | the share image path; a non-empty string when present |
| `twitter_card` | no | a non-empty string when present; absent means `summary_large_image` |
| `apple_touch_icon` | no | the home-screen icon path; a non-empty string when present |
| `default_view` | no | the view your app starts in, exactly one of `CodeSite`, `SplitView`, `Chat`, `NoChrome` (case-sensitive); any other value is refused by name at upload from `@descix/cli` 4.2.0 |

The top level must be a JSON object. Values are trimmed, so a value of only spaces is empty. Keys
outside the table are ignored. Neither the CLI nor the edge checks a length, an image size or a
path shape; card renderers show a 1200×630 `og_image` best.

**Starting view.** `default_view` needs `@descix/app-sdk` 0.6.0 / `@descix/cli` 4.2.0 or later.
On your app's own face, `https://<app_id>.descix.net/`, the shell paints that view first, with no
`SplitView` frame before it; when the field is absent the shell starts in `SplitView`. Your app
can still change the view at any time with `requestView` or `DeSciX.view.set` (§5.2).

```json
{ "title": "My App", "description": "What my app does.", "default_view": "CodeSite" }
```

A wrong value refuses the upload like any other field:
`share.json: default_view 'FullScreen' is not a view; one of CodeSite, SplitView, Chat, NoChrome`.

Check it after upload: the edge copies the field into the app binding as `defaultView`, so
`curl -s https://<app_id>.descix.net/__descix/app-binding.json` ends in
`"source":"edge","defaultView":"CodeSite"}`. The edge caches `share.json` for up to
**300 seconds**, so a new or changed value can take 5 minutes to appear. No `defaultView` key
means the edge read no valid `share.json` (absent, or invalid: the edge never refuses; it serves
the binding without `defaultView` and the platform's generic head) and the shell starts in
`SplitView`.

Scope: the face only. An app opened from the store at `https://descix.net` starts in `SplitView`
whatever its `share.json` says. Under `descix serve` a static site's `share.json` is read into the
local binding the same way, and an invalid file stops the serve with the upload's field-named
error; a site served by its own dev server (`site.port`) carries no default view. The banner's
`First view:` line says which applied; for a dev-server site on port 5180 it reads
`First view: SplitView (shell default; the site declares no default_view)   [share.json: not read: /p/egpt-frqtl is a dev server (site.port 5180); the gateway reads share.json only from a static site]`.

All paths are **bundle-relative** (resolved against your site's storage path). Add `share.json`
**and** its image paths to the `site.json` `include` list, or they do not deploy.

**The upload gate.** From `@descix/cli` 4.1.0, `descix site upload` checks a `share.json` at the
top of the upload set against this table before it asks for a deploy token, so `--dry-run`
refuses too. A file that fails refuses the whole upload, nothing is uploaded, and the command
exits 1, naming the file and the field:

```
  Upload failed: site upload REFUSED: /home/you/my-app/site/share.json does not meet the share.json contract (@descix/app-sdk/share):
  share.json: icon must be a string; got a number
Nothing was uploaded. Fix share.json, or leave it out of the site, then upload again.
```

A missing required field reads `share.json: title is required (a non-empty string)`; a present
optional field that is empty reads `share.json: og_image is empty; it must be a non-empty string`.

**Build tooling imports the contract.** `@descix/app-sdk/share` (app-sdk 0.5.0) exports
`SHARE_CONTRACT` (the field table above), `parseShareJson(text)`, `validateShareJson(obj)` and
`SHARE_JSON_FILE`. Both functions return the full bag (absent optional fields `null`,
`twitter_card` defaulted) or throw the same field-named error the upload prints. A theme or
generator that writes `share.json` imports them instead of restating these rules.

**Timing on a first upload:** a missing `share.json` is cached at the edge for **300 seconds**.
If the first request to your host arrived before your first upload of the file, links keep the
generic head for up to 5 minutes — wait it out; nothing is wrong.

**Verify locally:** `curl -sk https://localhost:<Port>/p/<app_id>/share.json` returns your JSON.

## 8. Deploy the site

Always dry-run first and read both lists:

```bash
npx -y -p @descix/cli@4.2.0 descix site upload -a <app_id> --dry-run
```

```
env: prod (.descix/workspace.json env.apiUrl) https://descix.net
  Build env: base=/prod/egpt-frqtl/site/, gtm=GTM-5NT5X5WK


  Site Upload: egpt-frqtl → GCS

  Source: manifest (<your app repo>/.descix/manifests/site.json)
  Target: egpt/egpt-frqtl
  Git: main @ 4c2b1dd

  Found 790 files
```

The upload list is your whole allowlisted build; the **Would remove from the server** list is
every deployed file your build no longer contains — after the real upload, nothing outside your
build stays served. The dry run needs a login.

```bash
npx -y -p @descix/cli@4.2.0 descix site upload -a <app_id>
```

The receipt ends with `Site uploaded successfully!`, the file count, the removed paths, and
`Site URL:`. The deploy records your git branch and commit.

**Order guarantee:** every file of the new build is uploaded FIRST; removals happen only at the
confirm step after all uploads succeed, and if any upload fails the deploy is not confirmed and
nothing is removed from the server. So a build-stamped directory (`pub/<build>/…`) is fully
present before the previous build's directory is pruned — only same-path files (like
`index.html`) are overwritten in place during the upload window. Then:

```bash
npx -y -p @descix/cli@4.2.0 descix site status -c <community> -a <app_id>
```

```
📊 Site Status: egpt/egpt-frqtl

  URL: /prod/egpt-frqtl/site/index.html
  Deployed: 2026-10-03T19:47:43.803Z
  By: pMMQNik5xfgC-gj-xmoQpQ1_AYY
  Git: main @ 4c2b1dd
  Files: 790
```

`Git:` is your rollback target — check the sha belongs to this repo
(`git cat-file -e <sha>^{commit}` exits 0). Rollback is `git checkout <sha> -- site`, dry-run,
upload, then restore your branch's `site/`.

**Verify — served equals built.** A curl of the host root returns shell HTML for any host, even
a nonexistent app, so it proves nothing. Hash a served file against your local build instead:

```bash
shasum -a 256 site/index.html
curl -fsS https://<app_id>.descix.net/prod/<app_id>/site/index.html | shasum -a 256
```

The hash covers the plain `curl` request above (curl's default `Accept: */*`), or the stored
object at `https://storage.googleapis.com/descix-assets-public/prod/<app_id>/site/index.html`.
An HTML fetch with a browser `Accept: text/html` header returns the page plus one injected
`<script … static.cloudflareinsights.com/beacon.min.js …>` before `</body>` — never hash that
response raw.

The two hashes are equal. Then open
`https://<app_id>.descix.net/` in a browser — that URL is the app; the `/prod/...` path is only
its storage — and exercise its main function.

### 8.1 How your files are cached — what the browser actually gets

Every uploaded file gets a cache policy from its NAME, bound at upload time, and the edge
passes it through to the browser unchanged (measured per class on the live host):

| File class | Cache-Control (bound at upload, served verbatim) | What a browser holds it for |
|---|---|---|
| `*.html` — by extension, at any depth (`index.html`, `pub/experiments/<id>/index.html`, …) | `no-cache, no-store, must-revalidate` | never cached — every visit refetches |
| Content-hashed assets (`name-<hash>.js/css/...`, hash ≥ 8 chars — what Vite emits) | `public, max-age=31536000, immutable` | forever — a new build emits new names, nothing to bust |
| Everything else (non-hashed `.js`, `favicon.ico`, `manifest.webmanifest`, JSON, …) | `public, max-age=300, must-revalidate` | up to **5 minutes** stale |

Design for the third row:

- **Content-hash the WHOLE module graph.** A hashed file is immutable AND atomic per release —
  a browser can never mix two builds, because every URL changes. Bundlers (Vite) do this for
  you.
- **A `?v=<build>` stamp on your entry URLs is NOT enough** for an ES-module or import-map
  graph: the stamp busts only the files you stamp, and a module's own *relative imports* carry
  no stamp — so mid-release, a fresh entry can still import a stale dependency. If you
  cannot hash filenames, put the build id in a **directory** (`pub/<build>/...`): relative
  imports inside the tree keep working, and every URL in the graph changes together.

Headers are per-object and set at upload, so re-uploading refreshes the stored policy — but the
browser TTL you must design for is the edge's, above.

## 9. List it, and discover the rest

Your app exists and is yours the moment `app init` returns, but it is **unlisted**: visible to
you, invisible in the store. The owner lists it:

```bash
npx -y -p @descix/cli@4.2.0 descix app set-listed on -c <community> -a <app_id>
```

The receipt prints `listed: true` read back from the server. The store is rebuilt from a bundle
cached for five minutes, so the change appears within five minutes, not instantly. Your app
shows in the store only if its community is listed too — a platform act; ask if it is not.

For everything this page does not cover — backend commands, payments, model tuning, anything —
ask the platform itself:

```bash
npx -y -p @descix/cli@4.2.0 descix tell-me-how "how do I deploy my site"
```

It answers with the callable tools for your entitlements and their usage. That verb, plus this
page, is the whole handbook; when neither answers, apply the wall rule at the top of this page.

## 10. The whole path in eleven commands

```bash
cd <your app repo>                                                      # a git repo
npx -y -p @descix/cli@4.2.0 descix config init --env prod              # 1  pin the workspace
npx -y -p @descix/cli@4.2.0 descix login                               # 2  device code → browser → Powch passkey
npx -y -p @descix/cli@4.2.0 descix whoami                              # 3  gate: env line + Email
npx -y -p @descix/cli@4.2.0 descix app init -a <app_id>                # 4  this repo IS the app (add -c <community> to create)
npx -y -p @descix/cli@4.2.0 descix app set-site -a <app_id> --static site  # 5  one mode per write
npx -y -p @descix/cli@4.2.0 descix serve                               # 6  open https://localhost:<Port>/ — the ROOT (scratch dir: §5.1)
npx -y -p @descix/cli@4.2.0 descix kb corpus sync -a <app_id>          # 7  committed files → index (dry-run first)
npx -y -p @descix/cli@4.2.0 descix chat -a <app_id> "<your question>"  # 8  an answer citing corpus:<blob sha>
npx -y -p @descix/cli@4.2.0 descix site upload -a <app_id> --dry-run   # 9  read both lists
npx -y -p @descix/cli@4.2.0 descix site upload -a <app_id>             # 10 then: served==built hash check
npx -y -p @descix/cli@4.2.0 descix app set-listed on -c <community> -a <app_id>  # 11 in the store within 5 min
```
