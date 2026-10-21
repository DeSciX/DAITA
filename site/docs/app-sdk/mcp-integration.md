# MCP Agent Integration Guide

**Status:** Implemented  
**Version:** 1.0  
**Last Updated:** January 2026

This document covers how AI agents interact with the DeSciX platform via MCP (Model Context Protocol) after SDK setup is complete.

---

## 1. Architecture Overview

DeSciX operates as a **Federated MCP Service Mesh**. The DeSciX backend acts as a broker: it registers tools from all registered microservices alongside its own native commands, dispatches calls to whichever service owns the command, and advertises a small handshake floor of that set at `tools/list` (see §2.2).

**Key Innovation:** AI agents discover and invoke capabilities across the entire mesh without knowing where individual services are hosted.

```
AI Agent (Cursor/MCP Client)
       │
       ▼
   tell_me_how (semantic discovery)
       │
       ▼
   execute_remote_command
       │
       ▼
   DeSciX Backend (Federated Broker)
       │
       ├──► Service 1 (Powch)
       ├──► Service 2 (SmartModel)
       └──► Service N (Custom)
```

---

## 2. Agent as Assistant Pattern

### 2.1 MCP as Transport Layer

MCP provides the communication protocol between AI agents and the DeSciX platform. All DeSciX capabilities are exposed as MCP tools.

**Key Tools:**
- `tell_me_how` - Semantic tool discovery
- `execute_remote_command` - Execute any backend command
- `descix_doctor` - CLI-local startup diagnostic (auth, workspace, tools, warnings)
- `ask_question_to_app` - RAG chat with an app's knowledge base (synthesized answer, cited)
- `query_knowledge_base` - Raw vector search, returns chunks

### 2.2 The Two-Hop: Reaching Commands That Are Not In Your Tool List

**Your MCP tool list is a small floor, not the platform's capability surface.** The platform
registers many more commands than it advertises at the handshake, so that a session pays ~1k
tokens of catalog instead of ~8.7k. Everything outside the advertised floor stays registered and
callable — you reach it with two hops:

1. `tell_me_how({ question })` — names the command and its parameters
2. `execute_remote_command({ command, params })` — invokes it

**Rule for an agent: if a capability is not a tool in your list, do not conclude the platform
lacks it, and do not guess a command name — ask `tell_me_how`, then `execute_remote_command`
what it names.** This is the standing integration pattern for every caller, on every transport.

The advertised floor is a **floor, not a ceiling**: `tools/list` serves it UNION the calling
identity's granted command names, so a caller may see more, never less. The floor's membership
and its contract are owned by `describeDiscoveryCoreFence()` /
`DISCOVERY_CORE_TOOL_NAMES` in `@descix/platform-api`
(`src/mcp-tools/nativeTools.js`) — read your live `tools/list` rather than a copy of it.

The CLI's stdio MCP server additionally concatenates its CLI-local diagnostics (`descix_doctor`,
`platform_health`) onto whatever the backend advertises; those are local CLI operations, never
`/apifront` commands, so `execute_remote_command` does not reach them.

### 2.3 The `_descix` Context Object

All MCP calls include a `_descix` context object for identity propagation:

```javascript
{
  user: {
    id: "user_123",
    wallet_address: "0x...",
    email: "user@example.com"
  },
  session: {
    token: "...",
    expires_at: "..."
  },
  workspace: {
    community_id: "daita",
    app_id: "agent"
  }
}
```

The broker validates this context and propagates it to downstream services.

---

## 3. tell_me_how Usage Paradigm

### 3.1 Primary Discovery Mechanism

**Prerequisite: the developer is signed in.** `tell_me_how` returns caller-specific context (and `kb corpus sync` writes to a KB namespace) — both correctly refuse a credential-free caller, loud: `Authentication required`, exit 1. There is no guest/unauthenticated form of discovery, and that refusal must not be treated as a bug to work around. The step before discovery is `descix login --env dev`: it starts a device-code flow — opens a browser and mints a fresh sign-in code for that one invocation — and completes once the browser confirms it.

Once signed in, `tell_me_how` is the **primary entry point** for discovering platform capabilities. Always use it before attempting platform operations.

**Rule:** Sign in, then ask `tell_me_how` first, then execute the recommended command.

### 3.2 Scopes

The validated `tell_me_how` scope enum has five values:

