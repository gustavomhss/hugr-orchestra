# ADR-0019 — the sound-predicate amendment: typed args, source-carrier ast-body checks, specificity teeth

- **Status: NOT RATIFIABLE YET (v2 cold review, 2026-08-11).** billy (T0): **F1 is CLOSED** — the source-carrier
  - specificity/unrelated-swap teeth genuinely proves claim-encoding, no false-admit survives; fingerprint
    unrepresentable; render-from-args clean; buildSound inert. But TWO BLOCKERs remain (enumeration + a real
    structural inconsistency), fixes below, before owner ratification:
  * **BLOCKER (lucy) — steady-state carrier inconsistency.** The stored ast-body predicate re-verifies via the
    FROZEN `EvaluatorApi.evaluate(check, IndexNode)` at reconcile/status (`evaluator.ts:240,264`, `status.ts:76`)
    — which cannot carry source, so it either throws (`.expr` on undefined) or degrades every stored ast-body
    predicate to NA forever, contradicting the DoD "evaluate non-NA." FIX: either widen `EvaluatorApi.evaluate`
    to carry source-at-sha (a THIRD ratified surface to list) OR pin it to return NA for ast-body AND accept
    stored ast-body predicates re-verify only via a source-carrier reconcile leg (decide + enumerate).
  * **BLOCKER (lucy) — the governed door rejects ast-body.** `isCheck`/`familyOf` (`governed-emit-identity.ts:19,36`)
    accept only index-query/assertion → an ast-body predicate is REJECTED_MALFORMED_FAMILY on the shipped
    promote/emit path. FIX: extend `isCheck` (not only the reason string).
  * **MAJOR (lucy) — `renderClaim` doesn't exist; claim IS persisted.** The predicate's claim today is
    `normalizeCheck(check)` via `claimNormOf` (`mine-decide.ts:37`, the CAS dedup key — persisted), pinned by
    s11 + wp-96 goldens. "Rendered at display, never persisted" is false. FIX: either keep `normalizeCheck` as
    the persisted claim key + a display renderer, or change it and update both goldens — enumerate.
  * **MODERATE (billy) — evaluate/verdictFor not in the six; pin NA for ast-body** (same seam as lucy BLOCKER 1).
    LOW: `absence` teeth is un-passable as written (swap of an absent target is a no-op → always DROP) — invert
    (INSERT inner → must flip) or mark follow-on; `orderBefore` must state BOTH swaps flip.
    A v3 folding these is required before ratification. The F1 SOUNDNESS core (source-carrier + specificity teeth)
    is CONFIRMED; the residue is enumeration + the steady-state carrier decision.
- **Status (v2 as written):** Proposed (v2, 2026-08-11). Grounded against master `4bb54a5`, and — unlike v1 — grounded in a
  WORKING SPIKE (`scratchpad/s2-sound/teeth-spike.mjs`, `TEETH-SPIKE-RESULT.md`) that MEASURES the F1-fix
  mechanism against controls, rather than asserting "encodes by construction." The ONE owner-gated amendment
  that makes shipped `atlas mine` admit facts by mechanical TRUTH instead of aboutness. Supersedes withdrawn
  ADR-0016 and refuted-framing ADR-0018; folds the billy+lucy cold-review of ADR-0019-v1. Amends ratified
  surfaces (`INV-GEN-12` `PredicateApi`, `KNOW-16` `Check`) — the owner (admin) ratifies; the lead does not
  self-amend.
- **Spec author:** lead. Design converged over three cold-review rounds + a measured spike.
- **Already real (do not rebuild):** the mechanical admission ENGINE (`admit-harness.ts` — `admit`/
  `admitPredicate`/`attest`/`VerifiedCheck` brand + verdict-before-teeth ordering) and its tests; the
  `EvaluatorApi`+`evaluator.ts` interpreter (for the index/assertion legs); relation/negation admission. The
  literal ADR-0016 T0 is closed (no `check` field on any proposal; `buildPredicate` stores no model prose).

## The F1 problem, and the MEASURED close (not asserted)

