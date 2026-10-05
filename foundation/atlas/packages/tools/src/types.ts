// @atlas/tools — src/types.ts  (frozen data model + shared/unconsumed API interfaces; zero runtime)
//
// Layer 7 PUBLIC tool / OKF data model: the tool result records + the `next+invariant` guidance envelope,
// plus the co-located API interfaces no single impl owns — the handler union/oracle (ToolData / Transport /
// HandlerApi, consumed by ≥2 src files) and the tri-transport NodeApi (which no src file re-exports). The
// contracts-owned vocab (`Pack`/`Hash`/`NodeKey`/`Territory`/…) is IMPORTED, NEVER redefined. TOOLS-1
// (amended WP-SAMEAS): writes flow through GOVERNED doors — `atlas-emit` + `atlas-link` (WRITE_PATHS); the
// other governance tools (`-init`/`-query`/`-reconcile`) + diff/doctor/node are read-only. See
// docs/adr/ADR-0003-governed-write-doors.md.

import type { Hash, NodeKey, Pack, StructRef, Territory, ToolSchema } from "@atlas/contracts"
import type { GroundedFact, PredicateSlot, SameAs, Subsumes } from "@atlas/knowledge"
import type { MemoryRecord } from "@atlas/memory"
import type { VersionDelta } from "@atlas/persist"
import type { OwnPack, OwnUnit, RelationSet } from "@atlas/retrieval"

// Re-export the contracts-owned surface vocab so consumers can pull the whole dialect from the bare
// package root. Owned by @atlas/contracts — re-exported, NOT redefined.
export type { Hash, Pack, PackInvariant, Territory } from "@atlas/contracts"

/**
 * The closed governance-tool vocabulary. Transcribed from atlas-tools:15 — `Tool = 'atlas-init' |
 * 'atlas-query' | 'atlas-emit' | 'atlas-reconcile'` — then EXTENDED by WP-SAMEAS (owner-authorized
 * 2026-07-21) with `atlas-link`, a SECOND governed write door. `atlas-diff` / `atlas doctor` / `atlas node`
 * are deliberately NOT members — they are read-only projections, not a governance tool.
 *
 * [WRITE SURFACE — TOOLS-1, extended] the write doors are `atlas-emit` + `atlas-link` (`WRITE_PATHS`); the
 * read/derive tools are `atlas-init` / `atlas-query` / `atlas-reconcile`. `atlas-link` records a symmetric
 * human `sameAs` equivalence under the SAME authz+ratify governance as emit — NON-destructive (never a merge).
 *
 * [EXTENDED — WP-11.W8 / CAMPAIGN-11] `atlas-memory-emit` joins as a THIRD governed write door — the ONE
 * path a `MemoryEntry` reaches the durable per-seat memory log (`@atlas/memory` MEM-1..9), through the SEVEN
 * fail-closed gates `createMemoryEmit` composes (`packages/adapter-io/src/memory-emit.ts`). It is a NEW
 * `Tool`, not a reuse of `atlas-emit`'s door: the store it appends to (`.atlas/memory.jsonl`) is a
 * SEPARATE durable log from the knowledge CAS `atlas-emit` writes, so ADR-0008's "an ordinary use of the
 * existing emit door" reasoning does not apply — this is genuinely new governed surface. `GOVERNANCE_SURFACE`
 * grows from five to SIX and `WRITE_PATHS` from two to three (ARCH-6/ARCH-7, ADR-0006 Decision 2: the surface
 * is DERIVED and BUDGETED — `advertised ≡ invocable ≡ Tool`, bounded at 30 — not a fixed count; six is well
 * inside that budget).
 */
export type Tool = "atlas-init" | "atlas-query" | "atlas-emit" | "atlas-reconcile" | "atlas-link" | "atlas-memory-emit"

/**
 * The guidance envelope shipped with EVERY result (TOOLS-4). Transcribed EXACTLY from atlas-tools:16 —
 * `Guidance = { next: string, invariant: string }`: what to do next + which invariant governs, so the
 * caller is never left to guess the follow-up. Both fields MUST be non-empty on every path (§Acceptance).
 */
export interface Guidance {
  readonly next: string
  readonly invariant: string
}

