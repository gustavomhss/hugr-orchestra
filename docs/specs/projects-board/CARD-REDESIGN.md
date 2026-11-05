# Issue workspace: implementation wave

Owner approval: 2026-11-04, “ok do it”, following the proposal for Overview / Conversation / Executions / History,
provenance, branch and model visibility, and a terminal execution receipt. This wave delivers the issue workspace
and the data it needs. It does not claim full Linear/Jira parity.

## Acceptance spine

- C1: the real issue has four accessible, keyboard-operated views. Overview contains description, steps, proof and
  context; Conversation excludes execution packets; Executions groups explicitly attributed records by attempt;
  History contains changes and their reasons. Changing a view preserves the draft and changing an issue resets it.
- C2: creation records host-supplied seat, session, message, tool call and provider/model identity at the time of the
  call. Changing the executing seat/model later cannot rewrite it. Unknown historical identities remain unknown.
- C3: each execution shows its recorded seat, session, branch, PR, timestamps, outcome and the models actually found
  in provider-turn records, including model changes. It does not substitute the session's current configured model.
- C4: card telemetry includes every recorded attempt and exclusively attributable descendant session once. It does
  not include another card's sessions or silently allocate shared sessions. Missing measurements remain null/partial;
  subscriptions do not become zero-dollar API calls. Tokens retain separate input/output/reasoning/cache counters.
- C5: Shipped/Cut appends an immutable receipt with measured costs, counters and durations. Parallel provider-turn
  time is labelled separately from end-to-end time. Reopening and closing preserves previous receipts. No transcript
  prose enters the receipt and no agent writes telemetry manually.
- C6: anyone may create an issue; non-Maestro seats cannot update an existing issue or move it. They can request a
  move with a reason; only Maestro's move changes the stage. Creation identity cannot be supplied in tool/HTTP payloads.
- C7: thread association uses a host-recorded attempt number, not prose or guessed chronology. Existing unassociated
  notes stay available separately. Briefs/reports remain unmodified; no new formatting obligation is imposed on seats.
- C8: Overview properties expose creator versus assignee, creation model versus execution models, branch and PR.
  Missing data is explicit; long strings wrap and do not displace the issue. The five-lane board and view switch remain.
- J1 (human judged): organization and visual finish in dark/light, narrow/wide windows; no nested wall of notes.

Tests: `packages/core/test/board-execution.test.ts`, `packages/core/test/board-tools.test.ts`,
`packages/app-shell/test-browser/board.test.ts`, `packages/app-shell/test-browser/board-discussion.test.ts`,
`packages/app-shell/test-browser/board-executions.test.ts`. Tests run through `bun run test:ci` only.

## Contract and boundaries

Canonical wire shapes live in `packages/schema/src/board-execution.ts`, re-exported from Board. Execution telemetry
has its own read endpoint: ordinary `board_read` does not acquire a transcript-sized telemetry payload. A host-only
writer argument is recorded inside the existing append-only activity data; public inputs cannot set it.

Terminal receipts are attached by the host's common activity write boundary, including host queue transitions.
Notes acquire a nullable attempt number through an additive migration; old notes are never heuristically backfilled.

Review-driven corrections: preserve settlement `usageKnown`/`costSource` on messages, recover discarded availability
from durable events, and accept only provider-sourced positive USD as reported model cost. Catalog/OAuth and hosted
estimates stay unavailable. Independent review requests use invocation-specific note IDs (exact retry still deduplicates).
Shared exclusions mark attempt completeness partial. Async owner writes are fenced by project generation and form
revision, and every comment offers its original full text regardless of CSS wrapping.

Implementation is sequential across the shared schema, Core, generated Client and issue view. No implementation agent
chooses an interface. A cold, read-only critic reviews this acceptance spine independently.

Cold critic (2026-11-04): fixtures must distinguish creator/assignee/reviewer/mover, nested/overlapping/shared/foreign
Sessions, historical model switches, nonzero tool use, immutable measured receipts, and drafts across all areas. These
are acceptance assertions, not reasons to infer missing historical facts. Multiple attempts sharing one exclusively
owned Session count it once at card level but do not receive a guessed per-attempt allocation.

Progress: canonical contracts, trusted tool creation and movement requests, owner creation endpoint, separate execution
endpoint, provider-turn aggregation, additive note association migration, terminal activity receipts, generated Client,
and source issue workspace are implemented. Initial red Core baseline: Actions 41907399048. First scoped Core integration:
Actions 41908478890 (before the later legacy/overlap/measurement controls). No PR, merge or installed-app deployment
has been performed. The owner still owns J1 acceptance; source screenshots do not demonstrate a deployed backend.

## Verification evidence (2026-11-04)

All runtime suites below ran on GitHub Actions through `bun run test:ci`, not on this machine. This is scoped
integration evidence, not a full epic CI claim.

