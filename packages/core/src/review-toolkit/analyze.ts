export * as ReviewAnalyze from "./analyze"

import path from "path"
import { mkdir, writeFile } from "fs/promises"
import { Effect, Option, Schema } from "effect"
import { ReviewCatalog } from "../review/catalog"
import { ResearchProcess } from "../research-toolkit/process"
import { ProbeRun } from "../research-toolkit/probe/run"
import { Probe } from "../research-toolkit/probe/types"
import { ToolSafetySandbox } from "../tool-safety-sandbox"
import { ReviewItem } from "./item"
import { ReviewNoise } from "./noise"
import { ReviewSarif } from "./sarif"
import { ReviewScratch } from "./scratch-copy"
import { ReviewPackGitleaks } from "./packs/gitleaks"
import { ReviewPackRepo } from "./packs/repo"

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

// Base results by pack, version, template and the base commit's tree: a rereview, or a second review over the same base,
// reads them instead of scanning again.
const baseCache = new Map<string, { results: ReadonlyArray<ReviewSarif.Raw>; uri: string }>()

/** Host only: runs the routed packs and the noise pipeline once, before any model turn. */
export const run = Effect.fn("ReviewAnalyze.run")(function* (input: RunInput, pipeline: Pipeline = ReviewNoise.pipeline) {
  const catalog = input.catalog ?? ReviewCatalog.current
  const id = Bun.randomUUIDv7()
  const context = {
    input,
    catalog,
    write: (name: string, text: string) =>
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
  const inScope = (entry: ReviewSarif.Entry) => input.scope === "diff" || (input.files ?? []).includes(entry.item.path)
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
  const matching = retained.value.items.filter((item) =>
    item.lens === input.lens &&
    (filter?.rule === undefined || item.rule === filter.rule) &&
    (filter?.path === undefined || item.path === filter.path) &&
    (filter?.class === undefined || item.class === filter.class))
  const next = start + PAGE
  return { items: matching.slice(start, next), ...(next < matching.length ? { cursor: String(next) } : {}) }
})

const Retained = Schema.Struct({ items: Schema.Array(ReviewItem.ToolItem) })

type Pack = ReviewCatalog.Catalog["packs"][number]
type Copy = { readonly snapshot: ReviewScratch.Snapshot } | { readonly failed: string }
type Context = {
  readonly input: RunInput
  readonly catalog: ReviewCatalog.Catalog
  readonly write: (name: string, text: string) => Effect.Effect<string>
  readonly head: ReturnType<typeof copy>
  readonly base: ReturnType<typeof copy>
}
type Outcome = { readonly checks: Check[]; readonly head: ReviewSarif.Entry[]; readonly base: ReviewSarif.Entry[] }

const runPack = Effect.fnUntraced(function* (packID: string, pack: Pack | undefined, context: Context) {
  const lane = context.input.lane
  if (!pack) return only({ id: packID, pack: packID, version: "unknown", lane, status: "not-run", reason: "unknown pack", workspaceExecuted: false })
  const refused = (reason: string) => only(check(pack, "not-run", reason))
  if (LANES.indexOf(pack.lane) > LANES.indexOf(lane)) return refused(`lane: ${pack.lane} is above ${lane}`)
  if (pack.status === "dropped") return refused("dropped")
  if (pack.backend === "pinned" && pack.id === ReviewPackGitleaks.manifest.id) return yield* scanned(pack, context)
  if (pack.backend === "repo") return yield* gates(pack, context)
  return refused("not-built")
})

/** A pinned scanner over the head copy and, for the new-only step, the base copy. */
const scanned = Effect.fnUntraced(function* (pack: Pack, context: Context) {
  const located = yield* ReviewPackGitleaks.locate()
  if ("absent" in located) return only(check(pack, "not-run", located.absent))
  const template = ReviewPackGitleaks.templates[pack.template]
  if (!template) return only(check(pack, "not-run", `template unknown: ${pack.template}`))
  const scan = (copied: Copy, side: "head" | "base") => Effect.gen(function* () {
    if ("failed" in copied) return { status: "not-run" as const, reason: copied.failed }
    const snapshot = copied.snapshot
    // Outside the scanned copy, and the only file the jail may write.
    const report = path.join(snapshot.scratch, "reports", `${pack.id}.${pack.output.format}`)
    yield* Effect.promise(() => mkdir(path.dirname(report), { recursive: true }).then(() => writeFile(report, "")))
    const ran = yield* confined({
      argv: template({ executable: located.executable, root: snapshot.root, report }),
      cwd: snapshot.scratch, write: [report], env: ResearchProcess.environment(), timeoutMs: SCAN_MS, maxBytes: Probe.Limits.outputBytes,
    })
    if ("denied" in ran) return { status: "not-run" as const, reason: ran.denied }
    const text = yield* Effect.promise(() => Bun.file(report).text().catch(() => ""))
    const uri = yield* context.write(`raw/${pack.id}-${side}.${pack.output.format}`, text)
    const unsettled = settle(ran.outcome)
    if (unsettled) return { ...unsettled, uri }
    if (ran.outcome.exitCode !== 0)
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
  const key = tree === undefined ? undefined : `${pack.id}@${pack.version}:${pack.template}:${tree}`
  const cached = key === undefined ? undefined : baseCache.get(key)
  const base = cached ? { status: "ok" as const, ...cached } : yield* scan(yield* context.base, "base")
  // Without the base, every head item would pass as new: none reach the model.
  if (base.status !== "ok") return only(check(pack, base.status, `base: ${base.reason}`, head.uri))
  if (key !== undefined && !cached) remember(key, { results: base.results, uri: base.uri })
  const lookup = rules(context.catalog)
  const changed = context.input.changed
  const onChanged = (file: string, line: number, endLine?: number) =>
    (changed[file] ?? []).some((range) => line <= range.end && (endLine ?? line) >= range.start)
  return {
    checks: [check(pack, head.results.length > 0 ? "fail" : "pass", undefined, head.uri)],
    head: ReviewSarif.toItems(head.results, lookup, onChanged).items,
    base: ReviewSarif.toItems(base.results, lookup).items,
  } satisfies Outcome
})

/** The base revision's declared gates, each run confined in the head copy (plan R4); they yield checks, not items. */
const gates = Effect.fnUntraced(function* (pack: Pack, context: Context) {
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

/** The catalog rule for a native rule id, else the pack's `*` rule. Dropped rules never reach the pipeline. */
function rules(catalog: ReviewCatalog.Catalog): ReviewSarif.Lookup {
  return (pack, rule) => {
    const entry = catalog.rules.find((item) => item.pack === pack && item.rule === rule) ??
      catalog.rules.find((item) => item.pack === pack && item.rule === "*")
    const severity = entry ? (entry.severity["*"] ?? Object.values(entry.severity)[0]) : undefined
    if (!entry || !severity || entry.status === "dropped") return undefined
    return { class: entry.class, lens: entry.lens, severity, status: entry.status, triage: entry.triage }
  }
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
