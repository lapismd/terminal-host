# Architecture

The package lives at the repository root and publishes built Deno entrypoints
for the root library and `./deno`, a built browser bundle for `./client`, and
the Deno-powered `lapis-terminal-host` CLI. The development-only `serve:local`
package script seeds an ignored `.env` `LAPIS_TERMINAL_HOST_TOKEN` when
missing, then starts the existing `serve` command with that token. It is a
non-authoritative execution transport: vault policy and workspace layout remain
in the consuming application. Public exports include the session service plus
helpers that inherit the host environment and resolve a login-interactive shell.

Specification validation is root-only development tooling. The root manifest
MUST consume the published `@lapismd/spec-validator` package from npm.
Checkout-specific dependency resolution for the validator is not part of the
package architecture or consumer contract.

Release automation is package-owned and repository-local. The first
`@lapismd/terminal-host` npm version is a manual bootstrap publish from a
verified tarball. Future versions use Changesets version pull requests, an
immutable tarball artifact, the `npm-production` trusted publishing environment,
npm OIDC provenance, and a per-package GitHub tag/release named
`terminal-host@<version>`. The release pack gate MUST rebuild the publishable
`dist` entrypoints immediately before creating the tarball so fresh CI
checkouts and workstation runs validate the same artifact shape.

## Requirements

| ID         | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TH-PKG-001 | Public `@lapismd/terminal-host` MUST live at the repository root, publish built Deno entrypoints for the root library and `./deno`, publish a built browser bundle for `./client`, expose `build`, `check`, `test`, and an executable Deno-powered `lapis-terminal-host` CLI. It MUST own PTY spawn and standalone transport. Consumer plugins MUST NOT depend on it at runtime. Shared specification validation MUST remain a root-only npm development dependency. |
| TH-PKG-002 | The `serve:local` package script MUST remain development-only. It MUST seed an ignored `.env` `LAPIS_TERMINAL_HOST_TOKEN` when that file or key is missing, then start `lapis-terminal-host serve` with that token.                                                                                                                                                                                                                                                  |
| TH-PKG-003 | The host MUST remain renderer-agnostic. VT sequence rendering MUST live in the consumer plugin, not in this package.                                                                                                                                                                                                                                                                                                                                                 |
| TH-PKG-004 | The host MUST pin `@sigma/pty-ffi` and a target-specific native-library manifest. Downloaded libraries MUST match the recorded SHA-256 before loading. Packaged consumers MUST be able to supply a verified explicit library path.                                                                                                                                                                                                                                   |
| TH-PKG-005 | Release automation MUST use Changesets for future version pull requests, rebuild the publishable `dist` entrypoints, build and validate the selected npm tarball before publication, use npm trusted publishing through the `npm-production` environment after trusted-publisher configuration, and create `terminal-host@<version>` GitHub tags/releases from the verified release manifest.                                         |
