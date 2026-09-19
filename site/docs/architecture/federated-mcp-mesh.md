# DeSciX Federated MCP Service Architecture

## 1. Executive Summary

We have transformed DeSciX from a monolithic platform into a **Federated MCP Service Mesh**. This architecture leverages the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) as the fundamental transport and discovery layer for all platform capabilities.

**Key Innovation:** `DeSciX_Cloud` acts as a **Federated MCP Broker**. It aggregates tools from all registered microservices into a single, unified `tools/list` catalog. This allows AI Agents (and CLIs) to discover and invoke capabilities across the entire mesh without knowing where the service lives.

### Intelligent Tool Discovery

Instead of loading a static list of all available tools, we use **semantic discovery** via the `tell_me_how` command. This allows AI agents to find relevant tools based on natural language questions, scoped by user entitlements.

```
tell_me_how({ question: "How do I grant AI-consumption credits?", scope: "entitlements" })
→ Returns relevant tools the user has access to
```

---

## 2. Micro-Service Developer Guide

### Your Role: Building "MCP-Native" Services

You no longer build isolated REST APIs. You build **Tool Providers**.

### How to Create a New Service

1.  **Use the Starter Kit:**
    Copy the `@descix/service-starter` template (located in `DeSciX_ServiceSDK/`).

2.  **Define Your Tools (`manifest.json`):**
    You must provide a JSON Schema (`inputSchema`) for every command. This is how the AI "sees" your tool.
    ```json
    "commands": {
      "deploy_community": {
        "handler": "deployCommands.create",
        "description": "Deploys a new DAO community on-chain",
        "inputSchema": {
          "type": "object",
          "properties": {
            "name": { "type": "string" },
            "token_symbol": { "type": "string" }
          },
          "required": ["name", "token_symbol"]
        }
      }
    }
    ```

3.  **Use Platform Capabilities (The Loopback Pattern):**
    Don't reinvent the wheel. If your service need RAG, use the pre-wired `mcpClient`.
    ```javascript
    import { mcpClient } from '../mcpClient.js';

    // Your service asks the Core to query the vector DB
    const context = await mcpClient.callTool('query_knowledge_base', {
        query: "community governance best practices"
    }, _descix); // Pass original user identity
    ```

