import { isAbsolute } from "node:path";

export function resolveInteractiveShellCommand(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  requested?: string,
): { binary: string; args: string[] } {
  const override = requested?.trim();
  if (override) {
    if (!isAbsolute(override)) {
      throw new Error("Terminal session shell must be an absolute path");
    }
    if (platform === "win32") {
      return {
        binary: override,
        args: /powershell/iu.test(override) ? ["-NoLogo"] : [],
      };
    }
    return { binary: override, args: ["-il"] };
  }

  if (platform === "win32") {
    const command = env.COMSPEC?.trim();
    if (command) {
      return { binary: command, args: [] };
    }
    return { binary: "powershell.exe", args: ["-NoLogo"] };
  }

  const command = env.SHELL?.trim();
  if (command) {
    return { binary: command, args: ["-il"] };
  }
  return { binary: "bash", args: ["-il"] };
}

export function inheritSessionEnvironment(
  overrides: NodeJS.ProcessEnv = {},
  parent: NodeJS.ProcessEnv = process.env,
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
