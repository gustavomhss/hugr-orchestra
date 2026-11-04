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

## Product backlog, not silently removed

Follow-on work: subissues; standalone milestones; labels and priority; dates; templates; related/duplicate links;
saved/combinable views; mention/reply threads and notifications; batch operations; cycles/releases. Existing
Project → Epic → Issue → Step, estimates and dependencies remain. None of these follow-ons is labelled shipped here.
