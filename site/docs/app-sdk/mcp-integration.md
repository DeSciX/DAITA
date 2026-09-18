# MCP Agent Integration Guide

**Status:** Implemented  
**Version:** 1.0  
**Last Updated:** January 2026

This document covers how AI agents interact with the DeSciX platform via MCP (Model Context Protocol) after SDK setup is complete.

---

## 1. Architecture Overview

DeSciX operates as a **Federated MCP Service Mesh**. The `DeSciX_Cloud` backend acts as a broker that aggregates tools from all registered microservices into a unified catalog.

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
   DeSciX_Cloud (Federated Broker)
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
- `descix_init` - Initialize local workspace
- `chat_with_kb` - Query knowledge bases
- `search_knowledge_base` - Search specific KBs

### 2.2 Cursor/AI Agent Integration

When an AI agent (e.g., Cursor) is configured with the DeSciX MCP server:

1. Agent receives user question
2. Agent uses `tell_me_how` to find relevant tools
3. Agent calls `execute_remote_command` with discovered tool
4. Result returned to user

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

`tell_me_how` is the **primary entry point** for discovering platform capabilities. Always use it before attempting platform operations.

**Rule:** Ask `tell_me_how` first, then execute the recommended command.

### 3.2 Three Scopes

| Scope | Description | Use Case |
|-------|-------------|----------|
| `entitlements` (default) | Only tools user has access to | Production usage |
| `project` | Tools filtered by workspace.json | Working within a project |
| `discovery` | All available tools | Exploring capabilities |

### 3.3 CLI Usage

```bash
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

After `descix setup` completes:

1. `workspace.json` is created with community/app mappings
2. Credentials are saved to `.descix/wallet.json`
3. `tell_me_how --scope project` now filters by configured apps
4. Agent can discover project-specific tools

---

## 4. Dynamic Tools Discovery

### 4.1 Federated MCP Broker

`DeSciX_Cloud` aggregates tools from all registered microservices:

```
Microservice A
  └── manifest.json (tools: [tool1, tool2])
        │
        ▼
    Registers with Core
        │
        ▼
DeSciX_Cloud (Broker)
  └── Aggregated tools/list
        │
        ▼
    AI Agent sees: [tool1, tool2, core_tools...]
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

Services self-register with the broker:

```bash
# Register service manifest
descix microservice register -m ./manifest.json

# Vectorize SERVICE_README for discovery
descix microservice vectorize -r SERVICE_README.md
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
descix setup [--dev]
       │
       ▼
   Prerequisites Check (gcloud, ADC)
       │
       ▼
   Device Login (browser)
       │
       ▼
   Workspace Builder (PWA)
       │
       ▼
   Hydration (Hydrator module)
       │
       ▼
   Credentials Saved (.descix/wallet.json)
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
2. Extracts configured communities and apps
3. Filters `tell_me_how` results to only tools applicable to those apps
4. Returns focused recommendations

```javascript
// workspace.json
{
  "communities": {
    "descix": {
      "apps": {
        "agent": { "localPath": ".", "sync_mode": "git" }
      }
    }
  }
}

// tell_me_how with project scope only searches within descix/agent
```

---

## 6. Key Integration Points with SDK V2

### 6.1 KB Operations via tell_me_how

The new SDK V2 KB commands are discoverable:

```bash
descix tell-me-how "How do I sync my knowledge base?"
# Returns: kb_sync_chunks, kb_get_chunk_ids, kb_delete_chunks
```

### 6.2 workspace.json from Hydration

The `Hydrator` module creates `workspace.json` during setup:

```javascript
// Created by Hydrator.hydrateWorkspace()
{
  "communities": { ... },
  "driveConfig": {
    "base_folder_id": "..."  // For tell_me_how project scope
  }
}
```

### 6.3 Service Registration for Custom Microservices

Custom services integrate with the same pattern:

1. Create `SERVICE_README_{name}.md`
2. Register with `descix microservice register`
3. Vectorize with `descix microservice vectorize`
4. Tools become discoverable via `tell_me_how`

---

## 7. Best Practices

### 7.1 For AI Agents

1. **Always use tell_me_how first** - Don't guess at command names
2. **Use project scope when in a workspace** - More focused results
3. **Chain operations** - tell_me_how -> execute_remote_command
4. **Handle errors gracefully** - Show user-friendly messages

### 7.2 For Service Developers

1. **Document all commands in SERVICE_README** - Required for discovery
2. **Use clear descriptions** - "Use when:" is crucial for semantic matching
3. **Include examples** - Helps AI agents understand usage
4. **Register after changes** - Re-vectorize when README updates

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
// Only works after descix setup
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
descix setup --dev

# Or ensure you're in the workspace root
cd /path/to/workspace
```

### 8.3 "Command not found"

**Cause:** Service not registered or command deprecated.

**Solution:**
1. Verify service is registered: `descix microservice list`
2. Check if command was deprecated in V2
3. Use `tell_me_how --scope discovery` to find alternatives

---

## 9. File References

| Component | Path |
|-----------|------|
| MCP Tools | `DeSciX_Core/descix-cli/lib/mcp-tools.js` |
| tell_me_how Implementation | `DeSciX_Cloud/services/commandHandlers/ragCommands.js` |
| execute_remote_command | `DeSciX_Cloud/services/apiFront.js` |
| SERVICE_README Template | `DeSciX_ServiceSDK/templates/SERVICE_README_TEMPLATE.md` |
| Workspace Config | `DeSciX_Core/descix-cli/lib/workspace-config.js` |
| Service Registration | `DeSciX_Core/descix-cli/lib/commands/service.js` |
