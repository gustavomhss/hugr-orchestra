# L2 judgment — terra-2

Verdict: PASS  
Reviewed manifest: d6ab29da4eccd7283a4d4a40ece0a719b7f932bc64098d4a065e19b5914a4cce

## Criterion verdicts

Source addresses are at revision `c9b8e54cbf2c6c2c4bb59bbda2dc878430a54085`. Grouped rows reaffirm prior judgments for unchanged material; the amended acknowledgment and trace were reviewed against the accepted L1 identity evidence.

| Criterion | Verdict | Output section and source/L1 address | Reason |
|---|---|---|---|
| AD-1–AD-3 | PASS | component-admission, Purpose and responsibility and Contract and state model; `L1:authority#Evidence register`, `L1:entry-storage-execution#Evidence register`, `L1:identity#Evidence register`; `packages/core/src/session.ts:491-517`, `session/input.ts:48-160,200-252,291-317` | Prior judgments reaffirmed: responsibility, both wake branches, retry predicates and historical provenance remain covered. |
| AD-4 | PASS | component-admission, Conditions and failure boundaries; `L1:identity#Evidence register @ 3c59da7d6729280b9bc75e8dca0e8bd434e7982e18220ddc6e48b90918f7a460`; `packages/core/src/session/input.ts:48-160` | The lead erratum distinguishes fresh publication, existing-record retry and historical synthesis from `Prompted` provenance, including the historical sequence carriers. Receipt non-guarantees remain explicit. |
| AD-5 | PASS | component-admission, Change impact and verification; `L1:identity#Evidence register`, `packages/core/src/session/input.ts:291-302`; `L1:promotion-verification-reuse#Evidence register`, `packages/core/test/session-prompt.test.ts:254-342` | Prior judgment reaffirmed: predicate consequences are distinguished from supplied test assertions. |
| AD-6 | PASS | component-admission, Coverage and gaps; `L1:identity#Evidence register`, `packages/core/src/session/input.ts:48-160` | The AD-4 trace now reflects the fresh/retry/historical distinction and is consistent with the explanation. |
| PJ-1–PJ-6 | PASS | unchanged component-projection, all required sections; body `83a90d3d9ddaa5f7fb3ab7efe22cd459d40cda86bd3daf2c51411390375c4b53`; `L1:entry-storage-execution#Evidence register`, `L1:identity#Evidence register` | Prior judgments reaffirmed for the unchanged carriers, projection, predicates, change impacts and gaps. |
| DL-1–DL-6 | PASS | unchanged component-delivery, all required sections; body `97490e1dedd698a7578fcaa08328f84a1b2786ac58e86c92fb8796d5530e7db5`; `L1:authority#Evidence register`, `L1:promotion-verification-reuse#Evidence register`; `packages/core/src/session/input.ts:318-391`, `runner/llm.ts:185-272,616-642` | Prior judgments reaffirmed: selector predicates, intended versus observed allowance, source order and verification limits remain covered. |
| EC-1–EC-6 | PASS | unchanged component-execution, all required sections; body `c1b5e2933ddbe4e55945df84c81cc506c7b1ba7f9f2f27eac872d318f427cbe0`; `L1:authority#Evidence register`, `L1:entry-storage-execution#Evidence register`; `packages/core/test/session-prompt.test.ts:541-586` | Prior judgments reaffirmed for process-local coordination, boundary consequences and bounded verification. |

## Critical defects and conflicts

None. The remaining acknowledgment defect is corrected in this derivative. The historical acknowledgment change is explicitly attributed to the lead; it is not a new producer response.

## Permitted unknowns

Unrun tests and interleavings, provider completion, request-specific input inclusion, unsupplied rationale and excluded hosted, distributed and crash-retry semantics remain unproven. This judgment accepts neither L3 nor L4.

## Optional suggestions

None.