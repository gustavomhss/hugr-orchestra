export * as ReviewScopedHistory from "./scoped-history"

import { createHash } from "node:crypto"
import { constants, type Dirent } from "node:fs"
import { chmod, lstat, mkdir, mkdtemp, open, opendir, realpath, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { Clock, Duration, Effect, Schema, type Scope } from "effect"
import { ResearchProcess } from "../research-toolkit/process"
import { Tool } from "../tool/tool"
import { ReviewGit } from "./git"
import { ReviewHistory } from "./history"

const Digest = Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/))
const Commit = Schema.String.check(Schema.isPattern(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/))
export const Envelope = Schema.Struct({
  schema: Schema.Literal("review-engagement-history-v1"), historyID: Digest,
  sourceSha256: Digest, anchorCommit: Commit,
  op: Schema.Literals(["show", "log", "pickaxe", "blame"]), path: Schema.String,
  selection: Schema.Struct({ endCommit: Commit, startCommit: Schema.optional(Commit) }),
  complete: Schema.Boolean, truncated: Schema.Boolean,
  notExamined: Schema.Array(Schema.Struct({ item: Schema.String, reason: Schema.String })),
  text: Schema.String,
})
export type Envelope = typeof Envelope.Type
export const Settlement = Schema.Struct({
  schema: Schema.Literal("review-engagement-history-settlement-v1"), historyID: Digest,
  uri: Schema.String, truncated: Schema.Boolean, resultSha256: Digest,
  resultBytes: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
})
export type Settlement = typeof Settlement.Type
export type Source = { readonly sha256: string; readonly commit: string; readonly files: readonly string[] }
export type Call = { readonly sessionID: string; readonly assistantMessageID: string; readonly toolCallID: string }
export type Context = {
  readonly repository: string
  readonly inputHash: string
  readonly source: Source
  readonly budget: { readonly startedAt: number; readonly deadlineAt: number }
  readonly call: Call
  readonly active: Effect.Effect<void, Tool.Failure>
}
export type Result = ReviewHistory.Result & { readonly result: Envelope }

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`
  if (value && typeof value === "object") return `{${Object.entries(value)
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`
  const text = JSON.stringify(value)
  if (text === undefined) throw failure("invalid-json")
  return text
}
export const hash = (value: Uint8Array | string) => createHash("sha256").update(value).digest("hex")
export const identity = (inputHash: string, sourceSha256: string, call: Call) => hash(canonical({
  schema: "review-engagement-history-operation-v1", inputHash, sourceSha256,
  sessionID: call.sessionID, assistantMessageID: call.assistantMessageID, toolCallID: call.toolCallID, name: "review_history",
}))

const FIELDS: Record<ReviewHistory.Input["op"], readonly string[]> = {
  show: ["path", "rev"], blame: ["path", "rev"], log: ["path", "rev", "range"],
  pickaxe: ["path", "rev", "range", "pattern", "regex"],
}

/** Pure grammar/file-authority check; native ancestry is established only by run's private object projection. */
export function selection(input: ReviewHistory.Input, source: Source): { endCommit: string; startCommit?: string } {
  if (!Schema.is(ReviewHistory.Input)(input) || !Schema.is(Commit)(source.commit)) throw failure("invalid-input")
  if (Object.keys(input).some((key) => key !== "op" && !FIELDS[input.op].includes(key))) throw failure("invalid-fields")
  if (typeof input.path !== "string" || !safePath(input.path) || !source.files.includes(input.path)) throw failure("path-refused")
  if (input.pattern !== undefined && (input.pattern.length === 0 || input.pattern.length > 4096 ||
    input.pattern.startsWith("-") || /[\u0000-\u001f\u007f]/u.test(input.pattern))) throw failure("pattern-refused")
  if (input.op === "pickaxe" && input.pattern === undefined) throw failure("pattern-required")
  if (input.range !== undefined && input.rev !== undefined) throw failure("revision-conflict")
  const oid = (value: string) => {
    if (!Schema.is(Commit)(value) || value.length !== source.commit.length) throw failure("revision-refused")
    return value
  }
  if (input.range !== undefined) {
    const parts = input.range.split("..")
    if (parts.length !== 2) throw failure("range-refused")
    return { startCommit: oid(parts[0]), endCommit: oid(parts[1]) }
  }
  return { endCommit: input.rev === undefined || input.rev === "HEAD" ? source.commit : oid(input.rev) }
}

function safePath(value: string) {
  return value.length > 0 && value.length <= 8192 && !value.startsWith("-") && !value.startsWith("/") &&
    !/[\\:*?\[\]{}\u0000-\u001f\u007f]/u.test(value) &&
    value.split("/").every((part) => part !== "" && part !== "." && part !== ".." && part.toLowerCase() !== ".git")
}

/** Projection retains whole normalized records; only show may end inside a logical source line. */
export const project = (result: Envelope): Envelope => bounded(result, ReviewHistory.Limits.textBytes, "model-output-limit")
export const settlement = (result: ReviewHistory.Result): Settlement => ({
  schema: "review-engagement-history-settlement-v1", historyID: result.historyID, uri: result.uri,
  truncated: result.truncated, resultSha256: hash(result.raw), resultBytes: Buffer.byteLength(result.raw),
})

function bounded(result: Envelope, maximum: number, reason: string): Envelope {
  if (result.text.length <= maximum && Buffer.byteLength(canonical(result)) <= maximum) return result
  const limited = { ...result, complete: false, truncated: true,
    notExamined: [...result.notExamined, { item: "output", reason }] }
  const source = result.text
  let low = 0
  let high = Math.min(source.length, maximum)
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    const text = prefix(source, middle, result.op !== "show")
    if (Buffer.byteLength(canonical({ ...limited, text })) <= maximum) low = middle
    else high = middle - 1
  }
  const value = { ...limited, text: prefix(source, low, result.op !== "show") }
  if (Buffer.byteLength(canonical(value)) > maximum) throw failure("envelope-limit")
  return value
}

function prefix(text: string, length: number, records: boolean) {
  if (length >= text.length) return text
  const end = length > 0 && /[\uD800-\uDBFF]/u.test(text[length - 1]) ? length - 1 : length
  const cut = text.slice(0, end)
  return records ? cut.slice(0, cut.lastIndexOf("\n") + 1) : cut
}

type Change = { oldMode: string; newMode: string; oldOID: string; newOID: string }
type Entry = { commit: string; parents: string[]; timestamp: string; authorID: string; change?: Change; patch: string }
const OBJECT_BYTES = 256 * 1024 * 1024
const OBJECT_FILES = 16_384
const META_BYTES = 1024 * 1024

export const run = Effect.fn("ReviewScopedHistory.run")(function* (input: ReviewHistory.Input, context: Context) {
  const selected = yield* Effect.try({ try: () => selection(input, context.source), catch: caught })
  if (!Schema.is(Digest)(context.inputHash) || !Schema.is(Digest)(context.source.sha256) ||
    !Number.isFinite(context.budget.startedAt) || !Number.isFinite(context.budget.deadlineAt) ||
    context.budget.deadlineAt <= context.budget.startedAt) return yield* failure("authority-invalid")
  const started = yield* Clock.currentTimeMillis
  const deadline = Math.min(context.budget.deadlineAt, started + ReviewHistory.Limits.timeoutMs)
  const active = Effect.gen(function* () {
    yield* context.active
    if ((yield* Clock.currentTimeMillis) >= deadline) return yield* failure("deadline")
  })
  const checked = <A, E, R>(effect: Effect.Effect<A, E, R>) => active.pipe(Effect.andThen(effect),
    Effect.flatMap((value) => active.pipe(Effect.as(value))))
  const io = <A>(read: () => Promise<A>) => checked(Effect.tryPromise({ try: read, catch: () => failure("repository-unavailable") }))
  // Register cleanup before the post-await fence can fail, including a deadline crossed during open/mkdtemp.
  const acquire: Acquire = (read, release) => Effect.acquireRelease(
    active.pipe(Effect.andThen(Effect.tryPromise({ try: read, catch: () => failure("repository-unavailable") }))),
    (value) => Effect.promise(() => release(value)),
  ).pipe(Effect.tap(() => active))
  yield* active
  return yield* Effect.scoped(Effect.gen(function* () {
    const root = yield* io(() => realpath(context.repository))
    const directory = yield* acquire(() => mkdtemp(path.join(tmpdir(), "orchestra-history-")),
      (value) => rm(value, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 }))
    yield* projection(root, directory, context.source.commit.length === 64, io, acquire)
    const git = (args: readonly string[], maxBytes = META_BYTES) => Effect.gen(function* () {
      yield* active
      const remaining = deadline - (yield* Clock.currentTimeMillis)
      const result = yield* checked(ResearchProcess.run({ command: "git", cwd: directory,
        args: ["--no-pager", "--literal-pathspecs", "--no-replace-objects", `--git-dir=${directory}`,
          "-c", "protocol.allow=never", "-c", "core.fsmonitor=false", "-c", "core.hooksPath=/dev/null",
          "-c", "core.attributesFile=/dev/null", "-c", "diff.external=", "-c", "credential.helper=", ...args],
        env: { ...ResearchProcess.environment(), ...ReviewGit.environment, GIT_ATTR_NOSYSTEM: "1", GIT_CONFIG_SYSTEM: "/dev/null" },
        timeoutMs: Math.max(1, remaining), maxBytes, capture: "head", maxRssBytes: 512 * 1024 * 1024,
      }))
      if (result.timedOut) return yield* failure("timeout")
      if (result.memoryExceeded || result.failure) return yield* failure("process-unavailable")
      return result
    })
    const exact = (args: readonly string[], maximum = META_BYTES) => git(args, maximum).pipe(Effect.flatMap((value) =>
      value.exitCode === 0 && !value.overflow && !value.stdout.truncated && !value.stderr.truncated
        ? Effect.succeed(value.stdout.data) : Effect.fail(failure("object-unavailable"))))
    // Native hash/integrity checking precedes every read from the copied store; filenames alone are not authority.
    yield* exact(["fsck", "--strict", "--no-reflogs", "--no-progress", "--no-dangling", context.source.commit])
    for (const commit of [...new Set([context.source.commit, selected.endCommit, ...(selected.startCommit ? [selected.startCommit] : [])])]) {
      const type = yield* exact(["cat-file", "-t", commit], 4096)
      if (type.toString("utf8").trim() !== "commit") return yield* failure("revision-not-commit")
    }
    for (const [ancestor, descendant] of [
      ...(selected.endCommit === context.source.commit ? [] : [[selected.endCommit, context.source.commit]]),
      ...(selected.startCommit ? [[selected.startCommit, selected.endCommit]] : []),
    ]) {
      const related = yield* git(["merge-base", "--is-ancestor", ancestor, descendant], 4096)
      if (related.exitCode !== 0 || related.overflow) return yield* failure("revision-not-ancestor")
    }
    const name = input.path!
    const tree = strictText(yield* exact(["ls-tree", "-z", "-l", "--full-tree", selected.endCommit, "--", name], 32 * 1024))
    const file = /^(100644|100755) blob ([0-9a-f]{40}|[0-9a-f]{64})\s+([0-9]+)\t([^\0]+)\0$/.exec(tree)
    if (!file || file[4] !== name || file[2].length !== context.source.commit.length) return yield* failure("path-not-regular")
    const historyID = identity(context.inputHash, context.source.sha256, context.call)
    const gaps: Array<{ item: string; reason: string }> = []
    const body = { schema: "review-engagement-history-v1" as const, historyID,
      sourceSha256: context.source.sha256, anchorCommit: context.source.commit, op: input.op, path: name,
      selection: selected, complete: true, truncated: false, notExamined: gaps, text: "" }
    const blob = input.op === "show" || input.op === "blame"
      ? yield* git(["cat-file", "blob", file[2]], ReviewHistory.Limits.rawBytes) : undefined
    if (blob && blob.exitCode !== 0 && !blob.overflow) return yield* failure("object-unavailable")
    const blobTruncated = blob !== undefined && (blob.overflow || blob.stdout.truncated)
    const sourceText = blob ? safeBlob(blob.stdout.data, blobTruncated) : ""
    if (blobTruncated) gaps.push({ item: "blob", reason: "native-output-limit" })
    let text = sourceText
    let truncated = blobTruncated
    if (input.op !== "show") {
      // Bound graph discovery before applying a path filter: unchanged commits also spend the walk budget.
      const walked = strictText(yield* exact(["rev-list", "--topo-order", `--max-count=${ReviewHistory.Limits.commits}`,
        "--parents", selected.endCommit, ...(selected.startCommit ? [`^${selected.startCommit}`] : [])]))
        .trim().split("\n").filter(Boolean).map((line) => line.split(" "))
      if (walked.some((row) => row.some((oid) => !Schema.is(Commit)(oid) || oid.length !== context.source.commit.length)))
        return yield* failure("graph-invalid")
      const ids = walked.map((row) => row[0])
      const parents = new Map(walked.map(([commit, ...rest]) => [commit, rest]))
      const visited = new Set(ids)
      if (walked.length === ReviewHistory.Limits.commits && walked.some((row) => row.slice(1).some((parent) =>
        !visited.has(parent) && parent !== selected.startCommit))) gaps.push({ item: "ancestry", reason: "commit-limit" })
      const metadata = ids.length ? yield* git([
        "log", "--no-walk=unsorted", "--no-show-signature", "--no-mailmap", "--no-color", "--no-ext-diff", "--no-textconv",
        "--no-renames", "--no-abbrev", "--full-index", "--root", "--raw", "-z", "--diff-merges=separate",
        "--format=%x1e%H%x00%P%x00%ct%x00%an%x00%ae%x00",
        ...(input.op === "blame" ? ["--patch", "--unified=0", "--diff-algorithm=myers", "--no-indent-heuristic"] : []),
        "--end-of-options", ...ids, "--", name,
      ], ReviewHistory.Limits.rawBytes) : undefined
      if (metadata && metadata.exitCode !== 0 && !metadata.overflow) return yield* failure("history-unavailable")
      const partial = metadata !== undefined && (metadata.overflow || metadata.stdout.truncated)
      if (partial) gaps.push({ item: "history", reason: "native-output-limit" })
      truncated = truncated || partial
      const entries = metadata ? parseEntries(metadata.stdout.data, partial, name, context.source.commit.length) : []
      const byID = new Map(entries.map((entry) => [entry.commit, entry]))
      const admitted: Entry[] = []
      for (const commit of ids) {
        const entry = byID.get(commit)
        if (!entry?.change) continue
        if (entry.parents.length > 1) {
          gaps.push({ item: "ancestry", reason: "merge-attribution-boundary" })
          break
        }
        if (!regular(entry.change.newMode)) {
          gaps.push({ item: "ancestry", reason: "nonregular-path-boundary" })
          break
        }
        admitted.push(entry)
        if (!regular(entry.change.oldMode) && entry.parents.length > 0) {
          gaps.push({ item: "ancestry", reason: "path-origin-boundary" })
          break
        }
      }
      if (input.op === "log") text = admitted.map(record).join("")
      if (input.op === "pickaxe") {
        const picked = admitted.length ? yield* exact([
          "log", "--no-walk=unsorted", "--no-show-signature", "--no-mailmap", "--no-color", "--no-ext-diff", "--no-textconv",
          "--no-renames", "--root", "--format=%H", `-${input.regex ? "G" : "S"}${input.pattern}`,
          "--end-of-options", ...admitted.map((entry) => entry.commit), "--", name,
        ]) : Buffer.alloc(0)
        const matches = new Set(strictText(picked).trim().split("\n").filter(Boolean))
        if ([...matches].some((oid) => !admitted.some((entry) => entry.commit === oid))) return yield* failure("pickaxe-invalid")
        text = admitted.filter((entry) => matches.has(entry.commit)).map(record).join("")
      }
      if (input.op === "blame") {
        const lines = sourceText.split("\n")
        if (lines.at(-1) === "") lines.pop()
        const points = lines.map((line, index) => ({ line: index + 1, text: line, current: index + 1,
          attribution: undefined as Pick<Entry, "commit" | "timestamp" | "authorID"> | undefined }))
        let current = selected.endCommit
        let currentBlob = file[2]
        for (let count = 0; count < ReviewHistory.Limits.commits && points.some((point) => !point.attribution); count++) {
          const ancestry = parents.get(current)
          if (!ancestry) { gaps.push({ item: "attribution", reason: "commit-limit" }); break }
          if (ancestry.length > 1) { gaps.push({ item: "attribution", reason: "merge-attribution-boundary" }); break }
          const entry = byID.get(current)
          if (entry?.change) {
            const change = entry.change
            if (change.newOID !== currentBlob || !regular(change.newMode)) {
              gaps.push({ item: "attribution", reason: "path-state-boundary" }); break
            }
            if (ancestry.length === 0) {
              for (const point of points) if (!point.attribution) point.attribution = entry
              break
            }
            if (!regular(change.oldMode)) { gaps.push({ item: "attribution", reason: "path-origin-boundary" }); break }
            const hunks = [...entry.patch.matchAll(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/gm)]
              .map((match) => ({ old: Number(match[1]), oldCount: Number(match[2] ?? 1), next: Number(match[3]), count: Number(match[4] ?? 1) }))
            if (!hunks.length && change.oldOID !== change.newOID) { gaps.push({ item: "attribution", reason: "unsupported-diff" }); break }
            for (const point of points) {
              if (point.attribution) continue
              const changed = hunks.some((hunk) => hunk.count > 0 && point.current >= hunk.next && point.current < hunk.next + hunk.count)
              if (changed) { point.attribution = entry; continue }
              point.current += hunks.filter((hunk) => hunk.count === 0 ? point.current > hunk.next : point.current >= hunk.next + hunk.count)
                .reduce((sum, hunk) => sum + hunk.oldCount - hunk.count, 0)
            }
            currentBlob = change.oldOID
          }
          if (!ancestry.length) { gaps.push({ item: "attribution", reason: "origin-unavailable" }); break }
          current = ancestry[0]
        }
        if (points.some((point) => !point.attribution) && !gaps.some((gap) => gap.item === "attribution"))
          gaps.push({ item: "attribution", reason: "bounded-attribution" })
        text = points.map((point) => canonical({ line: point.line, text: point.text,
          ...(point.attribution ? { commit: point.attribution.commit, timestamp: point.attribution.timestamp, authorID: point.attribution.authorID } : {}) }) + "\n").join("")
      }
    }
    yield* active
    const result = bounded({ ...body, text, truncated, complete: gaps.length === 0,
      notExamined: [...new Map(gaps.map((gap) => [canonical(gap), gap])).values()] }, ReviewHistory.Limits.rawBytes, "retained-output-limit")
    const model = project(result)
    yield* active
    return { result, historyID, text: canonical(model), raw: canonical(result),
      truncated: model.truncated, uri: ReviewHistory.uri(context.call.sessionID, historyID), argv: [] } satisfies Result
  })).pipe(Effect.timeoutOrElse({ duration: Duration.millis(Math.max(1, deadline - started)),
    orElse: () => Effect.fail(failure("timeout")) }), Effect.mapError(caught),
    Effect.catchDefect((error) => Effect.fail(caught(error))))
})

const regular = (mode: string) => mode === "100644" || mode === "100755"
const record = (entry: Entry) => canonical({ commit: entry.commit, timestamp: entry.timestamp, authorID: entry.authorID }) + "\n"

function parseEntries(bytes: Buffer, partial: boolean, name: string, width: number): Entry[] {
  const parts = strictText(bytes, partial).split("\x1e").slice(1)
  if (partial) parts.pop()
  return parts.map((part) => {
    const fields = part.split("\0")
    if (fields.length < 6 || !Schema.is(Commit)(fields[0]) || fields[0].length !== width || !/^-?\d+$/.test(fields[2]))
      throw failure("history-format")
    const parents = fields[1].split(" ").filter(Boolean)
    if (parents.some((oid) => !Schema.is(Commit)(oid) || oid.length !== width)) throw failure("history-format")
    const timestamp = new Date(Number(fields[2]) * 1000).toISOString()
    const remainder = fields.slice(5).join("\0")
    const raw = /(?:^|[\n\0]):([0-7]{6}) ([0-7]{6}) ([0-9a-f]+) ([0-9a-f]+) [A-Z][0-9]*\0([^\0]+)\0/.exec(remainder)
    if (raw && (raw[5] !== name || raw[3].length !== width || raw[4].length !== width)) throw failure("history-path")
    return { commit: fields[0], parents, timestamp, authorID: hash(canonical({ name: fields[3], email: fields[4] })),
      ...(raw ? { change: { oldMode: raw[1], newMode: raw[2], oldOID: raw[3], newOID: raw[4] } } : {}), patch: remainder }
  })
}

function strictText(bytes: Uint8Array, partial = false) {
  // Only a proven capture boundary may end in an incomplete code point. Invalid interior UTF-8 still fails.
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes, { stream: partial })
  } catch {
    throw failure("unsupported-encoding")
  }
}

function safeBlob(bytes: Buffer, partial: boolean) {
  if (bytes.includes(0)) throw failure("unsupported-binary")
  return strictText(bytes, partial)
}

function failure(reason: string) {
  return new Tool.Failure({ message: `engagement-history-${reason}`, metadata: { reason: `engagement-history-${reason}` } })
}
const caught = (error: unknown): Tool.Failure => error instanceof Tool.Failure ? error : failure("unavailable")

type IO = <A>(read: () => Promise<A>) => Effect.Effect<A, Tool.Failure>
type Acquire = <A>(read: () => Promise<A>, release: (value: A) => Promise<unknown>) => Effect.Effect<A, Tool.Failure, Scope.Scope>

/** Git never opens the original config or object directories. The private projection contains no graph overlays. */
const projection = (root: string, destination: string, sha256: boolean, io: IO, acquire: Acquire) => Effect.gen(function* () {
  const readDirectory = (directory: string, limit: number) => Effect.scoped(Effect.gen(function* () {
    const reader = yield* acquire(() => opendir(directory), (handle) => handle.close())
    const entries: Dirent[] = []
    for (;;) {
      const entry = yield* io(() => reader.read())
      if (!entry) return entries
      if (entries.length >= limit) return yield* failure("object-store-limit")
      entries.push(entry)
    }
  }))
  const readSmall = (filename: string) => Effect.scoped(Effect.gen(function* () {
    const named = yield* io(() => lstat(filename))
    if (!named.isFile() || named.isSymbolicLink() || named.size > META_BYTES) return yield* failure("metadata-refused")
    // Nonblocking open also closes the lstat/open race when an attacker substitutes a FIFO or device.
    const file = yield* acquire(() => open(filename, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK), (handle) => handle.close())
    const before = yield* io(() => file.stat())
    if (!before.isFile() || before.size > META_BYTES || stamp(named) !== stamp(before)) return yield* failure("metadata-refused")
    const bytes = Buffer.alloc(before.size)
    let offset = 0
    while (offset < before.size) {
      const chunk = yield* io(() => file.read(bytes, offset, before.size - offset, offset))
      if (!chunk.bytesRead) return yield* failure("metadata-changed")
      offset += chunk.bytesRead
    }
    const after = yield* io(() => file.stat())
    if (stamp(before) !== stamp(after)) return yield* failure("metadata-changed")
    return strictText(bytes)
  }))
  const exists = (filename: string) => io(() => lstat(filename).then(() => true, (error: unknown) => {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return false
    throw error
  }))
  const marker = path.join(root, ".git")
  const kind = yield* io(() => lstat(marker))
  if (kind.isSymbolicLink()) return yield* failure("git-directory-refused")
  const link = kind.isDirectory() ? undefined : /^gitdir: ([^\r\n]+)\r?\n?$/.exec(yield* readSmall(marker))
  if (!kind.isDirectory() && !link) return yield* failure("git-directory-refused")
  const directory = yield* io(() => realpath(link ? path.resolve(root, link[1]) : marker))
  const commonLink = path.join(directory, "commondir")
  const commonValue = (yield* exists(commonLink)) ? (yield* readSmall(commonLink)).trim() : undefined
  const common = commonValue === undefined ? directory : yield* io(() => realpath(path.resolve(directory, commonValue)))
  for (const location of [...new Set([directory, common])]) {
    for (const filename of ["shallow", "info/grafts", "objects/info/alternates", "objects/info/http-alternates", "config.worktree"])
      if (yield* exists(path.join(location, filename))) return yield* failure("graph-overlay-refused")
    const config = path.join(location, "config")
    if (yield* exists(config)) {
      const value = yield* readSmall(config)
      if (/^\s*\[\s*include(?:if)?\b/im.test(value)) return yield* failure("config-include-refused")
    }
  }
  const objects = path.join(common, "objects")
  const objectRoot = yield* io(() => realpath(objects))
  if (objectRoot !== objects) return yield* failure("object-directory-refused")
  yield* io(() => mkdir(path.join(destination, "objects", "pack"), { recursive: true }))
  yield* io(() => mkdir(path.join(destination, "refs")))
  yield* io(() => writeFile(path.join(destination, "HEAD"), "ref: refs/heads/history\n", { flag: "wx" }))
  yield* io(() => writeFile(path.join(destination, "config"), sha256
    ? "[core]\nrepositoryformatversion = 1\nbare = true\n[extensions]\nobjectFormat = sha256\n"
    : "[core]\nrepositoryformatversion = 0\nbare = true\n", { flag: "wx" }))
  const budget = { files: 0, bytes: 0 }
  const directories = yield* readDirectory(objects, 258)
  for (const folder of directories) {
    if (folder.name === "info") continue
    if (folder.name !== "pack" && !/^[0-9a-f]{2}$/.test(folder.name)) return yield* failure("object-layout-refused")
    if (!folder.isDirectory() || folder.isSymbolicLink()) return yield* failure("object-directory-refused")
    const parent = path.join(objects, folder.name)
    if ((yield* io(() => realpath(parent))) !== parent) return yield* failure("object-directory-refused")
    yield* io(() => mkdir(path.join(destination, "objects", folder.name), { recursive: true }))
    for (const entry of yield* readDirectory(parent, OBJECT_FILES - budget.files)) {
      budget.files++
      if (folder.name === "pack" && /^pack-[0-9a-f]+\.keep$/.test(entry.name)) continue
      const allowed = folder.name === "pack" ? /^pack-(?:[0-9a-f]{40}|[0-9a-f]{64})\.(?:pack|idx|rev|bitmap)$/.test(entry.name)
        : new RegExp(`^[0-9a-f]{${sha256 ? 62 : 38}}$`).test(entry.name)
      if (!allowed || !entry.isFile() || entry.isSymbolicLink()) return yield* failure("object-file-refused")
      yield* Effect.scoped(Effect.gen(function* () {
        const from = path.join(parent, entry.name)
        const to = path.join(destination, "objects", folder.name, entry.name)
        const source = yield* acquire(() => open(from, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK), (handle) => handle.close())
        const before = yield* io(() => source.stat())
        if (!before.isFile() || before.size < 0 || before.size + budget.bytes > OBJECT_BYTES) return yield* failure("object-store-limit")
        budget.bytes += before.size
        const target = yield* acquire(() => open(to, "wx", 0o600), (handle) => handle.close())
        const buffer = Buffer.alloc(Math.min(1024 * 1024, Math.max(1, before.size)))
        let offset = 0
        while (offset < before.size) {
          const chunk = yield* io(() => source.read(buffer, 0, Math.min(buffer.length, before.size - offset), offset))
          if (chunk.bytesRead <= 0) return yield* failure("object-changed")
          let written = 0
          while (written < chunk.bytesRead) {
            const output = yield* io(() => target.write(buffer, written, chunk.bytesRead - written, offset + written))
            if (!output.bytesWritten) return yield* failure("object-publication")
            written += output.bytesWritten
          }
          offset += chunk.bytesRead
        }
        const after = yield* io(() => source.stat())
        if (stamp(before) !== stamp(after) || (yield* io(() => realpath(parent))) !== parent) return yield* failure("object-changed")
      }))
      yield* io(() => chmod(path.join(destination, "objects", folder.name, entry.name), 0o400))
    }
  }
})

function stamp(value: { dev: number; ino: number; size: number; mtimeMs: number; ctimeMs: number }) {
  return [value.dev, value.ino, value.size, value.mtimeMs, value.ctimeMs].join(":")
}
