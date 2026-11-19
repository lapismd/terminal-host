# Verification

| ID          | Status      | Evidence                                                                                                           |
| ----------- | ----------- | ------------------------------------------------------------------------------------------------------------------ |
| TH-ARCH-001 | Implemented | root Cargo workspace and private `crates/lapis-terminal-service/Cargo.toml`; Server consumes an exact Git revision |
| TH-ARCH-002 | Implemented | crate API and module documentation keep authentication and vault admission host-owned                              |
| TH-ARCH-003 | Implemented | `ci/check-rust-only.sh` rejects retired source and tooling while CHANGELOG and Git history remain                  |
| TH-ARCH-004 | Implemented | `.github/workflows/ci.yml` runs the audit, Cargo fmt, strict Clippy, tests, build and mdBook                       |
| TH-SESS-008 | Implemented | real PTY tests reject cwd traversal, absolute paths, symlink escapes and a replaced root                           |
| TH-SESS-009 | Implemented | replay test proves raw bytes and independent caller cursors                                                        |
| TH-SESS-010 | Implemented | replay test exceeds the 256 KiB bound, observes truncation and limits each read to 32 KiB                          |
| TH-SESS-011 | Implemented | Rust source bounds sessions, writes and dimensions; real PTY tests cover session and dimension limits              |
| TH-SESS-012 | Implemented | real PTY collection test observes raw output, running completion and exit code 7                                   |
| TH-SESS-013 | Implemented | close regression fences new sessions and completes process-group shutdown within five seconds                      |
| TH-SESS-014 | Implemented | Rust session spawn builds the admitted shell with `-il` and the required terminal environment                      |
| TH-SESS-015 | Implemented | Rust source no-ops unchanged resize; real PTY test repeats one size successfully                                   |
| TH-GOV-001  | Implemented | `spec/book.toml`, `spec/src/SUMMARY.md` and CI mdBook build                                                        |
| TH-GOV-002  | Implemented | tracked change map names Rust/Cargo and repository policy owners                                                   |
| TH-GOV-003  | Implemented | this table contains exactly one row for every current requirement ID                                               |
| TH-GOV-004  | Implemented | local and CI-called `ci/check-rust-only.sh` tracked-file audit                                                     |
