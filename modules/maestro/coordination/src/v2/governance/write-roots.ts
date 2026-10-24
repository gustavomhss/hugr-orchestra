export * as WriteRootsV2 from "./write-roots"

import path from "node:path"
import { ToolFailure } from "@orchestra/llm"
import { Effect, Layer, Schema } from "effect"
import { FSUtil } from "@orchestra/core/fs-util"
import { Location } from "@orchestra/core/location"
import type { PermissionV2 } from "@orchestra/core/permission"
import { SessionSchema, SessionStore } from "@orchestra/core/session"
import { ToolSafety } from "@orchestra/core/tool-safety"
import { ArsenalNative } from "../../arsenal-native"

// A write-roots seat's scope is bound by the host at Task dispatch and enforced by ToolSafety, never by the charter. It
// is stored as reserved rules in the child Session's permission ruleset, so it is durable and no tool permission ever
// matches it. Only the host writes these rules.
export const PERMISSION = "tool_safety_write_root"

export const Param = Schema.optional(Schema.Array(Schema.String)).annotate({
  description:
    "Worktree-relative files or directories a write-roots seat may write; the host enforces them. Absent or empty: that seat is read-only. Ignored for agents without this capability.",
})

/**
 * The child's ruleset for a write-roots seat: its recorded rules without reserved ones, then the dispatch's reserved
 * rules. An absent or empty list binds a read-only child. Paths are worktree-relative files or directories, stored as
 * canonical absolute paths after lexical and physical validation.
 */
export const bind = Effect.fn("WriteRootsV2.bind")(function* (
  fs: FSUtil.Interface,
  location: Location.Interface,
  writePaths: ReadonlyArray<string> | undefined,
  recorded: PermissionV2.Ruleset,
) {
  return [...recorded.filter((rule) => rule.action !== PERMISSION), ...reserved(yield* validate(fs, location, writePaths ?? []))]
})

/** Bound write roots of a Session, or undefined when the host bound none. */
export function read(permission: PermissionV2.Ruleset | undefined) {
  if (!permission?.some((rule) => rule.action === PERMISSION)) return undefined
  return permission.filter((rule) => rule.action === PERMISSION && rule.effect === "allow").map((rule) => rule.resource)
}

/**
 * The child's profile: the project profile with write roots narrowed to the bound roots, and every shell command
 * confined by the platform sandbox with a per-command scratch TMPDIR. Where this host has no sandbox yet, shell
 * commands run without the jail and the host fact says so; edit tools enforce the roots everywhere.
 */
export function profile(project: ToolSafety.Profile | undefined, roots: ReadonlyArray<string>, directory: string) {
  return {
    ...project,
    writeRoots: intersect(project?.writeRoots, roots, directory),
    requireSandbox: true,
    sandbox: { ...project?.sandbox, enabled: true, scratch: true, unconfinedFallback: true },
  } satisfies ToolSafety.Profile
}

/**
 * The Location's ToolSafety, over the Arsenal's native one, narrowed to the write roots bound to the calling Session.
 * The Session's rules are read on every call, so a binding made while it runs applies to its next tool call.
 */
