export * as ReviewEngagementEvidence from "./engagement-evidence"

import { createHash } from "crypto"
import { constants, type Stats } from "fs"
import { lstat, open, realpath } from "fs/promises"
import path from "path"
import { Effect, Schema } from "effect"
import { Probe } from "../research-toolkit/probe/types"
import type { ResearchProcess } from "../research-toolkit/process"
import type { ReviewAnalyze } from "./analyze"
import type { ReviewNoise } from "./noise"
import type { ReviewOxlintInput } from "./packs/oxlint-input"
import { ReviewPackOxlint } from "./packs/oxlint"

export const UNQUALIFIED = "engagement-evidence-scope-unqualified"
export const MISMATCH = "engagement-evidence-source-mismatch"

type File = { readonly path: string; readonly oid: string; readonly mode: "100644" | "100755"; readonly size: number }
type Runtime = {
  readonly id: "oxlint"
  readonly pinnedVersion: "1.91.0"
  readonly target: "linux-x64"
  readonly executableSha256: string
}
export type Recipe = {
  readonly schema: "review-engagement-analyzer-recipe-v1"
  readonly analysisOperationID: string
  readonly invocationID: string
  readonly pack: "oxlint"
  readonly template: "oxlint-host-sarif"
  readonly sourceSha256: string
  readonly side: "head" | "base"
  readonly runtime: Runtime
  readonly files: readonly { readonly path: string; readonly oid: string; readonly sha256: string; readonly bytes: number }[]
  readonly rules: readonly string[]
  readonly config: { readonly sha256: string; readonly bytes: number }
  readonly invocation: {
    readonly argv: readonly (
      | { readonly kind: "runtime" }
      | { readonly kind: "literal"; readonly value: string }
      | { readonly kind: "source"; readonly path: string }
      | { readonly kind: "config"; readonly path: ".host/oxlint.json" }
    )[]
    readonly cwd: "projection"
    readonly environment: "oxlint-host-sanitized-v1"
    readonly network: false
    readonly repositoryExecution: false
    readonly write: readonly []
  }
  readonly limits: { readonly timeoutMs: number; readonly maxBytes: number; readonly maxRssBytes: number }
}
export type EvidenceEvent =
  | {
      readonly phase: "prepared"
      readonly analysisID: string
      readonly invocationID: string
      readonly side: "head" | "base"
      readonly sourceSha256: string
      readonly runtime: Runtime
      readonly inputs: readonly { readonly path: string; readonly oid: string; readonly sha256: string; readonly data: Uint8Array }[]
      readonly config: Uint8Array
      readonly pathMap: Uint8Array
      readonly recipe: Recipe
    }
  | {
      readonly phase: "outcome"
      readonly analysisID: string
      readonly invocationID: string
      readonly side: "head" | "base"
      readonly outcome: ResearchProcess.Outcome
      readonly stdoutURI: string
      readonly pathMapURI: string
    }
  | {
      readonly phase: "analysis"
      readonly analysisID: string
      readonly sourceSha256: string
      readonly result: ReviewAnalyze.Result
      readonly retained: { readonly uri: string; readonly data: Uint8Array }
      readonly debt: { readonly uri: string; readonly data: Uint8Array }
    }
export type Evidence = {
  readonly analysisID: string
  readonly source: { readonly sha256: string; readonly files: readonly File[] }
  readonly observe: (event: EvidenceEvent) => Effect.Effect<void, ReviewAnalyze.Failed>
}

/** Existing repository admission is shared with the stricter host evidence manifest. */
export function repositoryAdmitted(input: ReviewAnalyze.RunInput) {
  const listed = input.repositoryFiles
  if (listed === undefined || listed.length === 0 || input.scope !== "files") return false
  if (input.head === undefined || !/^[0-9a-f]{40}$|^[0-9a-f]{64}$/.test(input.head) || input.base !== input.head) return false
  if (input.profile !== "audit" && input.profile !== "diligence" && input.profile !== "artifact" && input.profile !== "compliance") return false
  if (!sameFileSet(input.files, listed) || !listed.every(canonicalFile)) return false
  return Object.values(input.changed).every((ranges) => ranges.length === 0)
}