Teeth proves a check is _sensitive to the anchored bytes_, not that it _encodes the claim_ (the ADR-0016 F1
residual). v1 tried to close it "by construction" and was refuted: routed through `EvaluatorApi(IndexNode)`,
the only body-level quantity is `subtreeHash` — a content-free FINGERPRINT that flips on ANY change, so teeth
passes trivially. The spike closes it with two measured facts:

- **Source carrier, not index.** An `ast-body` check is evaluated over the unit's SOURCE bytes at the pinned
  sha (tree-sitter), NOT `IndexNode`. So the check is **target-referencing by construction** (it searches for
  the specific token, e.g. `cfg.window`) — structurally NOT a subtree-hash fingerprint.
- **Specificity teeth (measured 9/9 shape on controls).** Admit iff: (1) base HOLDS; (2) **entity-swap** —
  replacing EVERY occurrence of the named target with a fresh symbol flips the check to BROKEN (proves it
  encodes the entity); (3) **not-a-fingerprint control** — swapping an UNRELATED token keeps the check HOLDS.
  Measured: `decay reads cfg.window` and `pullOptimize calls opts.pull` ADMIT; `cfg.threshold` (false) rejects
  on base; a synthetic subtree-hash fingerprint REJECTS because it breaks on the unrelated swap while the
  specific check holds.

## The typed predicate vocabulary (closed; the model emits ARGS — never a check, never a free claim)

```
PredicateArgs =                                   // every op is over ONE unit's body, evaluated over source
  | { op:'call',          unit, callee }
  | { op:'memberAccess',  unit, member }
  | { op:'references',    unit, name }
  | { op:'stringLiteral', unit, text }
  | { op:'operator',      unit, opKw }
  | { op:'orderBefore',   unit, a, b }            // MULTI-TARGET: teeth swaps EACH of a and b
  | { op:'absence',       unit, inner }           // inner NOT present in unit's body (scoped negative)
```

Each `target` is a DATA VALUE compared by string-equality against AST node text — NEVER interpolated into a
tree-sitter query string (no injection/wildcard-widen), no regex arg (no ReDoS). The `subtree-hash` fingerprint
is NOT in the vocabulary — unrepresentable, so it cannot be admitted even before teeth.

## Decision — the amendment

**1. Typed args on the proposal path (`INV-GEN-12` `PredicateApi` surface — owner ratifies).**

- `PredicateSeed` (`extract.ts:67`) + `PredicateProposal` (`admit-proposals.ts:28`) gain `readonly args:
PredicateArgs`. No `check` field. `buildProposal` (`mine-gate.ts:87`) threads `args: seed.args` (compile-forced).
- `PredicateApi.synthesize` (`admit-harness.ts:48`) widens `(cand) → (cand, args)`; call site `:252` passes
  `p.args`. `verify`/`teeth` signatures unchanged in shape, but see leg 3 for the carrier they receive.

**2. Concrete `PredicateApi` legs (harness, zero-model — replace the `compose-mine-admission.ts:74` no-ops).**

- `synthesize(cand, args)` → `{kind:'ast-body', op, unit, target}` (or `null` if args malformed).
- `verify` → the NEW source-carrier evaluator (leg 3), returning HOLDS/BROKEN/NA.
- `teeth` → the specificity gate: (entity-swap-all → BROKEN) ∧ (unrelated-swap → HOLDS). For `orderBefore`,
  swap EACH of a and b. For a ZERO-SIBLING unit (no unrelated token), the not-a-fingerprint control is vacuous
  and skipped — sound because the vocabulary emits only target-referencing checks (a fingerprint is
  unrepresentable), so specificity alone suffices; a zero-sibling unit is admittable, not dropped.

**3. The `ast-body` `Check` leg + a SOURCE-carrier evaluator (`KNOW-16` surface — owner ratifies).**

- `Check` (`knowledge/types.ts:55`) gains `| { kind:'ast-body'; op; unit; target }`; the `Check` `cv`
  (contract-version) is bumped (the KNOW-16 union `cv`, not the `RelationKind` prose).
