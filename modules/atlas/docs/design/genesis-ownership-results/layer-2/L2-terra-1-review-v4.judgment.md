# L2 judgment — terra-1
Verdict: PASS
Reviewed manifest: d6ab29da4eccd7283a4d4a40ece0a719b7f932bc64098d4a065e19b5914a4cce

## Criterion verdicts

Source addresses are at revision `c9b8e54cbf2c6c2c4bb59bbda2dc878430a54085`. The three unchanged bodies retain their prior verdicts. The admission derivative is reviewed with its lead errata attributed separately from the producer remedy.

| Criterion | Verdict | Output section and source/L1 address | Reason |
|---|---|---|---|
| AD-1 | PASS | admission Purpose; `L1:authority#Evidence register`, `AGENTS.md:207-218` | Admission responsibility and exclusions remain distinct. |
| AD-2 | PASS | admission Contract and state model; `L1:entry-storage-execution#Evidence register`, `packages/core/src/session/run-coordinator.ts:83-110` | Both wake branches are described; `resume:false` remains caller-local. |
| AD-3 | PASS | admission Contract and state model; `L1:identity#Evidence register`, `packages/core/src/session/input.ts:48-160,200-252,291-317` | Retry, historical provenance and projection comparisons remain distinct. |
| AD-4 | PASS | admission Conditions and failure boundaries; `L1:identity#Evidence register`, `packages/core/src/session/input.ts:48-160` | The corrected account distinguishes fresh publication, existing-record retry and historical synthesis; it no longer requires a new `PromptAdmitted` for every receipt. |
| AD-5 | PASS | admission Change impact and verification; `L1:identity#Evidence register`; `L1:promotion-verification-reuse#Evidence register`, `packages/core/test/session-prompt.test.ts:254-342,448-518` | Context/time consequences are separated from the assertions actually supplied. |
| AD-6 | PASS | admission Coverage and gaps; `L1:identity#Evidence register`, `packages/core/src/session/input.ts:48-160,200-252` | The corrected AD-4 trace is consistent with the supported fresh, retry and historical paths. |
| PJ-1 | PASS | projection Purpose; `L1:entry-storage-execution#Evidence register`, `packages/core/src/session/sql.ts:154-181`; `packages/schema/src/session-input.ts:12-25` | Unchanged: carriers and receipt vocabulary are attributed. |
| PJ-2 | PASS | projection Contract and state model; `L1:authority#Evidence register`; `packages/core/src/session/projector.ts:283-311` | Unchanged: intended atomic visibility is separated from inspected call sites. |
| PJ-3 | PASS | projection Conditions and failure boundaries; `L1:identity#Evidence register`, `packages/core/src/session/input.ts:200-252,291-317` | Unchanged: retry and projection comparisons remain distinct. |
| PJ-4 | PASS | projection Conditions and failure boundaries; `L1:identity#Evidence register`, `input.ts:48-160,200-252` | Unchanged: conflict, fallback and insertion conditions are supported. |
| PJ-5 | PASS | projection Change impact and verification; `L1:promotion-verification-reuse#Evidence register`, `packages/core/test/session-prompt.test.ts:145-165,254-342,344-404,448-518,541-586` | Unchanged: test definitions are distinguished from execution. |
| PJ-6 | PASS | projection Coverage and gaps; `L1:entry-storage-execution#Coverage and gaps`; `L1:identity#Evidence register` | Unchanged: unavailable guarantees are qualified. |
| DL-1 | PASS | delivery Purpose; `L1:authority#Evidence register`, `docs/specs/v2/session.md:155-185` | Unchanged: steer/queue intent and non-guarantees are attributed. |
| DL-2 | PASS | delivery Contract and state model; `L1:promotion-verification-reuse#Evidence register`, `packages/core/src/session/input.ts:318-391` | Unchanged: queue selection is distinguished from the steer cutoff. |
| DL-3 | PASS | delivery Conditions and failure boundaries; `L1:authority#Evidence register`, `AGENTS.md:207-218`; `L1:promotion-verification-reuse#Reuse and conflicts`, `packages/core/src/session/runner/llm.ts:185-272` | Unchanged: intended allowance and observed counter are distinguished; insertion precedes transformation. |
| DL-4 | PASS | delivery Conditions and failure boundaries; `L1:promotion-verification-reuse#Evidence register`, `input.ts:318-391`; `llm.ts:185-239` | Unchanged: prechecks and conflict conditions are bounded. |
| DL-5 | PASS | delivery Change impact and verification; `L1:promotion-verification-reuse#Evidence register`, `packages/core/test/session-prompt.test.ts:145-165,254-342,344-404,448-518,541-586` | Unchanged: change consequences and definitions are separated from runtime proof. |
| DL-6 | PASS | delivery Coverage and gaps; `L1:authority#Evidence register`; `L1:promotion-verification-reuse#Evidence register` | Unchanged: selector and allowance distinctions are traced. |
| EC-1 | PASS | execution Purpose; `L1:authority#Evidence register`, `AGENTS.md:207-218` | Unchanged: owner routing constraints are not implementation proof. |
| EC-2 | PASS | execution Contract and state model; `L1:entry-storage-execution#Evidence register`, `packages/core/src/session/run-coordinator.ts:83-110` | Unchanged: run/wake branches and drain limits are preserved. |
| EC-3 | PASS | execution Conditions and failure boundaries; `L1:authority#Evidence register`; `packages/core/src/session/execution.ts:12-38` | Unchanged: runtime state, interruption contract and restart ambiguity remain distinct. |
| EC-4 | PASS | execution Conditions and failure boundaries; `L1:authority#Evidence register`; `L1:entry-storage-execution#Reuse and conflicts` | Unchanged: intended runner boundary is distinguished from missing implementation. |
| EC-5 | PASS | execution Change impact and verification; `L1:promotion-verification-reuse#Evidence register`, `packages/core/test/session-prompt.test.ts:541-586` | Unchanged: fixture assertions are not scheduler execution evidence. |
| EC-6 | PASS | execution Coverage and gaps; `L1:entry-storage-execution#Coverage and gaps`; `L1:authority#Evidence register` | Unchanged: scope stops and inherited limits remain traceable. |

## Critical defects and conflicts

None. The historical acknowledgment erratum is supported by the accepted L1 identity evidence. The manifest and consolidation preserve the producer and lead-edit provenance.

## Permitted unknowns

Unrun tests and interleavings, input-specific request inclusion, unsupplied rationale, and hosted, distributed or provider-crash retry semantics remain bounded exclusions—not failed executions or established guarantees. This judgment does not accept a future layer or publish knowledge.

## Optional suggestions

None.