# S2-U1 final binding audit

The frozen case binds an **isolated behavior edit in `apps/desktop/src/main/owned-serve.ts`**, its required controls, and a prediction-only final dependency graph. **It does not specify an exact mutation patch, replacement value, or mutant hash.** No mutation was invented or executed by this audit. Actual mutation, update, restoration, rebinding, and call-count observation remain **NOT_RUN**.

## Exact records

| Existing record | SHA-256 |
| --- | --- |
| `/workspace/scratch/7b5d6430f420/genesis-s2/deliverable/oracles/ownership-v1.json` | `87a571d85c09dbcc02df7c5360bde9cdca933768fe8bd81e00f044f33eed5ff1` |
| `/workspace/scratch/7b5d6430f420/genesis-s2/deliverable/oracles/update-final-graph-expectation.json` | `716f9f06506a34556ec8b56978048f5e31b401d43aae1bdeb0fdd2de476c954f` |
| `/workspace/scratch/7b5d6430f420/genesis-s2/deliverable/native-package.json` | `9356cefcb4a1db413e67869a855fd082536476fb18ff7784dde39f051e9b407b` |
| `/workspace/scratch/7b5d6430f420/genesis-s2/corpus/apps/desktop/src/main/owned-serve.ts` | `0970f4ddb99c1c004e200443abc54ed5ea38cec098e19ef9aa748b771238dfb5` |
| `/workspace/scratch/7b5d6430f420/genesis-s2/corpus/modules/atlas/docs/design/genesis-ownership-plan.md` | `6164db5c520fd86f12f36b0165bae8cd5b4091a62d7b80596b77774f9a26d697` |

The receipt pins all other cited request/protocol/tree inputs, their byte lengths, and literal original excerpts with line ranges. The frozen case is `ownership-v1.json` `/impact_case` (lines 247–258). Its operation is literally “isolated behavior edit in apps/desktop/src/main/owned-serve.ts”; the restoration control is literally “restore exact source and rebind, no stale fallback”.

## Potential affected closure, not interpretation-call count

The saved graph matches the current native-package hash, direct input declarations, build edges, potential closure, and independent set. The target is a direct input of `s2.l1.desktop-web` and `s2.l2.desktop-web`. Its **nine potential affected artifacts** are both of those, all three L3 artifacts, all three L4 unit artifacts, and `s2.l4.entry`. The four outside this build closure are L1/L2 app-session and design-tui. The original oracle protects units that *only navigate* to desktop; it does not promise that higher layers with declared cross-unit build dependencies are unaffected.

Nine candidates do not imply nine model calls. The normative ownership plan, lines 96–102, permits deterministic discharge and stops downstream propagation only when the validated canonical consumer-visible result is unchanged. AC-05 (line 142) requires zero proposer calls for identical valid inputs/recipe and permits receipt-only binding refresh without downstream interpretation; equal prose with changed authority, validity, or gaps must propagate. SC-3 (line 171) retains the no-unnecessary-interpretation requirement. Actual S2-U1 interpretation calls have not been observed.

## Existing restoration semantics and missing specifics

The exact baseline is **8,511 bytes**, Git blob `31d70c15aafdc91ebccc1c5cd25da153cfac84ed`, SHA-256 `0970f4ddb99c1c004e200443abc54ed5ea38cec098e19ef9aa748b771238dfb5`, at source `1cde2ff7a71bcf7aecb5d030917b577165135d38`. Its captured bytes agree with the frozen desktop tree and both native-package source references. This identifies what “restore exact source” can bind to; the source already being at baseline is not evidence of a completed mutation/restoration cycle. Rebinding and compatible current reads still require actual receipts.

Missing from the inspected frozen S2-U1 records are the exact edit and mutant bytes/hash, case-specific post-mutation canonical-result expectations, and exact omission/control fixtures. Generic requirements exist; their execution does not. The baseline `READY_TIMEOUT = 120_000` line is not a frozen instruction to change that constant. The campaign references `genesis-update-plan-contract.md`, but it is absent at the expected local corpus path recorded in the receipt; no remote search was performed.

This audit reports no mismatch among the compared saved graph, current package, and baseline identities. It does not repair the missing mutation specification or issue a semantic verdict. ROOT supplied the scope that both final judges cover the declared expected graph only; no judge opinion or runtime success is inferred here. Only this new receipt and note were written.
