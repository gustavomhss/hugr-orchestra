# ADR-0018 — complete the mechanical predicate-admission legs (the sound genesis gate)

- **Status: FRAMING REFUTED by cold review (2026-08-11) — corrected direction in §Review findings; NOT for ratification as written.** Two seats (billy T0, lucy conformance) proved the "fill stubs behind frozen interfaces, Track 1 needs no ratification" framing false: the crux (model typed-args → harness `synthesize` → `Check`) CANNOT be wired without changing the frozen `PredicateApi.synthesize` signature (`admit-harness.ts:48`) + its call site (`:252`) + the proposal/seed shape — all GEN-12 ratified surface. And teeth proves byte-sensitivity, NOT claim-encoding (the ADR-0016 F1 residual), so a site-derived check is a content-free fingerprint that passes teeth trivially. The design below is retained as the anchor; the corrected, correctly-scoped design is in §Review findings.
- **Status (original draft):** Proposed (2026-08-11). Grounded against master `4bb54a5`. The design that turns the shipped
  `atlas mine` from an _aboutness_ door (grounding ≠ truth, 22.5% hallucination measured) into a _truth_ gate
  (admit iff a harness-synthesized check compiles, HOLDS, and flips BROKEN under mutation). Needs owner
  ratification of the ONE ratified-surface amendment (Track 2, KNOW-16 `Check` leg) + green `gate`. The lead
  does not self-ratify a ratified surface.
- **Spec author:** lead. Gap-map cold-confirmed by a bobby seat (2026-08-11).
- **This ADR COMPLETES an existing engine; it does not build a new one.** The mechanical admission engine
  (`genesis/src/admit-harness.ts` — `admit`/`admitPredicate`/`attest`/`runSite`, refine≤K, the teeth ordering
  gate) is REAL and tested (`wp-8.28-b-gen.test.ts`). The frozen `PredicateApi` (synthesize/verify/teeth),
  the `Check` carrier (KNOW-16), the `EvaluatorApi`+`evaluator.ts` interpreter, and relation/negation
  admission all EXIST. What is absent is every _load-bearing port impl_: the sole production wiring
  (`compose-mine-admission.ts:68-96`, `buildMineAdmission`) is fail-closed no-ops
  (`synthesize:()=>null, verify:()=>'NA', teeth:()=>false, typeOracle.expressible:()=>false, K:0`), and no
  producer emits a predicate seed, so `admitPredicate` is never even entered. This is the
  `reference-model-vs-shipped-path` trap (D5/#155): the engine is proven with doubles; the shipped path proves
  nothing.
- **Resolves together:** INV-GEN-12 (the mechanical gate the constitution mandates), #99 (relation/negation
  reachable), #196 (the typed vocabulary actually emitted), and the #95 hallucination at its root.

## The crux, and how it is mechanized (not hand-waved)

`synthesize` (NL claim → formal check) is the non-mechanizable step **only if the model hands over a free
sentence**. It becomes mechanical when the **constrained proposer emits TYPED ARGS** `{op, unit, args}` from
a closed vocabulary, and the **harness deterministically compiles args → Check** (`PredicateApi.synthesize`,
zero-model). The check encodes the claim _by construction_ (the harness built it to mean `op(args)`), which is
why the model never supplies the Check — killing the ADR-0016 self-certification T0. Measured prototype:
`scratchpad/s2-sound` — constrained proposer + AST gate, 260/313 admitted (HOLDS+teeth), ~10 useful-proven
facts/file.

## Two tracks (the honest split — richness needs a governed amendment)

### Track 1 — first real predicate on shipped `mine`, NO ratified-surface change

Fills the four stubbed legs so `atlas mine` admits a real, harness-verified predicate. **Constraint:** today's
`Check = {index-query | assertion}` reaches only the INDEX tree (exists / has-object / child-count /
subtree-hash over `IndexNode`), so Track 1's predicates are **structural/index-level** (a unit exists, a
child-count, a subtree-hash equality) — sound but THIN. Legs:

1. **Predicate-seed producer** — emit `{kind:'predicate', slot, ...}` seeds with index-expressible typed args
   (`extract.ts:66-70` shape exists; emitter absent). The hardest-blocking gap: without it `admitPredicate` is
   unreachable.
