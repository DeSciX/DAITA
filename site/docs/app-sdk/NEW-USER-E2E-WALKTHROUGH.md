# DeSciX end-to-end walkthrough: a brand-new account to a running app

You have a new DeSciX account, no app yet, and no knowledge base yet. This walks you from
installing the Claude plugin marketplace to a site serving on DEV and a microservice running
locally, creating a new app in the **EGPT** community as you go.

Read it start to finish before you type anything. Several steps succeed while doing nothing,
and one of them can create your app on the wrong platform.

---

## How to read the labels

Every step carries one label. They are not decoration — they tell you how much weight the
sentence can hold.

| Label | Means |
|---|---|
| **MEASURED** | Somebody ran this command and pasted what came back. |
| **UNEXECUTED-BY-SEAT** | Nobody in this workstream ran it. It is written from the command surface, not from a run. |
| **PREDICTED** | Behaviour inferred, never observed. |

**Why so many PREDICTED labels on permission behaviour.** Every credential on the machine
where this guide was assembled belongs to the platform owner. No seat here could sign in as a
non-owner, so no seat could walk a non-owner permission wall — not one. Every statement about
what happens to *your* account when it lacks a right is therefore a prediction, and is marked
as one. Your run is the verification.

**MEASURED does not mean measured for you.** Where a command was run as the platform owner,
the step says so. The command shape is measured; the permission outcome is measured only for
an owner.

---

## Versions

Every claim below was measured against a specific version. State the version when you repeat a
claim from this guide — a measurement is always taken in a configuration, and the configuration
drops out of the sentence when the finding travels.

**What is published right now**, read from the npm registry:

| package | published versions | `latest` |
|---|---|---|
| `@descix/cli` | 1.0.0, 1.0.1, 1.0.3, 1.0.4, 1.0.5 | **1.0.5** |
| `@descix/app-sdk` | — | **0.1.3** |

**What each source measured against:**

- The scaffold and local-serve results (steps 4 and 5) were measured against `@descix/cli`
  **1.0.3**, with `@descix/sdk` 1.1.0, `@descix/app-sdk` 0.1.2, `@descix/cloud-core` 1.1.0 and
  `@descix/platform-api` 2.1.0.
- The credential-resolution result (step 0a) was re-confirmed against `@descix/cli` **1.0.4**,
  installed from the registry into a temp prefix and verified to be a real directory, not a
  symlink.

- The env-command result (step 1 of the ordering) was verified against `@descix/cli` **1.0.5**
  (DeSciX_Core `d6236a3`), with published **1.0.4** as the negative control confirming the probe
  discriminates.

**That version gap matters.** **You will install 1.0.5.** Steps 4 and 5 were measured on
**1.0.3**, two versions back; the credential-resolution result on **1.0.4**, one version back.
It is the difference between "we measured this" and "we measured this on what you will actually
download". If something in those steps behaves differently for you, that gap is the first place
to look, and the difference is a finding worth reporting, not a mistake on your part.

---

## Step 0a — install the published CLI, and prove it is the published one

**MEASURED.**

```
npm i -g @descix/cli
descix --version
npm ls -g --depth=0 | grep @descix
```

`descix --version` should print `1.0.5`. **Note the version you get** — a few instructions
below branch on it, and 1.0.5 is where the env command changed.

**FAILURE SIGNAL:** if `npm ls -g` shows `-> ./../` arrows beside any `@descix` package, your
global `descix` is an `npm link` into a local source checkout, not the published package. On
the machine where this guide was assembled, every `@descix/*` global was exactly that —
`/opt/homebrew/bin/descix` resolved into a `DeSciX_Core` working tree. A result measured
through a linked build is a fact about that machine, not about the product. `npm rm -g` it and
reinstall from the registry.

You can also check directly:

```
readlink -f $(command -v descix)
```

If that lands anywhere inside a `DeSciX_Core` directory, you are not running what we ship.

---

## Step 0b — your identity comes from the directory you are standing in

**MEASURED, on the published CLI, in both directions.**

This is the single most misleading thing on the whole path, and it bites before you have run a
single DeSciX command.

The CLI resolves your credential in **three ordered steps**
(`@descix/cli` `lib/api-client.js::loadCredentials`):

1. `WorkspaceConfig.tryLoad()`
2. `WorkspaceConfig.findWorkspaceRoot()` — walks **up from your current directory** looking for
   `.descix/`**`workspace.json`**. Its own comment: *"Workspace root requires
   .descix/workspace.json — marker dirs alone are not enough"*.
3. **Only if both of those fail** — a final fallback walk-up for `.descix/wallet.json`.

**The wallet is LAST, and a reader who greps for `wallet.json` to check their isolation is
checking only half of it.** Two different things are inherited from the directory you stand in,
they come from two different files, and confusing them sends you hunting the wrong problem:

- **`wallet.json` at the resolved root decides WHO YOU ARE.** Identity requires it. Without it
  you get `Authentication required`, exit 1, no matter what else is present.
- **`workspace.json` decides WHICH PLATFORM YOU TALK TO.** A directory carrying only a
  `workspace.json` and no `wallet.json` does **not** change your identity — measured, it gives
  `env: dev (.descix/workspace.json env.apiUrl) https://dev.descix.net` and then
  `Authentication required`, exit 1, the same identity outcome as a bare directory. What it
  changes, silently, is your **prod/dev origin**.

**The origin half is the more dangerous one**, and it is the hazard this whole guide is built
around: a stray `workspace.json` above you can point you at the wrong platform without ever
touching your login. If you find such a directory, you have an origin problem, not a phantom
identity problem — do not go looking for an account you are not signed in as.

The source separates the two at `lib/workspace-config.js:170`: *"sub-projects like DeSciX_Cloud
have .descix/ for wallet.json but are not workspace roots"*.

**The requirement is: no `.descix` directory at or above your working directory.** A fresh
`$HOME` is not sufficient and on its own does nothing — `$HOME` never carried the credential.

Measured, on `@descix/cli` 1.0.4:

```
cwd /private/tmp             (no .descix at or above)  ->  "Authentication required."   exit 1
cwd /Users/essam/Code/Unkamon                          ->  full session, sam@descix.net  exit 0
```

**Before anything else, run this and read the account it prints:**

```
descix whoami
```

- If it prints an account that is **not yours**, you are inside somebody else's DeSciX
  workspace. Move your project somewhere with no `.descix` directory at or above it. Nothing
  will warn you about this, and every permission wall this guide describes will silently *not
  fire* for you.
- If it prints **"Authentication required"** and you have already logged in, you are probably
  in the wrong directory rather than logged out. Check with
  `ls -d .descix ../.descix ../../.descix` before you run `descix login` again.

