export * as ReviewAnalyze from "./analyze"

import path from "path"
import { lstat, mkdir, mkdtemp, opendir, readdir, realpath, rm, writeFile } from "fs/promises"
import { Context, Effect, Option, Schema } from "effect"
import { FSUtil } from "../fs-util"
import { ReviewCatalog } from "../review/catalog"
import { ResearchProcess } from "../research-toolkit/process"
import { ProbeRun } from "../research-toolkit/probe/run"
import { Probe } from "../research-toolkit/probe/types"
import { ToolSafetySandbox } from "../tool-safety-sandbox"
import { ReviewItem } from "./item"
import { ReviewNoise } from "./noise"
import { ReviewSarif } from "./sarif"
import { ReviewNativeFiles } from "./native-files"
import { ReviewScratch } from "./scratch-copy"
import { ReviewPackAstGrep } from "./packs/ast-grep"
import { ReviewPackGitleaks } from "./packs/gitleaks"
import { ReviewPackRepo } from "./packs/repo"
import { ReviewPackRuff } from "./packs/ruff"
import { ReviewPackSquawk } from "./packs/squawk"
import { ReviewPackActionlint } from "./packs/actionlint"
import { ReviewActionlintAnalyze } from "./actionlint-analyze"
import { ReviewPackOxlint } from "./packs/oxlint"
import { ReviewOxlintAnalyze } from "./oxlint-analyze"

// K6 analyze half (design §7.2, §8.6, plan WP 1.4): the host runs the routed packs before any model turn, each confined
// in a scratch copy (head, and base for the new-only step), keeps every raw output as a citable artifact, normalizes it
// through the catalog and hands the entries to the noise pipeline. The model sees only the capped items per lens and
// pages the retained rest of its own lens. A report that cannot be read is `acquisition-error`, never a pass; a tool
// that is not installed is `not-run`; nothing is installed and nothing reaches the network.

export type Lane = "no-build" | "repo" | "build"
export type Status = "pass" | "fail" | "not-run" | "acquisition-error"

export type Check = {
  readonly id: string
  readonly pack: string
  readonly version: string
  readonly lane: string
  readonly status: Status
  readonly reason?: string
  /** The check executed repository code (plan R4). */
  readonly workspaceExecuted: boolean
  /** The retained raw output. */
  readonly uri?: string
}

type Pipeline = typeof ReviewNoise.pipeline
type PipelineInput = Parameters<Pipeline>[0]

export type RunInput = {
  readonly worktree: string
  /** The base revision: the new-only step's tree and the source of the repository's declared gates. */
  readonly base: string
  /** The head revision; omitted, the working tree as it is now. */
  readonly head?: string
  readonly tier: string
  readonly catalog?: ReviewCatalog.Catalog
  /** The host directory that keeps this review's artifacts. */
  readonly store: string
  readonly changed: PipelineInput["changed"]
  readonly addedSuppressions?: PipelineInput["addedSuppressions"]
  /** D6: repository code runs only for the project the owner opened, never for an external target. */
  readonly trusted: boolean
  /** The highest lane this run may enter: no-build, then repo, then build. */
  readonly lane: Lane
  readonly packs: ReadonlyArray<string>
  readonly scope: "diff" | "files"
  readonly files?: ReadonlyArray<string>
}

export class Failed extends Schema.TaggedErrorClass<Failed>()("ReviewAnalyze.Failed", { reason: Schema.String }) {}

const LANES: ReadonlyArray<string> = ["no-build", "repo", "build"]
const PAGE = 20
const SCAN_MS = 5 * 60_000
const GATE_MS = 10 * 60_000
const GATE_BYTES = 16 * 1024 * 1024
const CACHED = 64
const RETAINED = /^review:([0-9a-f-]{36})\/retained\.json$/

/** Test seam: runs after the copy exists and before SQL enumeration. Default does nothing. */
export const BeforeSqlSelection = Context.Reference<(root: string) => Effect.Effect<void>>(
  "@orchestra/ReviewAnalyze/BeforeSqlSelection",
  { defaultValue: () => () => Effect.void },
)

/** Host observation seam for asserting the catalog that actually reaches execution. */
export const ObserveCatalog = Context.Reference<(catalog: ReviewCatalog.Catalog) => void>(
  "@orchestra/ReviewAnalyze/ObserveCatalog",
  { defaultValue: () => () => {} },
)

// Base results by pack, version, template and the base commit's tree: a rereview, or a second review over the same base,
// reads them instead of scanning again.
const baseCache = new Map<string, { results: ReadonlyArray<ReviewSarif.Raw>; uri: string }>()