| Area | Run | Scope/result |
|---|---|---|
| Core | [41921519437](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41921519437) | Board executions/tools/queue/tree/snapshot + Session projector/recorded runner; passed |
| App | [41920704103](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41920704103) | Board DOM child suite, discussion and execution components; passed, including delayed creation and short wrapped comments |
| Maestro | [41920713085](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41920713085) | Governed chain, repeated-review association and roster grants; passed |
| Schema | [41920713110](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41920713110) | Board contract hygiene + usage/cost provenance optionals; passed |
| HTTP | [41921521992](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41921521992) | Authenticated owner creation, provenance spoof resistance, execution read, validation/refusals and existing owner writes; passed |

Mutation controls: shared-card inclusion failed with 210 instead of 160 input tokens in
[41910754776](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41910754776); mixing execution packets into
Conversation failed in [41914418403](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41914418403).
Ignoring usage/cost provenance failed the hosted, historical and real-settlement assertions in
[41921076586](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41921076586): unknown tokens became zero and
unavailable costs became USD 1.25/0.5. Controls were restored; the latter mutation ran only in an isolated snapshot.
Reverting review request IDs to validation/stage keys failed in
[41922088777](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41922088777): two review invocations produced
only one request-note ownership root. This control also ran only in an isolated snapshot.
Removing the project-generation fence and conditionalizing full-comment access failed both regressions in
[41922074801](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41922074801): the destination project reverted
to the submitted project's title, and Read disappeared for the short wrapped comment. All isolated controls were restored;
the passing runs above exercised the non-mutated primary worktree.

Independent static review first returned six findings, then rechecked their code and assertions and returned APPROVE
with all six resolved. It establishes neither runtime success nor human visual acceptance; the Actions runs and owner
judgment remain separate evidence. Local package typechecks and `check:guards --base origin/dev` were run separately.

Source-component visual checks used the full Board source at `http://127.0.0.1:4189/` with explicitly illustrative
API/context/Markdown adapters. Checked dark/light at 1280×800 and narrow Conversation at 800×900, plus the original
document reader and participant/reviewer models; additionally checked compact Executions at 640×900 and verified a
browser draft survives ArrowRight/Home tab navigation without submitting it. Current captures are under the session temporary directory
`issue-workspace-preview/review-{overview,executions,conversation-narrow}-*.png`; they are local evidence, not shipped
assets or authenticated production data. No installed app or server was stopped/restarted.

## Adversarial correction round (in progress)

The six xAI Grok 4.7 reviews of `be430b75f2` all requested changes. The earlier passing suites did not cover the
newly found scenarios; they are not evidence that those scenarios work. In particular the lead reproduced ArrowRight
from a focused issue panel switching cards and losing an unsent draft in the real source-component preview.

Correction acceptance extends the spine with executable regressions:

- Issue content/reader keys preserve issue, draft and focus; area switches reveal their tab/panel without resetting reader state.
  Revealing older notes pages by four and focuses the first new row. Back keeps the read note visible after incoming notes;
  removing it clears selection so reappearance cannot reopen it unexpectedly.
- Pending provenance says loading, failed initial reads say unavailable, and failed refreshes retain known data with retry.
  In-flight telemetry does not label known-attempt documents unavailable. Empty attempts have attempt-specific copy.
- Issue-write refusals are fenced by detail lifetime (including A→B→A), not only project lifetime. Late refusals identify the
  original issue outside the new detail. Vault completion cannot clear revised fields. Escape does not discard an open secret form.
- Unknown/empty/unrecognized Actions timing remains unmeasured, is refreshable, and cannot become zero in a receipt.
  The additive `billing_known` flag defaults false for legacy cache rows. Estimates use November 2026 standard x64 reference
  rates, not inferred runner sizes or invoices. Any included run without evidence makes the CI total unavailable.
- Terminal undo reopens only the attempts that its closure actually changed and that still retain that outcome/timestamp.
  Receipts retain their stored measurements; read-time activity/undone attribution distinguishes undone closures.
- GitHub follow revalidates current project/card state in the write transaction. Queue settlement revalidates before push
  and again at commit; code already landed remotely is audited explicitly even if the current plan must be preserved.
- Comment readers preserve literal source and cannot load note-authored resources. Execution Markdown uses a resource-free
  typographic allowlist plus original-source access. Supported links cross the platform boundary on primary and middle-click;
  unsupported links explain how to recover the original address.
  The board-local renderer uses the existing workspace-pinned `dompurify` 3.4.17 (already used by UI/session rendering),
  declared directly in app-shell so this stricter resource policy does not change ordinary Session Markdown or depend on
  a transitive import. `dep-new-added` is an expected review warning, not suppressed or treated as a gate failure.
- All receipts explain summed provider-turn time; CI is explicitly an estimate; per-model partial amounts disclose their scope.
  Refusals explain proposal/movement-request/resume actions rather than incorrectly claiming all tools belong to Maestro.