| Scope | Description | Use Case |
|-------|-------------|----------|
| `entitlements` (default) | Only tools the user has access to | Production usage |
| `project` | Tools filtered by workspace.json | Working within a project |
| `discovery` | All available tools | Exploring capabilities |
| `bootstrap` | Deterministic first-call on-ramp: platform summary, caller context, credit balance, essential tool schemas (no vector search; `question` is optional for this scope only) | First contact / first call in a session |
| `artifact` | Deterministic build/reproduce provenance for a published app (npm package + spec, artifact/notebook URLs, runnable `npx` commands), no vector search | "How do I build on / reproduce this app?" |

### 3.3 CLI Usage

```bash
# Sign in first — device-code flow, opens a browser (skip if already authenticated)
descix login --env dev

# Default (entitlements scope)
descix tell-me-how "How do I create a new app?"

# Project scope - uses workspace.json
descix tell-me-how --scope project "How do I sync my knowledge base?"

# Discovery scope - see all tools
descix tell-me-how --scope discovery "What AI training tools exist?"
```

### 3.4 MCP Usage

```javascript
tell_me_how({ 
  question: "How do I deploy my app?",
  scope: "entitlements"
})

// Returns:
{
  recommended_tools: [
    {
      name: "deploy_site",
      description: "Deploy static site to GCS",
      parameters: { ... }
    }
  ],
  guidance: "Use deploy_site to upload your site/ folder..."
}
```

### 3.5 Integration with SDK V2 Setup

After `descix quickstart` completes:

1. `.descix/workspace.json` exists (created when none was found up the tree)
2. Credentials are saved to `.descix/wallet.json`
3. `tell_me_how --scope project` now filters by configured apps
4. Agent can discover project-specific tools

---

## 4. Dynamic Tools Discovery

### 4.1 Federated MCP Broker

The DeSciX backend registers tools from all registered microservices and makes them callable and
semantically discoverable — the handshake advertises only the floor (§2.2):

```
Microservice A
  └── manifest.json (tools: [tool1, tool2])
        │
        ▼
    Registers with Core  ──► callable via execute_remote_command
        │                    + vectorized for tell_me_how
        ▼
DeSciX Backend (Broker)
  └── tools/list  ──► handshake floor + this caller's grants
        │
        ▼
    AI Agent's tool list: the floor. tool1/tool2 are reached
    with tell_me_how -> execute_remote_command.
```

### 4.2 SERVICE_README Vectorization

Each service documents its capabilities in a `SERVICE_README_{name}.md` file. This documentation is vectorized for semantic discovery.

**Format:**
```markdown
# My Service

## Overview
[What this service does and when to use it]

## Available Commands

### command_name
**Description:** What it does
**Use when:** Scenarios when this command is appropriate
**Parameters:**
- `param1` (required, string): Description
- `param2` (optional, number): Description

**Example:**
```javascript
execute_remote_command({
  command: "command_name",
  params: { param1: "value" }
})
```
```

### 4.3 Service Registration

Services self-register with the broker in one step — registration also vectorizes the README you
pass, so there is no separate developer-facing vectorize step:

```bash
descix microservice register -r SERVICE_README.md
```

### 4.4 The execute_remote_command Pattern

After `tell_me_how` returns recommended tools:

```javascript
// 1. Discover
const plan = await tell_me_how({ 
  question: "How do I sync my KB?",
  scope: "project"
});

// 2. Execute
const result = await execute_remote_command({
  command: plan.recommended_tools[0].name,
  params: {
    community_id: "daita",
    app_id: "agent",
    kb_id: "General"
  }
});
```

---

## 5. Post-Setup Workflow

### 5.1 Initial Setup Phase

```
descix quickstart
       │
       ▼
   Device login (skipped when .descix/wallet.json holds a valid session)
       │
       ▼
   .descix/workspace.json created (skipped when one exists up the tree)
       │
       ▼
   CLAUDE.md, .github/copilot-instructions.md, .cursorrules, .clinerules written
       │
       ▼
   .vscode/mcp.json written (skipped when the DeSciX extension handles MCP)
       │
       ▼
   .descix/sdk-assets/ copied (fails loud if the package's assets are missing)
       │
       ▼
   ✓ Ready for agent interaction
```

### 5.2 Ongoing Usage - Agent as Assistant