export function sourceAdmitted(input: ReviewAnalyze.RunInput) {
  const evidence = input.evidence
  if (!evidence) return true
  return repositoryAdmitted(input) && /^[0-9a-f]{64}$/.test(evidence.analysisID) &&
    /^[0-9a-f]{64}$/.test(evidence.source.sha256) &&
    sameFileSet(evidence.source.files.map((file) => file.path), input.repositoryFiles ?? []) &&
    evidence.source.files.every((file) => canonicalFile(file.path) && /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/.test(file.oid) &&
      (file.mode === "100644" || file.mode === "100755") && Number.isSafeInteger(file.size) && file.size >= 0)
}

function sameFileSet(files: ReadonlyArray<string> | undefined, listed: ReadonlyArray<string>) {
  return files !== undefined && files.length === listed.length && new Set(files).size === files.length && files.every((file) => listed.includes(file))
}

function canonicalFile(file: string) {
  if (file.includes("\0") || file.includes("\\") || /^[A-Za-z]:/.test(file) || file.startsWith("/")) return false
  return file.split("/").every((part) => part !== "" && part !== "." && part !== "..")
}

export function qualified(pack: ReviewAnalyze.Pack) {
  return pack.id === ReviewPackOxlint.manifest.id && pack.version === ReviewPackOxlint.manifest.version &&
    pack.backend === "pinned" && pack.lane === "no-build" && pack.template === ReviewPackOxlint.templateId &&
    pack.output.format === "sarif"
}

export function unavailable(check: Pick<ReviewAnalyze.Check, "id" | "pack" | "version" | "lane">): ReviewAnalyze.Check {
  return { ...check, status: "not-run", reason: UNQUALIFIED, workspaceExecuted: false }
}

export function impactUnavailable() {
  return { ranges: {}, check: unavailable({ id: "repo:blast-radius", pack: "repo", version: "review-v2", lane: "no-build" }) }
}

/** Keep the producer's exact serialized bodies beside their returned references; never reopen a supplied URI. */
export const retain = Effect.fnUntraced(function* (context: ReviewAnalyze.RunContext, value: ReviewNoise.Result) {
  const retained = Buffer.from(JSON.stringify(value.retained))
  const debt = Buffer.from(JSON.stringify(value.debt))
  const retainedURI = yield* context.write("retained.json", retained)
  const debtURI = yield* context.write("debt.json", debt)
  return {
    result: {
      items: value.items,
      retained: { uri: retainedURI, total: value.retained.total, unread: value.retained.unread },
      debt: { uri: debtURI, total: value.debt.length },
    },
    retained: { uri: retainedURI, data: retained },
    debt: { uri: debtURI, data: debt },
  }
})

export const complete = Effect.fnUntraced(function* (
  context: ReviewAnalyze.RunContext,
  checks: ReviewAnalyze.Check[],
  written: Effect.Success<ReturnType<typeof retain>>,
) {
  const result: ReviewAnalyze.Result = { checks, ...written.result }
  const evidence = context.input.evidence
  if (evidence) yield* evidence.observe({
    phase: "analysis", analysisID: evidence.analysisID, sourceSha256: evidence.source.sha256,
    result, retained: written.retained, debt: written.debt,
  })
  return result
})

class SourceMismatch extends Schema.TaggedErrorClass<SourceMismatch>()("ReviewEngagementEvidence.SourceMismatch", {}) {}

