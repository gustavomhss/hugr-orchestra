# L1 judgment — terra-1
Verdict: PASS
Reviewed manifest: f92380d8f484b3bffe83e7e2c13e922e46d3a9aa62ac7f5b6264bf22cbef1d85

## Criterion verdicts

Source addresses are at revision `c9b8e54cbf2c6c2c4bb59bbda2dc878430a54085`. The unchanged judgments below are reaffirmed against the manifest-bound bodies. The luna-2 derivative includes an explicitly attributed lead edit, not a new producer response.

| Criterion | Verdict | Output section and source/receipt address | Reason |
|---|---|---|---|
| AU-1 | PASS | router-1 Evidence register; `AGENTS.md:207-218`; `docs/specs/v2/session.md:3-50,155-185` | Authorities and topical mapping are attributed; the packet-label omission is disclosed. |
| AU-2 | PASS | router-1 Evidence register; same authority ranges | Constraints and deferred work retain their authority labels. |
| AU-3 | PASS | router-1 Reuse and conflicts; same authority ranges | Intended contract is not presented as runtime proof. |
| AU-4 | PASS | router-1 Boundary handoff; same authority ranges | Partition handoffs do not claim sibling inspection. |
| AU-5 | PASS | router-1 Coverage and gaps; consolidation need table | The label omission and unsupplied rationale remain visible. |
| ES-1 | PASS | router-2 Evidence register; `packages/core/src/session.ts:491-517` | Defaults, conflict handling and wake condition are supported. |
| ES-2 | PASS | router-2 Evidence register; `packages/core/src/session/sql.ts:154-181`; `packages/schema/src/session-input.ts:12-25` | Schema and receipt definitions are distinguished from admission implementation. |
| ES-3 | PASS | router-2 Reuse and conflicts; `session.ts:491-517`; `sql.ts:154-181`; `session-input.ts:12-25` | Seat-local limitations are qualified. |
| ES-4 | PASS | router-2 Boundary handoff; `session.ts:491-517`; `sql.ts:154-181`; `session-input.ts:12-25` | Joins are identified without asserting unseen behavior. |
| ES-5 | PASS | router-2 Coverage and gaps; `session.ts:491-517`; `sql.ts:154-181` | Seat-local atomicity and concurrency limits are disclosed. |
| EX-1 | PASS | router-2 Evidence register; `packages/core/src/session/projector.ts:283-311`; `docs/specs/v2/session.md:35-37` | Projection branches and intended visibility are separately attributed. |
| EX-2 | PASS | router-2 Evidence register; `packages/core/src/session/execution.ts:12-38`; `packages/core/src/session/run-coordinator.ts:10-19,83-110` | Interface statements and implemented branches are distinguished. |
| EX-3 | PASS | router-2 Evidence register; `execution.ts:12-38`; `run-coordinator.ts:83-110` | Process-local scope is preserved. |
| EX-4 | PASS | router-2 Reuse and conflicts; `execution.ts:12-38`; `run-coordinator.ts:10-19,83-110` | Comments, branches and runtime proof are separated. |
| EX-5 | PASS | router-2 Boundary handoff; `session.ts:491-517`; `projector.ts:283-311`; `run-coordinator.ts:83-110` | Cited joins are questions, not end-to-end guarantees. |
| EX-6 | PASS | router-2 Coverage and gaps; `projector.ts:283-311`; `run-coordinator.ts:83-110` | Criteria and seat-local gaps are traceable. |
| ID-1 | PASS | luna-1 Evidence register; `packages/core/src/session/input.ts:48-93,291-302` | Identity lookup and reuse branches match the source. |
| ID-2 | PASS | luna-1 Evidence register; `input.ts:96-160` | Historical reconciliation retains durable-event provenance. |
| ID-3 | PASS | luna-1 Evidence register and Reuse; `input.ts:200-252,291-317` | Retry and projection predicates remain distinct. |
| ID-4 | PASS | luna-1 Reuse and conflicts; `input.ts:48-160,200-252,291-317` | Observations are separated from unsupported guarantees. |
| ID-5 | PASS | luna-1 Boundary handoff; `input.ts:48-160,200-252,291-317` | Joins retain cited provenance. |
| ID-6 | PASS | luna-1 Coverage and gaps; `input.ts:24-161,200-252,291-317` | Criterion trace and seat-local gaps are explicit. |
| PR-1 | PASS | luna-2 Evidence register; `input.ts:318-369` | Steer eligibility, ordering and publication conditions are supported. |
| PR-2 | PASS | luna-2 Evidence register; `input.ts:371-391`; `packages/core/src/session/runner/llm.ts:616-642` | Queue selection and continuation reevaluation are conditionally described. |
| PR-3 | PASS | luna-2 Evidence register and Reuse; `llm.ts:185-272,427-429` | Counter reset, step limit and request boundary are supported. The erratum correctly places `MAX_STEPS_PROMPT` in the array passed into `compaction.transform`. |
| PR-4 | PASS | luna-2 Reuse and conflicts; `llm.ts:240-272` | The edited sentence now agrees with the source and register; selector conditions and unsupported guarantees remain distinct. |
| PR-5 | PASS | luna-2 Boundary handoff; `input.ts:318-391`; `llm.ts:185-272,427-429,616-642` | Supported joins are identified without an integrated runtime guarantee. |
| PR-6 | PASS | luna-2 Coverage and gaps; `llm.ts:185-272,427-429` | The required source-level support and criterion trace are consistent; runtime and input-specific inclusion remain unclaimed. |
| VR-1 | PASS | luna-2 Evidence register; `packages/core/test/session-prompt.test.ts:145-165,254-342,344-404,448-518,541-586` | Assertions are scoped to test definitions, with the full source revision. |
| VR-2 | PASS | luna-2 Inputs and Evidence register; historical audit `sha256:a97aed6f24448270ab469a528b5cc94cb9dcb180ca3caa52d46401fd7a187881`; continuation proof `sha256:237fbfea4abf03a8eed0f86400a7577af69812f4f345e66c0c5b072537d5893b` | Audit receipt identity is distinct from the recovered artifact digest. |
| VR-3 | PASS | luna-2 Reuse and conflicts; historical audit `sha256:a97aed6f24448270ab469a528b5cc94cb9dcb180ca3caa52d46401fd7a187881` | Bounded audit reuse is distinguished from runtime and semantic verification. |
| VR-4 | PASS | luna-2 Boundary handoff; test ranges above; continuation proof `sha256:237fbfea4abf03a8eed0f86400a7577af69812f4f345e66c0c5b072537d5893b` | Later verification questions do not imply execution or acceptance. |
| VR-5 | PASS | luna-2 Coverage and gaps and Evidence register; historical audit `sha256:a97aed6f24448270ab469a528b5cc94cb9dcb180ca3caa52d46401fd7a187881`; `session-prompt.test.ts:448-518` | VR trace points to the corrected receipt identity and full test revision. |

## Critical defects and conflicts

None. The previous source-order defect is corrected. Consolidation v3 and the erratum receipt preserve the distinction between the producer response and the lead’s one-sentence edit.

## Permitted unknowns

Unexecuted tests and interleavings, input-specific request inclusion, unsupplied rationale, and hosted, distributed or provider-crash retry semantics remain bounded unknowns. Provider completion and historical transport or artifact receipts do not establish semantic knowledge acceptance.

## Optional suggestions

None.