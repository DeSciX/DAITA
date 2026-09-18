# Platform Architecture Overview

This section documents the DeSciX platform architecture as built.

## Scalability

**Broker-first microservice mesh**: Client SDK → `POST /apifront` → Core validates entitlements → `proxyToExternalService()` to app Cloud Run URLs discovered via Firestore `ServiceManifests`. The LB serves static sites and forwards command paths to **core platform app NEGs** (daita broker + powch at standup only). Non-core apps have no NEG on routine deploy. See [platform-must-know-briefer](platform-must-know-briefer.md) §3.

**Edge-cached PWA**: Static assets are served from GCS buckets. The load balancer applies host rules for `[app].{env}.descix.net` and routes traffic to the appropriate backend. PWAs (main app, Powch) deploy to GCS and are served globally.

## Documents

- [What is DeSciX](../what-is-descix.md) – High-level platform overview
- [Powch: DeFi Banking + SSO](powch-defi-sso.md) – Identity, payments, zero-knowledge
- [descix-serve-gateway](descix-serve-gateway.md) – Unified local gateway; single port, workspace-driven routing
- [app-shell-and-sdk](app-shell-and-sdk.md) – App shell as OS; all apps peers; build-time identity
- [unified-product-registry](unified-product-registry.md) – Globally unique product IDs; frictionless dev-to-prod
- [design-patterns](design-patterns.md) – Consolidated design patterns
- [rag-chat-as-built](rag-chat-as-built.md) – RAG/Chat pipeline: request flow, model selection, Pinecone scoping, conversation threading
- [analytics-pipeline](analytics-pipeline.md) – GTM + GA4 + BigQuery event pipeline: server-side Measurement Protocol, client-side dataLayer, app_id as sole product key
- [fine-tuning-and-multi-tenant-rag](fine-tuning-and-multi-tenant-rag.md) – Fine-tuning Q&A tool, multi-tenant isolation via metadata filters, knowledge hierarchy
- [platform-api-architecture](platform-api-architecture.md) – @descix/platform-api: shared business logic layer between cloud-core and microservices
