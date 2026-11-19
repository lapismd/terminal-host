# Specification governance

Canonical current requirements live under `spec/src`. Protected Rust, Cargo,
CI, audit and repository-guidance changes must update the owning chapter in the
same Jujutsu change.

## Requirements

| ID         | Requirement                                                                                                                                                                          |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| TH-GOV-001 | `spec/src` MUST remain the canonical current specification and MUST build with mdBook.                                                                                               |
| TH-GOV-002 | Protected Rust and Cargo changes MUST update `sessions.md`; CI, audit, repository-boundary, README, license or agent-guidance changes MUST update `architecture.md` or this chapter. |
| TH-GOV-003 | Every normative requirement ID MUST be unique and MUST have exactly one verification row with concrete evidence.                                                                     |
| TH-GOV-004 | The tracked Rust-only audit MUST fail when required Rust authority is missing or when retired npm, Deno, JavaScript, TypeScript, CLI, WebSocket, download or release paths return.   |

## Change map

| Protected area                                                           | Required chapter                        |
| ------------------------------------------------------------------------ | --------------------------------------- |
| `Cargo.toml`, `Cargo.lock`, `crates/lapis-terminal-service/**`           | `sessions.md`                           |
| `ci/check-rust-only.sh`, `.github/workflows/**`, `.gitignore`            | `architecture.md`, `spec-governance.md` |
| `AGENTS.md`, `README.md`, `CHANGELOG.md`, `LICENSE.md`, `spec/book.toml` | `architecture.md`, `spec-governance.md` |