2. **`synthesize` (index class)** — compile typed args → an `index-query`/`assertion` `Check`
   (replace `()=>null`).
3. **`verify` wiring** — the cheapest leg: connect the existing tested `evaluate` (`evaluator.ts:240`) to
   `PredicateApi.verify` (replace `()=>'NA'`).
4. **`teeth` (mutant engine)** — mechanically mutate the anchored index subtree, re-evaluate, return true iff
   the check flips BROKEN on ≥1 mutant (replace `()=>false`; no mutation code exists in `src`).
5. **Flip `buildMineAdmission` legs no-op→real + blackbox reachability** — prove shipped `atlas mine` admits
   ONE real predicate whose check the harness verified AND flipped, and that a known-false structural claim is
   DROPPED — on the shipped path, not a harness unit (the D5/#155 gate).

### Track 2 — the RICH body-predicate lens, RATIFIED-SURFACE amendment (owner ratifies)

The measured richness (~10 useful-proven facts/file) lives in the **intra-function-body** class ("decay's body
reads cfg.window", "F calls g") — which today's `Check` **cannot express** (the interpreter reaches only index
nodes; `subtree-hash` detects _that a body changed_, never _what it asserts_). Track 2 adds: 6. **An ADDITIVE `Check` leg** `{kind:'ast-body', ...}` + its interpreter (the proven `scratchpad/s2-stageB/
   astq.mjs`, web-tree-sitter body-predicate) + a `cv` (contract-version) bump — a **KNOW-16 amendment**. 7. **Body-class `synthesize` + `teeth`** — args → ast-body Check; mutate the function body, re-evaluate, flip.

**Without Track 2 the gate is sound but thin; the whole richness payoff is Track 2.** Track 2 amends the
frozen `Check` type (KNOW-16) — a ratified surface — so it is the owner's to ratify. The lead does not
self-amend KNOW-16/GEN-12.

## What is explicitly OUT of the first predicate (bobby-confirmed)

`typeOracle` (its sound arm emits an ADVISORY, not a predicate — `buildSound`), `refine`/`K` (K:0 is a valid
budget), and relation/negation as separate families (their admission is DONE but needs their own seed
producers). These are follow-on, not blockers for a first verified predicate.

## Consequences / honesty

- **Truth becomes mechanical**, not prompt-hoped: admission = proven predicate, not aboutness. The 22.5%
  cannot enter (an unproven claim abstains).
- **Freshness bonus** — a stored predicate carries its own re-runnable Check ⇒ staleness = re-run at the new
  sha (HOLDS=fresh / BROKEN=stale). Retires the defeatable hash drift oracle (#98/#101/#164). (Design note;
  wired as a follow-on.)
- **Measured vs projected:** the ~10 useful/file + 260/313 admit are MEASURED on the prototype gate
  (`scratchpad/s2-sound`); the shipped-path numbers are re-derived by the Track-1/2 blackbox DoD. The engine
  correctness is the EXISTING tests; this ADR wires real legs to it.
- The prompt win (ADR-0017 / `atlas-s2-stage1-result`) is the PROPOSE half — its reasoning is what makes the
  constrained proposer emit good typed args.

## Definition of Done

- **Track 1:** blackbox `atlas mine` admits ≥1 real predicate (HOLDS+teeth-flip on the shipped path); a
  planted false structural claim is DROPPED; verify wired to the real evaluator; teeth mutant engine flips on
  a real mutant + is anti-vacuity tested; the four `buildMineAdmission` no-op legs replaced, each mutation-
  tested. No false-admit.
- **Track 2:** the `ast-body` `Check` leg round-trips (synthesize→HOLDS→teeth-flip) on the 9/9 proven controls
  (`astq.mjs`); `cv` bump + KNOW-16 amendment ratified; blackbox `atlas mine` admits a real BODY predicate.
- Each WP cold-reviewed; no ratified invariant self-amended.

## What the owner ratifies

1. **Track 2 only:** the KNOW-16 `Check`-type amendment — an additive `{kind:'ast-body'}` leg + `cv` bump.
   (Track 1 fills stubs behind frozen interfaces and needs no ratification.)
   Nothing merges on a ratified surface until owner-ratified and `gate` green.

## §Review findings (cold review 2026-08-11 — billy T0, lucy conformance) + the CORRECTED design

The two-track "Track 1 needs no ratification" framing above is REFUTED. What both seats verified SAFE: the
literal ADR-0016 T0 is closed (no `check` field on any proposal; `synthesize(cand)` receives only the site —
`admit-proposals.ts:28-37`, `admit-harness.ts:48`); `buildPredicate` discards the model's prose `claimNorm`
(`admit-harness.ts:360-374`); the `VerifiedCheck` brand + verdict-before-teeth ordering are sound and tested;
INV-ADAPTER-11 (one call/site) and GEN-13 (`K:0 ≤ 1`, zero-model synth/verify/teeth) are NOT breached.

What is WRONG and must be corrected:

- **BLOCKER (both) — the crux touches a FROZEN GEN-12 surface.** "Model emits typed args `{op,unit,args}` →
  harness compiles args→Check" cannot be wired behind the frozen `PredicateApi`: `synthesize(cand: Candidate)`
  (`admit-harness.ts:48`) and its call `synthesize(p.site)` (`:252`) receive ONLY the site; `PredicateProposal`
  / `PredicateSeed` carry no args (`admit-proposals.ts:28-37`, `extract.ts:67-70`). Wiring model args REQUIRES
  widening the seed/proposal shape AND the `synthesize` signature AND the call site — all GEN-12 ratified
  surface. So there is NO "no-ratification" track; the crux itself is a ratified-surface amendment.
- **T0 (billy) — teeth proves byte-SENSITIVITY, not claim-ENCODING (the ADR-0016 F1 residual, still open).**
  With site-only synth, the only constructible check is a `subtree-hash` fingerprint that flips on ANY byte
  change ⇒ `teeth()` always true ⇒ `DROP_VACUOUS` never fires ⇒ a content-free check passes the "truth" gate.
  For the body class, an over-broad query ("body has _a_ call" vs "calls `g`") HOLDS + flips while testing a
  WEAKER fact than the claim. **Fix: SPECIFICITY teeth — a mutant that changes the NAMED ENTITY but not the
  surrounding bytes (`cfg.window`→`cfg.other`) MUST flip; a pure fingerprint that survives entity-swap is
  vacuous ⇒ DROP.** And the closed vocabulary MUST exclude pure `subtree-hash` fingerprints as admissible
  predicate checks.
- **MAJOR (lucy) — the `ast-body` `Check` leg touches ≥4 unlisted frozen consumers:** the evaluator ternary
  (`evaluator.ts:240-243`, else-reads-`.expr`), `normalizeCheck`→`nodeKey` identity (`router.ts:204-207`),
  `scrubCheck`-before-CAS (#219, `mine-claim-scrub.ts:69-73`), and `checkSame`/`upsert.ts:228`. All four must
  be extended in the KNOW-16 amendment.
- **MAJOR (billy) — tree-sitter arg injection.** Model-supplied args must be DATA-BOUND (compared in JS),
  never interpolated into query source (wildcard-widening feeds the teeth T0); cap any `#match?` regex (ReDoS).
- **MINOR (billy) — new guarantee surface.** Flipping the stubs makes shipped `mine` emit a
  `LIKELY_INVARIANT` machine-checked claim for the first time — acknowledge it even though no type changes.

### The corrected design (one amendment, correctly scoped — for a v2/ADR-0019)

ONE owner-ratified amendment, not two tracks: **(a)** widen `PredicateSeed`/`PredicateProposal` with a typed
`{op, unit, args}` field + widen `PredicateApi.synthesize` to receive it (GEN-12 surface); **(b)** the harness
synthesizes the `Check` FROM the typed args (zero-model) AND RENDERS the human-facing claim FROM `op(args)` —
model prose discarded like scratch, so claim≡check by construction; **(c)** SPECIFICITY teeth (entity-swap
mutant must flip); ban fingerprint-only checks; **(d)** the `ast-body` `Check` leg + its interpreter
(`astq.mjs`) + the 4 consumer extensions + `cv` bump (KNOW-16); **(e)** tree-sitter args data-bound + regex
cap; **(f)** DoD on shipped `mine`: known-true-admits, known-false-dropped, entity-swap-teeth-flips, and a
fingerprint-check-REJECTED test. The encoding fidelity of args→Check is the load-bearing piece and must be
specified + tested, not asserted "by construction" as this draft did.