/**
 * The total result wrapper (TOOLS-2 pure+total, TOOLS-4 guidance shipped). Transcribed EXACTLY from
 * atlas-tools:17 — `Verdict = { ok, data?, rejected?, guidance }`. A malformed argument fails CLOSED to
 * a structured rejected verdict — NEVER a throw. The one published schema (TOOLS-3) is byte-identical
 * over CLI and MCP.
 *
 * `data` is generic over the per-tool result record (`InitOut` / `QueryOut` / …). Under
 * `exactOptionalPropertyTypes`, `data?` / `rejected?` are genuinely present-on-ok / present-on-reject.
 */
export interface Verdict<T = unknown> {
  readonly ok: boolean
  readonly data?: T
  readonly rejected?: string
  readonly guidance: Guidance // TOOLS-4 — non-empty on every path
}

/**
 * `atlas-init` result (TOOLS-5). Transcribed EXACTLY from atlas-tools:19 —
 *   `InitOut = { territories: Territory[], blastRadius, t0Candidates: string[] }`.
 * The `$0`-LLM structural move-in: every territory ships at the `T2/advisory` default with ZERO
 * invariants; `t0Candidates` NAMES the T0-keyword territories FLAGGED but NOT promoted (§Acceptance §8.5/
 * §8.6 — a T0-keyword territory yields a candidate flag AND `tier=='T2'`). `Territory` is the
 * contracts-owned manifest shape (`{name,owner,tier,globs}`) — imported, not redefined.
 *
 * [PINNED — `blastRadius` type] atlas-tools:19 names `blastRadius` (the move-in's blast-radius summary).
 * Owner DEFINE 2026-07-18 (oracle-pin theme #3): the reachability set → `readonly NodeKey[]`. The
 * reverse-dep closure already lives in index axis-3, so the *set* of reached nodes is the honest carrier.
 */
export interface InitOut {
  readonly territories: readonly Territory[] // all at T2/advisory, ZERO invariants (TOOLS-5)
  readonly blastRadius: readonly NodeKey[] // [PINNED theme #3] reachability set — reverse-dep closure (atlas-tools:19)
  readonly t0Candidates: readonly string[] // T0-keyword territory NAMES flagged, NOT promoted (A-6)
}

/**
 * `atlas-query` result (TOOLS-6, as amended by ADR-0013) — `QueryOut = Pack`: the covering bounded pack in
 * TWO bands. `invariants` is the GOVERNING band (`tier≥T1`, ratified, under the `≤ ~2K` bound); `advisory`
 * is the ADVISORY band (`T2` — machine proposals NO ratifier saw) under its own separate `ADVISORY_CAP`,
 * with `advisoryDropped` counting what that cap dropped. They are separate FIELDS, never one filtered list,
 * so a `T2` proposal can never arrive on the line form a ratified invariant arrives on. Every row carries
 * its own `freshness`; a `stale:true` pack means re-ground before trusting (§6.1).
 *
 * `Pack` is the contracts-owned injection type — imported, NEVER redefined.
 *
 * THIS COMMENT NO LONGER TRANSCRIBES `atlas-tools:20`, and that is deliberate. It used to read "the merged
 * covering bounded pack (`≤ ~2K`, `tier≥T1`, stale-flagged)" — the same single-band promise that #193 fixed
 * on the published MCP `description`, surviving here on the very type this door returns and hover-rendered
 * for every consumer of `@atlas/tools`. `INV-TOOLS-6` in `docs/reference/atlas-tools.md` still states the
 * pre-amendment form; amending a ratified INVARIANT is its own owner-ratified change and is tracked
 * separately, so this comment describes the SHIPPED type and names the divergence rather than transcribing
 * a line that the code has outgrown.
 */
export type QueryOut = Pack

