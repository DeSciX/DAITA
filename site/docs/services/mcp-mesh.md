# MCP Mesh Integration

The DeSciX platform uses the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) for AI agent integration. Core aggregates tools from all registered microservices into a single unified catalog.

## Endpoint

- **Path:** `/mcp`
- **Local:** descix-serve proxies `/mcp` to Core (apiFront)
- **Production:** LB routes `/mcp` to Core NEG

## Tool Provider Model

Microservices are **Tool Providers**—they expose MCP tools with JSON `inputSchema`, not isolated REST APIs. When Core receives a command:

1. Loads native tools (Auth, Purchase, etc.)
2. Loads external tools from Firestore `ServiceManifests`
3. Merges into a single `tools/list` catalog
4. AI agents discover and invoke via `execute_remote_command`

## tell_me_how: Semantic Tool Discovery

Instead of static tool lists, use **semantic discovery**:

```bash
descix tell-me-how "How do I sync my knowledge base?"
descix tell-me-how --scope project "deploy my app"
descix tell-me-how --scope discovery "what tokenomics tools exist"
```

### Scope Options

| Scope | Description | Use Case |
|-------|-------------|----------|
| `project` | Tools from communities/apps in `.descix/workspace.json` | Working within a specific project |
| `entitlements` | **Default** – only tools user has access to | Safe, actionable results |
| `discovery` | All platform tools | Exploring, deciding what to purchase |

### How It Works

1. **Service Registration:** When a microservice registers with `SERVICE_README_{name}.md`, the README is chunked and vectorized with `entity_type: SERVICE_DOC`
2. **Semantic Search:** `tell_me_how` searches Pinecone for relevant SERVICE_DOC vectors using the user's question
3. **Entitlement Filtering:** Results filtered by community memberships and app purchases
4. **Tool Extraction:** AI parses README content to extract structured tool information

## Minimal Tool Set

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

## Loopback (Service-to-Core)

Microservices can call Core via `mcpClient.callTool()` to use shared capabilities (RAG, auth):

```javascript
import { mcpClient } from '../mcpClient.js';

const context = await mcpClient.callTool('query_knowledge_base', {
    query: "community governance best practices"
}, _descix); // Pass original user identity
```

## CLI Usage

```bash
descix microservice register   # Push manifest + SERVICE_README to Firestore
descix quickstart              # auth, workspace, agent files, .vscode/mcp.json, .descix/sdk-assets/
descix tell-me-how "<question>"  # discover platform tools
```

## MCP Server

The MCP server runs in the CLI; it uses the CLI's HTTP-only api-client for all backend operations. See [DeSciX_Core/descix-cli/agent-assets/reference/mcp-integration.md](../../DeSciX_Core/descix-cli/agent-assets/reference/mcp-integration.md).

## Related

- [service-mesh-and-proxying](service-mesh-and-proxying.md)
- [api-and-command-routing](api-and-command-routing.md)
