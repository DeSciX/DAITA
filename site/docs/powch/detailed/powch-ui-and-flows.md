# Powch UI and Flows

Single source of truth for shell, tabs, flow-controller summary, and data/persistence rules. Per-flow state machines and flow controller architecture are in this folder — [powch-flow-sign.md](powch-flow-sign.md), [powch-flow-payment.md](powch-flow-payment.md), [powch-flow-wallet-connect.md](powch-flow-wallet-connect.md), [powch-flow-controller-architecture.md](powch-flow-controller-architecture.md) (as-built single source of truth); the Auth flow's state machine is in [flow-controllers.md](../flow-controllers.md#authflowcontroller).

---

## 1. Shell and Tabs

The shell and tab model (PowchShell, ShellHeader, TabNavigation, FlowOverlay, TAB_IDS, standalone vs platform entry) define the runtime host for flows. The flow summary table below depends on that shell; for components, TAB_IDS, and FLOW_STATES, see [app-shell-enclosure.md](app-shell-enclosure.md).

---

## 2. Flows (Flow Controllers)

Flows are implemented by **headless flow controllers**. When a flow is active, PowchAppProvider sets an active controller and the controller drives **visualState** (view name + data). PowchModal prioritizes **visualState**: it renders `ViewRegistry[visualState.view]` with `visualState.data` and passes **onNext** / **onCancel** / **onError** that call `activeFlow.send()` or `activeFlow.reject()`. When no flow controller is active, **currentView.flow** (from viewRouter) drives the flowState path (e.g. POWCH_TOGGLE_UI sets AUTH_MAIN; PowchModal’s `switch(flowState)` renders the corresponding view). See [powch-flow-controller-architecture.md](powch-flow-controller-architecture.md) for context and API.

### Flow summary

| Flow | Trigger (Host / internal) | Controller | Main states (summary) | Key views |
|------|----------------------------|------------|------------------------|-----------|
| Auth | POWCH_LOGIN, POWCH_AUTH | AuthFlowController | CHECK_SESSION → PROMPT_TYPE → TRY_UNLOCK or CREATE_PASSKEY_BLOB → CHECK_EMAIL_CARD → COLLECT_EMAIL or CONSENT_GATE → FINISH | PowchMainView, UnlockFailedView, CollectEmailView, ConsentView |
| Sign | POWCH_SIGN, POWCH_SIGN_TX, POWCH_SIGN_MESSAGE, POWCH_SIGN_TYPED_DATA | SignFlowController | PREPARE_DATA → REQUIRE_WALLET \| SELECT_WALLET \| SHOW_CONFIRM_UI → EXECUTE_SIGN (vault unlocked by FlowRunner pre-flight) | PowchTransactionFlow (select/confirm), nested WalletConnectFlowController |
| Payment | POWCH_RECEIVE, POWCH_SEND | PaymentFlowController | PREPARE_PAYMENT → SHOW_RECEIVE_UI / SHOW_SEND_UI → DISPLAY_QR or TRIGGER_SIGN → BROADCAST | WalletManagerView, HomeView (QR placeholder), WalletConnectView |
| Wallet Connect | POWCH_CONNECT_WALLET (or sub-flow from Sign) | WalletConnectFlowController | SHOW_UI ↔ HANDLE_EXISTING_SELECTION / HANDLE_IMPORT / HANDLE_GENERATE → PROCESS_CONFIRMATION (vault unlocked by FlowRunner pre-flight; no ACQUIRE_PRF) | WalletConnectView |
| Import | POWCH_IMPORT_KEY | ImportFlowController | CHECK_DATA → SHOW_IMPORT_UI \| EXECUTE_BIOMETRIC_SAVE; SHOW_IMPORT_UI (SUBMIT_PK) → EXECUTE_BIOMETRIC_SAVE | WalletManagerView (mode import) |

### Auth