/** Host only: runs the routed packs and the noise pipeline once, before any model turn. */
export const run = Effect.fn("ReviewAnalyze.run")(function* (input: RunInput, pipeline: Pipeline = ReviewNoise.pipeline) {
  const catalog = input.catalog ?? ReviewCatalog.current
  const observeCatalog = yield* ObserveCatalog
  observeCatalog(catalog)
  const id = Bun.randomUUIDv7()
  // Worktree containment only: a contained absolute becomes the same host-relative spelling every pack and the
  // final filter see. Outside and traversal stay unnormalized so the copy walk still refuses them. Not the scratch root.
  const selected = input.scope === "files"
    ? { ...input, files: (input.files ?? []).map((file) => ReviewNativeFiles.containedPath(input.worktree, file) ?? file) }
    : input
  const context = {
    input: selected,
    catalog,
    write: (name: string, text: string | Uint8Array) =>
      Effect.promise(() => Bun.write(path.join(input.store, id, name), text)).pipe(Effect.as(`review:${id}/${name}`)),
    head: yield* Effect.cached(copy(input.head === undefined
      ? { worktree: input.worktree, tree: true }
      : { worktree: input.worktree, revision: input.head })),
    base: yield* Effect.cached(copy({ worktree: input.worktree, revision: input.base })),
  }
  // No-build packs first: a repository gate may rewrite files in the head copy.
  const ordered = input.packs
    .map((packID) => ({ packID, pack: catalog.packs.find((entry) => entry.id === packID) }))
    .toSorted((a, b) => LANES.indexOf(a.pack?.lane ?? "build") - LANES.indexOf(b.pack?.lane ?? "build"))
  const outcomes = yield* Effect.forEach(ordered, (entry) => runPack(entry.packID, entry.pack, context), { concurrency: 1 })
  const inScope = (entry: ReviewSarif.Entry) => selected.scope === "diff" || (selected.files ?? []).includes(entry.item.path)
  const result = pipeline({
    head: outcomes.flatMap((outcome) => outcome.head).filter(inScope),
    base: outcomes.flatMap((outcome) => outcome.base).filter(inScope),
    changed: input.changed,
    ...(input.addedSuppressions === undefined ? {} : { addedSuppressions: input.addedSuppressions }),
    tier: input.tier,
    catalog,
  })
  const retained = yield* context.write("retained.json", JSON.stringify(result.retained))
  const debt = yield* context.write("debt.json", JSON.stringify(result.debt))
  return {
    checks: outcomes.flatMap((outcome) => outcome.checks),
    items: result.items,
    retained: { uri: retained, total: result.retained.total, unread: result.retained.unread },
    debt: { uri: debt, total: result.debt.length },
  }
}, Effect.scoped)

/** A lens child pages its own lens of the retained artifact; the host binds `lens` to the caller's routed lens. */
export const page = Effect.fn("ReviewAnalyze.page")(function* (input: {
  readonly store: string
  readonly uri: string
  readonly lens: string
  readonly filter?: { readonly rule?: string; readonly path?: string; readonly class?: string }
  readonly cursor?: string
}) {
  const match = RETAINED.exec(input.uri)
  if (!match) return yield* new Failed({ reason: `artifact-unknown: ${input.uri}` })
  const text = yield* Effect.promise(() => Bun.file(path.join(input.store, match[1], "retained.json")).text().catch(() => undefined))
  const json = text === undefined ? Option.none() : Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(text)
  const retained = Option.flatMap(json, Schema.decodeUnknownOption(Retained))
  if (Option.isNone(retained)) return yield* new Failed({ reason: `artifact-unreadable: ${input.uri}` })
  const start = input.cursor === undefined ? 0 : Number(input.cursor)
  if (!Number.isSafeInteger(start) || start < 0) return yield* new Failed({ reason: `cursor-invalid: ${input.cursor}` })
  const filter = input.filter
  // Demoted and dropped remain in the artifact. They are removed before the page window, so they never reach a model.
  const matching = retained.value.items.filter((item) =>
    item.ruleStatus !== "demoted" &&
    item.ruleStatus !== "dropped" &&
    item.lens === input.lens &&
    (filter?.rule === undefined || item.rule === filter.rule) &&
    (filter?.path === undefined || item.path === filter.path) &&
    (filter?.class === undefined || item.class === filter.class))
  const next = start + PAGE
  return { items: matching.slice(start, next), ...(next < matching.length ? { cursor: String(next) } : {}) }
})

const Retained = Schema.Struct({ items: Schema.Array(ReviewItem.ToolItem) })

export type Pack = ReviewCatalog.Catalog["packs"][number]
export type Copy = { readonly snapshot: ReviewScratch.Snapshot } | { readonly failed: string }
export type RunContext = {
  readonly input: RunInput
  readonly catalog: ReviewCatalog.Catalog
  readonly write: (name: string, text: string | Uint8Array) => Effect.Effect<string>
  readonly head: ReturnType<typeof copy>
  readonly base: ReturnType<typeof copy>
}
export type Outcome = { readonly checks: Check[]; readonly head: ReviewSarif.Entry[]; readonly base: ReviewSarif.Entry[] }

export type ActionlintHooks = {
  select: typeof workflowSelection
  stage: typeof workflowStaging
  unavailable: typeof workflowUnavailable
  confine: typeof confined
  drops: typeof nativeDrops
  lookup: typeof rules
  check: typeof check
  only: typeof only
  scanMs: number
}

export type OxlintHooks = {
  select: typeof sourceSelection
  stage: typeof sourceStaging
  unavailable: typeof sourceUnavailable
  confine: typeof confined
  drops: typeof nativeDrops
  lookup: typeof rules
  check: typeof check
  only: typeof only
  scanMs: number
}

