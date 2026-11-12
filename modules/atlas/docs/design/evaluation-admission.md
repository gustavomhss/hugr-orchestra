# Ownership evaluation admission protocol v1

This protocol adds a finite isolated evaluation phase. It does not redefine the acceptance criteria, grant operational authority, or mark a campaign complete.

## Immutable obligations and acyclic identity order

1. Preserve the original source package, candidate, contract, criteria definitions, frozen oracles and semantic decisions. The obligation set references these exact objects and retains all final duties. Its status is PENDING_FINAL_EVIDENCE.
2. Fix the evaluation plan: source materialization, finite consumer IDs and per-case modes/read limits, maintenance controls, semantic applicability and limitations per entry, isolated root and implementation pins. It contains no reserved answers.
3. Compute the plan and obligation-set CAS identities. Compute each admission contract from these references and the four separately defined ADMIT criteria. Contracts never refer to the new candidate.
4. Compute the complete candidate from actual inputs/results/dependencies, source observations, plan, contracts and executing runtime identity. No decision, receipt or manifest is in this preimage.
5. Fix a generation independently of objects that will reference it. For initial admission it may be chosen after the candidate. For rebuild it must be fixed before the target plan, which includes it.
6. Obtain two new distinct exact admission decisions for the complete candidate and every required entry. Decisions bind contract, input/dependency hash and result. They are not final AC verdicts.
7. Persist reviews from those exact decisions, then receipts, artifacts and manifest. Each v2 authority envelope is evaluation-only and binds the plan/obligations; all except contracts additionally bind candidate. The manifest binds generation. No backward hash dependency is introduced.

Changed source, membership, recipe, result authority, validity, gaps, applicability or implementation creates new identities and invalidates affected proofs. Equal prose does not imply equal result identity. Historical semantic evidence is never silently converted into a new admission decision.

## Isolation and real readers

Prepare is CAS-only. Initialization is explicit and refuses a pre-existing active/staged store, policy or descriptor. The evaluation source root cannot be the original root, an ancestor or its descendant. Mutable state cannot use symlinks or hardlink aliases. A marker records canonical root/device/inode, original root and CAS-only initialization. Policy is a separate strict versioned document, bound to exact plan/candidate/generation/scope, actor, operations and optional finite consumer case. The marker is not itself permission.

Operational composition defaults to refusal on evaluation stores. The existing composed ownership reader and governed writer remain the only serving/admission path. The closed ownership predicate slot is retained, with a distinct evaluation-only claim bound to candidate identity. Manifest/contract/receipt/review v2 discriminants, not the spelling of a path or claim alone, enforce the phase.

Selection and attachment verify exact candidate mapping and current inputs, with all required entries checked. Generic query, node and export doors cannot disclose ownership CAS objects as accepted facts. Direct node resolution is not a bypass around projection/phase checks. Replay cannot apply or stage evaluation carriers into ordinary authority. Explicit evaluation output retains phase/generation/candidate labels; unavailable, drifted or unapproved state returns HOLD.

Consumer policy names a case and its frozen mode. A persistent per-candidate/generation/case ledger bounds index calls, read calls and delivered body bytes. Lock contention, stale partial budget files and exhaustion refuse rather than silently resetting. Consumer contexts receive questions and permitted reader access only, not source access, producer context or reserved answers. Mechanism tests do not establish that real consumer cases passed.

## Maintenance without promotion

Legacy v1 rebuild explicitly refuses v2. Evaluation rebuild has two stages: capture/plan/produce a complete private target, then receive two new exact target decisions and finalize a private v2 graph. Identical captured inputs/recipe return reuse with zero producer calls. A changed result requires fresh result-specific semantic evidence. Captured bytes and membership are checked before and after production; missing inputs/edges or stale reviews refuse.

A target may be materialized in a fresh isolated root. Target admission is a distinct lineage-checked route, not an exemption from the original native prepare equality check. It requires actual current source/runtime checks, preserved obligation identity and exact new decisions. Existing active state is not overwritten by bootstrap; operational activation is not provided. Recovery of interrupted/contended state must remain explicit and cannot return stale data as current.

## Final acceptance and evidence

All original AC, criterion matrix, frozen cases and DoD remain mandatory at their proper local/global scopes. Admission is neither an AC PASS nor final acceptance. Final evidence must separately include actual consumers, maintenance controls and required CI, evaluated by the required independent reviewers. A future accepted-phase publication requires a new exact candidate and separately authorized operational policy, not changing an evaluation flag in place.

Local actor strings and editable policy are not authenticated identity or protection against the same OS user rewriting code and all records. The implemented boundary is deterministic refusal through supported runtime doors, not an OS sandbox guarantee. CI fixtures and synthetic votes are test data only. Typecheck, generated-boundary verification, CI, candidate admission and campaign acceptance are separate results.
