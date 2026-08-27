#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(scriptPath), "..");
const releaseDir = path.join(root, ".release");
const tarballDir = path.join(releaseDir, "tarballs");
const planPath = path.join(releaseDir, "release-plan.json");
const manifestPath = path.join(releaseDir, "release-manifest.json");
const packageName = "@lapismd/terminal-host";
const repository = "lapismd/terminal-host";
const defaultRegistry = "https://registry.npmjs.org";

const args = process.argv.slice(2);
const command = args[0] ?? "help";

function optionValue(name, fallback) {
  const index = args.indexOf(name);
  if (index >= 0 && args[index + 1]) return args[index + 1];
  return fallback;
}

const registry = optionValue(
  "--registry",
  process.env.NPM_CONFIG_REGISTRY ?? defaultRegistry,
);

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function run(commandName, commandArgs, options = {}) {
  return execFileSync(commandName, commandArgs, {
    cwd: options.cwd ?? root,
    env: { ...process.env, ...(options.env ?? {}) },
    encoding: options.encoding ?? "utf8",
    stdio: options.stdio ?? "pipe",
  });
}

function runInherited(commandName, commandArgs, options = {}) {
  execFileSync(commandName, commandArgs, {
    cwd: options.cwd ?? root,
    env: { ...process.env, ...(options.env ?? {}) },
    stdio: "inherit",
  });
}

function currentCommit() {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  try {
    return run("git", ["rev-parse", "HEAD"]).trim();
  } catch {
    return null;
  }
}

function packageJson() {
  return readJson(path.join(root, "package.json"));
}

function npmViewVersions(name) {
  const result = spawnSync(
    "npm",
    [
      "view",
      name,
      "versions",
      "--json",
      "--prefer-online",
      `--registry=${registry}`,
    ],
    { cwd: root, encoding: "utf8" },
  );
  if (result.status === 0) {
    const text = result.stdout.trim();
    if (!text) return [];
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [parsed];
  }
  const combined = `${result.stdout}\n${result.stderr}`;
  if (combined.includes("E404") || combined.includes("Not Found")) return null;
  throw new Error(combined.trim() || `npm view failed for ${name}`);
}

function packageTagName(name, version) {
  return `${name.replace(/^@lapismd\//, "")}@${version}`;
}

function selectedPackage(pkg) {
  return {
    name: pkg.name,
    version: pkg.version,
    packageDir: ".",
    tagName: packageTagName(pkg.name, pkg.version),
    releaseName: `${pkg.name} v${pkg.version}`,
  };
}

function createPlan() {
  const pkg = packageJson();
  if (pkg.name !== packageName) {
    throw new Error(`Expected ${packageName}, found ${pkg.name}`);
  }
  const versions = npmViewVersions(pkg.name);
  const packagePublished = versions !== null && versions.length > 0;
  const versionPublished = packagePublished && versions.includes(pkg.version);
  const selected = versionPublished ? [] : [selectedPackage(pkg)];
  const plan = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    registry,
    repository,
    bootstrapRequired: selected.length > 0 && !packagePublished,
    selected,
    publishedVersions: versions ?? [],
  };
  writeJson(planPath, plan);
  if (selected.length === 0) {
    console.log(`${pkg.name}@${pkg.version} is already published.`);
  } else if (plan.bootstrapRequired) {
    console.log(
      `${pkg.name}@${pkg.version} is unpublished and the package is not registered yet; manual bootstrap publish is required.`,
    );
  } else {
    console.log(`${pkg.name}@${pkg.version} is unpublished and can use OIDC.`);
  }
  return plan;
}

function parsePackOutput(output) {
  const text = output.trim();
  if (text) {
    const starts = [text.indexOf("["), text.indexOf("{")]
      .filter((index) => index >= 0)
      .sort((a, b) => a - b);
    if (starts.length > 0) {
      const parsed = JSON.parse(text.slice(starts[0]));
      const rows = Array.isArray(parsed) ? parsed : [parsed];
      const first = rows[0];
      const tarball =
        first?.filename ??
        first?.path ??
        first?.tarball ??
        first?.files?.find?.((entry) => entry.name?.endsWith?.(".tgz"))?.name;
      if (tarball) {
        const resolved = path.isAbsolute(tarball)
          ? tarball
          : path.resolve(root, tarball);
        if (existsSync(resolved)) return resolved;
        const inTarballDir = path.resolve(tarballDir, tarball);
        if (existsSync(inTarballDir)) return inTarballDir;
        return resolved;
      }
    }
  }
  const candidates = run("find", [
    tarballDir,
    "-maxdepth",
    "1",
    "-name",
    "*.tgz",
  ])
    .trim()
    .split("\n")
    .filter(Boolean);
  if (candidates.length !== 1) {
    throw new Error(
      `Expected exactly one packed tarball, found ${candidates.length}`,
    );
  }
  return path.resolve(candidates[0]);
}