/**
 * `atlas-emit` result (TOOLS-7). Transcribed EXACTLY from atlas-tools:21 —
 *   `EmitOut = { emitted: boolean, id?, rejected?: string }`.
 * Fail-closed: a node whose grounding does not re-derive at `source@sha` ⇒ `emitted:false`, nothing
 * persisted, a structured `rejected`. On success, `id` is the CAS id of the persisted object.
 *
 * [FLAG — `id` = `Hash`] atlas-tools:21 leaves `id` untyped; it is the content-addressed CAS id of the
 * persisted object (mirrors the @atlas/knowledge `EmitApi.admit` receipt `id?: Hash`). Transcribed as
 * `Hash`. Under `exactOptionalPropertyTypes`, `id?` is absent-on-reject / present-on-emit.
 *
 * [AUTHOR-14 — ADDITIVE `nodeKey`] AUTHOR-14 (`docs/reference/atlas-authoring.md#author-14`, SCN-AUTH-14a-1/
 * 14b-1/14c-1): the receipt closes the loop — the value the governed emit door returns on success MUST also
 * carry the identity the per-node read door (`atlas node`, `NodeApi.node(nodeAddr: NodeKey)`) and the link
 * door (`atlas-link`) consume, so an author can address the fact they just wrote without a separate query.
 * `nodeKey` is `NodeKey` — the SAME identity type `NodeApi.node` takes, imported from `@atlas/contracts`,
 * NEVER redefined. Purely ADDITIVE: the existing CAS `id` stays, same name, same type (SCN-AUTH-14c-1 teeth —
 * a receipt that carries `nodeKey` but drops the CAS `id` fails the drift/doctor CAS read-back arm). No
 * population logic here (WP-10.A4.ADAPTER); under `exactOptionalPropertyTypes`, `nodeKey?` is
 * absent-on-reject / present-on-emit, mirroring `id?`.
 */
export interface EmitOut {
  readonly emitted: boolean
  readonly id?: Hash // [FLAG] CAS id of the persisted object — mirrors knowledge EmitApi.admit
  readonly nodeKey?: NodeKey // [AUTHOR-14, ADDITIVE] read-door identity — same type as NodeApi.node's arg
  readonly rejected?: string // structured fail-closed reason (TOOLS-7)
}

/**
 * `atlas-link` result (WP-SAMEAS) — the governed sameAs write door's outcome. TOOLS-owned (like `EmitOut`)
 * so the DAG stays one-way: adapter-io's `createGovernedLink` IMPORTS this from `@atlas/tools`, never the
 * reverse. Fail-closed: a link that fails a governance gate (distinct / both-known / authorized / ratified)
 * ⇒ `linked:false` + a structured `rejected`, nothing persisted. On success both `a`/`b` echo the equated
 * nodeKeys. `linked:false` is surfaced as a rejected `Verdict` on both doors (mirrors `emitted:false`) so a
 * refused governed write is never a silent `ok`. Under `exactOptionalPropertyTypes`, `rejected`/`a`/`b` are
 * present-on-the-relevant-path only.
 */
export interface LinkOut {
  /** The governed link act SETTLED and changed the stored relation. It does NOT by itself mean `a ≡ b` now
   *  holds — read it together with {@link LinkOut.retracted}. `linked:false` is the ONE fail-closed
   *  discriminator every transport keys off (handler `isFailClosedWrite`, CLI exit 2, MCP `isError`), so
   *  both modes' refusals are visible everywhere with no new plumbing. */
  readonly linked: boolean
  readonly rejected?: string // structured fail-closed reason (distinct/unknown/unauthorized/unratified/pair-state)
  readonly a?: string // the first equated nodeKey (present on linked:true)
  readonly b?: string // the second equated nodeKey (present on linked:true)
  /** [A-D3 / task #83] the act was a RETRACTION (`atlas-link --retract`) — the withdrawal of a previously
   *  asserted equivalence — rather than an assertion. Present only on `linked:true` of the retract mode;
   *  ABSENT (not `false`) on an assertion, so every existing consumer of this record is byte-unchanged. */
  readonly retracted?: boolean
}

/**
 * `atlas-memory-emit` result (WP-11.W8) — the governed MEMORY write door's outcome. TOOLS-owned (like
 * `EmitOut`/`LinkOut`) so the DAG stays one-way: `@atlas/adapter-io`'s `createMemoryEmit`
 * (`memory-emit.ts`) composes the seven MEM gates and this leg's WIRE wrapper (`wire.ts`) folds its
 * `MemoryVerdict` (`@atlas/memory`) into this shape — never the reverse import. `admitted:false` is the
 * ONE fail-closed discriminator every transport keys off (handler `isFailClosedWrite`, CLI exit 2, MCP
 * `isError`), mirroring `emitted`/`linked`. `refusal` is the NAMED MEM gate that declined (`undetermined-
 * kind` / `template-invalid` / `kind-conflation` / `unowned` / `logbook-duplicate` / `logbook-unauthorized`
 * / `over-cap` / `scanner-blocked` / `scanner-unavailable`) — a machine value, distinct from `rejected`'s
 * human-readable reason string (the SAME split `refusal`/`reason` `MemoryRejected` already carries).
 * `record` is the persisted `MemoryRecord` on `admitted:true` only. Under `exactOptionalPropertyTypes`,
 * `rejected`/`refusal`/`record` are present-on-the-relevant-path only.
 */
