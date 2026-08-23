# `@lapismd/terminal-host`

Standalone Deno PTY host for LapisMD consumers. The package owns
interactive-shell sessions through pinned `@sigma/pty-ffi`,
`lapis-terminal-host serve`, and the authenticated WebSocket protocol.

The Deno desktop calls the library in-process. Web and Storybook attach with a
URL and token after the user starts the Deno CLI. For local browser attach, run
`pnpm serve:local`. Consumer plugins must not depend on this package at runtime.
VT sequence rendering lives in the consumer plugin, not in this host.

Canonical requirements live in [`spec/src`](./spec/src).
