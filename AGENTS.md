# Terminal Host agent guide

This repository preserves the private Rust PTY service consumed by native
Lapis hosts. The former Deno, npm, CLI, WebSocket and download surfaces are
retired and must not be restored.

## Ownership

- Keep `Cargo.toml`, `Cargo.lock` and `crates/lapis-terminal-service/**` in this
  repository. Do not relocate or duplicate the Rust implementation.
- The crate remains private (`publish = false`) and consumers pin exact Git
  revisions.
- Hosts own authentication, vault admission and transport. Plugins own terminal
  presentation and workspace policy.
- Preserve historical Git and npm artifacts. Never unpublish old packages.

## Canonical specification

Normative Rust behavior lives under [`spec/src`](./spec/src). Update the owning
chapter before or with protected Rust, Cargo, CI, audit or guidance changes.
Keep exactly one verification row for every requirement ID and build the book
with mdBook.

## Workflow

1. Inspect `jj --no-pager st` and preserve unrelated changes.
2. Read the relevant requirement and verification row before editing.
3. Run the fail-closed Rust-only audit and the narrowest affected test first.
4. Run `cargo fmt --all --check`, `cargo clippy --workspace --all-targets -- -D
warnings`, `cargo test --workspace`, `cargo build --workspace`, and `mdbook
build spec`.
5. Commit each verified slice with Jujutsu. This is a standing request; do not
   wait for the user to ask.
