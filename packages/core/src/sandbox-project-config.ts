export * as SandboxProjectConfig from "./sandbox-project-config"

import path from "path"
import { Effect } from "effect"
import { FSUtil } from "./fs-util"
import { ToolSafety } from "./tool-safety"

// What Orchestra loads from a project directory and then acts on the host: `orchestra.json(c)` (LSP, formatter and MCP
// commands, plugins, permissions), `tui.json(c)` (TUI plugins) and `.orchestra` (the same files, plus plugins, tools,
// commands and agents). The config loader searches every directory from the session's up to the project root.
const names = ["orchestra.json", "orchestra.jsonc", "tui.json", "tui.jsonc", ".orchestra"]

/**
 * Policy paths a sandboxed shell command may never write, whatever the profile says: those names in each given physical
 * directory and every ancestor. A file or symlink there is covered through the link and its target. A name that does not
 * exist is returned too, because both backends deny creating it. Ancestors outside the write roots are read-only anyway.
 * A given file (a granted `src/x.ts`) also guards its own names, literally: they cannot exist while it is a file, but
 * Seatbelt's write grant on it allows replacing it with a directory. srt skips a deny path under a file (its
 * `hasFileAncestor`), and there the swap cannot happen: the granted file is its own bind mount, so unlinking it is EBUSY.
 */
export const protectedPaths = Effect.fn("SandboxProjectConfig.protectedPaths")(function* (
  fs: FSUtil.Interface,
  starts: ReadonlyArray<string>,
) {
  // realpath under a file fails with ENOTDIR (not NotFound): a file is walked from its parent, its names stay literal.
  const kinds = yield* Effect.forEach(starts, (start) => fs.stat(start).pipe(
    Effect.map((info) => ({ start, file: info.type !== "Directory" })),
    Effect.catchReason("PlatformError", "NotFound", () => Effect.succeed({ start, file: false })),
    Effect.mapError(() => new ToolSafety.Denied({ reason: "sandbox-project-config-acquisition" })),
  ))
  const directories = [...new Set(kinds.flatMap((kind) => ancestors(kind.file ? path.dirname(kind.start) : kind.start)))]
  const targets = yield* Effect.forEach(directories.flatMap((directory) => names.map((name) => path.join(directory, name))), (leaf) =>
    fs.realPath(leaf).pipe(
      Effect.catchReason("PlatformError", "NotFound", () => Effect.succeed(leaf)),
      Effect.mapError(() => new ToolSafety.Denied({ reason: "sandbox-project-config-acquisition" })),
      Effect.map((physical) => physical === leaf ? [leaf] : [leaf, physical]),
    ))
  const literal = kinds.filter((kind) => kind.file).flatMap((kind) => names.map((name) => path.join(kind.start, name)))
  return [...new Set([...targets.flat(), ...literal])]
})

function ancestors(directory: string): string[] {
  const parent = path.dirname(directory)
  return parent === directory ? [directory] : [directory, ...ancestors(parent)]
}
