#!/bin/sh

set -eu

repo_root=$(CDPATH='' cd "$(dirname "$0")/.." && pwd -P)
cd "$repo_root"

if command -v jj >/dev/null 2>&1 && jj root >/dev/null 2>&1; then
  tracked=$(jj file list -r @)
else
  tracked=$(git ls-files)
fi

failed=0

require_path() {
  if [ ! -e "$1" ]; then
    printf 'missing required Rust authority: %s\n' "$1" >&2
    failed=1
  fi
}

require_path Cargo.toml
require_path Cargo.lock
require_path crates/lapis-terminal-service/Cargo.toml
require_path crates/lapis-terminal-service/src/lib.rs
require_path crates/lapis-terminal-service/src/output.rs
require_path crates/lapis-terminal-service/src/session.rs
require_path crates/lapis-terminal-service/tests/pty.rs
require_path spec/book.toml
require_path spec/src/SUMMARY.md
require_path spec/src/architecture.md
require_path spec/src/sessions.md
require_path spec/src/spec-governance.md
require_path spec/src/verification.md

for path in $tracked; do
  case "$path" in
    .changeset/*|bin/*|scripts/*|src/*|tests/deno/*|.github/workflows/release.yml|deno.json|deno.jsonc|deno.lock|package.json|pnpm-lock.yaml|pnpm-workspace.yaml|native-artifacts.json|spec-validator.config.mjs|tsconfig.json|vitest.config.ts)
      printf 'retired terminal-host path is tracked: %s\n' "$path" >&2
      failed=1
      ;;
  esac
  case "$path" in
    *.js|*.jsx|*.mjs|*.cjs|*.ts|*.tsx)
      printf 'JavaScript or TypeScript source is tracked: %s\n' "$path" >&2
      failed=1
      ;;
  esac
done

if [ "$failed" -ne 0 ]; then
  exit 1
fi

printf 'Rust-only terminal-host source audit passed.\n'
