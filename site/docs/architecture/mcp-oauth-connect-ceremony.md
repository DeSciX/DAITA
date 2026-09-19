# MCP OAuth Connect Ceremony + Passkey→Wallet Determinism (as-built)

**Living reference — describes what the code does now.**

**Scope:** (1) the OAuth connect ceremony that binds an MCP client to a DeSciX account, and
(2) the passkey→wallet determinism & recovery model that makes the identity durable. Companion:
[`mcp-surface-admin-user-separation.md`](mcp-surface-admin-user-separation.md) (what a bearer
token may DO once minted). Open follow-on: the device-flow identity-duality window
[`../design/proposed/ws-identity-duality-w4-design.md`](../design/proposed/ws-identity-duality-w4-design.md).

---

## 1. Connect ceremony — authorize → /connect → complete → token

An MCP client (connector URL `{origin}/mcp`) drives a standard OAuth authorization-code flow
whose "login" step is the Powch passkey ceremony, not a password form:

1. **Authorize.** `GET /oauth/authorize` (`apiFront.js:1414`) creates a durable ceremony
   request and 302-redirects the browser to the Powch `/connect` page carrying the ceremony id
   (`apiFront.js:1426-1427`, `/connect?ceremony=...`).
2. **Ceremony (Powch).** `/connect` renders the Powch onboarding machine — `AuthFlowController.js`
   driving `OnboardingEntryChoice.jsx` / `LoginView.jsx` (there is no separate
   "ConnectCeremonyWidget"; `/connect` and `/device` converge on the same `AuthFlowController`).
   The passkey create/get ceremony runs here (§3), yielding an authenticated DeSciX session
   whose `descixUserId` is the passkey uid.
3. **Complete + mint code.** `completeConnectCeremony({ ceremonyId, descixUserId })`
   (`oauthAsHandlers.js:578`, called from `authCommands.js:376-384`) mints the OAuth
   authorization code (`:600`) and flips the ceremony record to `oauth_code_issued`
   (`:601-606`).
4. **Token.** The client exchanges the code for a JWT whose **`sub` is the passkey uid** —
   `.setSubject(descixUserId)` (`oauthAsHandlers.js:275`, in `:267-280`), where `descixUserId`
   is `user.id` = `sanitizeCredentialId(credentialId)` (`ipStorageUtils.js:14-16`; canonical
   note "userId = sanitized credentialId, no legacy branches" at `:1558`).

**Durable ceremony state.** Ceremony requests are Firestore-backed, not in-process:
`const COLLECTION_CEREMONY = 'OAuthCeremonyRequests'` (`oauthAsHandlers.js:46`); written by
`createCeremonyRequest` (`:537-558`), read/updated at `:586-606`. The header comment (`:42-45`)
records that this **replaced the in-process `oauthAuthorizeState` Map** — so a ceremony survives
across the stateless Cloud Function instances that may handle the authorize vs the complete leg.

**GitHub is provider-linking only.** GitHub is OUT of the authorize
trunk — the on-ramp is the Powch-first connect ceremony above. `GITHUB_CLIENT_SECRET` is
retained solely for linking a GitHub identity to an already-authenticated DeSciX account.

