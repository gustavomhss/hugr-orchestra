# #99b — NEGATION fact: frozen build contract

**Status:** FROZEN (lead pre-work, 2026-08-10). Lands the **D3** leg of
[ADR-0015](../adr/ADR-0015-grounding-tokens-are-typed-by-fact-shape.md) (owner-ratified 2026-08-09). This is
the SECOND third of the [#99](../../README.md) product limit ("Atlas cannot ground a negative, a relation, or
a transition") and the ADR names it _"the honesty core"_ — the axis where the easy version ships a lie. The
[#99a RELATION contract](99a-relation-fact-contract.md) is the structural template (typed family, own identity
mint, own door traversal, reused oracle where sound).

> **AMENDMENT — F3 authz/identity split (owner-ratified 2026-08-11, WP-96-N).** The negation shape gains an
> ADDITIVE, OPTIONAL `authzScope?: string` (§1), and the door's authz gate (§4 gate 2.1) binds
> `authzScope ?? scope` instead of `scope`. **Identity is UNCHANGED** — `negationKey` stays
> `(relationKind, target, scope)` over the witness directory and NEVER reads `authzScope`; the honest-abstention
> law is UNCHANGED — it still reasons over the witness `scope`. The split exists because a MINED negation must
> carry its real witness directory as identity (the groundable scoped-negative) while being authorized by the
> orchestrator's `atlas:mined` grant — a miner holds no authority over an arbitrary source directory it proved
> closed. ABSENT `authzScope` ⇒ authz binds the witness `scope` EXACTLY as this doc first shipped (human
> `atlas emit` negations are byte-for-byte unchanged, the back-compat floor). This does not change any other
> ratified decision of #99b (the abstention law, the §3 scope Merkle, the read surface).

> **Search-before-freeze done (2026-08-10, branch `feat/negation-fact-99b` off master `d7e2029`).** No prior
> negation work exists — `git branch -a`, `git worktree list`, and a `negation|abstain|absent` grep across
> `packages/**/src` returned nothing but unrelated fail-closed sentinels. This is a genuine build, not a rebase.
> Every surface cited below was READ, not assumed.

> **Owner framing RATIFIED 2026-08-10 (the two product-honesty commitments):**
>
> 1. **SYMBOL-level, not file-level.** The owner REFUSED the file-level proxy ("no file depends on X's file")
>    the shipped doc→doc graph grounds today, and requires the real _"symbol f is never called"_. This adds a
>    PREREQUISITE (N0): a symbol-keyed reverse graph in `@atlas/index`.
> 2. **Abstention emits an EXPLICIT `ABSTAINED` record** ("checked, scope not closed — cannot decide"), NOT a
>    silent fail-closed refuse. It must be _testable that it FIRES_ (closes the #202 finding: 0/300 abstentions).

## 0. The crux this contract exists to resolve

A negation is `¬∃` over a relation ("no unit **calls** X"). Closed-world negation (Soufflé/Doop/DDlog) is sound
**only if the negated relation was computed COMPLETELY over the scope** — an under-approximated graph makes every
negative a lie. Atlas's shipped dependency graph IS an under-approximation (#189: cross-language/FFI targets are
`unresolved`, SCIP `local` symbols are document-scoped), so an **unscoped** negative has no witness and the door
**MUST refuse it**. The honest, groundable form is the **scoped positive**: _"within closed scope S under
edge-model E, no caller of X was found"_ — falsifiable, carrying its own completeness proof.

The completeness machinery **already exists and is measured, not theory** (grounded 2026-08-10):

- `reverseClosure(node): { closure, underApprox, coChanged }` (`index/src/depgraph.ts`) already computes
  **`underApprox = true iff any unresolved/dynamic edge is in scope`** — the exact abstention trigger. It is
  WIRED and reachable (`retrieval-model.ts:72`, `index-adapter.ts:134`, `wire.ts:139`), **but every caller reads
  `.closure` and DROPS `.underApprox`.** #99b is the FIRST consumer of the honesty flag.
- `EdgeKind = 'resolved' | 'unresolved' | 'dynamic'` (`index/src/types.ts`) — `dynamic` is the open-world
  (reflective/FFI) boundary; `unresolved` is the incompleteness hole; `underApprox` folds both.
- `IndexerPlan.version` (`adapter-io/src/scip.ts:26`) — the pinned extractor release = the edge-model version.

**The one genuinely new grounding mechanism** is the _scope Merkle root_ (§3): the shipped `subtreeHash` oracle is
per-unit and is **monotone-blind to a unit ENTERING the scope** — a new caller of X inserted as a brand-new unit
does not change any existing unit's hash. A negation's freshness MUST drift on insertion, so its token is a root
over the _set_ of in-scope units, not a per-unit hash. This is D3's "insertion-sensitivity a per-unit hash lacks",
made concrete — the analogue of what `relationKey` was for #99a.

## 0a. THE PREREQUISITE (N0) — symbol-level reverse graph. Why the shipped `reverseClosure` is not enough.

The shipped `dependencyAxis` keys endpoints by `docHash(path)` (`build.ts:170` `deriveEdges` → `dependencyAxis`),
so `reverseClosure` answers at FILE granularity: _"which files depend on file F"_. The owner ratified SYMBOL
granularity, so N0 builds a **symbol-keyed** reverse graph over the SAME SCIP occurrences `deriveEdges` already
reads. Grounded that the data suffices (2026-08-10): `deriveEdges` already builds `defs: Map<globalSymbol,
docHash>` from `role==='definition'` occurrences and walks `role==='reference'` occurrences — it merely PROJECTS
symbol identity onto `docHash`. N0 retains the symbol:

- `reverseCallers(symbol X): { callers, underApprox }` where `callers` = the set of units (unitKey / docHash) that
  carry a `reference` occurrence of the **global** symbol X, and `underApprox` = X's scope contains an
  `unresolved`/`dynamic` reference (honest incompleteness), mirroring `depgraph.ts` exactly one granularity down.
- **Groundable only for a GLOBAL symbol X** (a non-`local` SCIP symbol string — its identity is stable across
  documents). A `local` symbol is document-scoped by the SCIP grammar, so its callers are ALL in its own document
  (findable by intra-doc AST, a different closed procedure) — **out of #99b v1 scope, stated honestly.**

N0 is a producer inside `@atlas/index` (the `$0`-LLM, deterministic axis-build layer). It does NOT change
`deriveEdges` / the doc-level `dependencyAxis` (those stay — `query --by dependency` depends on them); it ADDS a
sibling symbol-reverse view. Reference-model-vs-shipped: N0 must be WIRED (a production caller in `adapter-io`),
not left as a reference model — the #99a lesson (relationsOf was dormant until R3 wired it).

## 1. The NegationNode shape (knowledge/src/types.ts)

`GroundedFact` becomes a FOUR-variant union (the discriminant stays `kind`). A negation is advisory-CLASS for
ratification (it carries no `check`).

```ts
export type GroundedFact = AdvisoryNode | PredicateNode | RelationNode | NegationNode

export interface NegationNode {
  readonly kind: "negation"
  readonly id: NodeKey // = negationKey (see §2); minted, never trusted from payload
  readonly tier: Tier
  readonly relationKind: RelationKind // the NEGATED relation (reuse #99a's closed 'depends-on'|'calls')
  readonly target: string // the location-free GLOBAL symbol key X the negative is ABOUT (¬∃ · →X)
  readonly scope: string // the CLOSED scope S (a DIRECTORY key) the witness ranges over (identity leg)
  readonly grounding: Grounding // ONE entry anchored at S; its subtreeHash IS the scope Merkle (see §3 — DECIDED)
  readonly edgeModel: string // the IndexerPlan.version at emit — the ONE witness clause the oracle can't see (§3)
  readonly freshness: KnowledgeFreshness
  readonly claims: readonly ClaimEntry[]
  readonly authoring: "NEGATED" | "SUPERSEDED"
  readonly obviousness?: ObviousnessScore // ADR-0012, additive, absent-tolerant
  readonly authzScope?: string // F3 (WP-96-N) — the scope the DOOR's authz gate binds instead of the
  // witness `scope`, when present. NEVER an identity leg (negationKey
  // reads the triple only) and NEVER read by the abstention law. Absent
  // ⇒ authz binds the witness `scope` (human negations UNCHANGED).
}

/** The explicit honest-abstention record (owner-ratified). NOT a GroundedFact — it asserts NOTHING about the
 *  world; it records that the door was ASKED a negative it could not soundly decide, and why. Durable + read-
 *  back so "abstention fired" is observable (closes #202). */
export interface AbstainedRecord {
  readonly kind: "abstained"
  readonly id: NodeKey // = negationKey(the refused question) — same address the negation WOULD take
  readonly relationKind: RelationKind
  readonly target: string
  readonly scope: string
  readonly reason: "scope-open" | "target-not-global" | "scope-empty" | "target-unresolvable" // WHY it could not decide (closed set)
  readonly witness: { readonly underApproxSources: readonly string[] } // the unresolved/dynamic edges that opened S
}
```

**Why `scope` is an identity leg (not only grounding):** `(¬calls, X)` is a different FACT in scope `src/payments`
than in scope `src/` — the negative is only as strong as the scope it was proven closed over. Identity therefore
binds the scope; two negations over the same (kind, X) at different scopes are distinct nodes.

## 2. Identity — `negationKey` (knowledge/src/write/negation-key.ts, additive)

A NEW pure function, sibling to `relationKey`, mirroring its discipline (sealed kernel seam, total-over-unknown,
named `MalformedNegationError`):

```ts
/** negationKey(kind, target, scope) = hash(canonicalForm({neg: kind, t: target, s: scope})). The `neg` tag makes
 *  the preimage SET disjoint from relationKey's ({a,k,b}) and nodeKey's ({a,s[,c]}) — no cross-family address
 *  collision (the #103 discipline). Directed by construction (a negation is not symmetric). TOTAL over unknown:
 *  a non-string/empty target or scope, or an off-vocabulary relationKind, yields the refusal, never a raw throw. */
export function negationKey(kind: RelationKind, target: string, scope: string): NodeKey
```

Refuses (`MalformedNegationError`, converted to a fail-closed verdict by the door) iff `target`/`scope` is not a
non-empty string, or `kind ∉ RELATION_KINDS`. An `AbstainedRecord` reuses the SAME `negationKey` address so a
later successful negation at the same question SUPERSEDES the abstention (the honest lifecycle: "couldn't decide"
→ later "decided false").

## 3. The completeness witness — the grounding (DECIDED with the oracle code open, 2026-08-10)

**THE KEY MEASUREMENT (grounded, not assumed): a DIRECTORY's `subtreeHash` IS already the insertion-sensitive
scope Merkle root.** `foldNodeHash`/`rollupHash` (index/src/rollup.ts:21-31) folds a node's own content PLUS its
**sorted, NAMED child hashes** (the git-tree model, `childName` binds the relative basename). So a directory node
re-hashes when: an in-scope file's bytes change (a child hash moves) OR a file ENTERS/LEAVES the directory (the
named-child set changes). ADR-0015's "a per-unit `subtreeHash` is monotone-blind to INSERTION" is true for a
per-FILE hash — but a per-DIRECTORY hash is a BRANCH over named children, so it is exactly the insertion-sensitive
root D3 wanted. This was only visible by reading the rollup preimage law, which is why the freeze deferred it.

