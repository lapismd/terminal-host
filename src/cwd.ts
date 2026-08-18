import { isAbsolute, relative, resolve } from "node:path";

export function isPathWithinRoot(root: string, candidate: string): boolean {
  const resolvedRoot = resolve(root);
  const resolvedCandidate = resolve(candidate);
  const rel = relative(resolvedRoot, resolvedCandidate);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

export function resolveSessionCwd(workspace: string, requested?: string): string {
  const root = resolve(workspace);
  const target = requested?.trim() ? resolve(root, requested) : root;
  if (!isPathWithinRoot(root, target)) {
    throw new Error("Terminal session cwd must stay inside the host workspace");
  }
  return target;
}
