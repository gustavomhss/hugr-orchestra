export * as ReviewCodeSource from "./code-source"

import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { Effect } from "effect"
import { Research } from "@orchestra/schema/research"
import { CodeIndexShard } from "../research-toolkit/code-index/shard"
import { ResearchToolkit } from "../research-toolkit/index"
import type { ReviewTools } from "./tools"

const unavailable = (message: string) => new Research.Error({ code: "source_unavailable", message })
const invalid = (message: string) => new Research.Error({ code: "reference_invalid", message })
const OBJECT = /^[0-9a-f]{40}$|^[0-9a-f]{64}$/
const BATCH_BYTES = 8 * 1024 * 1024

export type View = {
  readonly worktree: string
  readonly tree: string
  readonly commit?: string
  readonly git: CodeIndexShard.Git
  readonly files: CodeIndexShard.Tree
}

/** Only host-captured object identities authorize CODE reads. The shared probe directory is never read. */
export const open = (source: ReviewTools.CodeSource) => Effect.gen(function* () {
  if (!source.commit && !source.tree) return yield* unavailable("review source has no immutable Git tree identity")
  const resolved = yield* CodeIndexShard.resolveTree(source.worktree, source.commit ?? source.tree!)
  if (source.tree !== undefined && source.tree !== resolved.tree)
    return yield* unavailable("review source tree does not match its captured object")
  const git = source.commit ? yield* CodeIndexShard.captured(source.worktree, source.commit) : resolved.git
  const files = yield* CodeIndexShard.tree(git, resolved.tree)
  return {
    worktree: source.worktree, tree: resolved.tree, git, files,
    ...(source.commit ? { commit: source.commit } : {}),
  } satisfies View
})

/** A caller's path or narrowing glob must remain in the captured repository on either host platform. */
export function relative(worktree: string, value: string, glob = false): string | undefined {
  const negative = glob && value.startsWith("!")
  const input = negative ? value.slice(1) : value
  if (!input || input.includes("\0") || input.split(/[\\/]/).some((part) => part === ".." || part.toLowerCase() === ".git")) return
  if (process.platform !== "win32" && (/^[a-z]:/i.test(input) || (path.win32.isAbsolute(input) && !path.posix.isAbsolute(input)))) return
  const normalized = path.isAbsolute(input) ? path.relative(worktree, input) : input
  if (path.isAbsolute(normalized) || normalized === ".." || normalized.startsWith(`..${path.sep}`)) return
  const result = normalized.replaceAll("\\", "/").replace(/^(?:\.\/)+/, "") || "."
  return `${negative ? "!" : ""}${result}`
}

/** Explicitly naming a link cannot become a successful search of an absent directory. */
export const checkPaths = (view: View, paths: ReadonlyArray<string>) => Effect.gen(function* () {
  const links = [...view.files.blobs.keys()].filter((file) => !view.files.regular?.has(file))
  if (paths.some((file) => !file.startsWith("!") && links.some((link) => file === link || file.startsWith(`${link}/`))))
    return yield* invalid("review CODE path traverses a captured symbolic link")
})

/** Locate rereads raw captured blobs, not either filesystem copy; missing/invalid bytes are explicit failures. */
export const read = (view: View, file: string) => Effect.gen(function* () {
  if (relative(view.worktree, file) !== file || !view.files.regular?.has(file))
    return yield* invalid("review CODE range is outside the captured regular files")
  const bytes = (yield* CodeIndexShard.bytes(view.git, view.files, [file])).get(file)
  if (!bytes) return yield* unavailable("captured range bytes are missing")
  return yield* Effect.try({
    try: () => new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes),
    catch: () => unavailable("captured range is not lossless UTF-8 text"),
  })
})

