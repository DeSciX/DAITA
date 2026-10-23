# Powch, the app shell and app routing: the frame model, as built

Measured 2026-10-22 against Core `ee8fb78`, Cloud `1a4a865`, Powch `fc17403` (docs-only `2917aae` after it), the
edge router at Unkamon `52926db`, and the bytes PROD and DEV served that day. Every tree below was read in the code
and confirmed in the served bundles; what was read but not run says so. This document is the one owner of the
frame model. `powch-origin-isolation.md` owns the origin and rpID rules it builds on; the verification runbook
(`../development/powch-sample-verification-runbook.md`) owns how to run the matrix in §6.

## 1. The rule in one paragraph

There is one app shell document per origin and it is never nested. The shell at `descix.net` is the store; the
same shell bundle served at `<appid>.descix.net` is the app's own instance, a sibling of the store, not its child.
Whichever shell is the top document renders the top bar, the chat widget, the code-site frame and the Powch
sidebar itself. The app's site is framed **same-origin** with that shell (the store frames it at
`descix.net/prod/<appid>/site/`, the app host at `<appid>.descix.net/prod/<appid>/site/`), so the shell and the app
talk by direct JavaScript, not by messages. Powch is framed **cross-origin** at `powch.<env>.descix.net`, always at
depth 1 under the shell, and talks only by `postMessage` pinned to origins. Nothing inside the app frame runs a
second shell.

## 2. The four frame trees

"app-sdk" is the `@descix/app-sdk` package source (`src/`); "site" is the platform shell's `site/src/`; Powch paths are in the Powch repository.

### Case 1. `https://descix.net/` with an app opened from the store

```
[top]  https://descix.net/                       the shell (store boot: /__descix/app-binding.json → 404, appBinding.js:7,95)
  │    renders TopNavBar (site App.jsx:119), AppWidget → AppSurfaceWidget → CodeSiteWidget (App.jsx:139),
  │    ChatWidget IN THIS DOCUMENT (CodeSiteWidget.jsx:369-391; AppSurfaceWidget.jsx:40),
  │    PowchSideBarWidget (App.jsx:166), the window.DeSciX bus (AppContext.jsx:587; hooks/useDeSciXBridge.js:32)
  ├─ iframe "Code Site"   src https://descix.net/prod/egpt-frqtl/site/index.html      SAME ORIGIN as top
  │    (AppData.getProductUrl resolves the record's PATH on the current origin: AppData.jsx:64-70; productUrl.js:86-103;
  │     sandbox "allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-same-origin", allow="fullscreen":
  │     CodeSiteWidget.jsx:309,333-344)
  │    the app's static site + DeSciXAppSDK.js. No AppShell, no TopNavBar, no ChatWidget, no Powch (served egpt-frqtl bundle: 0 hits).
  └─ iframe #powch-standalone-iframe   src https://powch.descix.net/                 CROSS ORIGIN (same site)
       allow="publickey-credentials-get *; publickey-credentials-create *", no sandbox (app-sdk components/PowchSideBarWidget.jsx:85-92)
       Powch's own <AppShell appId="powch" standalone> → PowchAppProvider → PowchStandaloneApp (Powch `site/src/main.jsx:28-33`)
```

Platform apps (`daita`, `powch`) are not framed from the store: CodeSiteWidget shows a card instead
(CodeSiteWidget.jsx:31,121,283-300). An app page that asks for the `CodeSite` view turns the chat off for that
page (`enableChat:false`, site components/appSurfaceLayout.js:33-34).

### Case 2. `https://egpt-frqtl.descix.net/` opened directly

```
[top]  https://egpt-frqtl.descix.net/            the SAME shell bundle, served at the app host's root by the edge
  │    (infra/edge-router/src/edge-router.js:479-497; title from the app's share.json :423-432)
  │    /__descix/app-binding.json → 200, built by the edge (:405-421):
  │      {"mode":"standalone","appId":"egpt-frqtl","appUrl":"https://egpt-frqtl.descix.net/prod/egpt-frqtl/site/index.html","source":"edge"}
  │    boot STANDALONE_APP (app-sdk util/SdkInitializer.jsx:247-252,281-299); renders TopNavBar, AppSurfaceWidget → CodeSiteWidget
  │    (App.jsx:128-133), ChatWidget in this document, PowchSideBarWidget (App.jsx:166), the bus
  ├─ iframe   src https://egpt-frqtl.descix.net/prod/egpt-frqtl/site/index.html      SAME ORIGIN as top (bytes identical to Case 1's frame)
  └─ iframe   src https://powch.descix.net/                                           CROSS ORIGIN (same site), the same Powch document
```

