export * as RelayAudit from "./audit"

import { createHash } from "node:crypto"
import { readFile, stat } from "node:fs/promises"
import { constants } from "node:os"
import path from "node:path"
import { Effect, Redacted, Result } from "effect"
import type { RelayLedger } from "@opencode-ai/schema/relay-ledger"
import { RelayJson } from "./json"
import { LedgerRead } from "./ledger/read"
import { LedgerVerify } from "./ledger/verify"

// `bin/relay verify|problems|cost --json` (WP2), for the run card and the `complete` audit. Field names, member order
// and messages are the Python JSON's. Values `problems` and `cost` copy from the ledger keep whatever type was recorded,
// as Python passes them through, so they are typed `unknown`. Where Python raised on a record it could not process
// (a traceback, exit 1, no JSON), `problems` and `cost` fail with `LedgerRead.ReadError` carrying the exception's
// message. Runtime APIs are Node's only: the desktop server runs this under Node, not Bun.

export interface Control {
  readonly id: string
  readonly assert: string | null
  readonly verdict: string
  readonly graded_by: string
}

export interface RecordError {
  readonly entry?: number
  readonly field: string
  readonly reason: string
}

export interface Drift {
  readonly id: string
  readonly verdicts: ReadonlyArray<string>
  // First 12 hex characters of each oracle, in chain order.
  readonly oracles: ReadonlyArray<string>
  readonly laundered: boolean
}

export interface RecheckItem {
  readonly id: string
  readonly kind: "removed" | "changed" | "added"
  readonly recorded: string | null
  readonly current: string | null
}

export interface Recheck {
  readonly status: "not-run" | "invalid" | "diverged" | "unverified" | "ok"
  readonly items: ReadonlyArray<RecheckItem>
  readonly sprint?: string
  readonly reason?: string
  readonly unverified?: ReadonlyArray<string>
  readonly note?: string
}

export interface VerifyReport {
  readonly ledger: string
  readonly chain_intact: boolean
  readonly chain_detail: string
  readonly record_errors: ReadonlyArray<RecordError>
  readonly controls: ReadonlyArray<Control>
  readonly deterministic_total: number
  readonly deterministic_passed: number
  readonly advisory: number
  readonly last_event: string | null
  readonly truncated: boolean
  readonly laundered_controls: ReadonlyArray<Drift>
  readonly oracle_drift: ReadonlyArray<Drift>
  readonly oracle_recheck: Recheck
  readonly no_controls: boolean
  readonly escalated: boolean
  readonly result: RelayLedger.AuditResult
  readonly exit: 0 | 1 | 2
}

export interface Problem {
  readonly category: string
  // The last matching entry's `wp` as recorded; null when absent.
  readonly wp: unknown
  readonly cause: string
}

export interface ProblemsReport {
  readonly ledger: string
  readonly problems: ReadonlyArray<Problem>
}

export interface CostTotals {
  readonly in: number
  readonly out: number
  readonly cache_read: number
  readonly cache_write: number
  readonly turns: number
}

// One state event. `wp`, `macro` and `elapsed_s` are as recorded (null when absent); the cost members are present only
// when the state recorded a cost object, each as recorded and 0 when absent.
export interface CostState extends Partial<Record<keyof CostTotals, unknown>> {
  readonly wp: unknown
  readonly macro: unknown
  readonly elapsed_s: unknown
}

export interface CostMacro extends CostTotals {
  // The state's macro, or "_" when it has none.
  readonly macro: unknown
  readonly elapsed_s: number
}

export interface CostReport {
  readonly ledger: string
  // null when the run recorded no cost at all: unmeasured, not zero.
  readonly total: (CostTotals & { readonly elapsed_s: number }) | null
  readonly states: ReadonlyArray<CostState>
  readonly macros: ReadonlyArray<CostMacro>
  readonly note?: string
}

