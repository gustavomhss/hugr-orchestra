import { LayerNode } from "@orchestra/core/effect/layer-node"
import { Duration, Effect, Layer, Context, Schema, Scope } from "effect"
import { formatPatch, structuredPatch } from "diff"
import { InstanceState } from "@/effect/instance-state"
import { Watcher } from "@orchestra/core/filesystem/watcher"
import { Git } from "@/git"
import { EventV2Bridge } from "@/event-v2-bridge"
import { EventV2 } from "@orchestra/core/event"
import { VcsEvent } from "@orchestra/schema/vcs-event"

const PATCH_CONTEXT_LINES = 2_147_483_647
const MAX_PATCH_BYTES = 10_000_000
const MAX_TOTAL_PATCH_BYTES = 10_000_000
const ACTIVITY_MAX_COMMITS = 20_000
const ACTIVITY_MAX_WINDOW_MS = 366 * 24 * 60 * 60 * 1000
const ACTIVITY_MAX_OUTPUT_BYTES = 10_000_000
const ACTIVITY_TIMEOUT = Duration.seconds(5)
// Line stats diff every commit, which is orders of magnitude slower than walking history,
// so they get a short budget and may only cover the newest commits of the window.
const ACTIVITY_LINES_BUDGET = Duration.seconds(1)
type DiffOptions = {
  readonly context?: number
}

const emptyPatch = (file: string) => formatPatch(structuredPatch(file, file, "", "", "", "", { context: 0 }))

const nums = (list: Git.Stat[]) =>
  new Map(list.map((item) => [item.file, { additions: item.additions, deletions: item.deletions }] as const))

const merge = (...lists: Git.Item[][]) => {
  const out = new Map<string, Git.Item>()
  lists.flat().forEach((item) => {
    if (!out.has(item.file)) out.set(item.file, item)
  })
  return [...out.values()]
}

const emptyBatch = () => ({ patches: new Map<string, string>(), capped: false })

const parseQuotedPath = (value: string) => {
  let out = ""
  for (let idx = 1; idx < value.length; idx++) {
    const char = value[idx]
    if (char === '"') return { value: out, end: idx + 1 }
    if (char !== "\\") {
      out += char
      continue
    }

    const next = value[++idx]
    if (next === "t") out += "\t"
    else if (next === "n") out += "\n"
    else if (next === "r") out += "\r"
    else if (next === '"' || next === "\\") out += next
    else out += next ?? ""
  }
}

const parsePathToken = (value: string) => {
  if (!value.startsWith('"')) return value.split("\t")[0]
  return parseQuotedPath(value)?.value ?? value
}

const fileFromDiffPath = (value: string | undefined) => {
  if (!value || value === "/dev/null") return
  const file = parsePathToken(value)
  if (file.startsWith("a/") || file.startsWith("b/")) return file.slice(2)
  return file
}

const fileFromGitHeader = (header: string) => {
  if (header.startsWith('"')) {
    const first = parseQuotedPath(header)
    const second = first ? header.slice(first.end).trimStart() : undefined
    if (!second) return
    if (!second.startsWith('"')) return fileFromDiffPath(second)
    return fileFromDiffPath(parseQuotedPath(second)?.value)
  }

  const separator = header.indexOf(" b/")
  if (separator === -1) return
  return fileFromDiffPath(header.slice(separator + 1))
}

const fileFromPatchChunk = (chunk: string) => {
  const next = /^\+\+\+ (.+)$/m.exec(chunk)?.[1]
  const before = /^--- (.+)$/m.exec(chunk)?.[1]
  const file = fileFromDiffPath(next) ?? fileFromDiffPath(before)
  if (file) return file

  const header = /^diff --git (.+)$/m.exec(chunk)?.[1]
  return fileFromGitHeader(header ?? "")
}

const splitGitPatch = (patch: Git.Patch) => {
  const starts = [...patch.text.matchAll(/(?:^|\n)diff --git /g)].map((match) =>
    match[0].startsWith("\n") ? match.index + 1 : match.index,
  )
  const chunks = starts.map((start, index) => patch.text.slice(start, starts[index + 1] ?? patch.text.length))
  if (!patch.truncated) return chunks
  return chunks.slice(0, -1)
}