New red controls on Actions: [41929496331](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41929496331)
failed on causal undo, per-model partialness and unknown CI timing; [41930153158](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41930153158)
failed on reading keys and pending provenance (deferred-fixture isolation was then hardened to prevent cascading failures);
[41930918708](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41930918708) failed on history focus, original-source
reading, CI labelling and pending-attempt disclosure. J1 remains human-judged. No automatic merge or installed-app deployment is authorized.

Correction verification (scoped, not the full epic):

| Scope | Actions evidence | Result |
|---|---|---|
| Core execution/GitHub/queue/tools | [41935358263](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41935358263) | Passed; terminal undo, CI availability/refresh/reference provenance, concurrent PR close, dequeue/pause during an actual remote Git push, held admission on resume, actionable seat refusals |
| App DOM + Chromium reader | [41935230361](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41935230361) | Passed; real Board child suite, discussion/execution components, required real Chromium reader |
| Schema | [41935306427](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41935306427) | Passed; canonical identities, additive optionals, undefined omission and receipt/usage provenance |
| Owner HTTP | [41931953619](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41931953619) | Passed; authenticated owner routes and actionable paused-project refusal |

The Chromium reader is run by CI-discovered `test-browser/board-document-browser.test.ts`, which requires exactly one
successful, unskipped test. It drives `e2e/orchestra/board-document.spec.ts` on the Vite source server; the fixture replaces
only external context, not the reader, parser or sanitizer. It is explicitly not a production-server smoke test. DOMPurify's
upstream README warns that happy-dom is not a safe security oracle: the sanitizer/resource assertions moved to Chromium,
not to a sanitizer mock or weaker assertions. An actual routed image is the network oracle's positive control.

Mutation probes in a separate temporary snapshot: disabling GitHub/queue transaction fences failed both targeted cases
in [41932970641](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41932970641), observing Shipped instead of
Cut/Review. Allowing `img`/`video`/`src` failed the real Chromium resource assertion (3 nodes instead of 0) in
[41934567127](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41934567127). Both mutations were restored;
neither was applied to the primary worktree.

Source-component browser checks repeated the draft-loss reproduction successfully with the correction (same issue and
draft retained), measured keyboard scrolling while focus remained in the reader, and exercised pending/failed refresh
with illustrative adapters: Loading before settlement, no premature unavailable-attempt disclosure, then retained creator
and token total plus Retry after failure. Dark/light wide Overview, narrow light Conversation/Executions and dark reader
captures are `issue-workspace-preview/correction-*.png` in the session temporary directory. These remain source previews,
not installed-app/authenticated-backend evidence or human acceptance. Fresh cold adversarial review is still required.

## Follow-up to the correction reviews (in progress)

The cold xAI reviews of `ebe331b743` returned five `request_changes` and one limited source-only `approve` (Conversation).
The lead independently preserved every pinned reviewer checkout, qualified findings, and reproduced two workspace failures
in the real source-component preview: closing an extracted secret through X discarded its only in-memory copy; ArrowDown
from the project toolbar changed the open issue and erased its note draft. A synthetic credential was used; no owner key
or live backend was involved. This is not installed-app acceptance.

Follow-up acceptance:

- Every unsaved-secret dismissal shares a navigation fence: X, scrims, project/issue/epic/inbox changes and auxiliary sheets.
  Save/cancel guidance is visible; explicit Cancel discards the unsaved value. A matching revision is required before a
  save completion clears the form. No credential persistence or restoring keys into comments is introduced.
- Toolbar/navigation controls do not run board J/K/arrows; card navigation and area roving remain functional. Project
  boundaries clear transient failures. Errors identify the actual issue/project/intake/question target. An old pending write
  explains why another project's writes wait. Creation success remains visible after form edits without clearing them or
  stealing editing focus. Unattested legacy CI cells distinguish unavailable from unrecorded timing.
- CI discovery requires a complete paged, duplicate-free set, accepts nullable status without treating decode failure as an
  empty set, and fails explicitly for filtered searches beyond GitHub's 1,000-result cap. Private `discovered_pr` storage
  separates discovery attestation from cached numbers; failure withdraws the former, not the latter. Unknown run IDs remain
  retryable off the current PR head. A failed rerun cannot overwrite the previous evidence or reuse its billing attestation.
- Reconciliation-only landed-code events remain auditable but do not enter conveyor delivery timings. The audit claims an
  admission was held only if that update occurred. Actual shipments remain the positive control for timing metrics.
- Paused-project refusals distinguish the authenticated owner from a seat. Owner notes/resume and seat movement requests
  are exercised while paused, not merely named as next steps after resume.

New red controls: [41939887987](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41939887987) failed on secret
dismissal, toolbar keys, wrong-target/stale errors, edited-create acknowledgment and legacy CI copy.
[41939887400](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41939887400) failed on off-head timing retry and
second-page discovery. The queue addition first found a test-helper null/undefined mismatch, which was corrected; that
failure is **not** counted as proof that the ledger assertion detects the defect.