4.  **Create SERVICE_README (Required):**
    Create `SERVICE_README_{service_name}.md` in your app's Drive folder. This documentation is vectorized for `tell_me_how` discovery. See `DeSciX_ServiceSDK/templates/SERVICE_README_TEMPLATE.md` for the format.
    
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
    ```

5.  **Register:**
    Run `descix microservice register` to publish your manifest to the Core Broker.
    ```bash
    descix microservice register -m ./manifest.json
    ```
    The CLI will:
    - Verify SERVICE_README exists in Drive
    - Read and vectorize the README for tool discovery
    - Register your manifest with the Core

### Benefits for You
*   **Zero Auth Code:** Identity is handled by Core; you just get a trusted `_descix.user` object.
*   **Instant AI Availability:** Once registered, your tools are immediately available to every AI agent in the ecosystem.
*   **Access to Core:** You can call *other* services via the Broker loopback.

---

## 3. Platform Admin Guide

### Your Role: Managing the Federation

You oversee the `DeSciX_Cloud` Broker that routes traffic and aggregates tools.

### Architecture Components

1.  **Service Registry (Firestore):**
    *   Collection: `ServiceManifests`
    *   Stores: Command definitions, endpoints, and **Input Schemas**.

2.  **Federated Discovery (`apiFront.js`):**
    *   When a client calls `tools/list`, the Cloud:
        1.  Loads native tools (Auth, Purchase).
        2.  Loads external tools from `ServiceManifests`.
        3.  Merges them into a single list.

3.  **Command Routing — Broker-First (per [`platform-must-know-briefer.md`](./platform-must-know-briefer.md) §3):**

    Sites use the SDK → `POST /apifront`. Core validates session + entitlements, then dispatches via `proxyToExternalService()` using Firestore `ServiceManifests`. **No LB NEG is required for new non-core apps** (manifest registration only).

    At the LB (provisioned once per env by `provision-platform-lb.js`):
    - `/apifront/*`, `/mcp/*`, `/api/*` on app hosts and env apex → `{env}-api-backend` (central Cloud Function `apiFront-http-{env}`)
    -     Static site paths → GCS `/{env}/{app_id}/site/`. Canonical model: `docs/design/ws-mesh-broker-only.md`.

    Within the command-broker channel:
    *   Incoming request `POST /apifront` -> `command: "deploy_community"`
    *   Central CF reads in-memory `externalCommandRegistry` (sourced from Firestore `ServiceManifests`; see `serviceManifestManager.js:685-765`) -> Finds `deploy_community` belongs to `deploy-service`.
    *   CF validates User Session.
    *   CF proxies request via `proxyToExternalService()` — HTTPS POST to `https://{service.domain}/api/{commandName}` (e.g., `https://deploy-service.descix.net/api/deploy_community`).

    See [`../services/cloud-lb-decentralized-routing.md`](../services/cloud-lb-decentralized-routing.md) for the per-host URL map shape.

### Operational Procedures

*   **Restarting Services:**
    *   **New Service Added:** You generally **do not** need to restart Core. The `ServiceManifestManager` has a 5-minute cache (`CACHE_TTL_MS`).
    *   **Force Refresh:** If you need immediate discovery, restart the `DeSciX_Cloud` service to clear the in-memory manifest cache.
    *   **Service Updates:** If a microservice updates its code (but not its manifest), no Core restart is needed.

*   **Going Live:**
    1.  Deploy the Microservice (Cloud Run / App Engine).
    2.  Run `npm run register` from the microservice (or manually add Firestore doc).
    3.  Wait 5 minutes (or restart Core).
    4.  Verify via CLI: `descix tell-me-how "<what your service does>"` names the service's tools once they are discoverable.

---

## 4. PWA Client SDK & Dynamic UI

### The Vision: "Headless" UI + AI Composition

Because every service is now an MCP Tool, the PWA can dynamically generate UIs or Chat Interfaces for them.

### How the PWA SDK Leverages This

1.  **Universal Command Invoker:**
    The PWA no longer needs specific client libraries for each service.
    ```javascript
    // Call ANY service, native or external
    await makeCommandRequestJSON('any_tool_name', params);
    ```

2.  **Dynamic Chat Interfaces:**
    The `StreamingChatSample` (`/samples/streaming-chat`) is a generic container.
    *   It sends `user_input` to an AI Agent.
    *   The AI Agent calls `tools/list` and sees `deploy_community`.
    *   The AI Agent decides to call that tool.
    *   **Result:** A conversational UI for your new service *without writing a single line of frontend code*.

3.  **Future: "Generative UI" Components**
    We can extend the manifest to include `uiSchema` (like react-jsonschema-form).
    *   **PWA Logic:**
        1.  Fetch Manifest for `deploy-service`.
        2.  Render form based on `inputSchema`.
        3.  On Submit -> `makeCommandRequestJSON('deploy_community', formData)`.
    *   **Impact:** You deploy a backend service, and a basic Admin UI appears automatically in the PWA.

### Immediate Action for UI Clients
*   Use the **Streaming Chat Pattern** as the primary interface for complex add-on services.
*   Rely on the AI to "bridge the gap" between the user's intent and your structured MCP Tools.

---

## 5. Intelligent Tool Discovery (tell_me_how)

### The Problem with Static Tool Lists

As the platform grows, maintaining a static list of all available tools becomes problematic:
- AI agents face cognitive overload with hundreds of tools
- Tool lists quickly become outdated
- Users don't know what tools are available to them

### The Solution: Semantic Discovery

The `tell_me_how` command provides intelligent, entitlement-aware tool discovery:

```javascript
// Ask how to accomplish something
const result = await tell_me_how({
    question: "I want to configure per-community buyback pro-rata weighting",
    scope: "entitlements" // Only tools user has access to
});

// Result includes recommended tools and usage instructions
// {
//   recommended_tools: [...],
//   explanation: "Here's how to do that...",
//   sources: [...]
// }
```

### Scope Options

| Scope | Description | Use Case |
|-------|-------------|----------|
| `project` | Only tools from communities/apps in `.descix/workspace.json` | Working within a specific project |
| `entitlements` | Only tools user has access to | **Default** - safe, actionable results |
| `discovery` | All platform tools | Exploring, deciding what to purchase |

### How It Works

1. **Service Registration:** When a microservice is registered with `SERVICE_README_{name}.md`, the README is chunked and vectorized with `entity_type: SERVICE_DOC`

2. **Semantic Search:** `tell_me_how` searches these SERVICE_DOC vectors in Pinecone using the user's question

3. **Entitlement Filtering:** Results are filtered based on the user's community memberships and app purchases

4. **Tool Extraction:** The AI parses SERVICE_README content to extract structured tool information

### CLI Usage

```bash
# Default: search entitlements
descix tell-me-how "How do I sync my knowledge base?"

# Project scope (uses .descix/workspace.json)
descix tell-me-how --scope project "deploy my app"

# Discovery scope (shows all tools)
descix tell-me-how --scope discovery "what tokenomics tools exist"
```

### MCP Usage

```javascript
// In an AI agent
const plan = await tools.callTool('tell_me_how', {
    question: "Deploy a BNB Chain V2 pool for my community token",
    scope: "entitlements"
});

// Execute the recommended tool
await tools.callTool('execute_remote_command', {
    command: plan.recommended_tools[0].command,
    params: { /* from plan */ }
});
```

### Minimal Tool Set

The client-side MCP now exposes only essential tools:

| Tool | Type | Purpose |
|------|------|---------|
| `descix_doctor` | Local | Startup diagnostic: auth state, workspace context, active app, available tools |
| `platform_health` | Local | Health of the core platform and, optionally, one named microservice |
| `tell_me_how` | Remote | Discovery engine with scope control |
| `execute_remote_command` | Gateway | Pass-through for discovered commands |
| `ask_question_to_app` | Remote | Ask an app's agent a question (RAG) |
| `query_knowledge_base` | Remote | Direct KB search (when you know the target) |
| `find_communities` | Remote | Find communities |
| `list_apps_for_community` | Remote | List a community's apps |
| `get_credit_balance` | Remote | Your USD AI-credit balance |

The list a client actually sees is served live by `tools/list` and is filtered by what the
caller is entitled to — the table above is the core every caller gets.

---

## 6. Entity Type Filtering

### Supported Entity Types

For unified document filtering in Pinecone:

```javascript
EntityTypes = {
    CHUNK: 'CHUNK',                     // Document chunks for RAG
    COMMUNITY: 'COMMUNITY',             // Community description vector
    APP: 'APP',                         // App description vector
    KB: 'KB',                           // Knowledge base summary vector
    IPDOC: 'IPDOC',                     // Document summary vector
    ROLE: 'ROLE',                       // Role description vector
    SERVICE_DOC: 'SERVICE_DOC',         // Microservice README (tool discovery)
    APP_DESCRIPTION: 'APP_DESCRIPTION', // app_description.md
    COMMUNITY_DESCRIPTION: 'COMMUNITY_DESCRIPTION'
}
```

### Multi-Value Filtering

Filters support both single values and arrays:

```javascript
// Single value
buildMetadataFilter({ community_id: 'daita' })
// → { community_id: { $eq: 'daita' } }

// Array (for entitlements)
buildMetadataFilter({ community_ids: ['daita', 'egpt'] })
// → { community_id: { $in: ['daita', 'egpt'] } }
```
