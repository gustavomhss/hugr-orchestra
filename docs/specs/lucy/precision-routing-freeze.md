# Immutable precision execution snapshot

The request host reads `ReviewPrecisionStore.history()` once for a newly admitted
review and derives `ReviewPrecisionCatalog.effective` from the running build's
original catalog and the parent Session's project id. The same catalog object is
used for initial routing, entry-driven reanalysis, analyzer configuration, source
generation binding and final routing digest. No provider/model supplies history.
Invalid history fails explicitly; it never falls back to an empty history.

For card-only PRs, candidate identity continues to bind the original build catalog,
refs, tree/diff, parent, settings and request. Do not include ambient history in
that candidate: an exact completed retry must reuse the first writer's immutable
facts and completed messages even after global history advances. Resolve that
retry before loading or deriving new precision state, and do not rerun analysis,
create a Session or prompt a model for it. First execution loads history inside
the candidate mutex, after the existing/retained retry branch, before any child
is created. Missing/incomplete facts remain a failure, not recovery permission.

`MaestroReviewTools.Analyze` gains required `catalog: ReviewCatalog.Catalog`.
`analyzeStep` forwards it to `ReviewAnalyze.run`. The request closures supply the
same captured effective snapshot to every analysis step, including additional
entry packs. This is a host internal boundary, not a model input or Protocol API.
The core page boundary independently keeps demoted/dropped items artifact-only.

Governed review requests derive one snapshot after owner settings and before the
fanout. Receipt metadata and outcome generations bind that snapshot. This does
not authorize trusting model-authored prior routing for rereview; the separate
rereview host-authority audit remains required. Completed governed receipt replay
is not silently recast as a new precision generation or atomic cross-stream write.

Acceptance must use the registered request path and real durable history: active,
demoted and dropped status reaches both routing and every analyzer call; a host
entry addition sees the identical snapshot even if history changes mid-drain;
project-local reads override the global prior; completed PR retry after ambient
history changes retains its original routing, outcomes and precision order with
no new analysis or provider drain. Native exclusion and raw-report controls remain
separate load-bearing proofs; injected analyzer fixtures prove routing, not CLI.

The Core analyzer exposes a host-only `ObserveCatalog` context callback, default
no-op, called with the resolved catalog at its real execution entry. Registered
request acceptance uses this observation rather than replacing the analyzer or
assuming a routing digest proves which configuration reached execution. The
callback has no model-visible tool, no permission and no history authority.