export interface MemoryEmitOut {
  readonly admitted: boolean
  readonly rejected?: string // structured fail-closed reason (the gate's own `reason`, human-readable)
  readonly refusal?: string // the NAMED MEM gate that declined — a machine value (MemoryRefusal, stringified)
  readonly record?: MemoryRecord // present on admitted:true only
}

/**
 * One reviewable drift item (TOOLS-8). Transcribed EXACTLY from atlas-tools:24 —
 *   `DriftItem = { fact: string, class: 'mechanical'|'semantic', anchorWas, anchorNow }`.
 * The `DRIFTED` subset is presented as a reviewable `DriftItem[]` set, NEVER all-or-nothing. The
 * `mechanical`/`semantic` split is the @atlas-knowledge KNOW-5 classifier (referenced, NOT redefined).
 *
 * [PINNED — `anchorWas` / `anchorNow` type] atlas-tools:24 names the old/new grounding anchors — a
 * `path@subtreeHash`-flavored pointer whose `subtreeHash` IS the drift oracle. That is exactly the
 * contracts-owned `StructRef` (the grounding anchor, `{kind,qualifiedPath,subtreeHash}`) — imported, NOT
 * redefined. Reconciled to `StructRef` per the oracle-pin map (grounding anchor carrier).
 */
export interface DriftItem {
  readonly fact: string
  readonly class: "mechanical" | "semantic" // the KNOW-5 split (referenced, not redefined)
  readonly anchorWas: StructRef // [PINNED] old grounding anchor (@atlas/contracts, atlas-tools:24)
  readonly anchorNow: StructRef // [PINNED] new grounding anchor (@atlas/contracts, atlas-tools:24)
}

/**
 * `atlas-reconcile` result (TOOLS-8 / TOOLS-13). Transcribed EXACTLY from atlas-tools:22-23 —
 *   `ReconcileOut = { drift: DriftItem[], mechanical: string[], semantic: string[],
 *                     regroundedCount, reauthorCount, exitCode }`.
 * The exit-gate is deterministic: `exitCode == 2` ONLY when `|semantic| > 0` (block the merge on ANY
 * semantic flip — never a silent green there); a run whose drift is entirely `mechanical` exits `0`
 * (TOOLS-8). `reauthorCount` MUST equal `|semantic|` (never `|DRIFTED|`, never the whole store, A-4).
 * Under `--accept-reground`, `regroundedCount == |mechanical|` — auto-re-grounded in one pass, no human,
 * no block (TOOLS-13); each re-ground write still passes the `atlas-emit` fail-closed check (TOOLS-7).
 *
 * [NOTE — the task's "semanticCount"] the frozen §Data model carries the `semantic: string[]` SUBSET
 * (the drifted fact names); its cardinality (`semantic.length`) IS the semantic count. Transcribed as the
 * richer subset per the frozen reference, NOT collapsed to a bare count.
 */
export interface ReconcileOut {
  readonly drift: readonly DriftItem[] // the reviewable set, never all-or-nothing (TOOLS-8)
  readonly mechanical: readonly string[] // auto-re-groundable fact names (anchor moved, claim re-derives)
  readonly semantic: readonly string[] // BROKEN fact names — blocks (exit 2)
  readonly regroundedCount: number // == |mechanical| under --accept-reground (TOOLS-13)
  readonly reauthorCount: number // == |semantic| (A-4) — never the whole store
  readonly exitCode: number // 2 ONLY when |semantic|>0, else 0 (TOOLS-8) — reference names only {0,2}
}

/**
 * The hot-set size report against a budget (TOOLS-12). Transcribed EXACTLY from atlas-tools:25 —
 * `hotSet?: { size, budget, over: boolean }`: an ADVISORY size check — `over` flags an over-budget
 * hot-set. Read-only; `atlas doctor` persists nothing.
 */
export interface HotSet {
  readonly size: number
  readonly budget: number
  readonly over: boolean // advisory over-budget flag (TOOLS-12)
}