const batchPatches = Effect.fnUntraced(function* (
  git: Git.Interface,
  cwd: string,
  ref: string,
  list: Git.Item[],
  options?: DiffOptions,
) {
  if (list.length === 0) return { patches: new Map<string, string>(), capped: false }

  const result = yield* git.patchAll(cwd, ref, {
    context: options?.context ?? PATCH_CONTEXT_LINES,
    maxOutputBytes: MAX_TOTAL_PATCH_BYTES,
  })

  return {
    patches: splitGitPatch(result).reduce((acc, patch, index) => {
      const file = fileFromPatchChunk(patch) ?? list[index]?.file
      if (!file) return acc
      acc.set(file, (acc.get(file) ?? "") + patch)
      return acc
    }, new Map<string, string>()),
    capped: result.truncated,
  }
})

const nativePatch = Effect.fnUntraced(function* (
  git: Git.Interface,
  cwd: string,
  ref: string | undefined,
  item: Git.Item,
  options?: DiffOptions,
) {
  const result =
    item.code === "??" || !ref
      ? yield* git.patchUntracked(cwd, item.file, {
          context: options?.context ?? PATCH_CONTEXT_LINES,
          maxOutputBytes: MAX_PATCH_BYTES,
        })
      : yield* git.patch(cwd, ref, item.file, {
          context: options?.context ?? PATCH_CONTEXT_LINES,
          maxOutputBytes: MAX_PATCH_BYTES,
        })
  if (!result.truncated && result.text) return result.text

  return emptyPatch(item.file)
})

const totalPatch = (file: string, patch: string, total: number) => {
  if (total + Buffer.byteLength(patch) <= MAX_TOTAL_PATCH_BYTES) return { patch, capped: false }
  return { patch: emptyPatch(file), capped: true }
}

const patchForItem = Effect.fnUntraced(function* (
  git: Git.Interface,
  cwd: string,
  ref: string | undefined,
  item: Git.Item,
  batch: { patches: Map<string, string>; capped: boolean },
  capped: boolean,
  options?: DiffOptions,
) {
  if (capped) return emptyPatch(item.file)

  const batched = batch.patches.get(item.file)
  if (batched !== undefined) return batched
  if (item.code !== "??" && batch.capped) return emptyPatch(item.file)
  return yield* nativePatch(git, cwd, ref, item, options)
})

const files = Effect.fnUntraced(function* (
  git: Git.Interface,
  cwd: string,
  ref: string | undefined,
  list: Git.Item[],
  map: Map<string, { additions: number; deletions: number }>,
  batch: { patches: Map<string, string>; capped: boolean },
  options?: DiffOptions,
) {
  const next: FileDiff[] = []
  let total = 0
  let capped = false

  for (const item of list.toSorted((a, b) => a.file.localeCompare(b.file))) {
    const stat = map.get(item.file) ?? (item.status === "added" ? yield* git.statUntracked(cwd, item.file) : undefined)
    const patch = yield* patchForItem(git, cwd, ref, item, batch, capped, options)
    const result: { patch: string; capped: boolean } = capped
      ? { patch, capped: true }
      : totalPatch(item.file, patch, total)
    capped = capped || result.capped
    if (!capped) {
      total += Buffer.byteLength(result.patch)
      capped = total >= MAX_TOTAL_PATCH_BYTES
    }
    next.push({
      file: item.file,
      patch: result.patch,
      additions: stat?.additions ?? 0,
      deletions: stat?.deletions ?? 0,
      status: item.status,
    })
  }

  return next
})

const diffAgainstRef = Effect.fnUntraced(function* (
  git: Git.Interface,
  cwd: string,
  ref: string,
  options?: DiffOptions,
) {
  const [list, stats, extra] = yield* Effect.all([git.diff(cwd, ref), git.stats(cwd, ref), git.status(cwd)], {
    concurrency: 3,
  })
  return yield* files(
    git,
    cwd,
    ref,
    merge(
      list,
      extra.filter((item) => item.code === "??"),
    ),
    nums(stats),
    yield* batchPatches(git, cwd, ref, list, options),
    options,
  )
})

const track = Effect.fnUntraced(function* (
  git: Git.Interface,
  cwd: string,
  ref: string | undefined,
  options?: DiffOptions,
) {
  if (!ref) return yield* files(git, cwd, ref, yield* git.status(cwd), new Map(), emptyBatch(), options)
  return yield* diffAgainstRef(git, cwd, ref, options)
})

export const Mode = Schema.Literals(["git", "branch"])
export type Mode = Schema.Schema.Type<typeof Mode>

export const Event = VcsEvent

export const Info = Schema.Struct({
  branch: Schema.optional(Schema.String),
  default_branch: Schema.optional(Schema.String),
}).annotate({ identifier: "VcsInfo" })
export type Info = Schema.Schema.Type<typeof Info>

