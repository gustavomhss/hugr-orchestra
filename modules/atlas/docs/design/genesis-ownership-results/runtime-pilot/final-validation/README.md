# Final integrated validation — follow-up running

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