// `sprint` requests the oracle comparison; for a directory target, a sprint beside the ledger is discovered.
export const verify = (
  target: string,
  options?: { readonly sprint?: string; readonly key?: Redacted.Redacted<string> },
): Effect.Effect<VerifyReport, LedgerRead.Missing> =>
  Effect.gen(function* () {
    const ledger = yield* located(target)
    // Integrity comes from the verifier alone; records are read only from an intact chain.
    const chain = yield* LedgerVerify.verify(ledger, options?.key)
    const intact = chain.exit === 0
    const loaded = intact ? yield* load(ledger) : { entries: [], errors: [] }
    // Broken or unusable records are never read as verdicts.
    const usable = loaded.errors.length === 0 ? loaded.entries : []
    const controls = finalControls(usable)
    // recordErrors leaves only text items and verdicts in usable records, so every drift narrows and none can raise.
    const drift = (yield* Effect.orDie(Effect.fromResult(oracleDrift(usable)))).filter(isTextDrift)
    const recheck =
      !intact || loaded.errors.length > 0
        ? NOT_RUN_BROKEN
        : yield* oracleRecheck(usable, options?.sprint ?? (yield* findSprint(target)))
    const deterministic = controls.filter((control) => control.graded_by === "deterministic")
    const failing = deterministic.filter((control) => control.verdict !== "pass")
    const last = loaded.entries.length > 0 ? get(loaded.entries[loaded.entries.length - 1], "event") : undefined
    const lastEvent = typeof last === "string" ? last : null
    const verdict = {
      intact,
      errors: loaded.errors.length > 0,
      invalid: recheck.status === "invalid",
      diverged: recheck.status === "diverged",
      unverified: recheck.status === "unverified",
      // An empty ledger, or one without a deterministic control, is not an auditable pass.
      noControls: loaded.entries.length === 0 || deterministic.length === 0,
      truncated: intact && loaded.entries.length > 0 && !LedgerVerify.TERMINAL.some((event) => event === lastEvent),
      failing: failing.length > 0,
      laundered: drift.some((item) => item.laundered),
      drift: drift.length > 0,
      escalated: lastEvent === "escalate",
    }
    const exit = exitOf(verdict)
    return {
      ledger,
      chain_intact: intact,
      chain_detail: LedgerRead.strip(chain.stdout + chain.stderr),
      record_errors: loaded.errors,
      controls,
      deterministic_total: deterministic.length,
      deterministic_passed: deterministic.length - failing.length,
      advisory: controls.filter((control) => control.graded_by.startsWith("judge")).length,
      last_event: lastEvent,
      truncated: verdict.truncated,
      laundered_controls: drift.filter((item) => item.laundered),
      oracle_drift: drift,
      oracle_recheck: recheck,
      no_controls: verdict.noControls,
      escalated: verdict.escalated,
      result: resultOf(exit, verdict),
      exit,
    }
  })

// Exit 1 when any problem is derived (`problems` and `cost` do not check integrity).
export const problems = (target: string): Effect.Effect<ProblemsReport, LedgerRead.Missing | LedgerRead.ReadError> =>
  Effect.gen(function* () {
    const ledger = yield* located(target)
    const derived = deriveProblems(yield* LedgerRead.entries(ledger))
    if (Result.isFailure(derived))
      return yield* Effect.fail(new LedgerRead.ReadError({ ledger, reason: derived.failure }))
    return { ledger, problems: derived.success }
  })

export const cost = (target: string): Effect.Effect<CostReport, LedgerRead.Missing | LedgerRead.ReadError> =>
  Effect.gen(function* () {
    const ledger = yield* located(target)
    const report = costReport(yield* LedgerRead.entries(ledger))
    if (Result.isFailure(report))
      return yield* Effect.fail(new LedgerRead.ReadError({ ledger, reason: report.failure }))
    return { ledger, ...report.success }
  })

type Entry = Readonly<Record<string, unknown>>
// A Python exception's message: what the oracle printed instead of a report.
type Raised = string

const GRADED = ["checklist-item", "regression-item"]
const GATE_EVENTS = ["gate-fail", "gate-fail-repeat", "advance-reveal", "sprint-complete", "escalate"]
const STATE_EVENTS = ["advance-reveal", "sprint-complete", "escalate"]
const COST_KEYS = ["in", "out", "cache_read", "cache_write", "turns"] as const
const VERDICTS = ["pass", "fail", "advisory"]
const NOT_RUN_BROKEN: Recheck = {
  status: "not-run",
  items: [],
  note: "Broken or unusable record; sprint comparison not run.",
}
const NOT_RUN_BARE: Recheck = {
  status: "not-run",
  items: [],
  note: "Recorded controls only; no current sprint comparison. Pass --sprint to compare.",
}
// Things only a person can resolve: no amount of retrying escapes them.
const PLAN_DEFECTS = [
  ["cap-risk", "the session's hook block cap is lower than this chain needs"],
  ["inject-missing", "a state must inject a file that does not exist"],
  ["position-lost", "the chain stands on a work package the plan no longer contains"],
  ["unknown-kind", "a state declares a kind this engine does not implement"],
] as const

