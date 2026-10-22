# Powch State Machine

Single source of truth for global events, call stack, state constants, and the two state machines (App and View) in PowchAppProvider. Per-flow state machines and flow controller architecture are in this folder: [powch-flow-sign.md](powch-flow-sign.md), [powch-flow-payment.md](powch-flow-payment.md), [powch-flow-wallet-connect.md](powch-flow-wallet-connect.md), [powch-flow-controller-architecture.md](powch-flow-controller-architecture.md); the Auth flow's state machine is in [flow-controllers.md](../flow-controllers.md#authflowcontroller).

---

## 1. Global Events

### Host → App (postMessage)

The SDK sends these types to the Powch App iframe. Payload is enriched with `brand` and `requestId` by the SDK; App adds `_actionId` when dispatching to the machine.

| Type | Payload (typical) | Description |
|------|-------------------|-------------|
| `POWCH_LOGIN` | `{ origin?, require?, purpose? }` | Start high-level login flow (SSO) |
| `POWCH_CONNECT_WALLET` | `{ signatureMessage?, startMode?, instruction?, isRequirement?, purpose? }` | Start wallet connect flow; returns walletAddress, walletSignature, onboardingComplete. Starts WalletConnectFlowController. |
| `POWCH_SIGN` | `{ data, address, actionType? }` | High-level sign intent (message/tx/typedData) |
| `POWCH_RECEIVE` | `{ amount, token, reason }` | Request to receive payment (opens wallet/receive) |
| `POWCH_SEND` | `{ amount, token, destination }` | Request to send payment (opens wallet/send) |
| `POWCH_OPEN` | `{ tab? }` | Open Powch, switching to `tab` (a `TAB_IDS` value, e.g. `cards`, `portfolio`, `activity`) when given |
| `POWCH_AUTH` | `{ origin?, require?, purpose?, signatureMessage? }` | Legacy auth flow (aliased to POWCH_LOGIN) |
| `POWCH_LOGOUT` | — | Clear blob, identity cache, set LOCKED / IDLE |
| `POWCH_SIGN_TX` | `{ tx, address }` | Request tx sign; machine sets SIGN_CONFIRM |
| `POWCH_SIGN_MESSAGE` | `{ message, address }` | Request message sign; SIGN_CONFIRM |
| `POWCH_SIGN_TYPED_DATA` | `{ domain, types, value, address }` | Request typed-data sign; SIGN_CONFIRM |
| `POWCH_TOGGLE_UI` | — | Toggle flow overlay (IDLE ↔ AUTH_MAIN) |

**Visibility gate:** Before processing any host request, Powch checks `document.visibilityState === 'visible'`. If the tab is backgrounded, Powch immediately sends `POWCH_RESPONSE { requestId, success: false, error: 'Powch UI not visible' }` and does not process the request. See [developer-guide.md](../developer-guide.md).

### App → Host (postMessage)

Every post goes through one host-channel module. A reply goes to the window that sent the request, with that request's browser-stamped `event.origin` as `targetOrigin`; a request with an opaque (`'null'`) or empty origin is refused. Only the two payload-free lifecycle signals are broadcast to the parent with `'*'`.

| Type | Payload | Sent to | Description |
|------|---------|---------|-------------|
| `POWCH_READY` | — | parent, `'*'` | Iframe loaded and listener attached |
| `POWCH_UI_CLOSE` | — | parent, `'*'` | Request Host to close sidebar |
| `POWCH_STATE_UPDATE` | `{ isAuthenticated, displayAddress?, sessionInfo? }` | the requesting window, its origin | After a sign-in that a host request started; `displayAddress` is the consented `walletAddress`. A sign-in no host asked for (inside the Powch UI, top-level Powch) posts nothing. |
| `POWCH_RESPONSE` | `{ requestId, success, payload? \| error? }` | the requesting window, its origin | Reply to a Host request. When `success: false`, `error` may be `'Powch UI not visible'` (visibility gate). |

### Internal (dispatch from App UI)

Events dispatched by PowchModal or views; only the App uses them. Handled (or not) by the protocol machine.

| Type | Source | Description |
|------|--------|-------------|
| `FLOW_COMPLETE` | Modal / views | Flow finished; payload `{ result }`; may go to AUTH_CONSENT or completeRequestInternal + resolveAction |
| `POWCH_EXECUTE_SIGN` | ConfirmView | Execute the actual crypto signature after user approval |
| `POWCH_IMPORT_KEY` | UI | Internal key import |
| `POWCH_INIT_SESSION` | UI | Internal session initialization |
| `POWCH_SAVE_SESSION` | UI | Internal session persistence |

---

## 2. Call Stack