**Client-surface caveat.** The claude.ai **web** connector is currently broken upstream
(anthropics/claude-ai-mcp#574); **Claude Code works** and is the supported MVP on-ramp.

## 2. Device flow (sibling entry)

`GET /device?code=X` binds a headless CLI/MCP session. `completeDeviceLogin`
(`deviceAuthHandlers.js:220`) resolves the account **by email** (`User.findByEmail` at `:308`;
create `:309-340`; update-existing `:341-346`). This email-keyed join is the source of the open
identity-duality window (W4) — see the linked design; the passkey ceremony above keys by uid,
the device flow by email, and the two are not yet reconciled.

## 3. Passkey → wallet determinism (why the identity is durable)

The wallet is not stored — it is **re-derived from the passkey every time**, deterministically:

```
credential ──PRF(salt 'powch-prf-v1')──▶ prfOutput
  PRF_SALT const  webauthn.js:11 ; SAME salt in create (webauthn.js:175) AND get (webauthn.js:84-86)

prfOutput ──HKDF-SHA256(salt=credentialId, info='DeSciX-CloudKey-v1')──▶ cloudKey (32B)
  vaultOps.js:209-237 (deriveCloudKeyFromPRF); salt=credentialId :229 ; info :230/:200

cloudKey ──new ethers.Wallet(ethers.hexlify(cloudKey))──▶ master wallet
  PowchData.js:245  — the wallet private key IS cloudKey (also the vault encryption key)

credentialId ──sanitizeCredentialId──▶ uid   (register index.js:264 ; login index.js:314)
```

Consequences (this is Option A as-built; "Option B" is merely its recovery property):

- **Re-derivation always works.** WebAuthn PRF is deterministic per (credential, fixed eval
  input); the eval input is one constant in both ceremony directions, so the same credential
  yields the same `cloudKey` — hence the same wallet and vault key — forever.
- **No wallet without the passkey; no lost wallet while the passkey exists.** The wallet PK IS
  the vault encryption key; you cannot have a vault without the wallet key.
- **Browser-storage loss is not a vector.** The read ceremony takes `credentialId` from
  `assertion.id` via discoverable-credential discovery (`PowchData.js:181`).
- **Escape hatch.** `exportPaperBackup` (`PowchData.js:737-743`, call `:741`) exports `cloudKey`
  as a BIP-39 mnemonic (`cloudKeyToMnemonic`) — recovery even after authenticator loss, if
  exported. Authenticator lost without an exported mnemonic = key custody loss, not a phantom.

## 4. Consent-deferred wallet crossing

The wallet exists client-local **before** `finishRegistration` returns (`PowchData.js:245`), but
its **server visibility is consent-deferred** (`PowchData.js:260-270`): when `deferWalletRegistration === true`, `walletAddress` /
`walletSignature` are omitted from the finish payload (`:266-270`). The account uid is created
atomically at register-finish regardless; only the wallet ADDRESS crossing waits for explicit
consent.

## 5. Email-KYC gate and entitlement gating

- **CONNECTED is email-gated.** `descix_accept_tos` (handled in **Powch** `index.js:799`, gate
  `:840-869`) requires a verified email before committing `tos_accepted_at` — server-verified
  via an `EMAIL_VERIFICATIONS` doc or a prior `verified_email` (`:848-869`). Email is a required
  KYC attribute, never the join key.
- **Base entitlements are tos-gated.** `ensureBaseAppEntitlements` (`purchase.js:302`, call site
  `apiFront.js:952-953`) early-returns `{ granted: [], stamped: false, gated: 'pre_tos' }` when
  `tos_accepted_at` is absent (`purchase.js:325`).
  No stamp is written, so the pass re-runs on the first post-CONNECTED touch. Pre-gate grantees
  keep their grants (documented decision — free-tier discovery apps).

## 6. Divergence windows — closed vs open

The passkey layer forecloses a "phantom passkey" (a credential that can't reconnect to its
vault) at the cryptographic layer. Four server-state windows were found; four are CLOSED:

| # | Window | Status / anchor |
|---|--------|-----------------|
| W1 | wallet-consent-declined registration could never complete | CLOSED (landing vi) |
| W2 | re-entry never registered the server wallet even with consent | CLOSED — SUBMIT_TOS re-entry derives via `deriveMasterWalletForRegistration` (Powch `AuthFlowController.js:592-598` → `PowchData.js:645ff`, preserved `_cloudKey`) then `registerWalletAddress` (`AuthFlowController.js:602-606`) with the W5 proof |
| W3 | mid-register crash → credential with no USERS doc | CLOSED — all 3 login finishers upsert via `ensureUserDocForCredential` (`index.js:196-204`, called `:324/:489/:560`); a second ceremony self-heals to the SAME uid |
| W5 | any client-supplied address registrable; signature optional | CLOSED — signature + exact message REQUIRED; EIP-191 `ethers.verifyMessage` (`index.js:1159`) must match the claimed address (400 `wallet_signature_required` `:1150-1156` / 403 `wallet_signature_mismatch` `:1167-1173`) |
| **W4** | device flow joins/creates BY EMAIL — identity duality (not a passkey phantom) | **OPEN** — `ws-identity-duality-w4` (see linked design) |

Null-vault unlock preserves the re-derived `cloudKey` for a later persist without a second
ceremony (`PowchData.js:429-436`, `_cloudKey = cloudKey` at `:435`) — the mechanism behind the
W2/W3 self-heals.

## 7. Session identity plumbing

The unified `sessionInfo` helper `buildSessionInfo` (Powch `microservice/src/sessionInfo.js:32`)
is the single owner of session/role emission, consumed by all six Powch finishers
(`index.js:277, 328, 456, 493, 564, 585`) and `accept_tos` (`index.js:1127`). Cloud consumes the
proxied result generically — extracting `sessionInfo.roles` into its `userRolesMap`
(`apiFront.js:1123-1129`) — it does not mint sessionInfo itself.
