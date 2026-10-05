# Genesis sound-arm removal — the staged cut (for ratification)

Applies `genesis-epistemic-contract.md` to the **shipped** code. The contract's consequence: the
deterministic oracle must not be the **truth-gate** that admits/rejects model-proposed semantic facts.
This document is the black-and-white cut list — every piece → one decision → file:line → what breaks.
Nothing here is executed until ratified; the shipped surface is merged, tested, and gated, so it moves
by reviewed WPs, never a blind delete.

Decision vocabulary (from the contract):

- **CUT** — deterministic truth-gate for a model-proposed semantic fact. Remove; `PROPOSE`
  (grounded self-refutation) becomes the only "proof".
- **RELABEL** — today stamps `seal:'proven'` on what is really a model assertion → becomes
  `justified` (grounded, contestable), never "proven".
- **KEEP** — infra, not a truth-gate (grounding-span existence, provenance, scrub, canonical id,
  format sanity).

## The cut table

| #   | Piece                                              | file:line                                                                                                      | Decision                                                      | What breaks / becomes                                                                               |
| --- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 1   | Dependency admit truth-gate                        | `admit-harness.ts:256` (`verifyDependency(t,s)!=="proven" ⇒ drop`)                                             | **CUT**                                                       | dependency fact no longer gated by oracle; admitted iff grounded + PROPOSE survived                 |
| 2   | Count admit truth-gate                             | `admit-harness.ts:271` (`verifyCount!=="proven" ⇒ drop`)                                                       | **CUT**                                                       | same                                                                                                |
| 3   | `buildSound` + `seal:'proven'` mint                | `admit-harness.ts:365`, `:378`                                                                                 | **RELABEL / CUT** (fork F1)                                   | the only place `proven` is stamped in the mine path                                                 |
| 4   | Oracle wiring into `atlas mine`                    | `compose-mine-admission.ts:80,94,104`                                                                          | **CUT**                                                       | `createVerifyFactLeg` no longer fed into `AdmitDeps`                                                |
| 5   | Negation door closed-world ADMIT/REFUTE            | `governed-emit-negation.ts:296-391` (refute `:296-297`, admit `:299-391`)                                      | **CUT** (fork F2)                                             | negation stops being a closed-world proven claim; becomes justified/grounded model assertion        |
| 6   | Negation gate-1 escape / dynamic-reach / hole legs | `governed-emit-negation.ts:246-291`                                                                            | **CUT with F2**                                               | the closed-world completeness machinery goes with the admit it served                               |
| 7   | `Seal` type + witness re-prove machinery           | `knowledge/types.ts:147`; `admit-harness.ts:405/417/431`; `reverify-store.ts`; `store-provenance` witness legs | **coupled to F1**                                             | exist only to serve `seal:'proven'`; die iff proven is cut, survive iff proven is kept as a label   |
| 8   | Standalone `atlas verify-fact` CLI oracle          | `cli.ts:365-371`, `compose.ts:342/520`, `verify-fact-source.ts:139`                                            | **KEEP or CUT** (fork F3)                                     | a deterministic dependency _query_, not an admit gate — orthogonal to the cut                       |
| 9   | The three oracles themselves                       | `verify-fact.ts:85`, `verify-count.ts:72`, `verify-negation.ts:76`                                             | **KEEP as reference models** (only reachable via F3 or tests) | pure/total, harmless when not wired as a gate; kept iff F3 keeps the CLI, else become dead → remove |

### KEEP (infra — explicitly NOT cut)

- Grounding span existence / freshness — `doors.grounded` at `admit-harness.ts:257,272`, whole
  `packages/grounding/*`, `compose.ts:190 buildGate`. This is the justification check (does the cited
  span re-derive at source@sha) — the heart of `justified`, not a truth oracle.
- Provenance — `store-provenance.ts`, `read-provenance.ts`, `answerRef` (`mine-decide.ts:225`).
- Scrub — `persist/src/scrub*.ts`, `mine-claim-scrub.ts`.
- Canonical id / CAS — `addressOf`, `nodeKey`/`relationKey`/`negationKey`, `mintIdentity`.
- Model-answer **format** sanity — `llm.ts:337 admitModelAnswer` (UTF-8 / non-empty / abstain-token /
  splice) — checks corruption, never re-derives a claim.

## Tests / gates that move with the cut

