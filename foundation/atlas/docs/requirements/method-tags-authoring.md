# Method-tags — Block AUTHORING (CAMPAIGN-10) · S2 formal-decision

> **state:** S2 · **protocol:** [`formal-decision`](../method/prompts/S2.md) ·
> **axiom:** S1 frozen (`requirements-authoring.md`; 80 REQs, every behavioural INV has ≥1 REQ) ·
> **owner:** lead; method-decision cold-review **pending** (bobby / BLUEPRINT).
>
> One tag per **behavioural** INV by the 3-conjunct rule. **This surface carries ZERO `formal` tags.** The
> one `formal` cluster in the whole Atlas is the kernel merge (`FSPEC-merge`, KERNEL-9/10/11), already
> discharged one layer down and consumed here only through frozen seams. All 20 INVs are `behavioural`, so
> none carries `n/a`.
>
> **Why no `formal` here (the 3-conjunct test, written not asserted).** A `formal` tag needs all three of
> {high-consequence ∧ hard-to-recover} ∧ {combinatorial state tests cannot cover} ∧ {cheap to keep alive}.
> Every invariant on this surface fails the **second** conjunct: the state space is a fixture repository, a
> finite door set, a closed 13-member slot union, and a four-gate decision table. There is no unbounded
> interleaving and no concurrency — planners are pure reads, and the one durable transition (`atlas-emit`)
> is already governed and already modelled downstream. What this surface _does_ have is an unusually high
> density of **agreement** properties (planner ≡ gate, check ≡ door, CLI ≡ MCP), which is why the `PBT`
> share here (5/18) is higher than in any other block: an agreement law is exactly what a `∀` quantifier is
> for, and exactly what a witness pair cannot close.
>
> **Tag distribution:** `PBT` 5 · `exhaustive` 8 · `reference-model` 5 · `formal` 0 · `n/a` 0.

---

### INV-AUTH-1

method-tag: PBT
fspec: —
up-property: "single-seam agreement: ∀ anchor a reachable at rev R, the hash the planner derives for a EQUALS the hash the emit truth-gate re-derives for a at R — for every language, every anchor kind (file/dir/symbol), and with the caller performing zero set-up of its own"
down-model: "the emit truth-gate's own derivation IS the oracle (there is no third party); generate an arbitrary anchor set from a multi-language fixture, derive each through the planner seam and through the gate seam, assert equality pairwise; a second arm invokes the planner from a cold caller (no warm-up) and asserts the same equality"
anti-rot: the gate seam is the mock — the planner is wired to the identical exported seam, so a divergent fold cannot compile past the one call site; the cold-caller arm is the teeth for the `author.ts:24-31` warm-up smell.
teeth: breaks-on "a planner that folds without the AST grammars warm (silently file-level) — the file-anchor witness passes and only a symbol anchor at a cold call site diverges"

### INV-AUTH-2

method-tag: exhaustive
fspec: —
up-property: "zero write authority, totally: for EVERY member of the authoring door set × every argument class (valid, malformed, empty), bytes written to CAS == 0 ∧ bytes written to the projection sidecar == 0 ∧ cache entries created == 0 ∧ the door ∉ WRITE_PATHS ∧ the door ∉ GOVERNANCE_SURFACE"
down-model: "the door set is FINITE and closed — enumerate it completely; run each door under a write-spy store whose put/persistProjection throw on call, and assert every door completes; separately assert set-membership by deep-equal against the two frozen constants"
anti-rot: the write-spy store is the mock; any door that acquires a store write handle fails at the first call rather than at review time.
teeth: breaks-on "a door that memoizes its index build to disk 'just as a cache' — a read-only assertion on the CAS alone misses it; the spy covers cache writes too"

### INV-AUTH-3