// The resolved ledger, which must exist (`os.path.exists`) before anything reads it.
function located(target: string) {
  return LedgerRead.resolve(target).pipe(
    Effect.flatMap((ledger) =>
      Effect.promise(() => exists(ledger)).pipe(
        Effect.flatMap((found) => (found ? Effect.succeed(ledger) : Effect.fail(new LedgerRead.Missing({ ledger })))),
      ),
    ),
  )
}

// `load_entries` plus `record_errors`; a ledger that cannot be read again is one record error without an entry.
function load(ledger: string): Effect.Effect<{ entries: ReadonlyArray<Entry>; errors: ReadonlyArray<RecordError> }> {
  return LedgerRead.entries(ledger).pipe(
    Effect.map((entries) => ({ entries, errors: recordErrors(entries) })),
    Effect.catch((error) =>
      Effect.succeed({
        entries: [],
        errors: [
          { field: "ledger", reason: error._tag === "LedgerRead.Missing" ? osError("ENOENT", ledger) : error.reason },
        ],
      }),
    ),
  )
}

// An intact signature authenticates bytes, not a usable verdict. A missing oracle is a legacy record; a present
// malformed one is not.
function recordErrors(entries: ReadonlyArray<Entry>): ReadonlyArray<RecordError> {
  return entries.flatMap((entry, index) => {
    const broken = (field: string, reason: string) => [{ entry: index + 1, field, reason }]
    const typed = ["event", "wp", "assert", "fails"].flatMap((field) => {
      const value = get(entry, field)
      return value !== undefined && value !== null && typeof value !== "string" ? broken(field, "must be a string") : []
    })
    if (!isGraded(entry)) return typed
    const item = get(entry, "item")
    const oracle = get(entry, "oracle")
    return [
      ...typed,
      ...(typeof item === "string" && LedgerRead.strip(item) !== "" ? [] : broken("item", "must be a nonempty string")),
      ...(VERDICTS.some((verdict) => verdict === get(entry, "verdict"))
        ? []
        : broken("verdict", "must be pass, fail, or advisory")),
      ...(typeof get(entry, "graded_by") === "string" ? [] : broken("graded_by", "must be a string")),
      ...(oracle === undefined || (typeof oracle === "string" && /^[0-9a-f]{64}$/.test(oracle))
        ? []
        : broken("oracle", "must be a SHA-256 hex string when present")),
    ]
  })
}

// The final verdict per named control is its last checklist-item, in the place of its first.
function finalControls(usable: ReadonlyArray<Entry>) {
  const final = new Map<unknown, Entry>()
  usable
    .filter((entry) => get(entry, "event") === "checklist-item")
    .forEach((entry) => final.set(get(entry, "item"), entry))
  return [...final.values()]
    .map((entry) => ({
      id: get(entry, "item"),
      assert: get(entry, "assert") ?? null,
      verdict: get(entry, "verdict"),
      graded_by: get(entry, "graded_by"),
    }))
    .filter(isControl)
}

interface RecordedDrift {
  readonly id: unknown
  readonly verdicts: ReadonlyArray<unknown>
  readonly oracles: ReadonlyArray<string>
  readonly laundered: boolean
}