/**
 * A guided re-ground / retire PLAN (TOOLS-12). `atlas doctor reground <fact>` returns a plan a human/agent
 * then runs through `atlas-emit` — it PERSISTS NOTHING itself (the store changes only when the plan is run
 * through the governed `atlas-emit` write door). Carries NO write authority.
 *
 * [PINNED — `emit` payload] atlas-tools names the guided re-ground/retire flow that emits via `atlas-emit`,
 * never a direct store mutation. `fact` + `action` are transcribed from the reference's "re-ground /
 * retire" wording (TOOLS-12, surface :139); the emittable payload is the templated candidate fact the
 * governed `atlas-emit` write door consumes — the @atlas/knowledge `GroundedFact` (mirrors `EmitApi.emit(node:
 * GroundedFact)`), imported, NOT redefined.
 */
export interface RegroundPlan {
  readonly fact: string // the drifted fact the plan targets
  readonly action: "reground" | "retire" // the guided flow (TOOLS-12 "re-ground / retire")
  readonly emit: GroundedFact // [PINNED] templated candidate fact run through atlas-emit (@atlas/knowledge)
}

/**
 * `atlas doctor` result (TOOLS-12). Transcribed EXACTLY from atlas-tools:25 —
 *   `DoctorOut = { archive?, whyBroken?, hotSet?: { size, budget, over }, plan?: RegroundPlan }`.
 * READ-ONLY + advisory: archive browse / drift-explain / hot-set report / guided re-ground plan. It
 * persists nothing; any proposed write funnels through `atlas-emit`. NOT a governance tool at all (the
 * governance surface stays exactly five, and the write surface is the two governed doors `atlas-emit` +
 * `atlas-link` — TOOLS-1 / ADR-0003).
 *
 * [PINNED — `archive` / `whyBroken` types] atlas-tools:25 names both. `archive` = the monotone
 * supersede-lineage view; nothing dies and the archive grows monotone (atlas-tools:136), so the honest
 * minimal carrier is the ordered CAS lineage `readonly Hash[]` (the content-addressed supersede chain).
 * `whyBroken` = the drift-explain (which anchor drifted, mechanical vs semantic) — that is exactly one
 * reviewable `DriftItem` (imported from this module), NOT a fresh record.
 */
export interface DoctorOut {
  readonly archive?: readonly Hash[] // [PINNED] monotone supersede-lineage — ordered CAS chain (atlas-tools:136)
  readonly whyBroken?: DriftItem // [PINNED] drift-explain — the reviewable DriftItem (atlas-tools:25)
  readonly hotSet?: HotSet // hot-set size vs budget (advisory)
  readonly plan?: RegroundPlan // guided re-ground/retire plan — emits via atlas-emit, never direct
  readonly casIntegrity?: CasIntegrity // ADR-0022 — the storage-layer audit of the store doctor diagnoses
}

/**
 * The CAS integrity receipt (ADR-0022). A content-addressed object's filename IS the hash of its content,
 * so "are these bytes what they claim to be" is decidable locally, with no index, no model and no network —
 * and until this leg existed, nothing in the product asked it. The `.gitignore` lets `cas/` and
 * `projection.json` TRAVEL on the argument that trust moved from the committer to the oracle; this is the
 * oracle for the byte layer, the one `verify-store` does not cover.
 *
 * Every count is DERIVED at read time from the bytes actually on disk plus the sidecars actually
 * referencing them. Nothing here is read back from a stored manifest — a manifest would be one more thing
 * that can be wrong, and it would be wrong in exactly the direction that makes this receipt useless.
 */
export interface CasIntegrity {
  /** Value files found under the CAS root. */
  readonly objects: number
  /** Files whose bytes do NOT hash to the address they are filed under — the defect this leg exists for. */
  readonly corrupt: readonly Hash[]
  /** Files whose bytes do not parse as a CAS object at all. Distinct from `corrupt`: a truncated write and a
   *  tampered payload are different incidents, and collapsing them would lose which one happened. */
  readonly unreadable: readonly Hash[]
  /** Hashes a sidecar references with no value file on disk — a dangling pointer into the store. */
  readonly missing: readonly Hash[]
  /** Value files no sidecar references. REPORTED, never acted on: the CAS is append-only and content-keyed,
   *  so a superseded object legitimately outlives the sidecar that referenced it. A count, not a verdict. */
  readonly orphan: number
  /** Distinct hashes the sidecars reference — the denominator `missing` is measured against. */
  readonly referenced: number
  /** True iff `corrupt`, `unreadable` and `missing` are ALL empty. Named rather than left to the caller so
   *  two renderers cannot disagree about what "healthy" means. `orphan` is deliberately NOT a factor. */
  readonly sound: boolean
}

