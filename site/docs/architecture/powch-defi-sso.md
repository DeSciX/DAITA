# Powch: DeFi Banking + SSO

Powch is the **DeFi Banking + SSO layer** across the DeSciX DAO/DEX ecosystem. A single identity and wallet, shared across all DeSciX surfaces, with zero-knowledge architecture and hardware-wallet-grade security.

## DeFi Banking + SSO Role

### Single Sign-On

One identity across:

- DeSciX PWA (descix.net)
- Powch PWA (powch.descix.net)
- CLI and MCP
- Embedded apps (CodeSites, iframes)
- DAO governance and DEX interactions

Powch session tokens are accepted by all DeSciX services for authentication.

### DeFi Banking: "The Credit Card Rail for Web3"

Powch's payment service orchestrates:

- **Stripe Onramp**: Fiat → USDC
- **Crypto deposits**: Webhooks for on-chain deposits
- **Treasury relayer**: Gas-sponsored on-chain execution
- **P2P transfers**: Send-to-email

## Zero-Knowledge Shared Userbase

- **Server never sees**: Private keys, wallet data, plaintext emails (only hashes during verification)
- **Client-side encryption**: All wallet data encrypted with PRF-derived keys from the passkey
- **One identity**: Shared across DeSciX, Powch, and embedded apps without exposing PII

## Passwordless One-Touch Login

- **Passkey = identity**: WebAuthn-based; no passwords
- **Biometric gating**: FaceID, TouchID, Windows Hello for all sensitive operations
- **One tap**: Sign in across DeSciX PWA, Powch PWA, embedded CodeSites, CLI device flow

## Crypto Convenience and Security

### Credit-Card-like UX

- **Keychain sync**: Passkeys and wallet metadata backed up via iCloud/Google sync
- **Self-custody**: Users maintain full control; no key export

### Vault Disable/Enable

When a phone is lost:

- **Deauthorize**: Disable the vault to invalidate all sessions
- **Re-authorize**: Re-enable the vault on a recovered or new device to restore access

This provides recovery without exposing keys or PII.

### Hardware-Wallet-Grade Security and Anonymity

- Self-custody with no custodial fallback
- Minimal PII; keys never leave the device in plaintext
- Sensitive data (credit cards, wallets) under Powch's control; DeSciX PWA never sees private keys or raw wallet data

## Integration Points

| Surface | Mechanism |
|---------|-----------|
| **PWA** | `PowchBridgeProvider`, `usePowchBridge()`, `PowchSideBarWidget` iframe |
| **CLI/MCP** | Device code flow (`/device?code=X`) → Powch auth → `completeDeviceLogin` |
| **Embedded** | `window.DeSciX.loginWithSessionToken` after bridge returns session |

For PWA bridge details, see [PWA overview](../app-sdk/pwa-sdk/pwa-overview.md).

## Separation of Concerns

| Component | Handles | Does NOT Handle |
|-----------|---------|-----------------|
| **Powch** | Identity (email), wallet (address, signature), sensitive data (credit cards), biometric UI | Site TOS, business logic, purchases, roles |
| **DeSciX PWA** | Site TOS, state machine, feature gating | Private keys, biometric prompts, wallet generation |
| **DeSciX Backend** | User CRUD, purchases, roles, permissions | Wallet data, passkey management |

## Related

- [PWA overview](../app-sdk/pwa-sdk/pwa-overview.md) – Bridge-based auth
- [App shell and SDK](app-shell-and-sdk.md) – Provider stack
- [What is DeSciX](../what-is-descix.md) – Platform overview
