# Powch Architecture

Powch is a **zero-knowledge SSO and self-custody DeFi-Bank** application. The passkey is the identity; email and wallet are stored as **cards** in an encrypted vault. This document describes the architectural paradigms and how they map to the implementation.

---

## 1. Zero-Knowledge Concepts

### What the Server Never Sees

The server never sees:
- PRF output (biometric-derived key material)
- CloudKey (vault encryption key)
- Decrypted vault contents
- Private keys

### What the Passkey Ceremony Yields

A WebAuthn ceremony yields only attestation (create) or assertion (get). The client obtains PRF output from `assertion.clientExtensionResults?.prf?.results?.first` — this never leaves the device. Keys are derived locally.

### What the Backend Receives

| Operation | Backend receives |
|-----------|------------------|
| Registration | credentialId (sanitized as userId), attestation, walletAddress, walletSignature |
| Login | assertion; backend verifies, returns sessionInfo |
| Vault get/put | Opaque encrypted vault blob; access controlled by session (X-DeSciX-User-Id) |

### Implementation Mapping

- **Client:** Powch client-core: `PowchData` SyncManager, `vaultOps` `deriveCloudKeyFromPRF`
- **Backend:** the Powch microservice handles `powch_register_finish`, `powch_login_finish`, `powch_vault_get` and `powch_vault_put`

---

## 2. Passkey as Deterministically Derivable Portable Identity

### User ID = Sanitized CredentialId

The user ID is the WebAuthn credential ID, sanitized for use as a document key (e.g. `Hs-m5YEdCnBhEjbWlZ79VxwmcK4`). No separate "account ID" — the passkey IS the identity.

### CloudKey Derivation

```
CloudKey = HKDF-SHA256(prfOutput, credentialId, "DeSciX-CloudKey-v1")
```

CloudKey is re-derived on every biometric ceremony (read, write, export). It is never stored.

### No Key Object in largeBlob

There is no Key Object or largeBlob storage. CloudKey is derived on demand. Stateless recovery: user can recover on any device with passkey + keychain sync (iCloud, Google).

### One Credential, One Identity

One passkey, one portable identity, one master wallet. The identity syncs with the passkey via the OS.

---

## 3. One-Touch Account Creation and Immediate Crypto Onboarding

### Single Biometric to Crypto

A single WebAuthn create ceremony:
1. Creates the passkey
2. Yields PRF output
3. Client derives CloudKey from PRF + credentialId
4. Master wallet = CloudKey as Ethereum private key

No seed phrases. No separate wallet setup.

### Atomic Registration

`SyncManager.createCredentialWithCachedOptions(options)` (options prefetched before the New-account tap):
1. Performs WebAuthn create as the tap's first await
2. Derives CloudKey and master wallet
3. Signs DEFAULT_SIGNATURE_MESSAGE with the wallet
4. Sends attestation + walletAddress + walletSignature to `powch_register_finish`

The backend creates the user, stores the wallet, and returns sessionInfo. After email verification and TOS, the user lands at CONNECTED — no second ceremony.

**Reference:** [prf-derived-master-wallet.md](./detailed/prf-derived-master-wallet.md)

---

## 4. Safety and Convenience: Keychain Sync + Cold Storage

### Keychain Sync

The passkey syncs via the OS (Apple Passwords, Google Password Manager). CloudKey can be re-derived on any device with the synced passkey. Basic recovery requires no manual seed backup.

### Cold Storage (the wallet sheet)

The master wallet's private key is CloudKey. The wallet sheet (client-core `recoverySheet.js`, the one owner of `masterWalletFromCloudKey` and the sheet) prints the 24 words (`cloudKeyToMnemonic`, Powch's encoding: not a standard wallet seed) and the master private key as hex, which any EVM wallet imports to reach the master address's funds (funds-only recovery: the account, vault and credits stay with the lost passkey). AuthFlow makes it mandatory after the passkey is created (`PRINT_WALLET`, `flows/printWalletStep.js`); see [authentication.md](./authentication.md).

### Vault Deactivation vs Credit Card Deauthorization

Analogous to "deauthorize my card":
- Backend can revoke vault access (e.g. `powch_vault_revoke` or user flag)
- `powch_vault_get` returns 403 or empty when revoked
- Client keys remain on device, but the client cannot fetch the latest vault without server cooperation
- Server stops serving data; user regains control by revoking access on a stolen or lost device

---

## 5. Implementation Overview