/**
 * `atlas-diff` result (TOOLS-16). The read-only PERSIST-14 version-delta projection —
 * `{added, edited, superseded, decayed}`, each entry carrying its provenance. `VersionDelta` is the
 * @atlas/persist-owned shape (`ref/diff.ts`) — IMPORTED, NEVER redefined here. `atlas-diff` is a READ
 * projection like the per-node handler (TOOLS-10) / `atlas doctor` (TOOLS-12): 0 write path, carries NO
 * write authority; the governance write surface is exactly the two governed doors `atlas-emit` + `atlas-link`
 * (TOOLS-1/16, ADR-0003).
 */
export type DiffOut = VersionDelta

// ── authoring data model (CAMPAIGN-10 · ADR-0004 planner surface) ─────────────────────────────────────
// The authoring surface's OWN result records — transcribed from `reference/atlas-authoring.md` §Data model.
// Every planner computes a payload and persists NOTHING (AUTHOR-2); no record here is a member of
// `WRITE_PATHS`/`GOVERNANCE_SURFACE`. Core shapes (`GroundedFact`, `PredicateSlot`, `StructRef`) are
// @atlas/knowledge / @atlas/contracts-owned — IMPORTED, NEVER redefined. Only `AnchorUnit` / `AnchorsOut` /
// `LanguageHole` are exercised in WP-10.A1.TOOLS; `SlotsOut` / `DraftOut` / `CheckOut` / `GateName` are
// FROZEN for later epics (A2-a slots+draft, A3 check) per §author-2 / §author-3.

/**
 * One groundable unit the built index carries under a path (AUTHOR-3). Transcribed EXACTLY from
 * §Data model — `{ qualifiedPath, kind: 'file'|'dir'|'symbol', subtreeHash, path }`. `subtreeHash` is the
 * unit's CURRENT drift oracle; `qualifiedPath` is the folded unit path (`file::start:kind:name` for a
 * symbol). Kept as the reference's own literal union — it names the coarse anchor grain the planner returns,
 * NOT the finer 6-kind `StructRef.kind`; no core shape is duplicated (the grounding anchor stays `StructRef`).
 */
export interface AnchorUnit {
  readonly qualifiedPath: string
  readonly kind: "file" | "dir" | "symbol"
  readonly subtreeHash: string
  readonly path: string
}

/**
 * A declared structural language hole (AUTHOR-4). A file in a language with NO configured grammar anchors at
 * FILE level and DECLARES the hole rather than silently degrading. Transcribed EXACTLY from §Data model —
 * `{ ext, fileCount, reason }`. `fileCount` is the REAL census of grammar-less files with this extension
 * under the path (never a constant — SCN-AUTH-4b asserts it against the fixture).
 */
export interface LanguageHole {
  readonly ext: string
  readonly fileCount: number
  readonly reason: string
}

/**
 * `anchors <path>` result (AUTHOR-3/4). Transcribed from §Data model — `{ rev, units, holes }` — with the
 * honest-empty `reason` AUTHOR-3 demands ("MUST yield the honest empty set WITH its reason") surfaced as an
 * OPTIONAL field: present iff the path was not groundable (untracked / non-git / unreadable), so a caller
 * reads WHY `units` is empty rather than seeing a bare empty set.
 *
 * [FRAMING NOTE] §Data model's `AnchorsOut = { rev, units, holes }` line omits `reason`; AUTHOR-3 and
 * SCN-AUTH-3d REQUIRE it, so it is declared here — ABSENT on the populated path, PRESENT on the
 * honest-empty path (under `exactOptionalPropertyTypes`, genuinely absent-or-present).
 */
export interface AnchorsOut {
  readonly rev: string
  readonly units: readonly AnchorUnit[]
  readonly holes: readonly LanguageHole[]
  readonly reason?: string // AUTHOR-3 honest-empty reason — present iff `units` is empty (path not groundable)
}

/**
 * One slot paired with its meaning (AUTHOR-5). Transcribed EXACTLY from §Data model — `{ slot, meaning }`.
 * `PredicateSlot` is the @atlas/knowledge-owned CLOSED vocabulary — IMPORTED, never redefined.
 */
