import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";

const envPath = resolve(process.cwd(), ".env");
const key = "LAPIS_TERMINAL_HOST_TOKEN";
let token = process.env[key]?.trim() ?? "";

if (existsSync(envPath)) {
  const existing = readFileSync(envPath, "utf8");
  const match = existing.match(/^LAPIS_TERMINAL_HOST_TOKEN=(.*)$/m);
  if (!token && match?.[1]?.trim()) token = match[1].trim();
}

if (!token) {
  token = randomBytes(32).toString("base64url");
  const prefix = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
  const next = prefix.includes(`${key}=`)
    ? prefix
    : `${prefix}${prefix.endsWith("\n") || prefix.length === 0 ? "" : "\n"}${key}=${token}\n`;
  writeFileSync(envPath, next);
}

const child = spawn(
  process.execPath,
  [resolve("bin/lapis-terminal-host.mjs"), "serve", "--token", token, ...process.argv.slice(2)],
  { stdio: "inherit" },
);
child.on("exit", (code) => process.exit(code ?? 1));