1. **Host** calls e.g. `login()` or `sign(data)` on the bridge. The bridge calls `openUi()` and defers postMessage with double `requestAnimationFrame` (see [developer-guide.md](../developer-guide.md)).
2. **Bridge** (PowchBridgeClient) `_sendRequest(type, payload)` → assigns `requestId`, stores resolve/reject in `pendingRequests`, posts `{ type, requestId, payload }` to iframe.
3. **App** message listener receives event → if `document.visibilityState !== 'visible'`, sends `POWCH_RESPONSE { success: false, error: 'Powch UI not visible' }` and returns. Else: generates `_actionId`, stores `{ source, requestId }` in `actionResolversRef`, calls **PowchData.emitAppEvent(HOST_REQUEST, { type, ...payload, _actionId })**.
4. **PowchData** mutates `appEvent` and invokes `_onEvent`; **PowchAppProvider** syncs `appEvent` into React state and the **App State Machine** useEffect runs, handling HOST_REQUEST (and other appEvent types).
5. **App State Machine** switch runs the case (e.g. HOST_REQUEST with `payload.type === 'POWCH_LOGIN'` → startFlow(AuthFlowController)); may call `resolveAction(_actionId, result)` or `rejectAction(_actionId, error)`.
6. **resolveAction / rejectAction** look up `actionResolversRef` by actionId, then `source.postMessage({ type: 'POWCH_RESPONSE', requestId, success, payload | error })` to parent.
7. **SDK** message listener receives `POWCH_RESPONSE` → looks up `pendingRequests` by requestId → resolve(payload) or reject(error).

**POWCH_READY** is sent once from the INITIALIZE handler (with an `initializedRef` guard) when the iframe has loaded and rehydration (if any) is done.

```mermaid
sequenceDiagram
  participant Host
  participant SDK as app-sdk PowchBridgeClient
  participant App as PowchAppProvider
  participant PD as PowchData
  participant AM as App State Machine

  Host->>SDK: login() / sign()
  SDK->>SDK: requestId, store resolve/reject
  SDK->>App: postMessage(type, requestId, payload)
  App->>App: _actionId, actionResolversRef.set
  App->>PD: emitAppEvent(HOST_REQUEST, { type, ...payload, _actionId })
  PD->>App: _onEvent(); appEvent syncs to React state
  App->>AM: useEffect runs, handles HOST_REQUEST
  AM->>AM: case handler, resolveAction(_actionId, result)
  App->>SDK: postMessage(POWCH_RESPONSE, requestId, success, payload)
  SDK->>SDK: pendingRequests.get(requestId).resolve(payload)
  SDK->>Host: Promise resolved
```

---

## 3. State Constants

### APP_STATES

From `PowchData` (client-core), re-exported by PowchAppProvider:

| Constant | Value | Meaning |
|----------|--------|---------|
| `LOCKED` | `'app_locked'` | No credential or vault locked; user must unlock |
| `VAULT_UNLOCKED` | `'app_vault_unlocked'` | Blob decrypted in memory; can sign |

### FLOW_STATES

| Constant | Value | Meaning |
|----------|--------|---------|
| `IDLE` | `'flow_idle'` | No overlay; tab content visible |
| `AUTH_MAIN` | `'flow_auth_main'` | PowchMainView (Returning / New User) |
| `AUTH_CREATE` | `'flow_auth_create'` | CollectEmailView (auth flow COLLECT_EMAIL state) |
| `AUTH_VERIFY` | `'flow_auth_verify'` | VerifyEmailView |
| `AUTH_CONSENT` | `'flow_auth_consent'` | ConsentView (share with origin?) |
| `AUTH_CANCEL_RETURNING` | `'flow_auth_cancel_returning'` | ReturningUserCancelView |
| `AUTH_CANCEL_NEW` | `'flow_auth_cancel_new'` | NewUserCancelView |
| `WALLET_CONNECT` | `'flow_wallet_connect'` | WalletConnectView |
| `WALLET_SAVING` | `'flow_wallet_saving'` | Saving key (e.g. biometric) |
| `WALLET_MANAGER` | `'flow_wallet_manager'` | WalletManagerView |
| `SIGN_CONFIRM` | `'flow_sign_confirm'` | PowchTransactionFlow (confirm then POWCH_EXECUTE_SIGN) |
| `SIGN_UNLOCKING` | `'flow_sign_unlocking'` | Unlock vault for sign |
| `LOADING` | `'flow_loading'` | Generic loading |
| `SUCCESS` | `'flow_success'` | Success state |
| `ERROR` | `'flow_error'` | Error state |

---

## 4. Two State Machines and Single View Mutex (PowchAppProvider)

All view transitions route through a centralized **viewRouter(target)** and a single React state **currentView** updated only by **triggerViewChange**. There is no distributed render trigger (no `triggerRender`/`forceRender`). The DeSciX PWA React Developer's Guide (App SDK section of these docs) describes the pattern.

### 4.1 Single mutex: currentView and triggerViewChange

- **currentView** is a composite: `{ tab, flow, visualState }`. It is the only React state that drives what the shell and modal render.
- **triggerViewChange** is the only setter for that state. It is called exclusively from **viewRouter()**.
- Context exposes `currentView` and convenience getters (`currentTab`, `flowState`, `visualState`) derived from it. The shell (e.g. PowchStandaloneApp) and PowchModal render from `currentView` only.

