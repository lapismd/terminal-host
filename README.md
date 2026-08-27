# `@lapismd/terminal-host`

[![Release](https://github.com/lapismd/terminal-host/actions/workflows/release.yml/badge.svg)](https://github.com/lapismd/terminal-host/actions/workflows/release.yml)
[![npm version](https://img.shields.io/npm/v/@lapismd/terminal-host.svg)](https://www.npmjs.com/package/@lapismd/terminal-host)

Standalone Deno PTY host for LapisMD consumers. The package owns
interactive-shell sessions through pinned `@sigma/pty-ffi`,
`lapis-terminal-host serve`, and the authenticated WebSocket protocol.

The Deno desktop calls the library in-process. Web and Storybook attach with a
URL and token after the user starts the Deno CLI. For local browser attach, run
`pnpm serve:local`; the script writes `.env` with
`LAPIS_TERMINAL_HOST_TOKEN` when missing and starts `serve` with that token.
Consumer plugins must not depend on this package at runtime. VT sequence
rendering lives in the consumer plugin, not in this host.

## Install

```sh
pnpm add @lapismd/terminal-host
```

The runtime host is Deno-first because it loads the pinned PTY native adapter
from JSR. The package ships built JavaScript entrypoints so npm-installed
consumers do not execute TypeScript from `node_modules`. Browser consumers
should import only the client bridge.

| Entry point                     | Purpose                                                                       |
| ------------------------------- | ----------------------------------------------------------------------------- |
| `@lapismd/terminal-host`        | Built Deno host exports for session services, protocol helpers, and token IO. |
| `@lapismd/terminal-host/deno`   | Built Deno host entrypoint with native PTY initialization helpers.            |
| `@lapismd/terminal-host/client` | Browser-side runtime bridge for attaching to `lapis-terminal-host serve`.     |
| `lapis-terminal-host`           | Deno CLI launcher for the authenticated terminal host.                        |

## Local development

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm build
```

`pnpm build` type-checks the Deno source entrypoints and writes publishable
JavaScript to `dist/` for the root library, `./deno`, the CLI implementation,
and browser client. The published package must not contain local `link:`,
`file:`, or workspace-only dependency references.

## Release

`@lapismd/terminal-host@0.1.0` is the manual npm bootstrap release. Prepare and
review the tarball with:

```sh
pnpm release:plan --registry https://registry.npmjs.org
pnpm packages:pack
```

The first publish is performed manually from the reviewed tarball. Future
versions use Changesets version PRs and npm trusted publishing from
`.github/workflows/release.yml` after the package exists on npm and the
`npm-production` trusted publisher is configured.

Canonical requirements live in [`spec/src`](./spec/src).
