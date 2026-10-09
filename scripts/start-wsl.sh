#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
source_root="$(cd -- "${script_dir}/.." && pwd -P)"
. "${script_dir}/wsl-common.sh"

if (( $# > 2 )); then
  echo 'Usage: bash scripts/start-wsl.sh [runtime-root] [env-file]' >&2
  exit 2
fi

runtime_root="$(coolify_wsl_runtime_path "${1:-${COOLIFY_WSL_RUNTIME_ROOT:-${HOME}/.local/share/coolify-mcp-server/wsl}}")"
node_bin="$(coolify_linux_node)"
if [[ ! -f "${runtime_root}/dist/index.js" ]]; then
  echo 'WSL runtime is not built. Run bash scripts/prepare-wsl-runtime.sh with this runtime root first.' >&2
  exit 2
fi

env_file="${2:-${COOLIFY_ENV_FILE:-}}"
if [[ -z "$env_file" && -f "${source_root}/.env" ]]; then
  env_file="${source_root}/.env"
fi
if [[ -n "$env_file" ]]; then
  env_file="$(coolify_native_path "$env_file")"
  env_file="$(realpath -m -- "$env_file")"
  if [[ ! -r "$env_file" || ! -f "$env_file" ]]; then
    echo 'Selected env file is missing or unreadable. Check the exact path and drive mount.' >&2
    exit 2
  fi
  export COOLIFY_ENV_FILE="$env_file"
fi

export PATH="$(dirname -- "$node_bin"):${PATH}"
export MCP_TRANSPORT="${MCP_TRANSPORT:-stdio}"
cd -- "$runtime_root"
exec "$node_bin" "${runtime_root}/dist/index.js"
