# Specification

`@lapismd/terminal-host` is the standalone LapisMD PTY host. It owns
interactive-shell sessions, `lapis-terminal-host serve`, the authenticated
WebSocket protocol, and bounded restore snapshots.

Deno desktop calls the library in-process. Web and Storybook attach only with
a configured URL and token after the user starts the Deno CLI. Consumer
plugins MUST NOT depend on this package at runtime.

Canonical requirements live in the following chapters. Verification evidence
is indexed in [Verification](verification.md).
