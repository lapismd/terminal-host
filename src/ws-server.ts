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
  const sockets = new Set<WebSocket>();
  let listenPort = options.port;
  let resolveListening!: () => void;
  const listening = new Promise<void>((resolve) => {
    resolveListening = resolve;
  });
  const server = Deno.serve(
    {
      hostname: options.bind,
      port: options.port,
      onListen(address) {
        listenPort = address.port;
        resolveListening();
      },
    },
    (request) => handleUpgrade(request, options, sockets),
  );
  await listening;
  return {
    port: listenPort,
    disconnectClients() {
      for (const socket of sockets) socket.close(1012, "terminal-runtime restart");
    },
    async close() {
      for (const socket of sockets) socket.close(1001, "terminal-runtime shutdown");
      await server.shutdown();
    },
  };
}

function handleUpgrade(
  request: Request,
  options: TerminalRuntimeServerOptions,
  sockets: Set<WebSocket>,
): Response {
  if (!originAllowed(request, options.origins ?? [])) return new Response("Forbidden", { status: 403 });
  if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    return new Response("Lapis terminal host", { status: 200 });
  }
  const url = new URL(request.url);
  const { socket, response } = Deno.upgradeWebSocket(request);
  sockets.add(socket);
  socket.addEventListener("close", () => sockets.delete(socket), { once: true });
  if (url.pathname === "/terminal/io") bindIoSocket(socket, url, options);
  else if (url.pathname === "/terminal/control") bindControlSocket(socket, url, options);
  else if (url.pathname === "/" || url.pathname === "") {
    bindCommandSocket(socket, options, options.handshakeTimeoutMs ?? HELLO_TIMEOUT_MS);
  } else socket.close(1008, "unknown endpoint");
  return response;
}

function originAllowed(request: Request, origins: string[]): boolean {
  if (origins.length === 0) return true;
  const origin = request.headers.get("origin");
  return origin !== null && origins.includes(origin);
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
  socket.addEventListener("message", (event) => {
    void handleCommandMessage(String(event.data), socket, options, () => {
      authenticated = true;
      clearTimeout(timeout);
    }, () => authenticated);
  });
  socket.addEventListener("close", () => clearTimeout(timeout), { once: true });
}

async function handleCommandMessage(
  raw: string,
  socket: WebSocket,
  options: TerminalRuntimeServerOptions,
  authenticate: () => void,
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
    authenticate();
    sendJson(socket, { id: parsed.id, type: "hello.ok", protocol: TERMINAL_RUNTIME_PROTOCOL });
    return;
  }
  if (!isCommandRequest(parsed) || !isTerminalRuntimeCommand(parsed.command)) {
    sendJson(socket, { id: isCommandRequest(parsed) ? parsed.id : "unknown", error: { message: "Unknown terminal command" } });
    return;
  }
  try {
    const result = dispatchCommand(options.sessions, parsed.command, parsed.payload ?? {});
    sendJson(socket, { id: parsed.id, result });
  } catch (error) {
    sendJson(socket, { id: parsed.id, error: { message: error instanceof Error ? error.message : "Terminal command failed" } });
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
      shell: typeof payload.shell === "string" ? payload.shell : undefined,
      cols: asPositive(payload.cols),
      rows: asPositive(payload.rows),
    });
  }
  if (command === "terminal_session_list") return sessions.list();
  if (command === "terminal_session_write") {
    const sessionId = requiredString(payload.sessionId, "sessionId");
    return { ok: sessions.write(sessionId, base64ToBytes(requiredString(payload.data, "data"))) };
  }
  if (command === "terminal_session_resize") {
    const sessionId = requiredString(payload.sessionId, "sessionId");
    return { ok: sessions.resize(sessionId, asPositive(payload.cols) ?? 120, asPositive(payload.rows) ?? 40) };
  }
  if (command === "terminal_session_stop") return sessions.stop(requiredString(payload.sessionId, "sessionId"));
  throw new Error("Unknown terminal command");
}

function bindIoSocket(socket: WebSocket, url: URL, options: TerminalRuntimeServerOptions): void {
  if (!authorizeQuery(url, options.token)) return closeAuth(socket, "authentication failed");
  const sessionId = url.searchParams.get("sessionId")?.trim() ?? "";
  if (!sessionId) return closeAuth(socket, "sessionId required");
  const detach = options.sessions.attach(sessionId, {
    onOutput: (chunk) => {
      if (socket.readyState === WebSocket.OPEN) {
        const bytes = new Uint8Array(chunk.byteLength);
        bytes.set(chunk);
        socket.send(bytes);
      }
    },
  });
  if (!detach) return closeAuth(socket, "unknown session");
  socket.addEventListener("message", (event) => {
    void eventBytes(event.data).then((data) => options.sessions.write(sessionId, data));
  });
  socket.addEventListener("close", detach, { once: true });
}

function bindControlSocket(socket: WebSocket, url: URL, options: TerminalRuntimeServerOptions): void {
  if (!authorizeQuery(url, options.token)) return closeAuth(socket, "authentication failed");
  const sessionId = url.searchParams.get("sessionId")?.trim() ?? "";
  if (!sessionId) return closeAuth(socket, "sessionId required");
  const snapshot = options.sessions.getRestoreSnapshot(sessionId);
  if (!snapshot) return closeAuth(socket, "unknown session");
  socket.addEventListener("open", () => {
    sendJson(socket, { type: "restore", ...snapshot } satisfies TerminalControlServerMessage);
  }, { once: true });
  const detach = options.sessions.attach(sessionId, {
    onExit: (code) => sendJson(socket, { type: "exit", code } satisfies TerminalControlServerMessage),
  });
  socket.addEventListener("message", (event) => {
    const message = parseControlMessage(String(event.data));
    if (message?.type === "resize") options.sessions.resize(sessionId, message.cols, message.rows);
    if (message?.type === "stop") options.sessions.stop(sessionId);
  });
  socket.addEventListener("close", () => detach?.(), { once: true });
}

function authorizeQuery(url: URL, token: string): boolean {
  return tokensEqual(token, url.searchParams.get("token") ?? "");
}

function parseControlMessage(raw: string): TerminalControlClientMessage | null {
  try {
    const parsed = JSON.parse(raw) as TerminalControlClientMessage;
    return parsed && typeof parsed === "object" && typeof parsed.type === "string" ? parsed : null;
  } catch {
    return null;
  }
}

async function eventBytes(data: string | ArrayBuffer | Blob): Promise<Uint8Array> {
  if (typeof data === "string") return new TextEncoder().encode(data);
  if (data instanceof Blob) return new Uint8Array(await data.arrayBuffer());
  return new Uint8Array(data);
}

function base64ToBytes(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

function asPositive(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : undefined;
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} is required`);
  return value;
}

function sendJson(socket: WebSocket, value: unknown): void {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(value));
}

function closeAuth(socket: WebSocket, reason: string): void {
  socket.close(AUTH_CLOSE_CODE, reason);
}
