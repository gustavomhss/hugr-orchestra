# Source-preserving fanout reduction

The current fanout exceeds its file-size gate; no cap increase or waiver is
authorized. Perform two small dependent extraction commits after the durable
round authority repair is frozen. Do not mix behavior changes into them.

1. Move candidate-source admission, outcome projection, dedup/ordering and option
   selection into `workflow/review-candidates.ts`, exported namespace
   `ReviewCandidatesV2`. Move the internal `Merged` type with them. Preserve all
   function bodies, constants, comparisons, source-range checks and ordering;
   qualify main orchestration call sites. Only move dependencies needed by these
   functions; common tiny `unique` may have the same local implementation in each
   module. No new candidate or evidence behavior, global state or provider turn.
2. Move the remaining post-orchestration routing, brief/scoping and JSON-block
   helpers into `workflow/review-fanout-support.ts`, namespace
   `ReviewFanoutSupportV2`. Preserve bodies; the main file keeps Session lifecycle,
   `RUNNING`, finish authorization, provider calls and publication barriers.
   Type-only references to exported fanout input types are allowed; no runtime
   circular import back into the orchestrator. Keep internal helper-to-helper
   calls local and qualify orchestration calls without import aliases.

Capture source-body identities before extraction and compare after removing only
the mechanical `export` modifier and namespace call qualifiers. A successful
comparison is not the Godfile gate: run the named actual gate remotely, plus the
existing fanout, governed receipt, precision and durable Session acceptance.
Each extraction is a separate reviewable commit/PR with an explicit predecessor;
do not include source changes from the receipt documentation branch.

The separate `tools/review.ts` file also exceeds the gate and needs its own
source-preserving reduction after round authority stabilizes. This freeze does
not claim that reducing the fanout alone closes the full Godfile finding.
