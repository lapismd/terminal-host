# `@lapismd/terminal-host`

Standalone PTY host for LapisMD consumers. The package owns interactive-shell
sessions, `lapis-terminal-host serve`, and the authenticated WebSocket protocol.

Electron calls the library in-process. Web and Storybook attach with a URL and
token after the user starts the CLI. For local browser attach, run
`pnpm serve:local`. Consumer plugins must not depend on this package at runtime.
VT sequence rendering lives in the consumer plugin, not in this host.

Canonical requirements live in [`spec/src`](./spec/src).