Follow-up scoped gates: Core execution/GitHub/queue/tools passed in
[41941652278](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41941652278); Board DOM/discussion/execution and
the required Chromium reader passed in [41940727801](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41940727801).
Owner HTTP passed in [41940728375](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41940728375).
Supplemental spend-consumer and edited-create focus assertions are tracked in the session ledger until their runs finish.

In the isolated follow-up probe, removing discovery invalidation left an apparently attested CI amount after malformed
discovery, and removing the ledger filter produced queue-wait time for an undelivered paused card. Both intended assertions
failed in [41941655572](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41941655572). Bypassing the shared secret
fence reproduced the missing credential in [41941653056](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41941653056).
The mutated files were restored and independently matched against the primary files byte-for-byte. The primary source was
never mutated. Fresh independent review and human/live-app acceptance remain required.

External contract cross-check: GitHub's official OpenAPI requires `total_count`, marks run `status` nullable and exposes
pagination. Its workflow-run timing endpoint also carries a retirement warning: see the linked provider limitation in
`CONTRACT.md`. No real account support was observed and no account/repository-level billing is silently substituted.

The new Portuguese copy was cross-checked against Microsoft VS Code's pt-BR localization, Mozilla Firefox's pt-BR
`aboutLogins.ftl` save/cancel/discard phrases and the Caldas Aulete entry for procedência; it retains existing product terms
such as issue and CI. Native-language visual acceptance remains
human-judged. Optional reader polish findings (malformed links, fragment/context-menu feedback, same-minute accessible
names, source-toggle focus) are recorded in the session review triage, not misrepresented as independently reproduced
security defects or as acceptance of absolute experiential perfection.

### Final hardening after `77a65bd106` review (validation in progress)

Six new cold `xai/grok-4.7` source reviews returned receipts/conversation approval and four requests for changes. The lead
verified every completed checkout remained pinned and clean before editing. The reviewed commit is preserved; corrections
are separate, not a rewritten history. These source approvals do not establish installed-app or human visual acceptance.

- A known off-head run can rerun without changing today's head SHA. Every included absent run ID is now revalidated, not
  only rows already unknown. A pending/changed attempt withdraws availability before timing reads while retaining the
  previous raw values and attempt. Missing timing remains unavailable, never zero.
- Per-run first matching-head observation (`observed_pr`) is separated from card scan freshness (`ci_scanned_pr`). The
  nullable additive migration backfills neither. The legacy `discovered_pr` column is compatibility data, not proof. A
  successful scan preserves cumulative legitimate prior-PR attempt costs without relabeling their association. Reassignment,
  including PR A→B→A, withdraws freshness; telemetry refresh preserves plan `time_updated`.
- Operation errors portal outside the Board container above scrim/peek. The typed dismiss name is **Dismiss operation
  error**, not **Close**. Failed question answers identify visible question text/ref. Secret Cancel is disabled while saving;
  a successful A→B→A note reloads the matching page without clearing a newer draft. CI missing/unattested copy is separate
  from the explicit aggregate partial flag.

Expected-red [41945989596](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41945989596) caught stale availability
for a known historical rerun and the missing distinct association field. Expected-red
[41945989771](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41945989771) caught private-ID question labels,
pending secret dismissal, A→B→A reload and CI copy failures. Its new Chromium overlay fixture failed for a missing platform
provider, **not** on pointer reachability; that setup was repaired before using the overlay as an oracle.

The existing real-Chromium resource/link/source regression remains required. Its wrapper now requires exactly two successful,
unskipped tests, adding the actual notice and production overlay styles with pointer hit-testing, real dismissal and preserved
issue/draft in dark/light and narrow/wide layouts, plus a scrolled full-page fixture. This is a component/overlay regression,
not the complete authenticated Board backend. Board DOM tests separately cover targeting and request-state races.

In the recompiled illustrative source preview the corrected button was hit-tested as reachable, 32×32 px, outside
`.board-root`, and its real click preserved the issue/draft. It remained reachable in light/narrow and in full page after
scrolling the Board container. Captures and exact measurements are in the session ledger. The fixture uses no live owner
backend; no app/server was restarted. Palettes were regenerated with the new stylesheet in `PALETTE_SOURCES`.

The first corrected Core run [41947407007](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41947407007) reached
the measured third-attempt replacement but failed an exact floating-point test comparison (`0.018000000000000002` versus
`0.018`). The assertion now uses a narrow numerical tolerance without rounding production telemetry. The rerun
[41948022179](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41948022179) passed the scoped Core cases.

Final interface gate [41948230265](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41948230265) passed Board DOM,
execution/discussion, generated palettes and the two required unskipped Chromium regressions. The new overlay fixture now
fills and positively asserts its draft before testing dismissal; a static textarea attribute was not a real entered value.
The earlier corrected interface snapshot raced palette generation and also exposed that fixture mistake; neither failure
was presented as a production regression or as a valid negative control.