const runPack = Effect.fnUntraced(function* (packID: string, pack: Pack | undefined, context: RunContext) {
  const lane = context.input.lane
  if (!pack) return only({ id: packID, pack: packID, version: "unknown", lane, status: "not-run", reason: "unknown pack", workspaceExecuted: false })
  const refused = (reason: string) => only(check(pack, "not-run", reason))
  const files = context.input.files ?? []
  if (context.input.scope === "files" && files.some((file) => !ReviewNativeFiles.containedPath(context.input.worktree, file)))
    return refused(files.some((file) => file.includes("\0")) ? "nul" : "path-outside")
  if (LANES.indexOf(pack.lane) > LANES.indexOf(lane)) return refused(`lane: ${pack.lane} is above ${lane}`)
  if (pack.status === "dropped") return refused("dropped")
  // Squawk's argv is effectful (it stats the copy). The static template scanners stay as they are.
  if (pack.backend === "pinned" && pack.id === ReviewPackSquawk.manifest.id) return yield* squawked(pack, context)
  if (pack.backend === "pinned" && pack.id === ReviewPackRuff.manifest.id) return yield* ruffed(pack, context)
  if (pack.backend === "pinned" && pack.id === ReviewPackActionlint.manifest.id) return yield* ReviewActionlintAnalyze.run(pack, context, {
    select: workflowSelection, stage: workflowStaging, unavailable: workflowUnavailable, confine: confined, drops: nativeDrops,
    lookup: rules, check, only, scanMs: SCAN_MS,
  })
  if (pack.backend === "pinned" && pack.id === ReviewPackOxlint.manifest.id) return yield* ReviewOxlintAnalyze.run(pack, context, {
    select: sourceSelection, stage: sourceStaging, unavailable: sourceUnavailable, confine: confined, drops: nativeDrops,
    lookup: rules, check, only, scanMs: SCAN_MS,
  })
  const scanner = pack.backend === "pinned" ? pinnedScanner(pack.id) : undefined
  if (scanner) return yield* scanned(pack, scanner, context)
  if (pack.backend === "repo") return yield* gates(pack, context)
  return refused("not-built")
})

type ScanInput = { executable: string; root: string; report: string }
type Scanner = {
  readonly locate: typeof ReviewPackGitleaks.locate
  readonly templates: Readonly<Record<string, (input: ScanInput) => string[]>>
  readonly prepare?: (directory: string, dropped?: readonly string[]) => Effect.Effect<void>
  readonly sink?: "stdout"
  readonly completedExits?: readonly number[]
}

function pinnedScanner(id: string): Scanner | undefined {
  if (id === ReviewPackGitleaks.manifest.id) return ReviewPackGitleaks
  if (id === ReviewPackAstGrep.manifest.id) return ReviewPackAstGrep
  return undefined
}

/** A pinned scanner over the head copy and, for the new-only step, the base copy. */
const scanned = Effect.fnUntraced(function* (pack: Pack, scanner: Scanner, context: RunContext) {
  const template = scanner.templates[pack.template]
  if (!template) return only(check(pack, "not-run", `template unknown: ${pack.template}`))
  const ruleSelection = nativeDrops(context.catalog, pack.id, knownNative(pack.id))
  if (ruleSelection.status !== "ok") return only(check(pack, "not-run", ruleSelection.reason))
  const located = yield* scanner.locate()
  if ("absent" in located) return only(check(pack, "not-run", located.absent))
  const completed: readonly number[] = scanner.completedExits ?? [0]
  const scan = (copied: Copy, side: "head" | "base") => Effect.gen(function* () {
    if ("failed" in copied) return { status: "not-run" as const, reason: copied.failed }
    const snapshot = copied.snapshot
    // Outside the scanned copy. A report-file scanner may write only that file; a stdout scanner writes nothing.
    const report = path.join(snapshot.scratch, "reports", `${pack.id}.${pack.output.format}`)
    yield* Effect.promise(() => mkdir(path.dirname(report), { recursive: true }))
    if (scanner.prepare) yield* scanner.prepare(path.dirname(report), ruleSelection.dropped)
    if (scanner.sink !== "stdout") yield* Effect.promise(() => writeFile(report, ""))
    const ran = yield* confined({
      argv: template({ executable: located.executable, root: snapshot.root, report }),
      cwd: snapshot.scratch,
      write: scanner.sink === "stdout" ? [] : [report],
      env: ResearchProcess.environment(), timeoutMs: SCAN_MS, maxBytes: Probe.Limits.outputBytes,
    })
    if ("denied" in ran) return { status: "not-run" as const, reason: ran.denied }
    const text = scanner.sink === "stdout"
      ? ran.outcome.stdout.data.toString("utf8")
      : yield* Effect.promise(() => Bun.file(report).text().catch(() => ""))
    const uri = yield* context.write(`raw/${pack.id}-${side}.${pack.output.format}`, text)
    const unsettled = settle(ran.outcome)
    if (unsettled) return { ...unsettled, uri }
    if (!completed.includes(ran.outcome.exitCode ?? -1))
      return { status: "acquisition-error" as const, reason: `exit ${ran.outcome.exitCode}: ${firstLine(ran.outcome.stderr.data)}`, uri }
    const options = { pack: pack.id, root: snapshot.root }
    const parsed = pack.output.format === "sarif"
      ? ReviewSarif.parseSarif(text, options)
      : ReviewSarif.parseJson(pack.output.parser, text, options)
    if (parsed.status === "acquisition-error") return { status: "acquisition-error" as const, reason: parsed.reason, uri }
    return { status: "ok" as const, results: parsed.results, uri }
  })
  const head = yield* scan(yield* context.head, "head")
  if (head.status !== "ok") return only(check(pack, head.status, head.reason, head.uri))
  const tree = yield* ResearchProcess.git(context.input.worktree, ["rev-parse", "--verify", `${context.input.base}^{tree}`]).pipe(
    Effect.map((data) => data.toString("utf8").trim()),
    Effect.orElseSucceed(() => undefined),
  )
  const key = tree === undefined ? undefined : `${pack.id}@${pack.version}:${pack.template}:${tree}:${ReviewCatalog.catalogDigest(context.catalog)}`
  const cached = key === undefined ? undefined : baseCache.get(key)
  const base = cached ? { status: "ok" as const, ...cached } : yield* scan(yield* context.base, "base")
  // Without the base, every head item would pass as new: none reach the model.
  if (base.status !== "ok") return only(check(pack, base.status, `base: ${base.reason}`, "uri" in base ? base.uri : undefined))
  if (key !== undefined && !cached) remember(key, { results: base.results, uri: base.uri })
  const lookup = rules(context.catalog)
  const changed = context.input.changed
  const onChanged = (file: string, line: number, endLine?: number) =>
    (changed[file] ?? []).some((range) => line <= range.end && (endLine ?? line) >= range.start)
  const headPage = ReviewSarif.bind(head.results, lookup, onChanged)
  if ("failed" in headPage) return only(check(pack, "acquisition-error", headPage.failed, head.uri))
  const basePage = ReviewSarif.bind(base.results, lookup)
  if ("failed" in basePage) return only(check(pack, "acquisition-error", `base: ${basePage.failed}`, base.uri))
  return {
    checks: [check(pack, head.results.length > 0 ? "fail" : "pass", undefined, head.uri)],
    head: headPage.items,
    base: basePage.items,
  } satisfies Outcome
})

