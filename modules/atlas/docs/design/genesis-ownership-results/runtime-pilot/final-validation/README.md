# Final validation — composed CI and technical-tail review accepted

**Final technical-tail review:** the same persistent Terra 1 returned PASS for byte preservation/pin
shrink, frozen-contract navigation and bounded composed CI coverage. Exact original decision and source
provenance are in `attempt-2/terra-1-final-tail-v1.decision.json` and
`attempt-2/final-tail-review-provenance-v1.json`. No original review or run was upgraded.
See the [bounded validation closeout](../../../genesis-ownership-closeout.md) for RP-1..8, landing status
and explicit production/global limits. This is accepted validation, not permission to merge.

**Current outcome:** Atlas completion run
[42152830364](https://github.com/gustavomhss/hugr-orchestra/actions/runs/42152830364) passed at
`b340faa8e616bfc49502f8d4c26979e6ababb867`, including every Atlas guard, typecheck, Own/source/script
tests and the full product suite: **4,679 passed, 17 skipped, 3 todo** (605 files passed, 2 skipped).
The lead checked actual run/head/step identities, product output and the docs-only delta from the
integrated source; `attempt-2/composed-ci-closure-v1.json` binds that evidence.

Successful non-Atlas jobs, including all three Linux e2e shards, remain bound to integrated run
`42149400907`. That run remains FAILURE; the accepted coverage is the explicit composition with the
complete Atlas replay, not a rewritten green status or a claim that skipped e2e ran again.
The scoped mutation controls and exact-pin Linux/Windows controls remain separate supporting evidence.
Final technical-tail review and landing remain separate; no production or global ownership is implied.

The checkpoints below are preserved chronology, not current blockers.

**Latest result:** follow-up run `42149400907` completed with all non-Atlas jobs successful; Atlas
failed ID-5 on a relative link inside the byte-preserved frozen contract. `attempt-2/` records the
completed run and diagnosis. One navigation bridge resolves that link without changing the contract,
hash pins, source or guards. Its actual target is the original v2 results, not a copied acceptance.

The docs-only delta at `b340faa8e616bfc49502f8d4c26979e6ababb867` is now running through the existing
Atlas-only lane [42152830364](https://github.com/gustavomhss/hugr-orchestra/actions/runs/42152830364).
It must complete all Atlas guards and product tests. Successful non-Atlas evidence remains bound to the
unchanged integrated source at `9b0d91bdfe002b90ec4d0b0732436d5a1ac5b0ed`. This is not another full
epic or a green reinterpretation of the failed run. No gate closure or landing is claimed yet.

Earlier checkpoints below retain their original chronological meanings.

**Current checkpoint:** scoped repairs are accepted and the one follow-up integrated run is
[42149400907](https://github.com/gustavomhss/hugr-orchestra/actions/runs/42149400907), snapshot
`9b0d91bdfe002b90ec4d0b0732436d5a1ac5b0ed`. `integrated-followup-v1.json` binds its tree and scoped
source evidence. Final exact-pin core run `42149108060` passed seven tests on each of Linux and Windows;
Atlas scoped run `42146218143` passed 80 tests and four named mutation controls. The source ledger/tests/
attributes and generated outputs were reconciled before dispatch; repository guards passed.

No follow-up result or landing is claimed yet. The original failed attempt below remains preserved.
Raw failed-job logs remain outside Git as explained in `attempt-1/raw-log-disposition.md`; original
hashes/job IDs remain unchanged. Later report-only receipts are not inputs tested by the snapshot.

The bounded consumer v3 evaluation has passed; see [its exact evidence](../consumer-v3/README.md).
The one final integrated `test.yml` run is
[42142588323](https://github.com/gustavomhss/hugr-orchestra/actions/runs/42142588323), head
`de04672226f005dc453bd796859bb20fb946f751`, branch `pilot-close-1793927714`.

`integrated-snapshot-v1.json` preserves the exact tree/parent/path list. The temporary alternate index
snapshot does not commit, stage or reset the owner's working branch/index. `runtime-source-reuse-v1.json`
compares the runtime/test/generator/importer source against the earlier scoped-CI head with a named
byte-difference control; it is not a substitute for this integrated run or final independent review.

Attempt 1 completed **FAILURE**. `attempt-1/` preserves the run and logs from every failed job:
Atlas product tests and the same rename-guard failure in Linux core and Windows core 5/8. This does
not revoke the separate consumer semantic PASS, and it does not permit landing. The repair contract
is [genesis-final-ci-repair.md](../../../genesis-final-ci-repair.md).

Final result and report-only receipts produced after the snapshot are labelled as such, not portrayed
as inputs tested by that run. No integrated PASS or landing is claimed here.