// Any change of oracle for one control within one run is drift, whatever the verdicts say; `laundered` marks a prior
// fail now passing. Entries without a truthy oracle predate the format and are skipped. Python's `e["item"]`, the dict
// and set it hashes into and the `[:12]` slice raise on records that cannot carry them.
function oracleDrift(entries: ReadonlyArray<Entry>): Result.Result<ReadonlyArray<RecordedDrift>, Raised> {
  return Result.gen(function* () {
    const seen = new Map<unknown, { id: unknown; history: Array<readonly [unknown, unknown]> }>()
    for (const entry of entries) {
      const oracle = get(entry, "oracle")
      if (!isGraded(entry) || !truthy(oracle)) continue
      if (!Object.hasOwn(entry, "item")) return yield* Result.fail("'item'")
      const id = get(entry, "item")
      const key = yield* hashed(id, "a dict key")
      const known = seen.get(key) ?? { id, history: [] }
      seen.set(key, known)
      known.history.push([get(entry, "verdict"), oracle])
    }
    const drift: RecordedDrift[] = []
    for (const known of seen.values()) {
      const distinct = new Set<unknown>()
      for (const row of known.history) distinct.add(yield* hashed(row[1], "a set element"))
      if (distinct.size < 2) continue
      const oracles: string[] = []
      for (const row of known.history) oracles.push(yield* prefix(row[1]))
      const verdicts = known.history.map((row) => row[0])
      drift.push({
        id: known.id,
        verdicts,
        oracles,
        laundered:
          verdicts[verdicts.length - 1] === "pass" && verdicts.slice(0, -1).some((verdict) => verdict === "fail"),
      })
    }
    return drift
  })
}

// Named IDs compared both ways and recorded oracles against the sprint as it is now, without running any check. A
// reachable sprint that cannot be read is invalid, never not-run.
function oracleRecheck(usable: ReadonlyArray<Entry>, sprint: string | undefined): Effect.Effect<Recheck> {
  if (sprint === undefined) return Effect.succeed(NOT_RUN_BARE)
  return sprintText(sprint).pipe(
    Effect.map((text): Recheck => {
      const current = Result.flatMap(text, sprintOracles)
      if (Result.isFailure(current)) return { status: "invalid", items: [], sprint, reason: current.failure }
      return compare(usable, current.success)
    }),
  )
}

function compare(usable: ReadonlyArray<Entry>, current: ReadonlyMap<string, string>): Recheck {
  const recorded = new Map<string, string>()
  const ids = new Set<string>()
  const legacy = new Set<string>()
  usable.filter(isGraded).forEach((entry) => {
    const id = get(entry, "item")
    const oracle = get(entry, "oracle")
    if (typeof id !== "string") return
    ids.add(id)
    if (typeof oracle === "string") recorded.set(id, oracle)
    if (oracle === undefined) legacy.add(id)
  })
  const items: RecheckItem[] = [
    ...[...ids].flatMap((id): RecheckItem[] => {
      const oracle = recorded.get(id)
      const now = current.get(id)
      if (now === undefined) return [{ id, kind: "removed", recorded: oracle?.slice(0, 12) ?? null, current: null }]
      if (oracle !== undefined && oracle !== now)
        return [{ id, kind: "changed", recorded: oracle.slice(0, 12), current: now.slice(0, 12) }]
      return []
    }),
    ...[...current]
      .filter((pair) => !ids.has(pair[0]))
      .map((pair): RecheckItem => ({ id: pair[0], kind: "added", recorded: null, current: pair[1].slice(0, 12) })),
  ]
  const status = items.length > 0 ? "diverged" : legacy.size > 0 ? "unverified" : "ok"
  if (legacy.size === 0) return { status, items }
  return {
    status,
    items,
    unverified: [...legacy].sort(byCodePoint),
    note: "Legacy graded events lack oracles; no full oracle agreement established.",
  }
}

// A run directory keeps its sprint beside `.relay-state/`, an arm directory beside its ledger; a bare ledger has none.
function findSprint(target: string) {
  return Effect.promise(async () => {
    if (!(await stat(target).catch(() => undefined))?.isDirectory()) return undefined
    const candidates = [join(target, "sprint.json"), join(target, ".relay-state", "sprint.json")]
    const found = await Promise.all(candidates.map(exists))
    return candidates[found.indexOf(true)]
  })
}

// `open(path)` then `read()`: strict UTF-8 decoded in one pass, universal newlines, CPython's error text.
function sprintText(sprint: string): Effect.Effect<Result.Result<string, Raised>> {
  return Effect.promise(() =>
    readFile(sprint).then(
      (bytes) => {
        const decoded = Result.try(() => new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes))
        if (Result.isFailure(decoded)) return Result.fail(undecodable(bytes))
        return Result.succeed(decoded.success.replace(/\r\n?/g, "\n"))
      },
      (error: unknown) => Result.fail(osError(code(error), sprint, error)),
    ),
  )
}