```
User asks question
       │
       ▼
   tell_me_how({ question, scope: "project" })
       │
       ▼
   Discover relevant tools
       │
       ▼
   execute_remote_command({ command, params })
       │
       ▼
   Broker routes to appropriate service
       │
       ▼
   Result returned to user
```

### 5.3 Project Scope Filtering

When `--scope project` is used:

1. CLI/MCP loads `workspace.json`
2. Extracts the app this repo holds (`env.app`)
3. Filters `tell_me_how` results to only tools applicable to that app
4. Returns focused recommendations

```javascript
// workspace.json (v3 single-app)
{
  "version": "3.0",
  "env": {
    "apiUrl": "https://descix.net",
    "app": { "appId": "daita-agent", "communityId": "daita", "kbId": "General" }
  }
}

// tell_me_how with project scope only searches within daita-agent
```

---

## 6. Key Integration Points with SDK V2

### 6.1 KB Operations via tell_me_how

`tell_me_how` can be asked about KB sync in plain language, but the actionable answer for a
developer is always the CLI verb, not the raw backend command names (`kb_sync_chunks` etc. are
internal to the backend, not something the CLI calls directly by name):

```bash
descix tell-me-how "How do I sync my knowledge base?"
# The developer-facing command either way: descix kb corpus sync
```

### 6.2 workspace.json from Hydration

`descix config init --env …` creates `workspace.json`; `descix app init` (from the repo root) writes the app's `env.app`; no verb writes `driveConfig.base_folder_id` — set it in `.descix/workspace.json` when you use `descix drive pull/push`:

```javascript
{
  "env": { "apiUrl": "https://descix.net", "app": { /* THE app this repo holds */ } },
  "driveConfig": {
    "base_folder_id": "..."  // Only used by `descix drive pull/push` — unrelated to tell_me_how scope
  }
}
```

### 6.3 Service Registration for Custom Microservices

Custom services integrate with the same pattern:

1. Create `SERVICE_README_{name}.md`
2. Register with `descix microservice register -r SERVICE_README_{name}.md` — this both publishes
   the manifest AND vectorizes the README in one step
3. Tools become discoverable via `tell_me_how`

---

## 7. Best Practices

### 7.1 For AI Agents

1. **Be signed in before discovery** - `descix login --env dev` (device-code flow) is the step before `tell_me_how`; it refuses loud, not silently, for a credential-free caller
2. **Always use tell_me_how first (once signed in)** - Don't guess at command names
3. **Use project scope when in a workspace** - More focused results
4. **Chain operations** - tell_me_how -> execute_remote_command
5. **Handle errors gracefully** - Show user-friendly messages

### 7.2 For Service Developers

1. **Document all commands in SERVICE_README** - Required for discovery
2. **Use clear descriptions** - "Use when:" is crucial for semantic matching
3. **Include examples** - Helps AI agents understand usage
4. **Re-register after README changes** - `descix microservice register -r <file>` re-vectorizes
   automatically; there is no separate vectorize step

### 7.3 Common Patterns

**Pattern: Discover and Execute**
```javascript
const tools = await tell_me_how({ question: "...", scope: "entitlements" });
if (tools.recommended_tools.length > 0) {
  await execute_remote_command({
    command: tools.recommended_tools[0].name,
    params: { ... }
  });
}
```

**Pattern: Project-Scoped Operations**
```javascript
// Only works inside a workspace (descix quickstart or descix config init)
const tools = await tell_me_how({ 
  question: "How do I update this app?",
  scope: "project"  // Uses workspace.json
});
```

---

## 8. Troubleshooting

### 8.1 "No results from tell_me_how"

**Cause:** SERVICE_READMEs may not be vectorized.

**Solution:** Admin should run:
```bash
descix microservice vectorize -r SERVICE_README.md
```

### 8.2 "workspace.json not found" for project scope

**Cause:** Setup not completed or not in workspace root.

**Solution:**
```bash
# Run setup first
descix quickstart

# Or ensure you're in the workspace root
cd /path/to/workspace
```

### 8.3 "Command not found"

**Cause:** Service not registered, or the README wasn't vectorized.

**Solution:**
1. Re-run `descix microservice register -r SERVICE_README_<name>.md` — it re-publishes the
   manifest and re-vectorizes the README (`descix microservice list` exists to enumerate
   registered services, but it is an admin-only command, not something a developer runs)
2. Check `descix microservice health <name>` to confirm the service itself is reachable
3. Use `descix tell-me-how --scope discovery "..."` to find alternatives
