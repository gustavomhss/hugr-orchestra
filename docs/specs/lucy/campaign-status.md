# Lucy campaign status

Canonical recovery state, updated 2026-11-06. Lucy is **not complete**.
The approved scope remains [build-plan.md](build-plan.md). Previous evidence and
failure chronology are preserved in [campaign-history.md](campaign-history.md);
its stale assignments and pending-job descriptions are not the current queue.

## Current outcome

- The four source-preserving extractions are already integrated at `9f96d8a358`.
  Their authors have returned; do not dispatch or merge those extractions again.
  Independent source review approved the binding/governed extraction and corrected
  fanout type-import paths. No Godfile cap or runtime behavior was changed.
- Published follow-up `lucy-import-closure` is `78b9205d48`, with test-import fix
  `8fe8a363a3` and explicit platform assertions. Ready-for-human-review
  [#1332](https://github.com/gustavomhss/hugr-orchestra/pull/1332) targets the
  extraction branch: three files, 83 changed lines, not a campaign bundle.
- CI `42083297344`: eight named files, **36 passing tests per OS**, no failures or
  skips, on Linux and Windows. Full logs and complete uploaded-source identity
  match `78b9205d48`, excluding only `.ci-run.json`, with calibrated controls.
  Windows asserts the Unix-only private PR store's named refusal, not PR support.
- Exact-head Maestro typecheck `42083150717` passed. Repository guards passed on
  that code. Maestro does not preload the omni control; no spawn-control claim.
- Existing whole-Godfile success `42062710453` was reconciled with construction
  `87ba1b5221`; failed acceptance `42062576055` with `9f96d8a358`. Both uploaded
  trees differed only by `.ci-run.json`. Completed executions were not repeated.
- Earlier scoped foundations remain preserved: Ruff `e021d7f38c` / `42046449942`;
  durable round `32d899eeb7` / `42057577022`; verified remote Client generation
  `42044527613`. These do not establish whole-module delivery.
- Luna reconciled the existing extraction PRs with #1332 as a positive control.
  Binding extraction B is now published as
  [#1333](https://github.com/gustavomhss/hugr-orchestra/pull/1333), based on
  `lucy-round-runtime`: three files, 319 changed lines, existing head `a3af682d80`.
  All three blobs match checked integration `78b9205d48`. Its PR explicitly reuses
  aggregate-context evidence, not standalone-head CI. No code or tests were redone.

## Current review

The owner retained the full seven-phase scope and authorized two isolated Luna
executors, with independent Terra review. #1332 remains source-approved and
unmerged. Actionlint integration `c041bec0e82e1492bfee4179f7842320ea47fdb1`
is source-reviewed; surgical CI `42130889821` passed 17 Linux and 16 Windows tests.
The full uploaded tree matches that candidate except `.ci-run.json`; exact-head
Core typecheck `42130544785` passed. Linux exercised real confined actionlint;
Windows asserted explicit refusals, not native scanner support. Full logs retained.
Parser [#1334](https://github.com/gustavomhss/hugr-orchestra/pull/1334), YAML
[#1335](https://github.com/gustavomhss/hugr-orchestra/pull/1335) and artifact pins
[#1336](https://github.com/gustavomhss/hugr-orchestra/pull/1336) are published,
unmerged, with explicitly aggregate-context evidence. Other actionlint PRs remain.

Ready-for-human-review [#1337](https://github.com/gustavomhss/hugr-orchestra/pull/1337)
contains zizmor 1.32.0 and oxlint 1.91.0 provisioning foundations, **not registered
analyzers**, at `94ffa86df9a80b032db9d4fe81b48458d264efce`. Lead verification
rejected and corrected initial SRI/entry errors; actual archive and notice bytes,
upstream digests, member mappings and independent hexadecimal oracles now agree.
Terra approved all source cuts and compiler closures. Pin CI `42134552865` passed
four tests per OS; changed oxlint assertions passed two per OS in `42134911007`.
Zizmor's erased type closure emits identical unit code, so its execution is reused.
Exact-head Core typecheck `42134910878` passed. The macOS minor-floor prerequisite
passed 58 tests per OS in `42133467336`, with an additional local macOS probe check.
Uploaded trees and full logs were reconciled; omni controls were not applicable.
Ready-for-human-review [#1338](https://github.com/gustavomhss/hugr-orchestra/pull/1338)
qualifies actual pinned version/clean/broken fixtures on Ubuntu 24.04 x64 through
production confinement: `42137781464`, three passing tests and eight omni spawns;
Core typecheck `42137782434` passed at tested code `88f2739920`. Full uploaded tree
and six raw output streams were reconciled. Final `5543840f9f` adds reviewed prose
only. Other native targets and general repository isolation remain unqualified.
Native report interpretation is integrated at `ddb334e3c4335424e6cd0824e79bc93a830617c0`.
Terra approved strict SARIF admission, URI/UNC closures, pinned exit settlement
and routing the real conformance reports through those implementations. Lead
mutations independently broke rule admission and strict UTF-8 refusal; intended
assertions failed and exact bytes were restored. All four acceptance items moved
from measured RED to GREEN. Linux CI `42145076599` passed 17 tests / 205 assertions,
including the actual confined binaries; omni control passed with eight spawns.
Exact-head Core typecheck `42145077027` passed. Uploaded source matched except
`.ci-run.json`; full logs and all six native phase output byte pairs were retained.
The small unmerged stack is contract [#1339](https://github.com/gustavomhss/hugr-orchestra/pull/1339),
parser [#1340](https://github.com/gustavomhss/hugr-orchestra/pull/1340), then
settlement/conformance [#1341](https://github.com/gustavomhss/hugr-orchestra/pull/1341).
The contract head intentionally remains dependency-RED; intermediate PR evidence
is explicitly aggregate-context, not standalone green.
Owned native input preparation is accepted at `87e70408452f3576c3b008424c0c34aa10b25a2c`.
The unmerged [#1342–#1346](https://github.com/gustavomhss/hugr-orchestra/pull/1346)
stack preserves isolated author histories; its final tree equals that runtime
anchor. Terra approved source and bounded closures; URI/marker mutation source,
logs and restoration were independently reconciled. Scoped CI `42153256682`
passed 20 Linux tests / 448 assertions and 17 Windows tests / 231 assertions, with
three explicit skips. Actual confined native cases passed with seven omni spawns;
Windows native execution is not claimed. A final fixture-only reason change passed
three affected tests per OS in `42153764182`; exact-head Core typecheck
`42153765947` passed. Guards have no gate findings and four reported fixture-text
warnings. Uploaded source, full logs and five native phase byte pairs are retained.
Strict informational native admission is accepted at
`d1e7bf9504255d856a47232f2f240042d0ddbcee` and published unmerged in
[#1347](https://github.com/gustavomhss/hugr-orchestra/pull/1347). Scoped CI
`42157905243` passed 21 Linux tests / 270 assertions and 19 Windows tests / 169
assertions, with two explicit native skips. Real Ubuntu x64 zizmor emitted and
retained `review` / `note` at exit zero; omni control passed with eight spawns.
Exact-head Core typecheck `42157904216` passed. Source, logs and six native phase
byte pairs were reconciled. Terra approved source and wording; lead mutation
verification rejected review/warning and restored exact source bytes. The legacy
parser is unchanged; original kind passes through projection but is not a Raw field.
Qualified production adapters are accepted at
`da00fd41f686eb4f8545e78104761b760089dd62`, published unmerged as
[#1348](https://github.com/gustavomhss/hugr-orchestra/pull/1348). Scoped CI
`42158916822` passed four Linux tests / 143 assertions and two Windows tests / 20
assertions, with two explicit native skips; ready-path native cases passed with
eight omni spawns. Exact-head Core typecheck `42158919556` passed. Terra found and
closed foreign toolkit-target selection; mutation `42159086477` removed that guard
and failed the intended Linux assertion. Full mutated source, logs and exact
restoration were reconciled. Locate observes status only; both actual host and
selected toolkit target must be Linux x64. Native provisioning is not qualification.
Next: catalog/controller registration and user/runtime guides. `analyze.ts` is at
its existing 750-line ceiling; integration must preserve that cap without waivers.
Neither scanner is registered; no intermediate epic or campaign merge is claimed.
Remaining phase-4 work and phases 5–7 stay open.

## Finite remaining queue, in order

1. Finish remaining existing small-stack PR packaging/publication reconciliation.
   B is published as #1333; F/T/G and remaining actionlint slices remain. Preserve approved import corrections
   when preparing F/T prefixes, rather than publishing broken old intermediate
   snapshots. #1331–#1333 remain unmerged; #1332's bounded source review and scoped
   execution are complete, not whole-campaign delivery.
2. Close remaining phase-4 obligations against build-plan WPs **4.1–4.5**:
   language packs/catalog integration, offline advisories, precision execution
   integration, sourced team-stack additions, docs and shipped skills. Reuse
   accepted slices instead of rebuilding them. Actionlint runtime/config isolation
   now has the scoped evidence above; broader module/platform/network acceptance
   remains open. The newest provisioning slices are not scanner delivery.
3. Complete phase-5 WPs **5.1–5.6**: confined build lane, Deep probes, read-only LSP,
   Deep/release routing, trees, docs and skills.
4. Complete phase-6 WPs **6.1–6.4**: audit/diligence, audit tree, artifact, docs/skills.
5. Complete phase-7 WPs **7.1–7.3**: compliance evidence, remaining leaves/packs,
   docs/skills. Direct ePrivacy/UK statutory capture remains an explicit source gap;
   uncaptured legal claims stay open/human decisions, never a compliance verdict.
6. Finish source-bound campaign integration, completeness/ToDo reconciliation and
   task-owned cleanup; only then run **one final bundled epic**. Delivery still
   requires the owner's authorized landing, not merely implementation or CI.

## Non-negotiable boundaries

Freeze each WP's demand, outcome, ownership, contracts, acceptance, DoD, validation
and stop line before execution. Use GPT-6.1 Terra for independent reviews and
GPT-6 Luna for simpler or voluminous, lower-complexity execution; do not silently
substitute another model if the assigned one is unavailable.
Small surgical local tests are owner-authorized; heavy checks remain in CI.
Build runtime bundles from `750a23b8ed` and actual slice histories, **never this
receipt branch**, whose reverted accidental runtime ancestry remains preserved.
No campaign/#1290 merge, intermediate epic, Atlas genesis, history rewrite,
owner app/server restart or broad cleanup is authorized. Interrupt only for a
genuine owner decision; keep implementation, review, execution and delivery distinct.
