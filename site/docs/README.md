# DeSciX V2 Documentation

Canonical as-built documentation for the DeSciX platform. DeSciX is a DEX + App Store for chain-tracked IP rights. See [What is DeSciX?](what-is-descix.md) for the high-level overview.

## Quick Links

- [What is DeSciX?](what-is-descix.md)
- [Powch: DeFi Banking + SSO](architecture/powch-defi-sso.md)

## Architecture

- [Platform overview](architecture/index.md)
- [Unified Product Registry](architecture/unified-product-registry.md) – Globally unique product IDs
- [Serve & Launch Modes](development/serve-and-launch-modes.md) – `descix serve`, the unified local gateway
- [App shell and SDK](architecture/app-shell-and-sdk.md) – App shell as OS; all apps peers

## Development

- [Development overview](development/index.md)
- [App development in Cursor with MCP](development/cursor-mcp-app-development.md) – Semantic discovery, tell_me_how, workspace

## PWA / SDK

- [PWA overview](app-sdk/pwa-sdk/index.md)
- [PWA architecture](app-sdk/pwa-sdk/pwa-overview.md) – Bridge auth through @descix/app-sdk
- [PWA React developer guide](app-sdk/pwa-sdk/pwa-react-developer-guide.md) – State, viewRouter, single mutex

## Services

- [Services overview](services/index.md)
- [Cloud / Backend](services/cloud/index.md) – API server, RAG pipeline, data models
- [Service mesh and proxying](services/service-mesh-and-proxying.md) – Command routing, HTTP proxying
- [MCP mesh](services/mcp-mesh.md) – MCP integration, tell-me-how

## Deployment

- [App developer runbook](app-sdk/app-developer-runbook.md) – Deploy an app's site with `descix site upload` (§8)