This is a second instance of the shell at a second origin. It sits beside `descix.net`; nothing in it frames
`descix.net`, and nothing in `descix.net` frames it.

### Case 3. `https://powch.descix.net/` top-level, and as the sidebar

```
[top]  https://powch.descix.net/                 Powch's bundle (the edge exempts powch from the shell: edge-router.js:65,297-301)
       no binding probe (SdkInitializer.jsx:247-248); AppShell appId="powch": no PowchBridgeProvider, no sidebar (AppShell.jsx:59,65,97-99)
       the only document that calls navigator.credentials.create / get (served Powch bundle: create ×1, get ×2; shell bundle: 0)
```

As the sidebar in Cases 1, 2 and 4 it is this same document at depth 1, cross-origin with its parent. It initialises
once its own `window.DeSciX` exists (shellInitGate.js:23-28; PowchAppProvider.jsx:404-406).

### Case 4. `descix serve` (read in the code; not run for this measurement)

```
[top]  https://localhost:<port>/                 '/' proxied to the DEPLOYED shell (app-sdk dev/gateway.js:83-90);
  │    siteUrl = apiUrl when the API is remote (dev/resolveGatewayTargets.js:176-179): https://descix.net on an app-lane
  │    workspace, https://dev.descix.net on the Unkamon gateway workspace; the binding comes from the gateway (gateway.js:200;
  │    serveBinding.js:174-179); the tree is Case 2's
  ├─ iframe   src https://localhost:<port>/p/<appId>      SAME ORIGIN; the app's site/ served by the gateway (workspaceProducts.js:33-45)
  └─ iframe   src the Powch URL BAKED INTO the deployed shell bundle                 CROSS ORIGIN and CROSS SITE (localhost vs *.descix.net)
       the gateway's __POWCH_APP_URL__ define never reaches a proxied bundle (gateway.js:44-46), so env.powchUrl has no effect here;
       the DEV bundle carries https://powch.dev.descix.net/, the PROD bundle https://powch.descix.net/ (measured)
```

`<port>` is `env.gateway.port` (5599 in Unkamon) or the built-in 5173 on an app-lane workspace.

## 3. The origin map

| Document | Origin | Same-origin with | Renders | Talks to |
|---|---|---|---|---|
| The store shell | `descix.net` | its app frame | top bar, chat, code-site frame, Powch sidebar, the bus | the app frame by direct JS; Powch by postMessage |
| An app's shell instance | `<appid>.descix.net` | its app frame | the same | the same |
| The app frame | the shell's origin, path `/<env>/<appid>/site/` | the shell above it | the app's own site only | the shell's `window.DeSciX` found by walking parent windows; the shell reaches in with `contentWindow.DeSciX_Actions` (CodeSiteWidget.jsx:222-246) |
| Powch | `powch.<env>.descix.net` | nothing else | its own shell + the Powch app | the requesting window only, pinned to its origin |
| The local gateway | `localhost:<port>` | its app frame | Case 2's tree | Powch cross-site |

No origin sends CSP, X-Frame-Options or Permissions-Policy headers (measured 2026-10-22): anything can frame Powch;
what Powch RELEASES is governed by its own origin pin and consent, not by who frames it.

## 4. The boundaries and what crosses them

- **Shell ↔ app frame (same origin): no messages.** The bus publishes `powch`, `config`, `view`, `chat`, `AppData`,
  `call` and `loginWithSessionToken` (useDeSciXBridge.js:32-58; AppContext.jsx:587-616). The only `postMessage`
  calls in app-sdk are the two Powch bridges (PowchBridgeClient.js:216, PowchClient.js:244).