Neither half is discoverable from the error text. The message names `descix login`; it never
mentions your directory, which is the actual determinant.

---

## Step 0c — the app id you type is not the app id you get

**MEASURED from the command surface** (`descix-cli` `bin/descix.js`, `app init` option
descriptions). Not measured from a run of `app init` in this workstream.

This one sentence will save you the most time of anything in this guide.

`descix app init` takes:

- `-a, --app <app_id>` — *"App ID (e.g. daita). **With `-c` this is the app NAME to create.**"*
- `-s, --short <short_name>` — *"**SHORT id segment (no hyphens)** used when creating; **the
  app_id is composed server-side as `{community}-{short}`**. Defaults to `--app`."*

So the id is **composed for you**:

```
you type:      -a e2eprobe0909 -c egpt
you get:       egpt-e2eprobe0909
```

**Every `-a` flag after app creation takes the composed id, not the name you typed.** A
first-timer who types their own short name back at step 4 is the single most likely failure on
this whole path. Write the composed id down the moment step 3 prints it, and use that.

This is also why you will see two different shapes in this guide and they are both correct:
`e2eprobe0909` (the short token, no hyphens, what you hand to `init`) and `egpt-e2eprobe0909`
(the composed full id, hyphen is the separator, what everything afterwards wants).

---

## The mandatory ordering, and the window where it matters

Do these three in this order. Do not reorder them, and do not skip step 2.

1. **`descix config init --env dev`** — the **first** `descix` command you run, before anything
   else.
2. **VERIFY the env line reads `dev` before you run anything that creates.**
3. **`descix login --env dev`**
4. Everything else, with no `--env` flag.

### Do not run `descix init`. It is not on this path.

**MEASURED.** `descix init` **destroys the environment pin** that step 1 just wrote, silently
and with exit 0.

```
after `descix config init --env dev`:
  env: {"environment":"DEV","apiUrl":"https://dev.descix.net"}

after `descix init` in the same directory:
  env: {"products":[...]}          <- environment and apiUrl are GONE
  exit 0, prints "✅ Workspace initialized."

$ descix config show
  API URL:      https://descix.net
  Environment:  prod
```

**A workspace written by `descix init` alone resolves to PRODUCTION**, because it carries no
`environment` and no `apiUrl` at all. The two commands write **disjoint key sets** — neither is
a superset of the other — so this is not a merge that loses a field, it is one writer replacing
the other's.

**You do not need it. Both things it produces are obtainable without it, and both were
measured:**

- **App registration** — `descix app init` does its own load, lookup, register and save. Driven
  against a `config init`-only workspace, the app resolved after registration with the origin
  still `https://dev.descix.net`, and the resulting workspace was proven **equivalent** to one
  built with `descix init` as well: identical env key sets, equal `environment`, equal
  `apiUrl`, and `products` deep-equal.
- **Agent files** (`CLAUDE.md`, `.cursorrules` and the rest) — `descix quickstart` generates
  them directly when a workspace already exists, leaving `workspace.json` **byte-identical**.
  It fails loud without a registered app, so what it actually needs is `app init` — not
  `descix init`.

**Measured at the command level, not just by comparing files.** Three fresh directories, three
arms, first-invocation exit codes (`site init` and `microservice init` read the workspace before
any authentication, so this runs without credentials):

| what you ran | `site init`, `app set-port`, `microservice init` | environment |
|---|---|---|
| `config init --env dev` alone | all **exit 1** — `App not found in workspace.json` | DEV |
| `descix init` alone | all **exit 0** | **PROD** — no pin |
| `config init --env dev` **+ `app init`** | all **exit 0** | **DEV — pin survives** |

The first arm is missing only the `env.products` registration, and `app init` supplies exactly
that while preserving the pin — producing a workspace deep-equal to the `descix init` one.

**So: nothing downstream needs anything only `descix init` writes. What it appeared to provide
was registration, and `app init` provides it without destroying your environment.**

**The network leg has since been run too — MEASURED-AS-OWNER, in step 3.** `descix app init`
was executed against a `config init --env dev` workspace with a real credential, created the
app server-side, and **left the environment pin intact**. That is the contrast that makes this
whole section make sense: `app init` adds `products` to your `env` without touching
`environment` or `apiUrl`, where `descix init` replaces them. See step 3 for the transcript.

### If you already ran `descix init`, you can recover

**MEASURED.** `descix config init --env dev` on an existing workspace does **not** refuse — it
loads and re-pins, exit 0, restoring `{"environment":"DEV","apiUrl":"https://dev.descix.net"}`.
The absence of the `(new workspace created here)` line confirms it loaded rather than created.
Anything a previous writer left in `env`, including a `products` array, is **preserved
alongside** the restored pin.

Re-run it, then verify the `env:` line as in step 2 before you continue.

**Why step 2 exists, in plain words: a command run in that window can create your app on
PRODUCTION while you believe you are on DEV.** The CLI's declared default target is production,
and it is always printed with its source named — so "I chose prod" and "I chose nothing" stay
distinguishable. That printing is the product working correctly. But the *obvious* command
order points a new user at production without them ever choosing it, and once your app is
created there, it is created there.

**On the `--env dev` flag, and why it is not on every command.** `--env dev` is required on
every command **until step 1 has written your workspace**; after that the
workspace is the single source of truth for the origin and the flag is redundant. There is a
real window at the start where no workspace exists yet and `init --env dev` does not persist —
in that window the flag is the only thing pinning the origin.

**After step 1, do not pass the flag anyway.** A flag on every command *masks the very failure
step 2 exists to catch*: if the env command silently did not take, a per-command flag hides it
and you learn nothing, while the verify step exposes it immediately. Two ways of deciding one
fact, where the second one defeats the check placed to detect the first one failing. The `env:`
line is your instrument — do not blindfold it.

`login` is the one exception, and only because the flag costs nothing there: `login` honours it
and it does no harm.

### `config init` is the env command. `config set-env` is for custom environments only.

**`descix config init --env dev` is canonical for the three known environments — `dev`, `demo`
and `prod`.** `descix config set-env` exists for a different job: a **CUSTOM** environment name
with an explicit origin. Asking `set-env` for a known name is refused outright, naming its
replacement:

```
$ descix config set-env dev
❌ "dev" is a known environment — use the canonical command:
     descix config init --env dev

   descix config set-env is for a CUSTOM environment name with an explicit origin, e.g.
     descix config set-env staging --url https://staging.example.com
exit 1
```

That refusal is deliberate and it is a **refusal, not a warning** — a warning would leave two
working paths for one act. `set-env` keeps the one capability `init` genuinely does not have:

```
descix config set-env staging --url https://staging.example.com
```

