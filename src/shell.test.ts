import { describe, expect, it } from "vitest";
import { resolveInteractiveShellCommand } from "./shell";

describe("resolveInteractiveShellCommand", () => {
  it("uses SHELL -i on posix", () => {
    expect(resolveInteractiveShellCommand({ SHELL: "/bin/zsh" }, "darwin")).toEqual({
      binary: "/bin/zsh",
      args: ["-i"],
    });
  });

  it("uses COMSPEC on windows", () => {
    expect(
      resolveInteractiveShellCommand({ COMSPEC: "C:\\Windows\\System32\\cmd.exe" }, "win32"),
    ).toEqual({
      binary: "C:\\Windows\\System32\\cmd.exe",
      args: [],
    });
  });
});
