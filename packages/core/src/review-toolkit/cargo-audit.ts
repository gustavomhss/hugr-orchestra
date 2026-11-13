export * as ReviewCargoAudit from "./cargo-audit"

import path from "node:path"
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { Context, Effect } from "effect"
import type { Scope } from "effect"
import { BackendToolkit } from "../backend-toolkit"
import type { ReviewAnalyze } from "./analyze"
import { ReviewBoundedFile } from "./bounded-file"
import { ReviewCargoAuditFacts } from "./cargo-audit-facts"
import { ReviewCargoAuditReport } from "./cargo-audit-report"
import type { ResearchProcess } from "../research-toolkit/process"
import { ReviewSarif } from "./sarif"
import { ReviewRustsecDb } from "./rustsec-db"

export type Confine<R> = (input: Parameters<ReviewAnalyze.Confine>[0]) => Effect.Effect<{ outcome: ResearchProcess.Outcome } | { denied: string }, never, R>
export const Host = Context.Reference<{ locate: typeof ReviewCargoAuditFacts.locate; database: typeof ReviewRustsecDb.current }>("@orchestra/ReviewCargoAudit/Host", { defaultValue: () => ({ locate: ReviewCargoAuditFacts.locate, database: ReviewRustsecDb.current }) })
export const ParentEnvironment = Context.Reference<NodeJS.ProcessEnv>("@orchestra/ReviewCargoAudit/ParentEnvironment", { defaultValue: () => process.env })
export const BeforeLockRead = Context.Reference<(file: string) => Effect.Effect<void>>("@orchestra/ReviewCargoAudit/BeforeLockRead", { defaultValue: () => () => Effect.void })

const CAP = 4 * 1024 * 1024
const TIMEOUT_MS = 300_000
const MAX_LOCKS = 16

type Read =
  | { readonly ok: true; readonly bytes: Uint8Array; readonly text: string }
  | { readonly ok: false; readonly baseline: true }
  | { readonly ok: false; readonly baseline: false; readonly status: "not-run"; readonly reason: string }

type Row = {
  readonly relative: string
  readonly head: Uint8Array
  readonly headText: string
  readonly base?: Uint8Array
  readonly baseText?: string
}

type Side = "head" | "base"

type Page =
  | { readonly ok: true; readonly items: ReviewSarif.Entry[]; readonly uri: string }
  | { readonly ok: false; readonly status: ReviewAnalyze.Status; readonly reason: string; readonly uri?: string }

// Caller snapshot scope stays on the outer Scope. Host homes close in a per-scan scope so a finished
// side does not keep scratch, and so head/base copies are not finalized with the scan.
type Copies<R> = Omit<ReviewAnalyze.RunContext, "head" | "base"> & {
  readonly head: Effect.Effect<ReviewAnalyze.Copy, never, R | Scope.Scope>
  readonly base: Effect.Effect<ReviewAnalyze.Copy, never, R | Scope.Scope>
}

export function run<R, C>(pack: ReviewAnalyze.Pack, context: Copies<C>, confine: Confine<R>, lookup: ReviewSarif.Lookup): Effect.Effect<ReviewAnalyze.Outcome, never, R | C | Scope.Scope> {
  return Effect.gen(function* () {
    yield* Effect.scope
    if (!(yield* qualified())) return finished(pack, "not-run", "native-runtime-unqualified")
    const selected = select(Object.keys(context.input.changed))
    if ("reason" in selected) return finished(pack, "not-run", selected.reason)
    const host = yield* Host
    const located = yield* host.locate()
    if ("absent" in located) return finished(pack, "not-run", located.absent)
    const database = yield* host.database()
    if (!database.ok) return finished(pack, database.status, database.reason)
    const headCopy = yield* context.head
    if ("failed" in headCopy) return finished(pack, "not-run", headCopy.failed)
    const baseCopy = yield* context.base
    if ("failed" in baseCopy) return finished(pack, "not-run", baseCopy.failed)
    const beforeRead = yield* BeforeLockRead
    const captured = yield* capture(selected.locks, headCopy.snapshot.root, baseCopy.snapshot.root, beforeRead)
    if ("reason" in captured) return finished(pack, captured.status, captured.reason)
    const parent = yield* ParentEnvironment
    const state = database.state
    return yield* walk(pack, context, confine, lookup, located.executable, state, parent, captured.rows, headCopy.snapshot.root, baseCopy.snapshot.root, 0, [], [], undefined)
  })
}

