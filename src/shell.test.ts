import { describe, expect, it } from "vitest";
import { inheritSessionEnvironment, resolveInteractiveShellCommand } from "./shell";

describe("resolveInteractiveShellCommand", () => {
  it("uses SHELL -il on posix", () => {
    expect(resolveInteractiveShellCommand({ SHELL: "/bin/zsh" }, "darwin")).toEqual({
      binary: "/bin/zsh",
      args: ["-il"],
    });
  });

  it("uses an absolute shell override on posix", () => {
    expect(
      resolveInteractiveShellCommand({ SHELL: "/bin/zsh" }, "darwin", "/opt/homebrew/bin/fish"),
    ).toEqual({
      binary: "/opt/homebrew/bin/fish",
      args: ["-il"],
    });
  });

  it("rejects a relative shell override", () => {
    expect(() =>
      resolveInteractiveShellCommand({ SHELL: "/bin/zsh" }, "darwin", "zsh"),
    ).toThrow(/absolute path/i);
  });

});

describe("inheritSessionEnvironment", () => {
  it("keeps the parent PATH and applies terminal overrides", () => {
    const env = inheritSessionEnvironment(
      { TERM: "xterm-256color", COLORTERM: "truecolor", TERM_PROGRAM: "lapis-terminal" },
      { PATH: "/opt/homebrew/bin:/usr/bin", HOME: "/Users/ada" },
    );
    expect(env.PATH).toBe("/opt/homebrew/bin:/usr/bin");
    expect(env.HOME).toBe("/Users/ada");
    expect(env.TERM).toBe("xterm-256color");
    expect(env.TERM_PROGRAM).toBe("lapis-terminal");
  });
});
