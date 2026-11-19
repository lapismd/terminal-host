# Terminal Host Rust PTY service

This repository preserves `lapis-terminal-service`, the private Deno-free Rust
PTY engine used by native Lapis hosts. It owns process spawn, raw terminal I/O,
bounded replay, session limits and process-group shutdown.

The crate remains at `crates/lapis-terminal-service`, is not published to
crates.io, and is consumed through exact Git revisions. Authentication, vault
admission, transport, workspace policy and terminal presentation stay with the
owning host or plugin.

The former `@lapismd/terminal-host` npm package, Deno runtime, CLI, WebSocket
server and browser bridge are retired. Historical npm tarballs, integrity data,
Git history and [`CHANGELOG.md`](./CHANGELOG.md) remain preserved; do not
unpublish them.

## Development

```sh
./ci/check-rust-only.sh
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
cargo build --workspace
mdbook build spec
```

Canonical current requirements live in [`spec/src`](./spec/src).