/** A separate, scoped regular-file projection for ripgrep. Probe writes and repository links never enter it. */
export const project = (view: View) => Effect.gen(function* () {
  const caps = yield* ResearchToolkit.Caps
  const listing = yield* view.git.run(["ls-tree", "-r", "-l", "-z", "--full-tree", view.tree])
  const entries = yield* Effect.try({ try: () => parse(listing), catch: () => unavailable("captured tree listing is invalid") })
  const total = entries.reduce((sum, entry) => sum + entry.size, 0)
  if (!Number.isSafeInteger(total) || total > caps.scratchBytes || entries.some((entry) => entry.size >= 2 * BATCH_BYTES))
    return yield* unavailable("captured CODE tree exceeds its source byte limit")
  const directory = yield* Effect.acquireRelease(
    Effect.tryPromise({
      try: async () => fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "orchestra-review-code-"))),
      catch: () => unavailable("CODE projection directory is unavailable"),
    }),
    (root) => Effect.promise(() => fs.rm(root, { recursive: true, force: true })),
  )
  const regular = entries.filter((entry) => entry.mode === "100644" || entry.mode === "100755")
  const batches = regular.reduce<Array<{ bytes: number; paths: string[] }>>((groups, entry) => {
    const last = groups.at(-1)
    if (last && last.bytes + entry.size <= BATCH_BYTES) {
      last.bytes += entry.size
      last.paths.push(entry.path)
      return groups
    }
    groups.push({ bytes: entry.size, paths: [entry.path] })
    return groups
  }, [])
  yield* Effect.forEach(batches, (batch) => Effect.gen(function* () {
    const bytes = yield* CodeIndexShard.bytes(view.git, view.files, batch.paths)
    yield* Effect.forEach(batch.paths, (file) => Effect.uninterruptibleMask((restore) => Effect.gen(function* () {
      const target = path.join(directory, file)
      // Finish a native mkdir before cancellation can remove the projection; no detached mkdir may recreate it.
      yield* Effect.tryPromise({ try: () => fs.mkdir(path.dirname(target), { recursive: true }),
        catch: () => unavailable("captured CODE directory could not be projected") })
      // Exclusive writes also refuse case aliases on case-insensitive filesystems.
      yield* restore(Effect.tryPromise({
        try: (signal) => fs.writeFile(target, bytes.get(file)!, { flag: "wx", mode: 0o600, signal }),
        catch: () => unavailable("captured CODE bytes could not be projected"),
      }))
    })), { concurrency: 8, discard: true })
  }), { discard: true })
  return {
    directory,
    skipped: entries.filter((entry) => entry.mode !== "100644" && entry.mode !== "100755")
      .map((entry) => ({ path: entry.path, reason: entry.mode === "120000" ? "symbolic-link-not-followed" : "submodule-not-captured" })),
  }
})

function parse(listing: Buffer) {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(listing)
  const records = text.split("\0")
  if (records.at(-1) !== "") throw new Error("incomplete tree")
  const entries = records.slice(0, -1).map((record) => {
    const tab = record.indexOf("\t")
    const fields = /^(100644|100755|120000|160000) (blob|commit) (\S+) +([0-9]+|-)$/.exec(record.slice(0, tab))
    if (tab < 0 || !fields || !OBJECT.test(fields[3])) throw new Error("invalid tree entry")
    const file = record.slice(tab + 1)
    const parts = file.split("/")
    if (parts.some((part) => !part || part === "." || part === ".." || part.toLowerCase() === ".git") ||
      path.posix.isAbsolute(file) || /[\\\0]/.test(file) || (process.platform === "win32" &&
        (/[<>:"|?*]/.test(file) || parts.some((part) => /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)))))
      throw new Error("invalid tree path")
    const link = fields[1] === "160000"
    const size = link ? 0 : Number(fields[4])
    if (link ? fields[2] !== "commit" || fields[4] !== "-" : fields[2] !== "blob" || !Number.isSafeInteger(size) || size < 0)
      throw new Error("invalid tree size")
    return { path: file, mode: fields[1], size }
  })
  const paths = new Set(entries.map((entry) => entry.path))
  if (paths.size !== entries.length || entries.some((entry) => entry.path.split("/").slice(0, -1)
    .some((_, index) => paths.has(entry.path.split("/").slice(0, index + 1).join("/"))))) throw new Error("conflicting tree paths")
  return entries
}