Trigger: **POWCH_LOGIN** or **POWCH_AUTH** (payload: origin, require, purpose, brand, forceLogin). FlowRunner starts **AuthFlowController**. States: CHECK_SESSION, PROMPT_TYPE (Returning / New User), TRY_UNLOCK (PowchData.unlock()), UNLOCK_FAILED (UnlockFailedView), CREATE_PASSKEY_BLOB (PowchData.createPasskeyBlob()), CHECK_EMAIL_CARD, COLLECT_EMAIL (CollectEmailView), CONSENT_GATE, SHOW_CONSENT_UI, FINISH. See [flow-controllers.md](../flow-controllers.md#authflowcontroller) and [architecture.md](../architecture.md).

### Sign

Trigger: **POWCH_SIGN**, **POWCH_SIGN_TX**, **POWCH_SIGN_MESSAGE**, **POWCH_SIGN_TYPED_DATA** (payload: type, tx/message/domain+types+value, address). FlowRunner unlocks vault if needed (requirements.vaultUnlocked), then starts **SignFlowController**. States: PREPARE_DATA → REQUIRE_WALLET (nested WalletConnectFlowController) | SELECT_WALLET | SHOW_CONFIRM_UI → EXECUTE_SIGN. No AUTH_REQUIRED state. See [powch-flow-sign.md](powch-flow-sign.md).

### Payment

Trigger: **POWCH_RECEIVE** or **POWCH_SEND**. Machine starts **PaymentFlowController** with type RECEIVE or SEND. States: PREPARE_PAYMENT, SHOW_RECEIVE_UI / SHOW_SEND_UI, DISPLAY_QR (receive), TRIGGER_SIGN (send; nested SignFlow via `context.dispatchFlow`), BROADCAST. BROADCAST and QR generation are stubs in as-built. See [powch-flow-payment.md](powch-flow-payment.md).

### Wallet Connect

Trigger: **POWCH_CONNECT_WALLET** (payload: signatureMessage, startMode, instruction, isRequirement, purpose) or as sub-flow from SignFlowController. FlowRunner unlocks vault if needed, then starts **WalletConnectFlowController**. States: SHOW_UI with events to HANDLE_EXISTING_SELECTION, HANDLE_IMPORT, HANDLE_GENERATE, PROCESS_CONFIRMATION. LOAD_FROM_POWCH stays in SHOW_UI (no ACQUIRE_PRF). See [powch-flow-wallet-connect.md](powch-flow-wallet-connect.md).

### Import

Trigger: **POWCH_IMPORT_KEY** (payload: privateKey, label). Machine starts **ImportFlowController**. Flow creates a CRYPTO_WALLET card and persists via **PowchData.saveCard(card)**; no addKeyToSession or saveSession. See [data-security-architecture.md](../data-security-architecture.md) and [powch-flow-controller-architecture.md](powch-flow-controller-architecture.md) Section 5.1.

### Legacy flowState path

When no flow controller is active, the protocol machine still sets **flowState** and PowchModal uses its `switch(flowState)` to pick the view. This applies to: **IDLE**; **AUTH_MAIN** (e.g. from POWCH_TOGGLE_UI); **AUTH_CONSENT** (from FLOW_COMPLETE when consent is needed); **SIGN_CONFIRM** when the machine set flowData + SIGN_CONFIRM, UI dispatches POWCH_EXECUTE_SIGN). Cancel/recovery views (AUTH_CANCEL_RETURNING, AUTH_CANCEL_NEW) and **handleClose** (rejectAction + setFlowState(IDLE)) still apply where relevant.

---

## 3. Data and Persistence

### Inter-page / global

Events that change global state (blob, appState, flowState) go through the protocol machine. Persisted data:

- **Identity cache** and **site consent**: PowchData (powch_identity_cache, powch_sites, powch_session_&lt;origin&gt;).
- **Blob / credential**: PowchData and WebAuthn largeBlob (writes via machine or helpers, e.g. setBlobInternal after LOGIN_SUCCESS or completeRequestInternal).

Writes go through the same machine or helpers (e.g. setIdentityCache after LOGIN_SUCCESS / completeRequestInternal).

### Intra-flow

**flowData** holds request-scoped data: origin, require, purpose, signatureMessage, email, emailVerified, powchToken, walletAddress, walletSignature, verificationProof, pendingResult, _actionId, tx, message, domain, types, value, address, actionType. Local state in views (e.g. form fields) does not trigger global reloads; completion goes through **completeRequest** / **failRequest** and view changes through **setFlowState** (context) or **viewRouter** (provider) so the machine stays single source of truth.
