# Terminal Host agent guide

This repository owns the standalone PTY host package `@lapismd/terminal-host`.

## Ownership

- Keep interactive-shell spawn, session lifecycle, the authenticated WebSocket
  server, token handshake, restore snapshots, and `lapis-terminal-host` CLI
  here.
- Consumer hosts (Electron, web, a Node Lapis backend) attach through public
  exports. Do not move vault, workspace layout, or plugin policy here.
- Consumer plugins MUST NOT depend on this package at runtime.

## Canonical specification

Normative package behavior lives under [`spec/src`](./spec/src). Apply this
authority order when sources disagree:

1. Higher-level workspace instructions and this tracked guide.
2. The owning `TH-<AREA>-NNN` requirement and verification row in `spec/src`.
3. Public source, exported types, and the `lapis-terminal-host` CLI contract.
4. Tests as verification evidence.
5. README and generated or mirrored documentation.

Update the owning canonical chapter before or with a protected implementation,
CLI, or package-script change. Run `pnpm spec:first` after changing protected
paths.

## Workflow

1. Inspect `jj --no-pager st` and preserve unrelated changes.
2. Read the relevant specification page and requirement IDs.
3. Update the specification and verification map before implementation.
4. Add focused regression evidence for the changed boundary.
5. Run `pnpm spec:check`, `pnpm check`, `pnpm test`, and `pnpm build`.
6. Commit the verified slice with Jujutsu. This is a standing request; do not
   wait for the user to ask.