// id -> oracle sha, recomputed from the sprint: the decoded cmd, or the judge criterion plus its space-joined paths,
// without environment expansion. The strict decoder reads it (PARITY-EXCEPTIONS WP2-1).
function sprintOracles(text: string): Result.Result<ReadonlyMap<string, string>, Raised> {
  return Result.gen(function* () {
    const sprint = RelayJson.plain(yield* Result.mapError(RelayJson.read(text), (error) => error.reason))
    const packages = isRecord(sprint) ? get(sprint, "work_packages") : undefined
    if (!Array.isArray(packages)) return yield* Result.fail("sprint must be an object with a work_packages array")
    const oracles = new Map<string, string>()
    for (const [index, wp] of packages.entries()) {
      if (!isRecord(wp)) return yield* Result.fail(`work_packages[${index}] must be an object`)
      const checklist = get(wp, "checklist") ?? []
      if (!Array.isArray(checklist)) return yield* Result.fail(`work_packages[${index}].checklist must be an array`)
      for (const [position, control] of checklist.entries()) {
        const where = `work_packages[${index}].checklist[${position}]`
        if (!isRecord(control)) return yield* Result.fail(`${where} must be an object`)
        const id = get(control, "id")
        if (typeof id !== "string" || LedgerRead.strip(id) === "")
          return yield* Result.fail(`${where}.id must be a nonempty string`)
        if (oracles.has(id)) return yield* Result.fail(`duplicate checklist id ${RelayJson.reprString(id)}`)
        // An Arsenal host check is graded by its registered callback, never by a cmd or judge; the arm records its
        // name as the oracle (arm/round.ts), and it takes precedence over any cmd as it does in the gate core.
        const host = get(control, "host_check") ?? null
        if (host !== null) {
          if (typeof host !== "string") return yield* Result.fail(`${where}.host_check must be a string`)
          oracles.set(id, yield* sha256(`host_check:${host}`))
          continue
        }
        const cmd = get(control, "cmd") ?? null
        const judge = get(control, "judge") ?? null
        if (cmd !== null && typeof cmd !== "string") return yield* Result.fail(`${where}.cmd must be a string`)
        if (judge !== null && typeof judge !== "string") return yield* Result.fail(`${where}.judge must be a string`)
        if (!cmd && !judge) return yield* Result.fail(`${where} must declare a nonempty cmd or judge`)
        if (cmd) {
          oracles.set(id, yield* sha256(cmd))
          continue
        }
        const paths = get(control, "paths") ?? []
        if (!Array.isArray(paths) || paths.some((item) => typeof item !== "string"))
          return yield* Result.fail(`${where}.paths must be an array of strings`)
        const scope = paths.join(" ")
        oracles.set(id, yield* sha256(`${judge}${scope ? ` :: ${scope}` : ""}`))
      }
    }
    return oracles
  })
}

// Every problem is derived from the chain on each call, so a stuck gate that later advances stops being reported
// without anyone clearing a flag.
function deriveProblems(entries: ReadonlyArray<Entry>): Result.Result<ReadonlyArray<Problem>, Raised> {
  return Result.gen(function* () {
    if (entries.length === 0) return []
    const problems: Problem[] = []
    const events = entries.map((entry) => get(entry, "event"))
    const escalations = entries.filter((entry) => get(entry, "event") === "escalate")
    // A parked arm is the headline, whatever else is true.
    if (escalations.length > 0 && events[events.length - 1] !== "sprint-complete") {
      const parked = escalations[escalations.length - 1]
      const fails = yield* stripped(get(parked, "fails"))
      problems.push({
        category: "awaiting-human",
        wp: get(parked, "wp") ?? null,
        cause: `retry budget spent at ${text(get(parked, "wp"))}; still failing: ${fails || "(unrecorded)"}`,
      })
    }
    PLAN_DEFECTS.forEach((defect) => {
      const hits = entries.filter((entry) => get(entry, "event") === defect[0])
      if (hits.length > 0)
        problems.push({ category: defect[0], wp: get(hits[hits.length - 1], "wp") ?? null, cause: defect[1] })
    })
    // Read off the last gate event, so an advance past a failure stops matching.
    const gate = entries.filter((entry) => GATE_EVENTS.some((event) => event === get(entry, "event"))).at(-1)
    if (gate !== undefined && (get(gate, "event") === "gate-fail" || get(gate, "event") === "gate-fail-repeat")) {
      const fails = yield* stripped(get(gate, "fails"))
      if (fails)
        problems.push({
          category: "gate-failing",
          wp: get(gate, "wp") ?? null,
          cause: `retry ${text(get(gate, "retry"))}: ${fails}`,
        })
      const regressed = yield* stripped(get(gate, "reg"))
      if (regressed)
        problems.push({
          category: "regression",
          wp: get(gate, "wp") ?? null,
          cause: `earlier accepted controls have backslid: ${regressed}`,
        })
    }
    const drift = yield* oracleDrift(entries)
    if (drift.length === 0) return problems
    const odd = drift.findIndex((item) => typeof item.id !== "string")
    if (odd !== -1)
      return yield* Result.fail(`sequence item ${odd}: expected str instance, ${typeName(drift[odd].id)} found`)
    problems.push({
      category: "oracle-drift",
      wp: null,
      cause: `graded under more than one oracle: ${drift.map((item) => item.id).join(", ")}`,
    })
    return problems
  })
}