export const FileDiff = Schema.Struct({
  file: Schema.String,
  // Mirrors Snapshot.FileDiff (see #26574). The current producer always
  // populates patch, but loosening matches the sibling schema so a
  // future code path that omits it can't crash /instance/vcs/diff.
  patch: Schema.optional(Schema.String),
  additions: Schema.Finite,
  deletions: Schema.Finite,
  status: Schema.optional(Schema.Literals(["added", "deleted", "modified"])),
}).annotate({ identifier: "VcsFileDiff" })
export type FileDiff = Schema.Schema.Type<typeof FileDiff>

export const FileStatus = Schema.Struct({
  file: Schema.String,
  additions: Schema.Finite,
  deletions: Schema.Finite,
  status: Schema.Literals(["added", "deleted", "modified"]),
}).annotate({ identifier: "VcsFileStatus" })
export type FileStatus = Schema.Schema.Type<typeof FileStatus>

export const ApplyInput = Schema.Struct({
  patch: Schema.String,
})
export type ApplyInput = Schema.Schema.Type<typeof ApplyInput>

export const ApplyResult = Schema.Struct({
  applied: Schema.Boolean,
})
export type ApplyResult = Schema.Schema.Type<typeof ApplyResult>

export type ActivityInput = {
  readonly since: number
  readonly until: number
}

export const ActivityTotals = Schema.Struct({
  commits: Schema.Finite,
  merges: Schema.Finite,
  authors: Schema.Finite,
  additions: Schema.Finite,
  deletions: Schema.Finite,
  filesChanged: Schema.Finite,
}).annotate({ identifier: "VcsActivityTotals" })

export const ActivityDay = Schema.Struct({
  day: Schema.String.annotate({ description: "Server-local YYYY-MM-DD of the commit author time" }),
  commits: Schema.Finite,
  merges: Schema.Finite,
  additions: Schema.Finite,
  deletions: Schema.Finite,
}).annotate({ identifier: "VcsActivityDay" })

export const ActivityPath = Schema.Struct({
  path: Schema.String,
  changes: Schema.Finite,
}).annotate({ identifier: "VcsActivityPath" })

export const ActivityCommit = Schema.Struct({
  hash: Schema.String,
  subject: Schema.String,
  time: Schema.Finite,
}).annotate({ identifier: "VcsActivityCommit" })

export const Activity = Schema.Struct({
  repository: Schema.Boolean,
  since: Schema.Finite,
  until: Schema.Finite,
  totals: ActivityTotals,
  days: Schema.Array(ActivityDay),
  topPaths: Schema.Array(ActivityPath),
  recent: Schema.Array(ActivityCommit),
  ahead: Schema.NullOr(Schema.Finite),
  behind: Schema.NullOr(Schema.Finite),
  truncated: Schema.Boolean.annotate({ description: "True when a commit, output or time bound cut any scan short" }),
  partial: Schema.Struct({
    commits: Schema.Boolean,
    lines: Schema.Boolean,
  }).annotate({ identifier: "VcsActivityPartial" }),
}).annotate({ identifier: "VcsActivity" })
export type Activity = Schema.Schema.Type<typeof Activity>

export class PatchApplyError extends Schema.TaggedErrorClass<PatchApplyError>()("VcsPatchApplyError", {
  message: Schema.String,
  reason: Schema.Literals(["non-git", "not-clean"]),
}) {}

export interface Interface {
  readonly init: () => Effect.Effect<void>
  readonly branch: () => Effect.Effect<string | undefined>
  readonly defaultBranch: () => Effect.Effect<string | undefined>
  readonly status: () => Effect.Effect<FileStatus[]>
  readonly diff: (mode: Mode, options?: DiffOptions) => Effect.Effect<FileDiff[]>
  readonly diffRaw: () => Effect.Effect<string>
  readonly apply: (input: ApplyInput) => Effect.Effect<ApplyResult, PatchApplyError>
  readonly activity: (input: ActivityInput) => Effect.Effect<Activity>
}

interface State {
  current: string | undefined
  root: Git.Base | undefined
}

export class Service extends Context.Service<Service, Interface>()("@orchestra/Vcs") {}