- **Shell → Powch.** `PowchBridgeClient` posts to `new URL(bridgeUrl).origin` (PowchBridgeClient.js:27-28,216-219)
  and drops inbound messages from any other origin (:119); some types also require `event.source === iframe`
  (:166-167). Requests queue until Powch announces `POWCH_READY` (Core#28).
- **Powch → host (Powch#14).** Every reply goes to the window that sent the request, addressed to that request's
  browser-stamped origin, never `'*'` (hostChannel.js:24-43; PowchAppProvider.jsx:263-295,507-519). Only
  `POWCH_READY` and `POWCH_UI_CLOSE` go to the parent with `'*'` and no payload (hostChannel.js:50-56). Inbound
  requests from any origin are accepted subject to the allowed-command list, the visibility check and a non-opaque
  origin (PowchAppProvider.jsx:770-811); consent is keyed to the browser-stamped origin (:813-816). First-party
  continuity (Powch#15) asks the Powch microservice whether that origin is under the env's `SITE_DOMAIN`
  (`powch_first_party_host`) and, if so, shares the saved session on one click.
- **App frame → Powch with no shell bridge (depth 2).** `PowchClient` walks the frame chain for the shell's bus and
  delegates to it (PowchClient.js:61-63); only when none exists does it build its own Powch iframe inside the app
  frame (PowchClient.js:64-70,78-82). In Cases 1, 2 and 4 that path is not taken. The standalone-host sample
  (DeSciX/POWCH `docs/samples/standalone-react`) is that path at depth 1 on a third-party origin.
- **Site Pass and consent are per host origin** (`powch-origin-isolation.md` §3): the same user on `descix.net`,
  `egpt-frqtl.descix.net` and `localhost:5599` is three hosts to Powch.

## 5. WebAuthn by document and engine

Every `navigator.credentials` call is inside Powch's document; none in the shell or app-sdk (0 hits in source and
served bundles). The rpID is the Powch host of the request's Origin (the Powch microservice's `powchOrigin.js:23-66`).

| Engine | `get()` (sign in) in the Powch sidebar frame | `create()` (new account) in the frame | Powch top-level (Case 3) |
|---|---|---|---|
| Chromium (Chrome, Edge, Android) | allowed: the frame holds `publickey-credentials-get` | allowed under `publickey-credentials-create` with a user activation (Chromium authentication_credentials_container.cc:1982-1995) | allowed |
| WebKit (Safari; every browser on iOS and iPadOS) | allowed since WebKit 248192@main (2022-03-08) | **refused** for any document not same-origin with ALL its ancestors, before any policy is read: WebCore AuthenticatorCoordinator.cpp:171-172 "The origin of the document is not the same as its ancestors"; WebKit's policy parser has no `publickey-credentials-create` token (PermissionsPolicy.cpp:132,189) | allowed (measured by the CEO 2026-10-22 on powch.dev.descix.net and powch.descix.net) |

Consequences: on iOS a new account can only be created in a document whose ancestors are all `powch.<env>.descix.net`,
i.e. Powch as the top window of a tab or a popup; the shell cannot do it for Powch because the rpID belongs to the
Powch host. Sign-in, the share click and every other Powch flow work inside the frame on both engines. This has been
so since Powch moved to its own host (Cloud `46efa80`, 2026-03-15); Powch#10 made the refusal visible
(Unkamon#59, DeSciXPowch#22, the decision row Unkamon#76).

## 6. Modes and configuration

| Mode | Who | Shell document | API | Powch document | rpID | Set by |
|---|---|---|---|---|---|---|
| **A. App lane, PROD** | an outside developer; the tester `powch-sdktest` | `descix serve`: the deployed PROD shell proxied at `https://localhost:5173/`; deployed: `<appid>.descix.net` | PROD (`env.apiUrl` from `descix config init --env prod`) | deployed `powch.descix.net` | `powch.descix.net` | published `@descix/cli` + `@descix/app-sdk`; `.descix/workspace.json` written by the CLI only |
| **B. Platform DEV via serve** | a platform developer | the deployed DEV shell proxied at `https://localhost:5599/` | DEV (`env.apiUrl`) | deployed `powch.dev.descix.net` (`env.powchUrl` is ignored: §2 Case 4) | `powch.dev.descix.net` | Unkamon gateway workspace: `env.gateway.{shell,appRepos,port}`, `config set-env`, `set-dev-certs` |
| **C. Platform fully local** | a platform developer | the local shell dev server `:5174` + the gateway `:5599` | local Cloud `:4000` via `descix --api-url https://localhost:4000 serve` (the flag before `serve`; no verb persists a local URL with environment DEV) | local Powch site `:5175` + microservice `:3003` | `localhost` | `local-platform-dev-mode-runbook.md`; `env.powchUrl` = `https://localhost:5175` takes effect only here (the shell is local); `GOOGLE_CLOUD_PROJECT` on both microservices; `descix dev-certs check` |
| **D. Tunnel (a phone against C)** | a platform developer + a phone | `https://dev-local.descix.net/` → gateway `:5599` | local or DEV | `https://powch-local.descix.net/` → `:5175` | `powch-local.descix.net` | the `descix-local` tunnel ingress; the edge Worker must not claim those two hosts (route exclusions) and `powch-local` needs its DNS route (Unkamon#75); `env.powchUrl = https://powch-local.descix.net` |

Facts that decide a mode: WebAuthn needs a secure context and an rpID that is a registrable domain, never an IP; the
dev certificates cover `localhost`, `127.0.0.1` and `::1` only; a phone therefore reaches a local Powch only by a real
hostname with a trusted certificate (D). Mode C is runnable only once the two site dev servers read the v3 workspace
(DeSciXCloud#83, DeSciXPowch#21). Hand-editing `workspace.json` is not a mode: every field above has a CLI verb, and
the one missing verb (a persisted local `apiUrl`) is the `--api-url` flag until `descix config set-api-url` exists.

## 7. The verification matrix

The sample is the tester app `powch-sdktest` (DeSciX/powch-sdktest; one screen per flow, PASS/FAIL on screen, a
copyable report; its phone checklist is the three taps no session can do). A cell is verified only when the flow
PASSES on that row and engine, and FAILS when its negative control is applied.

| Flow | What it proves | Desktop Chromium | Desktop Safari | iPhone/iPad (WebKit) |
|---|---|---|---|---|
| Sign in (session-only request) | `get()` in the frame; the host receives the session only; the top bar shows the account from `validate_session.account` | Playwright, CDP virtual authenticator | Playwright WebKit project (to add) | the phone |
| New account | `create()`; ToS registers email + wallet (#18); the reason on screen on failure | Playwright | manual (expected: refused in the frame, allowed top-level) | the phone: refused in the frame, allowed top-level; after Unkamon#76 the top-level step |
| Share consent / continuity | first-party: one click, no tap; other origins: the tap; nothing to a bystander frame | Playwright across two first-party origins | manual | the phone |
| Device login (`descix login`) | the `/device` intent survives sign-in; `device_complete {user_code, tos_accepted}`; `whoami` shows the account | Playwright + the CLI | manual | the phone + a desktop CLI |
| MCP connect | the `/connect` intent | Playwright | manual | the phone |
| Chat | a chat turn through the SDK on the app's KB | Playwright | manual | the phone |
| Wallet signature | one tap signs | Playwright (virtual authenticator) | manual | the phone |
| Offer link | the `/offer` intent resumes once | Playwright (after the Core release carries it) | manual | the phone |
| Full-screen | NoChrome view | Playwright | manual | the phone |

Rows run per mode: A (PROD, the published packages: the gate before any Powch change is called done), B (DEV, before a
PROD deploy), C (local, before a merge of a Powch, shell or sign-in change), D (the phone against C). The runbook
names the exact commands, the negative controls and the evidence to keep for each cell.

## 8. Where the other documents stand

This document supersedes the frame descriptions in `app-shell-and-sdk.md` (`env.platform.*`, `StandAloneAppWidget`,
"the shell loads the Powch iframe from env.powchUrl"), `static-site-serving.md:20,129-131` (the store under serve),
`split-stack-production-architecture.md:46` (an app subdomain's root serves the shell, not the site),
`platform-basics.md:53` (`/p/` exists only on the local gateway), `cloudflare-edge-routing.md` (the shell at an app
host's root, the edge-built binding, `SHELL_EXEMPT_APPS`), and the Powch docs `detailed/app-shell-enclosure.md`
and `developer-guide.md:136-157` (standalone is declared in Powch's own code; shellInitGate keys on `window.DeSciX`).
Those lines are corrected or deleted in their own files; this one is not annotated.
