#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const distRoot = path.join(packageRoot, "dist");

rmSync(distRoot, { recursive: true, force: true });
mkdirSync(distRoot, { recursive: true });

for (const [input, output] of [
  ["src/index.ts", "dist/index.js"],
  ["src/deno.ts", "dist/deno.js"],
  ["src/cli.ts", "dist/cli.js"],
]) {
  execFileSync(
    "deno",
    [
      "bundle",
      path.join(packageRoot, input),
      "-o",
      path.join(packageRoot, output),
    ],
    {
      cwd: packageRoot,
      stdio: "inherit",
    },
  );
}

await build({
  entryPoints: [path.join(packageRoot, "src/client.ts")],
  outfile: path.join(distRoot, "client.js"),
  bundle: true,
  platform: "browser",
  format: "esm",
  target: "es2022",
});

console.log(
  "[terminal-host] Deno entrypoints and browser client bundle written",
);