**Consequence — the "genuinely new mechanism" collapses to near-free reuse.** Scope `S` is a DIRECTORY key.

- clause **3** (scope Merkle) `==` `resolveCurrent(S)` — the directory's own folded `subtreeHash`. `driftDetect`
  already computes this. It **SUBSUMES clause 1** (a NEW caller of X is a new `reference` occurrence, which requires
  either a new file in S → dir hash changes, or an edit to an in-S file → its hash changes → dir hash changes — so
  any new caller drifts the scope hash) **and clause-2-persistence** (a scope cannot OPEN post-emit without a byte
  change in S). So a stale scope hash means "re-verify the negative", the honest conservative trigger the ADR names.
- clause **4** (`edgeModel`) is the ONE thing `driftDetect(grounding, Axes)` cannot see — an extractor upgrade
  changes no file bytes. It rides as an explicit `NegationNode.edgeModel` field, compared by the door's re-check.
- clause **2** (`underApprox`) is decided ONCE at EMIT (the abstention gate, §4). Freshness never re-runs
  `reverseCallers` — anything that could introduce a caller or open S already drifts the scope hash.

**THE ENCODING (decided; the two verification facts below are now MEASURED, one CORRECTING this section's earlier premise, 2026-08-10):**

The two mechanical facts §3 said N1 must confirm were measured by the lead before dispatch — one HELD, one was FALSE and is corrected here:

- **(i) HELD — a directory resolves through `resolveCurrent`.** `hierarchy` (index/src/build.ts:110-122) folds
  EVERY FileTree node — directories included — into an `IndexNode` with `key = mintKey(node,parent)` (for a `::`-free
  dir, exactly its repo-relative path) and `subtreeHash = foldNodeHash({key, content: undefined, children})` — the
  git-tree Merkle over its NAMED children. `resolveCurrent(src, <dirPath>)` (grounding/src/drift.ts:60) walks
  `spatial`+`territory` by `node.key === qualifiedPath` and returns that folded hash. A directory's fold is a real
  hash, NOT the `subtreeHash===key` sentinel `findByKey` rejects (drift.ts:33), so it is NOT read as absent. Insertion
  of a new file into the dir changes the named-child set → dir hash → DRIFT. Confirmed, not assumed.
- **(ii) FALSE PREMISE, CORRECTED — a directory carries NO reusable `StructRef.kind`.** `StructRef.kind` (the SACRED
  `packages/contracts/src/struct.ts:14`) is `'symbol' | 'block' | 'file' | 'repo' | 'project'` — there is **no
  `directory` member**, and a spatial `IndexNode` carries a `level` string (SPATIAL_LEVELS), not a `StructRef.kind`.
  So "reuse the directory node's existing kind" was **not groundable** — the freeze wrote it optimistically. Since
  `honestidade-inegociável` forbids stamping a directory anchor `kind: 'file'` (a lie in a committed type) and the
  oracle never reads `.kind` (driftDetect/isGrounded ignore it — measured), the honest fix is **DECIDED: WIDEN the
  enum with `'directory'`.** This is a SACRED @atlas/contracts change (a `cv`-class vocabulary addition, exactly like
  a new `RelationKind`/`PredicateSlot`), owner-ratify + **bobby** owed before the #99b PR merges (§7 already schedules
  the sacred review) — NOT slipped in silently. Blast radius MEASURED bounded (3 touches; nothing else): the enum
  itself; `harness/probes/genesis-output-probe.mjs:44` `ANCHOR_KINDS` Set (add `'directory'` or it rejects the anchor);
  and the honest struct.ts comment. `grounding/src/ground.ts:35` `Citation.kind: StructRef['kind']` auto-follows. The
  sole production reader of an anchor `.kind` is `router.ts:300` `=== 'symbol'` for intrinsic identity — a negation
  routes by `negationKey`, never `primaryAnchorId`, so it is unaffected.