Use `set-env` for that, and only that.

**MEASURED, and it shows the refusal is name-scoped rather than a broken command.** On an
existing PROD-pinned workspace, `descix config set-env dev` exits 1 with the refusal above and
leaves the workspace **unchanged** — while `descix config set-env staging --url
https://staging.example.com` on the same workspace exits 0 and switches it. The command works;
it declines the three names that belong to `config init`.

`config init --env dev` was **verified against `@descix/cli` 1.0.5 (DeSciX_Core `d6236a3`)**
running as the literal first `descix` command in a directory with **zero** prior `.descix`
state, checked before and after. It bootstraps the workspace itself — you do not need one
first.

---

## Step 1 — install the Claude plugin marketplace

**UNEXECUTED-BY-SEAT.** Nobody in this workstream ran it. This step needs a human at a browser,
and it is the same act you are about to perform.

Install the marketplace `eabadir/unk` and the plugin `unkamon-beast` through the Claude Code
plugin flow.

- What actually **executes** is the plugin **cache**, not any checkout you may have. Record the
  cache version. "Installed" and "running" are two different facts.
- **PREDICTED:** if `eabadir/unk` is a private GitHub repository, your failure will be a
  **GitHub** 404 or permission error, not a DeSciX one — and it will look like a bad install
  string. If the marketplace add fails, check your GitHub access to `eabadir/unk` before you
  suspect the plugin name.
- **Installing the plugin grants you nothing on DeSciX.** If you get through this step cleanly
  you may reasonably assume you are "in". You are not. DeSciX identity starts at step 2.

---

## Step 2 — sign in

**UNEXECUTED-BY-SEAT for the device flow itself** (it needs a human at a browser); the command
surface is MEASURED.

```
descix login --env dev
```

This is a device-login flow and it opens a browser. **The URL is minted fresh on every
invocation** — open the URL the command prints. Do not reuse one from anywhere, including from
a colleague's terminal.

**The verb is `login`.** There is also a `descix admin-login`, and it is not for you — its own
description reads *"Bootstrap CLI credentials for platform admins (requires admin group
membership)"* and it takes a required `--email`. Some existing DeSciX documentation states the
external-developer path is `descix admin-login --email <email> --dev`. **That is the admin verb
and following it gates you at the very first DeSciX step.**

**Post-condition check:** `descix whoami` must print **your** account's email. If it prints
anything else, go back and re-read step 0b.

### If you get lost, the CLI tells you the same thing this guide does

**MEASURED** (`descix-cli` `lib/origin.js`). Worth knowing before it happens, because it prints
at exactly the moment you are most stuck and most suggestible — and here it is safe to follow.

The remedy text the CLI prints on **every** origin failure, verbatim:

```
Choose one explicitly:
  descix config init --env dev|demo|prod  (persists env.apiUrl in .descix/workspace.json)
  descix --env dev|demo|prod <command>    (this invocation only)
  export DESCIX_API_URL=https://...       (this shell only)
```

And the source label the CLI prints **inside the env line itself** whenever no workspace config
exists, verbatim:

```
default — no workspace config; `descix config init --env dev` targets DEV
```

Both of those point you at `descix config init --env dev` — **the same command as step 1 of the
mandatory ordering.** The product and this guide agree. If you see either message, you have
skipped step 1 or it did not take; run it and re-check the `env:` line.

---

## Step 3 — create the app in the EGPT community

**MEASURED-AS-OWNER — this command was run end to end and created a real app on DEV.** The
permission outcome for a **non-owner** remains **PREDICTED**: the caller was the platform
owner, so the run says nothing about whether your account is entitled to create an app under a
community you do not own.

```
descix app init -a <your-app-name> -c egpt
```

Re-read step 0c first: `-a` here is the **name**, and the app id you get back is
`egpt-<short>`. Write the composed id down.

### What a successful run looks like

**MEASURED-AS-OWNER.** Fresh HOME, fresh working directory, `env | grep -i descix` empty, and
the binary resolved by `realpath` to a registry install — not a link into a source checkout.

```
$ descix config init --env dev
✅ Configuration initialized! / Environment: DEV / API URL: https://dev.descix.net
(new workspace created here — this directory is now the workspace root)          EXIT=0

$ descix app init -a cliprobe1826 -c egpt
✅ App created: egpt-cliprobe1826
  Products:   Products/egpt-cliprobe1826
  Firestore:  Community/egpt/Apps/egpt-cliprobe1826
  workspace.json updated: egpt-cliprobe1826 → .
  Created: site/, microservice/, assets/
✓ egpt-cliprobe1826 initialized
  Community: egpt
  KB: General — already exists                                                    EXIT=0
```

**Three things in that transcript are worth reading slowly:**

- **`-a cliprobe1826 -c egpt` produced `egpt-cliprobe1826`.** That is the composition rule from
  step 0c, in the wild. Every later `-a` takes `egpt-cliprobe1826`.
- **`KB: General — already exists`** — the server guarantees the default KB. You do not create
  it. This is why step 6 tells you the KB exists but is empty.
- **Your environment pin survived.** `workspace.json` gained a `products` entry and kept
  `{"environment":"DEV","apiUrl":"https://dev.descix.net"}`; `descix status` printed
  `env: dev (.descix/workspace.json env.apiUrl) https://dev.descix.net` **unchanged** before and
  after. That is the whole reason `descix init` is off this path and `app init` is on it.

### A frightening warning you should expect, and ignore

**MEASURED-AS-OWNER, on a run that SUCCEEDED.** This printed on both commands above, and both
completed with exit 0:

```
[ApiClient] OAuth silent refresh failed: OAuth token grant 'refresh_token' failed (HTTP 400):
invalid_grant — refresh token reuse detected; chain revoked. Run 'descix login' to re-establish
OAuth credentials.
```

**This is a known non-fatal signal. It was not chased and its cause is not established here.**
Judge the command by its **exit code and its post-condition**, not by this string.

It is worth naming precisely because of what it does to a first-time reader: a frightening
message on a *working* path teaches you to distrust correct output — and then the same message
on a genuinely broken path gets ignored. If you see it, check whether the thing you asked for
actually happened (`descix app list`, `descix kb list`, the `env:` line) and proceed on that.

`descix app init` is the one command that creates an app.

Its own description: *"Create (if needed) and initialize an app: platform record + default KB +
local workspace registration and scaffold. Idempotent. Pass `-c` to create a new app; omit it to
initialize one that already exists."*

**This is the highest-risk step for a new account, and here is how to tell a broken seam from
your own mistake.**

