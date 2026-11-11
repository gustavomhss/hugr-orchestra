# PREP-S2-02 correction — v2 replaces the over-limit draft

This addendum preserves v1 rather than rewriting it. `ownership-rebuild-boundaries.patch` remains byte-identical at SHA-256 `4ba38502520f1c5a5be35ff3e4350a914610cd04a22a76c34152b6a8843e6677`; its test-file layout is superseded by `ownership-rebuild-boundaries-v2.patch`. The original findings remain technical preparation, not runtime evidence.

## Concrete review finding

PREP-S2-04 identified that v1 grew the existing test from 575 to 610 lines using the actual guard convention, `text.split("\n").length`. The pinned guard at `modules/atlas/harness/gates/godfile-guard.mjs`, blob `27891a73f04cdfdd2944e281cb59e59a7f8e10d5`, applies to all package TypeScript files including tests. Its hard cap is 600, and this test has no authorized waiver. The source was reread through the GitHub connector. This is static evidence; the actual guard was not run.

## Bounded correction

V2 extracts the existing synthetic fixture once into `packages/adapter-io/test/fixtures/ownership-rebuild-fixture.ts`. Both the original regression suite and the new `ownership-rebuild-boundaries.test.ts` import that fixture. Its body is preserved except for exported entry points; no independent replica of the rebuild implementation or fixture is introduced. The original RB-01..20 and TC-01..05 assertion block remains byte-identical.

The new file owns RB-21..23. Static line counts with the guard's convention are 364 for rebuild implementation, 402 for original test, 183 for the shared fixture, and 71 for the new boundary test. All are below the hard cap. The original test remains over the 400-line warning target by two lines; no compression, waiver, ignore or cap change is introduced to hide that fact.

The changes remain unapplied proposals under the S2 preparation directory. The package typecheck and CI must include both the old test and the new boundary test; running only the historical named old file would omit all three new regressions. S5 must integrate the four-path patch after S1 file ownership and collision clearance.

## RB-23 and unchanged cache reuse

The existing `OwnershipRebuildRequest.readCapturedBytes` contract says it returns captured bytes from the same capture that produced the observation and is undefined for non-file bindings. A present `file:` observation paired with undefined captured bytes is an inconsistent request. The current executor collects these captures before its zero-affected early return.

V2 therefore explicitly tests both an unchanged baseline (otherwise zero-call reuse) and a changed direct input. Both must return `ownership-input-unavailable` with the missing file key, zero recipe executions, zero evaluator executions and no manifest. Cache reuse avoids new interpretation; it does not authorize an inconsistent host capture. An optimization that intentionally omits file captures would require a separately defined host/API contract rather than silently treating this failure as successful reuse.

This test covers missing captures, not arbitrary forged byte/version pairs. The actual native host adapter must still bind observed versions to the exact captured bytes; the generic executor accepts caller-defined version strings and cannot manufacture that authority. Unchanged source with a coherent capture continues to be covered by RB-01's existing exact-manifest, zero-call expectation.

## Evidence and remaining gates

`patch-metadata-v2.json` records the base SHA, four touched paths, v1 link, v2 hash, exact static line counts and unchanged original assertion block. `correction-receipt-v2.json` records this preparation correction and its outputs. Source materialization, patch generation and hashing occurred; no tests, guard, package typecheck, production, GitHub mutation or judge acceptance occurred. Technical delta review is requested from the existing preparation reviewer, not a new binding judge.
