# Powch sample verification runbook: desktop and mobile, by mode

This runbook runs and checks the Powch sample on desktop and on an iPhone, mode by mode. The
sample is the tester app `powch-sdktest`. The frame tree, the origin map, the modes and the WebAuthn
rules behind every expected result are in [the Powch frame model](../architecture/powch-frame-model.md).
This page covers how to run each cell, what the screen must say, and what has been measured.

It answers the CEO's request of 2026-10-22, verbatim: "A run book of how how to run and verify the
sample on desktop and mobile with a matrix of enviornments and configurations is necessary." (record
`org/records/decisions/2026-10-22-ceo-words-frame-model-and-verification-matrix.md` in eabadir/Unkamon).

Measured 2026-10-22. The deployed bundles at that time:

| Surface | Entry served | What it carries |
|---|---|---|
| PROD Powch `https://powch.descix.net/` | `assets/index-VtHiTgLI.js` | no New-account popup: `CREATE_AT_TOP_LEVEL` 0 hits |
| DEV Powch `https://powch.dev.descix.net/` | `assets/index-BcC9gy3g.js` (Powch main `9e54ffe`, Powch#25 + #26) | the popup: `CREATE_AT_TOP_LEVEL` 2, `TOP_LEVEL_CREATED` 2 |
| PROD shell `https://descix.net/` | `/prod/daita/site/assets/index-DYfZ2w4B.js` | sidebar `https://powch.descix.net/` |
| DEV shell `https://dev.descix.net/` | `/dev/daita/site/assets/index-BjkI9I4w.js` | sidebar `https://powch.dev.descix.net/` |

The PROD Powch upload of the popup build is sub-act `powch-site-prod` of eabadir/Unkamon#80. Until
then, New account on PROD behaves as the PROD rows below say. Before a run, check which build is
served: the popup build answers a non-zero count.

```bash
E=$(curl -s -H 'Accept: text/html' https://powch.descix.net/ | grep -o 'assets/index-[A-Za-z0-9_-]*\.js' | head -1)
curl -s "https://powch.descix.net/prod/powch/site/$E" | grep -c CREATE_AT_TOP_LEVEL
```

## 1. The sample

`powch-sdktest` is an app of the `powch` community, built only on the published `@descix/app-sdk`
0.6.0 and `@descix/cli` 4.2.0. Its source is the public repository `DeSciX/powch-sdktest`. Its README
lists each screen and its PASS rule, and `app/lib/flows.js` is the one owner of what each screen tests.
Each flow has its own screen with one button, a visible PASS or FAIL, the reason for a FAIL and the raw
evidence (tokens redacted). The screens:

- Sign-in (session only, no fields)
- New account
- Share consent
- Device login
- MCP connect
- Chat
- Wallet signature
- the /offer pending intent (not in app-sdk 0.6.0; no button)
- Full-screen mode
- Engine probe
- Phone checklist
- Report

The **Report** screen gives the copyable text report: every flow's result, timestamps, the page, the
host mode and the user agent. Keep it as the evidence for every manual cell.

The tester's header names its host mode. Measured in Playwright Chromium and WebKit:

| URL | Top document | Frames at load | Tester header |
|---|---|---|---|
| `https://powch-sdktest.descix.net/` | the shell (top bar "DeSciX - Limited Preview Release", "SIGN IN") | Powch `https://powch.descix.net/`, depth 1; the tester `https://powch-sdktest.descix.net/prod/powch-sdktest/site/index.html`, depth 1, same origin | `@descix/app-sdk 0.6.0 · host: shell` |
| `https://localhost:5173/` under `descix serve` (or the `-p` port) | the shell, as above | Powch (the deployed one for the API origin), depth 1; the tester `https://localhost:5173/p/powch-sdktest/`, depth 1 | `host: shell` |
| `https://descix.net/prod/powch-sdktest/site/` | the tester itself, no shell | none at load | `host: standalone` |

`https://descix.net/prod/powch-sdktest/site/` is the bare site, top-level. It is the standalone-host
path of the frame model (§4): `PowchClient` mounts its own Powch frame when a flow first asks for it.
It is not a shell surface, so device login, chat, MCP connect and full screen fail there and name the
reason. The store case (frame model §2 Case 1) is reached by opening `https://descix.net/` and
opening the app from the store. It has not yet been measured for the tester.

Never test at `/p/powch-sdktest` opened top-level. That bare frame has no shell, so sign-in, chat and
full screen all fail there by design.

## 2. Run each mode

### A. App lane, PROD

From a checkout of the tester, with the CLI pinned. Never export `DESCIX_API_URL`.

```bash
npm ci && npm test && npm run build      # npm test: 7 files, 94 tests passed (2026-10-22)
npx -y -p @descix/cli@4.2.0 descix dev-certs check   # exit 0, Status: trusted
npx -y -p @descix/cli@4.2.0 descix serve             # -p 5611 picks another port
```

Banner, measured with `-p 5611`:

```
API:       https://descix.net   [workspace env.apiUrl]
Shell:     https://descix.net   [same origin as API (workspace env.apiUrl)]
App:       powch-sdktest   [cwd]   mode: standalone
Open:      https://localhost:5611/   → App Shell; reads /__descix/app-binding.json and boots powch-sdktest standalone
```

Open the `Open:` URL; with no `-p` it is `https://localhost:5173/`. The deployed surfaces of mode A
are `https://powch-sdktest.descix.net/` (the app host) and `https://descix.net/` (the store). On
`https://powch-sdktest.descix.net/__descix/app-binding.json` the edge answers
`{"mode":"standalone","appId":"powch-sdktest","appUrl":"https://powch-sdktest.descix.net/prod/powch-sdktest/site/index.html","source":"edge","defaultView":"CodeSite"}`.

rpID: `powch.descix.net` on every mode-A surface, including `localhost`. A passkey made on PROD works
on all of them.

### B. Platform DEV

Two surfaces run the DEV Powch build:

- **B-serve.** The tester served against the DEV API, from the tester checkout. The flag goes before
  `serve`, and the workspace file is not changed:

  ```bash
  npx -y -p @descix/cli@4.2.0 descix --api-url https://dev.descix.net serve -p 5612
  ```

  Measured banner: `API: https://dev.descix.net [CLI --api-url/--env (DESCIX_API_URL)]`,
  `Shell: https://dev.descix.net`. Open `https://localhost:5612/`: the DEV shell, with Powch
  `https://powch.dev.descix.net/` at depth 1 and the tester `https://localhost:5612/p/powch-sdktest/`
  at depth 1, header `host: shell`. `powch-sdktest` is registered on PROD only, so app-scoped calls
  (Chat, Device login) on this surface have not yet been measured.

  The Unkamon gateway on `:5599` serves only the repos in `env.gateway.appRepos`, and the tester is
  not among them. Listing it there would take `descix config gateway add-repo ../powch-sdktest`. That
  path has not yet been measured.
- **B-store.** `https://dev.descix.net/`: the DEV store with the Powch sidebar. eabadir/Unkamon#80 and
  #84 ran their Playwright matrices and the CEO's DEV run on this surface. DEV app hosts have no edge
  certificate, so DEV has no app-host surface.

rpID: `powch.dev.descix.net`. A DEV passkey is not a PROD passkey.

### C. Fully local

This mode is BROKEN on 2026-10-22. Both site dev servers throw at Vite config load on retired
workspace keys, until DeSciXPowch#21 and DeSciXCloud#83 merge. Those merges are item 1 of the
local verification program, eabadir/Unkamon#83. Once they merge, the commands are those of the
platform local dev mode runbook (`development/local-platform-dev-mode-runbook.md`, internal) §1: Cloud `:4000`, Powch
microservice `:3003`, shell `:5174`, Powch site `:5175`, and the gateway started as
`descix --api-url https://localhost:4000 serve`. The shell is then `https://localhost:5599/` (an app)
and `https://localhost:5174/` (the store), Powch is `https://localhost:5175/`, and the rpID is
`localhost`. `env.powchUrl` (`https://localhost:5175`) takes effect only in this mode. The dev
certificates cover `localhost`, `127.0.0.1` and `::1` only, so there is no iPhone column: a phone
uses mode D.

### D. Tunnel (a phone against C)

This mode is pending eabadir/Unkamon#83 (the Cloudflare rails formerly on #75, folded in). The
intended hosts are `https://dev-local.descix.net/`, which reaches the gateway `:5599`, and
`https://powch-local.descix.net/`, which reaches the local Powch `:5175`. The rpID would be
`powch-local.descix.net`. Measured 2026-10-22: `https://dev-local.descix.net/` answered 502, and
`https://powch-local.descix.net/` answered 200 with a page that is not the local Powch. The rails are
not in place.

## 3. The four steps every cell runs

Every surface starts the same way. Measured on A (`https://localhost:5611/`) and B-serve
(`https://localhost:5612/`) in Playwright Chromium and WebKit:

1. The top bar reads "DeSciX - Limited Preview Release" with "SIGN IN". Click **SIGN IN**.
2. The Powch sidebar shows "Powch 1Touch for DeSciX" and two buttons: "RETURNING USER" ("Sign in
   with existing Powch wallet") and "NEW USER" ("Create your Powch wallet").

The four steps:

- **Returning sign-in.** Click RETURNING USER, then approve the passkey prompt. PASS: the sidebar
  closes and the top bar shows the round avatar where "SIGN IN" was, with no error toast. On the
  tester, the **Sign-in (session only, no fields)** screen drives the same sidebar and shows PASS.
- **New account.** Click NEW USER. When Powch is framed, the popup build opens a top-level Powch
  window on every engine (Powch#26; frame model §5). The sidebar reads "Create your account on Powch
  / Your passkey and account are created in a Powch window. When it is done, that window closes and
  you are signed in here on localhost. / Finish creating your account in the Powch window. This
  panel continues when it is done. / OPEN THE POWCH WINDOW AGAIN / BACK". The text names the host:
  "localhost" under serve. The popup opens at
  `https://powch.dev.descix.net/` with the query `powch_create` (a fresh 32-hex-digit nonce),
  `powch_host=https%3A%2F%2Flocalhost%3A5612` and `powch_purpose=Sign+in+to+DeSciX`, and reads "Create your Powch account / Create your passkey here. When your account is ready, this
  window closes and you are signed in on localhost. / CREATE YOUR PASSKEY / CANCEL". Click CREATE YOUR
  PASSKEY and approve. PASS: the popup closes, and the sidebar and the shell sign in with no further
  tap and no reload. A new account is real: the ToS step needs a verified email you control
  (the platform's manual fresh-account run-through, Part B), and nothing is bought.
- **Share click.** This needs a Powch session already open: do a Returning sign-in on
  `https://descix.net/` first. Then open `https://powch-sdktest.descix.net/` in the same browser and
  click SIGN IN. The sidebar reads "powch-sdktest.descix.net is a DeSciX site and is asking to use
  your Powch sign-in. / You are already signed in to Powch, so no passkey is needed to share it.",
  with "Deny", "Share sign-in with powch-sdktest.descix.net" and "Unlock with passkey instead". The
  three strings are in both the PROD and DEV Powch bundles; the host name is the host's own. Click
  "Share sign-in with powch-sdktest.descix.net". PASS: no passkey prompt, and the avatar shows.
  One-click sharing is for first-party hosts only (frame model §4, `powch_first_party_host` under
  the env's `SITE_DOMAIN`). `localhost` is not first-party, so on a serve surface this step is a
  passkey tap, not the one-click approval.
- **Sign out.** Open the avatar menu and click **Logout** (the shell's user menu; present in the PROD
  and DEV shell bundles). PASS: the top bar shows "SIGN IN" again, and a Returning sign-in signs in
  again.

## 4. The matrix

Each cell is one of: the expected outcome, with the run that measured it; a measured result; or "not
yet measured", with the row that will measure it. "Playwright" means a read-only run: a guard aborts
`powch_register_finish`, SUBMIT_TOS and `powch_login_finish`, so no account is created. Playwright
WebKit has no authenticator, so a successful WebKit create() and a real passkey sign-in are measured
by a person only.

### A. PROD: `https://localhost:5173/` (serve), `https://powch-sdktest.descix.net/`, `https://descix.net/`

| Step | Desktop Chromium | Desktop Safari | iPhone |
|---|---|---|---|
| Returning sign-in | expected PASS (§3). Not yet measured on PROD; row eabadir/Unkamon#80 sub-act `ceo-prod-run`. Measured negative, Playwright, no authenticator, serve: "Sign-in did not complete / The passkey request did not complete. / NotSupportedError: Resident credentials or empty 'allowCredentials' lists are not supported at this time." | expected PASS. Not yet measured on PROD; #80 `ceo-prod-run`. Measured negative, Playwright WebKit, serve: "Sign-in did not complete / Your browser refused the passkey request. / NotAllowedError: The request is not allowed by the user agent or the platform in the current context…" | expected PASS. Not yet measured on PROD; #80 `ceo-prod-run` (the tester's Phone checklist item 1 at `https://powch-sdktest.descix.net/`) |
| New account, current PROD build | Chromium may create inside the frame (frame model §5). With an authenticator: not yet measured on PROD. Measured, Playwright, no authenticator, serve: "Create Your Wallet / Account creation did not complete / The passkey request did not complete. / NotSupportedError: Resident credentials or empty 'allowCredentials' lists are not supported at this time. / TRY AGAIN / SIGN IN …" | FAILS today, measured (Playwright WebKit, serve, PROD build): "Create Your Wallet / Account creation did not complete / Your browser refused the passkey request. / NotAllowedError: The origin of the document is not the same as its ancestors. / TRY AGAIN / SIGN IN INSTEAD / BACK". No popup | FAILS today the same way: the WebKit ancestor rule (frame model §5). Not re-measured on the phone on this build |
| New account, after `powch-site-prod` | expected: the popup (§3). Not yet measured; #80 `powch-site-prod`, then `ceo-prod-run` | same | same |
| Share click | expected PASS on `https://powch-sdktest.descix.net/` after a sign-in on `https://descix.net/`. Not yet measured; #80 `ceo-prod-run` | same | same |
| Sign out | expected PASS (§3). Not yet measured; #80 `ceo-prod-run` | same | same |

### B. DEV: `https://localhost:5612/` (B-serve), `https://dev.descix.net/` (B-store)

| Step | Desktop Chromium | Desktop Safari | iPhone |
|---|---|---|---|
| Returning sign-in | B-store: PASS by the CEO on the pre-#26 build `index-Bnm60V16.js`, 2026-10-22 ~18:05Z: "The login process worked on both mobile and desktop safari and desktop Chrome." (record eabadir/Unkamon@b74ae03). Current build `index-BcC9gy3g.js`: not yet measured; the CEO's second DEV run on #84. B-serve: not yet measured | same as Chromium | same as Chromium |
| New account | Popup, measured by Playwright with and without a CDP virtual authenticator: B-serve in this run, B-store on #84 (opens within 98–717 ms, and the frame makes no `navigator.credentials.create` call). Sidebar and popup texts as §3. Finishing (the popup closes and the sidebar and shell sign in, no reload): not yet measured; the CEO's second DEV run on #84 | Popup, measured by Playwright WebKit on B-serve and on B-store (#84). "Your browser refused the passkey request", "did not complete" and "This browser does not let" are absent before and during the popup. Finishing: not yet measured; #84 | expected the same as Safari. Not yet measured on the current build; #84 |
| New account, popup closed early | B-store, Playwright, measured (#84): "The Powch window closed before your account was created. / OPEN THE POWCH WINDOW AGAIN / BACK" | same, WebKit (#84) | not yet measured; #84 |
| Share click | not yet measured. B-serve gives the passkey tap (`localhost` is not first-party); B-store needs a second DEV host, and DEV app hosts have no edge certificate. No row yet | same | same |
| Sign out | expected PASS (§3). Not yet measured; #84 second DEV run | same | same |

### C. Fully local: `https://localhost:5599/`, store `https://localhost:5174/`, Powch `https://localhost:5175/`

| Step | Desktop Chromium | Desktop Safari | iPhone |
|---|---|---|---|
| All four | not yet measured. The mode does not boot until DeSciXPowch#21 and DeSciXCloud#83 merge; row eabadir/Unkamon#83 (with its local Playwright login spec) | not yet measured; #83 | no cell: the certificates cover `localhost` only; use D |

### D. Tunnel: `https://dev-local.descix.net/`, Powch `https://powch-local.descix.net/`

| Step | Desktop Chromium | Desktop Safari | iPhone |
|---|---|---|---|
| All four | not yet measured; #83 | not yet measured; #83 | not yet measured; #83 (the CEO's phone tap on the local stack) |

## 5. Negative controls

A cell counts only once its negative control has been shown to fail:

- **Popup routing.** Open Powch top-level (`https://powch.dev.descix.net/`) and click New account.
  The popup must not open, and create() runs in place. Measured on #84 with Chromium and WebKit, red
  ×4: `page.waitForEvent: Timeout 15000ms exceeded while waiting for event "popup"`.
- **Sign-in with no credential.** Returning with no passkey must fail visibly, with Powch's own
  text (§4 A, measured).
- **Tester verdicts.** A thrown error is always FAIL (`app/lib/verdict.js`); `npm test` covers every
  flow's PASS/FAIL logic.

## 6. The engine probe

The **Engine probe** screen calls `navigator.credentials.create()`, `get()`, and `create()` with
`largeBlob`. It runs them from `probe.html`, a page with no DeSciX code, in three placements: a
cross-origin frame, a same-origin frame and a top-level tab. The probe is served at
`https://powch-sdktest.descix.net/prod/powch-sdktest/site/probe.html` (200).

- **On a phone or a desktop browser:** open the tester, open Engine probe, load each placement, tap
  the buttons and cancel any passkey prompt, then copy the Report. An `ancestor-refusal` outcome
  ("The origin of the document is not the same as its ancestors", at once, no prompt) is WebKit's
  rule for create() in a cross-origin frame. `not-allowed` is a cancel, a timeout or no
  authenticator.
- **On the Mac:** `npm run build && npm run measure:engine -- engine.json` serves `site/` at
  `https://localhost:7101` and `https://localhost:7102`. It drives the probe in Playwright Chromium,
  with and without a virtual authenticator, and in WebKit, then prints the engine × placement ×
  operation table.

## 7. Evidence to keep per cell

- **Manual cells:** the tester's copied Report and the surface URL.
- **A Powch build under test:** its served entry name (the command at the top of this page).
- **Playwright cells:** the result JSON per run, with every cell run twice.

Post the evidence on the program row that owns the cell (#80, #84 or #83).