export const safetyNode = {
  ...ArsenalNative.nativeSafetyNode,
  implementation: Layer.effect(
    ToolSafety.Service,
    Effect.gen(function* () {
      const safety = yield* ToolSafety.Service
      const store = yield* SessionStore.Service
      const location = yield* Location.Service
      const roots = (sessionID: string) =>
        Schema.is(SessionSchema.ID)(sessionID) ? store.permissions(sessionID).pipe(Effect.map(read)) : Effect.succeed(undefined)
      return ToolSafety.Service.of({
        ...safety,
        before: (input) =>
          Effect.gen(function* () {
            const bound = yield* roots(input.sessionID)
            if (!bound) return yield* safety.before(input)
            const project = yield* ToolSafety.RuntimeProfile
            return yield* safety.before(input).pipe(
              Effect.provideService(ToolSafety.RuntimeProfile, profile(project, bound, location.directory)),
            )
          }),
        run: (input, effect, observe, outcome) =>
          Effect.gen(function* () {
            const bound = yield* roots(input.sessionID)
            if (!bound) return yield* safety.run(input, effect, observe, outcome)
            const load = yield* ToolSafety.RuntimeProfileLoader
            const fallback = yield* ToolSafety.RuntimeProfile
            return yield* safety.run(input, effect, observe, outcome).pipe(
              Effect.provideService(ToolSafety.RuntimeProfileLoader, () =>
                (load ? load() : Effect.succeed(fallback)).pipe(
                  Effect.map((project) => profile(project, bound, location.directory)),
                ),
              ),
            )
          }),
      })
    }),
  ).pipe(Layer.provide(ArsenalNative.nativeSafetyNode.implementation)),
  dependencies: [...ArsenalNative.nativeSafetyNode.dependencies, SessionStore.node, Location.node],
}

// A bound root survives only inside a project root; a project root inside a bound root narrows it.
function intersect(project: ReadonlyArray<string> | undefined, roots: ReadonlyArray<string>, directory: string) {
  if (project === undefined) return [...roots]
  return [
    ...new Set(
      roots.flatMap((root) =>
        project.flatMap((owned) => {
          if (FSUtil.contains(path.resolve(directory, owned), path.resolve(directory, root))) return [root]
          if (FSUtil.contains(path.resolve(directory, root), path.resolve(directory, owned))) return [owned]
          return []
        }),
      ),
    ),
  ]
}

function reserved(roots: ReadonlyArray<string>): PermissionV2.Ruleset {
  return [
    { action: PERMISSION, resource: "*", effect: "deny" },
    ...roots.map((root) => ({ action: PERMISSION, resource: root, effect: "allow" as const })),
  ]
}

const validate = Effect.fn("WriteRootsV2.validate")(function* (
  fs: FSUtil.Interface,
  location: Location.Interface,
  writePaths: ReadonlyArray<string>,
) {
  const worktree = yield* fs
    .realPath(location.project.directory === "/" ? location.directory : location.project.directory)
    .pipe(Effect.mapError(() => new ToolFailure({ message: "Task denied: write-path-worktree-unavailable" })))
  const roots = yield* Effect.forEach(writePaths, (entry) =>
    Effect.gen(function* () {
      const reason = lexical(entry)
      if (reason) return yield* new ToolFailure({ message: `Task denied: ${reason}: ${JSON.stringify(entry)}` })
      const physical = yield* canonical(fs, path.resolve(worktree, entry))
      if (!FSUtil.contains(worktree, physical))
        return yield* new ToolFailure({ message: `Task denied: write-path-symlink-escape: ${JSON.stringify(entry)}` })
      return physical
    }),
  )
  return [...new Set(roots)]
})

function lexical(entry: string) {
  if (entry.trim() === "" || entry.includes("\0")) return "write-path-empty"
  if (path.isAbsolute(entry) || path.win32.isAbsolute(entry) || /^[A-Za-z]:/.test(entry)) return "write-path-absolute"
  if (entry.split(/[\\/]/).includes("..")) return "write-path-escape"
}

// Resolve existing symlinks; a missing leaf resolves through its nearest existing ancestor.
const canonical = (fs: FSUtil.Interface, target: string): Effect.Effect<string, ToolFailure> =>
  fs.realPath(target).pipe(
    Effect.catchReason("PlatformError", "NotFound", () =>
      path.dirname(target) === target
        ? Effect.fail(new ToolFailure({ message: "Task denied: write-path-acquisition" }))
        : canonical(fs, path.dirname(target)).pipe(Effect.map((parent) => path.join(parent, path.basename(target)))),
    ),
    Effect.mapError((error) =>
      error instanceof ToolFailure ? error : new ToolFailure({ message: "Task denied: write-path-acquisition" }),
    ),
  )