// Spend rolled up beside what the run proved. A run with no cost recorded was not measured: total is null, never zero.
function costReport(entries: ReadonlyArray<Entry>): Result.Result<Omit<CostReport, "ledger">, Raised> {
  return Result.gen(function* () {
    const priced = entries.map((entry) => get(entry, "cost")).filter(isRecord)
    const states: CostState[] = entries
      .filter((entry) => STATE_EVENTS.some((event) => event === get(entry, "event")))
      .map((entry) => {
        const spent = get(entry, "cost")
        return {
          wp: get(entry, "wp") ?? null,
          macro: get(entry, "macro") ?? null,
          // Absent on the first state: there was nothing to subtract from.
          elapsed_s: get(entry, "elapsed_s") ?? null,
          // `cost.get(k, 0)`: an absent member is 0, a recorded null stays null.
          ...(isRecord(spent)
            ? Object.fromEntries(COST_KEYS.map((key) => [key, Object.hasOwn(spent, key) ? spent[key] : 0]))
            : {}),
        }
      })
    if (priced.length === 0)
      return { total: null, states, macros: [], note: "this run recorded no cost data — not zero cost, unmeasured" }
    const total = { in: 0, out: 0, cache_read: 0, cache_write: 0, turns: 0, elapsed_s: 0 }
    for (const spent of priced) for (const key of COST_KEYS) total[key] = yield* add(total[key], get(spent, key))
    for (const state of states) total.elapsed_s = yield* add(total.elapsed_s, state.elapsed_s)
    const macros = new Map<unknown, { -readonly [K in keyof CostMacro]: CostMacro[K] }>()
    for (const state of states) {
      const macro = truthy(state.macro) ? state.macro : "_"
      const key = yield* hashed(macro, "a dict key")
      const row = macros.get(key) ?? { macro, elapsed_s: 0, in: 0, out: 0, cache_read: 0, cache_write: 0, turns: 0 }
      macros.set(key, row)
      row.elapsed_s = yield* add(row.elapsed_s, state.elapsed_s)
      for (const key of COST_KEYS) row[key] = yield* add(row[key], Object.hasOwn(state, key) ? state[key] : 0)
    }
    return { total, states, macros: [...macros.values()] }
  })
}

// `(value or '').lstrip('; ')`.
function stripped(value: unknown): Result.Result<string, Raised> {
  if (!truthy(value)) return Result.succeed("")
  if (typeof value !== "string") return Result.fail(`'${typeName(value)}' object has no attribute 'lstrip'`)
  return Result.succeed(value.replace(/^[; ]+/, ""))
}

// `total + (value or 0)`: a bool counts as an int, any other non-number raises.
function add(total: number, value: unknown): Result.Result<number, Raised> {
  const operand = truthy(value) ? value : 0
  if (typeof operand === "number" || typeof operand === "boolean") return Result.succeed(total + Number(operand))
  return Result.fail(`unsupported operand type(s) for +: '${typeName(total)}' and '${typeName(operand)}'`)
}

// A key for the value as Python hashes it: True and 1 are one key, a list or dict cannot be one.
function hashed(value: unknown, use: string): Result.Result<unknown, Raised> {
  if (Array.isArray(value) || isRecord(value)) {
    const type = typeName(value)
    return Result.fail(`cannot use '${type}' as ${use} (unhashable type: '${type}')`)
  }
  return Result.succeed(typeof value === "boolean" ? Number(value) : value)
}

