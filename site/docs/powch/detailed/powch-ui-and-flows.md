# Powch UI and Flows

Single source of truth for shell, tabs, flow-controller summary, and data/persistence rules. Per-flow state machines and flow controller architecture are in this folder — [powch-flow-auth.md](powch-flow-auth.md), [powch-flow-sign.md](powch-flow-sign.md), [powch-flow-payment.md](powch-flow-payment.md), [powch-flow-wallet-connect.md](powch-flow-wallet-connect.md), [powch-flow-controller-architecture.md](powch-flow-controller-architecture.md) (as-built single source of truth). Holdings tab content merged here (supersedes plan-holdings-tab-addendum.md).

---

## 1. Shell and Tabs

The shell and tab model (PowchShell, ShellHeader, TabNavigation, FlowOverlay, TAB_IDS, standalone vs platform entry) define the runtime host for flows. The flow summary table and Holdings tab below depend on that shell; for components, TAB_IDS, and FLOW_STATES, see [app-shell-enclosure.md](app-shell-enclosure.md).

---

## 2. Holdings Tab (single source of truth)

This section supersedes **plan-holdings-tab-addendum.md** and **DeSciX_Powch/docs/plan-holdings-tab-addendum.md**. All Holdings tab design and implementation details live here.

### Goal

A Holdings tab inside Powch that uses the same metadata-listing paradigm as wallet/sites (localStorage per device, data retrievable later) and internalizes the same DeSciX microservice command calls used by the DeSciX PWA Dashboard. Pre-cursor to tradeDEX: commands and UI patterns are already tested in the Dashboard; Powch reuses them.

### Metadata listing paradigm

- **Reference**: [PowchData.js](../packages/client-core/src/PowchData.js) is the SSOT; Tier 3 (sites, consent, session) and holdings cache are documented in [data-security-architecture.md](../data-security-architecture.md) and [data-layer.md](../data-layer.md) (PowchData, vaultOps).
- **Holdings**: Option B (cache + TTL) is implemented. Store last `get_portfolio_summary` result in `powch_holdings_cache`: `{ fetchedAt, wallet_address, data }`. On load, show cached data if fresh (e.g. &lt; 5 min); refresh by calling `get_portfolio_summary` again. Option A (watch list) can be added later for user-customizable order.

### Commands internalized

- **TradingDashboardWidget** (DeSciX PWA) calls `get_portfolio_summary`, `get_market_overview`, `get_user_nfts` via `makeCommandRequestJSON`.
- **Holdings tab** calls the same via Powch’s **makeApiRequest** (which uses `config.makeRequest` → apiFront → DeSciX_Cloud when embedded in PWA):
  - **Primary**: `get_portfolio_summary`. Requires wallet address: use current Powch wallet address from blob (selected key) or identity cache. Backend uses `wallet_address` from params or `user.wallet_address`.
  - **Optional**: `get_market_overview`, `get_pool_state` for per-token detail. No new Cloud commands.

### Registry-driven holdings / external wallets

Holdings are **registry-driven**: only assets in descix-chain Products are queried and displayed. For external (imported) wallets: **one `get_external_crypto_wallet_holdings` call per wallet**, **one CRYPTO_ASSET card per (wallet, holding) pair**. Key format: `external:${symbol}:${chain}:${walletAddress}`.

### Storage (client-core)

- **PowchData**: `holdingsCache` getter/setter (or client-core named exports `getHoldingsCache`/`setHoldingsCache` that delegate to PowchData) — read/write `powch_holdings_cache`; shape `{ fetchedAt, wallet_address, data }` or null. Scope: Powch origin only (localStorage).

### UI (HoldingsView)

