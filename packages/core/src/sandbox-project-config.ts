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
 * directory (the parent of a given file) and every ancestor. A file or symlink there is covered through the link and its
 * target. A name that does not exist is returned too, because both backends deny creating it. Ancestors outside the write
 * roots are read-only anyway.
 */
export const protectedPaths = Effect.fn("SandboxProjectConfig.protectedPaths")(function* (
  fs: FSUtil.Interface,
  starts: ReadonlyArray<string>,
) {
  // A write root may be a file (a granted `src/x.ts`). Its `x.ts/orchestra.json` names cannot exist: realpath fails with
  // ENOTDIR, which is not NotFound and would refuse every command. Its directory and ancestors are the ones to protect.
  const folders = yield* Effect.forEach(starts, (start) => fs.stat(start).pipe(
    Effect.map((info) => info.type === "Directory" ? start : path.dirname(start)),
    Effect.catchReason("PlatformError", "NotFound", () => Effect.succeed(start)),
    Effect.mapError(() => new ToolSafety.Denied({ reason: "sandbox-project-config-acquisition" })),
  ))
  const directories = [...new Set(folders.flatMap(ancestors))]
  const targets = yield* Effect.forEach(directories.flatMap((directory) => names.map((name) => path.join(directory, name))), (leaf) =>
    fs.realPath(leaf).pipe(
      Effect.catchReason("PlatformError", "NotFound", () => Effect.succeed(leaf)),
      Effect.mapError(() => new ToolSafety.Denied({ reason: "sandbox-project-config-acquisition" })),
      Effect.map((physical) => physical === leaf ? [leaf] : [leaf, physical]),
    ))
  return [...new Set(targets.flat())]
})

function ancestors(directory: string): string[] {
  const parent = path.dirname(directory)
  return parent === directory ? [directory] : [directory, ...ancestors(parent)]
}
