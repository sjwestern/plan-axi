#!/usr/bin/env bash
# Install the tools listed in a manifest from their pinned refs.
# Usage: install.sh [--manifest <file>] [--src <dir>] [--only <name>]...
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
manifest="$here/tools.manifest"
src="${TOOLS_SRC:-$HOME/.local/share/orch-tools}"
only=()

while [ $# -gt 0 ]; do
  case "$1" in
    --manifest) manifest="$2"; shift 2 ;;
    --src) src="$2"; shift 2 ;;
    --only) only+=("$2"); shift 2 ;;
    -h|--help) echo "Usage: install.sh [--manifest <file>] [--src <dir>] [--only <name>]..."; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

[ -f "$manifest" ] || { echo "manifest not found: $manifest" >&2; exit 2; }
mkdir -p "$src"

wanted() {
  [ ${#only[@]} -eq 0 ] && return 0
  local n
  for n in "${only[@]}"; do [ "$n" = "$1" ] && return 0; done
  return 1
}

# Clone (or update) <url> into $src/<name> and check out <ref>. Prints the directory.
checkout() {
  local name="$1" url="$2" ref="$3" dir="$src/$1"
  if [ -d "$dir/.git" ]; then
    git -C "$dir" fetch --tags --quiet origin
  else
    git clone --quiet "$url" "$dir"
  fi
  git -C "$dir" checkout --quiet "$ref"
  # Branch refs: follow the remote. Tags and commits stay detached.
  if git -C "$dir" show-ref --verify --quiet "refs/remotes/origin/$ref"; then
    git -C "$dir" reset --quiet --hard "origin/$ref"
  fi
  echo "$dir"
}

while read -r name kind source ref extra; do
  case "$name" in ''|'#'*) continue ;; esac
  if [ -z "${ref:-}" ] || [ -n "${extra:-}" ]; then
    echo "bad manifest line for '$name': expected <name> <kind> <source> <ref>" >&2
    exit 2
  fi
  wanted "$name" || continue
  echo "==> $name ($kind $ref)"
  case "$kind" in
    git-npm)
      dir="$(checkout "$name" "$source" "$ref")"
      (
        cd "$dir"
        npm install --no-audit --no-fund
        npm run build
        for pkg in packages/*/; do (cd "$pkg" && npm link); done
        npm run skills:install
      )
      ;;
    npm)
      npm install -g "$source@$ref"
      ;;
    git-dotnet)
      dir="$(checkout "$name" "$source" "$ref")"
      bash "$dir/scripts/install.sh"
      ;;
    *)
      echo "unknown kind '$kind' for '$name'" >&2
      exit 2
      ;;
  esac
done < "$manifest"

echo "done"