- **Entry**: `TAB_IDS.HOLDINGS` → TabNavigation (Holdings) → **HoldingsView** ([views/HoldingsView.jsx](../packages/react/src/views/HoldingsView.jsx)).
- **Content**:
  - Wallet address from blob / identity (first key or display address). If no wallet, show "Connect a wallet to see holdings."
  - Call `refreshHoldings(walletAddress)` which uses `makeApiRequest('get_portfolio_summary', { wallet_address })` and updates cache via `setHoldingsCache`. On first load, optionally read from `getHoldingsCache()` and show cached data if within TTL; then refresh in background.
  - Display list of holdings (token_symbol, balance, value_usd, community_name, change_24h_percent) in a table/list. Optional: total value and 24h change from portfolio summary.
  - Refresh button: call `refreshHoldings` again; update cache on success.
- **Errors**: If `get_portfolio_summary` fails (e.g. not registered with DeSciX), show clear message and optionally link to connect/register.

### Code stack

- **PowchShell** → TabNavigation (Holdings) → **HoldingsView**.
- **HoldingsView** uses `usePowch()` for `wallet`, `holdings`, `refreshHoldings`.
- **PowchAppProvider** exposes `holdings` (from state/holdingsCache), `refreshHoldings(walletAddress)` which calls `makeApiRequest('get_portfolio_summary', { wallet_address })` and `setHoldingsCache` / setHoldingsCacheInternal.
- **client-core** PowchData (and re-exports): getHoldingsCache, setHoldingsCache delegate to PowchData.holdingsCache.

### Implementation order (relative to tradeDEX)

Holdings tab lists CRYPTO_ASSET cards. tradeDEX can add "Trade" actions from HoldingsView (e.g. per-row "Swap" that opens tradeDEX flow).

### Summary (Holdings surface)

| Layer | New / changed |
|-------|----------------|
| **client-core** | Holdings cache in PowchData (localStorage); getHoldingsCache, setHoldingsCache (delegate to PowchData). |
| **PowchAppProvider** | State `holdings`; action `refreshHoldings(walletAddress)`. |
| **Stateful shell** | TabNavigation with Holdings tab; PowchWidget routes to HoldingsView. |
| **HoldingsView** | Wallet address from blob, get_portfolio_summary via refreshHoldings, cache read/write, token list, refresh. |
| **DeSciX_Cloud** | No new commands; reuse get_portfolio_summary, get_market_overview. |

---

## 3. Flows (Flow Controllers)

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

Trigger: **POWCH_LOGIN** or **POWCH_AUTH** (payload: origin, require, purpose, brand, forceLogin). FlowRunner starts **AuthFlowController**. States: CHECK_SESSION, PROMPT_TYPE (Returning / New User), TRY_UNLOCK (PowchData.unlock()), UNLOCK_FAILED (UnlockFailedView), CREATE_PASSKEY_BLOB (PowchData.createPasskeyBlob()), CHECK_EMAIL_CARD, COLLECT_EMAIL (CollectEmailView), CONSENT_GATE, SHOW_CONSENT_UI, FINISH. See [powch-flow-auth.md](powch-flow-auth.md) and [architecture.md](../architecture.md).

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

## 4. Data and Persistence

### Inter-page / global

Events that change global state (blob, appState, flowState) go through the protocol machine. Persisted data:

- **Identity cache** and **site consent**: PowchData (powch_identity_cache, powch_sites, powch_session_&lt;origin&gt;).
- **Holdings cache**: PowchData (powch_holdings_cache).
- **Blob / credential**: PowchData and WebAuthn largeBlob (writes via machine or helpers, e.g. setBlobInternal after LOGIN_SUCCESS or completeRequestInternal).

Writes go through the same machine or helpers (e.g. setIdentityCache after LOGIN_SUCCESS / completeRequestInternal).

### Intra-flow

**flowData** holds request-scoped data: origin, require, purpose, signatureMessage, email, emailVerified, powchToken, walletAddress, walletSignature, verificationProof, pendingResult, _actionId, tx, message, domain, types, value, address, actionType. Local state in views (e.g. form fields) does not trigger global reloads; completion goes through **completeRequest** / **failRequest** and view changes through **setFlowState** (context) or **viewRouter** (provider) so the machine stays single source of truth.
