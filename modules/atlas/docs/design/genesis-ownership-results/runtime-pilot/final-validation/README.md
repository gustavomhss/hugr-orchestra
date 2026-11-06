# Final integrated validation — pending

The bounded consumer v3 evaluation has passed; see [its exact evidence](../consumer-v3/README.md).
The one final integrated `test.yml` run is
[42142588323](https://github.com/gustavomhss/hugr-orchestra/actions/runs/42142588323), head
`de04672226f005dc453bd796859bb20fb946f751`, branch `pilot-close-1793927714`.

`integrated-snapshot-v1.json` preserves the exact tree/parent/path list. The temporary alternate index
snapshot does not commit, stage or reset the owner's working branch/index. `runtime-source-reuse-v1.json`
compares the runtime/test/generator/importer source against the earlier scoped-CI head with a named
byte-difference control; it is not a substitute for this integrated run or final independent review.

No integrated PASS or landing is claimed at this checkpoint. Final result and report-only receipts
produced after the snapshot must be labelled as such, not portrayed as inputs tested by that run.
