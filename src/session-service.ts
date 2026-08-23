import { resolveSessionCwd } from "./cwd";
import type { PtyLike, SpawnPty } from "./pty-session";
import {
  inheritSessionEnvironment,
  resolveInteractiveShellCommand,
  type TerminalHostPlatform,
} from "./shell";

const MAX_SNAPSHOT_BYTES = 256 * 1024;

export type TerminalSessionStatus = "running" | "exited";

export type TerminalSessionSummary = {
  sessionId: string;
  pid: number | null;
  cwd: string;
  cols: number;
  rows: number;
  status: TerminalSessionStatus;
  exitCode: number | null;
};

export type TerminalSessionListener = {
  onOutput?: (chunk: Uint8Array) => void;
  onExit?: (code: number | null) => void;
};

export type CreateTerminalSessionRequest = {
  cwd?: string;
  shell?: string;
  cols?: number;
  rows?: number;
};

export type TerminalSessionService = {
  create(request?: CreateTerminalSessionRequest): TerminalSessionSummary;
  list(): TerminalSessionSummary[];
  write(sessionId: string, data: string | Uint8Array): boolean;
  resize(sessionId: string, cols: number, rows: number): boolean;
  stop(sessionId: string): TerminalSessionSummary | null;
  attach(sessionId: string, listener: TerminalSessionListener): (() => void) | null;
  getRestoreSnapshot(sessionId: string): { snapshot: string; cols: number; rows: number } | null;
  close(): void;
};

type SessionEntry = {
  summary: TerminalSessionSummary;
  process: PtyLike | null;
  snapshot: Uint8Array;
  listeners: Map<number, TerminalSessionListener>;
  nextListenerId: number;
};

export function createTerminalSessionService(options: {
  workspace: string;
  spawn: SpawnPty;
  env: Record<string, string | undefined>;
  platform: TerminalHostPlatform;
}): TerminalSessionService {
  const entries = new Map<string, SessionEntry>();
  const summarize = (entry: SessionEntry): TerminalSessionSummary => ({ ...entry.summary });
  const finish = (entry: SessionEntry, exitCode: number | null): void => {
    if (entry.summary.status === "exited") return;
    entry.summary.status = "exited";
    entry.summary.exitCode = exitCode;
    entry.summary.pid = null;
    entry.process = null;
    for (const listener of entry.listeners.values()) listener.onExit?.(exitCode);
  };

  const create = (request: CreateTerminalSessionRequest = {}): TerminalSessionSummary => {
    const cwd = resolveSessionCwd(options.workspace, request.cwd);
    const cols = positive(request.cols, 120);
    const rows = positive(request.rows, 40);
    const sessionId = crypto.randomUUID();
    const shell = resolveInteractiveShellCommand(options.env, options.platform, request.shell);
    const entry: SessionEntry = {
      summary: { sessionId, pid: null, cwd, cols, rows, status: "running", exitCode: null },
      process: null,
      snapshot: new Uint8Array(),
      listeners: new Map(),
      nextListenerId: 1,
    };
    const pty = options.spawn({
      binary: shell.binary,
      args: shell.args,
      cwd,
      env: inheritSessionEnvironment(
        { TERM: "xterm-256color", COLORTERM: "truecolor", TERM_PROGRAM: "lapis-terminal" },
        options.env,
      ),
      cols,
      rows,
      onData: (chunk) => {
        entry.snapshot = appendSnapshot(entry.snapshot, chunk);
        for (const listener of entry.listeners.values()) listener.onOutput?.(chunk);
      },
      onExit: (event) => finish(entry, event.exitCode),
    });
    entry.process = pty;
    entry.summary.pid = pty.pid;
    entries.set(sessionId, entry);
    return summarize(entry);
  };

  return {
    create,
    list: () => [...entries.values()].map(summarize),
    write(sessionId, data) {
      const entry = entries.get(sessionId);
      if (!entry?.process || entry.summary.status !== "running") return false;
      entry.process.write(data);
      return true;
    },
    resize(sessionId, cols, rows) {
      const entry = entries.get(sessionId);
      if (!entry?.process || entry.summary.status !== "running") return false;
      const nextCols = positive(cols, entry.summary.cols);
      const nextRows = positive(rows, entry.summary.rows);
      if (nextCols === entry.summary.cols && nextRows === entry.summary.rows) return true;
      entry.process.resize(nextCols, nextRows);
      entry.summary.cols = nextCols;
      entry.summary.rows = nextRows;
      return true;
    },
    stop(sessionId) {
      const entry = entries.get(sessionId);
      if (!entry) return null;
      entry.process?.stop();
      finish(entry, null);
      return summarize(entry);
    },
    attach(sessionId, listener) {
      const entry = entries.get(sessionId);
      if (!entry) return null;
      const id = entry.nextListenerId++;
      entry.listeners.set(id, listener);
      return () => entry.listeners.delete(id);
    },
    getRestoreSnapshot(sessionId) {
      const entry = entries.get(sessionId);
      if (!entry) return null;
      return { snapshot: new TextDecoder().decode(entry.snapshot), cols: entry.summary.cols, rows: entry.summary.rows };
    },
    close() {
      for (const entry of entries.values()) {
        entry.process?.stop();
        finish(entry, null);
      }
      entries.clear();
    },
  };
}

function positive(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && (value ?? 0) > 0 ? Math.floor(value ?? 0) : fallback;
}

function appendSnapshot(current: Uint8Array, chunk: Uint8Array): Uint8Array {
  const combined = new Uint8Array(current.byteLength + chunk.byteLength);
  combined.set(current);
  combined.set(chunk, current.byteLength);
  return combined.byteLength <= MAX_SNAPSHOT_BYTES
    ? combined
    : combined.slice(combined.byteLength - MAX_SNAPSHOT_BYTES);
}
