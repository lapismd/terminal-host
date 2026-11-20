# Sessions

`lapis-terminal-service` owns bounded local PTY sessions for an admitted host
root. The public Rust API carries raw bytes and caller-owned cursors.

## Requirements

| ID          | Requirement                                                                                                                                                                                                                                                        |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| TH-SESS-008 | The service MUST require absolute root and shell paths, bind the canonical root device and inode, and reject cwd traversal, absolute cwd, symlink components, non-directories or a replaced root. Authentication and vault admission remain host responsibilities. |
| TH-SESS-009 | Session input and output MUST remain raw bytes. Each reader MUST supply an independent cursor so reading from one consumer does not consume another consumer's replay.                                                                                             |
| TH-SESS-010 | Replay MUST retain at most 256 KiB per session and return at most 32 KiB per read. A cursor behind the retained base MUST receive `truncated: true` and resume from the retained base; a cursor beyond current output MUST fail.                                   |
| TH-SESS-011 | The service MUST allow at most eight concurrent sessions, reject writes larger than 64 KiB, and accept terminal dimensions only from 1 through 500 columns and rows.                                                                                               |
| TH-SESS-012 | Reads MUST report the next cursor, raw bytes, truncation, running state and exit code. A session MUST report completion only after both the output reader finishes and the child exit code is known.                                                               |
| TH-SESS-013 | Stop, close and drop MUST terminate the owned PTY process group, escalate from TERM to KILL when required, reap the child, drain output and fence new sessions after service close.                                                                                |
| TH-SESS-014 | The default constructor MUST start the admitted absolute shell as a login-interactive process. Hosts MAY supply an immutable absolute program, argument vector and environment through `ShellCommand`/`with_command`; clients cannot select them. Every launch MUST use the resolved cwd and set `TERM=xterm-256color`, `COLORTERM=truecolor` and `TERM_PROGRAM=lapis-terminal`.                                                                        |
| TH-SESS-015 | Resize MUST preserve the current size and avoid a PTY resize call when columns and rows are unchanged.                                                                                                                                                             |

Host options carry argv/environment as operating-system strings without shell interpolation. The engine owns no application startup script, prompt, listing alias or shell-selection policy. Caller options cannot override the three required terminal identity variables.

Host-shell option qualification: `cargo test --workspace --test shell_command` initially failed to compile with three missing-public-API diagnostics. After adding the contract, all three new real-PTY cases pass. The complete workspace passes eight PTY cases with zero failures; Rust-only audit, formatting, strict Clippy, build and mdBook pass. Server owns its separate startup/profile integration and acceptance; this repository contains no application prompt policy.