Isolated mutation [41947848427](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41947848427) independently caught
reintroducing the unknown-only historical filter and reassigning old `observed_pr` to the replacement PR. The mutated Core
file was restored and hash-matched to the primary. The overlay's first mutation (`z-index: 0`) remained hittable in its
portaled stacking context and failed only on the old fixture value: **that run is not counted as an oracle calibration**.
With the corrected fixture, [41948502830](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41948502830) detected
the deliberately unreachable notice at the actual center hit-test (`false` instead of `true`), while reader security passed.
The layer mutation was restored and its stylesheet matched against the primary file. No final acceptance or merge is
implied; fresh independent review and installed-app/human acceptance remain distinct gates.

New pt-BR dismiss/answer copy was checked against Microsoft VS Code and Mozilla Firefox localization vocabulary and the
Caldas Aulete entry for *dispensar*. This is vocabulary evidence, not a native-speaker usability sign-off.

### Association-fence follow-up (validation in progress)

At `66d2f496ea`, five fresh cold scopes approved; telemetry requested two bounded corrections. The new expected-red
[41951770074](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41951770074) caught an in-flight PR A→B→A both
through edits and undo, plus omitted attempt identity on current-head and historical runs. No fixture failure was counted
as behavioral proof in this run.

The follow-up adds a private monotonic association revision, including historical restore/undo, and a nullable matching
scanned revision. Completion and consumers require the captured revision, not only the same PR number or same-millisecond
timestamp. An older PR watermark is not backfilled as revision-attested freshness. Run metadata lacking a positive integer
attempt now explicitly refuses measurement instead of guessing attempt one; raw previous evidence remains unchanged.
GitHub's OpenAPI makes this property optional, so omission is a local unsupported measurement state, not an assertion of a
GitHub protocol violation. Cumulative prior-PR costs and first observed association semantics remain unchanged.