/** A prepared observation is provisional until the same invocation produces an outcome. */
export const prepare = Effect.fnUntraced(function* (input: {
  readonly evidence: Evidence
  readonly projected: ReviewOxlintInput.Prepared
  readonly executable: string
  readonly argv: readonly string[]
  readonly side: "head" | "base"
  readonly timeoutMs: number
}) {
  const manifest = new Map(input.evidence.source.files.map((file) => [file.path, file]))
  const captures = yield* Effect.forEach(input.projected.paths, (entry, index) => Effect.gen(function* () {
    const expected = manifest.get(entry.path)
    const file = input.projected.files[index]
    if (!expected || entry.file !== entry.path || !canonicalFile(entry.path) ||
      file !== path.join(input.projected.root, ...entry.path.split("/")) || expected.size > MAX_INPUT_BYTES)
      return yield* new SourceMismatch()
    const captured = yield* read(file, MAX_INPUT_BYTES, true)
    if (captured.data.byteLength !== expected.size ||
      ((captured.mode & 0o111) !== 0) !== (expected.mode === "100755") ||
      createHash(expected.oid.length === 64 ? "sha256" : "sha1")
        .update("blob " + captured.data.byteLength + "\0").update(captured.data).digest("hex") !== expected.oid)
      return yield* new SourceMismatch()
    return { captured, input: { path: entry.path, oid: expected.oid, sha256: captured.sha256, data: captured.data } }
  }), { concurrency: 1 })
  if (captures.reduce((bytes, item) => bytes + item.input.data.byteLength, 0) > MAX_INPUT_BYTES ||
    new Set(captures.map((item) => item.input.path)).size !== captures.length)
    return yield* new SourceMismatch()
  const allowedRules = new Set<string>(ReviewPackOxlint.RULES)
  if (!input.projected.rules.length || input.projected.rules.some((rule) => !allowedRules.has(rule)))
    return yield* new SourceMismatch()
  const expectedConfig = Buffer.from(JSON.stringify({
    plugins: ["eslint", "typescript"],
    rules: Object.fromEntries(input.projected.rules.map((rule) => [rule.replace("(", "/").replace(/\)$/, ""), "error"])),
  }))
  const config = yield* read(input.projected.config, expectedConfig.byteLength, true)
  if (!config.data.equals(expectedConfig)) return yield* new SourceMismatch()
  const executable = yield* read(input.executable, Probe.Limits.rssBytes, false)
  if ((executable.mode & 0o111) === 0 || input.argv[0] !== input.executable) return yield* new SourceMismatch()
  const runtime: Runtime = {
    id: "oxlint", pinnedVersion: "1.91.0", target: "linux-x64", executableSha256: executable.sha256,
  }
  const invocationID = Bun.randomUUIDv7()
  const pathMap = Buffer.from(JSON.stringify({ version: "oxlint-projection-v1", paths: input.projected.paths }))
  const files = new Map(input.projected.files.map((file, index) => [file, captures[index].input.path]))
  const argv = input.argv.map((value, index): Recipe["invocation"]["argv"][number] => {
    if (index === 0) return { kind: "runtime" }
    if (value === input.projected.config) return { kind: "config", path: ".host/oxlint.json" }
    const file = files.get(value)
    return file === undefined ? { kind: "literal", value } : { kind: "source", path: file }
  })
  const recipe: Recipe = {
    schema: "review-engagement-analyzer-recipe-v1", analysisOperationID: input.evidence.analysisID,
    invocationID, pack: "oxlint", template: "oxlint-host-sarif", sourceSha256: input.evidence.source.sha256,
    side: input.side, runtime,
    files: captures.map((item) => ({
      path: item.input.path, oid: item.input.oid, sha256: item.input.sha256, bytes: item.input.data.byteLength,
    })),
    rules: [...input.projected.rules], config: { sha256: config.sha256, bytes: config.data.byteLength },
    invocation: {
      argv, cwd: "projection", environment: "oxlint-host-sanitized-v1",
      network: false, repositoryExecution: false, write: [],
    },
    limits: { timeoutMs: input.timeoutMs, maxBytes: Probe.Limits.outputBytes, maxRssBytes: Probe.Limits.rssBytes },
  }
  const event: Extract<EvidenceEvent, { phase: "prepared" }> = {
    phase: "prepared", analysisID: input.evidence.analysisID, invocationID, side: input.side,
    sourceSha256: input.evidence.source.sha256, runtime,
    inputs: captures.map((item) => ({ ...item.input, data: Buffer.from(item.input.data) })),
    config: Buffer.from(config.data), pathMap: Buffer.from(pathMap), recipe,
  }
  return { status: "ok" as const, event, pathMap, captures: [...captures.map((item) => item.captured), config, executable] }
}, Effect.catchTag("ReviewEngagementEvidence.SourceMismatch", () => Effect.succeed({ status: "not-run" as const, reason: MISMATCH })))

