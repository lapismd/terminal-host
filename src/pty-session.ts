export interface PtyExitEvent {
  exitCode: number | null;
  signal?: number;
}

export interface SpawnPtySessionRequest {
  binary: string;
  args?: string[];
  cwd: string;
  env?: Record<string, string | undefined>;
  cols: number;
  rows: number;
  onData?: (chunk: Uint8Array) => void;
  onExit?: (event: PtyExitEvent) => void;
}

export interface PtyLike {
  readonly pid: number | null;
  write(data: string | Uint8Array): void;
  resize(cols: number, rows: number): void;
  pause(): void;
  resume(): void;
  stop(): void;
}

export type SpawnPty = (request: SpawnPtySessionRequest) => PtyLike;
