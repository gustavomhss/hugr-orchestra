# Measured results — the Genesis fact pipeline

Every number in this file links to the committed artifact that derives it. A figure whose
derivation you cannot re-open does not belong here. Method: [`docs/design/95-benchmark-methodology.md`](docs/design/95-benchmark-methodology.md).

## What is measured here, and what is not

**Scope: the Genesis protocol and the governed doors it drives** — not Atlas as a whole.
Genesis (`packages/genesis`) is Atlas's Layer-8 **bootstrap**: it seeds a knowledge graph onto an
existing repo — deterministic skeleton, one rationed LLM entry point, then a hand-off. Everything
below measures **how a fact gets in and whether it stays true**: mining and proposing (Genesis),
proving and admitting (`admit-harness` / `verify-fact` / `verify-count`, Genesis), the governed
emit doors and re-proof (`packages/adapter-io`), and the dependency projection
(`derive-relations`, `packages/cli`).

**A second, separate scope — §7, the memory ring.** It is NOT part of the Genesis pipeline and is
not aggregated with §§1–6 into any combined figure. It is on this page because it is measured the same
way — planted violations, controls that fail the axis, mutations against the shipped binary — and
because keeping it in a private probe would leave the project's only other measured subsystem
undisclosed. Read the two scopes separately; there is no headline that spans them.

**Not measured here:** retrieval quality, the versioned store and its travel-by-reproof, the
governance ring, the MCP and CLI transports _as surfaces_ (two CLI commands — `derive-relations` in §2
and `test-vacuity` in §6 — are used as measurement instruments; their ergonomics, parity and transport
behaviour are not what is scored). §7 drives its own CLI door end to end, but scores the gates behind it,
never the surface. Also not measured: the authoring planners. Those are Atlas the system;
§§1–6 are about the trustworthiness of what Genesis puts into it. Do not read these numbers as
a score for Atlas as a product.

## The two seals

Facts enter under one of two seals, and they are measured differently:

| seal                       | what it means                                                                      | how it is measured                                                                                           |
| -------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **`proven`**               | a mechanical witness exists; the admission gate _refuses_ anything it cannot prove | judge-free mutation bench against an independent `tsc` oracle — no LLM anywhere in the label or scoring path |
| **`justified`** (advisory) | LLM-mined prose, grounded in cited bytes, never marked proven                      | blind LLM panel adjudication + planted subject-tests + an out-of-instrument fourth seat                      |

The design bet: _grow the proven tier, keep the advisory tier honest about being advisory._

---

## 1 — The proven tier: false-admission (the headline)

Planted-mutation bench: each FALSE claim is one edit-distance-1 mutation of a TRUE base;
the label comes from an independent `ts.createProgram` oracle, never from the gate under test.
Operating build state (`tsc -b` before `scip-typescript index`).
Artifact: [`harness/probes/adjudicate/calibration-report.a4-planted.md`](harness/probes/adjudicate/calibration-report.a4-planted.md) (+ `.json`).

| arm          | false admits   | recall (true, groundable) |
| ------------ | -------------- | ------------------------- |
| `dependency` | **0 / 23,702** | 163/163 = 100%            |
| `count`      | **0 / 163**    | 163/163 = 100%            |
| `negation`   | **0 / 163**    | 428/1200 = 35.7%          |

- Figures are reported under **two named definitions**. Definition A is the gate's own
  documented predicate (witnessed reference-existence): 0-false on all three arms.
  Definition B is the bench's stricter call-only label: 318 mismatch rows, **all 318
  adjudicated line-by-line — 0 genuine unsoundness** (every one is a real SCIP reference
  witness that is not a call). Both definitions and the full adjudication are in the artifact.
- Negation recall is the price of the 0-false floor: the gate proves absence only where a
  mechanical escape analysis closes the world, and abstains elsewhere.