function tarList(tarballPath) {
  return run("tar", ["-tf", tarballPath]).trim().split("\n").filter(Boolean);
}

function tarPackageJson(tarballPath) {
  const jsonText = run("tar", ["-xOf", tarballPath, "package/package.json"]);
  return { text: jsonText, json: JSON.parse(jsonText) };
}

function assertNoPortableManifestViolations(tarballPath) {
  const entries = tarList(tarballPath);
  const forbiddenEntries = [
    "package/.changeset/",
    "package/.github/",
    "package/.release/",
    "package/spec/book/",
    "package/node_modules/",
    "package/scripts/",
    "package/tests/",
    "package/tmp/",
    "package/AGENTS.md",
    "package/AGENTS.override.md",
  ];
  for (const entry of entries) {
    if (entry.includes("/.npm/_npx/")) {
      throw new Error(
        `Tarball contains nested package-manager cache: ${entry}`,
      );
    }
    if (
      entry.includes("/Library/Caches/") ||
      entry.includes("/__pycache__/") ||
      entry.endsWith(".pyc")
    ) {
      throw new Error(`Tarball contains local cache artifact: ${entry}`);
    }
    if (/\.test\.[cm]?[jt]sx?$/.test(entry)) {
      throw new Error(`Tarball contains test source: ${entry}`);
    }
    const forbidden = forbiddenEntries.find((prefix) =>
      entry.startsWith(prefix),
    );
    if (forbidden) {
      throw new Error(`Tarball contains forbidden release file: ${entry}`);
    }
  }
  for (const required of [
    "package/package.json",
    "package/README.md",
    "package/CHANGELOG.md",
    "package/LICENSE.md",
    "package/bin/lapis-terminal-host.mjs",
    "package/dist/index.js",
    "package/dist/deno.js",
    "package/dist/cli.js",
    "package/dist/client.js",
    "package/src/index.ts",
    "package/src/client.ts",
    "package/src/deno.ts",
    "package/src/cli.ts",
    "package/src/serve.ts",
    "package/src/deno-pty.ts",
    "package/src/native-library.ts",
    "package/native-artifacts.json",
    "package/deno.lock",
    "package/spec/src/architecture.md",
  ]) {
    if (!entries.includes(required)) {
      throw new Error(`Tarball is missing ${required}`);
    }
  }

  const { text, json } = tarPackageJson(tarballPath);
  if (json.name !== packageName) {
    throw new Error(`Packed manifest has wrong name: ${json.name}`);
  }
  if (json.private) {
    throw new Error("Packed manifest must not be private");
  }
  if (
    json.repository?.url !== "git+https://github.com/lapismd/terminal-host.git"
  ) {
    throw new Error(
      `Packed manifest has wrong repository URL: ${json.repository?.url}`,
    );
  }
  if (
    json.publishConfig?.access !== "public" ||
    json.publishConfig?.registry !== defaultRegistry
  ) {
    throw new Error("Packed manifest must publish publicly to npm");
  }
  if (json.main !== "./dist/index.js") {
    throw new Error("main must point at the built root entrypoint");
  }
  if (json.exports?.["."]?.deno !== "./dist/index.js") {
    throw new Error("root export must expose the built Deno entrypoint");
  }
  if (json.exports?.["./client"]?.import !== "./dist/client.js") {
    throw new Error("./client export must import from the browser bundle");
  }
  if (json.exports?.["./deno"]?.deno !== "./dist/deno.js") {
    throw new Error("./deno export must expose the built Deno entrypoint");
  }
  const dependencySections = [
    "dependencies",
    "devDependencies",
    "peerDependencies",
    "optionalDependencies",
  ];
  for (const section of dependencySections) {
    for (const [name, spec] of Object.entries(json[section] ?? {})) {
      if (
        typeof spec === "string" &&
        /^(?:link:|file:|workspace:)/.test(spec)
      ) {
        throw new Error(
          `Packed manifest ${section}.${name} contains non-portable ${spec}`,
        );
      }
    }
  }
  if (/\/Users\/|\/tmp\/|C:\\\\/.test(text)) {
    throw new Error("Packed manifest contains a machine-local path");
  }
}

