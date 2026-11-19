# Architecture

The repository preserves one private Rust workspace and its
`lapis-terminal-service` crate in place. Native hosts consume it through an
exact Git revision. The crate owns PTY process and replay mechanics; callers
own authentication, vault admission, transport, workspace policy and terminal
presentation.

Historical npm tarballs, integrity data, the changelog and Git history remain
available. Current source does not build, publish, download or launch the
retired npm, Deno, CLI, WebSocket or browser-client surfaces.

## Requirements

| ID          | Requirement                                                                                                                                                                                                                  |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TH-ARCH-001 | The repository MUST retain `Cargo.toml`, `Cargo.lock` and `crates/lapis-terminal-service/**` in place. The crate MUST remain private with `publish = false`, and consumers MUST select it through exact Git revisions.       |
| TH-ARCH-002 | The Rust service MUST own only PTY process, session and replay mechanics. Authentication, vault admission, transport, workspace policy and terminal presentation MUST remain host or plugin responsibilities.                |
| TH-ARCH-003 | Current source and CI MUST NOT restore npm packaging, Deno runtime code, a standalone CLI, WebSocket transport, native-library downloads or release publication. Historical artifacts and Git history MUST remain preserved. |
| TH-ARCH-004 | Pull requests and main pushes MUST run the Rust-only source audit, formatting, Clippy with warnings denied, workspace tests, workspace build and mdBook build.                                                               |
