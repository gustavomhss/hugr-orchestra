export * as WriteRootsV2 from "./write-roots"

import path from "node:path"
import { ToolFailure } from "@orchestra/llm"
import { Effect, Layer, Schema } from "effect"
import { Database } from "@orchestra/core/database/database"
import { EventV2 } from "@orchestra/core/event"
import { FSUtil } from "@orchestra/core/fs-util"
import { Location } from "@orchestra/core/location"
import type { PermissionV2 } from "@orchestra/core/permission"
import { ResearchAllowance } from "@orchestra/core/research/allowance"
import { SessionSchema, SessionStore } from "@orchestra/core/session"
import { ToolSafety } from "@orchestra/core/tool-safety"
import { BackendToolkit } from "@orchestra/core/backend-toolkit"
import { TRUNCATION_DIR } from "@orchestra/core/tool/truncation-dir"
import { AllowedDomains } from "@orchestra/core/tool/websearch"
import { ArsenalNative } from "../../arsenal-native"
import { Seats, type Seat } from "../../seats"
import { ResearchDispatchV2 } from "./research"

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
 * confined by the platform sandbox with a per-command scratch TMPDIR. A host without a sandbox refuses the command;
 * edit tools enforce the roots everywhere.
 */
export function profile(project: ToolSafety.Profile | undefined, roots: ReadonlyArray<string>, directory: string) {
  return {
    ...project,
    writeRoots: intersect(project?.writeRoots, roots, directory),
    requireSandbox: true,
    sandbox: { ...project?.sandbox, enabled: true, scratch: true, unconfinedFallback: false },
  } satisfies ToolSafety.Profile
}

/**
 * A native seat cannot ask the owner, so on macOS and Linux its commands run in the OS sandbox with reads confined to its
 * worktree (and the git directories a linked worktree keeps outside it), saved tool output, the external directories its
 * native profile grants, the backend toolkit for the toolkit seat, and the host toolchain (ToolSafetySandbox.toolchain).
 * Writes stay in its bound roots, else the project's, else the worktree. A host without a sandbox refuses the command.
 * Windows has no read sandbox, so seats there keep the bound-root profile only.
 */
export const confine = Effect.fn("WriteRootsV2.confine")(function* (
  fs: FSUtil.Interface,
  scoped: ToolSafety.Profile | undefined,
  seat: Seat,
  location: Location.Interface,
) {
  const { nativeProfiles } = yield* Effect.tryPromise(() => import("../../roster")).pipe(
    Effect.mapError(() => new ToolSafety.Denied({ reason: "seat-profile-unavailable" })),
  )
  const worktree = location.project.directory === "/" ? location.directory : location.project.directory
  const external = nativeProfiles[seat.id]?.external_directory
  const granted =
    typeof external === "object"
      ? Object.entries(external)
          .filter((rule) => rule[1] === "allow" && rule[0] !== "*")
          .map((rule) => rule[0].replace(/[\\/]\*$/, ""))
      : []
  // A linked worktree's `.git` file names its git directory, whose `commondir` names the repository's shared one.
  const text = (file: string) => fs.readFileStringSafe(file).pipe(Effect.catch(() => Effect.succeed(undefined)))
  const gitdir = (yield* text(path.join(worktree, ".git")))?.match(/^gitdir: (.+)$/m)?.[1].trim()
  const gitdirs = gitdir ? [path.resolve(worktree, gitdir)] : []
  const common = gitdirs.length ? (yield* text(path.join(gitdirs[0], "commondir")))?.trim() : undefined
  return {
    ...scoped,
    requireSandbox: true,
    writeRoots: scoped?.writeRoots ?? [worktree],
    sandbox: {
      ...scoped?.sandbox,
      enabled: true,
      scratch: true,
      unconfinedFallback: false,
      readRoots: [
        ...new Set([
          worktree,
          location.directory,
          ...gitdirs,
          ...(common ? [path.resolve(gitdirs[0], common)] : []),
          TRUNCATION_DIR,
          ...granted,
          ...(seat.toolkit ? [yield* BackendToolkit.Root] : []),
        ]),
      ],
    },
  } satisfies ToolSafety.Profile
})

