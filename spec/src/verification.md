# Verification

| ID | Status | Evidence |
| -- | ------ | -------- |
| TH-PKG-001 | Implemented | package.json scripts, bin entry, and plugin-boundary README/AGENTS.md |
| TH-PKG-002 | Implemented | scripts/serve-local.ts seeds ignored `.env` then runs the Deno serve command |
| TH-PKG-003 | Implemented | package exports and README keep PTY/transport only |
| TH-PKG-004 | Implemented | native-artifacts.json, checksum resolver tests, and explicit Deno PTY initialization |
| TH-PROTO-001 | Implemented | parse-cli default, token, and help-path unit tests plus Deno serve wiring |
| TH-PROTO-002 | Implemented | parse-cli tests require `--origin` for non-loopback bind |
| TH-PROTO-003 | Implemented | Deno runtime test accepts a valid token and rejects an invalid token |
| TH-PROTO-004 | Implemented | Deno runtime test exercises all five session commands through the command socket |
| TH-PROTO-005 | Implemented | Deno runtime tests attach authenticated `/terminal/io` and `/terminal/control` planes |
| TH-PROTO-006 | Implemented | client.ts exports attach helpers; package docs forbid plugin runtime imports |
| TH-PROTO-007 | Implemented | client.ts attaches session planes before write/resize and reports unavailable sessions and exit events |
| TH-PROTO-008 | Implemented | Deno runtime test observes spawn output exactly once through control restore before live I/O |
| TH-SESS-001 | Implemented | Deno PTY integration uses `$SHELL -il`, inherits PATH, and rejects a relative shell override |
| TH-SESS-002 | Implemented | cwd tests reject paths that escape the workspace root |
| TH-SESS-003 | Implemented | session-service tests cover raw bytes, create, write, resize, stop, list, attach, snapshot, and exit-once behavior |
| TH-SESS-004 | Implemented | session-service test fans output to two listeners and detaches one independently |
| TH-SESS-005 | Implemented | createDenoTerminalSessionService is shared by the CLI and embedded desktop export |
| TH-SESS-006 | Implemented | session-service resize is a no-op when cols and rows are unchanged |
| TH-SESS-007 | Implemented | session-service tests preserve a null pid from an injected PTY adapter |
| TH-GOV-001 | Implemented | spec/book.toml and spec:build |
| TH-GOV-002 | Implemented | spec-validator mapped spec-first rules |
| TH-GOV-003 | Implemented | one verification row per requirement ID |
