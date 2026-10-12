import path from "path"
import { Effect } from "effect"
import { InstanceState } from "@/effect/instance-state"
import type * as Tool from "./tool"
import { containsPath } from "../project/instance-context"
import { FSUtil } from "@orchestra/core/fs-util"
import { physicalPath } from "@orchestra/core/util/physical-path"

type Kind = "file" | "directory"

type Options = {
  bypass?: boolean
  kind?: Kind
  /** The target's `physicalPath`, when the caller already holds it, so the check judges what it will write. */
  real?: string
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
  const real = options?.real ?? (yield* Effect.promise(() => physicalPath(lexical).catch(() => lexical)))
  const roots = yield* Effect.promise(async () => ({
    directory: await physicalPath(ins.directory).catch(() => ins.directory),
    worktree: await physicalPath(ins.worktree).catch(() => ins.worktree),
  }))
  const inside = containsPath(lexical, ins)
  if (inside && containsPath(real, { ...ins, ...roots })) return false

  // A path named outside the workspace is asked about as named, so a rule on that path keeps matching; a workspace
  // path that leaves it through a link is asked about where it really lands.
  const full = inside ? real : lexical
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

/**
 * The `edit` patterns for a target: its path as named and, when a link moves it, where it really lands, so a rule
 * written for either path applies and a deny on either wins.
 */
export async function editPatterns(worktree: string, target: string, real: string) {
  const named = path.relative(worktree, target)
  const landed = path.relative(await physicalPath(worktree).catch(() => worktree), real)
  return named === landed ? [named] : [named, landed]
}

export async function assertExternalDirectory(ctx: Tool.Context, target?: string, options?: Options) {
  return Effect.runPromise(assertExternalDirectoryEffect(ctx, target, options))
}
