# Coolify MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io/) server with 77 tool definitions for the Coolify v4 HTTP API: resources, deployments, runtime logs, env vars, CRUD over applications / services / databases / projects / servers / SSH keys, plus team reads. Legacy Compose creation is version-gated; the container command tool is an unavailable compatibility placeholder.

## Features

- **77 tool definitions** covering common Coolify API operations, with a raw request tool for additional endpoints.
- **Current API compatibility** — preview/database/service logs, full-log selectors and timestamps, canonical team routes with legacy fallback, and Compose service creation with UTF-8 YAML encoding.
- **Multi-host** out of the box — one server, many Coolify instances. Each tool accepts `server_id` to route the call.
- **Model-output secret redaction** — API response bodies and headers are recursively scrubbed before text or structured MCP content is returned.
- **Safety gates** — every `create_*`, `update_*`, `delete_*`, and `execute_*` tool requires `confirm: true`. The raw escape hatch (`coolify_api_request`) additionally needs `COOLIFY_ALLOW_RAW_WRITE=true` per profile.
- **stdio-clean** — all server logs go to stderr, stdout is reserved for JSON-RPC, so the protocol stream stays uncorrupted.
- **Token redaction** in structured logs (`token`, `authorization`, `api_key`, `password`, `secret`, `cookie` keys are masked).
- **End-to-end tested** — mock Coolify and a stdio driver exercise supported operations and explicit compatibility errors; focused tests verify wire encoding and fallback boundaries.

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
| `COOLIFY_API_TOKEN` | — | Bearer token for the default profile; optional when named/indexed profiles are configured. |
| `COOLIFY_ID` | `host` | `server_id` for the default profile (`COOLIFY_API_TOKEN`). |
| `COOLIFY_EXTERNAL_IP` | unset | Optional external IPv4/IPv6 address, returned as profile metadata. |
| `COOLIFY_LOCAL_IP` | unset | Optional local IPv4/IPv6 address, returned as profile metadata. |
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

Each profile also registers the **hostname** from `*_API_BASE_URL` as an alias (e.g. `https://host.ickz.net/api/v1` → `server_id: "host.ickz.net"`). Short names and domain aliases point at the same profile.

Each profile may override `*_TIMEOUT_MS`, `*_USER_AGENT`, `*_ALLOW_RAW_WRITE` independently.

Each profile may also declare `*_EXTERNAL_IP` and `*_LOCAL_IP` (default: `COOLIFY_EXTERNAL_IP` / `COOLIFY_LOCAL_IP`; indexed: `COOLIFY_1_EXTERNAL_IP`; named: `COOLIFY_PROD_LOCAL_IP`). Values must be plain IPv4 or IPv6 addresses, without a port, CIDR suffix, or brackets. Empty values mean unknown. Named/indexed profiles never inherit the default profile's IPs.

`coolify_current_server` returns `id`, `apiBaseUrl`, `externalIp`, and `localIp`; unknown IPs are `null`. These addresses are informational: all API requests still use the configured `API_BASE_URL`, including its hostname, protocol, and port. IPs do not add aliases, trigger DNS discovery, or enable automatic local/public failover.

## MCP usage

Every tool accepts an optional `server_id`. If omitted, the `COOLIFY_API_TOKEN` profile is used; without it, the first named/indexed profile is used.

```json
{
  "name": "coolify_list_projects",
  "arguments": { "server_id": "prod" }
}
```

### Connecting from a client

Use stdio only when the client and MCP server run in the same operating system.

#### Windows client -> Windows MCP (stdio)

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

#### WSL client -> WSL MCP (stdio)

Use native Linux Node.js 20+ and an isolated runtime on the WSL Linux filesystem. Prepare and start it from this checkout:

```bash
bash scripts/prepare-wsl-runtime.sh
bash scripts/start-wsl.sh
```

The default runtime is `$HOME/.local/share/coolify-mcp-server/wsl`. The launcher selects Linux Node from `COOLIFY_NODE_BIN`, NVM, or `PATH`; it rejects Windows Node and versions below 20. Preparation and startup reject runtime directories on mounted Windows drives, including symlinks into those drives. No runtime dependencies are placed in OneDrive.

