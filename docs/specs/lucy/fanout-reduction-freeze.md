# Source-preserving Godfile closure

## Frozen baseline and actual failure

Baseline: `32d899eeb7207ea32aff9c6a07a91fa90f7f9fc6`, from actual slice history,
not the receipt branch. The four-file acceptance passed 28 cases per OS in
`42057577022`; exact-head Core/Maestro/Schema/Client typecheck passed in
`42057530587`. Windows plain-PR cases assert unsupported refusal, not support.

Complete existing Godfile gate `42058012799` examined 5,231 source files and
returned four errors, not just the two production files in the earlier proposal:

| File below `modules/maestro/coordination` | Physical nonblank LOC |
| --- | --- |
| `src/v2/tools/review.ts` | 844 |
| `src/v2/workflow/review-fanout.ts` | 993 |
| `test/lucy-governed-checks.test.ts` | 1,149 |
| `test/v2-review-fanout.test.ts` | 1,005 |

The gate cap remains 750. No waiver, cap increase, ignored path, changed gate or
behavioral change is authorized. The construction-only Script fixture on
`lucy-godfile-proof` invokes the existing whole gate against fetched `origin/dev`;
do not integrate that branch as a runtime predecessor. Full source/log identity:
`lucy-ci-evidence/godfile-before-run-identities.json` under the session temporary
root. Parsed declarations and complete test-call bytes before extraction are in
`godfile-closure-before-identities.json`; valid/invalid parser controls ran.

## Wave decision

Four disjoint existing-front work packages, all from the exact baseline above.
No shared write path or runtime interface redesign. Each author makes a small
linear commit stack on its own branch; each commit has one extraction concern
and a named predecessor. Keep per-commit review diffs within 400 changed lines.
The lead integrates actual histories, verifies source identities, obtains cold
review and runs the scoped remote gates. No worker opens or merges PRs or runs CI.

| WP | Author / branch | Owned paths | Context ceiling |
| --- | --- | --- | --- |
| F: fanout helpers | G1 / `lucy-fanout-split` | `src/v2/workflow/review-fanout.ts`, new `review-candidates.ts`, new `review-fanout-support.ts` | 35K |
| B: request bindings/artifacts | G3 / `lucy-binding-split` | `src/v2/tools/review.ts`, new `review-binding.ts`, new `review-artifacts.ts` | 30K |
| T: fanout fixture/tier tests | G5 / `lucy-fanout-tests` | `test/v2-review-fanout.test.ts`, new `test/fixture/lucy-fanout-data.ts`, new `test/fixture/lucy-fanout.ts`, new `test/lucy-tier-retention.test.ts` | 40K |
| G: governed fixtures/round test | G6 / `lucy-governed-split` | `test/lucy-governed-checks.test.ts`, new `test/fixture/lucy-governed-repository.ts`, new `test/fixture/lucy-governed-data.ts`, new `test/fixture/lucy-governed-host.ts`, new `test/lucy-governed-round.test.ts` | 50K |

### F: fanout helper extraction

1. Move `Merged`, source admission, outcome projection and their small supporting
   helpers into namespace `ReviewCandidatesV2`. Then move dedup/ordering and
   option selection in a separate commit. Preserve function bodies, constants,
   comparisons, source-range checks and ordering. A tiny local `unique` may be
   duplicated unchanged; do not introduce an unrelated shared utility.
2. Move routing/entry/tier helpers into `ReviewFanoutSupportV2`; then move
   brief/scoping/JSON-block helpers in a separate commit. Keep internal calls
   local and qualify orchestration call sites without import aliases. Type-only
   input references back to the orchestrator are allowed; runtime cycles are not.
3. Main keeps Session lifecycle, `RUNNING`, exact retained-tier selection,
   finish authorization, provider calls and publication barriers. No extra turn,
   state, budget or candidate behavior.

### B: request binding and artifact extraction

1. Move `deliverPage`, `PROBE_TIMEOUT_SECONDS`, `analysisStore`, `rawArtifactPath`
   and `reviewBinding` into `ReviewBindingV2`. Keep existing external exports from
   `MaestroReviewTools` through explicit re-exports; qualify its internal uses.
   The tiny existing `sha256` may be copied unchanged where both modules need it.
2. Move `planArtifact` and `codeArtifact` into `ReviewArtifactsV2`, preserving
   their Effect names, failures and byte bounds. Keep the newest-receipt reader,
   publication authority and tool registration in the main request module.

### T: fanout test extraction

1. Move immutable response/data constants and their builders into
   `lucy-fanout-data.ts`; keep the same exported names and values.
2. Move `run`, tree construction, `harness`, `brief` and `dataBlock` into
   `fixture/lucy-fanout.ts`, importing the same data. Preserve actual store,
   scope, port calls and fixture replies. No replacement implementation.
3. Move the two retained-tier tests verbatim into `lucy-tier-retention.test.ts`.
   The original file keeps all other test bodies. Named remote selections must
   include the new file; never silently drop the moved tests.

### G: governed test extraction

1. Move repository creation, `projectID`, `directory` and `restoreAlpha` into
   `lucy-governed-repository.ts`; its one module-owned temporary repository stays
   shared by the tests exactly as before.
2. Move immutable response/finding builders and parsing helpers into
   `lucy-governed-data.ts`. No copied test assertions or production logic.
3. Move the existing host graph and Session port into
   `lucy-governed-host.ts`, retaining the same mocks and real DB/registry services.
   Export the existing mutable objects by reference. The only necessary mutable
   binding adaptation is `scriptedMessages` to `scripted.messages`; all reads,
   writes and cleanup retain the same callbacks. No production execution claim
   is added to this scripted port fixture.
4. Move the registered plan-APPROVE/code-FIX_FIRST continuation test verbatim
   into `lucy-governed-round.test.ts`, importing those same fixture bindings.
   Keep the remaining tests and all Windows refusal assertions. The newest
   APPROVE/REJECT refusal test may remain in the original file if under the cap.

## Verification and stop line

No formatter, new assertions, changed responses, suppressed types, skipped test,
platform widening or changed numerical cap belongs in these extractions. Bodies
must compare identically after removing only `export`, namespace qualifiers and
the declared `scripted.messages` binding adaptation. Every original test call
must be recovered exactly once across the resulting test files. Parser failure,
missing declaration, duplicate or unmatched body is a failure, not an exception.

Authors run only named-file diff checks and calibrated syntax parsing locally;
no local tests, typechecks, build, generator, evaluation or benchmark. They push
their own branches early and return a compact commit/file map marked UNEXECUTED.
No automatic Relay stop hook is established; source comparison and remote gates
remain lead-owned. The lead runs the complete existing Godfile gate, all moved
and retained acceptance files, precision/finding controls and package typecheck.
Source identity alone is not behavioral or whole-gate acceptance. No campaign PR
is merged or epic-labelled by this wave.
