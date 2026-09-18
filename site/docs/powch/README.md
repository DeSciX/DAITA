# Powch Documentation

Powch is a **zero-knowledge SSO and self-custody DeFi-Bank** application. The **passkey is the zero-knowledge identity**; everything else (email, wallet) is stored as **cards** in an encrypted vault. Any app using the SDK is a valid **sender or receiver** of identity and assets via the bridge (postMessage). The backend handles fees (Stripe, network gas) transparently. **Current focus:** holdings and send/receive reliability and debugging.

**Key Capability — One-touch registration:** A single biometric creates the passkey and derives the master wallet. Users reach CONNECTED (identity + crypto wallet) in one flow—no seed phrases, no separate wallet setup. See [prf-derived-master-wallet.md](./detailed/prf-derived-master-wallet.md).

**Start here:** Integrators → [developer-guide.md](./developer-guide.md). Contributors → [architecture.md](./architecture.md), then [data-layer.md](./data-layer.md).

## Primary Documentation

**Integrators**

| Document | Description |
|----------|-------------|
| [developer-guide.md](./developer-guide.md) | Primary developer reference: three cases, visibility paradigm, request routing |

**Architecture and data**

| Document | Description |
|----------|-------------|
| [architecture.md](./architecture.md) | Core architecture, package structure, state machines, and key patterns |
| [data-security-architecture.md](./data-security-architecture.md) | Data and security reference: data model, tiers, PowchData, vaultOps |
| [data-layer.md](./data-layer.md) | Data layer (PowchData, vaultOps) |

**Flows**

| Document | Description |
|----------|-------------|
| [flow-controllers.md](./flow-controllers.md) | Flow controller state machines for auth, sign, wallet connect, and import |
| [implementing-flows.md](./implementing-flows.md) | Guide for creating and wiring new flow controllers |

## Detailed Reference

The `detailed/` directory contains granular documentation for specific subsystems:

| Document | Description |
|----------|-------------|
| [powch-state-machine.md](./detailed/powch-state-machine.md) | Event types and protocol call stack |
| [powch-flow-auth.md](./detailed/powch-flow-auth.md) | Auth flow state-by-state reference |
| [consent-pii-paradigm.md](./detailed/consent-pii-paradigm.md) | PII consent invariants, flow, and storage |
| [powch-flow-sign.md](./detailed/powch-flow-sign.md) | Sign flow state-by-state reference |
| [powch-flow-wallet-connect.md](./detailed/powch-flow-wallet-connect.md) | Wallet connect flow reference |
| [powch-flow-payment.md](./detailed/powch-flow-payment.md) | Payment flow reference (stubs) |
| [powch-ui-and-flows.md](./detailed/powch-ui-and-flows.md) | Shell, tabs, and Holdings tab details |
| [app-shell-enclosure.md](./detailed/app-shell-enclosure.md) | Shell nesting for platform, standalone app, and Powch identity silo (Cases 1–3) |
| [standalone-app-shell-and-zero-dependency-design.md](./detailed/standalone-app-shell-and-zero-dependency-design.md) | Deployment cases and shell design; Options A vs B (zero-dependency direction) |
| [powch-flow-controller-architecture.md](./detailed/powch-flow-controller-architecture.md) | Flow controller design and API |
| [cloud-vault-architecture.md](./detailed/cloud-vault-architecture.md) | Cloud Vault design: CloudKey derivation, vault in cloud, onboarding |
| [prf-derived-master-wallet.md](./detailed/prf-derived-master-wallet.md) | PRF → CloudKey → master wallet: full walkthrough, one-touch registration |

## Quick Start

**For third-party integrators:** Start with [developer-guide.md](./developer-guide.md).

**For contributors:** Start with [architecture.md](./architecture.md), then [data-layer.md](./data-layer.md).

## Package Structure

```
DeSciX_Powch/
├── packages/
│   ├── client-core/     # Pure JS - PowchData, vaultOps, WebAuthn
│   └── react/           # React SDK - providers, flows, views, hooks
├── samples/
│   ├── standalone-react/    # React integration sample
│   └── standalone-vanilla/  # Vanilla JS integration sample
└── docs/                # This documentation
```
