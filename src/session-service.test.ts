import { describe, expect, it } from "vitest";
import type { PtyLike, SpawnPtySessionRequest } from "./pty-session";
import { createTerminalSessionService } from "./session-service";

class FakePty implements PtyLike {
  readonly pid: number | null;
  written: string[] = [];
  resized: Array<{ cols: number; rows: number }> = [];
  stopped = false;

  constructor(readonly request: SpawnPtySessionRequest, pid: number | null = 4242) {
    this.pid = pid;
  }

  write(data: string | Uint8Array): void {
    this.written.push(typeof data === "string" ? data : new TextDecoder().decode(data));
  }

  resize(cols: number, rows: number): void {
    this.resized.push({ cols, rows });
  }

  pause(): void {}
  resume(): void {}

  stop(): void {
    this.stopped = true;
  }

  emitData(text: string): void {
    this.request.onData?.(new TextEncoder().encode(text));
  }

  emitExit(code: number | null): void {
    this.request.onExit?.({ exitCode: code });
  }
}

function createService(workspace = "/tmp/terminal-host-sessions", pid: number | null = 4242) {
  const spawned: FakePty[] = [];
  const requests: SpawnPtySessionRequest[] = [];
  const service = createTerminalSessionService({
    workspace,
    env: { PATH: "/usr/bin", SHELL: "/bin/zsh" },
    platform: "darwin",
    spawn: (request) => {
      const fake = new FakePty(request, pid);
      spawned.push(fake);
      requests.push(request);
      return fake;
    },
  });
  return { service, spawned, requests };
}

describe("createTerminalSessionService", () => {
  it("creates, writes, resizes, lists, and stops a shell session", () => {
    const { service, spawned } = createService();
    const created = service.create({ cols: 80, rows: 24 });
    expect(created).toMatchObject({ status: "running", pid: 4242 });
    expect(service.write(created.sessionId, "ls\n")).toBe(true);
    expect(spawned[0]?.written).toEqual(["ls\n"]);
    expect(service.resize(created.sessionId, 80, 24)).toBe(true);
    expect(spawned[0]?.resized).toEqual([]);
    expect(service.resize(created.sessionId, 100, 30)).toBe(true);
    expect(spawned[0]?.resized).toEqual([{ cols: 100, rows: 30 }]);
    expect(service.stop(created.sessionId)?.status).toBe("exited");
    expect(spawned[0]?.stopped).toBe(true);
  });

  it("fans raw output to listeners and keeps a restore snapshot", () => {
    const { service, spawned } = createService();
    const created = service.create();
    const received: Uint8Array[] = [];
    service.attach(created.sessionId, { onOutput: (chunk) => received.push(chunk) });
    spawned[0]?.emitData("héllo");
    expect(new TextDecoder().decode(received[0])).toBe("héllo");
    expect(service.getRestoreSnapshot(created.sessionId)?.snapshot).toBe("héllo");
  });

  it("keeps remaining viewers attached when one viewer detaches", () => {
    const { service, spawned } = createService();
    const created = service.create();
    const first: string[] = [];
    const second: string[] = [];
    const detachFirst = service.attach(created.sessionId, {
      onOutput: (chunk) => first.push(new TextDecoder().decode(chunk)),
    });
    service.attach(created.sessionId, {
      onOutput: (chunk) => second.push(new TextDecoder().decode(chunk)),
    });
    spawned[0]?.emitData("one");
    detachFirst?.();
    spawned[0]?.emitData("two");
    expect(first).toEqual(["one"]);
    expect(second).toEqual(["one", "two"]);
  });

  it("emits one natural or stopped exit and preserves null pids", () => {
    const { service, spawned } = createService("/tmp/terminal-host-null-pid", null);
    const created = service.create();
    const exits: Array<number | null> = [];
    service.attach(created.sessionId, { onExit: (code) => exits.push(code) });
    spawned[0]?.emitExit(7);
    service.stop(created.sessionId);
    expect(exits).toEqual([7]);
    expect(service.list()[0]?.pid).toBeNull();
  });

  it("rejects cwd escape and relative shell overrides", () => {
    const { service } = createService("/tmp/terminal-host-root");
    expect(() => service.create({ cwd: "../escape" })).toThrow(/workspace/i);
    expect(() => service.create({ shell: "zsh" })).toThrow(/absolute path/i);
  });

  it("inherits PATH and uses a login-interactive shell", () => {
    const { service, requests } = createService();
    service.create();
    expect(requests[0]?.env?.PATH).toBe("/usr/bin");
    expect(requests[0]?.args).toEqual(["-il"]);
  });
});
