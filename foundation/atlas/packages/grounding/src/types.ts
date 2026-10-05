// @atlas/grounding — src/types.ts  (frozen data model + co-located API interfaces; zero runtime)
//
// Layer 3 trust primitive: the content-addressed grounding receipt (`Grounding`/`GroundingEntry`) plus
// the frozen API interfaces shared by ≥2 impl files or held as public surface (GroundApi/DriftApi/
// GateApi/AnchorApi + the InterfaceRState seam). `StructRef`/`Freshness`/`Status` are the canonical
// layer-0 vocabulary owned by @atlas/contracts — imported, NEVER redefined here.

import type { StructRef, Freshness, Status, Hash } from "@atlas/contracts"
import type { Axes, Rollup } from "@atlas/index"

/**
 * The content-addressed grounding receipt. Transcribed EXACTLY from atlas-grounding:38:
 *   `Grounding = { entries: GroundingEntry[] }`  — sorted by anchor.
 * A `Grounding` is real iff it has ≥1 entry and every entry carries a non-empty `subtreeHash`
 * (GROUND-2); an ungrounded grounding MUST NOT ever be FRESH.
 */
export interface Grounding {
  readonly entries: readonly GroundingEntry[]
}

/**
 * One anchor in a grounding receipt. Transcribed EXACTLY from atlas-grounding:39-43, plus the
 * owner-ratified 2026-08-02 SPAN amendment (`span?`):
 *   - `anchor`       — THE DRIFT ORACLE: a `StructRef` whose `subtreeHash` is the hash of the
 *     normalized structural unit (GROUND-1). Owned by @atlas/contracts.
 *   - `path`         — repo-relative, for humans/navigation.
 *   - `displayLines?`— OPTIONAL nav hint ("42-50") — NEVER the drift oracle (GROUND-1). Under
 *     `exactOptionalPropertyTypes` the field is genuinely absent-or-string, never `undefined`.
 *   - `span?`        — OPTIONAL: WHERE INSIDE the anchored unit the claim was derived from, addressed
 *     into content-addressed bytes (`GroundingSpan`). ADDITIVE to the anchor, never a replacement for
 *     it: GROUND-2 still requires `anchor.subtreeHash` on every entry, span or no span. ABSENT ⇒ the
 *     location inside the unit is UNKNOWN — never "the whole unit", which would be a fabricated
 *     default asserting a citation nobody made (the `builtAt`/`sameAs`/`derivedAt` precedent).
 */
export interface GroundingEntry {
  readonly anchor: StructRef
  readonly path: string
  readonly displayLines?: string
  readonly span?: GroundingSpan
}