CUT-coupled suites become obsolete or must be re-pointed at the `justified` path:
`verify-fact.test.ts`, `verify-count.test.ts`, `verify-negation.test.ts`,
`compose-mine-admission.count-leg.test.ts`, the whole negation-door suite (`negation-door*.test.ts`,
`negation-*-blackbox`, `negations-fold/-key/-witness-drift`, `s31-negation.blackbox`,
`negations-cli/-mcp`), `reference-model-guard.mjs` (enforces INV-GEN-12 presence),
`harness/req-clause-ledger.json` rows for GEN-12. Each: delete if it pins a cut gate, or re-point if
it pins behaviour that survives as `justified`.

## Docs / ADRs to supersede (co-amend in the same wave)

- **INV-GEN-12** (`method-tags-gen.md:93-98`, `properties-gen.md:138-139`, `req-gen.md:191-241`,
  `reference/atlas-genesis.md#gen-12`) — the sound-oracle-first invariant. Superseded by the epistemic
  contract; must be amended, not left contradicting it (a live invariant that the code no longer honors
  is exactly the #199 rot pattern).
- **ADR-0017 two-seal** (`ADR-0017-typed-genesis-slots-two-seal.md`) — its proven-only seal is the
  subject of F1.
- **ADR-0016 / ADR-0018 / ADR-0019** (typed predicate + mechanical admission legs + specificity teeth)
  and **99b-negation-fact-contract.md** — the negation/predicate sound-admission line; superseded with F2.

## The three forks — RATIFIED (owner, 2026-08-19)

- **F1 — the `proven` seal → REDEFINED, not killed.** The owner corrected the framing: **a proof can
  be model-supplied**, not only oracle-derived — "the model can prove too… logs, code excerpts". So:
  - **`proven`** = the emitted fact **carries evidence that ENTAILS the claim** — a code excerpt that
    shows it directly, a log, or a mechanical witness — re-checkable by a reader following that
    evidence. The **source of the proof may be the model**, not only the deterministic oracle.
  - **`justified`** = grounded, self-refuted, contestable, but the carried evidence **supports without
    strictly entailing**.
  - Consequence for the cut: the oracle stops being the **mandatory admit gate** (a fact is NOT dropped
    just because the oracle did not prove it), but the **witness / evidence-carrier machinery STAYS**
    (item 7 is repurposed, not deleted) — it now carries the _model's_ proof, not only the oracle's.
    Admit iff grounded; seal `proven` when the carried evidence entails, else `justified`.
- **F2 — the negation door closed-world admit → CUT.** Negation becomes a justified grounded model
  assertion (no closed-world REFUTE/ADMIT). Closed-world admit is unsound by construction (flagged in
  `verify-fact.ts:56-59`), the contract's exact target.
- **F3 — the standalone `atlas verify-fact` CLI → KEEP** as a user-invocable deterministic dependency
  query (honest: "this dependency is mechanically present"), separate from mining. Keeps the three
  oracles from becoming dead code; one legitimate _source_ of a `proven`-grade witness under F1.

### What this does to the cut table

- Item 1,2 (oracle admit truth-gate) — still **CUT** as the _mandatory_ gate; the oracle may still
  _contribute_ a witness that seals `proven`, but its abstention no longer DROPS the fact.
- Item 3 (`buildSound`/`seal:'proven'`) — **KEEP the seal, REWIRE its trigger**: sealed `proven` iff
  the fact carries entailing evidence (model- or oracle-supplied), not iff the oracle re-derived it.
- Item 7 (witness / reverify machinery) — **KEEP**, repurposed as the model's proof-carrier.
- Item 5,6 (negation closed-world door) — **CUT** per F2.
- Item 8,9 (`verify-fact` CLI + oracles) — **KEEP** per F3.

## Staging (once forks are set)

1. **WP-CUT-MINE** — remove the oracle truth-gate from the mine admit path (items 1,2,4; item 3 per F1).
2. **WP-CUT-NEG** — cut the negation closed-world door per F2 (items 5,6); re-point negation to the
   justified/grounded path.
3. **WP-SEAL** — resolve the seal per F1 (item 3,7): relabel to `justified` or delete `proven`.
4. **WP-DOCS** — co-amend INV-GEN-12 + ADRs 0016/0017/0018/0019 + 99b so no live invariant contradicts
   the contract.
5. Each WP: cold review (lucy) before merge; suites re-pointed, not left red; one-fix-round.