The launcher reads this checkout's existing `.env`, so all profiles and tokens are reused without copying credentials. Override the runtime and env file explicitly when starting from another directory:

```bash
bash /path/to/source/scripts/start-wsl.sh \
  "$HOME/.local/share/coolify-mcp-server/wsl" \
  'D:\Data\OneDrive\source\MCP\coolify-mcp-server\.env'
```

Windows drive paths supplied to the Bash launchers are converted with quoted `wslpath -u`; forward-slash Windows paths and spaces are supported. Profile API URLs and informational IP fields keep their existing behavior.

The source checkout maps exactly as follows (use the output on your machine, including its case):

```bash
wslpath -u 'D:\Data\OneDrive\source\MCP\coolify-mcp-server'
# Use the exact output; do not infer or rewrite directory case.
```

```toml
[mcp_servers.coolify]
command = "/bin/bash"
args = ["/home/<user>/.local/share/coolify-mcp-server/wsl/scripts/start-wsl.sh"]
startup_timeout_sec = 120

[mcp_servers.coolify.env]
COOLIFY_ENV_FILE = "/path/to/source/.env"
MCP_TRANSPORT = "stdio"
```

Replace the example paths with the installed runtime and exact env-file path. Set `COOLIFY_NODE_BIN` in the client environment if Node is not discoverable through NVM or `PATH`. The launcher changes to the runtime directory, so the client does not need a source-tree `cwd`.

By default the server loads `.env` from `cwd`. Set `COOLIFY_ENV_FILE` to select an explicit env file. The path must use the MCP server runtime's own OS format; the server rejects a Windows drive path in WSL and a `/mnt/<drive>` path in Windows with an actionable error.

### HTTP Transport (Cross-OS / WSL Compatibility)

Use Streamable HTTP when the client and server run in different operating systems. Filesystem paths do not cross the MCP boundary.

#### WSL client -> Windows MCP

Start the server from Windows:

```powershell
$env:MCP_TRANSPORT="http"
$env:MCP_HTTP_HOST="127.0.0.1"
$env:MCP_HTTP_PORT="3031"
$env:COOLIFY_ENV_FILE="D:\Data\OneDrive\source\MCP\coolify-mcp-server\.env"
npm start
```

Then configure the WSL client with URL `http://127.0.0.1:3031/mcp` only after verifying that the current WSL networking mode forwards Windows loopback. If it does not, bind to a specifically approved reachable address, set `MCP_API_KEY`, scope the Windows firewall rule, and use a bearer header. Never expose unauthenticated MCP on `0.0.0.0`.

#### Windows client -> WSL MCP

This direction is optional. Start the isolated WSL runtime with HTTP transport and use its verified reachable endpoint from Windows. A non-loopback bind requires `MCP_API_KEY` and a scoped firewall rule. Do not assume that WSL and Windows share loopback in every networking mode.

Generic URL-based client configuration:

```json
{
  "mcpServers": {
    "coolify": {
      "url": "http://127.0.0.1:3031/mcp",
      "headers": {
        "Authorization": "Bearer <MCP_API_KEY>"
      }
    }
  }
}
```

Omit the authorization header only for a verified loopback-only listener without `MCP_API_KEY`.

Available environment variables:

| Variable | Default | Notes |
|---|---|---|
| `MCP_TRANSPORT` | `stdio` | Options: `stdio`, `http`, `streamable-http`, or `both`. |
| `MCP_HTTP_HOST` | `127.0.0.1` | Bind host. Use `0.0.0.0` to listen on all interfaces. |
| `MCP_HTTP_PORT` | `3031` | Bind port. |
| `MCP_API_KEY` | — | Required if binding to a non-loopback host. Bearer token for client auth. |
| `MCP_HTTP_MAX_BODY_KB` | `1024` | Maximum JSON request body size. |
| `COOLIFY_ENV_FILE` | `<cwd>/.env` | Optional explicit env file in the server runtime's OS path format. |