/** Squawk over the copied tree only: host TOML, explicit regular `.sql` paths, stdout retained before settle. */
const squawked = Effect.fnUntraced(function* (pack: Pack, context: RunContext) {
  if (pack.output.format !== "json") return only(check(pack, "not-run", `template unknown: ${pack.template}`))
  if (pack.output.parser !== "squawk" || pack.template !== "squawk-json")
    return only(check(pack, "not-run", `template unknown: ${pack.template}`))
  const ruleSelection = nativeDrops(context.catalog, pack.id, undefined)
  if (ruleSelection.status !== "ok") return only(check(pack, "not-run", ruleSelection.reason))
  const located = yield* ReviewPackSquawk.locate()
  if ("absent" in located) return only(check(pack, "not-run", located.absent))
  // No Squawk baseCache: the key would have to include the selected files, and a tree-only key reuses another selection.
  const scan = (copied: Copy, side: "head" | "base") => Effect.gen(function* () {
    if ("failed" in copied) return { status: "not-run" as const, reason: copied.failed }
    const snapshot = copied.snapshot
    const before = yield* BeforeSqlSelection
    yield* before(snapshot.root)
    // A readdir rejection is unread input: not-run, not a defect and not a clean pass. Returned refusals stay their own class.
    const selected = yield* Effect.tryPromise({
      try: () => sqlSelection(snapshot.root, context.input, side),
      catch: (error) => error,
    }).pipe(Effect.catch((error) => Effect.succeed({ refused: sqlUnavailable(error) })))
    if ("refused" in selected) return { status: "not-run" as const, reason: selected.refused }
    if (selected.files.length === 0) {
      if (side === "head") return { status: "not-run" as const, reason: "no-input" }
      const uri = yield* context.write(`raw/${pack.id}-base.json`, JSON.stringify({ invoked: false, reason: "no-eligible-base-input" }))
      return { status: "ok" as const, results: [], uri, emptyBase: true as const }
    }
    const config = yield* ReviewPackSquawk.prepare(path.join(snapshot.scratch, "squawk-host"), ruleSelection.dropped)
    const built = yield* ReviewPackSquawk.argv({ executable: located.executable, config, root: snapshot.root, files: selected.files })
    if (built.status !== "ok") return { status: "not-run" as const, reason: built.reason }
    const ran = yield* confined({
      argv: built.argv, cwd: snapshot.scratch, write: [], env: ResearchProcess.environment(),
      timeoutMs: SCAN_MS, maxBytes: Probe.Limits.outputBytes,
    })
    if ("denied" in ran) return { status: "not-run" as const, reason: ran.denied }
    // The captured stdout, including a truncated or unknown-rule report, is retained before settle classifies it.
    const text = ran.outcome.stdout.data.toString("utf8")
    const uri = yield* context.write(`raw/${pack.id}-${side}.json`, text)
    const settled = ReviewPackSquawk.settle(ran.outcome, snapshot.root)
    if (settled.status === "not-run") return { status: "not-run" as const, reason: settled.reason, uri }
    if (settled.status !== "ok") return { status: "acquisition-error" as const, reason: settled.reason, uri }
    return { status: "ok" as const, results: settled.results, uri }
  })
  const head = yield* scan(yield* context.head, "head")
  if (head.status !== "ok") return only(check(pack, head.status, head.reason, head.uri))
  const base = yield* scan(yield* context.base, "base")
  if (base.status !== "ok") return only(check(pack, base.status, `base: ${base.reason}`, "uri" in base ? base.uri : undefined))
  const lookup = rules(context.catalog)
  const changed = context.input.changed
  const onChanged = (file: string, line: number, endLine?: number) =>
    (changed[file] ?? []).some((range) => line <= range.end && (endLine ?? line) >= range.start)
  const coverage = "emptyBase" in base && base.emptyBase ? "base: no eligible SQL input; no base scanner invocation" : undefined
  const headPage = ReviewSarif.bind(head.results, lookup, onChanged)
  if ("failed" in headPage) return only(check(pack, "acquisition-error", headPage.failed, head.uri))
  const basePage = ReviewSarif.bind(base.results, lookup)
  if ("failed" in basePage) return only(check(pack, "acquisition-error", `base: ${basePage.failed}`, base.uri))
  return {
    checks: [check(pack, head.results.length > 0 ? "fail" : "pass", coverage, head.uri)],
    head: headPage.items,
    base: basePage.items,
  } satisfies Outcome
})

