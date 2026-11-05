# Lucy campaign status

Canonical recovery state, updated 2026-11-05. Lucy is **not complete**.
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
Parser [#1334](https://github.com/gustavomhss/hugr-orchestra/pull/1334) and YAML
[#1335](https://github.com/gustavomhss/hugr-orchestra/pull/1335) are published,
unmerged, with explicitly aggregate-context evidence. Other actionlint PRs remain.

Active independent slices: zizmor 1.32.0 and oxlint 1.91.0 provisioning foundations,
not registered analyzers. Lead verification found corrupt SRI encodings in both
initial pin commits; both are **FIX-FIRST**, not accepted. Authors are correcting
them using actual archive bytes and independent hexadecimal test oracles. An exact
macOS minor-floor prerequisite at `bd806d969c` is Terra source-approved; surgical
platform CI is pending. No intermediate epic or campaign merge was requested.

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