const layer: Layer.Layer<Service, never, Git.Service | EventV2Bridge.Service> = Layer.effect(
  Service,
  Effect.gen(function* () {
    const git = yield* Git.Service
    const events = yield* EventV2Bridge.Service
    const scope = yield* Scope.Scope

    const state = yield* InstanceState.make<State>(
      Effect.fn("Vcs.state")(function* (ctx) {
        if (ctx.project.vcs !== "git") {
          return { current: undefined, root: undefined }
        }

        const get = Effect.fnUntraced(function* () {
          return yield* git.branch(ctx.directory)
        })
        const [current, root] = yield* Effect.all([git.branch(ctx.directory), git.defaultBranch(ctx.directory)], {
          concurrency: 2,
        })
        const value = { current, root }

        const unsubscribe = yield* events.listen((event) => {
          if (event.type !== Watcher.Event.Updated.type || event.location?.directory !== ctx.directory)
            return Effect.void
          const data = event.data as EventV2.Data<typeof Watcher.Event.Updated>
          if (!data.file.endsWith("HEAD")) return Effect.void
          return Effect.gen(function* () {
            const next = yield* get()
            if (next !== value.current) {
              value.current = next
              yield* events.publish(Event.BranchUpdated, { branch: next })
            }
          })
        })
        yield* Effect.addFinalizer(() => unsubscribe)

        return value
      }),
    )

    return Service.of({
      init: Effect.fn("Vcs.init")(function* () {
        yield* InstanceState.get(state).pipe(Effect.forkIn(scope))
      }),
      branch: Effect.fn("Vcs.branch")(function* () {
        return yield* InstanceState.use(state, (x) => x.current)
      }),
      defaultBranch: Effect.fn("Vcs.defaultBranch")(function* () {
        return yield* InstanceState.use(state, (x) => x.root?.name)
      }),
      status: Effect.fn("Vcs.status")(function* () {
        const ctx = yield* InstanceState.context
        if (ctx.project.vcs !== "git") return []
        const ref = (yield* git.hasHead(ctx.directory)) ? "HEAD" : undefined
        const [list, stats] = yield* Effect.all(
          [git.status(ctx.directory), ref ? git.stats(ctx.directory, ref) : Effect.succeed([])],
          { concurrency: 2 },
        )
        const map = nums(stats)
        return yield* Effect.forEach(
          list.toSorted((a, b) => a.file.localeCompare(b.file)),
          (item) =>
            Effect.gen(function* () {
              const stat =
                map.get(item.file) ??
                (item.status === "added" ? yield* git.statUntracked(ctx.worktree, item.file) : undefined)
              return {
                file: item.file,
                additions: stat?.additions ?? 0,
                deletions: stat?.deletions ?? 0,
                status: item.status,
              } satisfies FileStatus
            }),
        )
      }),
      diff: Effect.fn("Vcs.diff")(function* (mode: Mode, options?: DiffOptions) {
        const value = yield* InstanceState.get(state)
        const ctx = yield* InstanceState.context
        if (ctx.project.vcs !== "git") return []
        if (mode === "git") {
          return yield* track(git, ctx.directory, (yield* git.hasHead(ctx.directory)) ? "HEAD" : undefined, options)
        }

        if (!value.root) return []
        if (value.current && value.current === value.root.name) return []
        const ref = yield* git.mergeBase(ctx.directory, value.root.ref)
        if (!ref) return []
        return yield* diffAgainstRef(git, ctx.directory, ref, options)
      }),
      diffRaw: Effect.fn("Vcs.diffRaw")(function* () {
        const ctx = yield* InstanceState.context
        if (ctx.project.vcs !== "git") return ""
        const [hasHead, status] = yield* Effect.all([git.hasHead(ctx.directory), git.status(ctx.directory)], {
          concurrency: 2,
        })
        const tracked = hasHead ? (yield* git.patchAll(ctx.directory, "HEAD")).text : ""
        const untracked = yield* Effect.forEach(
          status.filter((item) => item.code === "??"),
          (item) => git.patchUntracked(ctx.directory, item.file).pipe(Effect.map((patch) => patch.text)),
        )
        return [tracked, ...untracked].filter(Boolean).join("\n")
      }),
      apply: Effect.fn("Vcs.apply")(function* (input: ApplyInput) {
        const ctx = yield* InstanceState.context
        if (ctx.project.vcs !== "git") {
          return yield* new PatchApplyError({
            message: "Patch can't be applied because the project is not git-based",
            reason: "non-git",
          })
        }
        const applied = yield* git.applyPatch(ctx.directory, input.patch)
        if (applied.exitCode !== 0) {
          return yield* new PatchApplyError({
            message: "Patch can't be applied",
            reason: "not-clean",
          })
        }
        return { applied: true }
      }),
      activity: Effect.fn("Vcs.activity")(function* (input: ActivityInput) {
        const value = yield* InstanceState.get(state)
        const ctx = yield* InstanceState.context
        const window = { since: Math.max(input.since, input.until - ACTIVITY_MAX_WINDOW_MS), until: input.until }
        const empty = summarize({ commits: [], merges: [], lines: [] }, window)
        if (ctx.project.vcs !== "git") return { ...empty, repository: false }
        if (!(yield* git.hasHead(ctx.directory))) return empty
        const scan = {
          ...window,
          merges: false,
          numstat: false,
          limit: ACTIVITY_MAX_COMMITS,
          maxOutputBytes: ACTIVITY_MAX_OUTPUT_BYTES,
          timeout: ACTIVITY_TIMEOUT,
        }
        const [commits, merges, lines, divergence] = yield* Effect.all(
          [
            git.log(ctx.directory, scan),
            git.log(ctx.directory, { ...scan, merges: true }),
            git.log(ctx.directory, { ...scan, numstat: true, timeout: ACTIVITY_LINES_BUDGET }),
            upstreamDivergence(git, ctx.directory, value.root),
          ],
          { concurrency: 4 },
        )
        return {
          ...summarize({ commits: commits.commits, merges: merges.commits, lines: lines.commits }, window),
          ahead: divergence?.ahead ?? null,
          behind: divergence?.behind ?? null,
          truncated: commits.truncated || merges.truncated || lines.truncated,
          partial: { commits: commits.truncated || merges.truncated, lines: lines.truncated },
        }
      }),
    })
  }),
)