export interface SlotInfo {
  readonly slot: PredicateSlot
  readonly meaning: string
}

/**
 * `slots` result (AUTHOR-5) — EXACTLY the closed `PredicateSlot` union, in order, each with its meaning.
 * Transcribed from §Data model — `{ slots }`. FROZEN for WP-10.A2-a.TOOLS (not exercised here).
 */
export interface SlotsOut {
  readonly slots: readonly SlotInfo[]
}

/**
 * `draft` result (AUTHOR-6/7/9/10). Transcribed EXACTLY from §Data model —
 *   `{ fact, rev, operation:'CREATE'|'UPDATE', route:'auto-accept'|'full-ratify', requires? }`.
 * `fact` is the @atlas/knowledge `GroundedFact` the governed emit door consumes — IMPORTED, never redefined.
 * `operation` reports CREATE vs UPDATE at the drafted `(anchor, slot)` identity (AUTHOR-10); `route` states
 * the governed-door route up front and `requires` names the authorizing channel when `route ===
 * 'full-ratify'` (AUTHOR-9). FROZEN for WP-10.A2-a.TOOLS (not exercised here).
 */
export interface DraftOut {
  readonly fact: GroundedFact
  readonly rev: string
  readonly operation: "CREATE" | "UPDATE"
  readonly route: "auto-accept" | "full-ratify"
  readonly requires?: string
}

/**
 * The CLOSED set of governed-door gates (AUTHOR-11/12). Transcribed EXACTLY from §Data model —
 * `'shape' | 'truth' | 'authz' | 'ratify'`. FROZEN for WP-10.A3.TOOLS.
 */
export type GateName = "shape" | "truth" | "authz" | "ratify"

/**
 * One gate's verdict inside a `check` dry-run (AUTHOR-11/12) — the row shape of `CheckOut.gates`. Every
 * refusal names its `gate` from the closed `GateName` set and carries a `remedy` (AUTHOR-12: no raw runtime
 * error ever reaches a user as the reason).
 */
export interface GateResult {
  readonly gate: GateName
  readonly pass: boolean
  readonly reason?: string
  readonly remedy?: string
}

/**
 * `check` result (AUTHOR-11/12) — the dry-run that agrees with the governed door gate-for-gate, in the same
 * order. Transcribed from §Data model — `{ wouldEmit, gates: {gate,pass,reason?,remedy?}[] }`. FROZEN for
 * WP-10.A3.TOOLS (not exercised here).
 */
export interface CheckOut {
  readonly wouldEmit: boolean
  readonly gates: readonly GateResult[]
}

// ── co-located handler surface (was ref/handler.ts — consumed by handler.ts + transport.ts + diff.ts) ──
// The handler union / transport tag / oracle interface carry zero runtime; they live with the shared
// model because each is consumed by ≥2 src files (housing them here keeps the impl files free of
// impl→impl type imports). Transcribed from atlas-tools:6-11, 187-190 + method-tags-tls:26-45, 82-87.

/**
 * The `atlas-query` observability ENVELOPE (WIRE-LOOP Seam-3) — the handler-level `data` shape the query
 * leg now carries so the derived `subsumes` coverage relation (DP-2, the FIRST production call site of
 * `deriveSubsumes`) rides ALONGSIDE the `Pack` without mutating the FROZEN `Pack`/`PackInvariant` contracts.
 * A handler-level widening of `Verdict.data`, NOT a `@atlas/contracts` change: `pack` stays the transcribed
 * `QueryOut`; `subsumes` is the deterministically-sorted `broader ⊃ narrower` edge set, scoped to the pack.
 */
export interface QueryEnvelope {
  readonly pack: Pack
  readonly subsumes: readonly Subsumes[]
  // [WP-SAMEAS — ADDITIVE] the derived human `sameAs` equivalence edges (`deriveSameAs`), scoped to the pack
  // exactly as `subsumes` is (both endpoints under the covering scope). Transitive (union-find), sorted,
  // NON-destructive — rides ALONGSIDE the frozen `Pack`/`subsumes`, mutating neither. `SameAs` is the
  // @atlas/knowledge-owned edge shape (`{a,b}`, canonical a<b) — imported, NOT redefined.
  readonly sameAs: readonly SameAs[]
}

