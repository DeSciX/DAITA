# Powch Data and Security Architecture

This document describes the data model, storage layers, and security boundaries in Powch. It reflects the design in `PowchData.js` and related models (Card, PowchVault, Tier3Store).

---

## 1. Design Principles

### 1.1 Confidentiality-First

- **"Vault Unlocked" = PRF key in memory.** When the vault is locked, no Tier 1 or Tier 2 plaintext exists in the app. The only durable state is encrypted (enclave blob and Tier 3 ciphertext).
- **No plaintext PII at rest.** Email, addresses, and identity live either inside the encrypted blob (enclave) or inside encrypted Tier 3 localStorage. Credential ID is the only non-encrypted identifier persisted (required for WebAuthn).
- **Minimal surface when locked.** `PowchData` exposes `hasCredential`, `isAuthenticated` (derived from cards when unlocked, or false when locked), and event emission. No card data or keys are readable until unlock.

### 1.2 Enclave as Source of Truth

- **Tier 1 and Tier 2 data live in the cloud vault (encrypted with CloudKey derived from PRF + credentialId). The vault blob is stored server-side; CloudKey is never stored.
- **Every Tier 1/2 write is an atomic commit.** `saveCards()` / `saveCard()` re-encrypts the full BlobV3 and writes it to the cloud vault via `putVault`. No partial or incremental blob updates.
- **Read path is unlock-then-read.** The app does not read “pieces” of the blob; it authenticates, decrypts the whole blob, and then serves from in-memory `_vault`.

### 1.3 Single Abstraction for Consumers

- **PowchData is the only data API.** UI and flow controllers call `PowchData.getCards()`, `PowchData.saveCard()`, `PowchData.getTier3Cards()`, `PowchData.unlockWithOptions(options)`, `PowchData.createPasskeyBlobWithCachedOptions()`, and `PowchData.signTransaction` / `signMessage` / `signTypedData`. They do not call vaultOps or low-level decrypt/encrypt for unlock or signing; they never touch `PowchVault`, `Tier3Store`, or vaultOps directly. See [architecture.md](./architecture.md) for SyncManager and flow detail.

### 1.4 PII Consent Paradigm

- **PII sharing requires consent.** All Tier 2 (PII) data sharing goes through CONSENT_GATE; no path returns PII without explicit user approval or vault-stored consent.
- **Host cannot set consent.** Only the user, via Powch UI (ConsentView), grants consent; the host sends `require` (requested fields), never consent state.
- **Silent bypass only when remembered.** CONSENT_GATE skips to FINISH silently only when `hasConsent(origin, require)` is true (user previously approved with "Remember this choice" stored in Tier3Store). See [detailed/consent-pii-paradigm.md](./detailed/consent-pii-paradigm.md).
- **Compatibility helpers:** Getters such as `email`, `displayAddress`, `getSites()`, `getSiteSettings()` map onto the Card/Tier3 model so views and flows get a simple API.

---

## 2. Three-Tier Security Model

Data is classified by sensitivity and persistence. Each tier has a clear storage location and access rule.

| Tier | Content | Storage | When readable | Encryption |
|------|---------|---------|----------------|------------|
| **Tier 1** | Private keys, payment secrets | Inside BlobV3 (enclave) | Only after unlock; secrets decrypted only at use (e.g. sign) | Blob-level AES-GCM (CloudKey from HKDF of PRF + credentialId); optional field-level for secrets |
| **Tier 2** | Email, crypto addresses, names, xPub | Inside BlobV3 (enclave) | When vault unlocked (plaintext in memory) | Blob-level AES-GCM (CloudKey) |
| **Tier 3** | Site consent, active card picks, SITE_PASS cards, session tokens | localStorage (`enc_powch_t3`) | When vault unlocked (decrypted with PRF-derived key into Tier3Store) | AES-GCM with PRF-derived session key; never synced to blob |

