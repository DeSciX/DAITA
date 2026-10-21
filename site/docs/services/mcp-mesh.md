# MCP Mesh Integration

The DeSciX platform uses the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) for AI agent integration. Core registers tools from all registered microservices alongside its own native commands and dispatches calls to whichever service owns the command. What it *advertises* at the MCP handshake is a small floor of that set — see [Advertised Tool Surface](#advertised-tool-surface).

## Endpoint

- **Path:** `/mcp`
- **Local:** descix-serve proxies `/mcp` to Core (apiFront)
- **Production:** LB routes `/mcp` to Core NEG

## Tool Provider Model

Microservices are **Tool Providers**—they expose MCP tools with JSON `inputSchema`, not isolated REST APIs. `buildPermissionFilteredToolList()` (in the Cloud's `apiFront`) builds the advertised surface in four stages:

1. Loads the candidate universe — native tools (`commandMeta mcp:true`) plus external tools from Firestore `ServiceManifests` — from its one owner, the Cloud's `advertisableTools` module
2. Filters by the caller's permissions (the describe IS the permission gate)
3. Applies the DISCOVERY-CORE fence: keeps only the handshake floor plus the caller's granted command names, and discards the rest from `tools/list`
4. Applies the OAuth read-only gate for public-internet OAuth callers

Everything discarded at stage 3 stays registered and callable — call-time dispatch is unaffected. Agents reach it via `tell_me_how` + `execute_remote_command`.

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

## Advertised Tool Surface

The set advertised at the MCP handshake is **DISCOVERY-CORE**, owned by
`DISCOVERY_CORE_TOOL_NAMES` in `@descix/platform-api/mcp-tools` (`src/mcp-tools/nativeTools.js` in the published package).
Its membership is ratified — do not add or remove a name without a CEO ruling. Call
`describeDiscoveryCoreFence()` in that same module for the fence's own statement of its
contract, derived from the constant so it cannot drift from what is filtered.

The fence is a **floor, not a ceiling**: `tools/list` serves DISCOVERY-CORE **union** the
calling identity's granted command names (the Cloud's `toolVisibilityService`). An absent,
empty or expired grant is inert — the union degrades to exactly the floor. A grant widens
visibility only; the permission gate runs first, so a granted name the caller may not invoke was
already dropped and cannot be re-admitted.

Every other registered command remains callable via `tell_me_how` + `execute_remote_command`.
The CLI's stdio MCP server concatenates two CLI-local diagnostics (`descix_doctor`,
`platform_health`) onto the backend's list; they are local CLI operations, not `/apifront`
commands, and the HTTP transport never advertises them.

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

The MCP server runs in the CLI; it uses the CLI's HTTP-only api-client for all backend operations. See `agent-assets/reference/mcp-integration.md` in the published `@descix/cli` package.

## Related

- [service-mesh-and-proxying](service-mesh-and-proxying.md)
