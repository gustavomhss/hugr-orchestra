export * as ReviewPREvidenceV2 from "./review-pr-evidence"

import { createHash } from "node:crypto"
import { Effect } from "effect"
import type { GitCli } from "@orchestra/core/git-cli"
import type { ReviewRoute } from "@orchestra/core/review/route"
import { Tool } from "@orchestra/core/tool/tool"
import { changes } from "./review-diff"

const LIMIT = 4 * 1024 * 1024
const TIMEOUT = "30 seconds"
const OID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/
const DIFF = ["--binary", "--no-ext-diff", "--no-textconv", "--no-renames"] as const

export type Prepared = {
  readonly baseRef: string
  readonly headRef: string
  readonly baseCommit: string
  readonly headCommit: string
  readonly baseSHA: string
  readonly headSHA: string
  readonly diff: string
  readonly sha256: string
  readonly changedPaths: readonly string[]
  readonly baseFiles: readonly string[]
  readonly headFiles: readonly string[]
  readonly changes: readonly ReviewRoute.Change[]
}

export const prepare = Effect.fn("ReviewPREvidenceV2.prepare")(function* (
  git: GitCli.Interface,
  input: { readonly worktree: string; readonly baseRef: string; readonly headRef: string },
) {
  const baseCommit = yield* resolveCommit(git, input.worktree, input.baseRef)
  const headCommit = yield* resolveCommit(git, input.worktree, input.headRef)
  const baseSHA = yield* mergeBase(git, input.worktree, baseCommit, headCommit)
  const patch = yield* captured(git, input.worktree, ["diff", ...DIFF, baseSHA, headCommit, "--"])
  const names = yield* captured(git, input.worktree, ["diff", "--name-only", "-z", ...DIFF, baseSHA, headCommit, "--"])
  const changedPaths = yield* nulPaths(names.stdout)
  if (changedPaths.length === 0) return yield* refused("empty-diff", "committed diff has no paths")
  if (patch.stdout.length === 0) return yield* refused("unsupported-diff-path", "diff bytes are empty while paths were listed")
  const diff = yield* decodeUtf8(patch.stdout, "unsupported-diff-encoding")
  const baseFiles = yield* listFiles(git, input.worktree, baseSHA)
  const headFiles = yield* listFiles(git, input.worktree, headCommit)
  const reconciled = yield* reconcile(diff, changedPaths)
  return {
    baseRef: input.baseRef,
    headRef: input.headRef,
    baseCommit,
    headCommit,
    baseSHA,
    headSHA: headCommit,
    diff,
    sha256: createHash("sha256").update(patch.stdout).digest("hex"),
    changedPaths,
    baseFiles,
    headFiles,
    changes: reconciled,
  }
})

export const recheck = Effect.fn("ReviewPREvidenceV2.recheck")(function* (
  git: GitCli.Interface,
  worktree: string,
  prepared: Prepared,
) {
  const baseCommit = yield* resolveCommit(git, worktree, prepared.baseRef)
  const headCommit = yield* resolveCommit(git, worktree, prepared.headRef)
  if (baseCommit !== prepared.baseCommit || headCommit !== prepared.headCommit)
    return yield* refused("ref-moved", "base or head commit changed")
})