- **Tier 1 & 2** share the same blob and same key; tier is a logical classification (e.g. “this card has a secret field” vs “identity-only”). Both are wiped from memory on `lock()`.
- **Tier 3** is device/site-specific. It is encrypted so that a disk dump does not expose consent or session data without the user’s PRF (biometric). It is not written to the enclave so it does not sync across devices.

---

## 3. Data Structures

### 3.1 BlobV3 (Enclave)

The decrypted blob has a single top-level structure:

```javascript
{
  version: 3,
  cards: {
    [cardId]: {
      id, type, label, meta, secret, createdAt
    }
  }
}
```

- **version:** Always `3`.
- **cards:** Map of card ID to card JSON. No separate `identity` or `wallets` root; identity and wallet data are represented as cards (e.g. `EMAIL`, `CRYPTO_WALLET`).

### 3.2 Card Model

- **id:** UUID (or equivalent).
- **type:** One of `EMAIL`, `MASTER_ID`, `CRYPTO_WALLET`, `CREDIT_CARD`, `DID`, `SITE_PASS`, `CRYPTO_ASSET`, `CUSTOM`.
- **label:** User-facing label.
- **meta:** Object of non-secret fields (e.g. `address`, `verified` for EMAIL; `address`, `chain` for CRYPTO_WALLET). Stored and read as plaintext in memory when vault is unlocked.
- **secret:** Optional; null for types with no secret, or encrypted/ciphertext for sensitive fields (e.g. private key). Not logged or exposed in UI.
- **createdAt:** Timestamp.

Type-specific schemas (e.g. which keys go in `meta` vs `secret`) are defined in `Card.js` (TYPE_SCHEMAS). The vault does not store Tier 3–only cards (e.g. SITE_PASS) in the blob; those live in Tier3Store.

### 3.3 Tier3Store (Device Storage)

- **Storage key:** `enc_powch_t3` (localStorage).
- **Content (before encryption):** `{ cards, activeCards, siteConsent }`.
  - **cards:** Map of card ID to card JSON (e.g. SITE_PASS cards).
  - **activeCards:** Map of card type to selected card ID (e.g. “current” wallet for this device).
  - **siteConsent:** Map of origin to consent/sharing settings (e.g. email, walletAddress allowed for that site).
- **Encryption:** AES-GCM using a key derived from the same PRF output (with a distinct info string for “session-encryption”). Encrypt/decrypt helpers live in **vaultOps.js** (`encryptSession` / `decryptSession`).
- **Load/save:** Tier3Store is loaded in `PowchData.unlockWithOptions()` (after SyncManager.readWithOptions() returns) and saved when consent or Tier 3 cards change (when `_prfKey` is set). When the vault is locked, Tier3Store is not decrypted; PowchData exposes empty/default values for Tier 3 APIs until unlock.

---

## 4. PowchData: Roles and State

### 4.1 Responsibilities

- **Single Source of Truth (SSOT)** for app state that is not purely UI-local.
- **Layered storage engine:** Presents a single API; internally uses in-memory vault + Tier3Store and, for Tier 1/2, the enclave as backing store.
- **PRF key holder:** Holds the derived key in memory only when unlocked; clears it on `lock()` and `reset()`.
- **Event source:** Emits `PowchAppEvent` and `PowchViewEvent` so the React layer can react without being passed callbacks for every mutation.
- **Ceremony orchestration:** Delegates enclave read/create/write to `SyncManager` (`readWithOptions()`, `createCredentialWithCachedOptions()`, `writeToEnclave()`, `getPrfForExport()`, each with options fetched before the tap), which uses an injected `CeremonyProvider` so that WebAuthn and network are not hard-coupled inside core. See [architecture.md](./architecture.md).

### 4.2 Internal State (Static)

