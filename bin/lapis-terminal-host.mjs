#!/usr/bin/env -S deno run -A
import { runCli } from "../dist/cli.js";

const code = await runCli(Deno.args);
if (code !== 0) Deno.exit(code);
