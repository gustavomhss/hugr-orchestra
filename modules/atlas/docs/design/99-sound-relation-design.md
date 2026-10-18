# #99 — Sound Relation (proven `depends-on`) — design

Status: **RATIFIED** (owner, 2026-08-22). Forks F1–F3 ratified as recommended: F1 = **(M) mechanical
projection**, F2 = **exhaustive over resolved intra-repo edges**, F3 = **defer `calls`/semantic**
(ship `depends-on`-proven only). Proposes an amendment to ADR-0015 D2 (relation family) — a new ADR
(ADR-0021) carrying these decisions.

Bench-prerequisite: the owner ruled relation is _primordial_ — the #95 benchmark should measure a
product that can ground a relation. This doc plans that capability, patiently and soundly (no
gambiarra). Every "is" below is grounded in code (file:line); every "should" is a proposal.

---

## 1. Why this exists

`#99` (task ledger): _"Atlas cannot ground a negative, a relation, or a transition — 5 seats hit
the same wall."_ The negation leg landed (#99b/#231/#232). This is the **relation** leg.

Epistemic contract (ratified, `proven-vs-justified`): a fact may be **proven** (a re-runnable typed
witness) or **justified** (grounded + a contestable derivation), else abstain. `proven` never
becomes `justified` and vice-versa. This design puts relation on the **proven** side wherever the
index can prove it, and is honest about where it cannot.

---

## 2. Ground truth (measured from the code, 4-seam investigation + direct verification)

### 2.1 The relation family today is advisory-class, end to end

- **Identity** `packages/knowledge/src/write/relation-key.ts:65` — `relationKey(a, kind, b)` is
  **directed** (endpoints not sorted; `(A,depends-on,B) ≠ (B,depends-on,A)`), refuses self-relation,
  closed vocabulary `RELATION_KINDS = ['depends-on','calls']` (`relation-key.ts:21`).
- **Node** `packages/knowledge/src/types.ts:109` — `RelationNode` carries `seal?: Seal`
  (`types.ts:122`) but **no `witness` and no `derivation` carrier** (those live only on
  `AdvisoryNode`, `types.ts:245/251`). A relation has **no `predicateSlot`**.
- **Truth** `packages/genesis/src/admit-relation.ts:10-11` (header, verbatim): _"NO NEW TRUTH RULE
  lives here: the relation reuses `deps.doors.grounded` (the advisory truth door)."_ → relation is
  **grounded, never proven**.
- **Write door drops the seal** `packages/adapter-io/src/governed-emit.ts:369` — the seal carrier is
  guarded `node.kind !== 'relation'`, so even a hand-set relation seal never reaches the durable row.
- **Read fold drops seal/witness** `packages/knowledge/src/read/relations.ts:22` — `RelationEdge`
  carries only `{nodeKey, relationKind, endpointA, endpointB}`.
- **Reverify cannot re-prove a relation** `packages/adapter-io/src/reverify-store.ts:213` — `w` is
  read only from `fact.kind === 'advisory'`; `WITNESSED_SLOTS` (`:106`) is slot-keyed and relations
  have no slot; a `proven`-sealed relation lands in `unverifiable`. **This is the live #240 trap for
  the relation family.**
- **Surface prints no relation seal** `packages/cli/src/render.ts:96` (relations) / `:160` (the
  seal/witness render is gated to `advisory|predicate`).
- **Unreachable in shipped mine**: no `makeRelationClaimParser`, no `propose-relation.md`, `MineSlot`
  (`packages/cli/src/mine-proposer.ts:106`) has no `'relation'`. Relations reach the store today only
  via `atlas emit`/`atlas link` or the **test injector** `e2e-blackbox/test/author.ts:294`.

### 2.2 The proven-slot template (the machine to reuse), predicate-family only

