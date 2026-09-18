# Getting Started with appsdk

Welcome to your DeSciX app! This guide covers the basic CLI commands.

## App Context

When you're in this directory, CLI commands automatically detect your app:
- **Community:** descix
- **App:** appsdk

## Knowledge Base Commands

### Add Content to Your KB

1. Add or edit markdown files under `kb/General/`.

2. Sync your knowledge base to Pinecone:
   ```bash
   npx descix kb corpus sync -a appsdk
   ```

   This command:
   - Walks the corpus manifest (git blob SHAs track changes)
   - Chunks changed files
   - Upserts/deletes vectors in Pinecone

### KB Commands

```bash
# Sync corpus to Pinecone (canonical path)
npx descix kb corpus sync -a appsdk

# Check corpus sync status (drift detection)
npx descix kb corpus status -a appsdk

# Check live vector drift vs local sync state
npx descix kb doctor -a appsdk -k General

# List knowledge bases for an app
npx descix kb list -a appsdk
```

### Drive Commands (Drive Mode — server-side pipeline)

Drive Mode is a server-side, PWA-only pipeline. The CLI provides helpers to move files to/from Google Drive:

```bash
# Pull and convert files from Drive to local kb/
npx descix drive pull -a appsdk

# Push local staging files to Drive
npx descix drive push -a appsdk
```

## Using Flags from Anywhere

If you're not in the app directory, use flags:

```bash
npx descix kb corpus sync -a appsdk -c descix
```

## Site Commands

```bash
# Add site scaffold
npx descix site init

# Deploy site to CDN
npx descix site deploy
```

## Microservice Commands

```bash
# Add microservice scaffold  
npx descix microservice init

# Register service with gateway
npx descix microservice register

# Vectorize SERVICE_README for discovery
npx descix microservice vectorize
```

## Need Help?

```bash
# Ask the AI for guidance
npx descix tell-me-how "your question here"

# Show all commands
npx descix --help

# Show command help
npx descix kb --help
```

## Folder Structure

```
appsdk/
├── .descix.app/
│   └── workspace.json    # App configuration
├── assets/
│   ├── app_description.md
│   ├── system_instructions.md
│   └── icon.png
├── kb/
│   └── General/          # KB source docs (markdown files)
├── site/                 # (optional) Static site
├── microservice/         # (optional) Backend service
└── GETTING STARTED.md    # This file
```
