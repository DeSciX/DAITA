# Corpus Manifest Schema (canonical)

**Owner module:** `lib/core/ManifestLoader.js` in the published `@descix/cli` package
**Consumers:** `CorpusWalker.js`, `CorpusDenyLint.js`, `corpus.js`, and the conformance test.

A corpus manifest declares a *view* over git-managed files for RAG indexing. Files stay in place —
no staging; git blob SHAs handle versioning; Pinecone metadata handles multi-tenancy.

Manifests live at `{app_root}/.descix/manifests/{kb_name}.json`.

## Why this doc exists

Two manifest families historically shared `.descix/manifests/*.json` with drifting per-source field
names — the **DeSciX-family** (`tier` / `doc_type` / `syncignore` / `raw_path`) and the
**EGPT-research family** (which also used `src_path`). Because every source field except `path` was
optional, the loader **silently accepted both** and **silently ignored any unrecognized or misspelled
field** — the same fail-loud gap as the KB command params (a typo'd `synchignore` produced an empty
`syncignore` with no signal). This doc + the exported field-set in `ManifestLoader.js` are now the
single source of truth for the recognized schema; a conformance test drives off the same exports so
the schema can never drift by hand again.

## Manifest-level fields

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `kb_name` | string | yes | KB this manifest populates. |
| `sources` | array | yes (non-empty) | See per-source fields below. |
| `sync_mode` | string | no | e.g. `"local"`. |
| `publish_tier` | `"P"` \| `"I"` \| `"U"` | no (default `"I"`) | `"P"` (public) requires a publishable `doc_class` on **every** source (no default allowed). |
| `github` | object | no | Validated if present; unused for `sync_mode: "local"`. |
| `_`-prefixed keys | any | no | Annotation/comment keys (e.g. `_purpose`). Always allowed, never indexed. |

Any other top-level key is **unknown** → warns (deprecation window; does not throw).

## Per-source fields (canonical set)

`path`, `ref`, `tier`, `doc_type`, `syncignore`, `doc_class`, `license_basis`, `lint_exempt`,
`exempt_reason`, `raw_path`.

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `path` | string | — (required) | Workspace-relative dir or file. |
| `ref` | string | `"main"` | Git ref for blob-SHA versioning. |
| `tier` | number | `3` | Retrieval tier. A **nested** source (deeper `path`) overrides the tier of an enclosing source for its subtree — see dedup note below. |
| `doc_type` | string | `"generic"` | Free-form classifier. |
| `syncignore` | string[] | `[]` | Glob excludes (minimatch, dot-aware). |
| `doc_class` | string | — | KB-curation class (taxonomy in `CorpusDenyLint`). Required per-source in a Tier-P manifest. |
| `license_basis` | string | `null` | KB-curation. |
| `lint_exempt` | string[] | `[]` | KB-curation deny-lint exemptions. |
| `exempt_reason` | string | `null` | KB-curation. |
| `raw_path` | string | `null` | Provenance: the pre-edit source a dist file was synced from. Sets `synced_from_edit` on the chunk record. |

Any other per-source key is **unknown** → warns, unless it is a deprecated alias (below).

## Deprecated aliases (migration window)

| Deprecated | Canonical | Behavior |
|------------|-----------|----------|
| `src_path` | `raw_path` | Normalized to `raw_path` at load (canonical wins if both set) + a deprecation warning. Rename in your manifest; support is removed after the window. |

Because `src_path` was previously ignored entirely, normalizing it to `raw_path` makes the tooling
**honor** it (the chunk gets a `raw_path`/`synced_from_edit` marker). This is a one-time metadata
correction on the next sync, not ongoing churn.

## Nested-source dedup (walker invariant)

A manifest may list both a directory source AND a more-specific source nested inside it (e.g.
`.../services` at tier 3 AND `.../services/commandHandlers` at tier 2). Each physical file belongs to
**exactly one** source — the **deepest** (most-specific) source root that contains it. Walking an
ancestor source skips a file owned by a descendant source. This preserves the author's override intent
and prevents duplicate content-addressed chunk IDs (which otherwise produce a deterministic
upsert-vs-live dedup delta every full sync). Enforced in `CorpusWalker.walkCorpus`.

## Validator

`collectManifestSchemaWarnings(manifest, filePath)` (exported from `ManifestLoader.js`) returns the
human-readable warning lines for unknown fields and deprecated aliases without throwing. `loadManifest`
logs them on every load. During the deprecation window this is **warn, not fail** — both legacy
formats keep syncing.
