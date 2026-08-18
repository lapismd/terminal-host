import { afterEach, describe, expect, it } from "vitest";
import { AUTH_CLOSE_CODE } from "./protocol";
import { createTerminalSessionService } from "./session-service";
import { startTerminalRuntimeServer, type TerminalRuntimeServer } from "./ws-server";

const TOKEN = "test-token-value";

async function openSocket(url: string): Promise<WebSocket> {
  const socket = new WebSocket(url);
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener("open", () => resolve(), { once: true });
    socket.addEventListener("error", () => reject(new Error("socket error")), {
      once: true,
    });
  });
  return socket;
}

function waitForClose(socket: WebSocket): Promise<{ code: number; reason: string }> {
  return new Promise((resolve) => {
    socket.addEventListener(
      "close",
      (event) => resolve({ code: event.code, reason: event.reason }),
      { once: true },
    );
  });
}

describe("terminal-runtime websocket handshake", () => {
  let server: TerminalRuntimeServer | undefined;
  let sessions = createTerminalSessionService({
    workspace: "/tmp/terminal-host-test",
    spawn: () => {
      throw new Error("PTY should not spawn before handshake");
    },
  });

  afterEach(async () => {
    await server?.close();
    sessions.close();
    server = undefined;
  });

  async function listen() {
    sessions = createTerminalSessionService({
      workspace: "/tmp/terminal-host-test",
      spawn: () => {
        throw new Error("PTY should not spawn before handshake");
      },
    });
    server = await startTerminalRuntimeServer({
      port: 0,
      bind: "127.0.0.1",
      token: TOKEN,
      workspace: "/tmp/terminal-host-test",
      sessions,
    });
    return `ws://127.0.0.1:${server.port}`;
  }

  it("closes a socket whose first frame is not hello", async () => {
    const url = await listen();
    const socket = await openSocket(url);
    const closed = waitForClose(socket);
    socket.send(
      JSON.stringify({
        id: "1",
        command: "terminal_session_create",
        payload: {},
      }),
    );
    const result = await closed;
    expect(result.code).toBe(AUTH_CLOSE_CODE);
  });

  it("closes a socket that sends a bad token", async () => {
    const url = await listen();
    const socket = await openSocket(url);
    const closed = waitForClose(socket);
    socket.send(JSON.stringify({ id: "1", type: "hello", token: "nope" }));
    const result = await closed;
    expect(result.code).toBe(AUTH_CLOSE_CODE);
  });

  it("accepts a hello with the configured token", async () => {
    const url = await listen();
    const socket = await openSocket(url);
    const reply = new Promise<Record<string, unknown>>((resolve) => {
      socket.addEventListener(
        "message",
        (event) => resolve(JSON.parse(String(event.data))),
        { once: true },
      );
    });
    socket.send(JSON.stringify({ id: "hello-1", type: "hello", token: TOKEN }));
    await expect(reply).resolves.toMatchObject({
      id: "hello-1",
      type: "hello.ok",
      protocol: 1,
    });
    socket.close();
  });
});
