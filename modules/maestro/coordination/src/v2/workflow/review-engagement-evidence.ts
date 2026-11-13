export * as ReviewEngagementEvidenceV2 from "./review-engagement-evidence"

import { createHash } from "node:crypto"
import { Effect } from "effect"
import type { GitCli } from "@orchestra/core/git-cli"
import { Tool } from "@orchestra/core/tool/tool"

const metadataLimit = 8 * 1024 * 1024
const gitTimeout = 30_000
const gitEnv = {
  GIT_NO_REPLACE_OBJECTS: "1",
  GIT_NO_LAZY_FETCH: "1",
  GIT_ALLOW_PROTOCOL: "",
  GIT_TERMINAL_PROMPT: "0",
}

export type File = {
  readonly path: string
  readonly oid: string
  readonly mode: "100644" | "100755"
  readonly size: number
}

export type Skipped = { readonly path: string; readonly reason: "symlink" | "submodule" }

export type Prepared = {
  readonly revision: string
  readonly commit: string
  readonly sha256: string
  readonly files: readonly File[]
  readonly notExamined: readonly Skipped[]
}

export function prepare(git: GitCli.Interface, input: {
  readonly worktree: string
  readonly revision?: string
  readonly paths?: readonly string[]
}): Effect.Effect<Prepared, Tool.Failure> {
  return Effect.gen(function* () {
    const revision = input.revision ?? "HEAD"
    if (!boundedRevision(revision)) return yield* refuse("engagement-reference", "revision is not a bounded ref")
    const paths = input.paths ?? ["."]
    if (!boundedScope(paths)) return yield* refuse("engagement-scope", "paths are not a canonical scope")
    const commit = yield* resolveCommit(git, input.worktree, revision)
    const entries = yield* listTree(git, input.worktree, commit)
    const selected = select(entries, paths)
    if (!selected) return yield* refuse("engagement-scope", "a requested path is absent")
    if (selected.files.length === 0) return yield* refuse("engagement-empty", "no reviewable files in scope")
    return {
      revision,
      commit,
      sha256: digest(commit, selected.files, selected.notExamined),
      files: selected.files,
      notExamined: selected.notExamined,
    }
  })
}

export function recheck(git: GitCli.Interface, worktree: string, prepared: Prepared): Effect.Effect<void, Tool.Failure> {
  return Effect.gen(function* () {
    if (!boundedRevision(prepared.revision)) return yield* refuse("engagement-reference", "revision is not a bounded ref")
    const commit = yield* resolveCommit(git, worktree, prepared.revision)
    if (commit !== prepared.commit) return yield* refuse("engagement-ref-moved", "revision now names a different commit")
  })
}

function resolveCommit(git: GitCli.Interface, worktree: string, revision: string) {
  return Effect.gen(function* () {
    const result = yield* run(git, ["rev-parse", "--verify", "--end-of-options", `${revision}^{commit}`], worktree, 128)
    if (result.exitCode !== 0 || result.truncated) return yield* refuse("engagement-git", "commit resolution failed")
    const commit = commitText(result.stdout)
    if (!commit) return yield* refuse("engagement-git", "commit resolution failed")
    return commit
  })
}

function listTree(git: GitCli.Interface, worktree: string, commit: string) {
  return Effect.gen(function* () {
    const result = yield* run(git, ["ls-tree", "-r", "-l", "-z", "--full-tree", "--end-of-options", commit], worktree, metadataLimit + 1)
    if (result.exitCode !== 0 || result.truncated || result.stdout.byteLength > metadataLimit) return yield* refuse("engagement-list", "tree listing refused")
    const entries = parseListing(result.stdout)
    if (!entries) return yield* refuse("engagement-list", "tree listing refused")
    return entries
  })
}

function run(git: GitCli.Interface, args: readonly string[], worktree: string, maxOutputBytes: number) {
  return git.run([...args], { cwd: worktree, env: gitEnv, maxOutputBytes, timeout: gitTimeout })
}

function refuse(reason: string, detail: string) {
  return Effect.fail(new Tool.Failure({ message: `${reason}: ${detail}`, metadata: { reason } }))
}

function digest(commit: string, files: readonly File[], notExamined: readonly Skipped[]) {
  return createHash("sha256").update(JSON.stringify({ commit, files, notExamined })).digest("hex")
}

