# ADR-0011 — the model is an operator-supplied command, and every constant is a governed default

- **Status:** Proposed (2026-08-02). Closes the **D5** impl-DEFINE (`reference/atlas-adapters.md:203`,
  `invariant-register-adapters.md:176`), which has been `[DEFINE-pending → owner]` since S0. FOUR findings
  are named in §"What this ADR does NOT close" and are **not** closed here — three surfaced by the analysis,
  and one (the fourth) is the gap between what Decision 2 decides and what the delivery ships.
- **Spec author:** lead, grounded against `87c23cd` (master).
- **Implements:** `ADAPT-LLM-1` / `INV-ADAPTER-11` (the frozen `SiteProposer` seam), `GEN-2`, `GEN-12`,
  `GEN-13`.
- **Amends:** nothing frozen _in this ADR's decisions 1–4_. `ModelClient`, `SiteProposer`, `CompletionResult`
  and `LlmBudget` signatures are unchanged; `GOVERNANCE_SURFACE` and `WRITE_PATHS` are untouched. Two
  **proposed** amendments (the batch seam, and an additive `quote` on a grounding entry) are stated in
  §"What the owner still has to ratify" and are **not** applied by this ADR.
- **Scope of this seat:** `packages/adapter-io/src/llm.ts` (the model adapter), a new config resolution
  module, `packages/adapter-io/prompts/**`, and the docs above. It does **not** touch any governed write door.

## Context — measured, not hypothesised

Every claim below was run against master at `87c23cd`.

**The vendor-neutral abstraction already exists and is frozen.** `packages/adapter-io/src/llm.ts` declares
`ModelClient` — one method, `complete(prompt, budget) → { claim: string | null }` — and `createSiteProposer`
over it. This is exactly the "thin port + pluggable adapter" pattern that the field converged on; there is no
formally standardised LLM interface, only the de-facto OpenAI-compatible shape. **Building an abstraction
layer on top of this one would be pure over-engineering.** D5 therefore decides an _adapter and its
configuration_, nothing more.

**Nothing is wired, and nothing is vendored.**

```
grep -rn "anthropic|openai|@ai-sdk|ollama" packages/*/package.json  →  0 matches
packages/adapter-io/src/wire.ts:269   void [createForge, createHistorySource, createSiteProposer];
                                      // "the DAG-pin references NOT wired as handler legs"
packages/cli/src/mine.ts:125          defaultProposer() → { propose: () => null }   // fail-closed
```

`atlas mine .` consequently reports `0 candidates — no proposer model wired`, `llmCalls 0`. That is honest,
tested behaviour (WP-F6), and this ADR preserves it as the zero-config default.

**The escalation ladder is decided and never executed.** `decideMechanisms` (`cost-policy.ts:85`) returns a
closed `Mechanism` set — `types.ts:212`: `'self-consistency' | 'refuter' | 'check-synthesis' | 'codeql'` —
and `escalate()` has **zero production consumers** (`grep '\.mechanisms|escalate('` over `packages/*/src`
returns only the declaration and the binder). Separately, `createSiteProposer` makes exactly one call with no
loop, and `llm.test.ts:61` pins it (`expect(rec.calls).toBe(1)`, teeth: _"a retrying propose records >1"_).
**So no seam in the system can run an escalated site.** This ADR ships the cheap pass only, and says so.

**~40 tuning constants are hardcoded.** Measured across `packages/*/src`: `DAMPING=0.85`,
`PPR_ITERATIONS=64`, `MIN_COMMITS=2`, `BLAME_CONCENTRATION_MAX=0.9`, `CEILING_CAP=200`,
`MARGINAL_WINDOW=20`, `MARGINAL_MIN_ADMITS=4`, `DEFAULT_SAMPLES=1`, `DEFAULT_CEGIS_K=1`,
`INTERVIEW_CAP=20`, `OWN_CAP=1500`, `PACK_CAP=2000`, `MAX_HOPS=2`, `K=8`, `HOTSPOT_MIN_CHURN=2`,
`COUPLING_MIN_SUPPORT=2`, `MEMBER_TOK_CAP=500`, `DECAY_PER_WAVE=0.5`, and others. Some are ratified, some are
spec-declared _defaults_, and some were never examined by anything. Today a reader cannot tell which is which.