/** Ruff over the copied tree only. cwd is the scratch directory, not the copy root, so a target config is not the default. */
const ruffed = Effect.fnUntraced(function* (pack: Pack, context: RunContext) {
  if (pack.output.format !== "json") return only(check(pack, "not-run", `template unknown: ${pack.template}`))
  if (pack.output.parser !== ReviewPackRuff.parserId || pack.template !== ReviewPackRuff.templateId)
    return only(check(pack, "not-run", `template unknown: ${pack.template}`))
  const ruleSelection = nativeDrops(context.catalog, pack.id, ReviewPackRuff.RULES)
  if (ruleSelection.status !== "ok") return only(check(pack, "not-run", ruleSelection.reason))
  const located = yield* ReviewPackRuff.locate()
  if ("absent" in located) return only(check(pack, "not-run", located.absent))
  const scan = (copied: Copy, side: "head" | "base") => Effect.gen(function* () {
    if ("failed" in copied) return { status: "not-run" as const, reason: copied.failed }
    const snapshot = copied.snapshot
    const selected = yield* Effect.tryPromise({
      try: () => pythonSelection(snapshot.root, context.input, side),
      catch: (error) => error,
    }).pipe(Effect.catch((error) => Effect.succeed({ refused: pythonUnavailable(error) })))
    if ("refused" in selected) return { status: "not-run" as const, reason: selected.refused }
    if (selected.files.length === 0) {
      if (side === "head") return { status: "not-run" as const, reason: "no-input" }
      const uri = yield* context.write(`raw/${pack.id}-base.json`, JSON.stringify({ invoked: false, reason: "no-eligible-python-input" }))
      return { status: "ok" as const, results: [], uri, emptyBase: true as const }
    }
    const built = yield* ReviewPackRuff.argv({
      executable: located.executable, root: snapshot.root, files: selected.files, excluded: ruleSelection.dropped,
    })
    if (built.status !== "ok") return { status: "not-run" as const, reason: built.reason }
    const ran = yield* confined({
      argv: built.argv, cwd: snapshot.scratch, write: [], env: ReviewPackRuff.environment(),
      timeoutMs: SCAN_MS, maxBytes: Probe.Limits.outputBytes,
    })
    if ("denied" in ran) return { status: "not-run" as const, reason: ran.denied }
    const uri = yield* context.write(`raw/${pack.id}-${side}.json`, ran.outcome.stdout.data)
    const settled = ReviewPackRuff.settle(ran.outcome, snapshot.root)
    if (settled.status === "not-run") return { status: "not-run" as const, reason: settled.reason, uri }
    if (settled.status !== "ok") return { status: "acquisition-error" as const, reason: settled.reason, uri }
    return { status: "ok" as const, results: settled.results, uri }
  })
  const head = yield* scan(yield* context.head, "head")
  if (head.status !== "ok") return only(check(pack, head.status, head.reason, head.uri))
  const base = yield* scan(yield* context.base, "base")
  if (base.status !== "ok") return only(check(pack, base.status, `base: ${base.reason}`, "uri" in base ? base.uri : undefined))
  const lookup = rules(context.catalog)
  const changed = context.input.changed
  const onChanged = (file: string, line: number, endLine?: number) =>
    (changed[file] ?? []).some((range) => line <= range.end && (endLine ?? line) >= range.start)
  const coverage = "emptyBase" in base && base.emptyBase ? "base: no eligible Python input; no base scanner invocation" : undefined
  const headPage = ReviewSarif.bind(head.results, lookup, onChanged)
  if ("failed" in headPage) return only(check(pack, "acquisition-error", headPage.failed, head.uri))
  const basePage = ReviewSarif.bind(base.results, lookup)
  if ("failed" in basePage) return only(check(pack, "acquisition-error", `base: ${basePage.failed}`, base.uri))
  return {
    checks: [check(pack, head.results.length > 0 ? "fail" : "pass", coverage, head.uri)],
    head: headPage.items,
    base: basePage.items,
  } satisfies Outcome
})

export function workflowStaging(scratch: string) {
  return Effect.acquireRelease(
    Effect.tryPromise({ try: () => mkdtemp(path.join(scratch, "actionlint-host-")), catch: workflowUnavailable }),
    (directory) => Effect.promise(() => rm(directory, { recursive: true, force: true })),
  ).pipe(Effect.catch((reason) => Effect.succeed({ status: "not-run" as const, reason })))
}

function workflowUnavailable(error: unknown) {
  return `workflow-input-unavailable: ${error !== null && typeof error === "object" && "code" in error ? String(error.code) : "error"}`
}

// The oxlint projection stages source files, not workflows. Same scratch isolation, distinct name.
export function sourceStaging(scratch: string) {
  return Effect.acquireRelease(
    Effect.tryPromise({ try: () => mkdtemp(path.join(scratch, "oxlint-host-")), catch: sourceUnavailable }),
    (directory) => Effect.promise(() => rm(directory, { recursive: true, force: true })),
  ).pipe(Effect.catch((reason) => Effect.succeed({ status: "not-run" as const, reason })))
}

