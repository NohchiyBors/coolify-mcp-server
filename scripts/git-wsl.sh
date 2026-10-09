#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
work_tree="$(cd -- "${script_dir}/.." && pwd -P)"
git_pointer="${work_tree}/.git"

if [[ ! -f "${git_pointer}" ]]; then
  echo "Expected a .git pointer file at ${git_pointer}" >&2
  exit 2
fi

gitdir_value="$(sed -n 's/^gitdir:[[:space:]]*//p' "${git_pointer}" | head -n 1)"
if [[ -z "${gitdir_value}" ]]; then
  echo "Invalid .git pointer: ${git_pointer}" >&2
  exit 2
fi

if [[ "${gitdir_value}" = /* ]]; then
  git_dir="${gitdir_value}"
else
  git_dir="$(cd -- "${work_tree}/${gitdir_value}" && pwd -P)"
fi

exec git --git-dir="${git_dir}" --work-tree="${work_tree}" "$@"
