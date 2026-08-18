import {
  TERMINAL_RUNTIME_PROTOCOL,
  isHelloRequest,
  type CommandResult,
  type TerminalExitEvent,
  type TerminalOutputEvent,
} from "./protocol";

export type TerminalRuntimeAttachConfig = {
  url: string;
  token: string;
};

export type TerminalRuntimeBridge = {
  readonly runtime: "lapis-terminal-host";
  readonly capabilities: {
    "terminal-runtime": {
      id: "terminal-runtime";
      status: "available";
      provider: "lapis-terminal-host";
      details: Record<string, string>;
    };
  };
  invoke<T>(command: string, payload?: Record<string, unknown>): Promise<T>;
  dispose(): void;
  onTerminalOutput?(listener: (event: TerminalOutputEvent) => void): () => void;
  onTerminalExit?(listener: (event: TerminalExitEvent) => void): () => void;
};

type Pending = {
  resolve(value: unknown): void;
  reject(error: Error): void;
};

type SessionSockets = {
  io: WebSocket;
  control: WebSocket;
};

function trim(value: string | undefined): string {
  return value?.trim() ?? "";
}

function commandOrigin(url: string): string {
  return url.replace(/\/+$/u, "");
}

function sessionPlaneUrl(
  origin: string,
  plane: "io" | "control",
  token: string,
  sessionId: string,
  clientId: string,
): string {
  const target = new URL(`${origin}/terminal/${plane}`);
  target.searchParams.set("token", token);
  target.searchParams.set("sessionId", sessionId);
  target.searchParams.set("clientId", clientId);
  return target.toString();
}

