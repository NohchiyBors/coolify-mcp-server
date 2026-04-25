# Coolify MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io/) server that wraps the Coolify v4 HTTP API as 72 typed tools so an LLM agent can manage one or more Coolify instances the same way it would the panel — list resources, deploy, manage env vars, full CRUD over applications / services / databases / projects / servers / SSH keys, plus team reads.

## Features

- **72 typed tools** covering ~all of the Coolify v4 API surface a user actually needs.
- **Multi-host** out of the box — one server, many Coolify instances. Each tool accepts `server_id` to route the call.
- **Safety gates** — every `create_*`, `update_*`, `delete_*`, and `execute_*` tool requires `confirm: true`. The raw escape hatch (`coolify_api_request`) additionally needs `COOLIFY_ALLOW_RAW_WRITE=true` per profile.
- **stdio-clean** — all server logs go to stderr, stdout is reserved for JSON-RPC, so the protocol stream stays uncorrupted.
- **Token redaction** in structured logs (`token`, `authorization`, `api_key`, `password`, `secret`, `cookie` keys are masked).
- **End-to-end tested** — included mock Coolify + driver exercises every tool through real stdio (currently 81/81 pass).

## Install

### From GitHub

```powershell
git clone https://github.com/NohchiyBors/coolify-mcp-server.git
cd coolify-mcp-server
npm install
Copy-Item .env.example .env
```

Edit `.env` (`COOLIFY_API_BASE_URL`, `COOLIFY_API_TOKEN`), then build & run:

```powershell
npm run build
npm start
```

### Existing checkout

```powershell
npm install
npm run build
```

Requires Node 20+ (built-in `fetch`, `AbortSignal.timeout`).

## Environment

### Default profile

| Variable | Default | Notes |
|---|---|---|
| `COOLIFY_API_BASE_URL` | `https://coolify.example.com/api/v1` | Base URL ending in `/api/v1`. |
| `COOLIFY_API_TOKEN` | — | Required. Coolify Bearer token. |
| `COOLIFY_TIMEOUT_MS` | `30000` | Per-request timeout. |
| `COOLIFY_USER_AGENT` | `coolify-mcp-server/0.1.0` | Sent on every API call. |
| `COOLIFY_ALLOW_RAW_WRITE` | `false` | Allow non-GET via `coolify_api_request` (still needs `confirm=true`). |
| `LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error`. Logs go to stderr. |

### Multiple Coolify profiles

**Indexed** profiles — the `_ID` becomes the `server_id`; if omitted, the index is used:

```env
COOLIFY_1_ID=dev
COOLIFY_1_API_BASE_URL=https://coolify-dev.example.com/api/v1
COOLIFY_1_API_TOKEN=...

COOLIFY_2_ID=prod
COOLIFY_2_API_BASE_URL=https://coolify-prod.example.com/api/v1
COOLIFY_2_API_TOKEN=...
```

**Named** profiles — the middle segment, lowercased, becomes the `server_id`:

```env
COOLIFY_PROD_API_BASE_URL=https://coolify-prod.example.com/api/v1
COOLIFY_PROD_API_TOKEN=...
```

→ `server_id: "prod"`.

Each profile may override `*_TIMEOUT_MS`, `*_USER_AGENT`, `*_ALLOW_RAW_WRITE` independently.

## MCP usage

Every tool accepts an optional `server_id`. If omitted, the first registered profile is used.

```json
{
  "name": "coolify_list_projects",
  "arguments": { "server_id": "prod" }
}
```

### Connecting from a client

Claude Desktop / Cline / any MCP-aware client:

```json
{
  "mcpServers": {
    "coolify": {
      "command": "node",
      "args": ["D:\\Data\\OneDrive\\source\\MCP\\coolify-mcp-server\\dist\\index.js"],
      "cwd": "D:\\Data\\OneDrive\\source\\MCP\\coolify-mcp-server"
    }
  }
}
```

`.env` is picked up from `cwd`, so secrets do not have to be passed inline.

## Tools (72)

Grouped by domain. **Bold** entries mutate state and require `confirm: true`.

### Server-level

| Tool | Description |
|---|---|
| `coolify_current_server` | Selected profile id and API base URL. |
| `coolify_healthcheck` | `GET /health` (no auth). |
| `coolify_version` | Coolify version. |
| `coolify_api_request` | Raw request against `/api/v1`. Non-GET requires `COOLIFY_ALLOW_RAW_WRITE=true` **and** `confirm=true`. |

### Resources & deployments

| Tool | Description |
|---|---|
| `coolify_list_resources` | All resources across projects. |
| `coolify_list_deployments` | Currently running deployments. |
| `coolify_get_deployment` | Get deployment by UUID. |
| `coolify_list_application_deployments` | Deployments for an application UUID (`skip`, `take`). |
| `coolify_deploy` | Deploy by UUID or tag (`force`, `pr`). |
| `coolify_control_resource` | Start / stop / restart for application / service / database. |

### Applications

Read: `coolify_list_applications` (optional `tag`), `coolify_get_application`, `coolify_get_application_logs` (optional `lines`).

Create — pick the source:

