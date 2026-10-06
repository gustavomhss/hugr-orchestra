// @atlas/adapter-io — src/native-memory.ts  (the BOUND Memory composition — F3 work package A1)
//
// ── REFERENCE MODEL — NO PRODUCTION CALLERS INSIDE THIS TREE ─────────────────────────────────────────────
// Declared in `harness/gates/reference-model-guard.mjs`. Its consumer is a HARNESS outside the Atlas tree
// (Orchestra's backend specialist, through the installed boundary package — F3 clause 27, work package A3), so no
// module under `packages/*/src` calls it and none should: the CLI/MCP doors compose Memory through
// `compose.ts`, which resolves the owner from `ATLAS_ACTOR ?? git user.email`, and F3 clause 4 forbids
// exactly that route here. The entry goes stale when an in-tree caller appears, and the gate says so.
//
// ── WHAT THIS FILE IS ────────────────────────────────────────────────────────────────────────────────────
// The four Memory doors (`createDurableMemory`, `createMemoryRead`, `createMemoryEmit`, the scanner) composed
// under ONE immutable `AtlasBinding` the harness supplies. Three things are FORCED from the binding and
// cannot be supplied by any input to the returned surface: the storage root (clause 30), the owner every
// read filters on and every write is minted with (clauses 2-4, 12), and the scanner path (clause 31).
// Nothing here reads `cwd`, the environment or git identity.
//
// ── IDENTITY IS RETURNED, NEVER RECOMPUTED BY A CONSUMER (clause 5) ──────────────────────────────────────
// `RecordRef = { contentHash, eventId }` is read from the durable log's own event envelope for every record
// this surface returns, and from `versioned([record])` — the exact event `append` writes — for an admitted
// write. Identity is content-derived: the same owner submitting an identical entry gets the same ref, the
// fold holds one record, and the log still gains a physical duplicate line.
//
// ── STORE STATE (clauses 7, 13) ──────────────────────────────────────────────────────────────────────────
// `complete` = every line parsed and self-verified; `partial` = at least one rejected line; `unavailable` =
// the file could not be read at all. An empty COMPLETE result is a legitimate "nothing recorded"; the other
// two are never presented as empty. A partial store still SERVES what verified (each line carries its own
// content hash, so a served record is sound) and says it is partial.
//
// ── EXACT FOLD RESOLUTION (clause 15) ────────────────────────────────────────────────────────────────────
// `resolveFold(unit, ref)` looks the record up by `eventId` in the folded log and checks owner, kind and
// unit id — it never consults `spawnFold`/`makeRespawn`, whose `archive.find` returns the FIRST own match in
// log order, i.e. the OLDEST checkpoint. Without a ref (no host receipt, clause 16) exactly one own record
// is selected; several refuse `ambiguous` (owner ruling F3-D3); log order is never read as "latest".
// The `pr` projection (`PrClosingFold`, clause 14) belongs to work package A2 and does not exist yet: a `pr`
// resolution returns the exact verified `record` and no `fold`.
//
// ── ADMISSION CONCURRENCY, BOUNDED (clause 26, owner ruling F3-D8) ───────────────────────────────────────
// Correct for ONE writer process per storage root. The emit door reads the incumbent/cap state, scans, then
// appends; nothing serialises that sequence across processes, and this file adds no lock. Two processes
// writing `project` rules for one owner at once can each pass the cap against the same pre-state. Each
// append is still a single `O_APPEND` write, so no record is lost or spliced — the bound is on the GATES.

import { isAbsolute } from "node:path"
import { put, taskClosingFold, tok, versioned } from "@atlas/memory"
import type {
  Awareness,
  ClosingFold,
  FacetState,
  MemberId,
  MemoryEntry,
  MemoryRecord,
  NamedScanner,
  Orientation,
  ResumeUnit,
  TaskMemoryEntry,
  TurnHeader,
} from "@atlas/memory"
import type { Hash } from "@atlas/contracts"
import { createDurableMemory } from "./memory-store.js"
import type { DurableMemory, MemoryRead } from "./memory-store.js"
import { createMemoryEmit } from "./memory-emit.js"
import type { MemoryRejected } from "./memory-emit.js"
import { createMemoryRead } from "./memory-read.js"
import { createAwarenessStore } from "./awareness-store.js"
import { createDurableOrientation } from "./orientation-store.js"
import { KNOWN_SCANNERS, detectAvailableScanner, runScanner } from "./scanner.js"
import type { ScannerBinarySpec } from "./scanner.js"

