#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
source_root="$(cd -- "${script_dir}/.." && pwd -P)"
. "${script_dir}/wsl-common.sh"

if (( $# > 1 )); then
  echo 'Usage: bash scripts/prepare-wsl-runtime.sh [empty-runtime-root]' >&2
  exit 2
fi
target="$(coolify_wsl_runtime_path "${1:-${COOLIFY_WSL_RUNTIME_ROOT:-${HOME}/.local/share/coolify-mcp-server/wsl}}")"
node_bin="$(coolify_linux_node)"

export PATH="$(dirname -- "${node_bin}"):/usr/bin:/bin"

if [[ -e "${target}" ]] && [[ -n "$(find "${target}" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null)" ]]; then
  echo "Runtime target is not empty: ${target}" >&2
  echo "Choose a new target or remove the old runtime explicitly after preserving its manifest." >&2
  exit 2
fi

"${node_bin}" "${source_root}/scripts/stage-runtime.mjs" "${target}"
cd -- "${target}"
export npm_config_cache="${target}/.npm-cache"
npm ci
npm run check

printf 'WSL runtime ready: %s\n' "${target}"
printf 'Start with: bash %q %q %q\n' "${source_root}/scripts/start-wsl.sh" "$target" "${source_root}/.env"
