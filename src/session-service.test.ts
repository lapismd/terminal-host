import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import type { PtyLike, SpawnPtySessionRequest } from "./pty-session";
import { createTerminalSessionService } from "./session-service";

class FakePty extends EventEmitter implements PtyLike {
  readonly pid = 4242;
  written: string[] = [];
  resized: Array<{ cols: number; rows: number }> = [];
  stopped = false;

  write(data: string | Buffer): void {
    this.written.push(typeof data === "string" ? data : data.toString("utf8"));
  }

  resize(cols: number, rows: number): void {
    this.resized.push({ cols, rows });
  }

  pause(): void {}
  resume(): void {}

  stop(): void {
    this.stopped = true;
    this.emit("exit", { exitCode: 0 });
  }

  emitData(text: string): void {
    this.emit("data", Buffer.from(text, "utf8"));
  }
}

function createService(workspace = "/tmp/terminal-host-sessions") {
  const spawned: FakePty[] = [];
  const requests: SpawnPtySessionRequest[] = [];
  const service = createTerminalSessionService({
    workspace,
    spawn: (request: SpawnPtySessionRequest) => {
      const fake = new FakePty();
      spawned.push(fake);
      requests.push(request);
      fake.on("data", (chunk: Buffer) => request.onData?.(chunk));
      fake.on("exit", (event: { exitCode: number }) => request.onExit?.(event));
      return fake;
    },
  });
  return { service, spawned, requests };
}

describe("createTerminalSessionService", () => {
  it("creates, writes, resizes, lists, and stops a shell session", () => {
    const { service, spawned } = createService();
    const created = service.create({ cols: 80, rows: 24 });
    expect(created.status).toBe("running");
    expect(created.pid).toBe(4242);
    expect(service.list()).toHaveLength(1);
    expect(service.write(created.sessionId, "ls\n")).toBe(true);
    expect(spawned[0]?.written).toEqual(["ls\n"]);
    expect(service.resize(created.sessionId, 80, 24)).toBe(true);
    expect(spawned[0]?.resized).toEqual([]);
    expect(service.resize(created.sessionId, 100, 30)).toBe(true);
    expect(spawned[0]?.resized).toEqual([{ cols: 100, rows: 30 }]);
    const stopped = service.stop(created.sessionId);
    expect(stopped?.status).toBe("exited");
    expect(spawned[0]?.stopped).toBe(true);
    service.close();
  });

  it("fans output to two listeners and keeps a restore snapshot", () => {
    const { service, spawned } = createService();
    const created = service.create();
    const first: string[] = [];
    const second: string[] = [];
    const detachFirst = service.attach(created.sessionId, {
      onOutput: (chunk) => first.push(chunk.toString("utf8")),
    });
    const detachSecond = service.attach(created.sessionId, {
      onOutput: (chunk) => second.push(chunk.toString("utf8")),
    });
    spawned[0]?.emitData("hello");
    expect(first).toEqual(["hello"]);
    expect(second).toEqual(["hello"]);
    expect(service.getRestoreSnapshot(created.sessionId)?.snapshot).toBe("hello");
    detachFirst?.();
    detachSecond?.();
    service.close();
  });

  it("rejects a cwd that escapes the workspace", () => {
    const { service } = createService("/tmp/terminal-host-root");
    expect(() => service.create({ cwd: "../escape" })).toThrow(/workspace/i);
    service.close();
  });

  it("inherits PATH and uses a login-interactive shell", () => {
    const { service, requests } = createService();
    service.create({ cols: 80, rows: 24 });
    expect(requests[0]?.env?.PATH).toBe(process.env.PATH);
    if (process.platform !== "win32") {
      expect(requests[0]?.args).toEqual(["-il"]);
    }
    service.close();
  });

  it("rejects a relative shell override", () => {
    const { service } = createService();
    expect(() => service.create({ shell: "zsh" })).toThrow(/absolute path/i);
    service.close();
  });

  it("accepts an injected PTY adapter without a public process id", () => {
    const service = createTerminalSessionService({
      workspace: "/tmp/terminal-host-null-pid",
      spawn: () => ({
        pid: null,
        write() {},
        resize() {},
        pause() {},
        resume() {},
        stop() {},
      }),
    });

    expect(service.create().pid).toBeNull();
    service.close();
  });
});