> **PREDICTED.** If app creation under `egpt` fails with a permission or 403 error, **that is a
> platform seam, not your mistake.** There is currently no self-service route for a new account
> to gain app-creation rights under a community it does not own; the grant is manual and
> admin-gated. Do not retry with different spellings. Record the exact error text and stop.

**PREDICTED FAILURE SIGNAL:** a generic 403 / `PERMISSION_DENIED` at the invoke gateway that
**does not name which permission is missing**. Nobody in this workstream could produce that
string — no non-owner identity existed on the machine to be refused.

**Steps 4 and 5 will succeed even if this step failed.** They are local file generation and a
local proxy; neither checks that your app exists on the platform. That is a false sense of
progress, and step 5 tells you how to detect it.

---

## Step 4 — scaffold the site and the microservice

**MEASURED, clean.** Run unauthenticated, on an isolated `HOME`, from a directory with no
`.descix` above it, with no platform source checkout anywhere. Measured against
`@descix/cli` 1.0.3.

**Do these in this order. The order is not discoverable and skipping it costs you an error.**

```
descix site init -a egpt-<short>
descix app set-port -a egpt-<short> --port 8110
descix microservice init -a egpt-<short>
```

**`descix init` is deliberately absent from that list.** The measurements for this step were
originally taken with it, but it overwrites your environment pin and is not needed — see *Do
not run `descix init`* above. Your workspace comes from `descix config init --env dev`, and
your app registration from `descix app init` in step 3.

> **The CLI will tell you to run it anyway. Do not.** If you reach `site init` or `microservice
> init` before your app is registered, both print, verbatim:
>
> ```
> Run "npx descix init" to set up your workspace.
> ```
>
> **Following that advice destroys your DEV pin and silently moves you to production**, and it
> does so with exit 0 and a success message. What you actually need at that point is the
> registration — go back and run `descix app init -a <your-app-name> -c egpt` (step 3), which
> registers the app *and* leaves your environment intact.
>
> The message is real and the command it names exists; it is simply not the one this guide uses.

### `descix init` exits 0 having done nothing if it cannot prompt you

**MEASURED.** This is the worst-shaped failure on the path.

```
$ descix init -c egpt -a PLACEHOLDER-APP-ID -p .  < /dev/null
  Project:   .../probe-init
  Community: egpt
  App:       PLACEHOLDER-APP-ID (placeholder-app-id)

Proceed? (Y/n):
exit 0
```

The directory listing was **identical before and after**. `.descix` was **absent**. It exited
**0** having written nothing. A scripted or piped run gets SUCCESS from a complete no-op.

**FAILURE SIGNAL:** the output ends at `Proceed? (Y/n):` with no `Writing
.descix/workspace.json...` line. **The exit code is useless here — check for the file, not the
status:**

```
ls .descix/workspace.json
```

Answered interactively it writes:

```
Writing .descix/workspace.json...

Created:
  ✓ .descix/workspace.json
  ✓ CLAUDE.md
  ✓ .github/copilot-instructions.md
  ✓ .cursorrules
  ✓ .clinerules

✅ Workspace initialized.
```

**That success message is the outcome you do not want.** It is the run that overwrites your
environment pin and leaves you on PROD — see *Do not run `descix init`* above. The two failure
modes point opposite ways and neither is signalled: piped, it does nothing and says nothing;
interactive, it succeeds loudly and moves your origin.

It is documented here because it is the clearest example of an exit code that carries no
verdict, and because the CLI's own error text will send you at it (see failure signal **B**
below). It is not a step.

### `microservice init` fails the first time, on purpose

**MEASURED.** If you skip `app set-port`:

```
$ descix microservice init -a placeholder-app-id
exit 1
❌ App 'placeholder-app-id' has no microservice.port in workspace.json.
   A port is required so the gateway knows where to route traffic.
   Set it with the config verb (never hand-edit workspace.json):
     descix app set-port -a placeholder-app-id --port <your-port>
```

**This is good behaviour and it is worth noticing as such** — exact cause, exact fix, exit 1.
Most of the traps in this guide are the opposite shape, and you will calibrate better if you
can tell them apart. It is documented here so you meet it warm rather than cold.

### What the scaffold produces

`site init` copies 5 files (`DeSciXAppSDK.js`, `README.md`, `app.js`, `index.html`,
`styles.css`). `microservice init` copies 17, including `manifest.json`, `Dockerfile`,
`register.js`, `defaults-config.json` and `defaults-config-dev.json`.

**MEASURED check that matters:** the generated `microservice/package.json` declares registry
semver — `@descix/cloud-core ^1.0.0`, `@descix/platform-api ^2.0.0`, `@descix/sdk ^1.0.0`,
`@descix/cli ^1.0.0` — and a scan of the whole generated tree found `file:` specs in **0 of 27
files**, with a control pattern (`@descix/`) firing in 12, so the zero is a real absence and not
a broken reader.

**FAILURE SIGNAL:** any `file:` or `link:` spec in `microservice/package.json`. That would mean
your scaffold is pointing at a local source checkout you do not have.

**NOT MEASURED:** nobody ran `npm install` inside the scaffolded microservice. The registry
specs are proven **declared**; they are not proven to **resolve** end to end.

### Your scaffold now contains credentials — treat it accordingly

**MEASURED.** Among `microservice init`'s output lines:

```
Injected owner credentials into dev-overrides.json
```

**That file holds real credentials belonging to you.** A scaffold carrying them must not be
copied to a shared machine, pasted into a chat, committed to a repository, or published as a
sample. Check `microservice/dev-overrides.json` before your first `git add`, and before you
hand the directory to anyone.

This is not a warning about a defect — the injection is the scaffold doing its job. It is a
warning that the directory you just generated is no longer safe to treat as boilerplate.

---

## Step 5 — serve locally

**MEASURED**, against `@descix/cli` 1.0.3.

```
descix serve --port 8766 -a egpt-<short>
```

It comes up unauthenticated, on a clean `HOME`, with no platform source checkout. Two things
you must be told:

1. **It defaults to production** unless your workspace says otherwise. The banner prints
   `API: https://descix.net   [default (PROD)]`. If you did steps 2 and 3 of the mandatory
   ordering, your workspace already says DEV and the banner will say so.
2. **`unreachable (fetch failed)` under Service discovery is expected** when your microservice
   is not running. The scaffold does not start it. That is not a failure of `serve`.

### Do not judge `descix serve` by the page at `/`

**MEASURED, and this is the worst UX on the whole path.**

Two different configurations, two completely different behaviours:

