# Session-input ownership pilot — validation closeout

Status: **bounded validation accepted; not landed or installed in production**.
Validated source candidate: `b340faa8e616bfc49502f8d4c26979e6ababb867`.
This report records completed evidence, not a new consumer run or a rewrite of any predecessor.

## Acceptance coverage

| Scope | Evidence and boundary |
| --- | --- |
| RP-1..4: identity, authority, refusal and runtime wiring | Same Terra 1's accepted runtime reviews, actual governed-door controls and named rejecting mutations. Structural review records remain evidence, not credentials. |
| RP-5: reuse and invalidation | Same Terra 2's closure review and integration controls. Receipt renewal may preserve interpretation for the same result; no minimum-invalidation claim. |
| RP-6: exact import and isolated publication | Original producer bytes preserved; two v3 source derivatives explicitly attributed and separately reviewed. Fifteen other results reused. The actual existing governed door emitted the isolated v3 manifest. |
| RP-7: consumer usefulness | Same Terra 2 accepted CV3-1..5 and all five v3 cases: exposed regressions T1/T2 and independent U1/U2/U3. Original v1/v2 HOLDs remain unchanged; these exposed cases cannot become fresh held-out proof. |
| RP-8: verification | Lead-reconciled composed CI coverage below, exact-pin Linux/Windows controls, named mutants, repository guards and the same Terra 1's final technical-tail PASS. |

Detailed contracts and original evidence:
[runtime contract](genesis-ownership-runtime-contract.md),
[v3 consumer evidence](genesis-ownership-results/runtime-pilot/consumer-v3/README.md),
[final validation](genesis-ownership-results/runtime-pilot/final-validation/README.md).

## Exact CI composition, not a rewritten green run

- Full integrated run [42149400907](https://github.com/gustavomhss/hugr-orchestra/actions/runs/42149400907)
  at `9b0d91bdfe002b90ec4d0b0732436d5a1ac5b0ed` passed every non-Atlas job, including the three
  Linux e2e shards. It remains **FAILURE** because Atlas stopped on the archived contract's relative link.
- The next candidate changed only design documentation/receipts. One explicit navigation bridge fixed
  that link without editing the frozen contract, changing a hash pin or adding an integrity-gate waiver.
- Atlas-only run [42152830364](https://github.com/gustavomhss/hugr-orchestra/actions/runs/42152830364)
  at `b340faa8e616bfc49502f8d4c26979e6ababb867` passed all Atlas guards, typecheck, Own/source/script
  tests and the full product suite: **4,679 passed, 17 skipped, 3 todo**; 605 files passed, 2 skipped.
  E2e was deliberately skipped in this filtered lane, not counted as a second execution.
- Scoped run `42146218143` passed 80 tests and four named rejecting mutants. Final focused run
  `42149108060` passed seven exact-pin/Git-attribute guard tests on each of Linux and Windows.
- The lead read actual run/head/step identities and raw outputs, compared Git trees/source bytes and
  reconciled the generated bundles. Repository guards passed. The same Terra 1's final-tail decision
  accepts byte preservation, the three-pin shrink, navigation and this bounded coverage composition.

Exact closure and review receipts are in
`genesis-ownership-results/runtime-pilot/final-validation/attempt-2/`.
Raw logs remain outside Git with job IDs/digests recorded; the duplicate in-tree raw logs were removed
under `agent-scratch`, not renamed to evade the rule. Original failed runs and review findings remain intact.
The recovery worklist is hash-pinned at its historical checkpoint; this separate report supersedes its
then-open validation status without changing those frozen bytes.

## Landing is separate

Owner direction after validation: organization may proceed now, but **no PR creation or update until
the campaign closes**. The pilot's acceptance is not campaign closure. The
[landing preparation](genesis-landing-plan.md) records the gate, implementation packets and preserved
corpus bundles; it does not authorize delivery or waive the PR/artifact budget.

PR #1291 still points to `c9b8e54cbf2c6c2c4bb59bbda2dc878430a54085`, not the validated snapshot.
No merge, force push or owner-runtime restart occurred. Snapshot commits preserve the candidate remotely;
the owner's working branch and main index were not reset or replaced.

The incremental candidate over that PR head contains 1,541 added / 24 deleted source/test/config lines,
four generated outputs, and 329 corpus files adding 39,694 lines. These are measured incremental totals,
not the final PR-versus-dev budget. Even excluding the corpus and generated outputs, landing it as one
new unreviewed change would exceed the 400-line PR budget. The already reviewed corpus must be preserved,
not compressed or re-mined to meet that budget. Landing needs a reviewable split and human approval;
validation alone does not authorize pushing the whole package onto the existing PR or merging it.

## Deliberate limits

This closes only the bounded Session-input/default-runner pilot's validation. It does not establish
repository-wide ownership, production installation, physical provider attempts or settled billing,
historical continuation recovery, the final Own patch or global campaign disposition. It does not turn
a receipt into provider execution evidence, authenticate review identities or relax governed authority.
No further consumer tuning, new mining or production-policy change follows from this closeout.
