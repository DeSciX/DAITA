# Getting Started

This guide covers the CLI commands you need for a DeSciX app. Replace `<app_id>` and
`<community_id>` with your own values throughout.

## Installing the CLI

The npm package is `@descix/cli`; the binary it installs is `descix`.

```bash
npm install -g @descix/cli
descix --version
```

To run it without installing, name the package explicitly — `npx descix` resolves a different
package:

```bash
npx -y -p @descix/cli descix --help
```

## App Context

When you run a command from inside a registered app directory, the CLI detects the app and the
community from the workspace, so `-a` and `-c` are optional. From anywhere else, pass them.

## Knowledge Base Commands

### Add Content to Your KB

1. Write or edit markdown anywhere in your repo, and commit it — the sync walks git.

2. Declare those files in a corpus manifest at `.descix/manifests/<KB>.json` inside the app
   directory. The manifest is the only thing that decides what is in a KB; there is no
   directory the CLI scans. Schema:
   [corpus-manifest-schema.md](../architecture/corpus-manifest-schema.md).

3. Sync the knowledge base:
   ```bash
   descix kb corpus sync -a <app_id>
   ```

   This command:
   - Walks the corpus manifest at the manifest's git ref (git blob SHAs track changes)
   - Chunks changed files
   - Upserts changed vectors and deletes vectors for files no longer in the corpus

   Run it with `--dry-run` first to see what it would add and remove without writing anything.

### KB Commands

```bash
# Sync corpus to Pinecone (the one canonical sync path)
descix kb corpus sync -a <app_id>

# Preview a sync without writing
descix kb corpus sync -a <app_id> --dry-run

# Sync from an unmerged branch instead of the manifest's ref
descix kb corpus sync -a <app_id> --ref <branch>

# Show corpus sync state (files, chunks, last sync, resolved ref)
descix kb corpus status -a <app_id>

# Check a KB against its last sync by file identity (orphans and missing files)
descix kb doctor -a <app_id> -k General

# List knowledge bases for an app
descix kb list -a <app_id>
```

### Verify the KB answers

```bash
descix chat -a <app_id> --new "a question your documents answer"
```

## Using Flags from Anywhere

If you are not in the app directory, use flags:

```bash
descix kb corpus sync -a <app_id> -c <community_id>
```

## Site Commands

```bash
# Add site scaffold
descix site init

# Upload the site to GCS and update app metadata
descix site upload -a <app_id>

# Preview what an upload would change
descix site upload -a <app_id> --dry-run

# Show deployment status and manifest
descix site status -a <app_id>
```

## Microservice Commands

```bash
# Add microservice scaffold
descix microservice init

# Register the service with the gateway
descix microservice register

# Check the health of a registered service
descix microservice health <name>
```

## Need Help?

```bash
# Ask the platform which tools can do what you are trying to do
descix tell-me-how "your question here"

# Show all commands
descix --help

# Show command help
descix kb --help
descix kb corpus sync --help
```

`--help` on any command is the authority for its flags. If a command does not exist, the CLI
exits non-zero and lists the commands that do.

## Folder Structure

```
<app_id>/
├── .descix/
│   ├── manifests/
│   │   └── General.json      # Corpus manifest: which files are in the General KB
│   └── sync-state/           # Written by `kb corpus sync`
├── assets/
│   ├── app_description.md
│   ├── system_instructions.md
│   └── icon.png
├── site/                     # (optional) Static site
└── microservice/             # (optional) Backend service
```

KB source files are not part of this tree — they stay wherever they already live in your
repository, and the manifest names them by path.
