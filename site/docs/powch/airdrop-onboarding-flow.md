# Airdrop Onboarding Flow

This document describes the three-path onboarding menu and the airdrop-wallet
migration flow.

## Overview — entitlement AFTER connect

**Entitlement acquisition happens AFTER CONNECTED** and **zero entitlement is a
valid resting state**. A new
user goes straight to the passkey ceremony, becomes CONNECTED on email + TOS
alone, and is THEN offered the entitlement-acquisition choice.

Trunk: `PROMPT_TYPE(NEW)` → `CREATE_PASSKEY_BLOB` → `COLLECT_EMAIL_TOS_PK`
(email + TOS) → `CONSENT_GATE` → **CONNECTED** → `ACQUIRE_ENTITLEMENT_CHOICE`
(`OnboardingEntryChoice` view). Four co-equal branches, all converging on
on-chain token holding:

1. **I have an airdrop private key** → `ACQUIRE_AIRDROP` (`AirdropImportView`).
   The user pastes the airdrop PK (never leaves the browser); the view signs an
   EIP-191 challenge locally and calls the authenticated airdrop rail
   `airdrop_enqueue_migration` (snapshots the wallet's holdings) +
   `airdrop_commit_pending_master` (binds the airdrop wallet to the user's
   master wallet and queues the `pending_migrations` row the batch runner
   consumes).

2. **Buy with Card** → `FIAT_PURCHASE` (`FiatStubScreen`, now a real screen).
   Calls the **canonical** Cloud rail `create_stripe_checkout_session` and
   redirects to hosted Stripe checkout. On payment the webhook drives
   `settleConfirmedFunds → batchUpdateBalances` minting the community token to
   the user's master wallet (resolved server-side).

3. **Buy with Crypto** → `CRYPTO_PURCHASE` (`CryptoStubScreen`, now a real
   screen). Calls the registered Cloud command `create_crypto_quote` and renders
   the deposit address + amount. Full crypto settlement (deposit → chain-watcher
   → mint) E2E is deferred to the deployed phase (CryptoAPIs caller-IP ban blocks
   local egress).

4. **No thanks, continue** (SKIP) → `FINISH`. Lands at CONNECTED with zero
   entitlement — a valid state.

`ENFORCE_ANY_TOKEN_GATE` is **demoted to a pure UX hint** (whether to render the
SKIP affordance); it is no longer an access blocker. The master-wallet
zero-holdings 403 in `descix_accept_tos` was removed — a zero-entitlement
empty-wallet new user now reaches CONNECTED. The client passes the token SYMBOL
only for purchases; `community_id` is resolved server-side (never client-supplied).

## Command surface

| Command | Origin | Auth |
|---------|--------|------|
| `airdrop_check_pending` | Powch | user session (post T-AIRDROP-GUEST-ALLOWLIST, commit ca51a81) |
| `airdrop_enqueue_migration` | Powch | user session (post T-AIRDROP-GUEST-ALLOWLIST) |
| `airdrop_commit_pending_master` | Powch | user session (renamed from `airdrop_commit_pending_hd`, Chunk 5) |
| `airdrop_migration_pending_queue` | Powch | user session |
| `descix_accept_tos` | Powch | user session (extended signature, Chunk 3) |
| `confirm_wallet_any_registered_token` | Cloud | guest (PK-signed challenge; signature IS the authN) |
| `airdrop_execute_queue` | Cloud | service-account-only (CLOUD_SCHEDULER_SA) |
| `reconcile_migration` | Cloud | platform admin |

## State machine (restructured)

```
CHECK_SESSION ─┐
               ├─► PROMPT_TYPE(NEW) ─► CREATE_PASSKEY_BLOB ─► COLLECT_EMAIL_TOS_PK
               │                                                   │ (email + TOS)
               │                                                   ▼
               │                                              CONSENT_GATE ─► (CONNECTED)
               │                                                   ▼
               │                                       ACQUIRE_ENTITLEMENT_CHOICE
               │                                         ├─► ACQUIRE_AIRDROP ─► FINISH
               │                                         ├─► FIAT_PURCHASE    ─► (Stripe redirect)
               │                                         ├─► CRYPTO_PURCHASE  ─► FINISH
               │                                         └─► SKIP             ─► FINISH
               │
               └─► PROMPT_TYPE(RETURNING) ─► TRY_UNLOCK ─► CHECK_EMAIL_CARD
                                                          └─► CONSENT_GATE ─► FINISH
```

COLLECT_EMAIL_TOS_PK transitions:
- SUCCESS → CONSENT_GATE → (new user) ACQUIRE_ENTITLEMENT_CHOICE / (returning) FINISH
- A zero-entitlement empty-wallet new user reaches CONNECTED (master-wallet gate demoted)
- CANCEL → `ctrl.reject`

Note: `COLLECT_EMAIL_TOS_PK`'s collapsible airdrop-PK section still exists as a
pre-connect convenience and still routes through `descix_accept_tos`'s airdrop
path (which enqueues the migration). The post-connect `ACQUIRE_AIRDROP` branch is
the canonical entitlement-after-connect path.

## Firestore schema

The collections involved:
- `pending_migrations` (composite index on `status` + `created_at`;
  `airdrop_address` + `master_wallet_address` + `tokens_snapshot` fields)
- `AirdropVerifications` extension fields (`email`, `tokens_snapshot`)
- `on_chain_log` (composite index on `community_id` + `batch_id`)

## References

- `DeSciX_Powch/packages/react/src/views/OnboardingEntryChoice.jsx`
- `DeSciX_Powch/packages/react/src/views/CollectEmailTosPkView.jsx` (consolidated form)
- `DeSciX_Powch/packages/react/src/views/FiatStubScreen.jsx` (real Stripe checkout rail)
- `DeSciX_Powch/packages/react/src/views/CryptoStubScreen.jsx` (real create_crypto_quote rail)
- `DeSciX_Powch/packages/react/src/views/AirdropImportView.jsx` (post-connect airdrop import)
- `DeSciX_Powch/packages/react/src/core/PowchNetworkAPI.js` (createStripeCheckoutSession / createCryptoQuote)
- `DeSciX_Powch/packages/react/src/flows/AuthFlowController.js` (restructured state machine)
- `DeSciX_Powch/microservice/src/index.js` (descix_accept_tos handler, Chunk 3)
- `DeSciX_Powch/microservice/src/airdropCommands.js`
- `DeSciX_Cloud/microservice/services/commandHandlers/airdropCommands.js`
- `DeSciX_Cloud/microservice/services/commandHandlers/authCommands.js` (any-token gate wrapper)
- `DeSciX_Cloud/microservice/services/tokenService.js::confirm_wallet_any_registered_token`
- `DeSciX/tests/playwright/journey3/passkey-first-flow.spec.ts` (E2E verification, 2026-04-22) — in the SUPERREPO, not this repo; the suite is cross-cutting and its README owns how to authenticate a test
