# App Usage & Entitlement Reporting — `report_app_usage`

**Workstream:** WS-FRQTL-APPIFY · **Decision:** CEO-D-2026-06-08-WS-FRQTL-APPIFY-GO
**Owner:** EVP-DeSciX (platform side) · **First consumer:** the `frqtl` npm CLI (EVP-FRAQTL)

## Purpose

`report_app_usage` is the thin platform command an **external app SDK** (e.g. the `frqtl`
npm CLI wrapping the FRAQTL/EGPTMath WASM engine) calls on each invocation to:

1. **Verify** the caller holds a one-time/permanent entitlement for a purchasable app, and
2. **Emit exactly one** GA4 `egpt_frqtl_usage` event per verified call (usage analytics).

It is a thin wrapper over the existing entitlement engine (`verify_subscription`) plus the
existing GA4 sink (`ga4EventService`). No new entitlement, payment, or auth machinery.

## Command Contract (canonical — wired by EVP-FRAQTL)

| | |
|---|---|
| **Command name** | `report_app_usage` |
| **Handler** | `services/commandHandlers/ragCommands.js` (registered `registry.js`) |
| **Auth** | Authenticated only. NOT in `GUEST_ALLOWED_COMMANDS` → apiFront rejects guests. Caller uses the wallet-sig session rail (`.descix/wallet.json` → `reconnect_by_wallet`). |
| **Params** | `{ app_id }` — e.g. `'egpt-frqtl'`. **No `community_id` from the client** — apiFront middleware hydrates it from `Products/{app_id}`. |
| **Returns** | `{ verified: boolean, expiresAt: string\|null }` — `expiresAt: null` ⇒ permanent / one-time entitlement. |
| **Side effect** | Emits exactly ONE GA4 `egpt_frqtl_usage` event (**app_id only**) per `verified===true` call. Fire-and-forget; never throws on emit failure; **no event on a non-verified call**. |

### Invocation from an external SDK

```js
import { createApiClient } from '@descix/cli/api-client';
const client = createApiClient();
await client.initialize();                       // finds .descix/workspace.json, loads wallet
const r = await client.invoke('report_app_usage', { app_id: 'egpt-frqtl' });
if (!r.message.verified) throw new Error('egpt-frqtl entitlement required');
```

The SDK wires `requireEntitlement('egpt-frqtl')` at CLI `main()` to call this and hard-block
when `verified === false`.

## Entitlement write path (infra-before-code, verified live on DEV)

Ownership of an app does **not** by itself write a `USER_PURCHASES` record (the owner passes
`verify_subscription` only via the owner-fallback branch). For a generic entitled user the
record is written by **`grant_app_entitlement`** (or a one-time APP purchase):

```
grant_app_entitlement(appCommands.js:1108)
  → purchase_product({ product_type: APP })        (purchase.js:401)
  → user.purchase_product_firestore(productPath = Community/{cId}/Apps/{aId},
                                     type=APP, docId=app_id)   (ipStorageUtils.js:2301)
  → new Purchase(..., expires_at=null)             (cloud-core storageUtils.js:573)
  → to_dict() OMITS ExpiresAt when null            (storageUtils.js:617-619)
```

`verify_subscription` (purchase.js:1217) honors it via the permanent branch:
`isForApp = ProductPath.includes('/Apps/{app_id}')` (purchase.js:1291) AND
`if (!purchase.ExpiresAt)` (purchase.js:1297) ⇒ `verified:true, expiresAt:null`.

**Live evidence (DEV):** persisted doc `UserCache/{user}/Purchases/egpt-frqtl` =
`{ PurchaseId:'egpt-frqtl', ProductType:'APP', ProductPath:'Community/egpt/Apps/egpt-frqtl' }`
with **`ExpiresAt` absent**. `verify_subscription({app_id:'egpt-frqtl'})` →
`{verified:true, expiresAt:null}`.

## Analytics rule (DeSciX/CLAUDE.md)

- Event name: `egpt_frqtl_usage`. Params: **`app_id` only** + `source`. **NEVER `community_id`.**
- `deploy_env` + `engagement_time_msec:1` auto-added by `ga4EventService.emitEvent`.
- Emit lives in the `ragCommands.js` handler via the sanctioned `emitFrqtlUsageEvent`
  convenience (ga4EventService.js, alongside `emitAiChatEvent`). Fire-and-forget; `console.warn`
  on failure; never blocks the response.

## Tests (in `microservice/tests/`)

- `ws-frqtl-appify-infra-gate.mjs` — grant + verify over the real `/apifront` wallet-sig rail.
- `ws-frqtl-appify-record-read.mjs` — raw persisted `USER_PURCHASES` doc: `ExpiresAt` absent.
- `ws-frqtl-appify-report-usage-livetest.mjs` — `report_app_usage`: entitled `{verified:true,
  expiresAt:null}`, non-entitled `{verified:false}`/no-emit, GA4 payload accepted by the MP
  debug endpoint (`validationMessages:[]`).