function sha(filePath, algorithm) {
  return createHash(algorithm).update(readFileSync(filePath)).digest("hex");
}

function packTarball() {
  rmSync(tarballDir, { recursive: true, force: true });
  mkdirSync(tarballDir, { recursive: true });
  runInherited("pnpm", ["build"]);
  const output = run("pnpm", [
    "pack",
    "--pack-destination",
    tarballDir,
    "--json",
  ]);
  const tarballPath = parsePackOutput(output);
  assertNoPortableManifestViolations(tarballPath);
  return tarballPath;
}

function verifyTarballConsumer(tarballPath) {
  const tmp = mkdtempSync(path.join(tmpdir(), "terminal-host-pack-"));
  try {
    runInherited("npm", ["init", "--yes"], { cwd: tmp });
    runInherited(
      "npm",
      [
        "install",
        "--ignore-scripts",
        "--package-lock=true",
        "--registry",
        registry,
        tarballPath,
      ],
      { cwd: tmp },
    );
    const installedRoot = path.join(
      tmp,
      "node_modules",
      "@lapismd",
      "terminal-host",
    );
    const installed = readJson(path.join(installedRoot, "package.json"));
    const expected = packageJson();
    if (installed.version !== expected.version) {
      throw new Error(
        `Clean consumer installed ${installed.version}; expected ${expected.version}`,
      );
    }
    runInherited(
      "node",
      [
        "--input-type=module",
        "-e",
        [
          "await import('@lapismd/terminal-host/client');",
          "console.log('terminal-host client import ok');",
        ].join("\n"),
      ],
      { cwd: tmp },
    );
    runInherited(
      "deno",
      [
        "check",
        path.join(installedRoot, "dist/index.js"),
        path.join(installedRoot, "dist/deno.js"),
        path.join(installedRoot, "dist/cli.js"),
        path.join(installedRoot, "src/client.ts"),
        path.join(installedRoot, "src/deno.ts"),
        path.join(installedRoot, "src/cli.ts"),
      ],
      { cwd: tmp },
    );
    const help = run(
      "deno",
      [
        "run",
        "-A",
        path.join(installedRoot, "bin/lapis-terminal-host.mjs"),
        "--help",
      ],
      { cwd: tmp },
    );
    if (!help.includes("Usage: lapis-terminal-host serve [options]")) {
      throw new Error(
        "Published CLI help output did not match the expected usage text",
      );
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function prepare({ consumerInstall = false } = {}) {
  const plan = existsSync(planPath) ? readJson(planPath) : createPlan();
  if (plan.selected.length === 0) {
    writeJson(manifestPath, {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      registry,
      repository,
      bootstrapRequired: false,
      packages: [],
    });
    console.log("No unpublished Terminal Host package version selected.");
    return readJson(manifestPath);
  }
  const tarballPath = packTarball();
  if (consumerInstall) verifyTarballConsumer(tarballPath);
  const pkg = packageJson();
  const packageEntry = {
    ...selectedPackage(pkg),
    tarball: path.relative(releaseDir, tarballPath).replace(/\\/g, "/"),
    sha256: sha(tarballPath, "sha256"),
    sha512: sha(tarballPath, "sha512"),
  };
  const manifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    registry,
    repository,
    commit: currentCommit(),
    bootstrapRequired: plan.bootstrapRequired,
    packages: [packageEntry],
  };
  writeJson(manifestPath, manifest);
  console.log(
    `Prepared ${packageEntry.name}@${packageEntry.version}: ${packageEntry.tarball}`,
  );
  return manifest;
}

function checkReleaseConfig() {
  const pkg = packageJson();
  const changesetConfig = readJson(
    path.join(root, ".changeset", "config.json"),
  );
  const releaseWorkflow = readFileSync(
    path.join(root, ".github", "workflows", "release.yml"),
    "utf8",
  );
  if (
    pkg.name !== packageName ||
    !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z-.]+)?$/.test(pkg.version) ||
    pkg.version === "0.0.0"
  ) {
    throw new Error(
      "package.json must prepare a non-placeholder @lapismd/terminal-host semver version",
    );
  }
  if (pkg.private) {
    throw new Error("package.json must not be private");
  }
  if (
    pkg.repository?.url !== "git+https://github.com/lapismd/terminal-host.git"
  ) {
    throw new Error(
      "package.json repository must point at lapismd/terminal-host",
    );
  }
  if (pkg.homepage !== "https://github.com/lapismd/terminal-host#readme") {
    throw new Error("package.json homepage must point at the GitHub README");
  }
  if (pkg.main !== "./dist/index.js") {
    throw new Error("package.json main must point at dist/index.js");
  }
  if (pkg.exports?.["."]?.deno !== "./dist/index.js") {
    throw new Error("package.json root export must point at dist/index.js");
  }
  if (pkg.exports?.["./deno"]?.deno !== "./dist/deno.js") {
    throw new Error("package.json ./deno export must point at dist/deno.js");
  }
  for (const required of [
    "bin/",
    "dist/",
    "src/**/*.ts",
    "!src/**/*.test.ts",
    "native-artifacts.json",
    "deno.lock",
    "CHANGELOG.md",
    "LICENSE.md",
  ]) {
    if (!pkg.files?.includes(required)) {
      throw new Error(`package.json files must include ${required}`);
    }
  }
  if (changesetConfig.changelog?.[1]?.repo !== repository) {
    throw new Error("Changesets changelog repo must be lapismd/terminal-host");
  }
  for (const token of [
    "changesets/action@",
    "denoland/setup-deno@",
    "deno-version: v2.9.5",
    "pnpm release:plan",
    "pnpm release:prepare",
    "pnpm release:publish",
    "pnpm release:verify",
    "pnpm release:notes",
    "npm-production",
    "id-token: write",
    "pnpm checks:release",
  ]) {
    if (!releaseWorkflow.includes(token)) {
      throw new Error(`release.yml is missing ${token}`);
    }
  }
  if (
    /NPM_BOOTSTRAP_TOKEN|npm-bootstrap|NODE_AUTH_TOKEN/.test(releaseWorkflow)
  ) {
    throw new Error("release.yml must not contain bootstrap token publishing");
  }
  console.log("Terminal Host release configuration is valid.");
}