| Tool | Endpoint |
|---|---|
| **`coolify_create_application_public`** | `POST /applications/public` |
| **`coolify_create_application_private_github_app`** | `POST /applications/private-github-app` |
| **`coolify_create_application_private_deploy_key`** | `POST /applications/private-deploy-key` |
| **`coolify_create_application_dockerfile`** | `POST /applications/dockerfile` |
| **`coolify_create_application_dockercompose`** | `POST /applications/dockercompose` |
| **`coolify_create_application_dockerimage`** | `POST /applications/dockerimage` |

Mutate: **`coolify_update_application`**, **`coolify_delete_application`**, **`coolify_execute_application_command`** (runs a shell command in the running container).

Env vars: `coolify_list_application_envs`, **`coolify_create_application_env`**, **`coolify_update_application_env`**, **`coolify_update_application_envs_bulk`**, **`coolify_delete_application_env`**.

### Services

Read: `coolify_list_services`, `coolify_get_service`.

CRUD: **`coolify_create_service`** (one-click templates — pass `type` like `wordpress-with-mysql`, `n8n`, `directus`, ...), **`coolify_update_service`**, **`coolify_delete_service`**.

Env vars: `coolify_list_service_envs`, **`coolify_create_service_env`**, **`coolify_update_service_env`**, **`coolify_update_service_envs_bulk`**, **`coolify_delete_service_env`**.

### Databases

Read: `coolify_list_databases`, `coolify_get_database`.

Create per type:

| Tool | Endpoint |
|---|---|
| **`coolify_create_database_postgresql`** | `POST /databases/postgresql` |
| **`coolify_create_database_mysql`** | `POST /databases/mysql` |
| **`coolify_create_database_mariadb`** | `POST /databases/mariadb` |
| **`coolify_create_database_mongodb`** | `POST /databases/mongodb` |
| **`coolify_create_database_redis`** | `POST /databases/redis` |
| **`coolify_create_database_keydb`** | `POST /databases/keydb` |
| **`coolify_create_database_dragonfly`** | `POST /databases/dragonfly` |
| **`coolify_create_database_clickhouse`** | `POST /databases/clickhouse` |

Mutate: **`coolify_update_database`**, **`coolify_delete_database`**.

### Projects

`coolify_list_projects`, `coolify_get_project`, `coolify_get_project_environment`.

CRUD: **`coolify_create_project`**, **`coolify_update_project`**, **`coolify_delete_project`**.

### Servers

`coolify_list_servers`, `coolify_get_server`, `coolify_get_server_resources`, `coolify_get_server_domains`, `coolify_validate_server`.

CRUD: **`coolify_create_server`**, **`coolify_update_server`**, **`coolify_delete_server`**.

### Private keys

`coolify_list_private_keys`, `coolify_get_private_key`.

CRUD: **`coolify_create_private_key`**, **`coolify_update_private_key`**, **`coolify_delete_private_key`**.

### Teams (read-only)

`coolify_list_teams`, `coolify_get_team`, `coolify_get_current_team`, `coolify_get_current_team_members`.

## Safety model

| Tool family | Gate |
|---|---|
| Read (`list_*`, `get_*`, `healthcheck`, `version`, `current_server`) | None — pure reads. |
| `coolify_deploy`, `coolify_control_resource` | None — frequent ops actions. |
| `coolify_create_*` / `coolify_update_*` / `coolify_execute_application_command` | `confirm: true` per call. |
| `coolify_delete_*` | `confirm: true` per call. |
| `coolify_api_request` (non-GET) | `COOLIFY_ALLOW_RAW_WRITE=true` (env, per profile) **and** `confirm: true` (per call). |

Bodies for `create_*` / `update_*` are pass-through JSON. Required fields are documented in the tool description; Coolify itself returns `422` with field-level details if anything is missing, and the error propagates back as `isError: true` to the client.

## Architecture

```
src/
  index.ts          MCP stdio transport, tool registration, server_id dispatch
  config.ts         env → ServerConfig profiles (default, indexed, named)
  coolify-client.ts thin fetch wrapper — timeouts, headers, response parsing
  logger.ts         JSON logs, secret redaction, all → stderr
  tools.ts          72 tool defs + compact CRUD builders (makeCreateBodyTool, ...)
```

stdio transport: every JSON-RPC frame is one line on stdout; everything else (logs, panics, dotenv noise) goes to stderr.

Stack: TypeScript 5.9 (strict, NodeNext), `@modelcontextprotocol/sdk` 1.x, `dotenv` 17, built-in `fetch`. No runtime dependencies on the API side.

## Local testing

Two drivers ship with the project — both spawn the real built server over stdio.

```powershell
# All 72 tools end-to-end against a local mock Coolify
node full_test.mjs
# → 81 passed, 0 failed   (72 happy paths + 9 confirm-gate negative checks)

# Read-only smoke against the real hosts in your .env
node mcp_test.mjs
```

`mock_coolify.mjs` implements every endpoint the tools hit and logs each request, so you can also use it to inspect the exact wire shape (method, path, query, body) the MCP server sends.

## License

MIT.
