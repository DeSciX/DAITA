# App Builders Guide

This guide helps you create community apps, knowledge bases, and RAG-powered agents in DeSciX.

## Overview

DeSciX apps are embedded applications that can:
- Access knowledge bases via RAG (Retrieval-Augmented Generation)
- Provide AI-powered chat interfaces
- Be monetized through pricing and roles
- Integrate with the DeSciX token economy

## Quick Start

1. **Register Drive Folder** – Share a Google Drive folder with DeSciX and register it via CLI or PWA
2. **Create App** – Use PWA or `descix app init -a <name> -c <community>` (creates AND initializes; every app is guaranteed a default KB)
3. **Upload Knowledge** – Add documents via `descix app upload` or directly to Drive
4. **Enable RAG** – Use `descix kb build` (or push → pull → chunk → sync) to vectorize for AI chat

## Documentation

- [Creating Apps](community-apps.md) – App creation workflow
- [Drive Setup](drive-setup.md) – Google Drive folder configuration
- [Roles](roles.md) – Role-based access control (RBAC)

## Related Documentation

- [PWA / SDK](../pwa-sdk/index.md) – CodeSites and browser SDK
- [RAG Pipeline](../../services/cloud/rag-pipeline.md) – Knowledge base vectorization
