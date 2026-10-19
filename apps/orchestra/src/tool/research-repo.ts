export * as ResearchRepoTools from "./research-repo"

// Read-only repository intelligence for the native discovery seat: three Maestro Arsenal acquisitions behind fixed
// schemas. The seat never names an Arsenal operation, a root outside the workspace, a command or a write. The host
// binds the root, admits only reads inside it and the fixed git/parser invocations below, refuses every write and
// stops the acquisition at a deadline. ResearchRegistry.charge charges each call to the research dispatch and retains
// its result as admitted evidence the seat can cite.
import path from "node:path"
import { Effect, Option, Schema } from "effect"
import type { ArsenalContext } from "@orchestra/maestro-arsenal"
import { FSUtil } from "@orchestra/core/fs-util"
import { Global } from "@orchestra/core/global"
import { MaestroArsenal } from "@orchestra/core/tool/maestro-arsenal"
import { ToolSafety } from "@orchestra/core/tool-safety"
import { InstanceState } from "@/effect/instance-state"
import { nativeProfiles } from "@orchestra/maestro/roster"
import { Permission } from "@/permission"
import { ResearchTools } from "@/research/binding"
import { ToolJsonSchema } from "./json-schema"
import { Tool } from "./tool"

export type Arsenal = Awaited<ReturnType<typeof MaestroArsenal.loadArsenal>>["Arsenal"]

/** Each acquisition stops at its next read or process request after this long; each process is bounded on its own. */
export const DEADLINE_MS = 120_000

// The reads repo-hygiene-check issues, each after `git --no-optional-locks -c core.fsmonitor=false -C <root>`. The host
// owns this list: an Arsenal change to its git arguments is refused here until the list says so.
const GIT_READS = [
  ["status", "--porcelain=v1", "-z"],
  ["ls-files", "-z"],
  ["grep", "-z", "-lE", "^(<<<<<<<|>>>>>>>) "],
  ["for-each-ref", "--merged=HEAD", "--format=%(refname:short)", "refs/heads"],
  ["symbolic-ref", "--short", "HEAD"],
  ["worktree", "list", "--porcelain"],
]

// Process bounds and host refusals. An acquisition that hit one is a named failure, never a partial success.
const BOUND = /\b(PROCESS_TIMEOUT|PROCESS_OUTPUT_CAP|PROCESS_LAUNCH_FAILED|REPO_[A-Z_]+)\b/

// Hygiene checks repo-hygiene-check never acquires; they are always unknown, so the seat never sees them.
const UNACQUIRED = ["no-secrets", "lockfiles-consistent", "validators-no-regress"]

export type Host = {
  /** Physical root the acquisition binds to: the workspace directory or a directory inside it. */
  readonly directory: string
  readonly stateDirectory: string
  readonly projectID: string
  /** Exact encoded invocations the acquisition may start. */
  readonly commands: ReadonlySet<string>
  /** True for a path the seat may not read (.env files, project never-touch paths). */
  readonly denied: (absolute: string) => boolean
  readonly deadline: number
  readonly signal: AbortSignal
}

/** Arsenal's own encoding of an invocation (engine/process.ts), with host-resolved executables. */
export function commands(root: string, worker: string | undefined) {
  const git = Bun.which("git")
  const node = Bun.which("node")
  const encode = (argv: string[]) => argv.map((arg) => JSON.stringify(arg)).join(" ")
  return new Set([
    ...(git ? GIT_READS.map((args) => encode([git, "--no-optional-locks", "-c", "core.fsmonitor=false", "-C", root, ...args])) : []),
    ...(node && worker ? [encode([node, "--experimental-strip-types", worker])] : []),
  ])
}

/** The seat's Arsenal authority: reads inside the root, fixed invocations, no writes, a deadline. */
export function context(arsenal: Arsenal, host: Host): ArsenalContext {
  return {
    directory: host.directory,
    stateDirectory: host.stateDirectory,
    projectID: host.projectID,
    async authorize(request) {
      if (host.signal.aborted || Date.now() > host.deadline) throw new Error("REPO_DEADLINE: acquisition stopped")
      if (request.effect === "write") throw new Error("REPO_WRITE_DENIED: the discovery seat writes nothing")
      if (!request.paths.length || request.paths.some((item) => !FSUtil.contains(host.directory, path.resolve(host.directory, item))))
        throw new Error("REPO_PATH_DENIED: outside the bound root")
      if (request.effect === "process") {
        if (!request.commands.length || request.commands.some((command) => !host.commands.has(command)))
          throw new Error("REPO_COMMAND_DENIED: not a fixed host invocation")
        return
      }
      if (request.commands.length) throw new Error("REPO_COMMAND_DENIED: a read carries no command")
      const denied = request.paths.find((item) => host.denied(path.resolve(host.directory, item)))
      if (denied !== undefined) throw new arsenal.ReadDenied(denied)
    },
  }
}

