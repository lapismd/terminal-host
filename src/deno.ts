import { spawnDenoPty, initializeDenoPty } from "./deno-pty";
import { createTerminalSessionService, type TerminalSessionService } from "./session-service";
import { currentPtyTarget, materializePtyLibrary } from "./native-library";

export async function createDenoTerminalSessionService(options: {
  workspace: string;
  libraryPath?: string;
}): Promise<TerminalSessionService> {
  const libraryPath = options.libraryPath ?? await materializePtyLibrary(currentPtyTarget());
  await initializeDenoPty(libraryPath);
  return createTerminalSessionService({
    workspace: options.workspace,
    spawn: spawnDenoPty,
    env: Deno.env.toObject(),
    platform: Deno.build.os === "darwin" ? "darwin" : "linux",
  });
}

export { initializeDenoPty, spawnDenoPty } from "./deno-pty";
export { currentPtyTarget, materializePtyLibrary, ptyArtifact, verifyPtyLibrary } from "./native-library";
export { createTerminalSessionService } from "./session-service";
export type {
  CreateTerminalSessionRequest,
  TerminalSessionListener,
  TerminalSessionService,
  TerminalSessionStatus,
  TerminalSessionSummary,
} from "./session-service";
export type { PtyLike, SpawnPty, SpawnPtySessionRequest } from "./pty-session";
