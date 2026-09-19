# App Builders Guide

This guide helps you create community apps, knowledge bases, and RAG-powered agents in DeSciX.

## Overview

DeSciX apps are embedded applications that can:
- Access knowledge bases via RAG (Retrieval-Augmented Generation)
- Provide AI-powered chat interfaces
- Be monetized through pricing and roles
- Integrate with the DeSciX token economy

## Quick Start

1. **Create App** – Use the PWA, or `descix app init -a <name> -c <community_id>` (creates AND initializes; every app is guaranteed a default KB)
2. **Declare Knowledge** – Write a corpus manifest at `<app dir>/.descix/manifests/<KB>.json` naming the git-tracked markdown files that belong in the KB
3. **Enable RAG** – Run `descix kb corpus sync -a <app_id>` to chunk and vectorize those files for AI chat
4. **Verify** – Ask a question with `descix chat -a <app_id> --new "..."`

Non-developers can instead register a Google Drive folder and let the server-side pipeline
ingest it — see [Drive Setup](drive-setup.md).

## Documentation

- [Creating Apps](community-apps.md) – App creation workflow
- [Drive Setup](drive-setup.md) – Google Drive folder configuration
- [Roles](roles.md) – Role-based access control (RBAC)

## Related Documentation

- [PWA / SDK](../../app-sdk/pwa-sdk/index.md) – CodeSites and browser SDK
- [RAG Pipeline](../../services/cloud/rag-pipeline.md) – Knowledge base vectorization