method-tag: reference-model
fspec: —
up-property: "anchor faithfulness: for the fixture repo, anchors(path) equals the built index's unit set under path (qualifiedPath · kind · current subtreeHash), is byte-identical across two runs, reports the rev, and contains exactly the index's units — 0 phantom, 0 missing; a non-git / unreadable / untracked path yields units == [] with a reason and 0 exceptions"
down-model: "the built `Axes` over the committed fixture repo is the oracle; assert deepEqual(anchors(p).units, unitsOf(build(fixture), p)) ∧ anchors(p) ≡ anchors(p) ∧ anchors(p).rev == headSha(fixture); then a non-git temp dir and a permission-denied path assert the structured empty result"
anti-rot: the fixture repo + its reference unit set are the mock; a lister that reorders, drops, or invents a unit diverges from the golden and breaks the build.
teeth: breaks-on "a lister that sorts by insertion order rather than the index's order — content-equality passes, sequence-equality does not"

### INV-AUTH-4

method-tag: reference-model
fspec: —
up-property: "declared-hole honesty: for a fixture spanning a grammar-configured language and a grammar-less one, the grammar-less files appear at FILE level AND a holes[] entry names their extension, count, and reason; the grammar-configured files appear at symbol level with no hole entry"
down-model: "a mixed-language fixture (ts + rs) plus its expected `{units, holes}` is the oracle; assert the rs files are present as file units, holes[] contains exactly one entry `{ext:'.rs', fileCount:n, reason}` with n equal to the fixture's rs count, and the ts files carry `::` symbol units with no hole entry"
anti-rot: the mixed-language fixture is the mock; a lister that degrades silently produces file units with an empty holes[] and fails the golden.
teeth: breaks-on "a lister that emits a hole entry with fileCount 0 or a hard-coded extension list — the count is asserted against the fixture's real file census, not a constant"

### INV-AUTH-5

method-tag: exhaustive
fspec: —
up-property: "closed-vocabulary totality: slots() == the closed PredicateSlot union, exactly — every member present, no non-member present — and the set is obtained BY DERIVATION from the union such that adding a member to the union surfaces it at the door with no door edit"
down-model: "the PredicateSlot union is FINITE (13) — enumerate it completely; assert set-equality between slots() and the union; the derivation arm asserts the door reads the union rather than a literal (a type-level exhaustiveness check over the union that fails to compile if a member is unhandled)"
anti-rot: the union itself is the mock — the door's mapping is total over the union, so a new member breaks the type-check, not a test.
teeth: breaks-on "a hand-transcribed 13-element array that silently goes stale when a 14th slot is added — set-equality passes today and fails the day the union grows, which is exactly when nobody re-reads the door"

### INV-AUTH-6

method-tag: reference-model
fspec: —
up-property: "draft completeness: for a drafted fact, the set of fields the governed emit door reads ⊆ the set of fields present and well-formed on the fact; identity == nodeKey(candidateView(fact)); grounding.subtreeHash == the computer's current value for the anchor; and the author-supplied input set == {anchor, slot, claim}"
down-model: "the governed emit door's own read-set is the oracle — derive it from the door (the fields it destructures) rather than restating it; assert field-presence over that set, then assert identity and grounding equality against the product formulas directly"
anti-rot: the emit door is the mock; a field the door starts reading and the drafter does not produce breaks the presence assertion at the next build.
teeth: breaks-on "a drafter that emits an `id` it invents rather than mints — the fact still emits (the door re-mints identity anyway), so only asserting against the formula catches it"

### INV-AUTH-7

method-tag: reference-model
fspec: —
up-property: "rev legibility: a draft carries the rev it was computed at; emitting that draft at a different rev yields a refusal whose reason names the rev mismatch and does NOT name the claim"
down-model: "a two-commit fixture is the oracle: draft at R1, emit at R2, assert the refusal reason matches the rev-mismatch shape and does not match a claim-attribution shape; the positive arm (emit at R1) asserts acceptance"
anti-rot: the two-commit fixture is the mock; a drafter that omits the rev makes the mismatch indistinguishable from ordinary drift and fails the reason assertion.
teeth: breaks-on "a refusal that names the drift generically ('grounding does not re-derive') when the true cause is a rev mismatch the product itself could have detected"