/**
 * WHERE, inside the cited bytes, the evidence is — a RANGE ADDRESSED INTO CONTENT-ADDRESSED BYTES, and
 * deliberately NOT a copy of the text. (Owner-approved amendment, 2026-08-02.)
 *
 * WHY A SPAN AND NOT A QUOTE. A stored quote is a second, unversioned copy of the source: it drifts
 * silently the moment the file changes, and it is UNFALSIFIABLE — nothing can check that those characters
 * were ever really there. This shape stores no text at all. It stores the digest of the byte sequence the
 * offsets index into, so a reader RE-DERIVES the cited text: fetch the anchor's bytes, verify they hash to
 * `contentHash`, slice `[start, end)`. If the content moved, the hash no longer matches and the read
 * REFUSES (`readSpan`, span.ts) — while the fact's freshness verdict is decided, exactly as before, by the
 * existing drift machinery over `anchor.subtreeHash`.
 *
 *   - `contentHash` — the digest of the WHOLE byte sequence the offsets index into (@atlas/contracts
 *     `Hash`, the CAS/dedup leg — reused, never a parallel type). Offsets without the identity of what
 *     they index are meaningless, which is why the addressed content travels WITH the range.
 *   - `start`/`end` — BYTE offsets into that sequence, `start` inclusive, `end` exclusive, both
 *     non-negative integers with `start < end <= length` (an empty span cites nothing and is refused at
 *     mint). Bytes, not characters: the digest is over bytes, so a character index would address a
 *     different thing than the hash commits to.
 *
 * ⚠ THE OFFSET UNIT IS BYTES, AND THE REPO'S OTHER OFFSET SUPPLY IS NOT. MEASURED (task #159, 2026-08-03),
 * because a producer that gets this wrong cites the wrong bytes silently and the digest cannot catch it:
 *   · `web-tree-sitter` 0.23.x reports `node.startIndex`/`endIndex` in **UTF-16 code units**, not bytes.
 *   · `adapter-io/src/ast.ts` `src.slice(node.startIndex, node.endIndex)` is therefore CORRECT as written —
 *     `String.prototype.slice` counts the same UTF-16 units tree-sitter counts. That line is not a defect.
 *   · The divergence is between tree-sitter and THIS TYPE. Measured on a fixture whose anchored unit sits
 *     after a `café ☕`/`🚀` prefix: the unit begins at UTF-16 offset 64 and at BYTE offset 71. Handing
 *     tree-sitter's 64 straight to `mintSpan` yields a span whose read returns `unch";\nexport function …` —
 *     off by 7 at both ends, and NOT refused, because `mintSpan`'s `splitsCodePoint` guard only rejects a
 *     boundary that lands mid-code-point and 64 happens to be a valid one.
 * SO: any producer supplying INTERIOR offsets (symbol-granular sites, #182) MUST convert UTF-16 → UTF-8
 * byte offsets before minting. There is no such producer today — the only mint is whole-range (`0..length`),
 * whose endpoints are unit-agnostic — which is exactly why the hazard is written here and not discovered later.
 *
 * WHAT `contentHash` COMMITS TO, also measured: the shipped chain is `readFileSync(fd,'utf8')` → JS string →
 * `TextEncoder().encode(…)`, so the digest is over the UTF-8 RE-ENCODING of the decoded text, NOT over the
 * file's bytes as stored. For well-formed UTF-8 (including astral characters and NFD-decomposed text, both
 * measured) the round-trip is lossless and the two agree byte-for-byte. For MALFORMED UTF-8 they do not — a
 * lone `0xFF` decodes to U+FFFD and re-encodes 2 bytes longer — so a reader presenting the raw file bytes
 * gets `undefined`. That is fail-closed and correct in direction, but it means a reader must present the
 * same decode-then-encode bytes the minter did. `TextEncoder` does NOT Unicode-normalize, so the KERNEL-1
 * NFC rule (and the #106 non-injectivity it buys) does not reach this digest.
 *
 * PER-`StructRef.kind` SEMANTICS — all six, no gaps (task #159; `directory` added by #99b / ADR-0015 D3):
 *   · `symbol` — a real sub-range of the file's bytes: the symbol's own extent. REQUIRED once symbol-granular
 *     sites exist (#182); the byte conversion above is a PRE-REQUISITE for it.
 *   · `block`  — as `symbol`: the block's extent, a real sub-range.
 *   · `file`   — **ABSENT.** The unit IS the file, so a `0..len` span carries no information the anchor does
 *     not already carry, and storing one invites a reader to treat "the whole file" as a located citation.
 *     Nothing may emit `0..0`, and nothing may emit a sentinel; a producer that cannot locate omits the field.
 *   · `directory` — **ABSENT**, on the `file` rule: the unit IS the directory (a spatial container node), and
 *     it has no byte-range of its own — its `subtreeHash` folds its NAMED children, not a contiguous slice. A
 *     directory-scoped negation grounds against that folded hash (#99b), never a span.
 *   · `repo` / `project` — REQUIRED where the anchor is what GROUND-12 says it is: a policy artifact's
 *     heading/section BLOCK, which is a genuine sub-range of that artifact's bytes. A `repo` anchor that
 *     resolved to a whole file follows the `file` rule instead — absent.
 *
 * NOT THE DRIFT ORACLE, on the same terms as `displayLines` (GROUND-1). Nothing in `isGrounded` or
 * `driftDetect` reads this field, and their verdicts are invariant under adding, removing or corrupting
 * it. A span is a POINTER INTO evidence; the oracle stays `anchor.subtreeHash`.
 */
export interface GroundingSpan {
  readonly contentHash: Hash
  readonly start: number
  readonly end: number
}

// ── frozen API surface, co-located here (was ref/ground.ts · ref/drift.ts · ref/gate.ts · ref/anchor.ts) ─
// These interfaces carry zero runtime; they live with the shared data model because GroundApi / DriftApi /
// GateApi are each consumed by ≥2 src files (gate.ts / drift.ts / freshness.ts / emit-guard.ts), and
// AnchorApi is public surface with no impl in any src file.