// `oracle[:12]`, in code points.
function prefix(oracle: unknown): Result.Result<string, Raised> {
  if (typeof oracle !== "string") return Result.fail(`'${typeName(oracle)}' object is not subscriptable`)
  return Result.succeed(Array.from(oracle).slice(0, 12).join(""))
}

// `hashlib.sha256(text.encode())`: a lone surrogate cannot be encoded, and the sprint is then invalid.
function sha256(value: string): Result.Result<string, Raised> {
  if (value.isWellFormed()) return Result.succeed(createHash("sha256").update(value, "utf8").digest("hex"))
  const points = Array.from(value)
  const at = points.findIndex(
    (point) => point.length === 1 && point.charCodeAt(0) >= 0xd800 && point.charCodeAt(0) <= 0xdfff,
  )
  const unit = points[at].charCodeAt(0).toString(16)
  return Result.fail(`'utf-8' codec can't encode character '\\u${unit}' in position ${at}: surrogates not allowed`)
}

// Python's `str()`, as an f-string prints a recorded value.
function text(value: unknown) {
  return typeof value === "string" ? value : RelayJson.repr(node(value ?? null))
}

function node(value: unknown): RelayJson.Node {
  if (typeof value === "number")
    return Number.isSafeInteger(value) ? new RelayJson.Int(String(value)) : new RelayJson.Float(String(value))
  if (Array.isArray(value)) return value.map(node)
  if (isRecord(value)) return new RelayJson.Members(Object.entries(value).map((entry) => [entry[0], node(entry[1])]))
  return typeof value === "string" || typeof value === "boolean" ? value : null
}

function truthy(value: unknown) {
  if (Array.isArray(value)) return value.length > 0
  if (isRecord(value)) return Object.keys(value).length > 0
  return value !== undefined && value !== null && value !== false && value !== 0 && value !== ""
}

function typeName(value: unknown) {
  if (value === undefined || value === null) return "NoneType"
  if (typeof value === "boolean") return "bool"
  if (typeof value === "number") return Number.isInteger(value) ? "int" : "float"
  if (typeof value === "string") return "str"
  return Array.isArray(value) ? "list" : "dict"
}

// `e.get(key)`: undefined when absent, never an inherited member.
function get(record: Entry, key: string) {
  return Object.hasOwn(record, key) ? record[key] : undefined
}