Seal `'proven'` is minted in **exactly one place** — `buildSound` at
`packages/genesis/src/admit-harness.ts:448` — and only as an `AdvisoryNode`, reached only after a
sound-oracle `proven` verdict. The oracle (`packages/genesis/src/verify-fact.ts`) proves
`dependency`/`count`/`definition`; `FactVerdict` is **`proven | abstain`, never `refuted`**
(`verify-fact.ts:60`) — a witnessed _existence_ is sound under an incomplete index; an absence is
abstained, never refuted. Read-back re-proves via `reverify-store.ts` (`WITNESSED_SLOTS` + `reqOf` +
the same `VerifyFactLeg`).

### 2.3 The load-bearing constraint (verified directly, not second-hand)

`packages/index/src/types.ts:139` — `ScipSymbolRole = 'definition' | 'reference'`. **There is no
call-role in the frozen occurrence projection.** Therefore:

> **`calls` cannot be proven distinct from `depends-on` from this index.** A "reference" edge
> (import / type position / use) is all SCIP gives us. `calls` (A's body invokes B) would need
> call-role occurrence data that `ScipOccurrence` does not carry.

### 2.4 The sound edge already exists, mechanically

`packages/index/src/build.ts:212` `deriveEdges` produces `DepEdge{from, to, kind}` between
**docHashes** (`types.ts:96`), with the **#189 soundness fix** on both loops:
`isLocalSymbol(symbol) = symbol.startsWith('local ')` (`build.ts:154`) excludes document-scoped
symbols from the global join (the 71%-fabrication mechanism), and `canonicalizeSymbol`
(`build.ts:157`) is **canon-and-verify** (a rewrite is taken only if `defs.has` resolves it — a bad
rewrite loses a recoverable edge, never fabricates one). A `kind:'resolved'` `DepEdge` **is** a
witnessed cross-unit reference — sound in any world. `verify-fact.ts:85` `verifyDependency` proves
the same thing symbol-granularly (`reverseCallers(B) ∩ sourceScope ≠ ∅`).

Residual known unsoundness (documented, does not arise here): a bundler that flattens several
sources into one `.d.ts` could defeat `canonicalizeSymbol`'s verify (`build.ts:190`). Atlas builds
per-file `tsc --declaration`, so it is safe; the design must not silently depend on that beyond the
repo.

---

## 3. Design

### 3.1 What we build: a **proven `depends-on` relation**, derived mechanically

A `depends-on` relation `A → B` (both **unit** endpoints) is admitted **`proven`** iff the index
witnesses a resolved reference from a source under A to a definition of a symbol under B — i.e. it is
a `resolved` `DepEdge`, re-derivable on demand. No model proposes it; the **derivation is the
proof**, and the proof is re-runnable (the reverify path re-derives the edge from the current index,
which is exactly the A2 staleness story).

This is the sound-arm thesis at its limit: verifier = generator = the deterministic index. It is
0-false **by construction**, model-independent, and honest about its boundary (§3.3).

### 3.2 The proven-relation family machinery (built once, reused by any future relation producer)

Six seams from §2.1 must gain a proven path (each is a WP candidate):

1. **Witness carrier on `RelationNode`** (`types.ts`): a relation-shaped witness encoding the triple
   `(endpointA, relationKind, endpointB)` + the oracle leg — there is no slot to reuse.
2. **A relation sound-admit + oracle** (`admit-relation.ts` / `verify-fact.ts`): a `verifyRelation`
   that reuses `verifyDependency`'s witnessed-existence logic on the directed pair, returning
   `proven | abstain` (never refute); a `buildSound`-analog that mints `seal:'proven'` on the
   relation node.
3. **Lift the door's `!== 'relation'` seal-carrier guard** (`governed-emit.ts:369`) + add a relation
   witness carrier.
4. **Read-side reverify for relations** (`reverify-store.ts`): a `fact.kind === 'relation'` branch, a
   relation `VerifyReq`/`reqOf`, the directed-edge oracle leg, and relation-shaped tamper bindings
   (**both** endpoint files must exist in the index; claim = the triple string; anchor = endpointA).
   This closes the #240 trap for the relation family — not skips it.
5. **Carry seal/witness through the read fold** (`relations.ts` `RelationEdge`).
6. **Surface the seal** (`render.ts`: `atlas relations` + `atlas node`).

### 3.3 The honest boundary (documented non-behavior, not a silent gap)

- **`calls` is NOT provable** from the frozen projection (§2.3). The proven path ships **`depends-on`
  only**. `calls` either stays unemitted or is emitted **advisory/justified** by a later LLM arm —
  never `proven`. This must be stated in the ADR + the honesty ledger, and a test must pin that a
  `calls` relation cannot obtain a `proven` seal.
- **No refute**: an absent edge is abstained, never a "these do not depend" fact. (Negation is the
  separate #99b family for closeable-world absence.)
- **Dynamic dispatch / reflection / cross-language / FFI** → `unresolved`/`dynamic` edges
  (`to: null`), never a proven relation.

---

### 3.4 Decisions locked by the cold suite-critic (2026-08-22)

- **D-a — advisory→proven supersede**: a `proven depends-on A→B` supersedes any pre-existing advisory
  `A→B` (same `relationKey` identity; proven strictly stronger). Reuses the existing SUPERSEDE lineage —
  no silent duplicate, no downgrade.
- **D-b — multi-ref dedup**: N resolved references A→B collapse to exactly one `depends-on A→B` (identity).
- **D-c — cross-unit intra-repo only**: the projection emits an edge only for two **distinct intra-repo
  units** — excludes external/`node_modules` resolved targets and intra-unit (same-unit) references.
- **D-d — two-layer forgery defense** (refined by R4 cold-review): the write door strips a SHAPE-forged
  proven relation (witness missing / malformed / non-provable `calls` kind) — mirrors the predicate seal
  guard; but the door has NO oracle, so a shape-valid-but-false witness still persists proven there (as a
  promoted predicate witness does) and is caught at READ-SIDE reverify (WP-R5 / #240), which re-runs the
  oracle. The sound-admit path is the only LEGITIMATE minter; the write strip + read re-derivation together
  guarantee no forged proven survives end-to-end.

## 4. Forks for owner ratification (before slicing)

**F1 — architecture of the sound relation.** Recommended: **(M) mechanical projection** of resolved
`DepEdges` → proven `depends-on` relations (no LLM). Alternatives: (G) an LLM generate-and-check arm
(a model proposes `A depends-on B`, the oracle proves it) — fits the mine template but pays a model
call to guess an edge the index already contains, and caps recall at what the model proposes;
(D) emit a companion relation as a byproduct of each proven `dependency` predicate — couples relation
recall to dependency-proposal recall. **Recommendation: M** (SOTA, 0-false, complete, cheapest,
model-independent). The family machinery (§3.2) is identical regardless, so a later G arm for
`calls`/semantic reuses it.

**F2 — projection scope.** A dependency graph is only useful complete (partial edges make "who
depends on B" misleading). Recommended: **exhaustive over resolved intra-repo edges**, honest that it
is O(resolved-edges) rows (Atlas ≈ low thousands). Alternative: rank/scope by the genesis frontier
(fewer rows, incomplete graph). **Recommendation: exhaustive**, with a stated row-count budget.

**F3 — `calls` in this campaign.** Recommended: **defer** `calls` and semantic relations (advisory
LLM) to a follow-up; ship `depends-on`-proven now. Alternative: also ship advisory `calls` this
campaign. **Recommendation: defer** — keeps the slice sound-only and small; `calls` advisory adds the
grounding≠truth risk (#201) with no proof to back it.

---

## 5. After ratification (not yet done)

Per `/techlead-decompose`: a **failing acceptance suite** (each item a red test mapping 1:1 to the
project runner) → **cold suite-critic** (independent, loop-until-dry) → slice into WPs owning
acceptance items → `conflict-map` + `plan-check` → build → red→green `acceptance-gate`. DoD = the
global gate (tsc -b + the 9 harness guards, run locally before every push — the #196c lesson).
Merge order derived from the WP DAG. This section is filled once F1–F3 are ratified.