### OS-local runtime staging

Never share `node_modules` between Windows and WSL through OneDrive. Build independent runtime directories:

```powershell
.\scripts\Prepare-WindowsRuntime.ps1
```

```bash
bash scripts/prepare-wsl-runtime.sh
```

Both launchers stage only runtime source, tests, WSL launcher scripts, the lockfile, and `.env.example`; `.env`, `.git`, `node_modules`, `dist`, and StatusProject state are excluded. The target must be empty, which makes cleanup and rollback explicit. WSL preparation runs the full check suite once; startup does not install dependencies or rebuild.

This checkout uses an external Windows-owned Git directory whose `core.worktree` is a Windows path. In WSL use `scripts/git-wsl.sh status`, `scripts/git-wsl.sh diff`, and related subcommands. The wrapper supplies the exact Linux worktree path without rewriting shared Git configuration.

Troubleshooting order:

1. Validate the path format and that the exact drive is mounted.
2. Validate Node.js 20+ and the selected OS-local runtime.
3. Distinguish process startup failure from MCP initialize/tools-list failure.
4. For HTTP, test endpoint reachability, bearer authentication, and port conflicts.
5. Only after MCP works, classify Coolify API `401`, timeout, and resource errors separately.

## Tools (77 definitions)

Grouped by domain. **Bold** entries mutate state and require `confirm: true`.

### Server-level

| Tool | Description |
|---|---|
| `coolify_current_server` | Selected profile id, API base URL, and optional external/local IP metadata. |
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

Read: `coolify_list_applications` (optional `tag`), `coolify_get_application`, `coolify_get_application_logs`, `coolify_get_preview_application_logs` (requires `pull_request_id`, Coolify 4.3.23+).

Runtime log tools accept `lines`: 1–10000, `-1`, or `"all"`, and optional `show_timestamps`. `"all"` requires Coolify 4.3.20+; omitting `lines` uses the API default of 100. Preview logs require a running preview container. Full-log responses can be large.

Create — pick the source:

| Tool | Endpoint |
|---|---|
| **`coolify_create_application_public`** | `POST /applications/public` |
| **`coolify_create_application_private_github_app`** | `POST /applications/private-github-app` |
| **`coolify_create_application_private_deploy_key`** | `POST /applications/private-deploy-key` |
| **`coolify_create_application_dockerfile`** | `POST /applications/dockerfile` |
| **`coolify_create_application_dockercompose`** | Legacy `POST /applications/dockercompose`, Coolify 4.0 only; checks `/version` before writing. For current versions use `coolify_create_service_dockercompose`. |
| **`coolify_create_application_dockerimage`** | `POST /applications/dockerimage` |

Mutate: **`coolify_update_application`**, **`coolify_delete_application`**. `coolify_execute_application_command` remains as an unavailable compatibility placeholder: it returns an actionable error and sends no API request. Use the Coolify terminal or separately authorized saved SSH access for container commands.

Env vars: `coolify_list_application_envs`, **`coolify_create_application_env`**, **`coolify_update_application_env`**, **`coolify_update_application_envs_bulk`**, **`coolify_delete_application_env`**.

### Services

Read: `coolify_list_services`, `coolify_get_service`, `coolify_get_service_logs` (required `sub_service_name`, the application/database component name from `coolify_get_service`).

CRUD: **`coolify_create_service`** (one-click templates — pass `type` like `wordpress-with-mysql`, `n8n`, `directus`, ...), **`coolify_update_service`**, **`coolify_delete_service`**.

**`coolify_create_service_dockercompose`** creates a custom service via `POST /services`. Supply `body.project_uuid`, `body.server_uuid`, `body.environment_name` or `body.environment_uuid`, and `body.docker_compose_raw` as **plain UTF-8 Compose YAML**. The MCP encodes the YAML as base64 for the API. Do not supply `type` or already encoded YAML. Optional API fields such as `name`, `urls`, `tags`, and `destination_uuid` pass through. Deployment occurs only when you explicitly set `instant_deploy: true`. This creates a service resource; it does not create a legacy application.

