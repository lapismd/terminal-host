import { formatCliHelp, parseServeArgs } from "./parse-cli";
import { serveTerminalHost } from "./serve";

export async function runCli(
  argv: string[],
  options?: { stdout?: (line: string) => void; stderr?: (line: string) => void },
): Promise<number> {
  const parsed = parseServeArgs(argv);
  if (!parsed.ok && "help" in parsed) {
    (options?.stdout ?? console.log)(formatCliHelp());
    return 0;
  }
  if (!parsed.ok) {
    (options?.stderr ?? console.error)(parsed.error);
    return 2;
  }
  const host = await serveTerminalHost(parsed.args, { print: options?.stdout });
  const shutdown = async () => {
    await host.close();
    Deno.exit(0);
  };
  Deno.addSignalListener("SIGINT", () => void shutdown());
  Deno.addSignalListener("SIGTERM", () => void shutdown());
  return 0;
}

if (import.meta.main) {
  const code = await runCli(Deno.args);
  if (code !== 0) Deno.exit(code);
}
