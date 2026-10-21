# App Shell Enclosure

This document describes how the Powch App runs inside or alongside the DeSciX App Shell in each deployment case. Powch always has its own isolated App Shell instance.

---

## Core Principle

In every case, the Powch App runs with its own full App Shell (App.jsx, AppContext, AppData, makeCommandRequestJSON, window.DeSciX). It is never a bare UI component; it is always enclosed in the Shell's security domain.

---

## Case 1 — descix.net (Platform)

```mermaid
flowchart TB
    subgraph outer [Outer Shell - Browser Level]
        Host[DeSciX PWA]
    end
    subgraph sidebar [Powch Sidebar]
        Iframe[iframe src=powch URL]
    end
    subgraph inner [Inner Shell - Powch Iframe]
        Shell2[App Shell Instance]
        PowchUI[PowchStandaloneApp]
    end
    Host --> Iframe
    Iframe --> Shell2
    Shell2 --> PowchUI
```

- **Outer shell:** DeSciX PWA (App.jsx, AppContext, AppData) — the main browser window
- **Powch sidebar iframe:** `src` = `__POWCH_APP_URL__` (https://powch.descix.net/ on PROD, https://powch.dev.descix.net/ on DEV; a local build takes the URL `resolvePowchUrl` returns)
- **Inner shell:** The iframe loads the Powch PWA — its own root app (PowchStandaloneApp) with its own isolated shell surface; standalone binding is runtime (`descix serve` / edge), never a build-time app id
- **Two app shells:** Host owns the iframe; Powch has its own isolated Shell (session, makeCommandRequestJSON, window.DeSciX) inside the iframe
- **Communication:** postMessage via PowchBridgeClient / PowchSideBarWidget
- **standalone-vanilla sample:** Models this pattern — host creates iframe, uses PowchClient postMessage; correct for all host scenarios

---

## Case 2 — [someapp].descix.net (Standalone App)

```mermaid
flowchart TB
    subgraph outer [Outer Shell - Browser Level]
        Host[DeSciX PWA]
    end
    subgraph content [Main Content]
        AppIframe[App iframe]
    end
    subgraph sidebar [Powch Sidebar]
        PowchIframe[Powch iframe]
    end
    subgraph inner [Inner Shell - Powch Iframe]
        Shell2[App Shell Instance]
        PowchUI[PowchStandaloneApp]
    end
    Host --> AppIframe
    Host --> PowchIframe
    PowchIframe --> Shell2
    Shell2 --> PowchUI
```

- Same as Case 1: host PWA + Powch sidebar iframe
- Main content is the target app iframe; Powch sidebar is shown for auth/pay
- Powch always runs in its own full Shell instance inside its iframe

---

## Case 3 — powch.descix.net (Identity Silo)

```mermaid
flowchart TB
    subgraph single [Single PWA Instance]
        Shell[App Shell]
        PowchUI[PowchStandaloneApp]
    end
    Shell --> PowchUI
```

- Single PWA instance: the Powch PWA is its OWN root app (standalone binding is runtime — `descix serve` / edge — never a build-time app id)
- The Powch PWA renders PowchStandaloneApp directly as its root; no shell widget is involved
- No Powch sidebar — main content is Powch
- PowchAppProvider, window.DeSciX, session — all in the same window
- Powch is a top-level surface, not a shell-hosted app, so no second iframe

---

## Component References

| Case | Host | Powch Content |
|------|------|---------------|
| 1, 2 | PowchSideBarWidget renders iframe; uses PowchBridgeProvider, usePowchBridge (not Powch's React layer) | iframe src = Powch PWA URL; loads PowchStandaloneApp inside Shell |
| 3 | Powch PWA root (its own App) | Imports PowchStandaloneApp from its own React layer; renders in-process |

**Distinction:** Cases 1 and 2: DeSciX PWA host uses the bridge (PowchBridgeProvider, PowchSideBarWidget, usePowchBridge)—never Powch's React layer. Case 3: the Powch PWA uses its own React layer (PowchAppProvider, PowchStandaloneApp, usePowch) because it is the identity provider.

---

## Related

- [developer-guide.md](../developer-guide.md) — Visibility paradigm, request routing