/** Recheck after asynchronous observation, immediately before spawning, and after the real child exits. */
export const stable = Effect.fnUntraced(function* (prepared: { readonly captures: readonly Capture[] }) {
  for (const previous of prepared.captures) {
    const current = yield* read(previous.file, previous.limit, false)
    if (previous.identity !== current.identity || previous.sha256 !== current.sha256 ||
      previous.parents.length !== current.parents.length ||
      previous.parents.some((parent, index) => parent.path !== current.parents[index].path || parent.identity !== current.parents[index].identity))
      return false
  }
  return true
}, Effect.catchTag("ReviewEngagementEvidence.SourceMismatch", () => Effect.succeed(false)))

// The qualified oxlint projection already has this aggregate input bound. Runtime bytes are hashed in chunks.
const MAX_INPUT_BYTES = 4 * 1024 * 1024
type Capture = Effect.Success<ReturnType<typeof read>>
const FILESYSTEM_ERRORS = new Set(["ENOENT", "ENOTDIR", "ELOOP", "EACCES", "EPERM", "ENAMETOOLONG", "EIO", "ESTALE", "EMFILE", "ENFILE", "EBUSY"])
const io = <A>(run: (signal: AbortSignal) => Promise<A>) =>
  Effect.tryPromise({ try: run, catch: (error) => error }).pipe(Effect.catch((error) => {
    if (error instanceof SourceMismatch) return Effect.fail(error)
    if (error instanceof Error && "code" in error && typeof error.code === "string" && FILESYSTEM_ERRORS.has(error.code))
      return Effect.fail(new SourceMismatch())
    return Effect.die(error)
  }))

const read = Effect.fnUntraced(function* (file: string, limit: number, retainBytes: boolean) {
  if (!constants.O_NOFOLLOW || path.resolve(file) !== file) return yield* new SourceMismatch()
  const parents = yield* io(async () => {
    const found: { path: string; identity: string }[] = []
    let cursor = path.parse(file).root
    for (const segment of path.relative(cursor, path.dirname(file)).split(path.sep).filter(Boolean)) {
      cursor = path.join(cursor, segment)
      const stat = await lstat(cursor)
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new SourceMismatch()
      found.push({ path: cursor, identity: directoryIdentity(stat) })
    }
    if (await realpath(file) !== file) throw new SourceMismatch()
    return found
  })
  const handle = yield* Effect.acquireRelease(
    io(() => open(file, constants.O_RDONLY | constants.O_NOFOLLOW)),
    (opened) => Effect.promise(() => opened.close()),
  )
  const before = yield* io(() => handle.stat())
  if (!before.isFile() || before.nlink !== 1 || !Number.isSafeInteger(before.size) || before.size < 0 || before.size > limit)
    return yield* new SourceMismatch()
  const captured = yield* io(async (signal) => {
    const hasher = createHash("sha256")
    const chunks: Buffer[] = []
    let offset = 0
    while (offset <= before.size) {
      signal.throwIfAborted()
      const chunk = Buffer.alloc(Math.min(64 * 1024, before.size + 1 - offset))
      const actual = await handle.read(chunk, 0, chunk.length, offset)
      if (!actual.bytesRead) break
      const bytes = chunk.subarray(0, actual.bytesRead)
      hasher.update(bytes)
      if (retainBytes) chunks.push(bytes)
      offset += actual.bytesRead
    }
    return { sha256: hasher.digest("hex"), data: Buffer.concat(chunks), bytes: offset }
  })
  const after = yield* io(() => handle.stat())
  const named = yield* io(() => lstat(file))
  if (captured.bytes !== before.size || !named.isFile() || named.isSymbolicLink() || named.nlink !== 1 ||
    identity(before) !== identity(after) || identity(before) !== identity(named))
    return yield* new SourceMismatch()
  for (const parent of parents) {
    const current = yield* io(() => lstat(parent.path))
    if (!current.isDirectory() || current.isSymbolicLink() || directoryIdentity(current) !== parent.identity)
      return yield* new SourceMismatch()
  }
  return { file, limit, parents, mode: before.mode, identity: identity(before), sha256: captured.sha256, data: captured.data }
}, Effect.scoped)

function identity(stat: Stats) {
  return [stat.dev, stat.ino, stat.size, stat.mode, stat.nlink, stat.ctimeMs, stat.mtimeMs].join(":")
}

function directoryIdentity(stat: Stats) {
  return [stat.dev, stat.ino, stat.mode].join(":")
}