This round changes Core/storage and its regression tests, not the approved UI. No PR, merge, installed-app deployment or
absolute experiential acceptance is implied.
GitHub API rate limiting initially interrupted monitoring of the scoped run
[41952238779](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41952238779). After access recovered, the existing
run and its log were retrieved without rerunning the suite: **61 cases passed**, including the new in-flight edit/undo,
current/historical invalid-attempt metadata and legacy-watermark cases. The first mutation upload was blocked before an
Actions run existed and supplies no negative-control evidence. Those mutations were restored and hash-matched before a
sequential isolated retry after access recovered. The retry
[42002457703](https://github.com/gustavomhss/hugr-orchestra/actions/runs/42002457703) produced five intended assertion failures:
legacy live attestation, the two association races, and guessed attempt identity on both metadata paths. This is a negative
control, not a product-suite failure. All intentionally changed probe sources were restored and independently hash-matched
to the primary, along with the regression file. Typecheck, migration consistency and guards also passed. These bounded
corrections are prepared as a separate commit; fresh independent review remains required.

Retained nonblocking follow-ups as recorded before the UX closure below (historical status):

- A question's optional reply input is uncontrolled in a page-keyed row and may reset on refresh. Main composer and secret
  state are protected; this is **not** a promise that every unsent input survives refresh.
- Body-portaled dismiss remains keyboard reachable late in document order. A dedicated Tab/Enter journey and a deliberate
  focus policy would improve ergonomics without stealing focus from ongoing edits on late failure.
- Strengthen the Chromium wrapper to assert individual required spec identities, not only both file paths and total two;
  today each file has one test and both are mandatory. Require a full viewport's scroll distance explicitly, and make the
  complete-receipt negative assertion target the current missing-timing sentence rather than the superseded copy.
- Reference-rate explanation still appears beside unavailable CI, without printing invented digits. Copy polish here is
  separate from telemetry integrity and from human visual acceptance across all palettes.

## Product backlog, not silently removed

Follow-on work: subissues; standalone milestones; labels and priority; dates; templates; related/duplicate links;
saved/combinable views; mention/reply threads and notifications; batch operations; cycles/releases. Existing
Project → Epic → Issue → Step, estimates and dependencies remain. None of these follow-ons is labelled shipped here.

## Retained UX closure (2026-11-05, in progress)

The earlier source approvals were not completion of the retained experience work. This bounded continuation preserves
the approved board/workspace and does not authorize PR, merge, deployment or installed-app changes.

- Optional reply drafts are owned by mounted Board memory and keyed by project/question, shared with the inbox. Live
  refresh and issue/inbox remount preserve text; successful acknowledgments match the captured edit revision, including
  A→B→A edits while pending. A newly mounted Board starts empty. Inbox focus and keyboard targeting use both identities.
- Late operation notices do not autofocus. The native dismiss button supports Tab, Enter/Space and notice-scoped Escape;
  intentional dismissal returns focus to the connected control the owner left without closing the issue.
- Chromium report validation is a **repair/strengthening** of the aggregate-only gate: required file/title identities are
  shared with the actual specs and selection; each needs one successful, unskipped Chromium result without retry or errors.
  Validator controls cover malformed/empty, substituted/duplicate, skipped, expected-failure and wrong-project evidence.
  Full-page notice coverage now requires more than one viewport of real window scrolling and preserves pointer testing.
- Pending CI source wording covers both never-fetched and withdrawn measurements. The money UI uses the existing typed,
  localized missing-CI explanation for new and older server source text, never a known zero. The receipt assertion names
  the current sentence rather than obsolete copy.

First Actions probe [42009248521](https://github.com/gustavomhss/hugr-orchestra/actions/runs/42009248521) confirmed the inbox
carried the first question's draft into the second. Its refresh test timed out because the fixture supplied the wrong
event property (`key` instead of `project`); that timeout is **not** evidence of refresh loss. The fixture was corrected.
Actions [42010034031](https://github.com/gustavomhss/hugr-orchestra/actions/runs/42010034031) then passed all 25 Board
journeys, including corrected refresh, pending edit/revision, failure and inbox isolation cases, plus the four validator
controls. The original notice failed the new Chromium focus-return assertion after keyboard dismissal; the document
security journey passed. This expected notice negative control is not an overall green result. Subsequent combined
implementation gates, additional shared-view/lifetime coverage, mutation probes, independent review, live-backend/visual
validation and the final epic remain pending. Implementation above is not a complete passing-test or human-acceptance claim.

Live-source validation now uses separate backend/Vite processes on 4096/3000, a scratch DB/home/XDG environment and a
dedicated `agent-browser` session, not an adapter or the installed app. Synthetic questions went through actual authenticated
HTTP writes: a note-triggered refresh retained the optional reply, issue→inbox shared the matching draft, and switching
questions kept separate text. An independent read-only SQLite connection confirmed the exact first answer persisted while
the second remained open with no answer. Screenshots were inspected in dark/wide and light/narrow; this is not human sign-off.

This live pass also found a genuine shell-integration gap missed by the standalone fixture: on narrow layouts the peek's
fixed containing block can be the chapter while its header is clipped by the Board page below the 38px marker. The
full-page button's center hits the chapter instead of the button; keyboard activation works. A temporary layout-containment
injection aligned the peek with the clipped page and restored actual pointer activation. The Chromium fixture now models
that chapter/marker boundary and requires header-center hit-testing plus full-page activation. `board.css` now explicitly
contains layout. After removing the temporary inline injection, computed source containment was `layout` and a fresh
close/open followed by an unforced pointer click opened the full page with the second draft intact. Its Actions red→green
proof is still in progress. The live owner UI also created a new isolated issue once: Properties shows **You**; an
independent SQLite activity read confirmed `actor: owner` / `writer.kind: owner`, with no invented seat/session/model.

Actions [42015087086](https://github.com/gustavomhss/hugr-orchestra/actions/runs/42015087086) passed all 26 Board journeys,
the draft and report controls, both Chromium journeys, receipt rendering and original-discussion checks. Its one failing
panel test requested unsupported locale `pt`, which correctly fell back to English; the fixture now uses the app's `br`
locale and preloads its dictionary. The pre-containment fixture's pointer check also passed on that CI browser, so it did
**not** falsify the live clipping defect. The strengthened test now requires explicit computed layout containment as a
cross-engine invariant as well as pointer activation. Its deletion must be mutation-probed rather than claiming the old
fixture was already a regression guard for this browser-dependent gap.

Corrected scoped validation is now green:

- [42015914466](https://github.com/gustavomhss/hugr-orchestra/actions/runs/42015914466): App source units, 26 real-client
  Board journeys, draft/report controls, both individually identified unskipped Chromium journeys, receipt rendering,
  English/Brazilian Portuguese pending-CI presentation and original discussion. Current changed package sources were
  independently hash-matched to that Actions snapshot; subsequent edits before this record were documentation only.
- [42016575223](https://github.com/gustavomhss/hugr-orchestra/actions/runs/42016575223): eight Core spend cases.
- [42016419391](https://github.com/gustavomhss/hugr-orchestra/actions/runs/42016419391): both requested App/Core typecheck
  tasks executed remotely, without Turbo replay. Palette generation and the source guards also passed; the prior
  documented DOMPurify dependency warning remains, with no dependency change in this continuation.
- [42016836087](https://github.com/gustavomhss/hugr-orchestra/actions/runs/42016836087): isolated negative control removed
  the reply revision fence, report file identity and explicit root layout containment. The two matching UI reply journeys,
  actual draft helper, substituted-report assertion and Chromium containment assertion failed for those exact defects.
  All intentional mutations were restored; the probe is clean and every captured package source hash-matches the primary.
  This failed probe is not a product-suite failure. The earlier original-source focus-return failure is separate evidence.

The retained UX items above are implemented and scoped-validated, not merely relabelled optional. Cold independent review
and the one final epic remain pending. Real authenticated-backend validation uses synthetic isolated data; it is not proof
of the installed app, provider/account support or human acceptance. No PR, merge or deployment is authorized here.

### Cold-review closure

Six fresh read-only `xai/grok-4.7` scopes approved code `d48b1ecce8` without blockers. Their low findings are being closed
before the epic, not silently deferred: the disposed inbox must acknowledge its shared draft but perform no new local
refresh/state update; remaining report fixtures explicitly exercise unsuccessful specs, standalone result errors and
failed/timed-out/interrupted executions; the Core test title now says unavailable rather than unfetched.

The inbox test no longer uses a disposed refresh as its completion oracle. It observes the matching draft acknowledgment
in the remounted issue, and counts real generated-client list admissions synchronously while retaining actual HTTP calls.
Actions [42020095333](https://github.com/gustavomhss/hugr-orchestra/actions/runs/42020095333) confirmed the old callback
admitted an extra read (29→30) after unmount. Direct project-filter, keyboard-answer, collapsed-row and pending same-question
edit scenarios passed. The new Portal fixture also has a parent Escape handler with a positive control: notice Escape
must not reach it, while Escape from issue content must close the modeled issue. This validates the outcome against a
functioning parent; it still does not mount the actual Board keyboard handler or replace live-app verification.

Follow-up [42020799088](https://github.com/gustavomhss/hugr-orchestra/actions/runs/42020799088) passed the real-client Board
journeys, actual draft helper, strengthened report controls and both required Chromium identities. Core spend including
the renamed case passed [42021572045](https://github.com/gustavomhss/hugr-orchestra/actions/runs/42021572045). App typecheck
[42021507680](https://github.com/gustavomhss/hugr-orchestra/actions/runs/42021507680) executed its requested task without
cache replay. Full logs were inspected, and package files exactly matched passing snapshot `f0144804c0`.

Propagation probe [42022098170](https://github.com/gustavomhss/hugr-orchestra/actions/runs/42022098170) removed only the
notice's `stopPropagation()` and **stayed green**. It does not prove that line is independently load-bearing. In Solid's
current synchronous dismissal path the Portal marker is removed before the delegated walk can follow its host into the
parent. The explicit stop remains defense in depth. The positive control establishes a functioning parent and the tested
outcome, not necessity of one particular safeguard. The probe was restored and package hashes checked again. No production
change or deferred-dismissal behavior was invented to force the mutant red. Final bounded review and the epic remain pending.

### First epic and structural recovery

Six fresh final `xai/grok-4.7` scopes approved `17fa78436f` without findings. That did **not** establish full-CI approval:
[42024210679](https://github.com/gustavomhss/hugr-orchestra/actions/runs/42024210679), cold at that exact source, finished
with five failed jobs. Every job reached a terminal state and the failed-job inventory was checked before rearming:

- Godfile: Board, project views, the Board DOM suite, Core Board service and GitHub suite exceeded their existing bounds.
- Linux App and Windows other/legacy: the E2E composite project omitted the shared Chromium-required identity helper.
- Linux E2E shard 2: five identity cases still expected nested active-tab glass, contrary to the existing design and CSS.
- Windows other/legacy additionally could not import either Chromium fixture: its Vite URL began `/@fsD:/…`.
- Linux Core: the 65 MiB stderr toolkit case waited for an unreachable output-produced marker after a fail-policy
  `omni.gap` report. The causal explanation remains provisional; a successful isolated rerun alone is not a flake proof.

Recovery code is `d9eb63dc5b`, after separate local extraction commits `e90732e898` and `921fca21cd`. Trail/ticks,
properties/history and project overview now have their own presentation modules. The shared GitHub fixture and reply
test registrations were moved, not deleted or rewritten. Independent comparison reconstructed both original test parent
files exactly, checked the lifted fixture/registration bodies, and retained the original view/helper function bodies.
Extracted markup matched after explicit reactive prop substitutions and indentation normalization; changed-source controls
were rejected. Core's service types were lifted verbatim, preserving `Board.Error` and `Board.Interface`; emitted service
JavaScript was identical with comments removed, and a changed-runtime control was detected. No public HttpApi changed.

The identity repair follows the pre-existing `DESIGN.md` tab rule: exact scheme/palette surface fill, no nested blur or
background image, and the authored contact shadow. Strip/sidebar glass fingerprints remain independent and unchanged.
Production CSS was not altered. The two Vite fixture URLs now use the existing Windows/POSIX normalization pattern;
required journeys, their assertions and fail-closed report validation remain intact. The E2E include adds only its missing
shared helper. No godfile limit, waiver, generated source or test requirement was relaxed.
This URL repair targets the observed drive-letter Windows checkout and POSIX paths; it does not establish support for
UNC-root workspaces. Cold review identified that residual in the pre-existing normalization pattern; no broader path or
filesystem-permission change is claimed here.

The unchanged toolkit suite passed all eight cases in
[42030329654](https://github.com/gustavomhss/hugr-orchestra/actions/runs/42030329654), with its Omni control passing.
Its uploaded source differed from recovery code only by the CI request file. Both App/Core typecheck tasks executed
without cache replay in [42030637477](https://github.com/gustavomhss/hugr-orchestra/actions/runs/42030637477), at exact
`d9eb63dc5b`. Complete job logs were inspected. Source guards passed with the existing DOMPurify dependency warning.

Godfile baseline qualification matters: the ordinary local full-clone invocation still reports two pre-existing generated
file overages against its older merge-base. An independent clone reproduced CI's shallow-dev fetch topology with the
unchanged gate: original source reproduced exactly the five epic failures; recovery source produced no errors. This is
not a claim that the ordinary local invocation passed. Neither generated files nor the gate were edited to hide the
difference. Scoped App/Linux/Windows, Core Board and identity/mutation results, fresh recovery reviews and the consolidated
epic remain pending at this record. Installed-app and human acceptance are still unproven; no PR, dev merge or deployment.

Recovery App [42030921506](https://github.com/gustavomhss/hugr-orchestra/actions/runs/42030921506) subsequently passed on
both Linux and Windows: all 26 real-client Board journeys, the moved reply registrations, both required real Chromium
journeys and E2E composite typing executed successfully. Each platform ran the 30-test outer selection across nine files;
complete logs and exact uploaded-source parity were independently checked. This scope makes no Omni-spawn claim.
Six fresh read-only recovery `xai/grok-4.7` scopes also approved `d9eb63dc5b` without blockers. The lead challenged and
obtained retractions of unsupported size and TypeScript findings rather than treating reviewer text as a failing gate.
Pre-existing private helper/map duplication was retained during the mechanical move; UNC support remains unproven as
qualified above. The actual detached reviewer trees were independently checked clean and pinned. These are source-review
verdicts, not substitutes for the still-pending Core Board, identity negative control or consolidated epic.

The remaining recovery scopes are now verified:

- [42032368381](https://github.com/gustavomhss/hugr-orchestra/actions/runs/42032368381): Core Board, GitHub mirror,
  execution and spend passed on Linux and Windows, 57 tests and 333 assertions per platform. Each Omni control observed
  ten real spawns and no delegation.
- [42033423353](https://github.com/gustavomhss/hugr-orchestra/actions/runs/42033423353): all eleven production-bundle
  identity cases passed on Linux and Windows, including the repaired dark/light/graphite surface checks.
- [42034717521](https://github.com/gustavomhss/hugr-orchestra/actions/runs/42034717521): the isolated negative control
  substituted only the active tab's authored surface background with transparency. Tests were unchanged. All four
  dark/light × English/Arabic cases failed at the exact surface-color assertion, receiving transparent instead of the
  required fill; the seven other cases passed, including graphite, whose palette supplies its own unaffected fill.
  The uploaded snapshot was independently checked to contain only that CSS substitution and the CI request file.

Both positive-run snapshots preserve every reviewed production/test/config blob; their other differences are chronological
documentation and the CI request. Full job logs were inspected. The negative-control copy was restored with a patch and
checked clean; every tracked App/Core blob in it and the primary matches reviewed code `d9eb63dc5b`. The comparison treats
tracked symlinks as link payloads, not their dereferenced files. Production CSS in the primary was never mutated.

All known first-epic corrections are now scoped-validated and the source is closed for one consolidated cold epic, with
all packages and the standard Linux E2E matrix. The complete-suite result remains pending; neither scoped passes nor the
review approvals establish it. The toolkit's earlier full-suite failure is not labelled a proven flake. Optional full
Windows E2E, installed-app validation and human acceptance are not implied by these results. No feature-branch publication,
PR, dev merge, deployment or installed-app restart was performed.

### Consolidated epic result

Cold full workflow [42035899354](https://github.com/gustavomhss/hugr-orchestra/actions/runs/42035899354) completed
**successfully, all 21 jobs**, at exact `8558585e283aa44cc03c91cd55640d811a29d645`. That commit adds only the chronological
recovery record to reviewed/scoped code `d9eb63dc5b`. Every job reached success; complete logs were retained and inspected.
The unit task summaries showed no Turbo test-cache replay. The actual CI godfile checked 5,144 source files with zero
errors, confirming the earlier independently reproduced shallow-base result. Linux Core completed with 4,359 passing tests;
the first run's toolkit failure did not recur, without changing its test, output bound or production implementation. This
observation does not establish a root-cause diagnosis for the earlier failure.

All three standard Linux E2E groups passed (160, 192 and 208 cases), with three declared skips in the workflow, not a
claim that every optional test ran. No retry/flaky records appeared in those group logs. Atlas and Relay also retain their
declared skips/todos. The two required Board Chromium identities and E2E composite typing executed successfully in the
Windows other/legacy job as well as the earlier focused Linux/Windows proof; they were not counted as skipped coverage.
Existing Omni legacy-rollback cells remain named rollback checks, not evidence of Omni execution.

This closes the requested code/review/scoped/full-CI continuation. The completion record is documentation only after the
tested commit; product/test/config source remains unchanged. Human acceptance, installed-app verification, full optional
Windows E2E and UNC-root support remain outside the demonstrated scope. No PR, merge to dev, deployment or installed-app
change is implied or authorized by the green workflow.