function qualified() {
  return Effect.gen(function* () {
    if (process.platform !== "linux" || process.arch !== "x64") return false
    const target = yield* BackendToolkit.Target
    if (!("target" in target) || target.target !== "linux-x64") return false
    return true
  })
}

function select(paths: readonly string[]): { readonly locks: readonly string[] } | { readonly reason: string } {
  const candidates = paths.filter(isLockCandidate)
  if (candidates.length === 0) return { reason: "target-missing: Cargo.lock" }
  if (candidates.some((file) => !isSafeLock(file))) return { reason: "lockfile-path-invalid" }
  const locks = ReviewCargoAuditFacts.lockfiles(paths)
  if (locks.length > MAX_LOCKS) return { reason: "lockfile-count-cap" }
  if (locks.length !== candidates.length || locks.some((file) => !candidates.includes(file))) return { reason: "lockfile-path-invalid" }
  return { locks }
}

function isLockCandidate(file: string) {
  return file === "Cargo.lock" || file.endsWith("/Cargo.lock") || file.endsWith("\\Cargo.lock")
}

function isSafeLock(file: string) {
  if (file !== "Cargo.lock" && !file.endsWith("/Cargo.lock")) return false
  if (file.includes("\\") || file.includes("\0") || file.includes("\r") || file.includes("\n")) return false
  if (file.startsWith("/") || /^[A-Za-z]:/.test(file)) return false
  const parts = file.split("/")
  if (parts.some((part) => part.length === 0 || part === "." || part === "..")) return false
  return parts[parts.length - 1] === "Cargo.lock"
}

function capture(locks: readonly string[], headRoot: string, baseRoot: string, beforeRead: (file: string) => Effect.Effect<void>) {
  const step = (index: number, rows: readonly Row[]): Effect.Effect<{ readonly rows: readonly Row[] } | { readonly status: "not-run"; readonly reason: string }> => {
    const relative = locks[index]
    if (relative === undefined) return Effect.succeed({ rows })
    return readCopy(headRoot, relative, beforeRead, "head").pipe(Effect.flatMap((head) => {
      if (!head.ok) return Effect.succeed(refusedRead(head, "lockfile-missing"))
      return readCopy(baseRoot, relative, beforeRead, "base").pipe(Effect.flatMap((base) => {
        if (!base.ok) {
          if (base.baseline) return step(index + 1, [...rows, { relative, head: head.bytes, headText: head.text }])
          return Effect.succeed({ status: base.status, reason: base.reason })
        }
        return step(index + 1, [...rows, { relative, head: head.bytes, headText: head.text, base: base.bytes, baseText: base.text }])
      }))
    }))
  }
  return step(0, [])
}

function refusedRead(read: Read, fallback: string): { readonly status: "not-run"; readonly reason: string } {
  if (read.ok || read.baseline) return { status: "not-run", reason: fallback }
  return { status: read.status, reason: read.reason }
}

function readCopy(root: string, relative: string, beforeRead: (file: string) => Effect.Effect<void>, side: Side) {
  return ReviewBoundedFile.read(root, relative, CAP, beforeRead).pipe(Effect.map((result) => settleRead(result, side)))
}

function settleRead(result: ReviewBoundedFile.Result, side: Side): Read {
  if (!result.ok) {
    if (result.reason === "missing" && side === "base") return { ok: false, baseline: true }
    return { ok: false, baseline: false, status: "not-run", reason: lockReason(result.reason) }
  }
  if (result.bytes.byteLength > CAP) return { ok: false, baseline: false, status: "not-run", reason: "lockfile-size-cap" }
  const text = utf8(result.bytes)
  if (text === undefined) return { ok: false, baseline: false, status: "not-run", reason: "lockfile-utf8" }
  return { ok: true, bytes: result.bytes, text }
}

