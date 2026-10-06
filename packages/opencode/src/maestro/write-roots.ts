export * as WriteRoots from "./write-roots"

import path from "node:path"
import { Effect, FileSystem } from "effect"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { ToolSafety } from "@opencode-ai/core/tool-safety"
import { InstanceState } from "@/effect/instance-state"
import type { Session } from "@/session/session"

// The backend seat's write scope is bound by the host at Task dispatch (F2.14) and enforced by ToolSafety, never by the
// charter. It is stored as reserved rules in the child Session's permission ruleset, so it is durable, travels through
// governed and authorized reservation snapshots unchanged, and no tool permission ever matches it.
const PERMISSION = "tool_safety_write_root"

type Rule = { readonly permission: string; readonly pattern: string; readonly action: "allow" | "deny" | "ask" }

/**
 * Append the backend seat's write-root rules to a child ruleset. Other members ignore `writePaths`. For the backend
 * seat an absent or empty list binds a read-only child. Paths are worktree-relative files or directories, stored as
 * canonical absolute paths after validation.
 */
export const bind = Effect.fn("WriteRoots.bind")(function* <T extends Rule>(
  memberID: string,
  writePaths: ReadonlyArray<string> | undefined,
  permission: ReadonlyArray<T>,
) {
  if (memberID !== "backend") return [...permission]
  const roots = yield* validate(writePaths ?? [])
  return [
    ...permission.filter((rule) => rule.permission !== PERMISSION),
    { permission: PERMISSION, pattern: "*", action: "deny" as const },
    ...roots.map((root) => ({ permission: PERMISSION, pattern: root, action: "allow" as const })),
  ]
})

/** Bound write roots of a Session, or undefined when the host bound none (direct use and other members). */
export function read(permission: ReadonlyArray<Rule> | undefined) {
  if (!permission?.some((rule) => rule.permission === PERMISSION)) return undefined
  return permission.filter((rule) => rule.permission === PERMISSION && rule.action === "allow").map((rule) => rule.pattern)
}

/** A plain resume of a backend child adopts the write roots of the dispatch that resumes it. */
export const rebind = Effect.fn("WriteRoots.rebind")(function* (
  sessions: Session.Interface,
  resumed: Session.Info | undefined,
  permission: ReadonlyArray<Rule>,
) {
  const roots = read(permission)
  if (!resumed || !roots || JSON.stringify(read(resumed.permission)) === JSON.stringify(roots)) return
  yield* sessions.setPermission({
    sessionID: resumed.id,
    permission: [
      ...(resumed.permission ?? []).filter((rule) => rule.permission !== PERMISSION),
      ...permission.filter((rule) => rule.permission === PERMISSION),
    ],
  })
})

/** Wrap a Session's project profile loader with its bound write roots; unbound Sessions keep the loader unchanged. */
export function loader(
  load: () => Effect.Effect<ToolSafety.Profile | undefined, ToolSafety.Denied>,
  session: { readonly directory: string; readonly permission?: ReadonlyArray<Rule> },
) {
  const roots = read(session.permission)
  if (!roots) return load
  return () => load().pipe(Effect.map((project) => profile(project, roots, session.directory)))
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

/** Host fact for the work result: the roots ToolSafety enforces for the child, worktree-relative ("." is the root). */
export const effective = Effect.fn("WriteRoots.effective")(function* (permission: ReadonlyArray<Rule> | undefined) {
  const roots = read(permission)
  if (!roots) return undefined
  const instance = yield* InstanceState.context
  const load = yield* ToolSafety.RuntimeProfileLoader
  const project = load ? yield* load() : yield* ToolSafety.RuntimeProfile
  const worktree = instance.worktree === "/" ? instance.directory : instance.worktree
  return intersect(project?.writeRoots, roots, instance.directory).map(
    (root) => path.relative(worktree, path.resolve(instance.directory, root)).replaceAll("\\", "/") || ".",
  )
})

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

const validate = Effect.fn("WriteRoots.validate")(function* (writePaths: ReadonlyArray<string>) {
  const fs = yield* FileSystem.FileSystem
  const instance = yield* InstanceState.context
  const worktree = yield* fs
    .realPath(instance.worktree === "/" ? instance.directory : instance.worktree)
    .pipe(Effect.mapError(() => new Error("Task denied: write-path-worktree-unavailable")))
  const roots = yield* Effect.forEach(writePaths, (entry) =>
    Effect.gen(function* () {
      const reason = lexical(entry)
      if (reason) return yield* Effect.fail(new Error(`Task denied: ${reason}: ${JSON.stringify(entry)}`))
      const physical = yield* canonical(fs, path.resolve(worktree, entry))
      if (!FSUtil.contains(worktree, physical))
        return yield* Effect.fail(new Error(`Task denied: write-path-symlink-escape: ${JSON.stringify(entry)}`))
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
const canonical = (fs: FileSystem.FileSystem, target: string): Effect.Effect<string, Error> =>
  fs.realPath(target).pipe(
    Effect.catchReason("PlatformError", "NotFound", () =>
      path.dirname(target) === target
        ? Effect.fail(new Error("Task denied: write-path-acquisition"))
        : canonical(fs, path.dirname(target)).pipe(Effect.map((parent) => path.join(parent, path.basename(target)))),
    ),
    Effect.mapError((error) => (error instanceof Error && error.message.startsWith("Task denied") ? error : new Error("Task denied: write-path-acquisition"))),
  )
