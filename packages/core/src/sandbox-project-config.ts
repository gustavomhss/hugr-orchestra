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
 */
export const protectedPaths = Effect.fn("SandboxProjectConfig.protectedPaths")(function* (
  fs: FSUtil.Interface,
  starts: ReadonlyArray<string>,
) {
  const directories = [...new Set(starts.flatMap(ancestors))]
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