// git bounds the walk by committer time; author time decides the window and day buckets.
// Commit, author and merge counts come from the cheap scans; line and path figures come
// from the budgeted numstat scan, which may cover fewer commits.
function summarize(
  scans: { commits: Git.Commit[]; merges: Git.Commit[]; lines: Git.Commit[] },
  window: { since: number; until: number },
) {
  const inWindow = (commit: Git.Commit) => commit.time >= window.since && commit.time <= window.until
  const scanned = scans.commits.filter(inWindow)
  const days = new Map<string, { day: string; commits: number; merges: number; additions: number; deletions: number }>()
  const bucket = (time: number) => {
    const date = new Date(time)
    const day = [date.getFullYear(), date.getMonth() + 1, date.getDate()]
      .map((part) => String(part).padStart(2, "0"))
      .join("-")
    const entry = days.get(day) ?? { day, commits: 0, merges: 0, additions: 0, deletions: 0 }
    days.set(day, entry)
    return entry
  }
  scanned.forEach((commit) => {
    bucket(commit.time).commits += 1
  })
  const paths = new Map<string, number>()
  scans.lines.filter(inWindow).forEach((commit) => {
    const entry = bucket(commit.time)
    commit.files.forEach((file) => {
      entry.additions += file.additions
      entry.deletions += file.deletions
      paths.set(file.file, (paths.get(file.file) ?? 0) + file.additions + file.deletions)
    })
  })
  const merged = scans.merges.filter(inWindow)
  merged.forEach((commit) => {
    bucket(commit.time).merges += 1
  })
  const list = [...days.values()]
  return {
    repository: true,
    since: window.since,
    until: window.until,
    totals: {
      commits: scanned.length,
      merges: merged.length,
      authors: new Set(scanned.map((commit) => commit.email.trim().toLowerCase())).size,
      additions: list.reduce((sum, day) => sum + day.additions, 0),
      deletions: list.reduce((sum, day) => sum + day.deletions, 0),
      filesChanged: paths.size,
    },
    days: list.toSorted((a, b) => a.day.localeCompare(b.day)),
    topPaths: [...paths.entries()]
      .toSorted((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 8)
      .map((entry) => ({ path: entry[0], changes: entry[1] })),
    recent: scanned
      .toSorted((a, b) => b.time - a.time)
      .slice(0, 10)
      .map((commit) => ({
        hash: commit.hash,
        subject: Array.from(commit.subject.trim()).slice(0, 120).join(""),
        time: commit.time,
      })),
    ahead: null,
    behind: null,
    truncated: false,
    partial: { commits: false, lines: false },
  } satisfies Activity
}

const upstreamDivergence = Effect.fnUntraced(function* (git: Git.Interface, cwd: string, root: Git.Base | undefined) {
  if (!root) return
  // Prefer the default branch's configured upstream, else the remote-tracking default ref.
  const upstream = (yield* git.upstream(cwd, root.name)) ?? (root.ref === root.name ? undefined : root.ref)
  if (!upstream) return
  return yield* git.aheadBehind(cwd, upstream, ACTIVITY_TIMEOUT)
})

export const node = LayerNode.make({ service: Service, layer: layer, deps: [Git.node, EventV2Bridge.node] })

export * as Vcs from "./vcs"