function sourceUnavailable(error: unknown) {
  return `source-input-unavailable: ${error !== null && typeof error === "object" && "code" in error ? String(error.code) : "error"}`
}

async function sourceSelection(root: string, input: RunInput, side: "head" | "base") {
  if (input.scope !== "files") return { files: await regularSource(root) }
  const requested = input.files ?? []
  const flavor = ReviewNativeFiles.flavor(root)
  const escaped = requested.find((file) => !ReviewNativeFiles.containedPath(root, file))
  if (escaped) return { refused: escaped.includes("\0") ? "nul" : "path-outside" }
  const files: string[] = []
  for (const file of requested.filter((entry) => sourceName(flavor.basename(entry)))) {
    const relative = ReviewNativeFiles.containedPath(root, file)
    if (!relative) return { refused: file.includes("\0") ? "nul" : "path-outside" }
    const walked = await copiedFile(root, relative, side)
    if (walked === undefined) continue
    if (typeof walked !== "string") return walked
    files.push(walked)
  }
  return { files }
}

function sourceName(name: string) {
  return [".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".mts", ".cts"].some((extension) => name.endsWith(extension))
}

async function regularSource(root: string) {
  const found: string[] = []
  const walk = async (dir: string) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) await walk(full)
      else if (entry.isFile() && sourceName(entry.name)) found.push(full)
    }
  }
  await walk(root)
  return found.sort()
}

async function workflowSelection(root: string, input: RunInput, side: "head" | "base") {
  const requested = (input.files ?? []).map((file) => ReviewNativeFiles.containedPath(input.worktree, file))
  if (input.scope === "files" && requested.some((file) => file === undefined)) return { refused: "path-outside" }
  const candidates = requested.filter((file): file is string => file !== undefined && /^\.github\/workflows\/[^/]+\.ya?ml$/.test(file))
  if (input.scope === "files" && !candidates.length) return { files: [] }
  for (const directory of [".github", ".github/workflows"]) {
    const info = await lstat(path.join(root, directory)).catch((error: NodeJS.ErrnoException) => error)
    if (info instanceof Error) {
      if (info.code === "ENOENT" || side === "base" && info.code === "ENOTDIR") return { files: [] }
      return { refused: workflowUnavailable(info) }
    }
    if (info.isSymbolicLink()) return { refused: "symlink" }
    if (!info.isDirectory()) return side === "base" ? { files: [] } : { refused: "workflow-parent-not-directory" }
  }
  if (input.scope !== "files") {
    for await (const entry of await opendir(path.join(root, ".github/workflows"))) {
      if (!/\.ya?ml$/.test(entry.name)) continue
      if (candidates.length >= 10_000) return { refused: "too-many-inputs" }
      candidates.push(`.github/workflows/${entry.name}`)
    }
  }
  const files: string[] = []
  for (const relative of candidates.sort()) {
    const file = await copiedFile(root, relative, side)
    if (file === undefined) continue
    if (typeof file !== "string") return file
    files.push(file)
  }
  return { files }
}

function pythonUnavailable(error: unknown) {
  const code = error !== null && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : "error"
  return `python-input-unavailable: ${code}`
}

async function pythonSelection(root: string, input: RunInput, side: "head" | "base") {
  if (input.scope !== "files") return { files: await regularPython(root) }
  const requested = input.files ?? []
  const flavor = ReviewNativeFiles.flavor(root)
  const escaped = requested.find((file) => !ReviewNativeFiles.containedPath(root, file))
  if (escaped) return { refused: escaped.includes("\0") ? "nul" : "path-outside" }
  const files: string[] = []
  for (const file of requested.filter((entry) => pythonName(flavor.basename(entry)))) {
    const relative = ReviewNativeFiles.containedPath(root, file)
    if (!relative) return { refused: file.includes("\0") ? "nul" : "path-outside" }
    const walked = await copiedFile(root, relative, side)
    if (walked === undefined) continue
    if (typeof walked !== "string") return walked
    files.push(walked)
  }
  return { files }
}

// Parents are lstat'd in order. A base miss is absence only after each of them was a non-symlink; a symlink, including
// a dangling one, is refused before the child is stated. ENOTDIR from a regular-file parent is that absence, not a link.
async function copiedFile(root: string, relative: string, side: "head" | "base") {
  const flavor = ReviewNativeFiles.flavor(root)
  const segments = relative.split("/").filter((segment) => segment !== "" && segment !== ".")
  if (segments.length === 0) return { refused: "missing" }
  let cursor = root
  for (const [index, segment] of segments.entries()) {
    cursor = flavor.join(cursor, segment)
    const stat = await lstat(cursor).catch((error: NodeJS.ErrnoException) => error)
    if (stat instanceof Error) {
      if (side === "base" && (stat.code === "ENOENT" || stat.code === "ENOTDIR")) return undefined
      return { refused: stat.code === "ENOENT" ? "missing" : stat.code === "EACCES" || stat.code === "EPERM" ? "unreadable" : `fs-${stat.code ?? "error"}` }
    }
    if (stat.isSymbolicLink()) return { refused: "symlink" }
    const last = index === segments.length - 1
    if (last && stat.isDirectory()) return { refused: "directory" }
    if (last && !stat.isFile()) return { refused: "not-file" }
  }
  return cursor
}

function pythonName(name: string) {
  return name.endsWith(".py") || name.endsWith(".pyi")
}

async function regularPython(root: string) {
  const found: string[] = []
  const walk = async (dir: string) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) await walk(full)
      else if (entry.isFile() && pythonName(entry.name)) found.push(full)
    }
  }
  await walk(root)
  return found.sort()
}