| Configuration | Behaviour |
|---|---|
| App **not in your workspace** | **exit 1, fails loud, names the fault:** `Gateway error: [serve binding] --app '<typo>' is not in this workspace.  Apps here: <list>`. The gateway never binds and the port is free afterwards. **This is good behaviour.** |
| App **in your workspace but not on the platform** | Gateway comes up. **No error.** `/` returns **HTTP 200 with the full production App Shell** (title `DeSciX`, 2,715 bytes) because `/` **proxies to `descix.net`**. `/p/<app>/` returns **HTTP 404** with GCS `<Code>NoSuchKey</Code>`. |

There is **no 403 anywhere** on either axis.

So if your app does not exist on the platform — because step 3 failed, for instance — you open
`https://localhost:8766/` and see a perfect, fully rendered DeSciX shell, and conclude serve
worked. **The thing that looks healthiest is the thing proving least.** A 200 at `/` proves
only that the proxy to production is up. It says nothing whatsoever about your app.

`__descix/app-binding.json` compounds this: it reports `"mode":"standalone"` because it merely
**echoes your `--app` flag**. It checks nothing. Do not trust it.

**The check you actually need, and it is not the one anybody would think to run:**

```
curl -sk https://localhost:<port>/p/<your-app>/ | head -c 200
```

`<Code>NoSuchKey</Code>` means your app is **not on the platform** — go back to step 3.

One clarification so you do not report a non-bug: `/p/<app>/` is the **iframe target** and
carries no shell by design. The shell lives at the root. A missing shell at `/p/<app>/` is not
the fault; a `NoSuchKey` there is.

---

## Step 6 — the knowledge base

**UNEXECUTED-BY-SEAT for a new account.** Command surface MEASURED. Permission outcome
PREDICTED.

**Three separate facts, and merging them is how people end up debugging the wrong thing:**

1. **The `General` KB already EXISTS on the platform** once step 3 succeeded — measured: step
   3's transcript prints `KB: General — already exists`. `app init`
   creates *"platform record + default KB + local workspace registration and scaffold"*, and
   its implementation comment states *"The server also guarantees the default KB, so no app can
   exist without one."* You do not need to create it.
2. **The local `kb/General/` DIRECTORY does not exist and is never created.** `descix init`
   writes only `.descix/workspace.json` plus agent files. Existing documentation that says
   `app init` creates `site/`, `kb/General/` and `microservice/` in one go is wrong. You make
   the directory yourself.
3. **The KB is EMPTY until you sync a corpus.** Asking your brand-new app a question and getting
   an answer with `sources: []` is fact 3, not fact 1. You did not break your KB. There is
   nothing in it yet.

### To create an additional KB

**`app init` with `--kb` creates it:**

```
descix app init -a egpt-<your-app> --kb <KB-NAME>
```

Measured: EXIT=0, KB `ProbeKB` created, confirmed with `descix kb list`.

**Three flag traps on this one command, and each stops a first-timer cold:**

1. **`--kb` is long-form only here. `-k` errors.** Other `kb` verbs (`kb corpus sync`,
   `kb delete`) take `-k` for the same concept. The short form you learn in one place is wrong in
   the other.
2. **Omit `-c` when the app already exists.** With `-c` on an existing app the command refuses
   and demands `--overwrite` — which is not what you want; you are adding a KB, not recreating
   the app.
3. **Use the FULL composed app id, not the short name you typed at creation.** This is the
   composition rule from **step 0c** biting a third time. If this command rejects your app id,
   go back and re-read step 0c rather than trying spellings.

**Confirm it landed:**

```
descix kb list -a egpt-<your-app>
```

**PREDICTED for a new account:** whether a non-owner may create an additional KB on their own
app is unverified. The command surface is the same; the entitlement is not established.

### Syncing content

`descix kb corpus sync` is the **only** canonical KB sync path.

```
descix kb corpus sync -a egpt-<short>
```

- **Run it in the tree you mean.** Enumeration and content come from the **working tree**, and
  the manifest's `ref` is **not a pin**.
- **Do a per-source existence pre-flight first.** A missing source reads to the walker as a
  **deletion** — so the failure mode is a **purge**, not an error.
- **Do not pass `--rebuild`** unless a purge is what you want.

**The delivery gate, and you need it:** after syncing, **ask the KB the question the content
should answer**, and run `descix kb doctor -a egpt-<short> -k General` to check the live vector
count. A sync that reports success and delivered nothing looks identical to one that delivered
everything. Verify the count, not the exit code.

**PREDICTED FAILURE SIGNAL:** a KB-write denial on an app you do not own surfaces at the same
invoke gateway as step 3 and, per the platform's own known gap, will **not** name the missing
permission. Expect a bare 403.

---

## Step 7a — deploy the site

**MEASURED-AS-OWNER — and it succeeded.** Run on 2026-09-09 **as the platform owner
(`sam@descix.net`)**. The commands are measured; **a non-owner's outcome at this same seam is
PREDICTED**, because no non-owner identity existed to try it.

The verb is **`descix site upload`**. **`descix site deploy` does not exist** — typing it gives
`error: unknown command 'deploy'`, exit 1. The real verbs are
`init | upload | list | status | delete`.

Under the hood, `site upload` invokes the platform's token route directly:
`get_site_build_config`, then `get_site_deploy_token`, then `confirm_site_deploy`
(`descix-cli` `bin/descix.js`, three call sites). That `get_*_token` → `confirm_*` shape is the
right one for an unprivileged caller — a scoped, short-lived grant rather than standing rights —
and the CLI is the surface over it. You do not call those verbs yourself.

### The measured sequence

```
descix site init
  📁 Adding site scaffold...
  Copied: DeSciXAppSDK.js, README.md, app.js, index.html, styles.css
  ✅ Site scaffold added (5 files)                                        EXIT=0

descix site upload -a egpt-e2eprobe0909 -c egpt --dry-run
  Source: <workspace>/site   Target: egpt/egpt-e2eprobe0909
  Found 5 files ... Dry run - would upload:
    + DeSciXAppSDK.js (14.3KB) + README.md + app.js + index.html + styles.css
  Site URL: /dev/egpt-e2eprobe0909/site/index.html                        EXIT=0

descix site upload -a egpt-e2eprobe0909 -c egpt
  Uploading 5 files...
  Site uploaded successfully!
  URL: https://storage.googleapis.com/descix-assets-public/dev/egpt-e2eprobe0909/site/index.html
  Files: 5   Deployed: 2026-09-09T17:27:31.299Z                           EXIT=0

descix site status -a egpt-e2eprobe0909 -c egpt
  Deployed: 2026-09-09T17:27:31.299Z   By: sam@descix.net   Files: 5      EXIT=0

descix site list -a egpt-e2eprobe0909 -c egpt
  Files: 6                                                                EXIT=0
```

**`site list` showing 6 against 5 uploaded is not a discrepancy** — the sixth is
`.descix_site_manifest.json` (1.2KB).

