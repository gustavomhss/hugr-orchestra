export * as SandboxParents from "./sandbox-parents"

import path from "node:path"
import { lstat } from "node:fs/promises"
import { lstatSync, mkdirSync, realpathSync, rmdirSync } from "node:fs"
import { Effect, Exit, Result } from "effect"
import { FSUtil } from "./fs-util"
import { ToolSafety } from "./tool-safety"

/** Plan every root before touching the worktree. Existing bytes and directory modes are never changed. */
export const plan = Effect.fn("SandboxParents.plan")(function* (
  fs: FSUtil.Interface,
  directory: string,
  roots: readonly string[],
  forbidden: readonly string[],
) {
  const plans = yield* Effect.forEach(roots, (root) => Effect.gen(function* () {
    if (/[*?\[\]\0]/.test(root)) return yield* new ToolSafety.Denied({ reason: "sandbox-parent-path-ambiguous" })
    if (forbidden.some((entry) => FSUtil.contains(entry, root)))
      return yield* new ToolSafety.Denied({ reason: "sandbox-parent-protected-path" })
    const physical = yield* fs.realPath(root).pipe(
      Effect.catchReason("PlatformError", "NotFound", () => Effect.succeed(undefined)),
      Effect.mapError(() => new ToolSafety.Denied({ reason: "sandbox-parent-path-acquisition" })),
    )
    if (physical !== undefined) {
      if (forbidden.some((entry) => FSUtil.contains(entry, physical)))
        return yield* new ToolSafety.Denied({ reason: "sandbox-parent-protected-path" })
      return []
    }
    if (!FSUtil.contains(directory, root)) return yield* new ToolSafety.Denied({ reason: "sandbox-parent-outside-native-placement" })
    const components = path.relative(directory, root).split(path.sep)
    const targets = components.map((_, index) => path.join(directory, ...components.slice(0, index + 1)))
    // Include the leaf in validation, but never infer whether a missing leaf is a file or a directory.
    return yield* Effect.forEach(targets, (target, index) => Effect.gen(function* () {
      if (forbidden.some((entry) => FSUtil.contains(entry, target)))
        return yield* new ToolSafety.Denied({ reason: "sandbox-parent-protected-path" })
      const info = yield* stat(target)
      if (info?.isSymbolicLink()) return yield* new ToolSafety.Denied({ reason: "sandbox-parent-symlink-denied" })
      if (info && !info.isDirectory() && index < targets.length - 1)
        return yield* new ToolSafety.Denied({ reason: "sandbox-parent-not-directory" })
      return !info && index < targets.length - 1 ? [target] : []
    })).pipe(Effect.map((entries) => entries.flat()))
  }))
  return [...new Set(plans.flat())]
})

/** Exclusive component mkdir, then physical revalidation. This does not defeat hostile external host rewrites. */
export const prepare = Effect.fn("SandboxParents.prepare")(function* (
  fs: FSUtil.Interface,
  directory: string,
  targets: readonly string[],
) {
  const created: { path: string; dev: number; ino: number }[] = []
  return yield* Effect.gen(function* () {
    yield* Effect.forEach(targets, (target) => Effect.gen(function* () {
      if ((yield* fs.realPath(path.dirname(target)).pipe(
        Effect.mapError(() => new ToolSafety.Denied({ reason: "sandbox-parent-placement-acquisition" })),
      )) !== path.dirname(target)) return yield* new ToolSafety.Denied({ reason: "sandbox-parent-placement-changed" })
      // Register identity synchronously with exclusive mkdir, so interruption cannot lose the cleanup record.
      const info = yield* Effect.try({
        try: () => {
          mkdirSync(target, { mode: 0o755 })
          const info = lstatSync(target)
          created.push({ path: target, dev: info.dev, ino: info.ino })
          return info
        },
        catch: () => new ToolSafety.Denied({ reason: "sandbox-parent-exclusive-mkdir" }),
      })
      const physical = yield* fs.realPath(target).pipe(
        Effect.mapError(() => new ToolSafety.Denied({ reason: "sandbox-parent-placement-acquisition" })),
      )
      if (!info.isDirectory() || info.isSymbolicLink() || physical !== target || !FSUtil.contains(directory, physical))
        return yield* new ToolSafety.Denied({ reason: "sandbox-parent-placement-changed" })
    }), { discard: true })
    yield* Effect.forEach(targets, (target) => Effect.gen(function* () {
      const physical = yield* fs.realPath(target).pipe(
        Effect.mapError(() => new ToolSafety.Denied({ reason: "sandbox-parent-placement-acquisition" })),
      )
      if (physical !== target) return yield* new ToolSafety.Denied({ reason: "sandbox-parent-placement-changed" })
    }), { discard: true })
  }).pipe(Effect.onExit((exit) => Exit.isSuccess(exit) ? Effect.void : Effect.sync(() => {
    // Nonrecursive rmdir refuses unfamiliar bytes. Changed identities or redirected ancestors are left alone.
    // Synchronous cleanup also runs on interruption with this Effect version.
    created.toReversed().forEach((entry) => Result.try(() => {
      const info = lstatSync(entry.path)
      if (!info.isDirectory() || info.isSymbolicLink() || info.dev !== entry.dev || info.ino !== entry.ino ||
        realpathSync(path.dirname(entry.path)) !== path.dirname(entry.path) || realpathSync(entry.path) !== entry.path)
        return
      rmdirSync(entry.path)
    }))
  })))
})

const stat = (target: string) => Effect.tryPromise({
  try: () => lstat(target).catch((error: unknown) => {
    if (error !== null && typeof error === "object" && "code" in error && error.code === "ENOENT") return undefined
    throw error
  }),
  catch: () => new ToolSafety.Denied({ reason: "sandbox-parent-stat-acquisition" }),
})