function isRecord(value: unknown): value is Entry {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isGraded(entry: Entry) {
  return GRADED.some((event) => event === get(entry, "event"))
}

function isControl(control: {
  readonly id: unknown
  readonly assert: unknown
  readonly verdict: unknown
  readonly graded_by: unknown
}): control is Control {
  return (
    typeof control.id === "string" &&
    (control.assert === null || typeof control.assert === "string") &&
    typeof control.verdict === "string" &&
    typeof control.graded_by === "string"
  )
}

function isTextDrift(drift: RecordedDrift): drift is Drift {
  return typeof drift.id === "string" && drift.verdicts.every((verdict) => typeof verdict === "string")
}

interface Verdict {
  readonly intact: boolean
  readonly errors: boolean
  readonly invalid: boolean
  readonly diverged: boolean
  readonly unverified: boolean
  readonly noControls: boolean
  readonly truncated: boolean
  readonly failing: boolean
  readonly laundered: boolean
  readonly drift: boolean
  readonly escalated: boolean
}

// Tamper (1) dominates every reason the run is not an auditable pass (2), which dominates a pass (0).
function exitOf(verdict: Verdict): 0 | 1 | 2 {
  if (!verdict.intact) return 1
  const blocked = [
    verdict.errors,
    verdict.invalid,
    verdict.diverged,
    verdict.noControls,
    verdict.truncated,
    verdict.failing,
    verdict.drift,
    verdict.escalated,
    verdict.unverified,
  ]
  return blocked.some(Boolean) ? 2 : 0
}

function resultOf(exit: 0 | 1 | 2, verdict: Verdict): RelayLedger.AuditResult {
  if (exit === 0) return "PASS"
  if (exit === 1) return "TAMPERED"
  if (verdict.errors) return "RECORD-INVALID"
  if (verdict.invalid) return "SPRINT-INVALID"
  if (verdict.diverged) return "SPRINT-DIVERGED"
  if (verdict.noControls) return "NO-CONTROLS"
  if (verdict.failing) return "CONTROL-FAIL"
  if (verdict.laundered) return "ORACLE-CHANGED"
  if (verdict.drift) return "ORACLE-DRIFT"
  if (verdict.escalated) return "ESCALATED"
  if (verdict.unverified && !verdict.truncated) return "ORACLE-UNVERIFIED"
  return "TRUNCATED"
}

// `sorted()` on text: code point order, not UTF-16 unit order.
function byCodePoint(left: string, right: string) {
  const a = Array.from(left, (char) => char.codePointAt(0)!)
  const b = Array.from(right, (char) => char.codePointAt(0)!)
  const differs = a.findIndex((point, index) => index >= b.length || point !== b[index])
  if (differs === -1) return a.length - b.length
  if (differs >= b.length) return 1
  return a[differs] - b[differs]
}

function exists(file: string) {
  return stat(file).then(
    () => true,
    () => false,
  )
}

// `os.path.join` without normalization: the joined path is printed.
function join(directory: string, ...names: string[]) {
  return names.reduce(
    (joined, name) => (joined === "" || SEPARATORS.includes(joined.at(-1)!) ? joined + name : joined + path.sep + name),
    directory,
  )
}

const SEPARATORS = process.platform === "win32" ? "\\/" : "/"

function code(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error ? String(error.code) : undefined
}

// `str(OSError)`: `[Errno N] strerror: 'path'`.
function osError(name: string | undefined, file: string, error?: unknown) {
  const message = name === undefined ? undefined : STRERROR[name]
  const errno = name === undefined ? undefined : ERRNO.get(name)
  if (message === undefined || errno === undefined) return error instanceof Error ? error.message : String(error)
  return `[Errno ${errno}] ${message}: ${RelayJson.reprString(file)}`
}

const ERRNO = new Map(Object.entries(constants.errno))
const STRERROR: Record<string, string | undefined> = {
  EACCES: "Permission denied",
  EISDIR: "Is a directory",
  ELOOP: "Too many levels of symbolic links",
  ENAMETOOLONG: "File name too long",
  ENOENT: "No such file or directory",
  ENOTDIR: "Not a directory",
  EPERM: "Operation not permitted",
}

// The UnicodeDecodeError of a one-pass decode: the first sequence CPython rejects, positioned in the whole file.
function undecodable(bytes: Uint8Array) {
  const failure = firstInvalid(bytes)
  const range =
    failure.end - failure.start === 1
      ? `byte 0x${bytes[failure.start].toString(16).padStart(2, "0")} in position ${failure.start}`
      : `bytes in position ${failure.start}-${failure.end - 1}`
  return `'utf-8' codec can't decode ${range}: ${failure.reason}`
}

function firstInvalid(bytes: Uint8Array) {
  for (let at = 0; at < bytes.length; ) {
    const lead = bytes[at]
    const size = lead < 0x80 ? 0 : lead < 0xc2 ? -1 : lead < 0xe0 ? 1 : lead < 0xf0 ? 2 : lead < 0xf5 ? 3 : -1
    if (size === -1) return { start: at, end: at + 1, reason: "invalid start byte" }
    for (let offset = 1; offset <= size; offset++) {
      if (at + offset >= bytes.length) return { start: at, end: bytes.length, reason: "unexpected end of data" }
      if (!continues(lead, offset, bytes[at + offset]))
        return { start: at, end: at + offset, reason: "invalid continuation byte" }
    }
    at += size + 1
  }
  return { start: bytes.length, end: bytes.length, reason: "unexpected end of data" }
}

// The second byte of E0, ED, F0 and F4 sequences has a narrower range (no overlong form, surrogate or value past
// U+10FFFF).
function continues(lead: number, offset: number, byte: number) {
  if (offset > 1) return byte >= 0x80 && byte <= 0xbf
  if (lead === 0xe0) return byte >= 0xa0 && byte <= 0xbf
  if (lead === 0xed) return byte >= 0x80 && byte <= 0x9f
  if (lead === 0xf0) return byte >= 0x90 && byte <= 0xbf
  if (lead === 0xf4) return byte >= 0x80 && byte <= 0x8f
  return byte >= 0x80 && byte <= 0xbf
}