/**
 * The structural anchor resolver — block-vs-file granularity (GROUND-1, GROUND-12). Resolves a
 * grounding entry to its `StructRef`, whose `subtreeHash` is the sole drift oracle; `displayLines`
 * and line-ranges NEVER participate. For a parseable policy artifact a repo/project rule keys on the
 * heading/section BLOCK `subtreeHash` (a block-level CAS node), reserving the whole-file byte-hash for
 * genuinely non-parseable files (GROUND-12). (atlas-grounding:44, 105-115; method-tags-grd:26-28, 100-105)
 */
export interface AnchorApi {
  /** Resolve a grounding entry to its structural anchor. The drift oracle is `anchor.subtreeHash`
   *  alone — `displayLines`/line-ranges are ignored, a line-range-only ref is rejected as invalid
   *  (GROUND-1). Block-vs-file granularity for policy artifacts (GROUND-12). (atlas-grounding:44)
   *
   *  [FLAG — reference tension, return type] The task inventory pins `resolveAnchor(entry): StructRef`
   *  (transcribed here). The method-tags-grd:27 DOWN reference-model instead names
   *  `resolveAnchor(entry)=entry.anchor.subtreeHash` (a bare `SubtreeHash`). Transcribed to the task's
   *  `StructRef` return (the richer surface — the `subtreeHash` is reachable as `.subtreeHash`); flagged
   *  for the two sources to reconcile whether the resolver returns the `StructRef` or just its oracle. */
  resolveAnchor(entry: GroundingEntry): StructRef
}

/**
 * The anchor builder + the real-grounding predicate. `ground(node, src)` re-derives the anchor@src,
 * dropping unresolvable entries (fail-closed, never throws — GROUND-3). `isGrounded(g)` is the
 * real-grounding predicate: ≥1 entry AND every entry carries a non-empty `subtreeHash` (GROUND-2); an
 * ungrounded grounding is NEVER FRESH. Both pure + total. (atlas-grounding:128, 130, 79-82;
 * method-tags-grd:30-42)
 */
export interface GroundApi {
  /** Re-derive the grounding anchor for `node` against source-of-truth `src`; an unresolvable citation
   *  (unit gone, path absent) is DROPPED, never throws — fail-closed (GROUND-3). Pure + total.
   *  (atlas-grounding:128)
   *
   *  [PIN — `src` = built-index `Axes`] Owner DEFINE 2026-07-18 (oracle-pin-map §5). `src` is the
   *  built-index snapshot the anchor is re-derived against, consistent with `driftDetect`.
   *  [SIG-TBD — `node`] the reference (atlas-grounding:128) gives `node` no concrete shape; §5 pinned
   *  ONLY `src`, so `node` stays opaque here — the groundable-unit type is the owning WP's to pin from
   *  its reference, NOT guessed (do not import the upward `GroundedFact` — that inverts the DAG). */
  ground(node: unknown, src: Axes): Grounding

  /** Real-grounding predicate: `true` iff `g` has ≥1 entry AND every entry's `anchor.subtreeHash` is
   *  non-empty (GROUND-2). An empty/partial grounding fails the predicate and MUST never surface FRESH.
   *  Pure + total. (atlas-grounding:130) */
  isGrounded(g: Grounding): boolean
}

/**
 * The GROUND-11 interface-fold seam — the dependency-axis `rState` grounding consumes from the lower
 * index layer (INDEX-12). A reference to the index `Rollup`'s STATE root (`rState` = BLAKE3 over
 * hash‖status‖freshness), NOT a redefinition. GROUND-11 folds the forward-closure's INTERFACE-level
 * `rState` — the type/contract-relevant structure — so a callee whose SIGNATURE changed drifts its
 * callers while a pure-body refactor does not. Owned by @atlas/index (`Rollup.rState`, atlas-index:43).
 */
export type InterfaceRState = Rollup["rState"]

