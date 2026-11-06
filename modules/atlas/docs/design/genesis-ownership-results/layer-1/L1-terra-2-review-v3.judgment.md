# L1 judgment — terra-2

Verdict: PASS  
Reviewed manifest: f92380d8f484b3bffe83e7e2c13e922e46d3a9aa62ac7f5b6264bf22cbef1d85

## Criterion verdicts

Source addresses are at revision `c9b8e54cbf2c6c2c4bb59bbda2dc878430a54085`. Grouped rows reaffirm the previous judgments for unchanged material. The luna-2 derivative and consolidation were reviewed against this manifest.

| Criterion | Verdict | Output section and source/receipt address | Reason |
|---|---|---|---|
| AU-1–AU-5 | PASS | router-1, Evidence register, Reuse and conflicts, Boundary handoff, Coverage and gaps; `AGENTS.md:207-218`, `docs/specs/v2/session.md:3-50,155-185`; consolidation Need table | Unchanged authority mapping, constraints, handoff and gaps remain usable. |
| ES-1–ES-5 | PASS | router-2, Evidence register, Reuse and conflicts, Boundary handoff, Coverage and gaps; `packages/core/src/session.ts:491-517`, `packages/core/src/session/sql.ts:154-181`, `packages/schema/src/session-input.ts:12-25` | Unchanged entry, storage, receipt and join evidence remains bounded and traceable. |
| EX-1–EX-6 | PASS | router-2, Evidence register, Reuse and conflicts, Boundary handoff, Coverage and gaps; `packages/core/src/session/projector.ts:283-311`, `execution.ts:12-38`, `run-coordinator.ts:10-19,83-110`; `docs/specs/v2/session.md:35-37` | Unchanged projection and execution evidence preserves process-local and runtime-proof limits. |
| ID-1–ID-6 | PASS | luna-1, Evidence register, Reuse and conflicts, Boundary handoff, Coverage and gaps; `packages/core/src/session/input.ts:24-161,200-252,291-317` | Unchanged identity, retry, reconciliation and projection-predicate evidence remains usable. |
| PR-1 | PASS | luna-2, Evidence register; `packages/core/src/session/input.ts:318-369`, `runner/llm.ts:185-239` | Steer eligibility, cutoff, order and publication are located. |
| PR-2 | PASS | luna-2, Evidence register; `packages/core/src/session/input.ts:371-391`, `runner/llm.ts:616-642` | Queue selection and continuation reevaluation are located. |
| PR-3 | PASS | luna-2, Evidence register and Reuse and conflicts; `packages/core/src/session/runner/llm.ts:185-272,427-429`; editorial correction receipt `60292131a2601c6ce6cbbea82c41c4766d949448e91c74b88e2e305641412d5b` | The lead’s explicit correction now matches the source: the last-step prompt enters the array **before** `compaction.transform`; the transformed result enters the request. Counter reset and step-limit support remain present. |
| PR-4 | PASS | luna-2, Reuse and conflicts; `packages/core/src/session/input.ts:348-391`, `runner/llm.ts:185-272,616-642`; editorial correction receipt above | Selector behavior, runner conditions and limits remain distinct; the corrected ordering no longer conflicts with the source. |
| PR-5 | PASS | luna-2, Boundary handoff; `packages/core/src/session/input.ts:318-391`, `runner/llm.ts:185-272,427-429,616-642` | Selector, runner, history and request joins are identified without composing L3. |
| PR-6 | PASS | luna-2, Coverage and gaps; `packages/core/src/session/runner/llm.ts:185-272,427-429` | The PR-3 trace is consistent with the corrected evidence and bounded runtime unknowns. |
| VR-1–VR-5 | PASS | luna-2, Evidence register, Reuse and conflicts, Boundary handoff, Coverage and gaps; `packages/core/test/session-prompt.test.ts:145-165,254-342,344-404,448-518,541-586`; historical reconciliation receipt `sha256:a97aed6f24448270ab469a528b5cc94cb9dcb180ca3caa52d46401fd7a187881`; Atlas receipts | Test citations, receipt/artifact distinction, limited reuse and verification gaps remain intact. |
| B-1 | PASS | consolidation Need and join tables; router-1, Evidence register; `AGENTS.md:207-215`, `docs/specs/v2/session.md:3-50` | Authority and admission/execution ownership are navigable. |
| B-2 | PASS | consolidation join inventory; router-2, Evidence register and Boundary handoff; `session.ts:491-517`, `projector.ts:283-311`, `run-coordinator.ts:83-110` | Entry, visibility and execution evidence has bounded joins. |
| B-3 | PASS | consolidation N2 and joins; luna-1, Evidence register; `packages/core/src/session/input.ts:48-160,200-252,291-317` | Retry and historical reconciliation evidence remains usable. |
| B-4 | PASS | consolidation N3 and v3 erratum; luna-2, Evidence register and Reuse and conflicts; `packages/core/src/session/runner/llm.ts:185-272,616-642` | Selection, ordering and allowance support have a source-consistent handoff. |
| B-5 | PASS | consolidation N4 and join inventory; router-2 and luna-2, Boundary handoff; `projector.ts:283-311`, `runner/llm.ts:185-272,616-642` | Projection and execution boundaries remain indexed with conditions. |
| B-6 | PASS | consolidation N5–N6; luna-2, Evidence register and Coverage and gaps; historical reconciliation receipt `sha256:a97aed6f24448270ab469a528b5cc94cb9dcb180ca3caa52d46401fd7a187881`; test `session-prompt.test.ts:448-518` | Verification and reuse remain correctly attributed and bounded. |

## Critical defects and conflicts

None remain. The prior terra-2 PASS overlooked the source-order defect: `MAX_STEPS_PROMPT` is added **before**, not after, transformation. The new sentence is an explicitly attributed lead editorial correction to the preserved producer response, not a new producer response.

## Permitted unknowns

Test execution, individual request inclusion, concurrency interleavings and continuation semantic acceptance remain unproven. Unsupplied rationale and hosted, distributed and post-crash recovery behavior remain outside the bounded L1 claims. This judgment is not L2–L4 acceptance.

## Optional suggestions

None.