### 4.2 App and View machines

- **App State Machine:** useEffect depends on **appEvent**. Handles INITIALIZE (rehydrate, post POWCH_READY once via initializedRef guard), REHYDRATE_COMPLETE, LOGIN_SUCCESS, LOGIN_FAILED, CONSENT_APPROVED, CONSENT_DENIED, VAULT_UNLOCKED, VAULT_LOCKED, SAVE_SESSION_COMPLETE, SAVE_SESSION_FAILED, LOGOUT, HOST_REQUEST. For HOST_REQUEST, branches by `payload.type` to start flow controllers or handle POWCH_LOGOUT, POWCH_TOGGLE_UI, POWCH_SET_TAB, etc. All handlers that affect view call **viewRouter(...)** (e.g. `viewRouter({})` to re-read getters, or `viewRouter({ tab: TAB_IDS.HOME, flow: null })` on LOGOUT).
- **View State Machine:** useEffect depends on **viewEvent**. Handles CHANGE_TAB, TOGGLE_UI, CLOSE_UI, SET_FLOW_STATE, SHOW_ERROR, CLEAR_ERROR, SET_VISUAL_STATE. Each handler calls **viewRouter(...)** with the appropriate partial update (e.g. `viewRouter({ tab: payload.tab })`, `viewRouter({ flow: null, visualState: null })`). viewRouter updates PowchData and calls triggerViewChange.
- **Visibility Lock:** Interactive commands (Login, Connect Wallet, Sign, Pay, Open, Manage, Toggle, Import Key) are allowed from Host. Background commands are ignored if state is `IDLE`.
- **Flow controllers:** The App Machine delegates to headless flow controllers: **POWCH_LOGIN** / **POWCH_AUTH** → `startFlow(AuthFlowController, payload)`; **POWCH_CONNECT_WALLET** → `startFlow(WalletConnectFlowController, payload)`; **POWCH_SIGN**, **POWCH_SIGN_TX**, **POWCH_SIGN_MESSAGE**, **POWCH_SIGN_TYPED_DATA** → `startFlow(SignFlowController, payload)` (when no flow controller is active, flowState SIGN_CONFIRM and UI dispatches POWCH_EXECUTE_SIGN); **POWCH_RECEIVE** / **POWCH_SEND** → `startFlow(PaymentFlowController, payload)`; **POWCH_IMPORT_KEY** → `startFlow(ImportFlowController, payload)`.

### Case List (High-Level API)

| Case | One-line description | Main state transitions |
|------|----------------------|-------------------------|
| `POWCH_LOGIN` | Start auth flow (SSO); returns identity | Start AuthFlowController |
| `POWCH_CONNECT_WALLET` | Connect wallet / sign message; returns walletAddress, walletSignature | Start WalletConnectFlowController |
| `POWCH_SIGN` | Request signature (message/tx/typedData) | Start SignFlowController |
| `POWCH_RECEIVE` | Deep link to receive payment | Start PaymentFlowController (RECEIVE) |
| `POWCH_SEND` | Deep link to send payment | Start PaymentFlowController (SEND) |
| `POWCH_OPEN` | Deep link to specific tab | — |
| `FLOW_COMPLETE` | Apply result; consent gate; resolveAction | → AUTH_CONSENT or IDLE |
| `POWCH_LOGOUT` | Clear blob, identity cache, session | → LOCKED, IDLE |
| `POWCH_TOGGLE_UI` | IDLE ↔ AUTH_MAIN | toggle |

---

## 5. Global State Machine Diagram (high-level)

```mermaid
stateDiagram-v2
  [*] --> LOCKED: initial
  LOCKED --> VAULT_UNLOCKED: unlockWithOptions / createPasskeyBlobWithCachedOptions (each on a tap)
  VAULT_UNLOCKED --> LOCKED: lockVault / timeout / session expiry

  state flow {
    [*] --> IDLE
    IDLE --> AUTH_MAIN: POWCH_LOGIN / POWCH_TOGGLE_UI
    AUTH_MAIN --> AUTH_LOGIN: returning user
    AUTH_MAIN --> AUTH_CREATE: new user
    AUTH_LOGIN --> IDLE: FLOW_COMPLETE + result
    AUTH_CREATE --> AUTH_VERIFY --> WALLET_CONNECT or IDLE: FLOW_COMPLETE
    AUTH_MAIN --> AUTH_CONSENT: FLOW_COMPLETE + require consent
    AUTH_CONSENT --> IDLE: consent approved/denied
    IDLE --> SIGN_CONFIRM: POWCH_SIGN
    SIGN_CONFIRM --> IDLE: POWCH_EXECUTE_SIGN + resolve
  }
```

When a flow controller is active, the modal is driven by that controller’s **visualState**; FLOW_STATES (e.g. AUTH_MAIN, SIGN_CONFIRM) apply when no controller is active.