**The encoding, therefore:**

- The negation's `grounding` = **ONE ordinary `GroundingEntry`** anchored at the scope directory: `anchor =
{ kind: 'directory', qualifiedPath: S, subtreeHash: <S's folded hash at emit> }`. `isGrounded` passes (non-empty
  subtreeHash); `driftDetect(grounding, axes)` rides **verbatim** — NO change to the sealed
  `grounding/src/{ground,drift}.ts`, NO new oracle logic. The only sacred touch is the one honest enum member above.
- The door's negation freshness (N2) = `driftDetect(node.grounding, axes) === FRESH && node.edgeModel ===
currentEdgeModel`. A tiny door-side conjunct, not an oracle rewrite.

## 4. Family, routing, door traversal (knowledge/write + adapter-io/governed-emit)

- `NodeFamily` widens to include `'negation'`; `routeWrite` for family `'negation'` mirrors advisory
  (contentHashHit ⇒ DEDUP, negationKey miss ⇒ CREATE, hit ⇒ UPDATE; never SUPERSEDE by routing — an
  `AbstainedRecord`→negation transition is an explicit supersede on the shared address).
- The negation enters the SAME governed door with the re-routes:
  - **gate 0.1 WELL-FORMED**: `target`/`scope` non-empty, `relationKind ∈ RELATION_KINDS`, and **`target` is a
    GLOBAL symbol** (not `local`) — else the door emits an `AbstainedRecord{reason:'target-not-global'}`.
  - **gate 1 TRUTH DOOR — the abstention gate (the honesty core).** Compute `reverseCallers(target)` over the
    scope. If `underApprox` (scope open) ⇒ **do NOT admit the negation; emit `AbstainedRecord{reason:'scope-open',
witness}`** (durable, exit-legible, NOT a silent refusal). If **`target` does not RESOLVE** — a global symbol
    with no in-index definition, a phantom (`resolves(target)==false`, #220) ⇒ **do NOT admit; emit
    `AbstainedRecord{reason:'target-unresolvable'}`**, because `reverseCallers` is `[]` for a phantom BY
    CONSTRUCTION, so "not called in S" would be VACUOUSLY true — a negative about a symbol Atlas cannot see.
    If a caller exists in S ⇒ the negative is FALSE ⇒ reject (the claim is refuted, not abstained). Only
    `callers∩S==∅ ∧ !underApprox ∧ resolves(target)` admits the negation with the §3 witness as its grounding.
  - **gate 2.1 ANCHOR/AUTHZ**: the ANCHOR binds on the negation's witness `scope` (the assertion is ABOUT that
    scope) and `primaryAnchorId` is NOT called. The AUTHZ gate binds **`authzScope ?? scope`** (F3, WP-96-N):
    absent ⇒ the witness `scope` exactly as first shipped (human negations unchanged); present ⇒ the separate
    `authzScope` (a MINED negation binds `atlas:mined` while keeping its witness directory as identity).
  - the remaining gates (2.25 incumbent keyed on `negationKey`, 2.5 ratify as advisory-class, 3 upsert+put) apply
    verbatim.

## 5. Read surface (cli + mcp) + the abstention read

Mirror #99a's separate-command surface (owner-ratified divergence there; be CONSISTENT):

- `relationsOf`-style fold `negationsOf(projection, scope?)` and `abstentionsOf(projection, scope?)` (derive-on-read
  over `family:'negation'` / `kind:'abstained'` rows).
- CLI: `atlas negations <scope>` (grounded negatives) and the abstention MUST be visible — either a column/flag or
  `atlas negations <scope> --abstained`. MCP: an `atlas-negations` read tool, served through the shared verdict
  builder (CLI≡MCP bytes), OUTSIDE `GOVERNANCE_SURFACE`.
- **Honest-close inheritance:** the #99a §5 read-surface contract-divergence amendment is still owed on the
  99a doc; do the SAME shape here deliberately and record it, do not silently diverge.

## 6. WP decomposition (the wave)

DAG: **N0 (index prereq) → N1 (knowledge core) → { N2 door, N3 read } → N4 e2e.** N0 is a hard predecessor (nothing
grounds without the symbol-reverse graph); N1 freezes the shape+witness encoding; N2/N3 disjoint by owner-file.

| WP     | owner-files (disjoint)                                                                                                                                                          | dep   | DoD                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **N0** | index/src (new `symbol-reverse.ts` + `index.ts`), adapter-io wiring (`wire.ts`/`index-adapter.ts`), tests                                                                       | —     | `reverseCallers(globalSymbol): {callers, underApprox}` over the SAME occurrences `deriveEdges` reads; doc-level `dependencyAxis` UNCHANGED; WIRED (production caller in adapter-io, not a reference model); unit tests incl. an inserted-caller and an `underApprox` (unresolved/dynamic) case                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **N1** | contracts/src/struct.ts (SACRED — the `'directory'` enum member, §3(ii)) + genesis-output-probe.mjs ANCHOR_KINDS; knowledge/src/types.ts, negation-key.ts, router.ts, upsert.ts | N0    | `StructRef.kind` widened with `'directory'` (§3(ii) DECIDED) + probe Set + honest comment; `NegationNode`+`AbstainedRecord` in the model; `negationKey`+`MalformedNegationError`; `NodeFamily` widened; witness grounding = one `kind:'directory'` entry (§3); every exhaustive `.kind`/family switch handles 'negation'+'abstained'; the two `fact.kind === 'relation' ? undefined : predicateSlot` sites (governed-emit.ts:240, own-bands.ts:52, own-source.ts:264, cli/mine.ts:263) also treat 'negation' as slotless; `driftDetect` 4-clause freshness; unit tests incl. insertion-drift + scope-open-abstain                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **N2** | adapter-io/src/governed-emit\*.ts (+reasons), the abstention gate                                                                                                               | N1    | the door computes `reverseCallers`, ABSTAINS (emits `AbstainedRecord`) on `underApprox`, REJECTS on a real caller, ADMITS only the closed-empty case; scope authz on `scope`; the crux tested (a scope-open question ABSTAINS, not silently drops); mutation-scoped per re-routed gate                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **N3** | index/knowledge read folds, cli/src, mcp-server/src                                                                                                                             | N1    | `negationsOf`/`abstentionsOf`; `atlas negations` CLI + `atlas-negations` MCP; abstention VISIBLE on both; total (miss⇒empty); CLI≡MCP parity                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **N4** | e2e-blackbox (new sNN); reconcile/doctor negation-freshness wiring                                                                                                              | N0-N3 | subprocess story: emit `(f, ¬calls, S)` grounded (f global, S closed) → `atlas negations S` finds it → INSERT a caller of f → the negation reads DRIFTED → a `¬calls` over an OPEN scope (unresolved/dynamic in S) EMITS AN ABSTAINED record, readable (proves abstention FIRES — closes #202). **MANDATORY (billy F1, deferred from N2): WIRE the §3 clause-4 `edgeModel` conjunct into the negation freshness recompute** — a negation's read/reconcile freshness = `driftDetect(grounding) FRESH ∧ edgeModel === currentEdgeModel`; today `edgeModel` is stamped at emit but read NOWHERE (`currentEdgeModel` does not exist), so a negation admitted under edge-model E1 is never re-flagged when an extractor upgrade newly resolves a caller of X with no byte change in S. N4 must wire the conjunct, surface `freshness` on `GroundedNegation`, and PROVE it with a killing e2e (bump the pinned extractor version → the negation reads DRIFTED). Until N4 lands this, a negation is sound only under a FIXED edge model (the N2 in-code comments state this honestly). Also probe billy F2's two assumed completeness bounds (a hole whose docHash has no spatial path; a caller in an unindexed language). |

## 7. Blast-radius / ratification (GAP-2 rite)

- **ADR-0015 D3 is owner-ratified (2026-08-09);** the two mechanization commitments (symbol-level, explicit
  ABSTAINED) are owner-ratified (2026-08-10, this document's header). No NEW invariant amendment beyond the ADR.
- **ONE sacred-vocabulary addition — OWNER-RATIFIED 2026-08-10:** `StructRef.kind += 'directory'`. The
  freeze's "no enum widening" premise was measured FALSE (a directory carries no reusable kind); the honest carrier
  for a scope-directory anchor is an explicit `'directory'` member. It is a mechanical consequence of the ratified
  directory-scoped negation, not a new product decision, but it touches the most sacred layer — so it rode the
  **bobby** sacred review and was flagged for owner ratification, never shipped silently. Blast radius re-measured
  at ratification: the SOLE production reader of an anchor's `StructRef.kind` is `router.ts:305`
  (`anchorOf(e)?.kind === 'symbol'`), where a `'directory'` anchor is correctly excluded from `symbolAnchors`; no
  exhaustive `never`-switch ranges over `StructRef.kind` (the one in `evaluator.ts:99` ranges over the fact-family
  union); `tsc -b` EXIT 0 confirms no exhaustiveness broke. The owner ratified the vocabulary addition on this
  measured basis (PR #129). This is the contract's own framing-error correction, recorded per the discipline that
  every freeze owes.
- The `GroundedFact` union widening to a FOURTH variant ripples to every exhaustive `.kind` switch repo-wide — an
  R1-style audit (`grep '.kind ==='`, `case '…'`, `never` checks) is a NAMED N1 deliverable, exactly as #99a's
  blast-radius sweep found the render/doctor/genesis sites (all handled or Proposal-typed there; re-audit for the
  new variants).
- N0 touches the SACRED `@atlas/index` axis-build layer — **billy** (T0, it changes what edges the completeness
  oracle sees) AND **bobby** (T0-adjacent, it adds a sibling axis view — architectural) cold-review N0 before N1
  builds on it. **lucy** cold-reviews each WP; **billy** the door (N2, authz/identity/abstention-soundness).
  One-fix-round. Gates (layer/godfile≤400/spec-conformance/reference-model/id-integrity) on every WP.
- The honesty axis is where "honestidade inegociável" is load-bearing: an abstention that never fires, or a
  negation admitted over an open scope, is the exact failure this contract exists to forbid. N4's abstain-fires
  witness and N2's mutation on the `underApprox` branch are the teeth that prove it.