| Symbol | Meaning |
|--------|--------|
| `_prfKey` | CryptoKey (PRF-derived). Null when locked. Cached for the duration of the unlock period; used for enclave writes and signing without re-derivation. |
| `_vault` | Instance of PowchVault (BlobV3). Empty vault when locked. In-memory blob is a write-through cache of the encrypted enclave. |
| `_tier3` | Instance of Tier3Store. Empty when locked. |
| `_credentialId` | WebAuthn credential ID (persisted to localStorage for re-auth). |
| `_appState`, `_flowState`, `_currentTab`, `_menuOpen`, `_error`, `_visualState` | Ephemeral UI/flow state. |
| `_holdingsLoading`, `_holdingsError` | Holdings (CRYPTO_ASSET) loading and error state. |

No Tier 1/2 plaintext persists in any variable when the vault is locked; `_vault` is replaced with an empty PowchVault on `lock()`.

### 4.3 Lifecycle

- **initialize():** Loads `credentialId` from localStorage; sets `_vault` to empty PowchVault and `_tier3` to empty Tier3Store. Does not decrypt anything.
- **unlockWithOptions(options):** Takes the sign-in options fetched by `beginLoginOptions()` before the tap. Calls SyncManager.readWithOptions(options), whose first await is navigator.credentials.get(); sets credentialId, _prfKey. If blob is non-null: hydrates _vault from blob, loads Tier3Store. If blob is null (new user): sets empty _vault and new Tier3Store. Sets app state to VAULT_UNLOCKED, emits VAULT_UNLOCKED. Timeout is started inside SyncManager.readWithOptions().
- **createPasskeyBlobWithCachedOptions(options, data):** Calls SyncManager.createCredentialWithCachedOptions(options) (create() is the first await; options fetched before the tap); sets credentialId, _prfKey, empty _vault and Tier3Store. For new users. Emits VAULT_UNLOCKED.
- **lock():** Clears `_prfKey`, replaces `_vault` and `_tier3` with empty instances, sets app state to LOCKED, clears timeout, emits VAULT_LOCKED.
- **reset():** Calls `lock()`, clears `credentialId`, removes `enc_powch_t3` from localStorage, emits LOGOUT.

---

## 5. SyncManager and Enclave Operations

- **SyncManager** is owned by PowchData. It exposes **readWithOptions(options)** (WebAuthn get + PRF; derive CloudKey, fetch vault, decrypt; returns `{ blob | null, prfKey, credentialId }`), **createCredentialWithCachedOptions(options)** (WebAuthn create; derives CloudKey from PRF + credentialId), and **writeToEnclave(vault, credentialId, options)** (WebAuthn get + PRF; derive CloudKey, encrypt, putVault). No largeBlob. See [architecture.md](./architecture.md) for full detail.
- **CeremonyProvider** is injected by the host (e.g. PowchAppProvider) and provides beginLogin, finishLogin, authenticate (read); beginRegistration, createCredential, finishRegistration (create); beginWalletWrite, authenticate (write).
- **Vault timeout:** SyncManager starts or resets the timer at the end of readWithOptions(), createCredentialWithCachedOptions(), and writeToEnclave(). When the timer fires, it calls `PowchData.lock()`, the one emitter of VAULT_LOCKED. Default 15 minutes (configurable in code). A vault lock is not a sign-out: the App Shell's session (`AppData.sessionInfo`) stays until the token itself is refused (a 401) or the user logs out; a 401 locks the vault through `registerSessionExpiryCallback`.

---

## 6. Persistence Map

| What | Where | Encrypted |
|------|--------|-----------|
| Credential ID | localStorage `powch_credential_id` | No (required for WebAuthn) |
| Tier 1/2 data | Cloud vault (PowchVaults) | Yes (AES-GCM, CloudKey from PRF+credentialId) |
| Tier 3 data | localStorage `enc_powch_t3` | Yes (AES-GCM, PRF-derived session key) |
| DeSciX session of Powch's own App Shell | localStorage `sessionInfo`, `loginStatus` (app-sdk `AppData`) at the Powch origin | No |

Nothing else sensitive is written to localStorage or sessionStorage. In-memory state is cleared on lock/reset. A host's own session lives in the host origin's storage, never Powch's.

---

## 7. Public API (Summary)