const resolveCommit = Effect.fnUntraced(function* (git: GitCli.Interface, worktree: string, ref: string) {
  if (ref.length === 0 || ref.includes("\0") || /[\r\n]/.test(ref) || ref.startsWith("-"))
    return yield* refused("invalid-reference", "ref is empty, has a NUL or newline, or starts with -")
  const result = yield* run(git, worktree, ["rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`])
  if (result.exitCode !== 0) return yield* refused("resolve-failed", result.stderr.toString("utf8").trim() || ref)
  const line = result.stdout.toString("utf8").replace(/\n$/, "")
  if (line.split("\n").length !== 1 || !OID.test(line)) return yield* refused("resolve-failed", "not one full commit id")
  return line
})

const mergeBase = Effect.fnUntraced(function* (git: GitCli.Interface, worktree: string, base: string, head: string) {
  const result = yield* run(git, worktree, ["merge-base", "--all", base, head])
  const lines = result.exitCode === 0 ? result.stdout.toString("utf8").split("\n").filter((line) => line.length > 0) : []
  if (result.exitCode !== 0 || lines.length === 0 || lines.some((line) => !OID.test(line)))
    return yield* refused("merge-base-unavailable", result.stderr.toString("utf8").trim() || "no unique merge-base")
  const only = lines[0]
  if (lines.length !== 1 || only === undefined) return yield* refused("merge-base-ambiguous", lines.join(" "))
  return only
})

const listFiles = Effect.fnUntraced(function* (git: GitCli.Interface, worktree: string, commit: string) {
  const result = yield* captured(git, worktree, ["ls-tree", "-r", "-z", commit])
  const names: string[] = []
  for (const record of yield* nulPaths(result.stdout)) {
    const tab = record.indexOf("\t")
    if (tab < 0) return yield* refused("list-failed", "ls-tree record has no path")
    names.push(record.slice(tab + 1))
  }
  return names
})

const captured = Effect.fnUntraced(function* (git: GitCli.Interface, worktree: string, args: string[]) {
  const result = yield* run(git, worktree, args)
  if (result.exitCode !== 0) return yield* refused("git-failed", `${args[0]}: ${result.stderr.toString("utf8").trim()}`)
  return result
})

const run = (git: GitCli.Interface, worktree: string, args: string[]) =>
  git.run(args, { cwd: worktree, maxOutputBytes: LIMIT, timeout: TIMEOUT }).pipe(
    Effect.flatMap((result) =>
      result.truncated || result.stderr.toString("utf8").includes("Timed out")
        ? refused("truncated", args[0] ?? "git")
        : Effect.succeed(result),
    ),
  )

function nulPaths(stdout: Buffer) {
  if (stdout.length > 0 && stdout[stdout.length - 1] !== 0) return refused("list-failed", "NUL listing is incomplete")
  return decodeUtf8(stdout, "list-encoding").pipe(
    Effect.map((text) => text.split("\0").filter((item) => item.length > 0)),
  )
}

const decodeUtf8 = (stdout: Buffer, reason: "unsupported-diff-encoding" | "list-encoding") =>
  Effect.try({
    try: () => new TextDecoder("utf-8", { fatal: true }).decode(stdout),
    catch: () => new Tool.Failure({ message: `${reason}: bytes are not UTF-8`, metadata: { reason } }),
  })

function reconcile(diff: string, changedPaths: readonly string[]) {
  const parsed = changes(diff)
  const parsedPaths = parsed.map((change) => change.path)
  const missing = changedPaths.filter((file) => !parsedPaths.includes(file))
  const extra = parsedPaths.filter((file) => !changedPaths.includes(file))
  if (extra.length > 0 || missing.some((file) => !binaryConfirmed(diff, file)))
    return refused("unsupported-diff-path", [...missing, ...extra].join("\0") || "path lists differ")
  const byPath = new Map(parsed.map((change) => [change.path, change]))
  return Effect.succeed(changedPaths.map((file) => byPath.get(file) ?? { path: file, added: [], removed: 0 }))
}

function binaryConfirmed(diff: string, file: string) {
  return diff.split(/^(?=diff --git )/m).some((section) => {
    const header = section.split("\n", 1)[0] ?? ""
    if (!header.endsWith(` b/${file}`) && !header.endsWith(` "b/${file}"`)) return false
    return section.includes("GIT binary patch") || section.includes("Binary files ")
  })
}

const refused = (reason: string, detail: string) =>
  Effect.fail(new Tool.Failure({ message: `${reason}: ${detail}`, metadata: { reason } }))
