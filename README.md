# Coolify MCP Server

MCP server for managing one or more Coolify API instances.

## Install From GitHub

```powershell
git clone https://github.com/NohchiyBors/coolify-mcp-server.git
cd coolify-mcp-server
npm install
Copy-Item .env.example .env
```

Update `.env` values (`COOLIFY_API_BASE_URL`, `COOLIFY_API_TOKEN`), then run:

```powershell
npm run build
npm start
```

## Install

```powershell
npm install
npm run build
```

## Environment

Default Coolify profile:

- `COOLIFY_API_BASE_URL` - default `https://coolify.example.com/api/v1`
- `COOLIFY_API_TOKEN` - Coolify Bearer token
- `COOLIFY_TIMEOUT_MS` - default `30000`
- `COOLIFY_USER_AGENT` - default `coolify-mcp-server/0.1.0`
- `COOLIFY_ALLOW_RAW_WRITE` - set `true` to allow raw write requests with `confirm=true`

Additional Coolify profiles use this pattern:

```env
COOLIFY_1_ID=dev
COOLIFY_1_API_BASE_URL=https://coolify-dev.example.com/api/v1
COOLIFY_1_API_TOKEN=...

COOLIFY_2_ID=prod
COOLIFY_2_API_BASE_URL=https://coolify-prod.example.com/api/v1
COOLIFY_2_API_TOKEN=...
```

The `ID` value becomes the MCP `server_id`. If `COOLIFY_2_ID` is omitted, the profile id is `2`.

Named profiles are also supported:

```env
COOLIFY_PROD_API_BASE_URL=https://coolify-prod.example.com/api/v1
COOLIFY_PROD_API_TOKEN=...
```

For named profiles, the profile id is the middle part lowercased, so `COOLIFY_PROD_API_TOKEN` becomes `server_id: "prod"`.

## MCP Usage

Every tool accepts optional `server_id`.

- omit `server_id` to use `default`
- use `server_id: "dev"` or `server_id: "prod"` when using indexed profiles
- use `server_id: "prod"` for the named `COOLIFY_PROD_*` profile

Example:

```json
{
  "name": "coolify_list_projects",
  "arguments": {
    "server_id": "prod"
  }
}
```

## Tools

- `coolify_current_server` - returns the selected profile id and API base URL.
- `coolify_healthcheck` - checks `/health`.
- `coolify_version` - returns Coolify version.
- `coolify_list_resources` - lists resources.
- `coolify_list_projects` - lists projects.
- `coolify_list_servers` - lists servers.
- `coolify_list_applications` - lists applications.
- `coolify_get_application` - gets an application by UUID.
- `coolify_get_application_logs` - gets application logs.
- `coolify_list_services` - lists services.
- `coolify_get_service` - gets a service by UUID.
- `coolify_list_databases` - lists databases.
- `coolify_list_deployments` - lists current deployments.
- `coolify_get_deployment` - gets a deployment by UUID.
- `coolify_list_application_deployments` - lists application deployments.
- `coolify_deploy` - deploys by UUID or tag.
- `coolify_control_resource` - start, stop, or restart application/service/database.
- `coolify_api_request` - raw request against `/api/v1`.

Raw write requests through `coolify_api_request` require both `COOLIFY_ALLOW_RAW_WRITE=true` and `confirm=true`.