**There is already a precedent for a tuning knob in config, and it is in the wrong file.**
`.atlas/policy.json` carries `nearDup.claimNormThreshold`. `policy.json` is admin-owned governance; a
near-duplicate threshold is tuning. The loader (`adapter-io/src/policy.ts:130`) is total and fail-closed,
which is the pattern this ADR reuses.

**The evidence on prompting.** Three results bear directly on the prompt contract D5 must pin:

1. _LLM Abstention Can Be a Prompt Artifact, in Addition to Genuine Uncertainty_ (arXiv 2507.16199) — an
   abstention signal is not necessarily faithful to the model's internal uncertainty; part of it is an
   artifact of phrasing. **This is load-bearing for Atlas twice over.** It means a refusal _rate_ is partly a
   property of the prompt, so it may not be read as a quality signal unless the prompt is held fixed and
   identified. And it independently _validates_ the architecture: because admission is mechanical and GEN-4d
   discards self-declaration, Atlas does not depend on the abstention being faithful. Most extraction systems
   do.
2. _Grounded Knowledge Graph Extraction via LLMs: An Anchor-Constrained Framework with Provenance Tracking_
   (MDPI Computers 15(3):178) — present discovered anchors as a **closed vocabulary** and require explicit
   grounding per element, rather than letting the model generate freely. Atlas's `StructRef` already **is**
   that closed vocabulary; the consequence for the prompt is that the anchor is a _constraint_, not context.
3. _Learning Fine-Grained Grounded Citations for Attributed Large Language Models_ (arXiv 2408.04568) —
   requiring the model to extract the **supporting quote** from the source measurably reduces hallucination.
   Atlas has no carrier for one: a grounding entry is `{ anchor, path }`. See §"What the owner still has to
   ratify".

Additionally, _Context-faithful Prompting_ (arXiv 2303.11315) names the exact failure mode here — a model
asserting what it knows about a well-known library instead of what the shown bytes say.

## Decision 1 — the model is an operator-supplied command, and Atlas ships no vendor

The concrete `ModelClient` is a **subprocess adapter**: `execFileSync`, **no shell**, argv never
interpolated, stdout/stderr captured — mirroring the `run-git.ts:25` seam the repo already proved.

- **It is the only option that honours the frozen synchronous contract.** `ModelClient.complete` is
  synchronous. Any HTTP or SDK adapter would require amending a frozen signature or blocking on
  `Atomics.wait`. Amending a frozen contract for implementation convenience is what the constitution exists
  to prevent.
- **Atlas adds no dependency and never handles a credential.** In a repo that ships a credential scrubber,
  never being in the credential path is a security property, not hygiene.
- **Atlas's source names no vendor.** Any provider-agnostic CLI, a local runtime, or a two-line `curl`
  wrapper against an OpenAI-compatible endpoint satisfies it equally. Substitution is a config edit, not a
  code change.

Three rules make the adapter's verdicts unambiguous. The first two were in this ADR from the start; the
third was implemented and argued only in the source, which is how a tradeoff becomes invisible.

- **Empty stdout ⇒ abstention.** No JSON, no parser, no parse-failure mode. This matches GEN-12: abstention
  is a valid, unpressured outcome.
