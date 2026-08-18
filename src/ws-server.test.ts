import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it } from "vitest";
import type { PtyLike, SpawnPtySessionRequest } from "./pty-session";
import { createTerminalSessionService } from "./session-service";
import { startTerminalRuntimeServer, type TerminalRuntimeServer } from "./ws-server";

const TOKEN = "ws-test-token";

class FakePty extends EventEmitter implements PtyLike {
  readonly pid = 7;
  write(): void {}
  resize(): void {}
  pause(): void {}
  resume(): void {}
  stop(): void {}
}

describe("terminal-runtime websocket sessions", () => {
  let server: TerminalRuntimeServer | undefined;

  afterEach(async () => {
    await server?.close();
    server = undefined;
  });

  it("creates a session over the command socket after handshake", async () => {
    const sessions = createTerminalSessionService({
      workspace: "/tmp/terminal-host-ws",
      spawn: (_request: SpawnPtySessionRequest) => new FakePty(),
    });
    server = await startTerminalRuntimeServer({
      port: 0,
      bind: "127.0.0.1",
      token: TOKEN,
      workspace: "/tmp/terminal-host-ws",
      sessions,
    });
    const socket = new WebSocket(`ws://127.0.0.1:${server.port}`);
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve(), { once: true });
      socket.addEventListener("error", () => reject(new Error("socket error")), {
        once: true,
      });
    });
    const messages: Array<Record<string, unknown>> = [];
    socket.addEventListener("message", (event) => {
      messages.push(JSON.parse(String(event.data)));
    });
    socket.send(JSON.stringify({ id: "hello-1", type: "hello", token: TOKEN }));
    await waitFor(() => messages.some((message) => message.type === "hello.ok"));
    socket.send(
      JSON.stringify({
        id: "create-1",
        command: "terminal_session_create",
        payload: { cols: 80, rows: 24 },
      }),
    );
    await waitFor(() => messages.some((message) => message.id === "create-1"));
    const created = messages.find((message) => message.id === "create-1");
    expect(created).toMatchObject({
      result: { status: "running", cols: 80, rows: 24 },
    });
    socket.close();
    sessions.close();
  });
});

async function waitFor(predicate: () => boolean): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > 2000) throw new Error("timed out");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