function sqlUnavailable(error: unknown) {
  const code = error !== null && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : "error"
  return `sql-input-unavailable: ${code}`
}

async function sqlSelection(root: string, input: RunInput, side: "head" | "base") {
  if (input.scope !== "files") return { files: await regularSql(root) }
  const requested = input.files ?? []
  // Lexical containment before existence, so a missing base file is not how an escape gets through.
  const escaped = requested.find((file) => file.includes("\0") || !FSUtil.contains(root, path.resolve(root, file)))
  if (escaped) return { refused: escaped.includes("\0") ? "nul" : "path-outside" }
  const files: string[] = []
  for (const file of requested.filter((entry) => path.basename(entry).endsWith(".sql"))) {
    const absolute = path.resolve(root, file)
    const info = await lstat(absolute).catch((error: NodeJS.ErrnoException) => error)
    if (info instanceof Error) {
      if (side === "base" && (info.code === "ENOENT" || info.code === "ENOTDIR")) continue
      return { refused: info.code === "ENOENT" ? "missing" : info.code === "EACCES" || info.code === "EPERM" ? "unreadable" : `fs-${info.code ?? "error"}` }
    }
    if (info.isSymbolicLink()) return { refused: "symlink" }
    if (info.isDirectory()) return { refused: "directory" }
    if (!info.isFile()) return { refused: "not-file" }
    const physical = await realpath(absolute).catch((error: NodeJS.ErrnoException) => error)
    if (physical instanceof Error || !FSUtil.contains(root, physical)) return { refused: "path-outside" }
    files.push(absolute)
  }
  return { files }
}

async function regularSql(root: string) {
  const found: string[] = []
  const walk = async (dir: string) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) await walk(full)
      else if (entry.isFile() && entry.name.endsWith(".sql")) found.push(full)
    }
  }
  await walk(root)
  return found.sort()
}

/** The base revision's declared gates, each run confined in the head copy (plan R4); they yield checks, not items. */
const gates = Effect.fnUntraced(function* (pack: Pack, context: RunContext) {
  const version = context.input.base
  const refused = (reason: string) => only({ ...check(pack, "not-run", reason), version })
  if (!context.input.trusted) return refused("untrusted target: repository code does not run (D6)")
  const base = yield* context.base
  if ("failed" in base) return refused(base.failed)
  const declared = yield* ReviewPackRepo.gates(base.snapshot.root)
  if (declared.length === 0) return refused("no declared gates")
  const head = yield* context.head
  if ("failed" in head) return refused(head.failed)
  const root = head.snapshot.root
  const checks = yield* Effect.forEach(declared, (gate, index) => Effect.gen(function* () {
    const result = (status: Status, reason?: string, uri?: string): Check => ({
      id: gate.id, pack: pack.id, version, lane: pack.lane, status, ...(reason === undefined ? {} : { reason }),
      workspaceExecuted: true, ...(uri === undefined ? {} : { uri }),
    })
    if ("skip" in gate) return result("not-run", gate.skip)
    const env = ResearchProcess.environment()
    const program = ReviewPackRepo.program(gate.argv[0], env)
    if (!program) return result("not-run", `${gate.argv[0]} absent`)
    const ran = yield* confined({
      argv: [program.binary, ...gate.argv.slice(1)], cwd: root, write: [root],
      env: Object.fromEntries(Object.entries({ ...env, ...program.env }).filter((entry): entry is [string, string] => entry[1] !== undefined)),
      timeoutMs: GATE_MS, maxBytes: GATE_BYTES, tailBytes: Probe.Limits.outputBytes,
    })
    if ("denied" in ran) return result("not-run", ran.denied)
    const text = `${ran.outcome.stdout.data.toString("utf8")}\n${ran.outcome.stderr.data.toString("utf8")}`
    const uri = yield* context.write(`raw/repo-${index}.log`, text)
    if (text.includes(ProbeRun.GUARD)) return result("not-run", ProbeRun.GUARD, uri)
    const unsettled = settle(ran.outcome)
    if (unsettled) return result(unsettled.status, unsettled.reason, uri)
    // 127 is a shell's "command not found": a tool the gate calls is not installed.
    if (ran.outcome.exitCode === 127) return result("not-run", `${gate.command}: a tool it calls is absent`, uri)
    if (ran.outcome.exitCode === 0) return result("pass", undefined, uri)
    return result("fail", `exit ${ran.outcome.exitCode}`, uri)
  }), { concurrency: 1 })
  return { checks, head: [], base: [] } satisfies Outcome
})

/** One host-owned argv under `ToolSafetySandbox.confine` through AppProcess/omni; never unconfined (plan R9). */
const confined = Effect.fnUntraced(function* (input: {
  readonly argv: ReadonlyArray<string>
  readonly cwd: string
  readonly write: ReadonlyArray<string>
  readonly env: Record<string, string>
  readonly timeoutMs: number
  readonly maxBytes: number
  readonly tailBytes?: number
}) {
  const launch = yield* ToolSafetySandbox.confine({
    command: input.argv[0], args: input.argv.slice(1), cwd: input.cwd, env: input.env, write: input.write,
  }).pipe(
    Effect.map((value) => ({ value })),
    Effect.catch((error) => Effect.succeed({ denied: `sandbox: ${error.reason}` })),
  )
  if ("denied" in launch) return launch
  const outcome = yield* ResearchProcess.run({
    command: launch.value.command, args: launch.value.args, cwd: input.cwd,
    env: Object.fromEntries(Object.entries(launch.value.env).filter((entry): entry is [string, string] => entry[1] !== undefined)),
    timeoutMs: input.timeoutMs, maxBytes: input.maxBytes, maxRssBytes: Probe.Limits.rssBytes,
    ...(input.tailBytes === undefined ? {} : { tailBytes: input.tailBytes }),
  })
  return { outcome }
})

