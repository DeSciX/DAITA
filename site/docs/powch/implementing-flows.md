# Developer Guide: Implementing Flows

**Audience:** Developers extending Powch with new user flows or maintaining existing flow controllers.

This guide describes how to create and wire flow controllers in Powch. Flows are headless state machines that encapsulate business logic and render UI via a ViewRegistry. See [flow-controllers.md](./flow-controllers.md) for flow-specific documentation and [architecture.md](./architecture.md) for the broader platform design.

---

## 1. Overview

Flows are **headless state machines** — they manage logic and state transitions but do not render. React views are selected by view name; PowchModal resolves view names from the ViewRegistry and forwards user events back to the active flow.

- **FlowRunner** runs flows and handles pre-flight (e.g. vault unlock).
- **BaseFlowController** provides the state-machine engine; all flows extend it.
- **Views** receive props from the flow and emit events via `onNext`, `onCancel`.

---

## 2. Flow Contract

### Requirements

Flows declare `static requirements = { vaultUnlocked: boolean }`:

- **`vaultUnlocked: true`** (default): FlowRunner unlocks the vault before starting. Use for flows that need to read/write vault data (sign, import, export, wallet manager).
- **`vaultUnlocked: false`**: Flow handles unlock itself (e.g. AuthFlowController for login/create).

```javascript
// BaseFlowController default
static requirements = { vaultUnlocked: true };

// AuthFlowController override
static requirements = { vaultUnlocked: false };
```

### Context API

Flow controllers receive a `context` object from FlowRunner:

| Method | Purpose |
|--------|---------|
| `dispatchFlow(FlowClass, options)` | Start a nested (sub-) flow; parent resumes on resolve |
| `signWithSession(message, address)` | Sign using session/keychain |
| `completeRequestInternal(result)` | Complete host request (auth, sign) |
| `isVaultUnlocked` | Whether vault is unlocked |
| `wallet` | Current wallet projection |
| `credentialId`, `hasCredential` | Passkey state |

Flows call **PowchData** directly for persistence: `PowchData.saveCard()`, `PowchData.exportPaperBackup()`, etc. No separate auth service in context.

---

## 3. Flow Props

Flows use explicit Prop classes to unify caller intent and runtime state. **Strict enforcement:** callers must pass Props instances from factory methods only. FlowRunner throws if a flow with `FlowClass.Props` receives a plain object.

### FlowPropsBase

All flow Props extend `FlowPropsBase`:

```javascript
export class FlowPropsBase {
  static from(obj) {
    return Object.assign(new this(), obj ?? {});
  }
  toJSON() {
    return { ...this };
  }
}
```

`from()` is used internally by factories; callers must use factory methods, not `from()`.

### Per-Flow Props and Factories

Each flow that needs structured input defines a Props class with static factory methods:

| Flow | Props Class | Factories |
|------|-------------|-----------|
| AuthFlowController | AuthFlowProps | `login(opts)` |
| WalletConnectFlowController | WalletConnectFlowProps | `addWallet()`, `connect(opts)`, `sign(opts)`, `selectOnly(opts)` |
| ImportFlowController | ImportFlowProps | `standard()`, `fromKey(opts)` |
| ExportPaperBackupFlowController | ExportPaperBackupFlowProps | `standard()` |

### Usage

**Internal call sites (PowchAppProvider, sub-flows):** Use factories for intent:

```javascript
runFlow(WalletConnectFlowController, WalletConnectFlowProps.addWallet(), deps);
runFlow(AuthFlowController, AuthFlowProps.login(), deps);
dispatchFlow(ImportFlowController, ImportFlowProps.standard());
```

**Host payloads:** Host adapters use purpose-specific factories:

```javascript
// POWCH_CONNECT_WALLET from postMessage
runFlow(ConnectFlow, WalletConnectFlowProps.connect(normalized), deps);

// POWCH_LOGIN / POWCH_AUTH — creates/updates SITE_PASS on FINISH for the host origin
runFlow(AuthFlow, AuthFlowProps.login(payload), deps);
```

When `POWCH_LOGIN` or `POWCH_AUTH` completes (FINISH), a SITE_PASS card is created or updated for the requesting origin via `PowchData.upsertSitePassForOrigin()`. The host may pass optional `brand: { name, iconUrl, bgColor, shortDescription }` in the payload to customize the site pass.

### FlowRunner Strict Enforcement

When a flow declares `static Props = SomeFlowProps`:

- If `options instanceof FlowClass.Props`: use as-is.
- Else: **throw** an error. Plain objects are not accepted.

Flows without `Props` (SignFlow, WalletManager) continue to accept plain objects.

---

## 4. Creating a New Flow

### Step 1: Extend BaseFlowController

Define a script with `initial` and `states`. Each state is either:

- **`type: 'UI'`**: Renders a view; `view` must exist in ViewRegistry; `on` maps events to transitions.
- **`action`**: Async function; no UI; call `ctrl.transition()` or `ctrl.resolve()`.

