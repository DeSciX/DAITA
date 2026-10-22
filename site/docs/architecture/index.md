# Platform Architecture Overview

This section documents the DeSciX platform architecture as built.

## Scalability

**Broker-first microservice mesh**: Client SDK → `POST /apifront` → Core validates entitlements → `proxyToExternalService()` to app Cloud Run URLs discovered via Firestore `ServiceManifests`. This is the **platform-hosted dispatch path only** (the door injects the signed caller identity `params._descix`); it is NOT how an app's own user traffic is metered — the edge routes `{app}.descix.net/api` straight to Cloud Run `{app}-{env}` by name, and the app owner meters those users inside the microservice.

**Edge-routed PWA**: The Cloudflare Worker `descix-edge-router` routes every request to a prod or dev host (`descix.net`, `{app}.descix.net`, `dev.descix.net`, `{app}.dev.descix.net`) by the app and env it reads from the host name. It fetches static files from Google Cloud Storage (`storage.googleapis.com`, bucket `descix-assets-public`, keys under `{env}/{appId}/site/`; an app host's root serves the shell's site, `{env}/daita/site/`, which frames the app's), sends `/apifront`, `/mcp` and `/oauth` to the Cloud Run broker `apifront-http-{env}`, and sends an app host's `/api/*` to Cloud Run `{app}-{env}`. PWAs (the platform shell, Powch) deploy to that bucket like any app site. Demo hosts (`*.demo.descix.net`) are not on the Worker: their DNS points at a GCP load balancer.

## Documents

- [What is DeSciX](../what-is-descix.md) – High-level platform overview
- [Powch: DeFi Banking + SSO](powch-defi-sso.md) – Identity, payments, zero-knowledge
- [Serve & Launch Modes](../development/serve-and-launch-modes.md) – `descix serve`, the unified local gateway; single port, workspace-driven routing
- [app-shell-and-sdk](app-shell-and-sdk.md) – App shell as OS; all apps peers; build-time identity
- [unified-product-registry](unified-product-registry.md) – Globally unique product IDs; frictionless dev-to-prod
- [rag-chat-as-built](rag-chat-as-built.md) – RAG/Chat pipeline: request flow, model selection, Pinecone scoping, conversation threading
- [fine-tuning-and-multi-tenant-rag](fine-tuning-and-multi-tenant-rag.md) – Fine-tuning Q&A tool, multi-tenant isolation via metadata filters, knowledge hierarchy