- `ast-body` checks are evaluated over SOURCE at the pinned sha — a distinct evaluator leg with a
  `SourceAt(sha, path)` carrier (the repo already reads blobs at a rev: `adapter-io/src/fs.ts` gitBlob /
  `run-git.ts`). This is a NEW carrier the amendment introduces; `EvaluatorApi(IndexNode)` is NOT extended for
  it (that was v1's substrate error). The tree-sitter grammar is the one `ast.ts` already loads.
- ALL compile-forced `Check` consumers extended in the SAME amendment (enumerated per the cold reviews):
  `evaluator.ts:85-103` `admit(ProposedCheck)` — the exhaustive-`never` switch gains an `ast-body` arm AND a
  `QUERY_FORMS`/`ASSERTION_FORMS`-equivalent grammar entry so the anti-vacuity door still rejects a malformed
  ast-body check (this door is the fabrication backstop — #200); `whyUnparseable:152` gains the arm (no
  `.expr` read); `router.ts:204-207` `normalizeCheck` → canonical nodeKey string for the new kind;
  `mine-claim-scrub.ts:69-73` `scrubCheck` scrubs `target` before CAS (#219 stays closed); `upsert.ts:228`
  `checkSame` via the extended normalize. `governed-emit-reasons.ts:64` REJECTED_MALFORMED_FAMILY message
  updated to name the new kind.

**4. The human claim is RENDERED, never stored as prose.** `PredicateNode` has no claim field and
`buildPredicate` sets `claims:[]` — UNCHANGED. The human-facing claim is `renderClaim(op, args)` computed at
display/query time from the stored `(op, args)` (which live on the check + proposal), never persisted as
free text. So claim ≡ check (both projections of the same args) with NO new frozen field.

- KNOWN non-behavior (billy): the `typeOracle`/`buildSound` arm (`admit-harness.ts:245`) emits an `AdvisoryNode`
  carrying the model's `claimNorm` under `LIKELY_INVARIANT`. That arm is OUT of scope here and stays inert
  (`typeOracle.expressible:()=>false`); the "no stored prose" guarantee is scoped to the PREDICATE node. The
  typeOracle arm is a separate follow-on and must not be enabled by this ADR.

## Unchanged / out of scope

Engine, `VerifiedCheck` brand, ordering, refine≤K, `K:0`. INV-ADAPTER-11 (one call/site) + GEN-13 (zero-model
synth/verify/teeth, `K≤1`) — NOT breached (verified). `typeOracle`, relation/negation seed producers,
index-substrate predicates — follow-on. `Candidate` type — untouched (`args` rides `synthesize`, not `Candidate`).

## Definition of Done (blackbox on the SHIPPED path unless marked)

- **known-true admits:** `atlas mine` admits ≥1 real predicate (base HOLDS + entity-swap teeth flips) on the
  shipped path (D5/#155 reachability).
- **known-false drops:** a planted typed-arg naming a target the unit lacks → BROKEN → DROP, shipped path.
- **specificity + fingerprint:** unit tests — entity-swap flips; unrelated-swap holds; a subtree-hash-shaped
  check is unrepresentable in the vocabulary AND (if force-injected) dropped by the control; a zero-sibling
  unit still admits on specificity alone; `orderBefore` swaps each of a,b.
- **render fidelity:** `renderClaim(op,args)` derives from the same args the check does; no stored free-text
  predicate claim path exists (grep: `buildPredicate` sets `claims:[]`).
- **the compile-forced consumers:** each of the six extended + mutation-tested (evaluate non-NA on a real
  ast-body check, admit-door rejects a malformed ast-body check, nodeKey stable, scrubCheck redacts target,
  checkSame agrees, malformed-family message names the kind).
- **no false-admit** across a mined sample (offline panel, non-CI).
- Each WP cold-reviewed; no ratified invariant self-amended.

## What the owner ratifies

1. `INV-GEN-12`: `PredicateApi.synthesize` `(cand)→(cand,args)` + the `PredicateSeed`/`PredicateProposal`
   `args` field (+ `buildProposal` threading).
2. `KNOW-16`: the additive `ast-body` `Check` leg + its SOURCE-carrier evaluator leg + `cv` bump (+ the six
   compile-forced consumer extensions).
   Nothing merges on a ratified surface until (1)+(2) are owner-ratified and `gate` green. The prompt win
   (ADR-0017) is the PROPOSE half — its reasoning is what makes the model emit good typed args.