const Entry = Schema.Struct({ what: Schema.String, path: Schema.String })
const RepoMap = Schema.Struct({
  entries: Schema.Unknown, fileCount: Schema.Number, dirCount: Schema.Number, oversized: Schema.Unknown,
  oversizedThreshold: Schema.Number, coverage: Schema.Unknown, page: Schema.Unknown,
})
const SymbolMap = Schema.Struct({
  memory: Schema.Struct({
    areas: Schema.Array(Schema.String), whereThingsLive: Schema.Array(Entry),
    entryPoints: Schema.Array(Schema.String), deps: Schema.Array(Schema.String),
  }),
  stats: Schema.Unknown, coverage: Schema.Unknown, projectionOmissions: Schema.Unknown,
  parserCoverage: Schema.Array(Schema.Struct({
    path: Schema.String, complete: Schema.Boolean, reason: Schema.optional(Schema.String), detail: Schema.optional(Schema.String),
  })),
})
const GitState = Schema.Struct({
  items: Schema.Array(Schema.Struct({
    name: Schema.String, status: Schema.Literals(["pass", "fail", "unknown"]), detail: Schema.optional(Schema.String),
  })),
  failures: Schema.Array(Schema.String),
})

/** Run one acquisition under the seat's authority and keep only its observations. */
export function observe(arsenal: Arsenal, operation: "repo-mapper" | "move-in" | "repo-hygiene-check", args: Record<string, unknown>, host: Host) {
  return Effect.gen(function* () {
    const result = yield* Effect.tryPromise({
      try: () => arsenal.execute(operation, args, context(arsenal, host)),
      catch: () => failure(operation, "ARSENAL_UNAVAILABLE"),
    })
    const text = result.content[0]?.text ?? ""
    if (result.isError) return yield* failure(operation, code(text))
    const malformed = () => failure(operation, "RESULT_MALFORMED")
    const json = yield* Schema.decodeUnknownEffect(Schema.UnknownFromJsonString)(text).pipe(Effect.mapError(malformed))
    if (operation === "repo-mapper") return yield* Schema.decodeUnknownEffect(RepoMap)(json).pipe(Effect.mapError(malformed))
    if (operation === "move-in") {
      const map = yield* Schema.decodeUnknownEffect(SymbolMap)(json).pipe(Effect.mapError(malformed))
      const gaps = map.parserCoverage.filter((file) => !file.complete).map((file) => ({ path: file.path, reason: file.reason, detail: file.detail }))
      const bound = gaps.flatMap((gap) => BOUND.exec(gap.detail ?? "")?.[1] ?? [])[0]
      if (bound) return yield* failure(operation, bound)
      return { ...map.memory, omitted: map.projectionOmissions, stats: map.stats, coverage: map.coverage, parserGaps: gaps }
    }
    const state = yield* Schema.decodeUnknownEffect(GitState)(json).pipe(Effect.mapError(malformed))
    const bound = state.failures.flatMap((item) => BOUND.exec(item)?.[1] ?? [])[0]
    if (bound) return yield* failure(operation, bound)
    return { observations: state.items.filter((item) => !UNACQUIRED.includes(item.name)), failures: state.failures }
  })
}

// Arsenal fails as `{ error, message }`; a handler refusal leads with a static code, and what follows may name host paths.
function code(text: string) {
  const parsed = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Struct({ error: Schema.String, message: Schema.optional(Schema.String) })))(text)
  if (Option.isNone(parsed)) return "ARSENAL_FAILED"
  return /^[A-Z][A-Z0-9_]{2,63}(?=$|:)/.exec(parsed.value.message ?? "")?.[0] ?? parsed.value.error
}

/** A named acquisition failure: a process bound, a host refusal or an Arsenal failure code, never an empty success. */
export class AcquisitionFailed extends Schema.TaggedErrorClass<AcquisitionFailed>()("ResearchRepo.AcquisitionFailed", {
  operation: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `Repository acquisition ${this.operation} failed (${this.reason}); no observation was recorded.`
  }
}

function failure(operation: string, reason: string) {
  return new AcquisitionFailed({ operation, reason })
}

const Scope = Schema.optional(Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(1000)).annotate({
  description: "Workspace-relative directory to cover. Default: the whole workspace.",
}))
const Count = (minimum: number, maximum: number) => Schema.optional(Schema.Int.check(Schema.isGreaterThanOrEqualTo(minimum), Schema.isLessThanOrEqualTo(maximum)))
const MapInput = Schema.Struct({
  path: Scope,
  maxDepth: Count(0, 100),
  ignore: Schema.optional(Schema.Array(Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(200))).check(Schema.isMaxLength(100)).annotate({
    description: "Extra entry names to skip, in addition to .git, node_modules, dist, target and .DS_Store.",
  })),
  oversizedThreshold: Count(0, 1_000_000),
  offset: Count(0, 10_000),
  limit: Count(1, 500),
})
const SymbolsInput = Schema.Struct({ path: Scope })
const GitInput = Schema.Struct({})

