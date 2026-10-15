// Maestro adaptation of TechLead a68e7af (Copyright 2026 HuGR Labs, Apache-2.0).
// Host authority and physical path fencing replace source-global acquisition.
import { realpath, lstat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, isAbsolute, relative, resolve, sep, join } from "node:path";
import { type ArsenalContext } from "../contract.ts";

export class AcquisitionError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(`${code}: ${message}`);
    this.code = code;
    this.name = "AcquisitionError";
  }
}

export function requireContext(context?: ArsenalContext): ArsenalContext {
  if (!context) throw new AcquisitionError("CONTEXT_REQUIRED", "host-bound ArsenalContext required");
  if (!isAbsolute(context.directory) || !isAbsolute(context.stateDirectory) || !context.projectID)
    throw new AcquisitionError("CONTEXT_INVALID", "absolute roots and project identity required");
  return context;
}

export function inside(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel === "" || (!isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`));
}

// Missing leaves still fence against their nearest existing physical ancestor.
export async function physical(path: string): Promise<string> {
  return realpath(path).catch(async (error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
    const parent = dirname(path);
    if (parent === path) throw error;
    // A dangling symlink is not a missing leaf and must not become a writable path.
    const entry = await lstat(path).catch((err: NodeJS.ErrnoException) => {
      if (err.code !== "ENOENT") throw err;
      return undefined;
    });
    if (entry?.isSymbolicLink()) throw new AcquisitionError("PATH_ESCAPE", `dangling symlink: ${path}`);
    return join(await physical(parent), relative(parent, path));
  });
}

export async function boundRoot(context: ArsenalContext, supplied?: string): Promise<string> {
  await context.authorize({ effect: "read", paths: [context.directory], commands: [] });
  const root = await realpath(context.directory);
  if (supplied !== undefined && await physical(resolve(context.directory, supplied)) !== root)
    throw new AcquisitionError("ROOT_MISMATCH", "input root must equal host-bound directory");
  return root;
}

export async function projectPath(context: ArsenalContext, path: string, effect: "read" | "write" = "read") {
  const root = await boundRoot(context);
  const candidate = resolve(root, path);
  if (!inside(root, candidate)) throw new AcquisitionError("PATH_ESCAPE", path);
  await context.authorize({ effect, paths: [candidate], commands: [] });
  const actual = await physical(candidate);
  if (!inside(root, actual)) throw new AcquisitionError("PATH_ESCAPE", path);
  await context.authorize({ effect, paths: [actual], commands: [] });
  return actual;
}

export async function statePath(context: ArsenalContext, namespace: string, effect: "read" | "write") {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(namespace)) throw new AcquisitionError("STATE_NAMESPACE", namespace);
  await context.authorize({ effect, paths: [context.stateDirectory], commands: [] });
  const root = await physical(context.stateDirectory);
  const repo = await boundRoot(context);
  if (inside(repo, root) || inside(root, repo)) throw new AcquisitionError("STATE_IN_REPOSITORY", root);
  const path = join(root, "projects", createHash("sha256").update(context.projectID).digest("hex"), namespace);
  if (!inside(root, await physical(path))) throw new AcquisitionError("STATE_ESCAPE", path);
  await context.authorize({ effect, paths: [path], commands: [] });
  return path;
}

export function safeModule(id: string): string {
  if (!/^[A-Za-z_$][A-Za-z0-9_$-]{0,79}$/.test(id) || id === "__proto__")
    throw new AcquisitionError("MODULE_INVALID", id);
  return id;
}