- **Initialization / lifecycle:** `initialize()`, `unlockWithOptions()`, `createPasskeyBlobWithCachedOptions()`, `lock()`, `reset()`, `completeAuth(result)`.
- **Tier 1/2 cards:** `getCards(type?)`, `saveCards(cards, options)`, `saveCard(card, options)`, `removeCard(cardOrId, options)` (options from `beginWriteOptions()`, fetched before the tap).
- **Tier 3:** `getTier3Cards(type?)`, `saveTier3Card(card)`.
- **Resolve and signing (use cached `_prfKey` when vault unlocked):** `resolveAddress(address)` returns `{ walletId: cardId, keyIndex }` or null; `signTransaction(cardId, txData, makeRequest)`, `signMessage(cardId, message, makeRequest)`, `signTypedData(cardId, domain, types, value, makeRequest)`.
- **Accessors:** `credentialId`, `isUnlocked`, `hasCredential`, `email`, `displayAddress`, `isAuthenticated`, `selectedWalletId`, `appState`, etc.
- **Site consent (Tier 3):** `getSites(origin?)`, `getSiteSettings(origin)`, `setSiteSettings(origin, settings)`, `removeSite(origin)`, `clearStoredSession(origin)`.
- **Holdings (CRYPTO_ASSET cards in Tier3):** `getHoldingsCards()`, `holdingsLoading`, `holdingsError`, `setHoldingsLoading()`, `setHoldingsError()`, `completeHoldingsRefresh()`, `refreshHoldings()`; events `HOLDINGS_REFRESH_REQUESTED`, `HOLDINGS_UPDATED`, `HOLDINGS_ERROR`.
- **Events:** `emitAppEvent(type, payload)`, `emitViewEvent(type, payload)`; `appEvent`, `viewEvent` read by the provider.

---

## 8. Compatibility Helpers

- **email:** First EMAIL card’s `meta.address`, or null.
- **displayAddress:** First CRYPTO_WALLET card’s `meta.address`, or null.
- **isAuthenticated:** True if any EMAIL card exists (when unlocked).
- **getSites / getSiteSettings / setSiteSettings / removeSite:** Delegated to Tier3Store’s siteConsent; when vault is locked, Tier3 is not loaded so getSites returns [] and getSiteSettings returns null.
- **clearStoredSession(origin):** Same effect as `removeSite(origin)`: clears that origin's siteConsent and SITE_PASS card.
- **selectedWalletId:** Resolves from Tier3 active card selection when set.

AuthFlowController calls **PowchData.unlockWithOptions(options)** on the sign-in tap (or **PowchData.createPasskeyBlobWithCachedOptions(options, data)** on the New-account tap); it does not call decrypt or deriveEncryptionKey directly. After CollectEmailView returns verified email, the flow creates an EMAIL card and calls **PowchData.saveCard(emailCard)**. See [architecture.md](./architecture.md) for the current auth flow state machine.

---

## 9. File Reference

| Concern | File |
|--------|------|
| SSOT and storage engine | client-core `PowchData` |
| Enclave write orchestration | SyncManager inside `PowchData` |
| Vault blob and Tier 1 encryption | client-core `vaultOps`. vaultOps encapsulates: (1) cloud vault encrypt/decrypt (encryptVaultForCloud, decryptVaultFromCloud); (2) CloudKey derivation (deriveCloudKeyFromPRF); (3) Tier 1 field encryption (encryptPrivateKey, decryptPrivateKey). Tier 3 session: encryptSession, decryptSession. Key derivation: deriveEncryptionKey. |
| BlobV3 and card container | client-core `PowchVault` model |
| Card model and types | client-core `Card` model |
| Tier 3 encrypted store | client-core `Tier3Store` model (load/save use vaultOps encryptSession/decryptSession) |

---

## 10. Related Documents

- [Powch Architecture](./architecture.md) – Overall SDK/app split, state machines, and flow controllers.
- [prf-derived-master-wallet.md](./detailed/prf-derived-master-wallet.md) – PRF → CloudKey → master wallet: full walkthrough, one-touch registration.