function bytesToBase64(data: ArrayBuffer | Buffer | Uint8Array | string): string {
  if (typeof data === "string") {
    return btoa(unescape(encodeURIComponent(data)));
  }
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function textToBase64(value: string): string {
  return btoa(unescape(encodeURIComponent(value)));
}

export function resolveTerminalRuntimeAttachConfig(
  options?: Partial<TerminalRuntimeAttachConfig>,
): TerminalRuntimeAttachConfig | null {
  const url = trim(options?.url);
  const token = trim(options?.token);
  if (!url || !token) return null;
  return { url, token };
}

export function createTerminalRuntimeBridge(
  config: TerminalRuntimeAttachConfig,
): TerminalRuntimeBridge {
  const outputListeners = new Set<(event: TerminalOutputEvent) => void>();
  const exitListeners = new Set<(event: TerminalExitEvent) => void>();
  const pending = new Map<string, Pending>();
  const attached = new Map<string, SessionSockets>();
  const clientId = `web-${Math.random().toString(36).slice(2, 10)}`;
  let nextId = 1;
  let disposed = false;
  const origin = commandOrigin(config.url);
  const socket = new WebSocket(config.url);

  const ready = new Promise<void>((resolve, reject) => {
    socket.addEventListener("open", () => {
      socket.send(
        JSON.stringify({ id: "hello-1", type: "hello", token: config.token }),
      );
    });
    socket.addEventListener("message", (event) => {
      const parsed = JSON.parse(String(event.data)) as Record<string, unknown>;
      if (parsed.type === "hello.ok") {
        if (parsed.protocol !== TERMINAL_RUNTIME_PROTOCOL) {
          reject(new Error("Unsupported terminal-host protocol"));
          return;
        }
        resolve();
        return;
      }
      const id = typeof parsed.id === "string" ? parsed.id : "";
      const waiter = pending.get(id);
      if (!waiter) return;
      pending.delete(id);
      if (parsed.error && typeof parsed.error === "object") {
        const message = (parsed.error as { message?: string }).message;
        waiter.reject(new Error(message || "Terminal command failed"));
        return;
      }
      waiter.resolve(parsed.result);
    });
    socket.addEventListener("error", () => reject(new Error("terminal-host socket error")));
    socket.addEventListener("close", () => {
      if (!disposed) reject(new Error("terminal-host closed"));
    });
  });

  function emitOutput(sessionId: string, data: string): void {
    const event = { sessionId, data };
    for (const listener of outputListeners) listener(event);
  }

  function emitExit(sessionId: string, code: number | null): void {
    const event = { sessionId, code };
    for (const listener of exitListeners) listener(event);
  }

  function waitOpen(socket: WebSocket): Promise<void> {
    if (socket.readyState === WebSocket.OPEN) return Promise.resolve();
    if (socket.readyState === WebSocket.CLOSING || socket.readyState === WebSocket.CLOSED) {
      return Promise.reject(new Error("terminal-host session plane closed"));
    }
    return new Promise((resolve, reject) => {
      socket.addEventListener("open", () => resolve(), { once: true });
      socket.addEventListener(
        "error",
        () => reject(new Error("terminal-host session plane error")),
        { once: true },
      );
      socket.addEventListener(
        "close",
        () => reject(new Error("terminal-host session plane closed")),
        { once: true },
      );
    });
  }

  function attachSession(sessionId: string): Promise<void> {
    if (disposed) return Promise.resolve();
    const existing = attached.get(sessionId);
    if (existing) {
      return Promise.all([waitOpen(existing.io), waitOpen(existing.control)]).then(
        () => undefined,
      );
    }
    const io = new WebSocket(
      sessionPlaneUrl(origin, "io", config.token, sessionId, clientId),
    );
    io.binaryType = "arraybuffer";
    const control = new WebSocket(
      sessionPlaneUrl(origin, "control", config.token, sessionId, clientId),
    );
    attached.set(sessionId, { io, control });
    io.addEventListener("message", (event) => {
      emitOutput(sessionId, bytesToBase64(event.data as ArrayBuffer | string));
    });
    control.addEventListener("message", (event) => {
      const parsed = JSON.parse(String(event.data)) as Record<string, unknown>;
      if (parsed.type === "restore" && typeof parsed.snapshot === "string") {
        emitOutput(sessionId, textToBase64(parsed.snapshot));
      }
      if (parsed.type === "exit") {
        emitExit(sessionId, typeof parsed.code === "number" ? parsed.code : null);
      }
    });
    return Promise.all([waitOpen(io), waitOpen(control)])
      .then(() => undefined)
      .catch((error) => {
        attached.delete(sessionId);
        io.close();
        control.close();
        throw error;
      });
  }

  function closeAttached(): void {
    for (const { io, control } of attached.values()) {
      io.close();
      control.close();
    }
    attached.clear();
  }

  function requestId(): string {
    return `cmd-${nextId++}`;
  }

  async function sendCommand(command: string, payload?: Record<string, unknown>) {
    await ready;
    const id = requestId();
    const result = new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
    });
    socket.send(JSON.stringify({ id, command, payload }));
    return result;
  }

  return {
    runtime: "lapis-terminal-host",
    capabilities: {
      "terminal-runtime": {
        id: "terminal-runtime",
        status: "available",
        provider: "lapis-terminal-host",
        details: { url: config.url, protocol: String(TERMINAL_RUNTIME_PROTOCOL) },
      },
    },
    async invoke<T>(command: string, payload?: Record<string, unknown>): Promise<T> {
      const sessionId =
        payload && typeof payload.sessionId === "string" ? payload.sessionId : "";
      if (
        sessionId &&
        (command === "terminal_session_write" ||
          command === "terminal_session_resize")
      ) {
        await attachSession(sessionId);
      }
      const result = (await sendCommand(command, payload)) as T;
      if (
        result &&
        typeof result === "object" &&
        "ok" in result &&
        (result as { ok?: unknown }).ok === false
      ) {
        if (sessionId) attached.delete(sessionId);
        throw new Error("Terminal session is unavailable");
      }
      if (command === "terminal_session_create") {
        const createdId = (result as { sessionId?: string }).sessionId;
        if (createdId) await attachSession(createdId);
      }
      if (command === "terminal_session_list" && Array.isArray(result)) {
        await Promise.all(
          (result as Array<{ sessionId?: string }>)
            .map((session) => session.sessionId)
            .filter((sessionId): sessionId is string => Boolean(sessionId))
            .map((sessionId) => attachSession(sessionId)),
        );
      }
      return result;
    },
    dispose() {
      disposed = true;
      closeAttached();
      socket.close();
      for (const waiter of pending.values()) {
        waiter.reject(new Error("terminal-host disposed"));
      }
      pending.clear();
    },
    onTerminalOutput(listener) {
      outputListeners.add(listener);
      return () => outputListeners.delete(listener);
    },
    onTerminalExit(listener) {
      exitListeners.add(listener);
      return () => exitListeners.delete(listener);
    },
  };
}

export function maybeRegisterTerminalRuntimeBridge(options: {
  url?: string;
  token?: string;
  hasBridge: () => boolean;
  register: (bridge: TerminalRuntimeBridge) => void;
}): boolean {
  if (options.hasBridge()) return false;
  const config = resolveTerminalRuntimeAttachConfig({
    url: options.url,
    token: options.token,
  });
  if (!config) return false;
  options.register(createTerminalRuntimeBridge(config));
  return true;
}

export function isHelloFrame(value: unknown): boolean {
  return isHelloRequest(value);
}

export type { CommandResult };