```javascript
import { BaseFlowController } from './BaseFlowController.js';

export class MyFlowController extends BaseFlowController {
  constructor(props, context) {
    const script = {
      id: 'MY_FLOW',
      initial: 'SHOW_UI',
      states: {
        SHOW_UI: {
          type: 'UI',
          view: 'MyView',
          props: (ctrl) => ({ message: ctrl.props.message }),
          on: {
            SUBMIT: 'HANDLE_SUBMIT',
            CANCEL: (ctrl) => ctrl.reject(new Error('Cancelled')),
          }
        },
        HANDLE_SUBMIT: {
          action: async (ctrl) => {
            await PowchData.doSomething(ctrl.props);
            ctrl.resolve({ success: true });
          }
        }
      }
    };
    super(script, props, context);
  }
}
```

### Step 2: Add the View to ViewRegistry

In `PowchModal.jsx`, import your view and add it to `ViewRegistry`:

```javascript
import { MyView } from './views/MyView.jsx';

const ViewRegistry = {
  // ...
  MyView,
};
```

### Step 3: Register for Host Invocation (Optional)

If the flow should be startable from host postMessage, add it to `FlowRegistry.js`:

```javascript
import { MyFlowController } from './MyFlowController.js';

export const FlowRegistry = {
  // ...
  POWCH_MY_FLOW: MyFlowController,
};
```

Add the command to `ALLOWED_HOST_COMMANDS` in PowchAppProvider.

### Step 4: Add View Event Handler (Optional)

For standalone entry (e.g. hamburger menu, Cards home), add a `PowchViewEvent` and handler:

**PowchData.js:**

```javascript
OPEN_MY_FLOW: 'OPEN_MY_FLOW',
```

**PowchAppProvider.jsx** (view event switch):

```javascript
case PowchViewEvent.OPEN_MY_FLOW:
  if (flowDepsRef.current) runFlow(FlowRegistry.POWCH_MY_FLOW, {}, flowDepsRef.current);
  break;
```

**Context:**

```javascript
openMyFlow: () => PowchData.emitViewEvent(PowchViewEvent.OPEN_MY_FLOW),
```

---

## 5. Sub-Flow Pattern (Handoff)

Parent flows can delegate to child flows. The child replaces `activeFlowRef`; when it resolves, the parent continues.

### Usage

In an **action** step, call `dispatchFlow`:

```javascript
HANDLE_DISPATCH_IMPORT: {
  action: async (ctrl) => {
    await ctrl.context.dispatchFlow(ImportFlowController, ImportFlowProps.standard());
    return ctrl.transition('SHOW_UI');
  }
}
```

FlowRunner passes `_isInternalTransition: true` so the child does not conflict with an existing active flow.

### Example: Import from Backup

WalletConnectFlowController dispatches ImportFlowController when the user selects "Import from backup". The ImportFlowController shows its own UI (WalletManagerView in import mode), saves the card via `PowchData.saveCard()`, and resolves. The parent returns to `SHOW_UI`; the context wallet now includes the new key.

---

## 6. Entry Points

| Entry Type | Mechanism |
|------------|-----------|
| **Host command** | `POWCH_*` postMessage → FlowRegistry → `runFlow(FlowRegistry.POWCH_X, payload, deps)` |
| **View event** | `PowchData.emitViewEvent(OPEN_X)` → view event handler → `runFlow(...)` |
| **Context action** | `openExportPaperBackup()` → emit view event → runFlow |
| **Sub-flow** | `ctrl.context.dispatchFlow(ChildFlow, opts)` from parent action |

---

## 7. Reference Flows

| Flow | Purpose | Entry Points |
|------|---------|--------------|
| **ImportFlowController** | Import private key; creates CRYPTO_WALLET card | Hamburger "New Wallet" (via WalletConnect), WalletConnect dropdown "Import from backup" |
| **ExportPaperBackupFlowController** | Export recovery phrase (CloudKey as mnemonic) | Hamburger "Export Paper Backup", WalletManagerView (inline) |
| **WalletConnectFlowController** | Select/create/import wallet; optional sign | Hamburger "New Wallet", Cards home Wallets plus, SignFlow sub-flow |
| **AuthFlowController** | Login/register; passkey, email, consent | Host POWCH_LOGIN, openUi |

---

## 8. Optional: Offer Export After Wallet Creation

To offer export paper backup after every wallet creation or import (including master wallet), add a step that dispatches ExportPaperBackupFlowController:

```javascript
// After saveCard in PROCESS_CONFIRMATION or after CREATE_PASSKEY_BLOB
try {
  await ctrl.context.dispatchFlow(ExportPaperBackupFlowController, ExportPaperBackupFlowProps.standard());
} catch {
  // User cancelled — parent still resolves
}
return ctrl.resolve(result);
```

Alternatively, add an intermediate UI step that asks "Export paper backup now?" and only dispatch if the user confirms.

---

## 9. Related Documentation

| Document | Description |
|----------|-------------|
| [flow-controllers.md](./flow-controllers.md) | Flow state machines and events |
| [architecture.md](./architecture.md) | FlowRunner, SyncManager, flow contract |
| [developer-guide.md](./developer-guide.md) | Platform overview, deployment cases |