### INV-AUTH-8

method-tag: PBT
fspec: —
up-property: "round-trip acceptance: ∀ (anchor a, slot s, claim c) with a reachable at rev R, emit(draft(a,s,c,R), R) on an unchanged repository is ACCEPTED by the truth door — no exceptions across anchor kinds, languages, tiers, or claim contents"
down-model: "the governed emit door is the oracle; generate arbitrary (anchor, slot, claim) triples from the fixture's real unit set × the 13-member slot union × arbitrary claim strings (including unicode, empty-adjacent, and very long), draft each and emit at the drafting rev, assert acceptance for every triple"
anti-rot: the emit door is the mock; this property is the ACCEPTANCE CRITERION of the campaign — if it does not hold, the surface has not delivered its outcome.
teeth: breaks-on "a drafter correct for file anchors and wrong for symbol anchors (the `::` unit path) — the natural hand-written witness is a file anchor, so only the ∀ over the real unit set reaches the symbol case"

### INV-AUTH-9

method-tag: exhaustive
fspec: —
up-property: "route disclosure totality: for EVERY point in the route decision space (tier × node kind × contested × lowRisk), the draft's declared route equals the route the governed door will take, and a full-ratify route names its authorizing channel"
down-model: "the route decision function is the oracle and its input space is FINITE — enumerate it completely; for each point assert declaredRoute(draft) == route(candidate, ctx) and, when full-ratify, assert the authorizing channel is named"
anti-rot: the route function is the mock — the drafter calls it rather than re-deriving the policy, so a policy change moves both at once.
teeth: breaks-on "a drafter that hard-codes 'T0 ⇒ full-ratify' and misses the predicate-kind and contested routes — the T0 witness passes while a T2 predicate silently reports auto-accept and then fails at the door"

### INV-AUTH-10

method-tag: exhaustive
fspec: —
up-property: "operation disclosure totality: over the finite {identity occupied, identity free} × {advisory, predicate} space, draft reports UPDATE exactly when a current node exists at the drafted (anchor, slot) identity and CREATE otherwise — never absent, never inverted"
down-model: "the rehydrated projection is the oracle; enumerate the four cases against a seeded store, asserting the reported operation equals `projection.has(nodeKey(candidateView))` mapped to UPDATE/CREATE"
anti-rot: the projection reader is the mock; the drafter queries the same rehydrate seam the door does.
teeth: breaks-on "an occupancy check keyed on the CAS contentHash instead of the nodeKey — a REWORDED claim at the same (anchor, slot) then reports CREATE, which is precisely the case the invariant exists for"

### INV-AUTH-11

method-tag: PBT
fspec: —
up-property: "dry-run fidelity: ∀ fact f, rev r, actor α, token τ. check(f,r,α,τ).wouldEmit == emit(f,r,α,τ).emitted — over a corpus spanning every gate outcome (shape · truth · authz · ratify) and every combination of them"
down-model: "the governed emit door is the oracle, run against a scratch store that is discarded; generate arbitrary (fact, rev, actor, token) tuples biased to straddle each gate boundary, run both, assert verdict equality — and assert gate ORDER equality by comparing which gate each reports first"
anti-rot: the door is the mock; `check` composes the door's own gate functions rather than re-implementing them, so a gate change moves both.
teeth: breaks-on "a `check` that evaluates authz before truth — every single-failure input still agrees; only an input that fails BOTH truth and authz reveals the order divergence, and only the ∀ generates it"

### INV-AUTH-12