/**
 * Drift detection: the interface-fold freshness oracle (GROUND-11) + the advisory→STALE router
 * (GROUND-13). `driftDetect(grounding, src)` is FRESH iff every anchor's `subtreeHash` matches AND the
 * forward-closure's INTERFACE/signature-level `rState` is unchanged — folding the callee's INTERFACE
 * on the dependency axis (INDEX-12), NOT its full body: a signature/contract change DRIFTS every
 * caller, a pure behavior-preserving body refactor drifts none. An ADVISORY fact's drift resolves to
 * `STALE` (non-blocking, served-with-flag), never `DRIFTED` and never either arm of the KNOW-5 split.
 * Pure + total; freshness is a STRUCTURAL predicate, NEVER a truth claim (FRESH ≠ true).
 * (atlas-grounding:97-104, 116-123, 129; method-tags-grd:93-98, 107-112)
 */
export interface DriftApi {
  /** Freshness verdict for a grounding against source-of-truth `src`. FRESH iff every anchor's
   *  `subtreeHash` matches AND the forward-closure INTERFACE `rState` is unchanged (GROUND-11); an
   *  ungrounded/unresolvable grounding is DRIFTED (GROUND-2/3); an ADVISORY fact's drift resolves to
   *  `STALE`, not `DRIFTED` (GROUND-13). Never asserts the claim is true. Pure + total.
   *  (atlas-grounding:129)
   *
   *  [PIN — `src` = built-index snapshot `Axes`] Owner DEFINE 2026-07-18 (oracle-pin-map §5): `src` is
   *  the BUILT-index snapshot drift re-checks against — the carrier of the forward-closure interface-
   *  `rState` GROUND-11 folds (see `InterfaceRState`), which rides on the index nodes — NOT the raw
   *  `FileTree`. Pinned to `@atlas/index` `Axes` (the rolled-up axis-views bearing `rState` per node).
   *
   *  [FLAG — GROUND-13 advisory router, upward-owned discriminant] The advisory→`STALE` vs
   *  predicate→(KNOW-5 split) routing keys on the fact's `kind` ('advisory' | 'predicate'), a
   *  discriminant carried by the knowledge-layer `Fact` — an UPWARD-owned type this layer-3 module MUST
   *  NOT import (would invert the DAG). `driftDetect` returns the raw structural `Freshness`; where the
   *  advisory/predicate split is applied over a `Fact.kind` is left to the knowledge layer (KNOW-5).
   *  Flagged — not modeled here as an arg, to avoid inverting the DAG. */
  driftDetect(grounding: Grounding, src: Axes): Freshness
}

/**
 * The truth-gate (GROUND-4, spec A-1). `gateHolds` serves `HOLDS` iff (grounded ∧ FRESH), else `NA`;
 * it is DOWNGRADE-ONLY — it passes every non-`HOLDS` verdict through unchanged and only ever downgrades
 * `HOLDS`→`NA`, never upgrades, and is idempotent. An `untrusted`-source claim is advisory and EXCLUDED
 * from the gate's inputs (GROUND-8, spec A-9) — it can never contribute a `HOLDS`. Pure + total: no
 * clock, no IO, no global state, no throw. (atlas-grounding:131, 136, 83-93; method-tags-grd:44-49, 72-77)
 */
export interface GateApi {
  /** Truth-gate a candidate verdict: `HOLDS` only if its `grounding` is grounded ∧ drift-FRESH against
   *  `src`, else downgraded to `NA` (GROUND-4). Downgrade-only + idempotent: a non-`HOLDS` verdict
   *  passes through unchanged. An `untrusted`-source candidate is excluded (GROUND-8). (atlas-grounding:131)
   *
   *  [FLAG — `candidate` arg, upward-owned] The reference names `gateHolds(candidate, grounding, src)`.
   *  The `candidate` carries the incoming `Status` verdict AND the `source` provenance the GROUND-8
   *  filter keys on ('untrusted' → excluded) — both fields of the knowledge-layer `Candidate`/`Fact`,
   *  an UPWARD-owned type this layer-3 module MUST NOT import (would invert the DAG). Transcribed as
   *  `unknown` rather than invented; flagged for the knowledge layer to supply the concrete shape.
   *
   *  [PIN — `src` = built-index `Axes`] Owner DEFINE 2026-07-18 (oracle-pin-map §5): the source-of-truth
   *  snapshot drift is re-checked against is the built-index `@atlas/index` `Axes`, consistent with
   *  `driftDetect`/`ground`. (`candidate` stays `unknown` — upward-owned, see FLAG above.) */
  gateHolds(candidate: unknown, grounding: Grounding, src: Axes): Status
}