function lockReason(reason: ReviewBoundedFile.Reason) {
  if (reason === "missing") return "lockfile-missing"
  if (reason === "symlink") return "lockfile-symlink"
  if (reason === "too-large") return "lockfile-size-cap"
  if (reason === "path-outside") return "lockfile-path-invalid"
  if (reason === "changed") return "lockfile-changed"
  if (reason === "not-file") return "lockfile-not-file"
  if (reason === "unreadable") return "lockfile-unreadable"
  return "lockfile-nofollow-unavailable"
}

function utf8(bytes: Uint8Array) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch {
    return undefined
  }
}

function walk<R>(
  pack: ReviewAnalyze.Pack,
  context: Pick<ReviewAnalyze.RunContext, "write" | "input">,
  confine: Confine<R>,
  lookup: ReviewSarif.Lookup,
  bin: string,
  state: ReviewRustsecDb.State,
  parent: NodeJS.ProcessEnv,
  rows: readonly Row[],
  headRoot: string,
  baseRoot: string,
  index: number,
  head: readonly ReviewSarif.Entry[],
  base: readonly ReviewSarif.Entry[],
  uri: string | undefined,
): Effect.Effect<ReviewAnalyze.Outcome, never, R> {
  const row = rows[index]
  if (row === undefined) {
    const findings = head.length > 0 || base.length > 0
    return Effect.succeed(finished(pack, findings ? "fail" : "pass", ReviewCargoAuditFacts.cardReason(findings ? "findings" : undefined, state), uri, head, base))
  }
  return Effect.scoped(scan(context, confine, lookup, bin, state.dir, parent, row, index, "head", row.head, row.headText, headRoot, baseRoot)).pipe(
    Effect.flatMap((headPage) => {
      if (!headPage.ok) return Effect.succeed(finished(pack, headPage.status, headPage.reason, headPage.uri ?? uri))
      if (row.base === undefined || row.baseText === undefined) {
        return walk(pack, context, confine, lookup, bin, state, parent, rows, headRoot, baseRoot, index + 1, [...head, ...headPage.items], base, uri ?? headPage.uri)
      }
      const kept = uri ?? headPage.uri
      return Effect.scoped(scan(context, confine, lookup, bin, state.dir, parent, row, index, "base", row.base, row.baseText, headRoot, baseRoot)).pipe(
        Effect.flatMap((basePage) => {
          if (!basePage.ok) return Effect.succeed(finished(pack, basePage.status, basePage.reason, basePage.uri ?? kept))
          return walk(pack, context, confine, lookup, bin, state, parent, rows, headRoot, baseRoot, index + 1, [...head, ...headPage.items], [...base, ...basePage.items], kept)
        }),
      )
    }),
  )
}

