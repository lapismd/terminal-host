import * as pty from "node-pty";
import type { IPty } from "node-pty";

export interface PtyExitEvent {
  exitCode: number;
  signal?: number;
}

export interface SpawnPtySessionRequest {
  binary: string;
  args?: string[];
  cwd: string;
  env?: Record<string, string | undefined>;
  cols: number;
  rows: number;
  onData?: (chunk: Buffer) => void;
  onExit?: (event: PtyExitEvent) => void;
}

export interface PtyLike {
  readonly pid: number | null;
  write(data: string | Buffer): void;
  resize(cols: number, rows: number): void;
  pause(): void;
  resume(): void;
  stop(): void;
}

export type SpawnPty = (request: SpawnPtySessionRequest) => PtyLike;

type PtyOutputChunk = string | Buffer | Uint8Array;

function normalizeOutputChunk(data: PtyOutputChunk): Buffer {
  if (typeof data === "string") return Buffer.from(data, "utf8");
  return Buffer.isBuffer(data) ? data : Buffer.from(data);
}

function isIgnorablePtyError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as NodeJS.ErrnoException).code;
  return code === "EIO" || code === "EBADF";
}

function terminatePtyProcess(ptyProcess: IPty): void {
  const pid = ptyProcess.pid;
  ptyProcess.kill();
  if (process.platform !== "win32" && Number.isFinite(pid) && pid > 0) {
    try {
      process.kill(-pid, "SIGTERM");
    } catch {
      // Process group may already be gone.
    }
  }
}

export class PtySession implements PtyLike {
  private readonly ptyProcess: IPty;
  private exited = false;

  private constructor(
    ptyProcess: IPty,
    private readonly onDataCallback?: (chunk: Buffer) => void,
    private readonly onExitCallback?: (event: PtyExitEvent) => void,
  ) {
    this.ptyProcess = ptyProcess;
    this.ptyProcess.onData((data) => {
      this.onDataCallback?.(normalizeOutputChunk(data as PtyOutputChunk));
    });
    this.ptyProcess.onExit((event) => {
      this.exited = true;
      this.onExitCallback?.(event);
    });
  }

  static spawn(request: SpawnPtySessionRequest): PtySession {
    const terminalName = request.env?.TERM?.trim() || process.env.TERM?.trim() || "xterm-256color";
    const ptyProcess = pty.spawn(request.binary, request.args ?? [], {
      name: terminalName,
      cwd: request.cwd,
      env: request.env as NodeJS.ProcessEnv | undefined,
      cols: request.cols,
      rows: request.rows,
    });
    return new PtySession(ptyProcess, request.onData, request.onExit);
  }

  get pid(): number {
    return this.ptyProcess.pid;
  }

  write(data: string | Buffer): void {
    try {
      this.ptyProcess.write(typeof data === "string" ? data : data.toString("utf8"));
    } catch (error) {
      if (!isIgnorablePtyError(error)) throw error;
    }
  }

  resize(cols: number, rows: number): void {
    if (this.exited) return;
    try {
      this.ptyProcess.resize(cols, rows);
    } catch (error) {
      if (isIgnorablePtyError(error)) {
        this.exited = true;
        return;
      }
      throw error;
    }
  }

  pause(): void {
    this.ptyProcess.pause();
  }

  resume(): void {
    this.ptyProcess.resume();
  }

  stop(): void {
    terminatePtyProcess(this.ptyProcess);
  }
}
