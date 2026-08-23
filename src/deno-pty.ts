import { Pty, instantiate } from "jsr:@sigma/pty-ffi@0.42.0/noinit";
import type { PtyLike, SpawnPty, SpawnPtySessionRequest } from "./pty-session";

let initializedPath: string | null = null;

export async function initializeDenoPty(libraryPath: string): Promise<void> {
  if (initializedPath === libraryPath) return;
  if (initializedPath) throw new Error("The Deno PTY library is already initialized from another path");
  await instantiate(libraryPath);
  initializedPath = libraryPath;
}

export const spawnDenoPty: SpawnPty = (request) => new DenoPtySession(request);

class DenoPtySession implements PtyLike {
  readonly pid = null;
  readonly #pty: Pty;
  readonly #request: SpawnPtySessionRequest;
  #closed = false;
  #paused = false;
  #exitEmitted = false;

  constructor(request: SpawnPtySessionRequest) {
    this.#request = request;
    this.#pty = new Pty(request.binary, {
      args: request.args,
      cwd: request.cwd,
      env: Object.fromEntries(
        Object.entries(request.env ?? {}).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string",
        ),
      ),
      size: { cols: request.cols, rows: request.rows },
    });
    void this.#readLoop();
  }

  write(data: string | Uint8Array): void {
    if (!this.#closed) {
      this.#pty.write(typeof data === "string" ? data : new TextDecoder().decode(data));
    }
  }

  resize(cols: number, rows: number): void {
    if (!this.#closed) this.#pty.resize({ cols, rows });
  }

  pause(): void {
    this.#paused = true;
  }

  resume(): void {
    this.#paused = false;
  }

  stop(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#pty.close();
    this.#emitExit(null);
  }

  async #readLoop(): Promise<void> {
    try {
      while (!this.#closed) {
        if (this.#paused) {
          await delay(10);
          continue;
        }
        const result = this.#pty.readBytes();
        if (result.data.byteLength) this.#request.onData?.(result.data);
        if (result.done) {
          this.#closed = true;
          const exitCode = Number.isFinite(this.#pty.exitCode) ? this.#pty.exitCode ?? null : null;
          this.#pty.close();
          this.#emitExit(exitCode);
          return;
        }
        await delay(result.data.byteLength ? 0 : 10);
      }
    } catch (error) {
      if (!this.#closed) {
        this.#closed = true;
        this.#pty.close();
        this.#emitExit(null);
        console.error("[terminal-host] PTY read failed", error);
      }
    }
  }

  #emitExit(exitCode: number | null): void {
    if (this.#exitEmitted) return;
    this.#exitEmitted = true;
    this.#request.onExit?.({ exitCode });
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
