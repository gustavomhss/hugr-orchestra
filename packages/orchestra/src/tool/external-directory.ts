import path from "path"
import { Effect } from "effect"
import { InstanceState } from "@/effect/instance-state"
import type * as Tool from "./tool"
import { containsPath } from "../project/instance-context"
import { FSUtil } from "@orchestra/core/fs-util"
import { physicalPath } from "@/util/physical-path"

type Kind = "file" | "directory"

type Options = {
  bypass?: boolean
  kind?: Kind
}

export const assertExternalDirectoryEffect = Effect.fn("Tool.assertExternalDirectory")(function* (
  ctx: Tool.Context,
  target?: string,
  options?: Options,
) {
  if (!target) return false

  if (options?.bypass) return false

  const ins = yield* InstanceState.context
  const lexical = process.platform === "win32" ? FSUtil.normalizePath(target) : target
  // Symlinks and junctions decide where the path really lands, so containment is judged on the real locations.
  // A path that cannot be resolved cannot be written through either, so it falls back to its lexical form.
  const real = yield* Effect.promise(() => physicalPath(lexical).catch(() => lexical))
  const roots = yield* Effect.promise(async () => ({
    directory: await physicalPath(ins.directory).catch(() => ins.directory),
    worktree: await physicalPath(ins.worktree).catch(() => ins.worktree),
  }))
  if (containsPath(lexical, ins) && containsPath(real, { ...ins, ...roots })) return false

  const full = real
  const kind = options?.kind ?? "file"
  const dir = kind === "directory" ? full : path.dirname(full)
  const glob =
    process.platform === "win32"
      ? FSUtil.normalizePathPattern(path.join(dir, "*"))
      : path.join(dir, "*").replaceAll("\\", "/")

  yield* ctx.ask({
    permission: "external_directory",
    patterns: [glob],
    always: [glob],
    metadata: {
      filepath: full,
      parentDir: dir,
    },
  })
  return true
})

export async function assertExternalDirectory(ctx: Tool.Context, target?: string, options?: Options) {
  return Effect.runPromise(assertExternalDirectoryEffect(ctx, target, options))
}
