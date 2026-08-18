# Verification

| ID | Status | Evidence |
| -- | ------ | -------- |
| TH-PKG-001 | Implemented | package.json scripts, bin entry, and plugin-boundary README/AGENTS.md |
| TH-PKG-002 | Implemented | scripts/serve-local.mjs seeds ignored `.env` then runs serve |
| TH-PKG-003 | Implemented | package exports and README keep PTY/transport only |
| TH-PROTO-001 | Implemented | parse-cli defaults, serve token generation, and CLI help tests |
| TH-PROTO-002 | Implemented | parse-cli tests require `--origin` for non-loopback bind |
| TH-PROTO-003 | Implemented | handshake tests accept a valid token and close 4401 otherwise |
| TH-PROTO-004 | Implemented | protocol constants and command-socket tests cover the five session commands |
| TH-PROTO-005 | Implemented | ws-server attaches `/terminal/io` and `/terminal/control` with session and client ids |
| TH-PROTO-006 | Implemented | client.ts exports attach helpers; package docs forbid plugin runtime imports |
| TH-PROTO-007 | Implemented | client test reattaches io after dispose; write/resize reject ok:false; PTY exit and ok:false emit onTerminalExit |
| TH-SESS-001 | Implemented | shell.ts uses `$SHELL -il`, inherits PATH, and rejects a relative shell override |
| TH-SESS-002 | Implemented | cwd tests reject paths that escape the workspace root |
| TH-SESS-003 | Implemented | session-service tests cover create, write, resize, stop, list, attach, and snapshot |
| TH-SESS-004 | Implemented | session-service attach tests fan output to two listeners |
| TH-SESS-005 | Implemented | createTerminalSessionService is the public embed API used by tests without the CLI |
| TH-GOV-001 | Implemented | spec/book.toml and spec:build |
| TH-GOV-002 | Implemented | spec-validator mapped spec-first rules |
| TH-GOV-003 | Implemented | one verification row per requirement ID |
