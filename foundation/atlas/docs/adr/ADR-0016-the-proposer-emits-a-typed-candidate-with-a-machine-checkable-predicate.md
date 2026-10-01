# ADR-0016 — the proposer emits a typed candidate carrying a machine-checkable predicate

- **Status: WITHDRAWN — FAILED COLD REVIEW (2026-08-11). NOT for ratification.** Three cold seats
  (spec-conformance, architecture, security) found a T0 self-certification hole and that the headline scope
  ("amends ONLY ADR-0011 Decision 1") is false — the draft silently amends/violates ~5 ratified surfaces. The
  CORE reframe survives (`INV-GEN-12` genuinely does mandate the typed-candidate _deterministic_ core — two
  seats confirmed the quote), but the design below is wrong in the ways enumerated in **§Review findings**.
  This file is retained as the anchor for a corrected v2, not as a ratifiable proposal. Do not present it to
  the owner as-is. Superseded-by: a future ADR that (a) keeps the check HARNESS-synthesized, (b) decides the
  LLM-fallback question against INV-ADAPTER-11/GEN-13 explicitly, (c) scopes the real predicate-engine build.
- **Status (original draft):** Proposed (2026-08-11). The _principle_ is the already-ratified `INV-GEN-12`;
  what is **new** is (a) widening the shipped output contract that `ADR-0011` froze, and (b) the blast radius.
- **Spec author:** lead, grounded against master `4bb54a5`.
- **Resolves:** the standing gap where the SHIPPED proposer path (`{ claim: string | null }`, "no reasoning,
  one line") is **strictly narrower than its own ratified invariant** `INV-GEN-12`, which mandates _typed
  candidates_ + a _synthesized mechanical check_ + a _HOLDS-then-mutation-flip_ admission. The shipped path is
  a degradation of the constitution, not a faithful implementation of it. This is the same gap tasks #96
  (output contract), #196 (12 fact types emitted by none), and #99 (cannot ground negation/relation/
  transition) each name from a different angle.
- **Amends (ratified surface — the ONE thing that needs ratification):** `ADR-0011` **Decision 1**, the model
  output contract `ModelClient.complete(prompt, budget) → { claim: string | null }` and its gloss "the model's
  only contribution is `claimNorm` (a string)". It becomes a **typed candidate**. The shipped artifact
  `packages/adapter-io/prompts/propose.md` (hashed into provenance by `ADR-0011` Decision 3) changes with it.
- **Conforms to, does NOT amend:** `INV-GEN-12`, `INV-GEN-4`, `INV-GEN-13`, `ADR-0015`. Each is quoted below
  showing the new path _satisfies_ it — "it survives" is defended, not assumed.
- **Does NOT touch:** the `ADR-0011` transport decision (the model is still an operator-supplied subprocess;
  the seam stays price-blind and command-shaped), `INV-GEN-5` (candidate-only + human interview), `ADR-0012`
  (obviousness scored, never gated), the ratify router (`align.ts`).

## Context — the shipped path diverged from its own invariant

`INV-GEN-12` (`docs/requirements/method-tags-gen.md:95`), **ratified**, already specifies exactly the machine
this ADR ships. Quoted, not paraphrased:

> "proposer-in-a-harness, never an oracle: in S2 the LLM only _proposes_ **typed candidates** and admission is
> **mechanical** — a predicate is admitted iff its synthesized `check` **compiles**, returns **HOLDS** on
> current code, **and flips to BROKEN on a mechanically-mutated counterfactual** of the anchored subtree (the
> teeth / anti-vacuity gate); a failing check → REFINE ≤K then drop, never force; … **chain-of-thought is
> never persisted; abstention is a valid outcome**; a predicate is labelled a _machine-checked likely
> invariant_, never a proof; a type-expressible slot prefers the sound type-checker / LSP over a synthesized
> query"

The SHIPPED path implements a strict subset of this and nothing more:

- `packages/adapter-io/src/llm.ts` — `CompletionResult.claim: string | null`. One line of prose or an
  abstention. **No typed candidate, no synthesized check.**