/** F3 clause 1. Supplied by the harness, frozen on entry; the model never supplies any field of it. */
export interface AtlasBinding {
  readonly storage: { readonly projectID: string; readonly root: string }
  readonly source: { readonly worktree: string; readonly revision: string }
  /** The stable roster member id (clause 2). The ONLY owner this surface writes as, and the owner it reads as. */
  readonly memoryOwner: MemberId
  /** Ids the SAME member's records were written under before its id was renamed. `recall`, `resolveFold` and the
   *  header's rules read a record owned by one of them as the binding owner's; nothing is ever written or minted
   *  under them, and a stored record is served unchanged. NOT in clause 1's field set — added for a harness seat
   *  rename. */
  readonly legacyOwners?: readonly MemberId[]
  /** Execution provenance. Carried for the host's receipt; never written into an entry or record (clause 3). */
  readonly execution: {
    readonly actor: { readonly memberId: string; readonly projectId: string; readonly sessionId: string }
    readonly executionSessionID: string
    readonly invocation?: { readonly callID: string; readonly assistantMessageID: string }
  }
  readonly unit?: ResumeUnit
  readonly logicalResumeID?: string
  /** An explicit scanner binary (the backend specialist toolkit's fetched `gitleaks`), tried before PATH (clause 31).
   *  NOT in clause 1's field set — added by the A1 brief; see the work package report. */
  readonly scanner?: { readonly name: ScannerBinarySpec["name"]; readonly command: string }
}

export type StoreState = "complete" | "partial" | "unavailable"
export interface RecordRef {
  readonly contentHash: string
  readonly eventId: string
}

export interface SlabStates {
  readonly awareness: { readonly [F in keyof Awareness]: FacetState }
  readonly rules: StoreState
}
export interface HeaderBound {
  readonly rulesWords: number
  readonly method: "whitespace-words"
}
/** Clause 7. `header` is absent exactly when the rules store is `unavailable`. */
export interface BoundHeader {
  readonly header?: TurnHeader
  readonly state: SlabStates
  readonly bound: HeaderBound
}

export type BoundRecallQuery =
  | { readonly kind: "task"; readonly taskId: string }
  | { readonly kind: "pr"; readonly prId: string }
export interface BoundRecall {
  readonly records: readonly MemoryRecord[]
  readonly refs: readonly RecordRef[]
  readonly store: StoreState
}

export type FoldRefusal =
  | "no-own-fold"
  | "record-not-found"
  | "foreign-owner"
  | "unit-mismatch"
  | "store-partial"
  | "store-unavailable"
  | "ambiguous"
/** Clause 15. `fold` is present for a `task` unit; a `pr` projection is A2's (see the header). */
export type FoldVerdict =
  | {
      readonly ok: true
      readonly unit: ResumeUnit
      readonly ref: RecordRef
      readonly record: MemoryRecord
      readonly fold?: ClosingFold
    }
  | { readonly ok: false; readonly refusal: FoldRefusal; readonly reason: string }

/** Clause 23. A refusal is the emit door's `MemoryRejected`, passed through verbatim. */
export type WriteVerdict =
  | { readonly ok: true; readonly record: MemoryRecord; readonly ref: RecordRef }
  | MemoryRejected

/** Clause 25. */
export type ReconcileVerdict =
  | { readonly present: true; readonly ref: RecordRef }
  | { readonly present: false; readonly store: StoreState }

