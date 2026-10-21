# DeSciX PWA React Developer's Guide

This guide documents the PWA Shell React architecture used in the DeSciX PWA (`DeSciX_PWA`) and how to implement it in derivative PWAs such as the Powch App. It is the single source of truth for global state, view routing, and the single-mutex pattern.

**Audience:** React developers implementing or maintaining the DeSciX PWA or derivative PWAs (e.g. Powch standalone app).

**Related:** For encapsulation rules and testing, see `.cursor/rules/descix.mdc`. AppContext and AppData are inter-page and global; intra-page `useEffect` is only for intra-component workflows.

---

## App-SDK as Core

All PWAs (DeSciX PWA, Powch PWA) are built from `@descix/app-sdk`. The app-sdk provides init-to-READY shell logic, auth, API surface, and Powch bridge. Shell responsibilities (providers, SdkInitializer, AppContext) vs app responsibilities (view logic, widgets, API extensions) are documented in [App Shell and SDK](../../architecture/app-shell-and-sdk.md).

**Phase 2 complete:** DeSciX PWA, Powch PWA, and standalone samples use `@descix/app-sdk` as their shell.

---

## 1. Core Concepts

### 1.1 Passive Single Source of Truth (AppData / PowchData)

The backing store is a static or singleton data layer (e.g. `AppData` in PWA, `PowchData` in Powch). It:

- Never subscribes to React. Do not use `useState(Store.x)` or effect dependencies on store fields.
- Exposes getters that read live from the store; components read through context getters.
- Is written to at explicit commit points (e.g. after auth, after consent, when a flow finishes). The store does not notify React; the only link to React is via events.

### 1.2 Event-Driven React Sync

The only React state derived from the backing store is one or two **event objects** (e.g. `appEvent`, `viewEvent`), each with `{ type, id, payload }` and an incrementing `id`. A single callback syncs the event into React state. Re-renders are triggered only when an event is emitted.

### 1.3 Single Mutex for View

One React state value represents "what view is shown" (e.g. `currentView`). The **only** setter for that state is the view trigger (e.g. `triggerViewChange`). All view transitions go through a single path.

### 1.4 Centralized viewRouter

A single function `viewRouter(targetView)` is the gatekeeper for all view transitions. It validates, optionally fetches data, updates the store, and calls `triggerViewChange(finalView)`. No component should update view state by any other means.

---

## 2. PWA Shell Reference Implementation

**Files:** the DeSciX PWA's own `AppContext`, `App` and `AppData` modules

**Flow:**

1. Component requests view change via `setAppEvent({ type: AppContextEvent.CHANGE_VIEW, payload: { view, viewEventData } })`
2. `appEvent` useEffect runs the state machine
3. State machine calls `viewRouter(view, viewEventData)`
4. `viewRouter` validates auth/data, may fetch data, updates AppData, then calls `triggerViewChange(finalView)` once
5. `App.jsx` re-renders based on `currentView` (dumb renderer)

**Key code:**

- `const [currentView, triggerViewChange] = useState(AppContextView.LOADING);` — single mutex
- `viewRouter(targetView, viewEventData)` — single function for validation and async work, then `triggerViewChange(finalView)`
- `App.jsx` — switch on `currentView`; no view logic inside

---

## 3. Implementing in a Derivative PWA (e.g. Powch App)

### 3.1 Composite View State

For layered UI (shell + tab content + flow overlay), use a composite mutex:

```javascript
const [currentView, triggerViewChange] = useState({
  tab: TAB_IDS.HOME,
  flow: null,
  visualState: null,
});
```

### 3.2 Single viewRouter

All view events (CHANGE_TAB, TOGGLE_UI, SET_FLOW_STATE, etc.) are handled in one place. Each handler calls `viewRouter(...)`. No direct writes to the store followed by ad-hoc render triggers.

### 3.3 No Direct Store Imports in UI

Shell and view components consume only context. They must not import the backing store or emit events directly. They call context actions that internally emit events or call viewRouter.

### 3.4 Dumb Shell / Renderer

The top-level app component reads `currentView` from context and renders tab content and flow overlay from that only. No view logic beyond that switch.

---

## 4. Anti-Patterns to Avoid

- Distributed render triggers — use a single `triggerViewChange` called only from viewRouter
- UI components importing the backing store — use context actions only
- Context actions that mutate store then trigger render — actions should emit events or call viewRouter
- Two competing paths for view changes — all transitions must go through viewRouter + triggerViewChange

---

## 5. Checklist for Derivative PWAs

- One backing store (passive); one or two event objects synced into React state
- One `viewRouter` that owns all view transitions
- One view mutex state and one setter; no other state used solely to force re-renders
- Shell and main app component are dumb renderers of the mutex
- No direct store imports in components or views
