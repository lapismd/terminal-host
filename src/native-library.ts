import artifacts from "../native-artifacts.json" with { type: "json" };
import { dirname, join, resolve } from "jsr:@std/path@1.1.6";

type Artifact = { file: string; sha256: string };
type ArtifactTarget = keyof typeof artifacts.targets;

export function currentPtyTarget(): ArtifactTarget {
  const key = `${Deno.build.arch}-${Deno.build.os}`;
  const targets: Record<string, ArtifactTarget> = {
    "aarch64-darwin": "aarch64-apple-darwin",
    "x86_64-darwin": "x86_64-apple-darwin",
    "aarch64-linux": "aarch64-unknown-linux-gnu",
    "x86_64-linux": "x86_64-unknown-linux-gnu",
  };
  const target = targets[key];
  if (!target) throw new Error(`Unsupported PTY target ${key}`);
  return target;
}

export function ptyArtifact(target: string): Artifact {
  const artifact = (artifacts.targets as Record<string, Artifact | undefined>)[target];
  if (!artifact) throw new Error(`Unsupported PTY target ${target}`);
  return artifact;
}

export async function verifyPtyLibrary(path: string, expected: string): Promise<void> {
  const bytes = await Deno.readFile(path);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  const actual = [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  if (actual !== expected) {
    throw new Error(`PTY library checksum mismatch: expected ${expected}, received ${actual}`);
  }
}

export async function materializePtyLibrary(
  target: string,
  destination?: string,
): Promise<string> {
  const artifact = ptyArtifact(target);
  const output = destination ? resolve(destination) : defaultCachePath(artifact.file);
  try {
    await verifyPtyLibrary(output, artifact.sha256);
    return output;
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) {
      try {
        await Deno.remove(output);
      } catch {
        // A missing or invalid cache entry is replaced below.
      }
    }
  }

  await Deno.mkdir(dirname(output), { recursive: true });
  const response = await fetch(`${artifacts.baseUrl}/${artifact.file}`);
  if (!response.ok) throw new Error(`Unable to download PTY library: HTTP ${response.status}`);
  const temporary = `${output}.${crypto.randomUUID()}.tmp`;
  await Deno.writeFile(temporary, new Uint8Array(await response.arrayBuffer()), { createNew: true });
  try {
    await verifyPtyLibrary(temporary, artifact.sha256);
    await Deno.rename(temporary, output);
  } catch (error) {
    await Deno.remove(temporary).catch(() => {});
    throw error;
  }
  return output;
}

function defaultCachePath(file: string): string {
  const home = Deno.env.get("HOME") ?? Deno.cwd();
  const root = Deno.build.os === "darwin"
    ? join(home, "Library", "Caches")
    : Deno.env.get("XDG_CACHE_HOME") ?? join(home, ".cache");
  return join(root, "lapis-terminal-host", "pty-ffi", artifacts.version, file);
}
