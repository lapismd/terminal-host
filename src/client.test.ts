import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it } from "vitest";
import { createTerminalRuntimeBridge } from "./client";
import type { PtyLike, SpawnPtySessionRequest } from "./pty-session";
import { createTerminalSessionService } from "./session-service";
import {
  startTerminalRuntimeServer,
  type TerminalRuntimeServer,
} from "./ws-server";

const TOKEN = "client-test-token";

class EchoPty extends EventEmitter implements PtyLike {
  readonly pid = 11;
  constructor(private readonly onData: (chunk: Buffer) => void) {
    super();
  }
  write(data: string | Buffer): void {
    this.onData(Buffer.from(`out:${typeof data === "string" ? data : data.toString("utf8")}`));
  }
  resize(): void {}
  pause(): void {}
  resume(): void {}
  stop(): void {}
}

describe("terminal-runtime web client", () => {
  let server: TerminalRuntimeServer | undefined;
  let sessions = createTerminalSessionService({
    workspace: "/tmp/terminal-host-client",
    spawn: (request: SpawnPtySessionRequest) => new EchoPty(request.onData),
  });

  afterEach(async () => {
    await server?.close();
    sessions.close();
    server = undefined;
    sessions = createTerminalSessionService({
      workspace: "/tmp/terminal-host-client",
      spawn: (request: SpawnPtySessionRequest) => new EchoPty(request.onData),
    });
  });

  it("attaches io and control planes after create and forwards output", async () => {
    server = await startTerminalRuntimeServer({
      port: 0,
      bind: "127.0.0.1",
      token: TOKEN,
      workspace: "/tmp/terminal-host-client",
      sessions,
    });
    const bridge = createTerminalRuntimeBridge({
      url: `ws://127.0.0.1:${server.port}`,
      token: TOKEN,
    });
    const chunks: string[] = [];
    bridge.onTerminalOutput?.((event) => {
      chunks.push(Buffer.from(event.data, "base64").toString("utf8"));
    });
    const created = await bridge.invoke<{ sessionId: string }>(
      "terminal_session_create",
      { cols: 80, rows: 24 },
    );
    await bridge.invoke("terminal_session_write", {
      sessionId: created.sessionId,
      data: Buffer.from("pwd\n").toString("base64"),
    });
    await waitFor(() => chunks.some((chunk) => chunk.includes("out:pwd")));
    expect(chunks.join("")).toContain("out:pwd");
    bridge.dispose();
  });

  it("reattaches session planes on write after the previous client disconnects", async () => {
    server = await startTerminalRuntimeServer({
      port: 0,
      bind: "127.0.0.1",
      token: TOKEN,
      workspace: "/tmp/terminal-host-client",
      sessions,
    });
    const first = createTerminalRuntimeBridge({
      url: `ws://127.0.0.1:${server.port}`,
      token: TOKEN,
    });
    const created = await first.invoke<{ sessionId: string }>(
      "terminal_session_create",
      { cols: 80, rows: 24 },
    );
    first.dispose();
    const second = createTerminalRuntimeBridge({
      url: `ws://127.0.0.1:${server.port}`,
      token: TOKEN,
    });
    const chunks: string[] = [];
    second.onTerminalOutput?.((event) => {
      chunks.push(Buffer.from(event.data, "base64").toString("utf8"));
    });
    await second.invoke("terminal_session_write", {
      sessionId: created.sessionId,
      data: Buffer.from("ls\n").toString("base64"),
    });
    await waitFor(() => chunks.some((chunk) => chunk.includes("out:ls")));
    expect(chunks.join("")).toContain("out:ls");
    second.dispose();
  });

  it("rejects resize of an unknown session", async () => {
    server = await startTerminalRuntimeServer({
      port: 0,
      bind: "127.0.0.1",
      token: TOKEN,
      workspace: "/tmp/terminal-host-client",
      sessions,
    });
    const bridge = createTerminalRuntimeBridge({
      url: `ws://127.0.0.1:${server.port}`,
      token: TOKEN,
    });
    await expect(
      bridge.invoke("terminal_session_resize", {
        sessionId: "missing-session",
        cols: 80,
        rows: 24,
      }),
    ).rejects.toThrow(/unavailable|closed|session/i);
    bridge.dispose();
  });
});

async function waitFor(predicate: () => boolean): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > 2000) throw new Error("timed out");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