### High-Level Flow

```mermaid
flowchart TB
    subgraph host [Host]
        Req[HOST_REQUEST]
    end
    subgraph app [PowchAppProvider]
        Runner[FlowRunner]
        Reg[CeremonyProvider]
    end
    subgraph flow [Flow Layer]
        FC[FlowController]
    end
    subgraph data [PowchData]
        SM[SyncManager]
        Vault[_vault]
    end
    Req --> Runner
    Runner -->|"pre-flight sign-in tap step if required"| data
    Runner --> FC
    FC -->|"unlock / createPasskeyBlob / saveCard"| data
    data -->|"read / createCredential / writeToEnclave"| SM
    SM -->|"window.DeSciX.call"| Reg
```

- **Host** sends requests via postMessage. The host must open the UI before sending; Powch rejects when its tab is not visible.
- **PowchAppProvider** invokes **FlowRunner** with the appropriate Flow class.
- **FlowRunner** performs pre-flight: if the flow requires vault unlocked and it is locked, it shows the sign-in tap step (UnlockFlowController: UnlockPromptView, LOGIN_PROMPT → tap → LOGIN_ON_TAP) before the flow starts; no passkey request runs without a tap.
- **FlowController** calls **PowchData** only: `unlockWithOptions(options)`, `createPasskeyBlobWithCachedOptions(options, data)`, `saveCards(cards, options)` / `saveCard(card, options)`, plus getters and signing APIs. Every passkey ceremony takes options fetched before the tap (ceremonyOptions.js) and runs as the tap's first await.
- **PowchData** delegates to **SyncManager**, which uses the injected **CeremonyProvider** for WebAuthn and network.

### SyncManager Operations

| Method | Purpose | Returns |
|--------|---------|---------|
| `beginLoginOptions()` / `beginRegistrationOptions()` / `beginWriteOptions()` | Fetch ceremony options before the tap (powch_login_begin / powch_register_begin / powch_write_wallet_begin). | options with `challengeTtlSeconds` |
| `readWithOptions(options)` | WebAuthn get + PRF (first await); derive CloudKey; fetch vault via `powch_vault_get`; decrypt. No largeBlob. A `powch_login_finish` reply without `recovery_confirmed_at` is refused. | `{ blob \| null, prfKey, credentialId, recoveryConfirmedAt }` |
| `createCredentialWithCachedOptions(options, data)` | WebAuthn create (first await); derive CloudKey + master wallet; send to finishRegistration. | `{ prfKey, credentialId, cloudKey, walletAddress }` |
| `writeToEnclave(vault, credentialId, options)` | WebAuthn get + PRF (first await); derive CloudKey; encrypt; putVault to cloud. | void |
| `getPrfForExport(options)` | WebAuthn get + PRF (first await) for the wallet sheet. | `{ prfOutput, credentialId }` |

### CeremonyProvider and Network

SyncManager uses an injected CeremonyProvider. Network calls go through `window.DeSciX.call` (App Shell bridge), not a direct `makeRequest`. The CeremonyProvider includes:
- `beginLogin()`, `finishLogin(assertion)` — login flow
- `beginRegistration()`, `createCredential(options)`, `finishRegistration({ attestation, walletAddress, walletSignature })` — registration
- `beginWalletWrite()`, `authenticate(options, extOptions)` — write ceremony
- `fetchVault()`, `putVault(cloudVault)` — cloud vault get/put

**Vault response shape:** The apiFront wraps responses in `message`. The client uses `vaultResult?.message?.cloudVault ?? vaultResult?.cloudVault` to handle both shapes.

### Command Routing (Cloud vs Powch Microservice)

- **Cloud (powchCommands.js):** `powch_register_finish`, `powch_login_finish` — user creation, session, Firestore
- **Powch service (external):** `powch_register_begin`, `powch_login_begin`, `powch_write_wallet_begin`, `powch_vault_get`, `powch_vault_put` — zero-knowledge WebAuthn and vault storage

### Detailed Implementation

- [data-layer.md](./data-layer.md) — PowchData, SyncManager, vaultOps, CeremonyProvider
- [data-security-architecture.md](./data-security-architecture.md) — Tier model, BlobV3, Card schema, security boundaries
- [flow-controllers.md](./flow-controllers.md) — FlowRunner pre-flight, per-flow requirements
- [developer-guide.md](./developer-guide.md) — Three cases, visibility paradigm, request routing