### How we know the bytes served are the bytes built

A "the site is up" claim you cannot check is worth nothing. Here is the check, in both
directions.

Before uploading, a unique marker was appended to `index.html`.

```
GREEN — the marked artifact:
  curl https://storage.googleapis.com/descix-assets-public/dev/egpt-e2eprobe0909/site/index.html
  HTTP=200  bytes=1355
  grep -c E2EPROBE-MARKER-egpt-e2eprobe0909 served.html   ->  1

RED — the same grep against a site that does NOT carry the marker
      (egpt-godsworld, genuinely fetched, HTTP 200):
  grep -c E2EPROBE-MARKER-egpt-e2eprobe0909 served.html   ->  0
```

The predicate reads **1** on the marked artifact and **0** on an unmarked one that was really
fetched. **That is what makes it a check rather than a formality**: a served-equals-built claim
whose discriminator you cannot see is indistinguishable from a test that would pass no matter
what. Use the same trick on your own upload — put something unique in `index.html`, fetch the
served URL, and grep for it.

---

## Step 7b — deploy the microservice

**MEASURED-AS-OWNER, and this is a hard finding.**

> **Microservice HOSTING on DeSciX is not available to external users.** The CLI has no
> microservice deploy command. **This is a platform gap, not a permission problem with your account.** Your microservice runs locally
> (step 5), and you host it yourself. **REGISTERING it for the mesh is a separate act, and the
> registration MECHANISM is measured working — as the platform owner. Whether YOUR account is
> permitted to use it is unverified. See below.**

`descix microservice --help` lists `init | register | vectorize | list | health | reload |
register-delegate | restart`; `reload` is marked `(admin only)`.

**You are being told this plainly and up front on purpose.** If you reach this step, look for a
deploy verb, find none, and find no statement anywhere, you will conclude your account is broken —
when the capability does not exist for anyone outside.

**But hosting and registration are two different things, and the registration mechanism is
measured working — as the platform owner. Whether your account may use it is unverified.**

### The registration mechanism works end to end on DEV — MEASURED-AS-OWNER, entitlement unverified for you

The headline, stated exactly as it was measured:

> **MECHANICS CONFIRMED AS OWNER — the app-owner registration mechanism works end to end on
> DEV. ENTITLEMENT UNVERIFIED-FOR-NEW-ACCOUNT.**

```
descix microservice register -m ./manifest.json -r ./SERVICE_README_sdk.md
EXIT=0
```

Verified landed via `descix microservice list`: service found, **active**, domain assigned,
README vectorized. The env line was confirmed reading `dev` before the write.
**`register-delegate` was never needed and no HTTP 401 occurred.**

**Read the scope of that result carefully, because it is narrower than it looks.**

The caller was `sam@descix.net`, **a platform admin**. **"App-owner mode" describes the shape
of the MANIFEST, not the privilege of the CALLER.** The run succeeded, and it is **inconclusive
for a non-owner**. What it does establish is two specific things: the mechanism does **not**
structurally require a platform-admin identity in the manifest, and it did **not** reject a
foreign `app_id`. So **if** registration is permitted to non-admin app owners, the
self-hosted-and-registered path exists today and is not a hypothesis.

Whether you are permitted is the part nobody here could test. There was no non-owner identity
on the machine to be refused.

### Before you register: fix `manifest.json`'s `service.app_id` by hand

**MEASURED. This blocks registration outright, and the flag that looks like the fix is silently
discarded.**

`microservice init` injects the **short** name into `manifest.json`'s `service.app_id`.
Registration requires the **full composed** app id. This is the step 0c composition rule biting
for the second time.

1. Open `microservice/manifest.json`.
2. Find `service.app_id`. It will hold your short name, e.g. `e2eprobe0909`.
3. Change it to the full composed id, e.g. `egpt-e2eprobe0909`.
4. Then run `descix microservice register`.

**Passing `-a egpt-e2eprobe0909` on the command line does not fix this.** It was passed and
**ignored** — the manifest's `service.app_id` silently wins over the CLI flag. If you skip the
hand-edit, add the flag, and watch it fail again, you will retry the flag rather than open the
file. Open the file.

### How to confirm registration succeeded — and it is not by visiting the URL

**The platform assigns your service a domain at registration, whether or not anything is hosted
there yet.** So a **404 on that domain immediately after registering means nothing is serving
there yet — not that registration failed.**

```
descix microservice list
```

**Confirm via `microservice list` — found, active, domain assigned — and never by visiting the
assigned URL.** This is the same shape as every entry in the silent-success table below: an
action whose apparent failure signal is indistinguishable from its success, with a different
instrument as the only way to tell them apart. A reader who checks the wrong instrument here
concludes their registration failed when it worked, and undoes it.

### Hosting: NOT RUN, and here is exactly what that means

Nobody in this workstream stood a service up behind the assigned domain. The platform assigns
the domain; **nothing serves it and health checks 404 until you host it yourself**. That is
**bring-your-own-hosting, working as designed — not a defect and not a failure of your
registration.**

Two things to carry:

- **`descix microservice register` is REGISTRATION, not HOSTING.** Some existing documentation
  calls `register` "the canonical bridge for deploying microservices". That wording is
  dangerous: registering without hosting gives you a registered endpoint pointing at nothing —
  which is exactly the 404 described above.
- **`descix microservice register-delegate` exists because self-hosted services can get HTTP 401
  calling `/apifront`.** It was **not needed** in the measured run above and no 401 occurred.
  If you self-host and do hit a 401, that is the verb — do not conclude your login failed.

---

## Step 8 — verify the app shell

**NOT-VERIFIED — wrong instrument. This step requires a browser, and no seat in this workstream
had one.** That is stated rather than papered over. The three items below are the human
checklist, handed over verbatim; they are not a substitute for the step, they are the step.

1. **(a)** open `https://dev.descix.net/`, sign in, find `egpt-e2eprobe0909` in the Platform App
   Store, launch it, confirm the scaffold page renders
2. **(b)** exercise the deeplink launch mode from the shell and confirm the same
3. **(c)** confirm the marker comment is present in the rendered page source — the comment is
   `<!-- E2EPROBE-MARKER-egpt-e2eprobe0909 -->` in `index.html`

**This checklist is navigational rather than linked**: it tells you where to go, not a URL to
click. Whether a direct addressable per-app URL exists for the store entry or launch target is
an **open question** — no URL is invented here, and it is not asserted that none exists.

### The two launch modes fail differently, and the difference is the diagnostic

**PREDICTED.** This is the most confusing part of the path for a new account.

