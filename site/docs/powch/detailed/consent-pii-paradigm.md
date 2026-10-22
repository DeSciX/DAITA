# Consent PII Paradigm

This document defines the security invariants for PII (Personally Identifiable Information, Tier 2 data) sharing in Powch. All PII sharing flows through this paradigm.

---

## Invariants

1. **PII sharing always requires consent** — No path returns PII without either explicit user approval (ConsentView) or vault-stored consent (`hasConsent` true).
2. **Host cannot set or bypass consent** — Only the user, via Powch UI, grants consent. The host sends `require` (what it wants); the host never sends or pre-sets consent state.
3. **Silent bypass only when remembered** — CONSENT_GATE skips to FINISH silently only when `hasConsent(origin, require)` is true (user previously approved with "Remember this choice" stored in Tier3Store).
4. **Deny by default — empty `require` releases NOTHING to the host page** (GUARDRAIL-2026-07-03-POWCH-CONSENT-INVERSION). "No PII requested → no prompt" never means "share anyway": with `consentedFields = []`, the FINISH result carries the session and no PII. This applies to the DeSciX platform itself as a host origin.
5. **Account creation is not a host share** (eabadir/Unkamon#68). Accepting the DeSciX ToS is the user's consent for DeSciX to hold the account: SUBMIT_TOS always registers the master wallet (`register_powch_wallet_address`) and sends the verified email (a required KYC attribute, CEO-D-2026-07-07-EMAIL-REQUIRED-KYC) to `descix_accept_tos`, whatever the host requested. The wallet pair is withheld from `powch_register_finish` only so nothing crosses before the user accepts the ToS.
6. **No side channels** — every PII field released to any host page passes the consent decision, through the canonical `ConsentRules` field-group matchers (`grantsEmail` / `grantsWalletAddress` / `grantsWalletSignature` and the `granted*Field` selectors). No call site may re-enumerate the field lists by hand.
7. **Origin is browser-authoritative** — the consent origin is stamped from the postMessage `event.origin` in PowchAppProvider's host listener; a host-supplied `payload.origin` is ignored. A malicious host cannot claim another origin's stored consent, and consented responses are posted back with the captured origin as `targetOrigin` (never `'*'`).

---

## Flow

Onboarding note (GUARDRAIL-2026-07-03-POWCH-CONSENT-INVERSION): in the new-user
flow, COLLECT_EMAIL_TOS_PK is collect-only (no network) and CONSENT_GATE resolves
BEFORE the server-side commit state SUBMIT_TOS, which always registers the master
wallet and sends the verified email to `descix_accept_tos` (invariant 5). "FINISH"
below therefore reads as "the continuation" — SUBMIT_TOS when a pending ToS payload
exists, then FINISH; consent governs only what FINISH releases to the host page.

```
Site Request (require; origin stamped from event.origin) → CONSENT_GATE
                                    │
                    ┌───────────────┴───────────────┐
                    │                               │
              No PII requested              PII requested
                    │                               │
                    ▼                               ▼
                 FINISH                    hasConsent(origin, require)?
           (NOTHING shared —
            consentedFields=[])
                    │                               │
                    │                   ┌───────────┴───────────┐
                    │                   │                       │
                    │                  YES                     NO
                    │         (vault-stored consent)            │
                    │                   │                       ▼
                    │                   │                SHOW_CONSENT_UI
                    │                   │                       │
                    │                   │              ┌────────┴────────┐
                    │                   │              │                  │
                    │                   │           APPROVE             DENY
                    │                   │              │                  │
                    │                   │    rememberChoice?               │
                    │                   │      │         │                 │
                    │                   │    YES        NO                 ▼
                    │                   │      │         │            Reject
                    │                   │  setSiteSettings              │
                    │                   │      │         │                 │
                    └───────────────────┴──────┴─────────┴─────────────────┘
                                                    │
                                                    ▼
                                                 FINISH
                                    (result filtered by consented fields)
```

---

## Storage

- **Tier3Store** (`enc_powch_t3`): Consent is stored in `siteConsent[origin].allowedFields` and `siteConsent[origin].fieldSourceMap`.
- **Encryption**: Tier3Store is encrypted with a PRF-derived session key; never synced to the blob.
- **Persistence**: Only when user checks "Remember this choice" and approves; `setSiteSettings(origin, { allowedFields, fieldSourceMap })` persists to Tier3Store.

---

## Field Mapping

- **Host sends:** `require` — array of field names (e.g. `['verified_email', 'wallet_address', 'wallet_signature']`).
- **User approves:** `approvedFields` — subset of requested fields user selected.
- **Stored:** `allowedFields` — same schema as `require` and `approvedFields`.
- **Field names:** `identity.email`, `verified_email`, `wallet_address`, `wallet_signature`, `crypto_address`, etc. See `PII_FIELDS` in PowchData.js and `FIELD_DEFINITIONS` in ConsentView.jsx.

---

## Per-Field Card Selection (fieldSourceMap)

When a user has multiple identity cards (EMAIL, MASTER_ID) or multiple wallet cards (CRYPTO_WALLET), ConsentView shows a **Select** for each PII field so the user can choose which card provides that field's value. The selection is stored in `fieldSourceMap` when "Remember this choice" is checked:

```javascript
siteConsent[origin] = {
  allowedFields: ['verified_email', 'wallet_address'],
  fieldSourceMap: {
    'verified_email': 'card-uuid-email-1',
    'wallet_address': 'card-uuid-wallet-2'
  },
  updatedAt: ...
}
```

At FINISH, AuthFlowController resolves PII from the specified cards via `PowchData.getEmailFromCardId()` and `PowchData.getWalletAddressFromCardId()`. If no `fieldSourceMap` entry exists, the default (first) card is used.

---

## Related Documents

- [flow-controllers.md](../flow-controllers.md#authflowcontroller) — Auth flow state machine
- [data-security-architecture.md](../data-security-architecture.md) — Tier3Store and data model
