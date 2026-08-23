import { resolve } from "node:path";
import type { ServeArgs } from "./parse-cli";
import { createDenoTerminalSessionService } from "./deno";
import { generateToken } from "./token";
import { startTerminalRuntimeServer } from "./ws-server";

export type RunningTerminalHost = {
  token: string;
  url: string;
  workspace: string;
  generatedToken: boolean;
  disconnectClients(): void;
  close(): Promise<void>;
};

export async function serveTerminalHost(
  args: ServeArgs,
  options?: { print?: (line: string) => void; libraryPath?: string },
): Promise<RunningTerminalHost> {
  const provided = args.token?.trim() ?? "";
  const generatedToken = provided.length === 0;
  const token = generatedToken ? generateToken() : provided;
  if (!token) throw new Error("lapis-terminal-host serve requires a token");
  const workspace = resolve(args.workspace);
  await Deno.mkdir(workspace, { recursive: true });
  const sessions = await createDenoTerminalSessionService({ workspace, libraryPath: options?.libraryPath });
  const server = await startTerminalRuntimeServer({
    port: args.port,
    bind: args.bind,
    token,
    workspace,
    origins: args.origins,
    sessions,
  });
  const url = `ws://${args.bind}:${server.port}`;
  const print = options?.print ?? console.log;
  print(`lapis-terminal-host listening on ${url}`);
  print(`token: ${token}`);
  return {
    token,
    url,
    workspace,
    generatedToken,
    disconnectClients: () => server.disconnectClients(),
    close: async () => {
      sessions.close();
      await server.close();
    },
  };
}
