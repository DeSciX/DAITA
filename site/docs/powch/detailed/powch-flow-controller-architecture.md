# Design: Powch Headless Flow Controller Architecture

## 1. Overview
The current Powch App architecture relies on a centralized protocol machine inside `PowchAppProvider` that drives UI changes via `useState` and `useEffect`. This leads to unnecessary re-renders, complex dependency chains, and difficulty managing non-visual background tasks (like crypto operations and blob writes).

The **Headless Flow Controller** rearchitecture decouples business logic from the React render cycle. Each flow becomes a self-contained "Script" executed by a non-rendering controller.

## 2. Core Components

### 2.1 The `BaseFlowController` (Headless)
A vanilla JavaScript class that manages flow logic independent of React. Implemented in Powch's React layer.

*   **`data`**: A non-reactive data store for the flow's lifecycle (request-scoped; merged with stepData on transition).
*   **`currentStep`**: The pointer to the current state in the flow's script.
*   **`visualState`**: Object `{ view, data, step }` set when entering a UI step; `view` is the component name, `data` is merged from `ctrl.data` and `step.props`, `step` is the state name.
*   **`onUIChange`**: Callback set by PowchAppProvider; when the controller enters a UI step, it sets `visualState` and calls `onUIChange(visualState)` to trigger a single React update.
*   **`promise`** / **`_resolve`** / **`_reject`**: The flow's promise; the caller (Host SDK or machine) awaits it; the controller calls `resolve(result)` or `reject(error)` when done.
*   **`send(event, eventData)`**: Invoked by the UI (via PowchModal) to send an event into the current step; the step's `on[event]` handler runs (string → transition to that state name; function → `(ctrl, eventData)` called).
*   **Step types**: A step is either **UI** (`type: 'UI'`, `view`, optional `props`, `on`) or **action-only** (no `type`, has `action`). UI steps update `visualState` and wait for `send()`; action steps run `action(ctrl)` immediately with no re-render.

### 2.2 The Flow Script (The "Script")
A declarative definition of the flow's state machine. Each state has either `type: 'UI'` plus `view` and `on`, or an `action` function.

*   **`step.props`** are merged into `visualState.data` when the step is entered, so the view receives `{ ...ctrl.data, ...step.props }`.
*   **`on`** handlers: key is the event name (e.g. `RETURNING`, `APPROVE`). Value can be a **string** (next state name) or a **function** `(ctrl, eventData) => ...` that may call `ctrl.transition(...)` or `ctrl.resolve()` / `ctrl.reject()`.

```javascript
{
  id: 'FLOW_ID',
  initial: 'START',
  states: {
    START: {
      action: async (ctrl) => { /* logic */ return ctrl.transition('NEXT'); }
    },
    USER_INPUT: {
      type: 'UI',
      view: 'ViewName',
      props: { mode: 'optional' },
      on: {
        SUBMIT: (ctrl, data) => { /* logic */ return ctrl.transition('SUCCESS'); },
        CANCEL: 'CANCEL_STATE'
      }
    }
  }
}
```

### 2.3 The Flow Container (`PowchModal.jsx`)
The Modal is a "Dumb Stage" that prioritizes the active flow controller when one is running.

