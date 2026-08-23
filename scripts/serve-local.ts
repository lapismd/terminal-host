import { resolve } from "jsr:@std/path@1.1.6";
import { generateToken } from "../src/token.ts";

const envPath = resolve(Deno.cwd(), ".env");
const key = "LAPIS_TERMINAL_HOST_TOKEN";
let token = Deno.env.get(key)?.trim() ?? "";
let existing = "";
try {
  existing = await Deno.readTextFile(envPath);
  const match = existing.match(/^LAPIS_TERMINAL_HOST_TOKEN=(.*)$/mu);
  if (!token && match?.[1]?.trim()) token = match[1].trim();
} catch (error) {
  if (!(error instanceof Deno.errors.NotFound)) throw error;
}
if (!token) {
  token = generateToken();
  if (!existing.includes(`${key}=`)) {
    const separator = existing.length && !existing.endsWith("\n") ? "\n" : "";
    await Deno.writeTextFile(envPath, `${existing}${separator}${key}=${token}\n`);
  }
}
const command = new Deno.Command(Deno.execPath(), {
  args: ["run", "-A", resolve("src/cli.ts"), "serve", "--token", token, ...Deno.args],
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
});
Deno.exit((await command.spawn().status).code);
