import { randomUUID } from "node:crypto";
import { resolveSessionCwd } from "./cwd";
import { PtySession, type PtyLike, type SpawnPty } from "./pty-session";
import { resolveInteractiveShellCommand } from "./shell";

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
  onOutput?: (chunk: Buffer) => void;
  onExit?: (code: number | null) => void;
};

export type CreateTerminalSessionRequest = {
  cwd?: string;
  cols?: number;
  rows?: number;
};

export type TerminalSessionService = {
  create(request?: CreateTerminalSessionRequest): TerminalSessionSummary;
  list(): TerminalSessionSummary[];
  write(sessionId: string, data: string | Buffer): boolean;
  resize(sessionId: string, cols: number, rows: number): boolean;
  stop(sessionId: string): TerminalSessionSummary | null;
  attach(sessionId: string, listener: TerminalSessionListener): (() => void) | null;
  getRestoreSnapshot(sessionId: string): { snapshot: string; cols: number; rows: number } | null;
  close(): void;
};

type SessionEntry = {
  summary: TerminalSessionSummary;
  process: PtyLike | null;
  snapshot: Buffer;
  listeners: Map<number, TerminalSessionListener>;
  nextListenerId: number;
};

export function createTerminalSessionService(options: {
  workspace: string;
  spawn?: SpawnPty;
  env?: NodeJS.ProcessEnv;
}): TerminalSessionService {
  const entries = new Map<string, SessionEntry>();
  const spawn = options.spawn ?? ((request) => PtySession.spawn(request));

  const summarize = (entry: SessionEntry): TerminalSessionSummary => ({
    ...entry.summary,
  });

  const create = (request: CreateTerminalSessionRequest = {}): TerminalSessionSummary => {
    const cwd = resolveSessionCwd(options.workspace, request.cwd);
    const cols = positive(request.cols, 120);
    const rows = positive(request.rows, 40);
    const sessionId = randomUUID();
    const shell = resolveInteractiveShellCommand(options.env);
    const entry: SessionEntry = {
      summary: {
        sessionId,
        pid: null,
        cwd,
        cols,
        rows,
        status: "running",
        exitCode: null,
      },
      process: null,
      snapshot: Buffer.alloc(0),
      listeners: new Map(),
      nextListenerId: 1,
    };
    const process = spawn({
      binary: shell.binary,
      args: shell.args,
      cwd,
      env: {
        ...options.env,
        TERM: "xterm-256color",
        COLORTERM: "truecolor",
        TERM_PROGRAM: "lapis-terminal",
      },
      cols,
      rows,
      onData: (chunk) => {
        entry.snapshot = appendSnapshot(entry.snapshot, chunk);
        for (const listener of entry.listeners.values()) {
          listener.onOutput?.(chunk);
        }
      },
      onExit: (event) => {
        entry.summary.status = "exited";
        entry.summary.exitCode = event.exitCode;
        entry.summary.pid = null;
        entry.process = null;
        for (const listener of entry.listeners.values()) {
          listener.onExit?.(event.exitCode);
        }
      },
    });
    entry.process = process;
    entry.summary.pid = process.pid;
    entries.set(sessionId, entry);
    return summarize(entry);
  };

  return {
    create,
    list() {
      return [...entries.values()].map(summarize);
    },
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
      entry.process.resize(nextCols, nextRows);
      entry.summary.cols = nextCols;
      entry.summary.rows = nextRows;
      return true;
    },
    stop(sessionId) {
      const entry = entries.get(sessionId);
      if (!entry) return null;
      entry.process?.stop();
      if (entry.summary.status === "running") {
        entry.summary.status = "exited";
        entry.summary.pid = null;
      }
      return summarize(entry);
    },
    attach(sessionId, listener) {
      const entry = entries.get(sessionId);
      if (!entry) return null;
      const id = entry.nextListenerId++;
      entry.listeners.set(id, listener);
      return () => {
        entry.listeners.delete(id);
      };
    },
    getRestoreSnapshot(sessionId) {
      const entry = entries.get(sessionId);
      if (!entry) return null;
      return {
        snapshot: entry.snapshot.toString("utf8"),
        cols: entry.summary.cols,
        rows: entry.summary.rows,
      };
    },
    close() {
      for (const entry of entries.values()) {
        entry.process?.stop();
      }
      entries.clear();
    },
  };
}

function positive(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && (value ?? 0) > 0 ? Math.floor(value ?? 0) : fallback;
}

function appendSnapshot(current: Buffer, chunk: Buffer): Buffer {
  const next = Buffer.concat([current, chunk]);
  if (next.byteLength <= MAX_SNAPSHOT_BYTES) return next;
  return next.subarray(next.byteLength - MAX_SNAPSHOT_BYTES);
}
