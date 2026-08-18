import { createServer, type IncomingMessage, type Server } from "node:http";
import { WebSocketServer, type RawData, type WebSocket } from "ws";
import {
  AUTH_CLOSE_CODE,
  HELLO_TIMEOUT_MS,
  TERMINAL_RUNTIME_PROTOCOL,
  isCommandRequest,
  isHelloRequest,
  isTerminalRuntimeCommand,
  type TerminalControlClientMessage,
  type TerminalControlServerMessage,
} from "./protocol";
import type { TerminalSessionService } from "./session-service";
import { tokensEqual } from "./token";

export type TerminalRuntimeServerOptions = {
  port: number;
  bind: string;
  token: string;
  workspace: string;
  origins?: string[];
  sessions: TerminalSessionService;
  handshakeTimeoutMs?: number;
};

export type TerminalRuntimeServer = {
  port: number;
  disconnectClients(): void;
  close(): Promise<void>;
};

export async function startTerminalRuntimeServer(
  options: TerminalRuntimeServerOptions,
): Promise<TerminalRuntimeServer> {
  const origins = options.origins ?? [];
  const handshakeTimeoutMs = options.handshakeTimeoutMs ?? HELLO_TIMEOUT_MS;
  const httpServer = createServer();
  const commandServer = new WebSocketServer({ noServer: true });
  const ioServer = new WebSocketServer({ noServer: true });
  const controlServer = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (request, socket, head) => {
    if (!originAllowed(request, origins)) {
      socket.destroy();
      return;
    }
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/terminal/io") {
      ioServer.handleUpgrade(request, socket, head, (ws) => {
        bindIoSocket(ws, url, options);
      });
      return;
    }
    if (url.pathname === "/terminal/control") {
      controlServer.handleUpgrade(request, socket, head, (ws) => {
        bindControlSocket(ws, url, options);
      });
      return;
    }
    if (url.pathname === "/" || url.pathname === "") {
      commandServer.handleUpgrade(request, socket, head, (ws) => {
        bindCommandSocket(ws, options, handshakeTimeoutMs);
      });
      return;
    }
    socket.destroy();
  });

  await listen(httpServer, options.bind, options.port);
  const address = httpServer.address();
  const port = address && typeof address === "object" ? address.port : options.port;

  return {
    port,
    disconnectClients() {
      for (const client of commandServer.clients) client.close(1012, "terminal-runtime restart");
      for (const client of ioServer.clients) client.close(1012, "terminal-runtime restart");
      for (const client of controlServer.clients) client.close(1012, "terminal-runtime restart");
    },
    close: async () => {
      for (const client of [...commandServer.clients, ...ioServer.clients, ...controlServer.clients]) {
        client.terminate();
      }
      await closeHttp(httpServer);
    },
  };
}

function originAllowed(request: IncomingMessage, origins: string[]): boolean {
  if (origins.length === 0) return true;
  const origin = request.headers.origin;
  return typeof origin === "string" && origins.includes(origin);
}

function bindCommandSocket(
  socket: WebSocket,
  options: TerminalRuntimeServerOptions,
  handshakeTimeoutMs: number,
): void {
  let authenticated = false;
  const timeout = setTimeout(() => {
    if (!authenticated) closeAuth(socket, "handshake timeout");
  }, handshakeTimeoutMs);

  socket.on("message", (raw) => {
    void handleCommandMessage(raw.toString(), socket, options, (ok) => {
      authenticated = ok;
      if (ok) clearTimeout(timeout);
    }, () => authenticated);
  });
  socket.on("close", () => clearTimeout(timeout));
}

async function handleCommandMessage(
  raw: string,
  socket: WebSocket,
  options: TerminalRuntimeServerOptions,
  setAuthenticated: (ok: boolean) => void,
  isAuthenticated: () => boolean,
): Promise<void> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    if (!isAuthenticated()) closeAuth(socket, "invalid handshake");
    return;
  }

  if (!isAuthenticated()) {
    if (!isHelloRequest(parsed) || !tokensEqual(options.token, parsed.token)) {
      closeAuth(socket, "authentication failed");
      return;
    }
    setAuthenticated(true);
    sendJson(socket, {
      id: parsed.id,
      type: "hello.ok",
      protocol: TERMINAL_RUNTIME_PROTOCOL,
    });
    return;
  }

  if (!isCommandRequest(parsed) || !isTerminalRuntimeCommand(parsed.command)) {
    sendJson(socket, {
      id: isCommandRequest(parsed) ? parsed.id : "unknown",
      error: { message: "Unknown terminal command" },
    });
    return;
  }

  try {
    const result = dispatchCommand(options.sessions, parsed.command, parsed.payload ?? {});
    sendJson(socket, { id: parsed.id, result });
  } catch (error) {
    sendJson(socket, {
      id: parsed.id,
      error: { message: error instanceof Error ? error.message : "Terminal command failed" },
    });
  }
}