method-tag: PBT
fspec: —
up-property: "refusal legibility: ∀ input i in the malformed/adversarial space, the refusal reason NAMES a gate from the closed GateName set ∧ carries a non-empty remedy ∧ matches no runtime-error shape (no 'Cannot read propert', no 'is not a function', no stack frame, no 'undefined')"
down-model: "a reference refusal-reason grammar is the oracle (gate ∈ GateName, remedy non-empty, no error-shape substring); fuzz the payload space — wrong types, missing fields, null/undefined at every position, oversized values, prototype-polluting keys — and assert the grammar holds for every refusal"
anti-rot: the reason grammar is the mock; a raw thrown error cannot satisfy it.
teeth: breaks-on "a validator that structures the reasons it anticipates and lets an unanticipated shape fall through to the catch-all — which is exactly the observed `Cannot read properties of undefined (reading 'length')` failure; only the fuzz reaches the unanticipated shape"

### INV-AUTH-13

method-tag: exhaustive
fspec: —
up-property: "retire-without-a-door: the write-path set equals {atlas-emit, atlas-link} exactly (no retire, no delete member) ∧ a retire draft persists only through atlas-emit ∧ every gate a grounded-fact emit passes is also passed by the retire"
down-model: "the write-path set is FINITE and closed — enumerate it and assert set-equality; then for a retire draft, assert persistence occurs only via the emit door and that each gate function was invoked (a gate-invocation spy), with no gate short-circuited by the superseded authoring state"
anti-rot: the emit door's gate chain is the mock; a retire path that skips a gate fails the invocation spy.
teeth: breaks-on "a retire that skips the truth gate on the reasoning that a superseded fact 'need not re-ground' — the persistence assertion passes and only the gate-invocation spy catches it"

### INV-AUTH-14

method-tag: reference-model
fspec: —
up-property: "receipt closure: the identity a successful emit returns resolves through the per-node read door and is accepted by the link door, with no intervening query"
down-model: "the per-node read door is the oracle: emit a fact, take ONLY the receipt, resolve it through the read door, assert the resolved node is the emitted fact; a second arm feeds two receipts to the link door and asserts both endpoints are recognised"
anti-rot: the read door is the mock; a receipt carrying only an address the read door rejects fails resolution.
teeth: breaks-on "a receipt that carries the nodeKey but drops the CAS id, breaking the drift/doctor read-back that consumes the CAS address — the read-door arm passes; the assertion is that the receipt covers BOTH consumers"

### INV-AUTH-15

method-tag: exhaustive
fspec: —
up-property: "fast-path verdict derivability: the write door supplies `contested` and `lowRisk` DERIVED from observed state (commit-retry contention; the cleared truth gate + the advisory T2 class), never from a module-level constant; a contended write is `full-ratify`, an ungrounded or predicate T2 is never `lowRisk`"
down-model: "the frozen states are the oracle: a mutation that replaces the door's ratification context with a hardcoded `{ contested: false, lowRisk: true }` constant must change the routed decision OR be caught by the byte-level derivation assertion; a contended commit must route `full-ratify`"
anti-rot: the `route` API is the mock, driven with contexts built from real derived state (truth verdict + contention flag) vs the constant; a door that reinstates the constant diverges.
teeth: breaks-on "a door that hardcodes `{ contested: false, lowRisk: true }` at module scope — the shape/truth/authz gates all pass, only the derivation assertion catches it"

### INV-AUTH-16

method-tag: exhaustive
fspec: —
up-property: "use-or-seal growth totality: an advisory node rises by ONE of two sufficient evidences — USE (a per-node served-counter reaching the fixed `USE_THRESHOLD` plain integer) or SEAL (a human ratify token endorsement) — and NEVER by default; a node earning neither stays advisory and decays (KNOW-17)"
down-model: "the fixed `USE_THRESHOLD` constant and the seal path are the oracle: enumerate the two rise triggers; assert that reaching the threshold rises automatically (no human), that a seal rises independently (no forced threshold), and that a node with neither stays advisory across the decay pass"
anti-rot: the counter + seal are the mock; a rise gated on anything other than the plain integer or the seal diverges.
teeth: breaks-on "a default rise (a node climbing at zero counter), or a rise that requires BOTH threshold and seal — either violates 'neither mandatory' and the fixed-threshold design"

### INV-CLI-5