function boundedRevision(revision: string) {
  return revision.length > 0 && revision.length <= 1024 && !revision.startsWith("-") && !revision.includes("\0") && !revision.includes("\n") && !revision.includes("\r")
}

function boundedScope(paths: readonly string[]) {
  return paths.length > 0 && paths.length <= 256 && new Set(paths).size === paths.length && paths.every((item) => canonical(item, true))
}

function canonical(value: string, allowDot: boolean) {
  if (value.length === 0 || value.includes("\0") || value.includes("\\")) return false
  if (value === ".") return allowDot
  if (value.startsWith("/") || /^[A-Za-z]:/.test(value) || value.endsWith("/")) return false
  return value.split("/").every((part) => part.length > 0 && part !== "." && part !== "..")
}

function commitText(bytes: Uint8Array) {
  const text = decodeUtf8(bytes)
  if (text === undefined) return undefined
  const commit = text.endsWith("\n") ? text.slice(0, -1) : text
  if (!/^[0-9a-f]{40}$|^[0-9a-f]{64}$/.test(commit)) return undefined
  return commit
}

type Entry = { readonly kind: "file"; readonly file: File } | { readonly kind: "skip"; readonly skipped: Skipped }

function select(entries: readonly Entry[], prefixes: readonly string[]) {
  const absent = prefixes.some((prefix) => prefix !== "." && !entries.some((entry) => covers(prefix, entryPath(entry))))
  if (absent) return undefined
  const chosen = prefixes.includes(".") ? entries : entries.filter((entry) => prefixes.some((prefix) => covers(prefix, entryPath(entry))))
  return {
    files: byPath(chosen.flatMap((entry) => entry.kind === "file" ? [entry.file] : [])),
    notExamined: byPath(chosen.flatMap((entry) => entry.kind === "skip" ? [entry.skipped] : [])),
  }
}

function covers(prefix: string, filePath: string) {
  return filePath === prefix || filePath.startsWith(`${prefix}/`)
}
function entryPath(entry: Entry) {
  if (entry.kind === "file") return entry.file.path
  return entry.skipped.path
}

function byPath<T extends { readonly path: string }>(items: readonly T[]) {
  return [...items].sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0)
}

function parseListing(bytes: Uint8Array) {
  if (bytes.byteLength === 0) return [] as Entry[]
  if (bytes[bytes.byteLength - 1] !== 0) return undefined
  const seen = new Set<string>()
  const entries: Entry[] = []
  let start = 0
  for (let index = 0; index < bytes.byteLength; index++) {
    if (bytes[index] !== 0) continue
    const entry = parseEntry(bytes.subarray(start, index))
    if (!entry || seen.has(entryPath(entry))) return undefined
    seen.add(entryPath(entry))
    entries.push(entry)
    start = index + 1
  }
  if (start !== bytes.byteLength) return undefined
  return entries
}

function parseEntry(chunk: Uint8Array): Entry | undefined {
  const tab = chunk.indexOf(0x09)
  if (tab <= 0) return undefined
  const header = decodeUtf8(chunk.subarray(0, tab))
  const path = decodeUtf8(chunk.subarray(tab + 1))
  if (header === undefined || path === undefined || !canonical(path, false)) return undefined
  const match = /^(\S+) (\S+) (\S+) +(\S+)$/.exec(header)
  if (!match) return undefined
  const mode = match[1]
  const type = match[2]
  const oid = match[3]
  const size = match[4]
  if (!oid || !/^[0-9a-f]{40}$|^[0-9a-f]{64}$/.test(oid)) return undefined
  if (mode === "120000" && type === "blob" && parseSize(size) !== undefined) return { kind: "skip", skipped: { path, reason: "symlink" } }
  if (mode === "160000" && type === "commit" && size === "-") return { kind: "skip", skipped: { path, reason: "submodule" } }
  if ((mode === "100644" || mode === "100755") && type === "blob") {
    const parsed = parseSize(size)
    if (parsed === undefined) return undefined
    return { kind: "file", file: { path, oid, mode, size: parsed } }
  }
  return undefined
}

function parseSize(size: string | undefined) {
  if (!size || !/^(?:0|[1-9][0-9]*)$/.test(size)) return undefined
  const value = Number(size)
  if (!Number.isSafeInteger(value)) return undefined
  return value
}

function decodeUtf8(bytes: Uint8Array) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch {
    return undefined
  }
}