Env vars: `coolify_list_service_envs`, **`coolify_create_service_env`**, **`coolify_update_service_env`**, **`coolify_update_service_envs_bulk`**, **`coolify_delete_service_env`**.

### Databases

Read: `coolify_list_databases`, `coolify_get_database`, `coolify_get_database_logs`.

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

`coolify_list_servers`, `coolify_get_server`, `coolify_get_server_resources`, `coolify_get_server_domains`, `coolify_validate_server`, **`coolify_rotate_server_sentinel_token`**. Rotation generates the token inside the MCP process and never returns it; `confirm: true` is required.

CRUD: **`coolify_create_server`**, **`coolify_update_server`**, **`coolify_delete_server`**.

### Private keys

`coolify_list_private_keys`, `coolify_get_private_key`.

CRUD: **`coolify_create_private_key`**, **`coolify_update_private_key`**, **`coolify_delete_private_key`**.

### Teams (read-only)

`coolify_list_teams`, `coolify_get_team`, `coolify_get_current_team`, `coolify_get_current_team_members`.

Current-team reads use `/team` and `/team/members`. Only HTTP 404 triggers a fallback to `/teams/current` and `/teams/current/members` for older Coolify. Authorization, rate-limit, server, and network errors propagate without fallback.

## Safety model

| Tool family | Gate |
|---|---|
| Read (`list_*`, `get_*`, `healthcheck`, `version`, `current_server`) | None — pure reads. |
| `coolify_deploy`, `coolify_control_resource` | None — frequent ops actions. |
| `coolify_create_*` / `coolify_update_*` / `coolify_execute_application_command` / `coolify_rotate_server_sentinel_token` | `confirm: true` per call. |
| `coolify_delete_*` | `confirm: true` per call. |
| `coolify_api_request` (non-GET) | `COOLIFY_ALLOW_RAW_WRITE=true` (env, per profile) **and** `confirm: true` (per call). |

Bodies for `create_*` / `update_*` generally pass through as JSON. `coolify_create_service_dockercompose` validates its required routing fields and encodes plain YAML to base64. Required fields are documented in the tool description; Coolify returns `422` with field-level details for invalid API fields, propagated as `isError: true`.

## Architecture

```
src/
  index.ts          MCP stdio transport, tool registration, server_id dispatch
  config.ts         env → ServerConfig profiles (default, indexed, named)
  coolify-client.ts thin fetch wrapper — timeouts, headers, response parsing
  logger.ts         JSON logs, secret redaction, all → stderr
  redaction.ts      recursive response/header secret redaction before MCP output
  tools.ts          77 tool defs + CRUD builders and compatibility helpers
Test/
  mock_coolify.mjs  local HTTP mock of /api/v1 for offline driver tests
  full_test.mjs     JSON-RPC driver — all tools vs mock
  mcp_test.mjs      read-only smoke vs hosts from .env
```

stdio transport: every JSON-RPC frame is one line on stdout; everything else (logs, panics, dotenv noise) goes to stderr.

Stack: TypeScript 5.9 (strict, NodeNext), `@modelcontextprotocol/sdk` 1.x, `dotenv` 17, built-in `fetch`. No runtime dependencies on the API side.

## Local testing

Two drivers ship with the project — both spawn the real built server over stdio. Run from the repo root after `npm run build`.

```powershell
# Tool operations and compatibility errors over stdio against a mock Coolify
node Test/full_test.mjs

# API contract regression tests: encoding, version gates, logs, fallback boundaries
node Test/api_compatibility_test.mjs

# Read-only smoke against the real hosts in your .env
node Test/mcp_test.mjs
```

The live smoke checks the default profile plus `hostkz` when configured. Override the selection with `COOLIFY_SMOKE_SERVER_IDS=host,prod`.

`Test/mock_coolify.mjs` implements every endpoint the tools hit and logs each request, so you can also use it to inspect the exact wire shape (method, path, query, body) the MCP server sends.

## License

MIT.
