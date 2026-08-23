# Sessions

Interactive shells are the only v1 session kind. Agent-task adapters remain
outside this package.

## Requirements

| ID           | Requirement |
| ------------ | ----------- |
| TH-SESS-001 | A new session MUST spawn a login-interactive host shell (`$SHELL -il`) through Deno and pinned `@sigma/pty-ffi`. It MUST inherit the host process environment, set `TERM=xterm-256color`, and accept an optional absolute `shell` on create. |
| TH-SESS-002 | Session cwd MUST resolve inside the host workspace root. A path that escapes that root MUST be rejected and MUST NOT spawn a process. |
| TH-SESS-003 | The session service MUST support create, write, resize, stop, list, attach, and a bounded restore snapshot of recent output. Output MUST remain raw `Uint8Array` bytes. Closing a session MUST close the PTY and emit at most one exit event. |
| TH-SESS-004 | Multiple viewers of one session MUST receive the same output. Detaching one viewer MUST NOT interrupt another viewer or the shared PTY lifecycle. |
| TH-SESS-005 | Deno desktop and the standalone Deno server MUST embed the same injected session service without duplicating PTY lifecycle policy. Workspace root for desktop MUST be the vault filesystem path supplied by the host. |
| TH-SESS-006 | `resize` MUST return success and MUST NOT call the PTY when cols and rows are already the session size. |
| TH-SESS-007 | The public injected PTY boundary MUST accept a `null` process id when an adapter does not expose its child pid. Session summaries MUST preserve that value without weakening lifecycle ownership. |
