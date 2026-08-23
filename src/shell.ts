import { isAbsolute } from "node:path";

export type TerminalHostPlatform = "darwin" | "linux";

export function resolveInteractiveShellCommand(
  env: Record<string, string | undefined>,
  platform: TerminalHostPlatform,
  requested?: string,
): { binary: string; args: string[] } {
  const override = requested?.trim();
  if (override) {
    if (!isAbsolute(override)) {
      throw new Error("Terminal session shell must be an absolute path");
    }
    return { binary: override, args: ["-il"] };
  }

  const command = env.SHELL?.trim();
  if (command) return { binary: command, args: ["-il"] };
  return { binary: platform === "darwin" ? "/bin/zsh" : "/bin/bash", args: ["-il"] };
}

export function inheritSessionEnvironment(
  overrides: Record<string, string | undefined> = {},
  parent: Record<string, string | undefined> = {},
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries({ ...parent, ...overrides })) {
    if (typeof value === "string") env[key] = value;
  }
  env.TERM = overrides.TERM?.trim() || parent.TERM?.trim() || "xterm-256color";
  env.COLORTERM = overrides.COLORTERM?.trim() || "truecolor";
  env.TERM_PROGRAM = overrides.TERM_PROGRAM?.trim() || "lapis-terminal";
  return env;
}
