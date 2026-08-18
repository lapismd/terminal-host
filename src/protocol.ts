export const TERMINAL_RUNTIME_PROTOCOL = 1;
export const HELLO_TIMEOUT_MS = 5_000;
export const AUTH_CLOSE_CODE = 4401;

export const TERMINAL_RUNTIME_COMMANDS = [
  "terminal_session_create",
  "terminal_session_list",
  "terminal_session_write",
  "terminal_session_resize",
  "terminal_session_stop",
] as const;

export type TerminalRuntimeCommand = (typeof TERMINAL_RUNTIME_COMMANDS)[number];

export type HelloRequest = {
  id: string;
  type: "hello";
  token: string;
};

export type HelloOk = {
  id: string;
  type: "hello.ok";
  protocol: number;
};

export type CommandRequest = {
  id: string;
  command: string;
  payload?: Record<string, unknown>;
};

export type CommandResult = {
  id: string;
  result?: unknown;
  error?: { message: string };
};

export type TerminalOutputEvent = {
  sessionId: string;
  data: string;
};

export type TerminalExitEvent = {
  sessionId: string;
  code: number | null;
};

export type TerminalControlClientMessage =
  | { type: "resize"; cols: number; rows: number; pixelWidth?: number; pixelHeight?: number }
  | { type: "stop" }
  | { type: "output_ack"; bytes: number }
  | { type: "restore_complete" };

export type TerminalControlServerMessage =
  | { type: "restore"; snapshot: string; cols?: number | null; rows?: number | null }
  | { type: "state"; sessionId: string; status: string }
  | { type: "error"; message: string }
  | { type: "exit"; code: number | null };

export function isHelloRequest(value: unknown): value is HelloRequest {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    record.type === "hello" &&
    typeof record.id === "string" &&
    typeof record.token === "string"
  );
}

export function isCommandRequest(value: unknown): value is CommandRequest {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return typeof record.id === "string" && typeof record.command === "string";
}

export function isTerminalRuntimeCommand(
  command: string,
): command is TerminalRuntimeCommand {
  return (TERMINAL_RUNTIME_COMMANDS as readonly string[]).includes(command);
}