*   When **`visualState`** is set (from the active flow controller's `onUIChange`), the modal renders `ViewRegistry[visualState.view]` with `visualState.data` as props.
*   It passes **`onNext`**, **`onCancel`**, **`onError`** to the view: these call `activeFlow.send(...)` or `activeFlow.reject(...)` so the view can drive the controller without touching the protocol machine.
*   When no flow controller is active, view changes are driven by the View Machine via **viewRouter** and **triggerViewChange** (single mutex); the resulting **currentView** (e.g. tab + flow) is reflected in the `flowState` path so the modal's `switch(flowState)` renders the correct view (e.g. AUTH_MAIN, SIGN_CONFIRM). The DeSciX PWA React Developer's Guide (App SDK section of these docs) describes the pattern.

## 3. Context and Communication

### 3.1 Flow Controller Context
Each flow controller receives a **context** object from PowchAppProvider when it is started. The context provides:

*   **State**: `isAuthenticated`, `wallet`, `displayAddress`, `isVaultUnlocked`, `credentialId` (no `blob` or `login` in context).
*   **API**: `makeApiRequest`, `powchClient` (createPowchApi(makeApiRequest)); no `powchClient.login` — flows use **PowchData.unlockWithOptions(options)** or **PowchData.createPasskeyBlobWithCachedOptions()**.
*   **Storage / consent**: Context exposes getters from **PowchData** and actions: `hasConsent(origin, fields)`, `setSiteSettings(origin, fields)`; identity via wallet, displayAddress backed by PowchData.
*   **App integration**: `completeRequestInternal(result)`; persistence and signing go through **PowchData** (e.g. **unlockWithOptions()**, **createPasskeyBlobWithCachedOptions()**, **saveCards(cards, options)**, **signTransaction(cardId, ...)**). See [architecture.md](../architecture.md) and [data-security-architecture.md](../data-security-architecture.md).
*   **Nested flows**: `dispatchFlow(FlowClass, options)` — ref-based so controllers can start another flow (e.g. Payment → Sign, Sign → WalletConnect) without calling React hooks.

### 3.2 Intra-Flow (Internal)
*   **Actions**: Async functions that perform API calls, crypto, or storage writes. They do **not** trigger React re-renders.
*   **UI steps**: Controller sets `visualState` and calls `onUIChange`; React re-renders once; the view later calls `send(event, data)` to continue.

### 3.3 Inter-Page (Global)
*   The `PowchAppProvider` manages the *active* controller via `activeFlowRef` and `startFlow(FlowControllerClass, options)`.
*   When a flow completes, it calls `resolve(data)`. The provider then cleans up the controller and returns the App to `IDLE`.

## 4. Security: The Visibility Lock
The controller architecture enforces the visibility lock by design. A flow can only be initiated if the App is "Open" or if the initiation event is an "Interactive Trigger" (e.g. `POWCH_LOGIN`, `POWCH_CONNECT_WALLET`, `POWCH_SIGN`, `POWCH_RECEIVE`, `POWCH_SEND`, `POWCH_OPEN`, `POWCH_IMPORT_KEY`). Background operations are strictly internal to the controller and cannot be triggered via the SDK bridge.

---

## 5. Flow Controllers (As-Built)

The flow controllers live in Powch's React layer, and each extends `BaseFlowController`: `AuthFlowController`, `SignFlowController`, `WalletConnectFlowController`, `ImportFlowController`, `PaymentFlowController`, `ClaimFlowController`, `PrintWalletFlowController`, `WalletManagerFlowController`, `CardTransferController`, `OfferAcceptController` and `SwapController`.

### 5.1 Import Flow (As-Built)
**ImportFlowController**: Trigger `POWCH_IMPORT_KEY`. Flow creates CRYPTO_WALLET cards and persists them from the vault-save tap step (VAULT_SAVE_PROMPT → VAULT_SAVE_ON_TAP, one **PowchData.saveCards** write); no addKeyToSession or saveSession(pendingKey). See [data-security-architecture.md](../data-security-architecture.md).

### 5.2 Wallet Connect Flow (As-Built)
**WalletConnectFlowController**: Trigger `POWCH_CONNECT_WALLET` (or as sub-flow from SignFlowController via `dispatchFlow(WalletConnectFlowController, options)` when user has no keys). Initial state: **SHOW_UI** (WalletConnectView; props from options: signatureMessage, startMode, instruction, isRequirement). Events from the view: `SELECT_EXISTING` → **HANDLE_EXISTING_SELECTION** (action; then back to SHOW_UI); `IMPORT_KEY` → **HANDLE_IMPORT** (action; then SHOW_UI); `GENERATE_WALLET` → **HANDLE_GENERATE** (action; then SHOW_UI); `LOAD_FROM_POWCH` → **ACQUIRE_PRF** (action; biometric login, then SHOW_UI); `CONFIRM` → **PROCESS_CONFIRMATION** (action: optional sign via PowchData signing; a new key goes to the vault-save tap step VAULT_SAVE_PROMPT, which saves it with **PowchData.saveCards** and then resolves with walletAddress, walletSignature, onboardingComplete); `CANCEL` → reject. See [data-security-architecture.md](../data-security-architecture.md) for saveCard and single-entry-point pattern. See [powch-flow-wallet-connect.md](powch-flow-wallet-connect.md).
