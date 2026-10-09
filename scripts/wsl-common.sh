#!/usr/bin/env bash
# Shared path/Node checks for native Linux/WSL launchers. Source this file.

coolify_native_path() {
  local requested="$1"
  if [[ "$requested" =~ ^[A-Za-z]:[\\/] ]]; then
    if ! command -v wslpath >/dev/null 2>&1; then
      echo 'Windows paths require wslpath. Supply the Linux path instead.' >&2
      return 2
    fi
    wslpath -u "$requested"
  else
    printf '%s\n' "$requested"
  fi
}

coolify_linux_node() {
  local selected="${COOLIFY_NODE_BIN:-}" version
  if [[ -z "$selected" && -d "${HOME}/.nvm/versions/node" ]]; then
    selected="$(find "${HOME}/.nvm/versions/node" -mindepth 3 -maxdepth 3 -type f -name node -perm -u+x 2>/dev/null | sort -V | tail -n 1 || true)"
  fi
  if [[ -z "$selected" ]]; then
    selected="$(command -v node || true)"
  fi
  if [[ -z "$selected" ]]; then
    echo 'Linux Node.js 20+ was not found. Set COOLIFY_NODE_BIN to a Linux Node executable.' >&2
    return 2
  fi
  selected="$(coolify_native_path "$selected")" || return 2
  if [[ "$selected" != */* ]]; then
    selected="$(command -v "$selected" || true)"
  fi
  if [[ ! -x "$selected" ]]; then
    echo 'Selected Node executable is missing or not executable.' >&2
    return 2
  fi
  version="$("$selected" -p 'process.platform + ":" + Number(process.versions.node.split(".")[0])')" || return 2
  if [[ ! "$version" =~ ^linux:([0-9]+)$ ]]; then
    echo 'WSL requires native Linux Node.js; Windows node.exe is not supported.' >&2
    return 2
  fi
  if (( BASH_REMATCH[1] < 20 )); then
    echo 'Linux Node.js 20+ is required. Set COOLIFY_NODE_BIN to a supported executable.' >&2
    return 2
  fi
  printf '%s\n' "$selected"
}

coolify_wsl_runtime_path() {
  local requested resolved
  requested="$(coolify_native_path "$1")" || return 2
  resolved="$(realpath -m -- "$requested")" || return 2
  case "$resolved" in
    /|/mnt/[A-Za-z]|/mnt/[A-Za-z]/*)
      echo 'WSL runtime must be on the Linux filesystem, outside Windows drive mounts and OneDrive.' >&2
      return 2 ;;
  esac
  printf '%s\n' "$resolved"
}