export interface NativeMemory {
  readonly binding: AtlasBinding
  header(awareness: Awareness, orientation: Orientation): BoundHeader
  recall(query: BoundRecallQuery): BoundRecall
  resolveFold(unit: ResumeUnit, ref?: RecordRef): FoldVerdict
  write(entry: MemoryEntry): WriteVerdict
  reconcile(entry: MemoryEntry): ReconcileVerdict
}

export function createNativeMemory(input: AtlasBinding): NativeMemory {
  const binding = freezeBinding(input)
  const owner = binding.memoryOwner
  const owners = new Set([owner, ...(binding.legacyOwners ?? [])])
  const store = createDurableMemory(binding.storage.root)

  function resolveFold(unit: ResumeUnit, ref?: RecordRef): FoldVerdict {
    const read = store.read()
    const state = storeStateOf(read)
    if (state === "unavailable")
      return refuse("store-unavailable", `the memory log at '${store.path}' could not be read`)
    if (ref === undefined) return selectWithoutReceipt(read, state, unit)
    const ev = read.log.get(ref.eventId as Hash)
    if (ev === undefined || ev.contentHash !== ref.contentHash) {
      return state === "partial"
        ? refuse(
            "store-partial",
            `record ${ref.eventId} is not in the log, which has ${read.rejected} rejected line(s) it may be in`,
          )
        : refuse("record-not-found", `no record with eventId ${ref.eventId} and contentHash ${ref.contentHash}`)
    }
    return project(unit, ref, ev.payload as MemoryRecord)
  }

  function selectWithoutReceipt(read: MemoryRead, state: StoreState, unit: ResumeUnit): FoldVerdict {
    if (state === "partial") {
      return refuse(
        "store-partial",
        `cannot count ${unit.kind} '${unit.id}' checkpoints: ${read.rejected} rejected line(s)`,
      )
    }
    const own = [...read.log.entries()].filter(([, ev]) => isOwnUnit(ev.payload as MemoryRecord, unit))
    if (own.length === 0) return refuse("no-own-fold", `no own ${unit.kind} record for '${unit.id}' (owner '${owner}')`)
    if (own.length > 1) {
      return refuse(
        "ambiguous",
        `${own.length} own ${unit.kind} records for '${unit.id}' and no receipt names one; log order is not "latest"`,
      )
    }
    const [eventId, ev] = own[0]!
    return project(unit, { contentHash: ev.contentHash, eventId }, ev.payload as MemoryRecord)
  }

  function project(unit: ResumeUnit, ref: RecordRef, record: MemoryRecord): FoldVerdict {
    if (!owners.has(record.owner))
      return refuse("foreign-owner", `record ${ref.eventId} belongs to '${record.owner}', not '${owner}'`)
    if (!isOwnUnit(record, unit))
      return refuse("unit-mismatch", `record ${ref.eventId} is not the ${unit.kind} '${unit.id}'`)
    const base = { ok: true as const, unit: { kind: unit.kind, id: unit.id }, ref, record }
    return unit.kind === "task" ? { ...base, fold: taskClosingFold(record.entry as TaskMemoryEntry) } : base
  }

  function isOwnUnit(record: MemoryRecord, unit: ResumeUnit): boolean {
    const e = record.entry as { readonly taskId?: unknown; readonly prId?: unknown }
    return (
      owners.has(record.owner) && record.kind === unit.kind && (unit.kind === "task" ? e.taskId : e.prId) === unit.id
    )
  }

  return {
    binding,

    header: (awareness, orientation) => boundHeader(binding, store, awareness, orientation),

    recall(query): BoundRecall {
      const q = narrowRecall(query)
      const read = store.read()
      const state = storeStateOf(read)
      if (state === "unavailable") return { records: [], refs: [], store: state }
      // The owner is set HERE, after narrowing, from the binding — a caller-supplied `owner` never survives. Each
      // owner the binding reads as is recalled separately, and the union is served in the store's own order.
      const matched = new Set(
        [...owners].flatMap((o) =>
          createMemoryRead({ store: frozen(read, store.path), actor: o }).recall({ ...q, owner: o }),
        ),
      )
      const records = read.store.filter((r) => matched.has(r))
      const refOf = new Map(
        [...read.log.entries()].map(([eventId, ev]) => [ev.payload, { contentHash: ev.contentHash, eventId }]),
      )
      return { records, refs: records.map((r) => refOf.get(r)!), store: state }
    },

    resolveFold,

    write(entry): WriteVerdict {
      const verdict = createMemoryEmit({ store, actor: owner, ...scannerFor(binding) }).emit(entry)
      return verdict.ok ? { ok: true, record: verdict.record, ref: refOfRecord(verdict.record) } : verdict
    },

    reconcile(entry): ReconcileVerdict {
      const read = store.read()
      const state = storeStateOf(read)
      const ref = admissibleRef(entry, owner)
      if (ref !== undefined && read.log.has(ref.eventId as Hash)) return { present: true, ref }
      return { present: false, store: state }
    },
  }
}