- **Non-zero exit ⇒ error, never abstention.** A broken configuration MUST NOT be able to present itself as
  "this repo has no facts". That confusion is the fail-silent shape this repo has already been bitten by
  (#118, #123, #130), and it is the one failure that would invalidate a whole genesis run invisibly.
- **A clean exit that stopped reading the prompt ⇒ the claim is TAKEN, and it may rest on a prompt the model
  never fully received.** `execFileSync` throws `EPIPE` on the failed _write_ when the child exits before
  Node finishes writing stdin, while carrying the child's real stdout and `status: 0`; that stdout is
  returned rather than reported as a hard failure (`llm.ts:salvageEarlyExit`). Prompts are whole source
  subtrees, so the write is long and the window is wide — this surfaced as a load-dependent flake in the
  suite. **The cost is stated rather than dressed up as correctness:** the child provably did not read the
  whole prompt (the suite's green case salvages a claim from a command that reads ZERO bytes of an 8 MiB
  prompt), so a claim may be produced from a partially delivered prompt. That is admissible for one reason
  and one only — **the admission gate is the backstop.** A proposer returns a PROPOSAL, and GEN-4/12 re-derive
  it mechanically against the anchored bytes, so a claim built on an unread prefix fails exactly as any other
  unfounded claim does. Refusing instead would trade a gate-catchable proposal for a hard run failure.

## Decision 2 — every constant is configurable; invariants are protected by visibility, not prohibition

**Every tuning constant becomes configurable. There is no exempt set.**

The distinction between a spec-pinned value and a spec-declared default is **not** whether an operator may
change it. It is what the system does when they do:

|           | changing a **default** | changing a **spec-pinned** value                                                                               |
| --------- | ---------------------- | -------------------------------------------------------------------------------------------------------------- |
| permitted | yes                    | **yes**                                                                                                        |
| effect    | none                   | the run **records the deviation** in its provenance, and `atlas doctor` reports it as running off-constitution |

The rejected alternative was to forbid overriding a spec-pinned constant. It was rejected because the
property this system sells is that it _cannot confidently lie_, not that it _cannot be driven_. A silent
override is the defect; a loud one is a legitimate experiment — and the benchmark programme (#95) requires
sweeping exactly these knobs, so a hard prohibition would make Atlas unmeasurable against itself.

**Two configuration scopes, and the second exists only for safety:**

- `.atlas/config.json` — the tuning knobs. Travels with the repo, which is what A-16 requires of everything
  else. **Numbers and enums only; it can never name an executable.**
- `~/.config/atlas/model.json` (overridable by `$ATLAS_MODEL_CONFIG`) — the model command, and nothing else.
  It is **operator-scoped and never read from the repo**, because a command sourced from a committed file
  means cloning a hostile repository and running `atlas mine` executes arbitrary code. Env-scoped operator
  settings are already the repo's idiom (`ATLAS_ACTOR`, `ATLAS_RATIFY_TOKEN` — `compose.ts:158,163`).

Shape, with `args` as an **array** so nothing is ever shell-split:

```json
{ "roles": { "propose": { "cmd": "…", "args": ["…"] } }, "timeoutMs": 60000, "costCapNum": 5, "costCapDen": 100 }
```

The cost cap is an integer PAIR, not `0.05`, and the integer rule below is why. This example originally read
`"costCap": 0.05`, and the code shipped that as its default — a rule stated and violated within six lines of
each other. A decimal `costCap` is now REFUSED (naming the pair that replaces it) rather than ignored, since
ignoring it would leave an operator believing a ceiling is in force.

`roles` is keyed by the mechanism that issues the call. Only `propose` is populated: `refuter` requires a
different (small) model per GEN-13f, so the role key exists from the start and adding it later is a config
entry plus a template file, never a refactor. **No empty role is shipped** — the shape accommodates them, the
delivery does not fabricate them.

**ABSENT and MALFORMED are different answers, and this deliberately inverts `loadPolicy`.** (This paragraph
said the opposite — "absent _or_ malformed ⇒ the fail-closed default proposer" — through two amendments, and
it never matched the delivered code.)

- **ABSENT ⇒ `null`, a STATE.** No model is wired; `mine` runs the fail-closed default proposer, abstains at
  every site and SAYS so. Zero-config runs, and nobody has to write a file to use Atlas.
- **MALFORMED ⇒ THROW, an ERROR.** Never a silent fall-back.

`loadPolicy` is total and fails CLOSED to a _denying_ default because a broken policy that authorizes nothing
is safe. Here the safety direction is the opposite: a broken model config degrading to "no model" would
abstain at every site and report a clean, empty run — **indistinguishable from a repository that genuinely
holds no groundable fact.** That is the same fail-silent shape Decision 1 refuses for a non-zero exit, and
refusing it at the config layer is the same decision made one layer earlier.

**`atlas config`** prints every knob with its value, its **source** (default / repo / operator), and whether
it is spec-pinned. Discovering what is tunable must not require reading the source. _(DECIDED, NOT BUILT —
finding 4 in §"What this ADR does NOT close".)_

**Every knob is an INTEGER, and the canonicalizer is why.** `kernel/canonical.ts:48` forbids a non-integer
number outright — it throws. So a config carrying `0.85` could not be canonicalized, could not reach the
sealed `id` seam, and could not be hashed into provenance at all. A ratio is therefore expressed as a
numerator/denominator pair, which is not a workaround: `rank.ts` already computes the damping in exact
integer fixed-point precisely so a run is byte-identical across machines. The config shape follows the
implementation instead of fighting it.

> **The first delivery of this ADR broke this rule in its own shipped default, and the fix is recorded here
> rather than quietly applied.** `model-config.ts` shipped `PROVISIONAL_COST_CAP = 0.05` and a validator that
> accepted any positive finite number. Measured against the built module: `id({ roles, timeoutMs: 60000,
costCap: 0.05 })` threw `canonical-form violation: floats forbidden`, while the same object with an integer
> cap hashed fine. So "the resolved configuration is hashed into the run's provenance" was not merely
> unimplemented — it was **unimplementable for the value Atlas shipped by default**. The cap is now the exact
> pair `costCapNum = 5` / `costCapDen = 100` (`5/100 === 0.05` in IEEE-754, so no behaviour moved), a
> fractional knob is REFUSED rather than coerced, and the resolved config canonicalizes. It stays class **C —
> provisional**: changing how a number is written earns no better justification than it had.
>
> The decimal remains reachable as a **derived**, non-enumerable property, because the frozen `LlmBudget`
> speaks decimals. The pair is what is HASHED; the decimal is what is SPENT.

**Consequence for determinism, and it strengthens the claim.** GEN-1 requires S0+S1 to reproduce a
byte-identical skeleton and ranking at a pinned commit. With the ranking knobs configurable, two operators
with different configs would diverge on the same commit. Therefore **the resolved configuration is hashed
into the run's provenance**, and the guarantee is stated as _byte-identical for the same rev **and** the same
config hash_ — which is how Nix and Bazel state reproducibility. This is stronger than the status quo, where
the guarantee is implicit because the numbers are hidden in source.

> **This paragraph originally named `DAMPING` as the worked example, and that was wrong in a way worth
> recording.** `DAMPING = 0.85` had **zero `src` readers**: `pprScores` computed with a private `D_NUM`/`D_DEN`
> pair, and the only assertion anywhere was `expect(DAMPING).toBe(0.85)`, which pinned the decorative copy.
> Exposing `DAMPING` through config would therefore have changed **nothing** in the ranking — the promise
> would have been a lie by omission. Measured before the fix: setting the real damping to `0.50` passed
> **780 tests** (genesis 140, e2e + adapter-io 640). A guard reporting green where it should report red is
> one of the two conditions that stops the line, so it was fixed here rather than filed: the integer pair is
> now the single declaration, the decimal is derived from it, and `ppr-damping-teeth.test.ts` pins the
> ranking OUTPUT. The same mutation is now red — and the pre-existing golden `SCN-GEN-11b-1` recovered its
> teeth as a side effect, having been vacuous for the same reason.

`nearDup.claimNormThreshold` migrates from `policy.json` to `config.json`: it is tuning, and it should not
require admin to adjust. _(DECIDED, NOT BUILT — finding 4 in §"What this ADR does NOT close". It is still
read from `policy.json` today.)_

## Decision 3 — the prompt is a versioned artifact with per-clause justification, not a string literal

The prompt lives at `packages/adapter-io/prompts/propose.md` — the adapter's own asset, next to the only
module that reads it, and pinned there by `adapter-io/test/prompt.test.ts` — versioned, diffable, reviewable,
and **digested** by the sealed kernel `id`. (This ADR said `packages/genesis/prompts/` in two places; the
delivered location is the correct one and the ADR was stale.) The digest is over the template text AS READ,
comment included and **NFC-normalized** by the canonicalizer — not byte-for-byte over the file: two templates
differing only in Unicode normalization share a digest. That is the ratified price of NFC in the canonical
preimage, and it is stated so nobody reads more into the digest than it carries.

The prompt is overridable by config, and an override is **recorded, never silent**. _(The digest is computed
and carried on the `PromptFactory` today; nothing yet WRITES it into a run's provenance record — finding 4 in
§"What this ADR does NOT close".)_

The prompt carries GEN-12 (abstention is valid), GEN-4d (no self-declaration), GEN-6 (a mined signal is not a
fact) and door-2 (non-obvious ∧ actionable, not a restated signature). A prompt that is freely editable _and_
invisible turns those invariants into suggestions. Recording the hash is what keeps it a default rather than
an assumption.

Every clause of the prompt is traceable to an invariant or to a cited result. The load-bearing ones:

- **The anchored subtree is presented as a closed vocabulary; the claim must derive from the shown bytes**
  (MDPI 15(3):178; arXiv 2303.11315). The named failure is asserting library knowledge over shown code.
- **`Candidate.signals` is NOT passed to the model.** GEN-6 forbids churn/SZZ from minting a fact. Withholding
  the signals makes that violation _structurally impossible_ rather than instructed against — the signals
  already did their work in ranking, and showing them can only contaminate.
- **Abstention is explicitly valued, not merely permitted** (arXiv 2604.03904). Combined with GEN-4d, the
  model is never asked for a confidence and its self-declaration is never read.
- **No chain-of-thought is persisted** (GEN-12: scratch only).

One placeholder substitution. No templating engine.

## Decision 4 — a default is not shipped until it is justified

Configurability does not discharge the obligation to have a good default; it makes it easier to hide a bad
one. The default is the product for nearly everyone who runs Atlas.

Every constant is therefore classified by **what justifies its default**, and the classification is recorded
next to the value:

| class               | justification                                         | examples                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A — literature**  | a citation                                            | `DAMPING_NUM/DAMPING_DEN = 85/100` (the canonical PageRank damping, Brin & Page 1998)                                                                                                                                                                                                                                                                                                                       |
| **B — spec-pinned** | the ratified invariant                                | `MARGINAL_WINDOW=20` / `MARGINAL_MIN_ADMITS=4` (GEN-2); `DEFAULT_SAMPLES=1`, `DEFAULT_CEGIS_K=1` (GEN-13); `MAX_HOPS=2` and `K=8` (RETR-11, `atlas-retrieval.md:128-132`, RATIFIED at `invariant-register.md:216`); `OWN_CAP=1500` / `PACK_CAP=2000` / `POKE_CAP=150` (RETR-7/12, RATIFIED at `invariant-register.md:212,217`, with a golden asserting `own == 1500` "not `~1.6K`" at `goldens-ret.md:344`) |
| **C — unexamined**  | **none yet**                                          | `PPR_ITERATIONS=64`, `HOTSPOT_MIN_CHURN=2`, `COUPLING_MIN_SUPPORT=2`, `MIN_COMMITS=2`, `BLAME_CONCENTRATION_MAX=0.9`, `INTERVIEW_CAP=20`, `EDGE_CAP=8`, `FINER_CAP=16`, `MANIFEST_CAP=12`, `LOGBOOK_SECTION_CAP=280`, `DECAY_PER_WAVE=0.5`, `NEAR_ZERO_FRECENCY=0.1`, `GIT_MAX_ATTEMPTS=4`, `MAX_CAS_BYTES=64MiB`                                                                                           |
| **N — not a knob**  | a stated invariant or a format version, not a tunable | `PUSH_GRANTS_REQUIRED=0`, `RECONCILE_MODEL_CALLS=0`, `ASSIGN_MODEL_CALLS=0`, `OKF_VERSION=1`, `FP=1e9`                                                                                                                                                                                                                                                                                                      |

**This table was wrong in its first draft, and the correction is the point of the exercise.** It originally
placed `K=8`, `MAX_HOPS=2` and `OWN_CAP=1500` in class C. All three were already through the S0 ratification
gate: `atlas-retrieval.md:128-132` states `maxHops = 2` and `K = 8` in MUST clauses, `invariant-register.md`
marks RETR-7/11/12 **RATIFIED** with those exact numbers as acceptance criteria, and `goldens-ret.md:344`
carries a golden with teeth against the `own` cap drifting off `1500`. Writing the rule is not the same as
applying it; the classification is only worth anything done against the register, file by file.

**Two constants resist all four classes, and the rubric should grow rather than mislabel them.**
`MAX_ATTEMPTS=64` (`sidecar-commit.ts:42`) is justified by an in-repo stress measurement recorded in its own
comment — no external citation (not A), no ratified doc clause (not B), but demonstrably not unexamined.
`RETAINED_GENERATIONS=4` is stronger still: the code states its **correctness** depends on the exact value,
and that boundary is enforced by unit tests rather than by any `docs/` artifact. Both are provisionally
recorded as C with a note; a fifth class (**test-pinned / measured-in-repo**) is the honest fix and is left
for the classification WP rather than invented here.

A class-C value is labelled **provisional**, never "default", until measured. Its measurement comes from the
genesis run over Atlas itself — which is what the calibration stage is for, and it closes the loop: the
dogfood run produces the evidence that fixes the defaults.

**A knob whose default nobody can justify is a finding**: either it does not matter, and it should not be a
knob, or it does, and it must be measured. `PPR_ITERATIONS = 64` is already suspect under this rule — the
standard practice in power iteration is to iterate to a residual tolerance, not a fixed count, so a fixed
count is either wasteful or insufficient depending on the repository, and neither is currently observable.

## What this ADR does NOT close

Four findings. Three surfaced while measuring D5; the fourth is the gap between what Decision 2 DECIDES and
what the delivery actually SHIPS. None is closed here; each is recorded so it is found by reading rather than
by rediscovery.

1. **The GEN-13 escalation ladder is planned and never executed.** `escalate()` has zero production
   consumers, and `createSiteProposer` structurally cannot run an escalated site (one call, golden-pinned).
   The `check-synthesis` path is a CEGIS state machine — synthesize → compile → HOLDS-on-current-code →
   TEETH-flip-on-a-mutant, with a bounded refine (`K≤1`) and **two distinct terminals** (`drop` for
   un-repairable and `drop` for vacuous, which must not be conflated or the anti-vacuity clause becomes
   decoration). It needs a sibling seam, and `INV-ADAPTER-11` states flatly that `SiteProposer.propose` is
   _the only place a model is invoked in the whole system_. That invariant must be amended, or re-read as
   scoped to the cheap pass, before escalation can land. When it does, the modelling idiom is already in the
   repo: `align.ts:69` models its ratify router as a closed edge set so that _"no auto-promote transition is
   expressible"_ — an illegal transition should not typecheck.
2. **A `T0` candidate marked `certain` receives the cheap pass.** `decideMechanisms` returns `[]` on
   `!(highValue ∧ uncertain)` **before** it ever reads the tier, so `runsRefuter(tier)` is unreachable unless
   both legs already hold. GEN-13 says high-value is _"(tier/blast)"_, implying `T0 ⇒ highValue`, but
   `highValue` arrives from an injected `SignalOracle` and **nothing enforces the implication** — the binding
   exists in prose, not in mechanism. This is the ARCH-9 shape (a seam that reads as a closure). It is
   **dormant**, because nothing consumes `escalate()`. The open question is whether `T0` forces escalation or
   a certain `T0` may pass cheap; it is an owner decision, and it belongs to the escalation work.
3. **`EscalationDecision` overloads the word "tier" inside a single type.** `readonly tier: Tier` is the
   _governance_ class (`T0`/`T1`/`T2`), while the same interface's doc comment uses "base tier" for the
   _cost_ level. They are independent, and conflating them is precisely how a highest-criticality site gets
   read as cheap. Prose in this repo should say **cheap pass / escalated pass** for cost, and reserve "tier"
   for the governance class.
4. **DECISION 2'S TUNING HALF IS DECIDED AND NOT BUILT.** The decision stands as written; the DELIVERY is
   partial, and the ADR presented the whole of it as done. What ships is the _second_ scope only — the
   operator-scoped `~/.config/atlas/model.json` (`adapter-io/src/model-config.ts`), whose knobs are now
   integers and whose resolved value canonicalizes. What does **not** exist, measured on this branch:
   - **`.atlas/config.json`** — no loader, no schema, no reader. The ~40 tuning constants named in §Context
     are still hardcoded, so "every constant is configurable" is a decision, not a delivered property.
   - **`atlas config`** — `grep -n "if (command === " packages/cli/src/cli.ts` returns exactly `mine`,
     `doctor` and `node`. There is no command that prints a knob, its source, or its spec-pinned status.
   - **the `nearDup.claimNormThreshold` migration** — it is still read from `.atlas/policy.json` by
     `adapter-io/src/policy.ts`. Nothing moved.
   - **the provenance hash of the resolved configuration.** The resolved model config CAN now reach the
     sealed `id` seam (that is what the integer pair bought, and it is asserted by
     `adapter-io/test/model-config.test.ts`), and the prompt template's digest is computed on every
     `PromptFactory` — but **nothing writes either into a run record**. So the strengthened GEN-1 guarantee
     ("byte-identical for the same rev _and_ the same config hash") is not yet observable by anyone.
     Consequence to keep in view: until `.atlas/config.json` exists, the deviation-recording behaviour in the
     Decision 2 table — the loud override that makes a spec-pinned change legitimate — has nothing to record,
     because there is no supported way to override anything.

## What the owner still has to ratify

Neither item is applied by this ADR.

1. **The batch seam (a frozen-contract amendment).** The cheap pass is strictly serial: `execFileSync`
   blocks, so ~200 sites run one after another. The constraint is the synchronous contract, not the adapter
   — every adapter behind a synchronous port is serial. The spec supplies the fix: GEN-2's marginal-value
   stop is a **trailing window of 20**, so the window _is_ the natural unit of parallelism. A seam shaped
   `complete(prompts[]) → results[]` keeps the stop's sequential admit-rate feedback per window while letting
   the adapter run the window concurrently — roughly an order of magnitude of wall-clock on the cheap pass,
   with no change to "one bounded call per site". It amends `ModelClient` and the `expect(rec.calls).toBe(1)`
   golden, so it is a ratification, not a WP decision.
2. **An additive `quote` on a grounding entry.** The strongest evidence-backed lever available (arXiv
   2408.04568) is to require the model to extract the supporting span. A grounding entry carries
   `{ anchor, path }` and has nowhere to put one. The proposal is an **optional additive** field, precedented
   by `cost?` / `resumeToken?` on `GenesisReport`. Claimed benefits are hallucination reduction at proposal
   time and legibility for a human reading the node. **No drift-precision benefit is claimed** — that would
   need measuring, and the "false drift on reformat" family (#125) is exactly where this repo has overclaimed
   before.

## Alternatives rejected

- **An HTTP client against the OpenAI-compatible shape.** Rejected: it is the de-facto standard, not a
  standard, so "vendor-neutral" would in practice mean "OpenAI-shaped or proxied" — Anthropic's own API is
  not that shape. It would also put Atlas in the credential path and force a frozen-signature amendment for
  async, buying nothing the subprocess does not already give.
- **An SDK or a unified-provider library.** Rejected as over-engineering on measured grounds: `ModelClient`
  is already the vendor-neutral port such libraries provide. Adding one would be an abstraction over an
  abstraction, plus a dependency, plus a vendor list in `package.json`.
- **Shipping a default model.** Rejected: any default names a vendor in Atlas's source. Fail-closed
  abstention is already the tested behaviour and is the honest zero-config state.
- **Forbidding overrides of spec-pinned constants.** Rejected — see Decision 2. Visibility, not prohibition.
- **Leaving the constants hardcoded and calling them "the defaults".** Rejected: it conflates _studied_ with
  _unexamined_, and it makes the benchmark measure a point instead of a curve.