function dispatchCommand(
  sessions: TerminalSessionService,
  command: string,
  payload: Record<string, unknown>,
): unknown {
  if (command === "terminal_session_create") {
    return sessions.create({
      cwd: typeof payload.cwd === "string" ? payload.cwd : undefined,
      cols: asPositive(payload.cols),
      rows: asPositive(payload.rows),
    });
  }
  if (command === "terminal_session_list") {
    return sessions.list();
  }
  if (command === "terminal_session_write") {
    const sessionId = requiredString(payload.sessionId, "sessionId");
    const data = requiredString(payload.data, "data");
    return { ok: sessions.write(sessionId, Buffer.from(data, "base64")) };
  }
  if (command === "terminal_session_resize") {
    const sessionId = requiredString(payload.sessionId, "sessionId");
    return {
      ok: sessions.resize(sessionId, asPositive(payload.cols) ?? 120, asPositive(payload.rows) ?? 40),
    };
  }
  if (command === "terminal_session_stop") {
    return sessions.stop(requiredString(payload.sessionId, "sessionId"));
  }
  throw new Error("Unknown terminal command");
}

function bindIoSocket(
  socket: WebSocket,
  url: URL,
  options: TerminalRuntimeServerOptions,
): void {
  if (!authorizeQuery(url, options.token)) {
    closeAuth(socket, "authentication failed");
    return;
  }
  const sessionId = url.searchParams.get("sessionId")?.trim() ?? "";
  if (!sessionId) {
    closeAuth(socket, "sessionId required");
    return;
  }
  const detach = options.sessions.attach(sessionId, {
    onOutput: (chunk) => {
      if (socket.readyState === socket.OPEN) socket.send(chunk);
    },
  });
  if (!detach) {
    closeAuth(socket, "unknown session");
    return;
  }
  socket.on("message", (raw) => {
    options.sessions.write(sessionId, rawDataToBuffer(raw));
  });
  socket.on("close", () => detach());
}

function bindControlSocket(
  socket: WebSocket,
  url: URL,
  options: TerminalRuntimeServerOptions,
): void {
  if (!authorizeQuery(url, options.token)) {
    closeAuth(socket, "authentication failed");
    return;
  }
  const sessionId = url.searchParams.get("sessionId")?.trim() ?? "";
  if (!sessionId) {
    closeAuth(socket, "sessionId required");
    return;
  }
  const snapshot = options.sessions.getRestoreSnapshot(sessionId);
  if (!snapshot) {
    closeAuth(socket, "unknown session");
    return;
  }
  sendJson(socket, {
    type: "restore",
    snapshot: snapshot.snapshot,
    cols: snapshot.cols,
    rows: snapshot.rows,
  } satisfies TerminalControlServerMessage);
  const detach = options.sessions.attach(sessionId, {
    onExit: (code) => {
      sendJson(socket, { type: "exit", code } satisfies TerminalControlServerMessage);
    },
  });
  socket.on("message", (raw) => {
    const message = parseControlMessage(raw);
    if (!message) return;
    if (message.type === "resize") {
      options.sessions.resize(sessionId, message.cols, message.rows);
    }
    if (message.type === "stop") {
      options.sessions.stop(sessionId);
    }
  });
  socket.on("close", () => detach?.());
}

function authorizeQuery(url: URL, token: string): boolean {
  return tokensEqual(token, url.searchParams.get("token") ?? "");
}

function parseControlMessage(raw: RawData): TerminalControlClientMessage | null {
  try {
    const parsed = JSON.parse(raw.toString()) as TerminalControlClientMessage;
    if (!parsed || typeof parsed !== "object" || typeof parsed.type !== "string") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function rawDataToBuffer(message: RawData): Buffer {
  if (typeof message === "string") return Buffer.from(message, "utf8");
  if (Buffer.isBuffer(message)) return message;
  if (Array.isArray(message)) return Buffer.concat(message.map(rawDataToBuffer));
  return Buffer.from(message);
}

function asPositive(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : undefined;
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function sendJson(socket: WebSocket, value: unknown): void {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(value));
}

function closeAuth(socket: WebSocket, reason: string): void {
  socket.close(AUTH_CLOSE_CODE, reason);
}

function listen(server: Server, bind: string, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, bind, () => {
      server.off("error", reject);
      resolve();
    });
  });
}

function closeHttp(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}