method-tag: exhaustive
fspec: —
up-property: "help coverage totality: the set of commands help names ⊇ the parser's command list (which is finite and closed), each with its arity and flags; and the set of write-governing environment channels help names ⊇ the set the composition root reads"
down-model: "the parser's command map and the composition root's env reads are the oracles — enumerate both completely; assert containment of each in the help output, so a command or channel added anywhere fails help immediately"
anti-rot: the parser's command map is the mock; help derives from it rather than restating it.
teeth: breaks-on "help hand-listing the commands — correct on the day it is written and stale the first time a command is added, which is when nobody re-reads help"

### INV-CLI-6

method-tag: exhaustive
fspec: —
up-property: "render coverage totality: for EVERY leg (a finite set), the key set of the rendered output ⊇ the field set of that leg's result record — 0 silently dropped fields"
down-model: "each leg's result record type is the oracle; enumerate the legs, and for a populated result per leg assert every field name appears in the render; the `init` leg is the regression witness (blastRadius + t0Candidates are dropped today)"
anti-rot: the result records are the mock; a field added to a record and not to the render fails the containment.
teeth: breaks-on "a render that returns early after the first recognised field shape — exactly the `render.ts` init-leg behaviour, where two of three fields never reach the user"

### INV-MCP-3

method-tag: exhaustive
fspec: —
up-property: "advertised-surface totality: advertised == GOVERNANCE_SURFACE ∪ READ_SURFACE ∧ READ_SURFACE ∩ GOVERNANCE_SURFACE == ∅ ∧ READ_SURFACE ∩ WRITE_PATHS == ∅ ∧ |GOVERNANCE_SURFACE| == 6 ∧ |WRITE_PATHS| == 3 ∧ ∀ t ∈ READ_SURFACE. bytesWritten(t) == 0 (ADR-0005; ADR-0006 Decision 2 superseded the fixed count)"
down-model: "all three sets are FINITE and closed — enumerate them; assert the union, the two disjointness predicates, and the two cardinalities (==6 / ==3) by deep-equal against the frozen expectations; then invoke every READ_SURFACE member under the write-spy store"
anti-rot: the three frozen constants are the mock, pinned by the spec-conformance guard's CODE-SURFACE PIN — which gains the two disjointness checks in the same change.
teeth: breaks-on "a read door added to READ_SURFACE that internally delegates to the emit leg for convenience — the cardinality and disjointness assertions all pass; only the write-spy arm catches the routing"

### INV-MCP-4

method-tag: PBT
fspec: —
up-property: "cross-transport equivalence, extended: ∀ door d ∈ the authoring surface, ∀ input x. cli(d,x) ≡ mcp(d,x) — byte-identical Verdict, valid ∨ malformed x, with no divergence in coercion, defaulting, error shape, or field set"
down-model: "the one wired handler is the oracle (both transports route to it); generate arbitrary inputs per door — valid under the published schema ∪ malformed — and run each through the subprocess CLI and the stdio MCP harness, asserting byte-equality of the serialized Verdict"
anti-rot: the shared handler is the mock; a transport that re-serializes or coerces diverges on some input.
teeth: breaks-on "an MCP-side JSON round-trip that drops an `undefined`-valued optional field the CLI renders as absent-but-present — the two look identical for every fully-populated input and diverge only on a partially-populated one"

---

## Completeness (S2 predicates)

| predicate                                            | verdict                                                                                                |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| every INV carries exactly one `method-tag`           | ✅ 20/20                                                                                               |
| no untagged INV                                      | ✅                                                                                                     |
| every `formal` tag justified by all three conjuncts  | ✅ vacuous — **0** `formal` tags; the refusal is argued above, not asserted                            |
| any `FSPEC` maps to its cluster's INVs               | ✅ vacuous — no `FSPEC` authored here; `FSPEC-merge` is consumed through frozen seams and is unchanged |
| the tool matches the problem _shape_, not the domain | ⚠️ judgment — **COLD-REVIEW pending**                                                                  |

**DoD: NOT MET** — GATE pending, COLD-REVIEW pending.