function requireApprovedPublish() {
  if (process.env.TERMINAL_HOST_RELEASE_APPROVED !== "1") {
    throw new Error(
      "Set TERMINAL_HOST_RELEASE_APPROVED=1 to publish reviewed tarballs.",
    );
  }
}

function manifestFromArg() {
  const file = args[1] ? path.resolve(root, args[1]) : manifestPath;
  if (!existsSync(file)) throw new Error(`Missing release manifest: ${file}`);
  return { file, manifest: readJson(file) };
}

function tarballPathFromManifest(entry) {
  return path.resolve(releaseDir, entry.tarball);
}

function publish() {
  requireApprovedPublish();
  const { manifest } = manifestFromArg();
  if (manifest.bootstrapRequired) {
    throw new Error(
      "Bootstrap releases are manual; CI trusted publishing is disabled.",
    );
  }
  for (const entry of manifest.packages) {
    const versions = npmViewVersions(entry.name);
    if (versions?.includes(entry.version)) {
      console.log(
        `${entry.name}@${entry.version} is already published; skipping.`,
      );
      continue;
    }
    const tarballPath = tarballPathFromManifest(entry);
    assertNoPortableManifestViolations(tarballPath);
    runInherited("npm", [
      "publish",
      tarballPath,
      "--provenance",
      "--access",
      "public",
      "--registry",
      registry,
    ]);
  }
}

