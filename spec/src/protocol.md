# Protocol

Authenticated remote clients attach with a URL and token. Electron embeds the
session service in-process and MUST NOT require the renderer to hold the token.

## Requirements

| ID            | Requirement |
| ------------- | ----------- |
| TH-PROTO-001 | `lapis-terminal-host serve` MUST accept `--port`, `--bind`, `--workspace`, `--token`, and repeatable `--origin`. Default bind MUST be `127.0.0.1` and default port MUST be `7346`. A missing token MUST be generated and printed once. |
| TH-PROTO-002 | Non-loopback `--bind` MUST require at least one `--origin` allowlist entry. Loopback binds MAY omit origins. |
| TH-PROTO-003 | The first command-socket frame MUST be `{ type: "hello", token }`. A matching token MUST reply `hello.ok` with protocol `1`. A missing, late, or wrong token MUST close with code `4401`. |
| TH-PROTO-004 | After handshake, the command socket MUST accept `terminal_session_create`, `terminal_session_list`, `terminal_session_write`, `terminal_session_resize`, and `terminal_session_stop`. Create MAY include optional `cwd` and absolute `shell`. It MUST NOT accept AI or ACP commands. |
| TH-PROTO-005 | Remote I/O MUST use `/terminal/io` for binary PTY bytes and `/terminal/control` for JSON resize, stop, output_ack, restore, and exit. Both MUST require the same token and isolate viewers by `sessionId` plus `clientId`. |
| TH-PROTO-006 | The `./client` export MAY register a web bridge from a URL and token. Consumer plugins MUST NOT import this package. |
| TH-PROTO-007 | The web client MUST attach `/terminal/io` and `/terminal/control` before `terminal_session_write` or `terminal_session_resize` when those planes are not already open for the session. It MUST reject those commands when a session plane closes or the host reports `ok: false`. It MUST emit `onTerminalExit` when the control plane sends `exit` or write/resize reports `ok: false`. |
