# Serve & Launch Modes

How to put a DeSciX app in front of a browser locally, and what each way actually does.

This page is the decision table. It does **not** restate the gateway's routing table or port
resolution — those have one owner, `agent-assets/reference/local-dev.md` (§2 and §3) in the published `@descix/cli` package, and a
second copy here would be the mirror that drifts.

## What `descix serve` is

A pure HTTPS reverse proxy that replicates the production GCP Load Balancer locally, so the App
Shell, your app and `/apifront` share ONE origin. **It starts nothing else** — no backend, no app
dev server. An unreachable target surfaces as a 502/`ECONNREFUSED`, never a fallback. Start your
own services first; `serve` only routes to whatever is already listening.

## Which mode do you want

| You want to | Run | What you get |
|---|---|---|
| Work on ONE app, standing in its directory | `cd <app dir> && descix serve` | The app bound standalone, detected from cwd |
| Work on ONE app, from anywhere in the workspace | `descix serve -a <appId>` | That app bound standalone, cwd ignored |
| Serve a workspace you are not standing in | `descix serve -w <path>` | Workspace root override; binding still resolves inside it |
| Run the gateway on a specific port | `descix serve --port <n>` | Overrides `env.gateway.port` for this run only |
| Point the shell at a different origin | `descix serve --site-url <url>` | Overrides the App Shell target for this run |

Every one of these prints what it resolved, and **where each value came from**, before it serves:

```
  Workspace: <workspace root>
  API:       <api origin>     [<source>]
  Shell:     <shell origin>   [<source>]
  Port:      <port>           [<source>]
  App:       <appId>          [<source>]  → standalone at <url>
```

Read that block rather than assuming any of it. The `[<source>]` labels exist because every value
here is resolvable from several places, and the label is the one thing that tells you which place
won. Open the URL on the `App:` line — it is the address the gateway just bound, not a shape you
should be deriving yourself.

## Which app gets served

`descix serve` binds **exactly one app per session** and never resolves to a store binding.
**The store lives elsewhere:** locally it is the platform shell's own dev server
(`env.platform.site.port`), which serves no app-binding and therefore boots as the store; deployed
it is the platform origin (`dev.descix.net`, `descix.net`). A catalogue or listing defect is
debugged there — never through `descix serve`, which has no view that could show it.

- **Default:** cwd detection — the product whose `localPath` contains your current directory,
  longest match wins.
- **Override:** `-a <appId>`.
- **Nothing is persisted.** The binding is per-run; `workspace.json` is not written.

It fails loud rather than guessing. Standing outside every app:

```
Gateway error: [serve binding] cannot tell which app to serve from <dir>.
  descix serve runs ONE app standalone — there is no store view here.
  Fix it either way:
    cd into your app's directory and re-run, or
    descix serve --app <id>
  Apps in this workspace: <list>
```

Naming the platform shell itself also throws, listing the product apps you could have meant.

## What the shell becomes

One shell bundle, two roles, chosen at runtime — there is no separate "store build" and "app
build", and only ever one shell instance, never nested.

| The origin serves | The shell boots as |
|---|---|
| no app binding | the **store** |
| an app binding | that **app's own shell**, with store chrome removed |

The gateway answers `GET /__descix/app-binding.json` on the shell's own origin with
`{mode:'standalone', appId, appUrl, source}` and `Cache-Control: no-store`. Absence, a non-OK
response, a timeout or a malformed body all read as *no binding* — which means the store. That is
the safe degradation, and it is why a shell with no gateway in front of it still works.

Standalone removes **store chrome** — the marketplace entry points, the dashboard, the owned-apps
list. It does not remove the platform: the Powch silo and the other platform views are reachable.

## A workspace is required

The gateway walks UP from your cwd (or from `-w`) looking for `.descix/workspace.json`. With none
anywhere above, it refuses to start:

```
Gateway error: No .descix/workspace.json found. Run from a DeSciX workspace, or pass -w/--workspace <path>.
```

`-w` names *where the workspace is*. It does not make the workspace optional — there is no
workspace-less serve.

## Not supported, and deliberately so

**There is no positional path argument, and passing one is refused.** `descix serve ./some/dir`
does not run:

```
error: too many arguments for 'serve'. Expected 0 arguments but got 1.
```

It exits 1 without starting anything — the argument is not silently ignored, so you find out
immediately rather than debugging a gateway that served the wrong tree. Use `-w <path>` for a tree
you are not standing in, or `cd` into it. `cd <dir> && descix serve` and `descix serve -w <dir>`
are the same case spelled two ways, and the flag already covers it — a positional alias would be a
second way to say one thing.

## Deliberately not specified here

The **direct-link entry-point shape** — the URL a developer or an end user hits to reach one app
directly — is not named on this page, and neither is the **wrapped-per-app local route**. Open the
URL the startup banner prints. A URL shape written down here would read as settled when it is not.
