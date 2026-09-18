# DeSciX V2 Documentation

Canonical as-built documentation for the DeSciX platform. DeSciX is a DEX + App Store for chain-tracked IP rights. See [What is DeSciX?](what-is-descix.md) for the high-level overview.

## Quick Links

- [What is DeSciX?](what-is-descix.md)
- [Reference](reference/index.md) – Legal, TOS, Community Agreement, Whitepaper
- [Powch: DeFi Banking + SSO](architecture/powch-defi-sso.md)
- [IP-IPO Lifecycle](contracts/ip-ipo-lifecycle.md)

## Architecture

- [Platform overview](architecture/index.md)
- [Unified Product Registry](architecture/unified-product-registry.md) – Globally unique product IDs
- [descix-serve gateway](architecture/descix-serve-gateway.md) – Unified local gateway
- [App shell and SDK](architecture/app-shell-and-sdk.md) – App shell as OS; all apps peers

## Contracts

- [Contracts overview](contracts/index.md) – DAITA_V2, IP-IPO
- [IP-IPO lifecycle](contracts/ip-ipo-lifecycle.md) – DAITA_V2 from controlled auctions to public DEX

## Development

- [Development overview](development/index.md)
- [App development in Cursor with MCP](development/cursor-mcp-app-development.md) – Semantic discovery, tell_me_how, workspace
- [Dev environment setup](development/dev-environment-setup.md) – Prerequisites and bootstrap
- [Platform runtime mental model](architecture/platform-runtime-mental-model.md) – `descix serve` as LB replicator, gateway routing table, port resolution, standalone binding

## PWA / SDK

- [PWA overview](pwa-sdk/index.md)
- [PWA architecture](pwa-sdk/pwa-overview.md) – Bridge auth, no @powch/react
- [PWA React developer guide](pwa-sdk/pwa-react-developer-guide.md) – State, viewRouter, single mutex

## Services

- [Services overview](services/index.md)
- [Cloud / Backend](services/cloud/index.md) – API server, RAG pipeline, data models
- [Service mesh and proxying](services/service-mesh-and-proxying.md) – Command routing, HTTP proxying
- [Cloud LB decentralized routing](services/cloud-lb-decentralized-routing.md) – URL map, path matchers, NEGs; no apifront bottleneck
- [API and command routing](services/api-and-command-routing.md) – makeCommandRequestJSON, apiFront
- [MCP mesh](services/mcp-mesh.md) – MCP integration, tell-me-how

## Deployment

- [Deployment guide](deployment/deployment-guide.md) – Production, preview, demo
- [App deployment guide](deployment/app-deployment-guide.md) – PWA deploy, mesh routing, custom domains
- [SSL architecture](deployment/ssl-architecture-setup.md)
- [Secret values configuration](deployment/secret-values-configuration-guide.md)
