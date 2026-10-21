# Platform Architecture Overview

This section documents the DeSciX platform architecture as built.

## Scalability

**Broker-first microservice mesh**: Client SDK → `POST /apifront` → Core validates entitlements → `proxyToExternalService()` to app Cloud Run URLs discovered via Firestore `ServiceManifests`. This is the **platform-hosted dispatch path only** (the door injects the signed caller identity `params._descix`); it is NOT how an app's own user traffic is metered — the edge routes `{app}.descix.net/api` straight to Cloud Run `{app}-{env}` by name, and the app owner meters those users inside the microservice. The LB serves static sites and forwards command paths to **core platform app NEGs** (daita broker + powch at standup only). Non-core apps have no NEG on routine deploy.

**Edge-cached PWA**: Static assets are served from GCS buckets. The load balancer applies host rules for `[app].{env}.descix.net` and routes traffic to the appropriate backend. PWAs (main app, Powch) deploy to GCS and are served globally.

## Documents

- [What is DeSciX](../what-is-descix.md) – High-level platform overview
- [Powch: DeFi Banking + SSO](powch-defi-sso.md) – Identity, payments, zero-knowledge
- [Serve & Launch Modes](../development/serve-and-launch-modes.md) – `descix serve`, the unified local gateway; single port, workspace-driven routing
- [app-shell-and-sdk](app-shell-and-sdk.md) – App shell as OS; all apps peers; build-time identity
- [unified-product-registry](unified-product-registry.md) – Globally unique product IDs; frictionless dev-to-prod
- [rag-chat-as-built](rag-chat-as-built.md) – RAG/Chat pipeline: request flow, model selection, Pinecone scoping, conversation threading
- [fine-tuning-and-multi-tenant-rag](fine-tuning-and-multi-tenant-rag.md) – Fine-tuning Q&A tool, multi-tenant isolation via metadata filters, knowledge hierarchy
