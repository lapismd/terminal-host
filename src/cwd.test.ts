import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveSessionCwd } from "./cwd";

describe("resolveSessionCwd", () => {
  const workspace = mkdtempSync(join(tmpdir(), "terminal-host-cwd-"));

  it("defaults to the workspace root", () => {
    expect(resolveSessionCwd(workspace)).toBe(workspace);
  });

  it("allows a nested path inside the workspace", () => {
    expect(resolveSessionCwd(workspace, "notes")).toBe(join(workspace, "notes"));
  });

  it("rejects a path that escapes the workspace", () => {
    expect(() => resolveSessionCwd(workspace, "../outside")).toThrow(/workspace/i);
  });
});
