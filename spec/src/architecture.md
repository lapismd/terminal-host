# Architecture

The package lives at the repository root and publishes a library, a `./client`
bridge, and the `lapis-terminal-host` CLI. The development-only `serve:local`
package script seeds an ignored `.env` `LAPIS_TERMINAL_HOST_TOKEN` when
missing, then starts the existing `serve` command with that token. It is a
non-authoritative execution transport: vault policy and workspace layout remain
in the consuming application. Public exports include the session service plus
helpers that inherit the host environment and resolve a login-interactive shell.

## Requirements

| ID         | Requirement |
| ---------- | ----------- |
| TH-PKG-001 | Private `@lapismd/terminal-host` MUST live at the repository root, expose `build`, `check`, `test`, and an executable Deno-powered `lapis-terminal-host` CLI. It MUST own PTY spawn and standalone transport. Consumer plugins MUST NOT depend on it at runtime. |
| TH-PKG-002 | The `serve:local` package script MUST remain development-only. It MUST seed an ignored `.env` `LAPIS_TERMINAL_HOST_TOKEN` when that file or key is missing, then start `lapis-terminal-host serve` with that token. |
| TH-PKG-003 | The host MUST remain renderer-agnostic. VT sequence rendering MUST live in the consumer plugin, not in this package. |
| TH-PKG-004 | The host MUST pin `@sigma/pty-ffi` and a target-specific native-library manifest. Downloaded libraries MUST match the recorded SHA-256 before loading. Packaged consumers MUST be able to supply a verified explicit library path. |
