export function resolveInteractiveShellCommand(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): { binary: string; args: string[] } {
  if (platform === "win32") {
    const command = env.COMSPEC?.trim();
    if (command) {
      return { binary: command, args: [] };
    }
    return { binary: "powershell.exe", args: ["-NoLogo"] };
  }

  const command = env.SHELL?.trim();
  if (command) {
    return { binary: command, args: ["-i"] };
  }
  return { binary: "bash", args: ["-i"] };
}