- **The negation zero is earned, not vacuous** — re-measured for this page on a fresh operating
  index at current master: blinding one leg of the byte-identical shipped door (gate (c),
  `reverseCallers` forced to `[]`) drives negation's false-admit from **0.00% to 12.25%**. It is
  not guaranteed to rise: rows already abstained by the upstream gates abstain identically under
  both doors, so this would legitimately measure 0 — and fail — if gate (c) were not the leg
  carrying the soundness. The older diagnostic (switching off the #99 opaque gate) measures 0 on
  this build state and is _not_ the witness here; it is load-bearing only on the dist-absent
  misbuild, where it false-admits 132/163. Both are printed. That re-run also measures a larger
  planted pool than the table above (204 FALSE rows vs. the artifact's 163) — the door is 0-false
  on both. Artifact:
  [`negation-nonvacuity-recheck.json`](harness/probes/adjudicate/negation-nonvacuity-recheck.json).
- **What the `dependency` / `count` / `relation` zeros range over** (this does _not_ apply to
  negation, which has no advisory tier): they are the **proven-sealed** admits. Since the
  abstain⇒justified inversion, the `justified` advisory tier deliberately admits a grounded claim
  the oracle cannot refute — that is the two-tier design, not a leak — so the bench's _raw_ per-arm
  admit rates on those three arms are near-total and carry no soundness claim. Soundness is
  asserted only where the door stamped `proven`.
- The legacy `relation` arm states **no truth predicate** (it admits all 452/452 by design)
  and is not counted as sound. It is superseded by the `depends-on` projection below.

## 2 — The proven tier vs. an established tool (deterministic, $0)

`atlas derive-relations` (proven `depends-on`, witnessed SCIP references) vs. **madge 6.1.0**
on a third-party repo, zod v3.23.8. Both sides mechanical; zero LLM tokens.
Artifact: [`harness/probes/adjudicate/xrepo-zod-sota-comparator.json`](harness/probes/adjudicate/xrepo-zod-sota-comparator.json).

|              | edges                                                                                                                           |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Atlas proven | 231                                                                                                                             |
| madge        | 129                                                                                                                             |
| intersection | **129 — Atlas misses nothing madge finds (100% recall vs. madge)**                                                              |
| Atlas-only   | 102 — semantic symbol→definition edges through re-export barrels, which an import-statement graph structurally cannot represent |

The definitional gap (semantic vs. syntactic) is the finding. Caveat as recorded in the
artifact: the barrel-piercing mechanism was verified and sampled; not all 102 extra edges
were individually hand-traced.

## 3 — A1: precision of the advisory tier (LLM-judged)

Frozen v3 propose prompt, capture/replay, proposer `claude-sonnet-5`, three blind
`claude-sonnet-5` judges, majority-of-3, full grid, no gaps.

| run                                | precision           | 95% CI (Wilson) | artifact                                                                         |
| ---------------------------------- | ------------------- | --------------- | -------------------------------------------------------------------------------- |
| Atlas-on-Atlas, 657 facts          | **93.8%** (616/657) | [91.6, 95.4]    | [`a1-dogfood-fullrepo.json`](harness/probes/adjudicate/a1-dogfood-fullrepo.json) |
| Cross-repo (zod v3.23.8), 76 facts | **86.8%** (66/76)   | [77.4, 92.7]    | [`xrepo-zod-a1.json`](harness/probes/adjudicate/xrepo-zod-a1.json)               |

- The ~7-point drop off home turf is real proposer hallucination, not judge noise
  (67/76 unanimous; two FALSEs mechanically verified — one inverted boolean, one test that
  does not exist). **86.8% is the more externally valid figure.**
- Same-family caveat, stated as a limit: proposer and panel share a model family, so the
  grid alone measures agreement, not ratified precision. Two independent checks bound it:
  - **Out-of-instrument fourth seat** (83-item systematic sample of the home run): panel
    precision **98.7%** (75/76); the single over-credit is a genuinely false fact the bench
    then caught mechanically; the other 5 discordances are all in the conservative
    direction (the panel under-credits truth). Artifact:
    [`gold-seat4.json`](harness/probes/adjudicate/gold-seat4.json).
  - **Judge-free planted subject-test** (10 true + 10 planted-false): false-admit 1/10,
    Wilson [0.02, 0.40]; 0/10 true facts rejected. Artifact:
    [`calibration-report.a1-subject.md`](harness/probes/adjudicate/calibration-report.a1-subject.md).
- Cheap free-tier LLM judges were tried and **rejected as instruments**: mistral scored
  κ ≈ −0.02 against the fourth seat (worse than chance); another rubber-stamps ~100%.
  Recorded in `gold-seat4.json` — a cross-family panel is not a matter of any second model,
  it has to be a competent one.

## 4 — A2: staleness (does the graph notice the code moved?)

Perturb→detect over labeled byte pairs, driven through the shipped oracle.
Instruments: [`harness/probes/a2-staleness.mjs`](harness/probes/a2-staleness.mjs),
teeth: [`harness/probes/a2-staleness-teeth.mjs`](harness/probes/a2-staleness-teeth.mjs).

- Invalidating edits caught: **6/6**; preserving edits kept fresh: **4/4** (0 false-stale).
- The teeth probe keeps this honest: the 6/6 invalidating rows are near-tautological (an
  "any byte changed" dumb checker also wins them); the discriminating power is the four
  **preserving** rows — import added above, header spacing, sibling-unit edit, Unicode
  normalization — where dumb checkers false-alarm and the oracle does not.
- Deeper tier: `A2r` re-proof ([`a2r-reproof.mjs`](harness/probes/a2r-reproof.mjs)) drives
  the shipped `reverifyFact` over a scratch worktree with real edits and a fresh build —
  staleness answered by _re-proof_, not by timestamp.

## 5 — A3: cost

Metered sidecar, `claude-sonnet-5`, prompt-cache-assisted, per-site advisory mining.
Artifact: [`harness/probes/a3-cost-sidecar.jsonl`](harness/probes/a3-cost-sidecar.jsonl).

- Measured: 10 metered calls, **$0.96 total, ≈$0.10/site**. This is the only committed cost
  artifact; no larger-run cost artifact exists yet.
- The proven tier and the graph build cost **0 LLM tokens** — indexing is SCIP +
  deterministic projection; proofs are mechanical.

## 6 — How far can the advisory tier shrink?

Shape census of all 76 cross-repo advisory facts (single-classifier estimate, recorded as
such): **22/76 (~29%)** are structural — 21 needing a new sound shape, 1 already provable
by an existing one; **54/76 (~71%)** are irreducibly semantic. The largest structural
cluster — test-vacuity, ~9 claims across four idioms — is now **substantially converted by two shapes**:
`assertion-only-in-catch` (~2 of the 9, measured in
[`calibration-report.a4-test-vacuity.md`](harness/probes/adjudicate/calibration-report.a4-test-vacuity.md))
and `no-assertion-in-test` (~3). The other two idioms are **not getting shapes of their own**, for reasons
that are findings rather than backlog:

- `unasserted-parse-call` (~2) is **subsumed** — a discarded call with no wrapping assertion already yields
  `no-assertion-in-test`. And the claims themselves say the test _does_ check something ("it only checks
  that parsing does not throw"), so a shape asserting vacuity over it would publish a false characterisation.
- `commented-out-tests` (~2) is **half subsumed** (the one executing no-op test is proven by
  `no-assertion-in-test`) and half **outside the identity model**: a commented-out test has no AST node, so
  it cannot anchor to the family's `(unitKey, testName)` identity without fabricating a name.

So the census's largest cluster needed two shapes, not four. Coverage is asserted over faithful
reproductions of the claim bodies run through the shipped oracle — not a re-run against zod. Artifact:
[`test-vacuity-idiom-coverage.json`](harness/probes/adjudicate/test-vacuity-idiom-coverage.json).
Artifact: [`xrepo-zod-shape-census.json`](harness/probes/adjudicate/xrepo-zod-shape-census.json).

---

## 7 — The memory ring (M-axis): the gates, on the shipped binary

**A different subsystem from §§1–6**, measured on its own. `$0` — no model in the loop.
Instrument: [`harness/probes/m1-memory-ring.mjs`](harness/probes/m1-memory-ring.mjs). It runs
`packages/cli/dist/src/bin.js` as a child process in a throwaway git repo — real store, real disk, real
`gitleaks` on `PATH` — and reads only what a user reads: the exit code and the rendered verdict.

**Why not the unit suites.** `packages/*/test` proves each memory piece against injected fakes, which is
how the pre-write scanner shipped refusing _every_ write (#290): every `memory-emit` test injected a fake
scanner, so the one argv the product actually runs was executed by nothing. Re-running those suites would
have reproduced the blind spot at greater cost.

| axis | what it decides                                         | result | its control                                  |
| ---- | ------------------------------------------------------- | ------ | -------------------------------------------- |
| M1   | a memory written by one process is read back by another | 3/3    | recall _before_ any write answers empty      |
| M2   | the 7-gate write chain, per named refusal               | 14/14  | **a clean record is ADMITTED**               |
| M3   | MEM-1 owner scoping (no cross-seat leak)                | 3/3    | the two seats hold **different** counts      |
| M4   | MEM-4 consultable-not-injected                          | 4/4    | the header counter tracks writes at all      |
| M5   | type discipline at the JSON boundary                    | 7/7    | the same shape, correctly typed, is admitted |

**8/8 planted violations refused BY NAME**, each at exit 2. The oracle is not "it refused" — a door that
answered `undetermined-kind` to everything would refuse 100% of them and be wrong on seven.

**The controls are load-bearing, not decoration.** Without M2's, the axis is satisfied by a door that
refuses every write — which is the #290 defect scoring perfectly on its own benchmark. Without M3's
asymmetric counts, "no leak" is unfalsifiable, because 1 vs 1 leaks invisibly.

### Mutations, against the shipped `dist`

| mutation                    | outcome                                             |
| --------------------------- | --------------------------------------------------- |
| MEM-1 owner scoping removed | **killed** — M3 3/3 → 0/3                           |
| MEM-9 scanner gate removed  | **killed** — M2 `scanner-blocked` red               |
| MEM-5 type loop removed     | **killed** — M2 `template-invalid` red              |
| MEM-4 kind filter removed   | **survives this surface**, killed at the door level |

The last row is reported in both directions rather than dropped once a killer was found. The only CLI door
onto the ranked slab renders `injected` alone, and the leak lands in `evicted`; `projectSlab()` exposes it,
so the mutant dies against `packages/adapter-io/test/memory-read-kind-filter.test.ts`. An oracle's reach is
a property of the surface it runs through.

### Two defects the mutation pass found in the probe itself

Recorded because they are the reason to trust the rest of the numbers, not despite it. Neither would have
survived a mutation pass; neither was going to be caught by reading the code.

1. **A broken oracle.** The gate-name check tested the whole of stdout — and every refusal's `next:` line
   _enumerates_ all nine gate names as guidance. It reported `named=true` on writes that **exited 0**.
2. **A vacuous assertion.** M4 asserted a task id was absent from the header's stdout. It passed under a
   mutation that injected every kind, because the header renders a _count_ and never entry text.

### What this axis does NOT measure

Retrieval quality, ranking usefulness, the MCP transport (CLI only), the Awareness/Orientation slab
_content_ (their doors are exercised for liveness, not for correctness of what they derive), and anything
about how well the memory serves a real session. It scores whether the declared gates hold on the shipped
binary — nothing about whether the memory is any good.

## Honest limits

Stated as limits, not footnotes. In order of how much they matter:

1. **The fourth seat's provenance is recorded UNRESOLVED** (human or strong non-Sonnet
   model). It is out-of-instrument and blind either way, which breaks same-family
   circularity — but until it is named, the 98.7% corroboration is weaker than it looks.
2. **The cross-repo number has no fourth seat.** The most externally valid figure (86.8%)
   currently has the weakest corroboration chain.
3. **n = 1 foreign repo** (zod, one tag), TypeScript only. No cross-language evidence.
4. **The subject-test is n = 20.** Its CI is honest and wide.
5. **Negation recall is build-state sensitive** (8× swing dist-absent vs. dist-form). The
   trap and the exact recipe are documented in the A4 artifact; both states are reported.
6. **A3 is measured on 10 sites on one model.** Full-repo cost is extrapolation.
7. **§7 has no external comparator and no cross-repo leg.** Every M-axis figure is measured on
   throwaway repositories this project creates; nothing corroborates it against another
   memory implementation, and unlike §2 there is no deterministic third-party tool to be a superset of.
8. **§7's M2 covers 8 of the 9 declared refusals.** `kind-conflation` is structurally unreachable from
   that door — gate 1 refuses the only entries that could reach it — so it is asserted UNREACHABLE
   rather than planted. That is recorded as a property, not scored as a pass.
9. **No shared public benchmark with adjacent tools.** Memory-retrieval suites (LOCOMO,
   LongMemEval) measure conversational-memory QA — a different axis; scores are not
   comparable in either direction. The only measured external comparison here is the
   deterministic madge superset (§2). A common code-KG precision benchmark does not exist
   yet; building one is open work.