/** The part of `AtlasBinding` a header read needs (clauses 1, 2, 30). A header read writes nothing and mints no
 *  receipt, so it takes no execution provenance, and a host never has to fabricate one to read it. */
export type HeaderBinding = Pick<AtlasBinding, "storage" | "memoryOwner" | "legacyOwners">

/** Clauses 6-9 as one host read: the bound running header for `memoryOwner` (and its `legacyOwners`), with the
 *  shared Awareness and Orientation slabs assembled from the SAME storage root's own stores — the slabs
 *  `compose.ts` builds for the CLI/MCP header, without its `ATLAS_ACTOR ?? git user.email` owner (clause 4).
 *  Reads only; an Awareness or Orientation source that cannot be assembled throws, and the host renders that
 *  as a degraded header (clause 10). */
export function readBoundHeader(input: HeaderBinding): BoundHeader {
  const binding = freezeBinding(input)
  const root = binding.storage.root
  return boundHeader(
    binding,
    createDurableMemory(root),
    createAwarenessStore(root).read(),
    createDurableOrientation(root).orientation(),
  )
}

/** Clause 7. A legacy owner's `project` rules rank as the binding owner's own: the read door ranks a snapshot in
 *  which those records carry `memoryOwner`, so a rule kept under the member's former id stays in its header and
 *  the same rule text under both ids folds to one. The log itself is never rewritten. */
function boundHeader(
  binding: HeaderBinding,
  store: DurableMemory,
  awareness: Awareness,
  orientation: Orientation,
): BoundHeader {
  const owner = binding.memoryOwner
  const legacy = new Set(binding.legacyOwners ?? [])
  const read = store.read()
  const rules = storeStateOf(read)
  const state = { awareness: facetStates(awareness), rules }
  if (rules === "unavailable") return { state, bound: { rulesWords: 0, method: "whitespace-words" } }
  const own = { ...read, store: read.store.map((r) => (legacy.has(r.owner) ? { ...r, owner } : r)) }
  const header = createMemoryRead({ store: frozen(own, store.path), actor: owner }).header(awareness, orientation)
  return {
    header,
    state,
    bound: { rulesWords: header.rules.reduce((n, r) => n + tok(r), 0), method: "whitespace-words" },
  }
}

/** Clause 7 — the one derivation of `StoreState` from a read. */
export function storeStateOf(read: MemoryRead): StoreState {
  if (read.unreadable === true) return "unavailable"
  return read.rejected > 0 ? "partial" : "complete"
}

const refuse = (refusal: FoldRefusal, reason: string): FoldVerdict => ({ ok: false, refusal, reason })

/** The exact event `DurableMemory.append` writes for `record` — the same `versioned` seam, so the ref a
 *  write returns is the key the next read finds it under. */
function refOfRecord(record: MemoryRecord): RecordRef {
  const [ev] = [...versioned([record]).values()]
  return { contentHash: ev!.contentHash, eventId: ev!.id }
}

/** The ref an admitted write of `entry` by `owner` would carry, or `undefined` when `put` would refuse it —
 *  an entry the door can never admit can never be present. */