const copy = (input: Parameters<typeof ReviewScratch.create>[0]) =>
  ReviewScratch.create(input).pipe(
    Effect.map((snapshot): Copy => ({ snapshot })),
    Effect.catch((error) => Effect.succeed<Copy>({ failed: `scratch: ${error.reason}` })),
  )

/** A run that did not finish on its own: limits are `not-run`, a broken run is `acquisition-error`. */
function settle(outcome: ResearchProcess.Outcome) {
  if (outcome.timedOut) return { status: "not-run" as const, reason: "timeout" }
  if (outcome.memoryExceeded) return { status: "not-run" as const, reason: "memory cap" }
  if (outcome.overflow) return { status: "acquisition-error" as const, reason: "output cap" }
  if (outcome.failure !== undefined) return { status: "acquisition-error" as const, reason: outcome.failure }
  return undefined
}

function knownNative(id: string) {
  if (id === ReviewPackAstGrep.manifest.id) return ReviewPackAstGrep.rules.map((rule) => rule.id)
  return undefined
}

// Dropped native ids are excluded before the CLI. `*` is never passed to a tool. A dropped wildcard is expressible
// only for a host-authored closed set: every keeper must already be in that set. Squawk's inventory is not that set
// (aliases and opt-in rules still run). Demoted still runs.
function nativeDrops(catalog: ReviewCatalog.Catalog, pack: string, known: readonly string[] | undefined) {
  const rules = catalog.rules.filter((rule) => rule.pack === pack)
  const wildcard = rules.find((rule) => rule.rule === "*")
  const explicit = rules.filter((rule) => rule.rule !== "*")
  const keepers = explicit.filter((rule) => rule.status !== "dropped")
  // A dropped id that contains `*` is not an exact native exclusion. Do not guess a glob.
  if (explicit.some((rule) => rule.status === "dropped" && rule.rule.includes("*"))) {
    return { status: "not-run" as const, reason: "native-rule-pattern" }
  }
  if (wildcard?.status === "dropped") {
    if (known !== undefined && keepers.every((rule) => known.includes(rule.rule))) {
      const kept = new Set(keepers.map((rule) => rule.rule))
      const dropped = known.filter((id) => !kept.has(id))
      if (dropped.length === known.length) return { status: "not-run" as const, reason: "no-active-rules" }
      return { status: "ok" as const, dropped }
    }
    return { status: "not-run" as const, reason: "wildcard-dropped" }
  }
  const dropped = explicit.filter((rule) => rule.status === "dropped").map((rule) => rule.rule)
  if (known !== undefined && known.length > 0 && known.every((id) => dropped.includes(id))) {
    return { status: "not-run" as const, reason: "no-active-rules" }
  }
  return { status: "ok" as const, dropped }
}

/**
 * The catalog rule for a native rule id, else the pack's `*` rule. Dropped rules never reach the pipeline.
 * A fixed `*` priority does not consult the finding level. A per-level map never falls back to the first value.
 */
export function rules(catalog: ReviewCatalog.Catalog): ReviewSarif.Lookup {
  return (pack, rule, nativeSeverity) => {
    const entry = catalog.rules.find((item) => item.pack === pack && item.rule === rule) ??
      catalog.rules.find((item) => item.pack === pack && item.rule === "*")
    if (!entry || entry.status === "dropped") return undefined
    const fixed = ownSeverity(entry.severity, "*")
    if (fixed) return { class: entry.class, lens: entry.lens, severity: fixed, status: entry.status, triage: entry.triage }
    const mapped = nativeSeverity === undefined ? undefined : ownSeverity(entry.severity, nativeSeverity)
    if (mapped) return { class: entry.class, lens: entry.lens, severity: mapped, status: entry.status, triage: entry.triage }
    return "severity-unmapped"
  }
}

/** An inherited name such as `toString` is not a catalog level. Indexing the map would return that function. */
function ownSeverity(severity: Readonly<Record<string, string>>, level: string) {
  if (!Object.hasOwn(severity, level)) return undefined
  const mapped = severity[level]
  if (mapped === "P0" || mapped === "P1" || mapped === "P2" || mapped === "P3") return mapped
  return undefined
}

function check(pack: Pack, status: Status, reason?: string, uri?: string): Check {
  return {
    id: pack.id, pack: pack.id, version: pack.version, lane: pack.lane, status,
    ...(reason === undefined ? {} : { reason }),
    workspaceExecuted: pack.lane !== "no-build",
    ...(uri === undefined ? {} : { uri }),
  }
}

function only(entry: Check): Outcome {
  return { checks: [entry], head: [], base: [] }
}

function remember(key: string, value: { results: ReadonlyArray<ReviewSarif.Raw>; uri: string }) {
  baseCache.set(key, value)
  if (baseCache.size > CACHED) baseCache.delete(baseCache.keys().next().value!)
}

function firstLine(data: Buffer) {
  return data.toString("utf8").trim().split("\n")[0]?.slice(0, 240) || "no output"
}