function verify() {
  const { manifest } = manifestFromArg();
  const auditPath = args[2] ? path.resolve(root, args[2]) : null;
  for (const entry of manifest.packages) {
    const versions = npmViewVersions(entry.name);
    if (!versions?.includes(entry.version)) {
      throw new Error(
        `${entry.name}@${entry.version} is not published on ${registry}`,
      );
    }
    const tmp = mkdtempSync(path.join(tmpdir(), "terminal-host-registry-"));
    try {
      runInherited("npm", ["init", "--yes"], { cwd: tmp });
      runInherited(
        "npm",
        [
          "install",
          "--ignore-scripts",
          "--package-lock=true",
          "--registry",
          registry,
          `${entry.name}@${entry.version}`,
        ],
        { cwd: tmp },
      );
      const installedRoot = path.join(
        tmp,
        "node_modules",
        "@lapismd",
        "terminal-host",
      );
      const installed = readJson(path.join(installedRoot, "package.json"));
      if (installed.version !== entry.version) {
        throw new Error(`Registry consumer installed ${installed.version}`);
      }
      runInherited(
        "node",
        [
          "--input-type=module",
          "-e",
          [
            "await import('@lapismd/terminal-host/client');",
            "console.log('terminal-host registry client import ok');",
          ].join("\n"),
        ],
        { cwd: tmp },
      );
      runInherited(
        "deno",
        [
          "check",
          path.join(installedRoot, "dist/index.js"),
          path.join(installedRoot, "dist/deno.js"),
          path.join(installedRoot, "dist/cli.js"),
          path.join(installedRoot, "src/client.ts"),
          path.join(installedRoot, "src/deno.ts"),
          path.join(installedRoot, "src/cli.ts"),
        ],
        { cwd: tmp },
      );
      const help = run(
        "deno",
        [
          "run",
          "-A",
          path.join(installedRoot, "bin/lapis-terminal-host.mjs"),
          "--help",
        ],
        { cwd: tmp },
      );
      if (!help.includes("Usage: lapis-terminal-host serve [options]")) {
        throw new Error(
          "Registry CLI help output did not match the expected usage text",
        );
      }
      if (auditPath) {
        const audit = run(
          "npm",
          ["audit", "signatures", "--json", "--include-attestations"],
          {
            cwd: tmp,
          },
        );
        mkdirSync(path.dirname(auditPath), { recursive: true });
        writeFileSync(auditPath, audit);
      }
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }
}

function changelogNotes(version) {
  const changelogPath = path.join(root, "CHANGELOG.md");
  if (!existsSync(changelogPath)) {
    return [
      `Published ${packageName}@${version}.`,
      "",
      "This release was created from the verified Terminal Host release manifest.",
    ].join("\n");
  }
  const lines = readFileSync(changelogPath, "utf8").split(/\r?\n/);
  const heading = new RegExp(
    `^##\\s+(?:\\S+\\s+)?${version.replace(/\./g, "\\.")}\\b`,
  );
  const start = lines.findIndex((line) => heading.test(line.trim()));
  if (start < 0) {
    return [
      `Published ${packageName}@${version}.`,
      "",
      "This release was created from the verified Terminal Host release manifest.",
    ].join("\n");
  }
  const end = lines.findIndex(
    (line, index) => index > start && /^##\s+/.test(line),
  );
  return lines
    .slice(start + 1, end < 0 ? lines.length : end)
    .join("\n")
    .trim();
}

function notes() {
  const { manifest } = manifestFromArg();
  for (const entry of manifest.packages) {
    const notesPath = path.join(
      mkdtempSync(path.join(tmpdir(), "terminal-host-release-notes-")),
      "notes.md",
    );
    const notesText = [
      changelogNotes(entry.version),
      "",
      "### Release verification",
      "",
      `- Package: \`${entry.name}@${entry.version}\``,
      `- npm registry: \`${manifest.registry ?? registry}\``,
      `- Tarball SHA-256: \`${entry.sha256}\``,
      `- Tarball SHA-512: \`${entry.sha512}\``,
      "- Built from the verified release artifact before publication.",
      "- Clean registry-only consumer installs are verified before release notes are created.",
      "- Built Deno entrypoints and the browser client bundle are both checked.",
    ].join("\n");
    writeFileSync(notesPath, `${notesText}\n`);
    const target = currentCommit() ?? manifest.commit ?? "main";
    const view = spawnSync("gh", ["release", "view", entry.tagName], {
      cwd: root,
      encoding: "utf8",
      env: process.env,
    });
    if (view.status === 0) {
      runInherited("gh", [
        "release",
        "edit",
        entry.tagName,
        "--title",
        entry.releaseName,
        "--notes-file",
        notesPath,
      ]);
    } else {
      runInherited("gh", [
        "release",
        "create",
        entry.tagName,
        "--target",
        target,
        "--title",
        entry.releaseName,
        "--notes-file",
        notesPath,
      ]);
    }
  }
}

switch (command) {
  case "check":
    checkReleaseConfig();
    break;
  case "plan":
    createPlan();
    break;
  case "prepare":
    prepare();
    break;
  case "pack-check":
    createPlan();
    prepare({ consumerInstall: true });
    break;
  case "publish":
    publish();
    break;
  case "verify":
    verify();
    break;
  case "notes":
    notes();
    break;
  default:
    console.log(`Usage: node scripts/terminal-host-release.mjs <command>

Commands:
  check       Validate release config and release gates
  plan        Write .release/release-plan.json from npm registry state
  prepare     Pack and validate the selected release tarball
  pack-check  Pack, validate, and install the tarball in a clean consumer
  publish     Publish reviewed tarballs with npm trusted publishing
  verify      Verify registry install and npm signatures after publish
  notes       Create or update GitHub release notes from the manifest`);
    if (command !== "help") process.exitCode = 1;
}