function scan<R>(
  context: Pick<ReviewAnalyze.RunContext, "write" | "input">,
  confine: Confine<R>,
  lookup: ReviewSarif.Lookup,
  bin: string,
  db: string,
  parent: NodeJS.ProcessEnv,
  row: Row,
  index: number,
  side: Side,
  bytes: Uint8Array,
  lockText: string,
  headRoot: string,
  baseRoot: string,
): Effect.Effect<Page, never, R | Scope.Scope> {
  return Effect.gen(function* () {
    const made = yield* Effect.acquireRelease(
      Effect.tryPromise({
        try: async () => {
          const created = await mkdtemp(path.join(tmpdir(), "cargo-audit-"))
          try {
            await chmod(created, 0o700)
            return created
          } catch (error) {
            await rm(created, { recursive: true, force: true }).then(() => undefined, () => undefined)
            throw error
          }
        },
        catch: () => "host-home-failed",
      }),
      (home) => Effect.promise(() => rm(home, { recursive: true, force: true }).then(() => undefined, () => undefined)),
    ).pipe(
      Effect.map((home) => ({ home })),
      Effect.catch((reason) => Effect.succeed({ failed: reason })),
    )
    if ("failed" in made) return stopped("acquisition-error", made.failed)
    const home = made.home
    if (!outside(headRoot, home) || !outside(baseRoot, home)) return stopped("acquisition-error", "host-home-inside-copy")
    const file = path.join(home, "input", "Cargo.lock")
    const staged = yield* Effect.tryPromise({
      try: async () => {
        const input = path.join(home, "input")
        await mkdir(input, { recursive: true, mode: 0o700 })
        await chmod(input, 0o700)
        await writeFile(file, bytes, { mode: 0o600 })
        await chmod(file, 0o600)
        return Bun.file(file).bytes()
      },
      catch: () => "lockfile-stage-failed",
    }).pipe(
      Effect.map((recorded) => ({ recorded })),
      Effect.catch((reason) => Effect.succeed({ failed: reason })),
    )
    if ("failed" in staged) return stopped("acquisition-error", staged.failed)
    if (!sameBytes(staged.recorded, bytes)) return stopped("not-run", "lockfile-changed")
    const argv = ReviewCargoAuditFacts.argv(bin, file, db)
    const ran = yield* confine({
      argv,
      cwd: home,
      write: [home],
      env: ReviewCargoAuditFacts.environment(home, parent),
      timeoutMs: TIMEOUT_MS,
      maxBytes: CAP,
    })
    if ("denied" in ran) return stopped("not-run", ran.denied)
    const jsonUri = yield* context.write(`raw/cargo-audit-${side}-${index}.json`, ran.outcome.stdout.data)
    yield* context.write(`raw/cargo-audit-${side}-${index}.log`, [
      `$ ${argv.join(" ")}`,
      "stdout:",
      ran.outcome.stdout.data.toString("utf8"),
      "stderr:",
      ran.outcome.stderr.data.toString("utf8"),
    ].join("\n"))
    const retained = yield* ReviewBoundedFile.read(home, "input/Cargo.lock", CAP, () => Effect.void)
    if (!retained.ok || !sameBytes(retained.bytes, bytes)) return stopped("not-run", "lockfile-changed", jsonUri)
    const settled = ReviewCargoAuditReport.settle(ran.outcome, ran.outcome.stdout.data.toString("utf8"), row.relative, lockText)
    if ("reason" in settled && settled.status === "not-run") return stopped(settled.status, settled.reason, jsonUri)
    if (settled.status !== "ok") return stopped(settled.status, settled.reason, jsonUri)
    const bound = ReviewSarif.bind(settled.results, lookup, (filePath, line, endLine) => overlaps(context.input.changed[filePath] ?? [], line, endLine))
    if ("failed" in bound) return stopped("acquisition-error", bound.failed, jsonUri)
    if (bound.excluded.length > 0) return stopped("acquisition-error", "unknown-rule", jsonUri)
    return { ok: true as const, items: bound.items, uri: jsonUri }
  })
}

function overlaps(ranges: ReadonlyArray<{ readonly start: number; readonly end: number }>, line: number, endLine?: number) {
  return ranges.some((range) => range.start <= (endLine ?? line) && range.end >= line)
}

function outside(root: string, home: string) {
  const relative = path.relative(root, home)
  return relative.startsWith("..") || path.isAbsolute(relative)
}

function sameBytes(left: Uint8Array, right: Uint8Array) {
  return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index])
}

function stopped(status: ReviewAnalyze.Status, reason: string, uri?: string): Page {
  return { ok: false, status, reason, ...(uri === undefined ? {} : { uri }) }
}

function finished(
  pack: ReviewAnalyze.Pack,
  status: ReviewAnalyze.Status,
  reason?: string,
  uri?: string,
  head: readonly ReviewSarif.Entry[] = [],
  base: readonly ReviewSarif.Entry[] = [],
): ReviewAnalyze.Outcome {
  return {
    checks: [{
      id: pack.id,
      pack: pack.id,
      version: ReviewCargoAuditFacts.VERSION,
      lane: pack.lane,
      status,
      workspaceExecuted: false,
      ...(reason === undefined ? {} : { reason }),
      ...(uri === undefined ? {} : { uri }),
    }],
    head: [...head],
    base: [...base],
  }
}