/** The per-tool result payload carried on a `Verdict.data` — the union of the governance-tool result records
 *  (TOOLS-5/6/7/8 + WP-SAMEAS `LinkOut`), plus the `atlas-query` observability envelope (Seam-3). The handler
 *  is one oracle over all; the concrete leg is fixed by `tool`. */
export type ToolData =
  | InitOut
  | QueryOut
  | EmitOut
  | ReconcileOut
  | LinkOut
  | QueryEnvelope
  | AnchorsOut
  | MemoryEmitOut

/** The transport a call arrived on (TOOLS-3/10). Transcribed from the reference's "one contract, two
 *  transports" (CLI≡MCP) plus the tri-transport node reads (MCP tool | poke | CLI). Behaviour MUST NOT
 *  diverge across these — the handler is the single oracle. */
export type Transport = "cli" | "mcp" | "poke"

export interface HandlerApi {
  /** THE one handler. Pure + total (TOOLS-2): malformed `args` ⇒ a structured rejected `Verdict`, never a
   *  throw. Byte-identical over CLI and MCP against the one published schema (TOOLS-3). Carries
   *  `next+invariant` guidance on EVERY path (TOOLS-4). (method-tags-tls:30, 37, 44)
   *
   *  [PINNED — `args` / `data` shapes] `args` STAYS `unknown` by design (TOOLS-2 totality boundary: a
   *  malformed argument fails CLOSED to a rejected `Verdict`, so the input MUST be untyped at the door).
   *  The `Verdict` payload is the per-tool result union `ToolData` (`InitOut | QueryOut | EmitOut |
   *  ReconcileOut`) the reference frames — the concrete leg is fixed by `tool`. */
  handle(tool: Tool, args: unknown): Verdict<ToolData>

  /** Resolve a node by CONTENT ADDRESS through the same one handler (TOOLS-10) — the oracle behind the
   *  tri-transport reads (MCP tool | poke | CLI), byte-identical across all three. READ-ONLY: this opens
   *  NO write path (writes still funnel through `atlas-emit`, TOOLS-1). (method-tags-tls:86) */
  resolveNode(nodeAddr: NodeKey, transport: Transport): Verdict

  /** The one PUBLISHED input schema for a tool (TOOLS-3) — CLI and MCP share it; the two transports MUST
   *  NOT diverge. [PINNED theme #2] the shared MCP tool-schema record → `ToolSchema` from @atlas/contracts
   *  (decide once, share; retrieval `NodeTool.schema` pins to the SAME type — byte-identical schemas). */
  schema(tool: Tool): ToolSchema
}

// ── co-located node projection (was ref/node.ts — impl-less; no src file re-exports NodeApi) ────────────
// The per-node READ projections / node-tools (TOOLS-10, RETR-5): every Atlas node is addressable by its
// CONTENT ADDRESS over THREE transports against ONE handler (MCP tool | poke | CLI), which MUST NOT
// diverge. Read/subscribe only — NO write path (writes still funnel through `atlas-emit`, TOOLS-1). Housed
// here because no impl file consumes it. Transcribed from atlas-tools:59-66, 130-133, 175-176 +
// method-tags-tls:82-87.

export interface NodeApi {
  /** Resolve a node by its CONTENT ADDRESS (TOOLS-10). READ-ONLY; resolves byte-identically over the MCP
   *  tool | poke | CLI (0 contract divergence, method-tags-tls:85). The CLI is unscoped.
   *
   *  [FLAG — `nodeAddr` = `NodeKey`] atlas-tools:131 names `atlas node <nodeAddr>`; the node identity leg
   *  is the `nodeKey` (mirrors retrieval `NodeTool.nodeId: NodeKey`). Transcribed as `NodeKey`. The return
   *  is the @atlas/knowledge `GroundedFact` (the node). */
  node(nodeAddr: NodeKey): GroundedFact

  /** The deterministic related-node set for a scope (atlas-tools:132, RETR-10). READ-ONLY; owned by
   *  @atlas/retrieval (`RelationSet`), imported, NOT redefined.
   *
   *  [PINNED — `scope` arg] pinned to `string` (cf retrieval `Path = string`), NOT a brand. */
  relate(scope: string): RelationSet

  /** The CURATED zero-assembly briefing for a scope-unit (atlas-tools:133, RETR-12). READ-ONLY; owned by
   *  @atlas/retrieval (`OwnPack` / `OwnUnit`), imported, NOT redefined. */
  own(unit: OwnUnit): OwnPack
}