/**
 * The Location's ToolSafety, over the Arsenal's native one, narrowed to the write roots bound to the calling Session and,
 * for a native seat, confined as `confine` says. The Session's rules are read on every call, so a binding made while it
 * runs applies to its next tool call. A research child's tool call is also charged to its dispatch allowance, and its
 * web search sees only the dispatch's allowed domains (V1 provided both around the child run).
 */
export const safetyNode = {
  ...ArsenalNative.nativeSafetyNode,
  implementation: Layer.effect(
    ToolSafety.Service,
    Effect.gen(function* () {
      const safety = yield* ToolSafety.Service
      const store = yield* SessionStore.Service
      const location = yield* Location.Service
      const fs = yield* FSUtil.Service
      const database = yield* Database.Service
      const events = yield* EventV2.Service
      const allowances = yield* ResearchAllowance.Service
      // The roster loads lazily (see `seats.ts`); where it cannot load no agent is the research seat.
      const roster = yield* Effect.tryPromise(() => import("../../roster")).pipe(Effect.option)
      const canonical = (id: string): string => (roster._tag === "Some" ? roster.value.canonicalMemberId(id) : id)
      const services = { db: database.db, events, store, canonical, allowances, location }
      const research = (input: ToolSafety.Invocation) =>
        Effect.gen(function* () {
          if (!Schema.is(SessionSchema.ID)(input.sessionID)) return undefined
          const session = yield* store.get(input.sessionID)
          if (!session) return undefined
          return yield* ResearchDispatchV2.tool(services, session, input)
        }).pipe(Effect.mapError((error) => new ToolSafety.Denied({ reason: "research-dispatch", detail: error.message })))
      const roots = (sessionID: string) =>
        Schema.is(SessionSchema.ID)(sessionID) ? store.permissions(sessionID).pipe(Effect.map(read)) : Effect.succeed(undefined)
      const narrow = (input: ToolSafety.Invocation, project: ToolSafety.Profile | undefined, bound: ReadonlyArray<string> | undefined) => {
        const scoped = bound ? profile(project, bound, location.directory) : project
        const seat = Seats.find(input.agent)
        if (!seat || (process.platform !== "darwin" && process.platform !== "linux")) return Effect.succeed(scoped)
        return confine(fs, scoped, seat, location)
      }
      return ToolSafety.Service.of({
        ...safety,
        before: (input) =>
          Effect.gen(function* () {
            const bound = yield* roots(input.sessionID)
            if (!bound && !Seats.find(input.agent)) return yield* safety.before(input)
            const scoped = yield* narrow(input, yield* ToolSafety.RuntimeProfile, bound)
            return yield* safety.before(input).pipe(Effect.provideService(ToolSafety.RuntimeProfile, scoped))
          }),
        run: (input, effect, observe, outcome) =>
          Effect.gen(function* () {
            const domains = (yield* research(input))?.domains
            const scoped = domains ? effect.pipe(Effect.provideService(AllowedDomains, domains)) : effect
            const bound = yield* roots(input.sessionID)
            if (!bound && !Seats.find(input.agent)) return yield* safety.run(input, scoped, observe, outcome)
            const load = yield* ToolSafety.RuntimeProfileLoader
            const fallback = yield* ToolSafety.RuntimeProfile
            return yield* safety.run(input, scoped, observe, outcome).pipe(
              Effect.provideService(ToolSafety.RuntimeProfileLoader, () =>
                (load ? load() : Effect.succeed(fallback)).pipe(Effect.flatMap((project) => narrow(input, project, bound))),
              ),
            )
          }),
      })
    }),
  ).pipe(Layer.provide(ArsenalNative.nativeSafetyNode.implementation)),
  dependencies: [
    ...ArsenalNative.nativeSafetyNode.dependencies,
    SessionStore.node,
    Location.node,
    FSUtil.node,
    Database.node,
    EventV2.node,
    ResearchAllowance.node,
  ],
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
