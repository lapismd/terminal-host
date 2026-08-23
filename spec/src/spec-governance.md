# Specification governance

Canonical requirements live under `spec/src`. Protected implementation changes
MUST update the mapped chapter in the same Jujutsu change.

## Requirements

| ID         | Requirement |
| ---------- | ----------- |
| TH-GOV-001 | `spec/src` MUST remain the canonical standalone specification and MUST build with mdBook. |
| TH-GOV-002 | Protected package, source, CLI, validation, and agent-guidance changes MUST update an owning canonical chapter in the same Jujutsu change. |
| TH-GOV-003 | Every normative requirement ID MUST be unique and MUST have exactly one verification row with concrete evidence. |

## Change map

| Protected area | Required chapter |
| -------------- | ---------------- |
| `src/serve.ts`, `src/parse-cli.ts`, `src/cli.ts`, `src/token.ts` | `protocol.md` |
| `src/ws-server.ts`, `src/protocol.ts`, `src/client.ts` | `protocol.md` |
| `src/pty-session.ts`, `src/session-service.ts`, `src/shell.ts`, `src/cwd.ts` | `sessions.md` |
| `src/deno.ts`, `src/deno-pty.ts`, `src/native-library.ts`, `native-artifacts.json` | `sessions.md`, `architecture.md` |
| `package.json`, `src/index.ts`, `bin/`, `scripts/` | `architecture.md` |
| `spec-validator.config.mjs`, `AGENTS.md`, `pnpm-workspace.yaml`, `spec/book.toml` | `spec-governance.md` |

Tracked `AGENTS.md` is standing workflow: after a verified slice, commit with
Jujutsu. Do not wait for a later user request.
