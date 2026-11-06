# Final integrated validation — attempt 1 failed; repair in progress

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