function admissibleRef(entry: MemoryEntry, owner: MemberId): RecordRef | undefined {
  try {
    return refOfRecord(put("memory", entry, owner))
  } catch {
    return undefined
  }
}

/** One read, served to the read door as a fixed store, so a header or recall answers from the SAME snapshot
 *  its store state was derived from — a second read could see a different file. */
function frozen(read: MemoryRead, path: string): DurableMemory {
  return {
    path,
    read: () => read,
    append: () => {
      throw new Error("native-memory: a read snapshot is not writable")
    },
  }
}

function facetStates(a: Awareness): SlabStates["awareness"] {
  return {
    mission: a.mission.state,
    constitution: a.constitution.state,
    terrain: a.terrain.state,
    ontology: a.ontology.state,
    taste: a.taste.state,
  }
}

/** Clause 12, at runtime: only `{kind:'task',taskId}` / `{kind:'pr',prId}` with a non-empty id. Every other
 *  key — `owner` above all — is dropped by reconstruction, not by a deny-list that could miss one. */
function narrowRecall(query: unknown): BoundRecallQuery {
  const q = (typeof query === "object" && query !== null ? query : {}) as Record<string, unknown>
  if (q.kind === "task" && typeof q.taskId === "string" && q.taskId !== "") return { kind: "task", taskId: q.taskId }
  if (q.kind === "pr" && typeof q.prId === "string" && q.prId !== "") return { kind: "pr", prId: q.prId }
  throw new Error("native-memory: recall accepts only {kind:'task',taskId} or {kind:'pr',prId}")
}

/** Clause 31. The explicit binding path first, then PATH (`gitleaks`, then `trufflehog`), with the SAME
 *  calibrated argv. No binary ⇒ no scanner ⇒ the emit door refuses `scanner-unavailable`. The returned
 *  scanner keeps the THIRD verdict: `could-not-run` throws, which the door reports as `scanner-unavailable`
 *  (clause 23a) — `makeScannerAdapter` collapses it into a block, which would read as "a secret was found". */
function scannerFor(binding: AtlasBinding): { readonly scanner?: NamedScanner } {
  const explicit = binding.scanner
  const pinned =
    explicit === undefined
      ? []
      : KNOWN_SCANNERS.filter((s) => s.name === explicit.name).map((s) => ({ ...s, command: explicit.command }))
  const spec = detectAvailableScanner([...pinned, ...KNOWN_SCANNERS])
  if (spec === null) return {}
  return {
    scanner: {
      name: spec.name,
      scan(record: MemoryRecord): boolean {
        const verdict = runScanner(spec, record)
        if (verdict === "could-not-run")
          throw new Error(`'${spec.command}' did not return a documented clean or hit exit`)
        return verdict === "hit"
      },
    },
  }
}

/** Clause 1: a deep, frozen COPY, so neither the caller's object nor a later mutation of it can move the
 *  owner or the root after composition. Validated, because an empty owner or root is a host bug that would
 *  otherwise surface as an `unowned` refusal or a write into `cwd`. */
function freezeBinding<T extends HeaderBinding>(input: T): T {
  if (typeof input.memoryOwner !== "string" || input.memoryOwner === "") {
    throw new Error("native-memory: AtlasBinding.memoryOwner must be a non-empty roster member id")
  }
  if (
    input.legacyOwners !== undefined &&
    (!Array.isArray(input.legacyOwners) ||
      input.legacyOwners.some((o) => typeof o !== "string" || o === "" || o === input.memoryOwner))
  ) {
    throw new Error("native-memory: AtlasBinding.legacyOwners must be non-empty ids other than memoryOwner")
  }
  if (typeof input.storage?.root !== "string" || !isAbsolute(input.storage.root)) {
    throw new Error("native-memory: AtlasBinding.storage.root must be an absolute path")
  }
  return deepFreeze(structuredClone(input))
}

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const v of Object.values(value)) deepFreeze(v)
    Object.freeze(value)
  }
  return value
}