| What you see | What it means |
|---|---|
| Deeplink works, App Store does **not** list it | A **visibility/membership** condition — community membership or listing state. **Not** a deploy failure. The app is there; the store will not show it to your identity. |
| **Both** fail | The app is not deployed, or not deployed where you are looking. Re-check step 7a. |
| App Store lists it, deeplink **404s** with `NoSuchKey` | The registry row exists but the site bytes never landed. |

**Check the deeplink first. If the deeplink works and the store does not list it, nothing is
broken about your deploy — do not redeploy.** Without this line you will redeploy repeatedly
against a visibility gate. `listed:true` is not a deploy gate, and absence from the store is not
evidence of a failed deploy.

---

## The four commands that succeed while doing nothing

This is the single most important thing to carry away, because individually these are
annoyances and together they teach you that green means done.

| Command | The silent success | The post-condition check that catches it |
|---|---|---|
| `descix init` in a non-TTY | Prompts, writes **nothing**, exits **0** | `ls .descix/workspace.json` |
| `descix serve` | `/` returns **HTTP 200** with the full production shell, from the proxy, even when your app does not exist | `curl -sk https://localhost:<port>/p/<your-app>/` and look for `NoSuchKey` |
| `descix kb corpus sync` | Reports success having delivered **zero vectors** | `descix kb doctor`, and ask the KB the question the content should answer |
| `descix microservice health` | Reports **"unhealthy"** and still **exits 0** | Read the printed status text. **This command cannot gate a script** — its exit code carries no verdict |

In every one of these, **the exit code does not mean what you think it means.** Check the
post-condition, not the status.

---

## Three failure signals, and they are not the same thing

When something goes wrong you will be tempted to read every error as "it errored". These are
three distinct conditions with three distinct fixes:

- **A — auth.** `Authentication required. / Please sign up with DeSciX to use this feature. /
  Run: descix login`, exit 1. Before you re-run `login`: re-read step 0b. If you have already
  logged in, you are probably in the wrong directory.
- **B — workspace.** `Workspace not configured. Run "npx descix init" first to initialize your
  workspace.` You are not standing anywhere the CLI recognises as a workspace root.
  **Do not follow that suggestion.** Run **`descix config init --env dev`** instead — it creates
  the workspace *and* pins your environment, where `descix init` creates one pinned to
  production. This is the same shape as the origin remedy in step 2: the message is real, and
  the command it names is not the one this guide uses.
- **C — commander argument validation.** Things like `error: unknown command 'deploy'` or a
  missing/unrecognised option. **Nothing reached the platform**, so this is never an auth or
  entitlement problem however much it looks like one. The flag shapes on this path are not
  consistent with each other — `app init` takes `--kb` long-form only and errors on `-k`, while
  `kb corpus sync` uses `-k` for the same concept — so a rejected flag is more often a spelling
  difference between two commands than a mistake you made.

### `descix doctor` will mislead you on a fresh workspace

**Stated plainly because `doctor` is exactly where a stuck first-timer goes, and on a fresh
unconfigured workspace it is the surface most likely to mislead them.**

On a fresh, unconfigured workspace, **`descix doctor`'s connectivity line and its ADC row are
unreliable**. Do not use them to decide whether you are set up.

**The real check is the `env:` line on a network-bound command.**

---

## The `env:` line — your one instrument

**MEASURED** (`descix-cli` `lib/environment-report.js::formatEnvLine`, `lib/origin.js`).

There is exactly one spelling of this line, and it is `env: <name> (<source>) <origin>`. The
**source** is the whole point — it is what keeps "the developer chose production" and "the
developer chose nothing" from being the same observable state.

After step 1 of the mandatory ordering, the line you are looking for is, character for
character:

```
env: dev (.descix/workspace.json env.apiUrl) https://dev.descix.net
```

`.descix/workspace.json env.apiUrl` is a literal source label, and `https://dev.descix.net` is
the literal DEV origin. If the line reads anything else — especially anything containing
`default` or `descix.net` without the `dev.` — **stop, and do not run anything that creates.**

**Three things about this line you need to know or it will fool you:**

1. **It is written to STDERR, deliberately** — stdout is a data channel under `--json` and the
   protocol channel for the MCP stdio server, so a status line there would corrupt both. If you
   pipe or redirect stderr away, **you lose the only check standing between you and creating
   your app on production.**
2. **It prints once per distinct origin-and-source pair per command.** Seeing it once and not
   again is **correct behaviour**, not the check having failed. A single command builds many
   clients; printing the line a dozen times would just train you to skim past it.
3. **A second, different line in the same command is a real signal** — it means that invocation
   contacted a second origin. That is exactly what the per-pair keying exists to surface.

---

## Verification status — what was actually run, and by whom

| Step | Status |
|---|---|
| 0a install + link check | MEASURED |
| 0b credential resolution | MEASURED, both directions, on published cli 1.0.4 |
| 0c app id composition | MEASURED from the command surface only — not from a run |
| 1 marketplace install | **UNEXECUTED-BY-SEAT** — requires a human at a browser |
| 2 `descix login` | **UNEXECUTED-BY-SEAT** for the device flow; command surface MEASURED |
| 3 app creation | **MEASURED-AS-OWNER** — app created end to end on DEV, env pin survived; entitlement for a non-owner **PREDICTED** |
| 4 scaffold | MEASURED on cli 1.0.3, clean, unauthenticated |
| 5 local serve | MEASURED on cli 1.0.3, both configurations |
| 6 KB create + corpus sync | KB creation via `app init --kb` **MEASURED-AS-OWNER**; corpus sync **UNEXECUTED-BY-SEAT** for a new account; every entitlement PREDICTED |
| 7a site deploy | **MEASURED-AS-OWNER and succeeded**, with a discriminating control; entitlement for a non-owner **PREDICTED** |
| 7b microservice register | **MEASURED-AS-OWNER and succeeded** end to end on DEV; entitlement for a non-owner **PREDICTED** |
| 7b microservice hosting | **NOT RUN.** No published DeSciX-hosted deploy exists for an external user; you host it yourself |
| 8 app shell | **NOT-VERIFIED** — wrong instrument, requires a browser |

**Steps 1 and 2 genuinely require a human at a browser and stay unexecuted. That is not a gap in
this guide — it is the same act you are about to perform.**

**No permission wall was walked by any seat. Zero.** Every credential on the assembling machine
belonged to the platform owner. Every non-owner behaviour in this document is a prediction and
is labelled one.

**Also not measured:** Powch sign-in (no browser was run, so anything script-driven in the shell
is unverified — only the server-rendered markup was checked); `npm install` inside the
scaffolded microservice, so the registry specs are proven *declared* but not proven *resolvable*
end to end; and the cause of the OAuth silent-refresh warning in step 3, which was observed on
successful runs and not chased.