- `packages/adapter-io/prompts/propose.md` — "NO CONFIDENCE, NO REASONING, ONE LINE … Output either exactly
  one line of plain prose … or the single token `NO-FACT`." **CoT is not merely un-persisted; it is
  forbidden** — which `INV-GEN-12` never asked for (it forbids _persisting_ CoT, not _doing_ it).
- `packages/genesis/src/admit-harness.ts` — the `compile→HOLDS→mutate→BROKEN` engine `INV-GEN-12`'s down-model
  names **exists as a reference model**, but the shipped `mine` admit path does not synthesize or run a check;
  it admits on the grounding (about-ness) door alone.

The consequence was **measured**, not asserted (bench #95, 2026-08-11, `atlas mine` over its own repo):

- Shipped path: **31/40 = 77.5% precision, 22.5% hallucination** — 9 false facts passed the grounding door
  and were seeded. Grounding proves a claim is _about_ the anchored bytes; it does **not** prove it _true_.
  Dominant failure: the one-line-no-reasoning model reads a stale/past-tense **comment** as current code.

## Decision

**1. The proposer output becomes a typed candidate.** `ModelClient.complete` returns, in place of
`{ claim: string | null }`, a structured candidate or an abstention:

```
{ claim: string,               // one atomic sentence (the human-readable fact)
  factClass: 'PRESENCE' | 'RELATION' | 'ABSENCE' | 'TRANSITION' | 'RATIONALE',   // ADR-0015 shape
  anchors: string[],           // identifiers/symbols the fact is about; each MUST occur in the shown bytes
  evidence: string,            // the CODE (not a comment) the claim re-derives from
  predicate?: MachineCheck }   // an optional check the deterministic engine can decide (INV-GEN-12)
| NO-FACT                       // the GEN-12 abstention, unchanged in meaning
```

The model **reasons freely in a discarded scratch region and then emits the structured candidate** —
constraining the _format_, never the _thinking_. This satisfies `INV-GEN-12`'s "chain-of-thought is never
persisted" exactly (the scratch is discarded before storage) while removing the shipped prompt's _extra_
"NO REASONING" clause, which the measurement shows is the direct cause of the 22.5% hallucination.

**2. Admission runs the two-layer verifier `INV-GEN-12` already prescribes, in cost order:**

- **Deterministic engine first (zero model):** the candidate's `predicate` is evaluated —
  compile → HOLDS on current bytes → **flip to BROKEN on a mechanically-mutated counterfactual** (the ratified
  teeth gate). A predicate that HOLDS-and-flips admits its fact; one that survives its own mutation is
  vacuous and dropped (`INV-GEN-12` anti-vacuity). This is the `admit-harness.ts` engine, **wired into the
  shipped path** — see the reachability requirement below.
- **Context-isolated fallback for the ~77% a single predicate cannot encode** (cross-file, counts, relations,
  type-shape, rationale): a COLD agent that never sees the proposer's context re-derives the verdict from the
  bytes. Decorrelation is by _context isolation_ (Chain-of-Verification), not model family — no external
  provider is required.

**3. Abstention, obviousness, and the ratify router are unchanged.** `NO-FACT` still means GEN-12 abstention;
obviousness is still scored, never gated (`ADR-0012`); genesis still writes candidates only and a T0/contested
fact still reaches `ratified` only through the batched human interview (`INV-GEN-5`).

## Why the invariants are CONFORMED, not amended

- **`INV-GEN-12`** — the new path _is_ its down-model: typed candidate, synthesized check, HOLDS + mutation
  flip, CoT discarded, abstention valid, sound-oracle-first (the deterministic engine runs before any LLM
  fallback). The shipped path was the subset; this closes it to the whole. **No text changes.**
- **`INV-GEN-4`** ("grounded from birth; no seed self-declares true; obviousness never rejects, only scores")
  — the candidate is still grounded at `source@sha`; the model never self-certifies (the deterministic engine
  and the isolated agent decide, not the proposer); obviousness stays a stored score. **Conformed.**
- **`INV-GEN-13`** (cost discipline — one call at base tier) — still one proposer call per site; the
  deterministic engine is free (no model); the isolated-agent fallback is the escalation, gated on the
  predicate being NA. Measured cost 1.6× the baseline per site (reasoning tokens), reported per stage.
  **Conformed** (escalation is value-gated, not default-on).
- **`ADR-0015`** (grounding tokens typed by fact shape) — `factClass` is exactly its taxonomy; this ADR is
  the first _producer_ of it. **Realizes, does not amend.**

## The reachability requirement (non-negotiable — the trap this repo has hit before)

A check-engine that is rigorously tested **as a reference model** but never **reached** by the shipped admit
path guards nothing (the "reference model vs shipped path" failure, memory `reference-model-vs-shipped-path`;
D5, task #155). Therefore this ADR is not satisfied by wiring `admit-harness.ts` into `mine` — it is satisfied
only when a **black-box subprocess test** proves that a **known-false fact is REJECTED on the shipped `atlas
mine` path** (not in a unit test of the harness). The 9 measured baseline hallucinations are the ready-made
adversarial set; the gate must show `mine` now drops them.

## Consequences

- **Precision:** measured 77.5% → **100%** (88/88 grounded+true, 0 hallucination) across 90 sites, two
  samples, verified by coached + blind + context-isolated-panel adjudication (Fleiss κ = 0.877, catch 9/9 on
  planted falses, 0 false-alarm). Numbers and method: `#95` benchmark artifacts.
- **Cost:** +≈60% per site (reasoning tokens), within `INV-GEN-13`'s ceiling reporting.
- **Recall:** the deterministic engine operates at the STRICT point (emit a predicate only when it encodes the
  claim EXACTLY, else defer to the isolated agent) — 100% sound / 0 false-alarm on what it decides, so it
  never strips a true fact. A false-alarm that rejects a true fact is the worst outcome and is designed out.
- **Migration:** the `{ claim: string | null }` contract is widened, not broken — an operator command that
  still emits one line is read as `{ claim, factClass: 'PRESENCE', anchors: [], predicate: undefined }` and
  routes entirely to the isolated-agent fallback, so no operator integration hard-fails on day one.

## What the owner still has to ratify

1. **Amend `ADR-0011` Decision 1**: the proposer output contract widens from `{ claim: string | null }` to the
   typed candidate above. (ADR-0011's _transport_ decision — model-as-subprocess — is untouched.)
2. **Replace the shipped `prompts/propose.md`** with the reason-freely→emit-structured prompt (measured
   `propose-v2`), removing the "NO REASONING, ONE LINE" clause.
3. **Accept the reachability gate** as a merge requirement: `mine` must be shown, black-box, to reject the 9
   known-false facts.

Nothing merges until (1)–(3) are ratified by the owner (admin), and the `gate` CI check is green. The lead
does not self-ratify a ratified surface.

## §Review findings (cold review 2026-08-11 — three seats, verbatim scope)

The draft above is kept for the record; these are the reasons it was withdrawn. Each is grounded to code/spec.

### T0 (billy F1) — self-certification via a non-encoding predicate

The teeth gate proves a check is _sensitive to the anchored bytes_ (`admit-harness.ts:60-63`), NOT that the
check's truth-condition equals the claim's. `claimNorm` is never passed to `attest` (`admit-harness.ts:299-303`).
Today this is inert because the check is **harness-synthesized, never trusted from the model**
(`admit-proposals.ts:23-27`; `PredicateProposal` has no check field; a dedicated RED test
`admit-harness.no-fabricated-check.test.ts` forbids it). Decision 1's `predicate?: MachineCheck` FROM THE MODEL
arms it: the model supplies both the claim and the check that admits it, and a truthful-but-unrelated predicate
(HOLDS + flips) seeds a FALSE claim into CAS. This is exactly the measured E&V "predicate-does-not-encode-the-
claim" class. **Fix: the check stays `PredicateApi.synthesize` (zero-model); a model predicate may be a hint
synthesize MAY ignore, never the teeth-tested object** — which is what INV-GEN-12's "its _synthesized_ check"
already says.

### BLOCKER (bobby) — "engine wired into the shipped path" is false

`compose-mine-admission.ts:71` wires the predicate legs as fail-closed NO-OPS (`synthesize:()=>null,
verify:()=>'NA', teeth:()=>false, K:0`); its header says the predicate legs are "STRUCTURALLY UNREACHABLE" and
the shipped `mine` admits ADVISORIES on the grounding/about-ness door alone (the bench-#95 failure). Building
real `PredicateApi.synthesize/verify/teeth` + a non-zero `K` is the BULK of the work and is entirely absent
from the draft's scope. This is the D5/#155 reference-model-vs-shipped-path trap — reproduced.

### BLOCKER (lucy) — Decision 2's context-isolated agent is a SECOND model call → amends INV-ADAPTER-11

`method-tags-adapters.md:97`: "a model is invoked **only** via SiteProposer.propose, exactly once per site …
**0 out-of-band model calls**." ADR-0011 itself (finding 1, lines 299-303) says this invariant "must be
amended … before escalation can land." The draft's LLM fallback on ~77% of sites is that second call, unlisted.
It also contradicts GEN-12's "admission is **mechanical**, never an oracle" for that layer, and violates
PROP-GEN-13's escalation predicate `(highValue ∧ uncertain)` by firing default-on (gated on predicate-NA).
**Decision: either DROP the LLM fallback (accept the deterministic engine's lower coverage) OR make amending
INV-ADAPTER-11 + PROP-GEN-13 an explicit, owner-ratified part of the scope.**

### MAJOR (lucy) — factClass ≠ ADR-0015

ADR-0015 has **FOUR** shapes (`ADR-0015:71`); the draft emits FIVE (adds RATIONALE) and drops the shape-specific
grounding-token carriers (relation=pair, negation=completeness-witness, transition=rev-pair). Emitting ABSENCE
with no completeness witness would violate ADR-0015 D3's abstention law. **Fix: reconcile `factClass` against
both ADR-0015's four shapes AND the existing `kind` discriminant (`extract.ts:57`) — they are two axes.**

### MAJOR (bobby+lucy) — transport parser / #195 provenance NOT untouched

Widening `{claim:string|null}` to a JSON candidate reintroduces a parser + parse-failure mode `ADR-0011:98`
("No JSON, no parser, no parse-failure mode") deliberately removed, breaks the truncated-output salvage
(`ADR-0011:104-113`), and touches the #195 `rawAnswer`/answer-provenance gate (`llm.ts:58-73`). **Fix: specify
the wire format + schema + size guard + parse-failure→grounded-abstention, as an explicit ADR-0011 D1 amendment.**

### MAJOR (billy F2/F3 + bobby) — model-supplied `anchors`/`evidence` are new untrusted legs

`anchors`: the draft never says grounding is minted from `cand.site` (bytes Atlas read) vs the model's anchors
— if the latter, a false claim pins to any fresh symbol (grounding forgery, T0). **Fix: anchors are advisory
metadata; grounding stays `reground(cand.site)`.** `evidence`: a new model free-text leg to CAS with no
`scrubEvidence` (KNOW-11 scrub-before-CAS covers only claimNorm/check/unit/grounding — `mine-decide.ts:138-147`).
**Fix: `evidence` is admission-only (dropped before `id(f)`) OR add `scrubEvidence`.** Also pin
`MachineCheck === Check` (pure interpreter, no code-exec) or the ADR silently authorizes a compile/exec path.

### MAJOR (lucy+billy F4) — reachability gate passes vacuously, two holes

(a) The LLM fallback could reject the 9 planted falses while the deterministic engine never fires — proving the
wrong subsystem. (b) No retention leg: a reject-EVERYTHING engine passes "rejects the 9 falses". **Fix: the gate
must prove (i) the DETERMINISTIC engine (not the fallback) drops the falses, (ii) a known-TRUE set still ADMITS,
and (iii) the fallback DROPS on unwired/error (fail-closed).**

### MINOR (bobby) — the 100% number is attributed to an unbuilt path

88/88 precision is a real measurement of the PROPOSE-REDESIGN (adjudicated by panels). The deterministic-engine-
in-production numbers are PROJECTED (the engine is no-ops today). **Fix: label which is measured vs projected —
`premissa-sem-evidencia-e-teoria`.**
