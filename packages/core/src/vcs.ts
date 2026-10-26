export * as Vcs from "./vcs"

// Version-control views of a working directory: its changed files, their diffs against HEAD or the default branch's
// merge base, and recent commit activity. Moved from the retired runtime so the V2 server answers the same questions.

import { Duration, Effect } from "effect"
import { formatPatch, structuredPatch } from "diff"
import type { GitCli } from "./git-cli"
import { VcsEvent } from "@orchestra/schema/vcs-event"
import {
  Activity,
  ActivityCommit,
  ActivityDay,
  ActivityPath,
  ActivityTotals,
  ApplyInput,
  ApplyResult,
  FileDiff,
  FileStatus,
  Info,
  Mode,
  type ActivityInput,
} from "@orchestra/schema/vcs"

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
export type DiffOptions = {
  readonly context?: number
}

const emptyPatch = (file: string) => formatPatch(structuredPatch(file, file, "", "", "", "", { context: 0 }))

const nums = (list: GitCli.Stat[]) =>
  new Map(list.map((item) => [item.file, { additions: item.additions, deletions: item.deletions }] as const))

const merge = (...lists: GitCli.Item[][]) => {
  const out = new Map<string, GitCli.Item>()
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

const splitGitPatch = (patch: GitCli.Patch) => {
  const starts = [...patch.text.matchAll(/(?:^|\n)diff --git /g)].map((match) =>
    match[0].startsWith("\n") ? match.index + 1 : match.index,
  )
  const chunks = starts.map((start, index) => patch.text.slice(start, starts[index + 1] ?? patch.text.length))
  if (!patch.truncated) return chunks
  return chunks.slice(0, -1)
}

const batchPatches = Effect.fnUntraced(function* (
  git: GitCli.Interface,
  cwd: string,
  ref: string,
  list: GitCli.Item[],
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
  git: GitCli.Interface,
  cwd: string,
  ref: string | undefined,
  item: GitCli.Item,
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
  git: GitCli.Interface,
  cwd: string,
  ref: string | undefined,
  item: GitCli.Item,
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
  git: GitCli.Interface,
  cwd: string,
  ref: string | undefined,
  list: GitCli.Item[],
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
  git: GitCli.Interface,
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
  git: GitCli.Interface,
  cwd: string,
  ref: string | undefined,
  options?: DiffOptions,
) {
  if (!ref) return yield* files(git, cwd, ref, yield* git.status(cwd), new Map(), emptyBatch(), options)
  return yield* diffAgainstRef(git, cwd, ref, options)
})

export {
  Activity,
  ActivityCommit,
  ActivityDay,
  ActivityPath,
  ActivityTotals,
  ApplyInput,
  ApplyResult,
  FileDiff,
  FileStatus,
  Info,
  Mode,
  type ActivityInput,
}
export const Event = VcsEvent

/** Changed files against HEAD with their line counts; empty outside a git repository. */
export const status = Effect.fn("Vcs.status")(function* (git: GitCli.Interface, directory: string, worktree: string) {
  const ref = (yield* git.hasHead(directory)) ? "HEAD" : undefined
  const [list, stats] = yield* Effect.all(
    [git.status(directory), ref ? git.stats(directory, ref) : Effect.succeed([])],
    { concurrency: 2 },
  )
  const map = nums(stats)
  return yield* Effect.forEach(
    list.toSorted((a, b) => a.file.localeCompare(b.file)),
    (item) =>
      Effect.gen(function* () {
        const stat =
          map.get(item.file) ?? (item.status === "added" ? yield* git.statUntracked(worktree, item.file) : undefined)
        return {
          file: item.file,
          additions: stat?.additions ?? 0,
          deletions: stat?.deletions ?? 0,
          status: item.status,
        } satisfies FileStatus
      }),
  )
})

/**
 * Diffs of the working tree: against HEAD (`git`), or against the merge base with the default branch (`branch`), which
 * is empty on the default branch itself.
 */
export const diff = Effect.fn("Vcs.diff")(function* (
  git: GitCli.Interface,
  directory: string,
  mode: Mode,
  branches: { readonly current?: string; readonly root?: GitCli.Base },
  options?: DiffOptions,
) {
  if (mode === "git") return yield* track(git, directory, (yield* git.hasHead(directory)) ? "HEAD" : undefined, options)
  if (!branches.root) return []
  if (branches.current && branches.current === branches.root.name) return []
  const ref = yield* git.mergeBase(directory, branches.root.ref)
  if (!ref) return []
  return yield* diffAgainstRef(git, directory, ref, options)
})

/** Commit activity in a window, bounded in commits, output and time; `repository` is false outside git. */
export const activity = Effect.fn("Vcs.activity")(function* (
  git: GitCli.Interface,
  directory: string,
  input: ActivityInput,
  repository: boolean,
  root: GitCli.Base | undefined,
) {
  const window = { since: Math.max(input.since, input.until - ACTIVITY_MAX_WINDOW_MS), until: input.until }
  const empty = summarize({ commits: [], merges: [], lines: [] }, window)
  if (!repository) return { ...empty, repository: false }
  if (!(yield* git.hasHead(directory))) return empty
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
      git.log(directory, scan),
      git.log(directory, { ...scan, merges: true }),
      git.log(directory, { ...scan, numstat: true, timeout: ACTIVITY_LINES_BUDGET }),
      upstreamDivergence(git, directory, root),
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
})

// git bounds the walk by committer time; author time decides the window and day buckets.
// Commit, author and merge counts come from the cheap scans; line and path figures come
// from the budgeted numstat scan, which may cover fewer commits.
function summarize(
  scans: { commits: GitCli.Commit[]; merges: GitCli.Commit[]; lines: GitCli.Commit[] },
  window: { since: number; until: number },
) {
  const inWindow = (commit: GitCli.Commit) => commit.time >= window.since && commit.time <= window.until
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

const upstreamDivergence = Effect.fnUntraced(function* (git: GitCli.Interface, cwd: string, root: GitCli.Base | undefined) {
  if (!root) return
  // Prefer the default branch's configured upstream, else the remote-tracking default ref.
  const upstream = (yield* git.upstream(cwd, root.name)) ?? (root.ref === root.name ? undefined : root.ref)
  if (!upstream) return
  return yield* git.aheadBehind(cwd, upstream, ACTIVITY_TIMEOUT)
})