**What the owner-run steps do and do not establish.** Steps 3, 6, 7a and 7b were run with a real
credential belonging to the platform owner, so the **mechanisms** are measured working: the app
is created, the KB exists, the site serves the bytes that were built, the service registers.
What none of them establishes is **entitlement** — whether an account that does not own the
`egpt` community may do any of it. That single question is the one this guide cannot answer from
here, and it is the thing your run will settle.

---

## Disagreements with `GETTING STARTED.md`

`V2_docs/app-sdk/GETTING STARTED.md` is the scaffolded per-app guide. This document does not
edit it. Where the two disagree, both readings are quoted here so you can see the conflict
rather than trip over it.

**1. The site deploy verb.**
- *GETTING STARTED.md:* "`# Deploy site to CDN` / `npx descix site deploy`"
- *This guide:* `descix site deploy` does not exist. `descix site --help` lists
  `init | upload | list | status | delete`. Typing `site deploy` returns
  `error: unknown command 'deploy'`, exit 1. The verb is `descix site upload`. (MEASURED.)

**2. Whether `kb/General/` exists for you to put files in.**
- *GETTING STARTED.md:* "Add or edit markdown files under `kb/General/`." and its folder
  structure diagram shows `kb/ └── General/  # KB source docs (markdown files)`.
- *This guide:* no `kb/General/` directory is ever created by any scaffold command. The `General`
  KB exists **on the platform**; the local directory does not. You create it yourself. (MEASURED.)

**3. The workspace config path.**
- *GETTING STARTED.md:* its folder diagram shows `.descix.app/ └── workspace.json`.
- *This guide:* everything measured in this workstream — `descix init`'s own output, the
  credential walk-up in `loadCredentials`, and `findWorkspaceRoot`'s comment — refers to
  `.descix/workspace.json`. Both spellings are quoted; this guide does not rule on whether
  `.descix.app/` is a different, additional, or superseded location.

**4. Where to start when you have no credential.**
- *GETTING STARTED.md:* offers `npx descix tell-me-how "your question here"` under "Need Help?"
  with no auth prerequisite stated.
- *This guide:* auth is **required** for `kb corpus sync` and `tell-me-how`. A credential-free
  user starting with `tell-me-how` will be refused. Sign in first. (MEASURED.)

**5. Environment selection.**
- *GETTING STARTED.md:* does not mention environment selection at all. Every example is a bare
  `npx descix ...`.
- *This guide:* environment selection is mandatory and ordered, and a command run before it can
  create your app on production.

---

## Where the existing knowledge base is wrong about this journey

Four claims in the `unk-beast` knowledge base were checked against the executing code during
assembly and found wrong for this path. Each would have put an owner-only or non-existent step
into a guide written for non-owners.

1. **It names `descix admin-login --email <email> --dev` as the external-developer auth path.**
   That is the admin verb; its own description says it requires admin group membership. The
   developer verb is `descix login`.
2. **It prescribes scaffolding by adding the new repository as a git submodule to an existing
   owner workspace and editing `.descix/workspace.json` `localPath`.** That is
   owner-workspace-dependent and cannot be done by a new user at all.
3. **It states `app init` creates `site/`, `kb/General/` and `microservice/` in one go.** It does
   not. `descix init` creates `.descix/workspace.json` plus agent files; `site/` needs
   `site init`; `microservice/` needs `app set-port` then `microservice init`; and no
   `kb/General/` directory is created at any point.
4. **It prescribes `deploy-service-env.sh <service_name> <env>` as the microservice deploy
   step.** That is a `DeSciX_Cloud` admin script an external developer never installs and never
   runs.

**This guide was written from the executing artifacts, not from that knowledge base.**

---

## Observations

Rough edges noticed during assembly, collected here rather than left inline as warnings. None
of these changes an instruction above.

- **Three commands on this one path exit 0 without their exit code reflecting their outcome,
  and that is a family rather than three coincidences.** `descix init` in a non-TTY exits 0
  having created nothing; `descix kb corpus status` exits 0 on "no manifests"; `descix
  microservice health` exits 0 while reporting "unhealthy". Anyone scripting against this CLI
  needs to know before they write their first check: on this path, **`$?` is not a verdict.**
  Gate on the printed output or on a post-condition, never on the status.
- **Twice now the CLI's own remedy string has named a command this guide must decline, and the
  second is far more dangerous than the first.** The origin remedy named `config init --env dev`
  during the window when it failed — loudly, exit 1, self-correcting: a reader tries it, it
  refuses, they come back. The workspace remedy inside `site init` and `microservice init` names
  `descix init`, which **succeeds**, prints `✅ Workspace initialized.`, and silently repoints
  the workspace at production. A remedy that fails loudly costs a reader a minute; a remedy that
  succeeds wrongly costs them the whole run and tells them nothing. Both strings belong to the
  CLI owner; the second is the one worth fixing first.
- **`descix init` fails silently in two different directions depending on whether a human is
  watching, and neither is signalled.** Run without a TTY it stops at the overwrite prompt,
  writes nothing and exits 0 — a scripted reader gets no registration. Run interactively on a
  pinned workspace it succeeds and exits 0 — a human reader gets moved to PROD. Same command,
  two configurations, two silent failures, opposite in kind. It is the fourth
  exit-code-does-not-reflect-outcome instance in this file, and the only one where the two
  failure modes contradict each other.
- **`microservice list` is the only reliable confirmation that registration landed**, because
  the assigned domain 404s until you host something behind it. Apparent-failure and success are
  indistinguishable at the URL.
- **The credential walk-up is silent in both directions.** A user who clones under an existing
  workspace inherits its identity with no notice; a user outside one is told to sign up with no
  hint that their directory is why. Neither half is discoverable from the error text.
- **Denials do not name the missing permission.** Until they do, every permission step needs a
  "this is a seam, not your mistake" sentence, or a new user burns an evening on spelling.
- **The good fail-loud behaviour is invisible next to the silent ones.** The `serve` workspace
  binding check — exit 1, names the fault, lists the real apps — is genuinely excellent, and it
  is called out as such above precisely because readers calibrate on contrast.
- **`descix doctor` is least reliable exactly where it is most used**: a fresh, unconfigured
  workspace, which is where a stuck first-timer goes first.
- **This document goes stale the moment the CLI republishes.** Every claim names the version it
  was measured against for that reason. The scaffold and serve results were measured **two**
  versions behind current `latest`, and the credential-resolution result one version behind.

---

**Assembled 2026-09-09 from four measured sources plus rulings recorded on the coordination
fabric. Nothing in this file was re-measured during assembly except the published version set
and the code citations; where a claim had no source, it says so rather than filling the gap.**