export const RepoMapTool = define("repo_map", "repo-mapper", MapInput, {
  description: "Map the workspace, or one directory inside it, read-only: each non-ignored path with its type, byte size and line count, one page at a time, plus the largest files above a line threshold. Coverage names every gap (symlink not followed, binary, unreadable, read-denied, depth or entry cap), so a missing path is never proof of absence. The result is retained as research evidence you can cite. Paths are relative to the covered directory; nothing is written.",
  strict: { path: true, maxDepth: true, ignore: true, oversizedThreshold: true, offset: true, limit: true },
})
export const RepoSymbolsTool = define("repo_symbols", "move-in", SymbolsInput, {
  description: "Parse the top-level symbols and static imports of the TypeScript, JavaScript and Python files in the workspace, or one directory inside it, with a real parser, and derive where things live (exported symbols ranked by how central their file is in the import graph), the local import edges and the entry points. Parses at most 200 source files; coverage and parserGaps name every file it could not read completely, so a gap is never an absence. Vendored, generated and lockfile paths are skipped. The result is retained as research evidence you can cite; nothing is stored or written.",
  strict: { path: true },
})
export const RepoGitStateTool = define("repo_git_state", "repo-hygiene-check", GitInput, {
  description: "Observe the workspace's Git state read-only through fixed git queries: uncommitted changes, tracked build output, merge-conflict markers in tracked files, local branches already merged into HEAD, worktrees on merged branches, and free disk space. Each observation is pass, fail or unknown; failures say why one could not be made, and unknown never means clean. The result is retained as research evidence you can cite; no command or argument is accepted.",
  strict: {},
})

type Input = Schema.Top & Schema.Decoder<Readonly<Record<string, unknown>>>

function define(id: string, operation: "repo-mapper" | "move-in" | "repo-hygiene-check", parameters: Input,
  options: { description: string; strict: Tool.StrictParameters }) {
  return Tool.define(id, Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const run = yield* ResearchTools.make
    return {
      parameters,
      jsonSchema: ToolJsonSchema.fromSchema(parameters),
      strictParameters: options.strict,
      description: options.description,
      execute: (input: Readonly<Record<string, unknown>>, ctx: Tool.Context) => run(ctx, id, () => Effect.gen(function* () {
        const instance = yield* InstanceState.context
        const base = yield* fs.realPath(instance.directory).pipe(Effect.mapError(() => failure(operation, "REPO_ROOT_UNAVAILABLE")))
        const directory = typeof input.path === "string"
          ? yield* fs.realPath(path.resolve(base, input.path)).pipe(Effect.mapError(() => failure(operation, "REPO_SCOPE_INVALID")))
          : base
        if (!FSUtil.contains(base, directory)) return yield* failure(operation, "REPO_SCOPE_INVALID")
        const profile = yield* ToolSafety.RuntimeProfile
        const floor = Permission.fromConfig(nativeProfiles.jimmy)
        const module = yield* Effect.tryPromise({ try: () => MaestroArsenal.loadArsenal(), catch: () => failure(operation, "ARSENAL_UNAVAILABLE") })
        const worker = yield* Effect.try({ try: () => module.Arsenal.trustedAsset("parser-worker").entry, catch: () => undefined }).pipe(
          Effect.orElseSucceed(() => undefined))
        const observed = yield* observe(module.Arsenal, operation, Object.fromEntries(Object.entries(input).filter(([key]) => key !== "path")), {
          directory,
          stateDirectory: MaestroArsenal.stateDirectory(Global.Path.data, instance.project.id),
          projectID: instance.project.id,
          commands: commands(directory, worker),
          denied: (absolute) => {
            const relative = path.relative(base, absolute).replaceAll("\\", "/")
            return Permission.evaluate("read", relative, floor).action !== "allow" ||
              Permission.evaluate("read", relative, ctx.permission ?? []).action === "deny" ||
              (profile?.neverTouch ?? []).some((pattern) => fs.globMatch(pattern, relative) ||
                (!/[*?[]/.test(pattern) && FSUtil.contains(path.resolve(base, pattern), absolute)))
          },
          deadline: Date.now() + DEADLINE_MS,
          signal: ctx.abort,
        })
        const scope = path.relative(base, directory).replaceAll("\\", "/") || "."
        return { title: `Repository ${id.slice("repo_".length).replace("_", " ")}: ${scope}`, output: JSON.stringify({ scope, ...observed }), metadata: {} }
      })).pipe(Effect.orDie),
    }
  }))
}
