# App Development in Cursor with MCP

DeSciX supports easy app development from Cursor using the CLI and MCP (Model Context Protocol). Semantic discovery, workspace-driven routing, and a minimal tool set let you build and run apps without memorizing commands.

## Semantic Discovery: tell_me_how

Instead of static tool lists, use **semantic discovery**:

```bash
descix tell-me-how "How do I sync my knowledge base?"
descix tell-me-how --scope project "deploy my app"
descix tell-me-how --scope discovery "what tokenomics tools exist"
```

### Scope Options

| Scope | Description |
|-------|-------------|
| `project` | Tools from communities/apps in `.descix/workspace.json` |
| `entitlements` | **Default** – only tools you have access to |
| `discovery` | All platform tools |

How it works: services register with `SERVICE_README_{name}.md`; READMEs are vectorized in Pinecone. `tell_me_how` searches for relevant tools and filters by entitlements.

## CLI Workflow

1. **Initialize**: `descix init` creates `.descix/workspace.json`
2. **Configure**: Add apps and ports in `workspace.json`
3. **Serve**: `descix serve` (or `npm run dev:serve` from DeSciX_PWA) starts the local gateway

The gateway uses `createViteProxyConfig` from `@descix/app-sdk/dev` to proxy:

- `/apifront`, `/api`, `/mcp` → Core
- `/powch` → Powch PWA
- `/s/{community}/{appId}` → `localhost:{service.port}` per `workspace.json`

## MCP Integration

- **Endpoint**: `/mcp` (proxied to Core in local dev and production)
- **Tools**: `tell_me_how`, `execute_remote_command`, `search_knowledge_base`, `chat_with_kb`, `descix_init`, `git_sync_ops`, `descix_wizard_step`

The MCP server runs in the CLI and uses the CLI's HTTP-only api-client for all backend operations.

### MCP Commands

```bash
descix quickstart                  # auth, workspace, agent files, .vscode/mcp.json, .descix/sdk-assets/
descix tell-me-how "<question>"    # discover platform tools
descix mcp execute --tool <name> --params '<json>'   # run one tool
```

## Local Proxy and Routing

Ports come from `.descix/workspace.json` — `env.platform` for the platform app and `env.products[]` for every other app, each with its own `site.port` and `microservice.port`. The local gateway mirrors production routing so you develop against the same paths production uses. For the route table it actually builds, and for how it resolves its own port, read [platform-runtime-mental-model](../architecture/platform-runtime-mental-model.md) §5 — it is generated from `createViteProxyConfig.js` rather than restated here.

## Related

- [MCP mesh](../services/mcp-mesh.md) – Semantic discovery, tool set
- [Platform runtime mental model](../architecture/platform-runtime-mental-model.md) – `descix serve` as LB replicator, routing table, port resolution
