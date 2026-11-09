# Inbox — wave plan

## Active campaign — local verification and external acceptance

### Independent review — substitute reviewer waived by owner

A separate reviewer completed a cold review of the Inbox implementation and returned **APPROVE** with live gates open.
Findings include pass results for auth/location isolation, read-only boundaries, Slack generation, cursor and atomicity handling,
Teams fingerprint, unsaved-token behavior and generated Client. One MINOR finding about public Schema `Pulled` lacking
`revision` has since been fixed: optional `revision` was added, Client regenerated, and schema/Core/app-shell/HTTP gates reran.
The reviewer also flagged unrelated worktree
contamination versus `origin/dev` (641 changed paths in the reported diff), outside the Inbox defect scope. This review
did not re-run live provider acceptance, CI, or native flows. Evidence: `evidence/independent-review.md`.

Active closure ledger: `closure-backlog.md`. Everything else in this receipt remains historical unless it is explicitly superseded. A clean Inbox-only extraction was also prepared at
`/Users/gustavoschneiter/.local/share/opencode/worktree/6d2de9/inbox-clean`; its local typechecks and scoped tests repeated successfully, and it remains uncommitted/unpushed pending explicit publication authorization.

### Natural Slack expiry — completed, 2026-11-08

The task grant's genuine stored expiry was allowed to elapse without modification and was observed after restart,
still with the same expiry. A production Slack status request rotated both tokens while preserving identity and
generation; subsequent acquisition completed read-only. A prior source-process launch attempt failed on an
installed-addon signature policy, so only the task's isolated compiled CLI was used for this refresh. That binary
predates the separate Teams fingerprint fix and therefore is not evidence for Teams. Natural expiry is closed for
this grant; provider revocation remains unverified. Evidence: `evidence/slack-live-acceptance.md`.

### Continued without a milestone stop — interaction and native acceptance

The owner again rejected stopping after a report. Continued through actual Sources/Customize keyboard focus
boundaries and Escape/trigger restoration. A clearly synthetic unsaved password-field sentinel stayed out of
local/session storage, cleared on source switch/unmount, and did not cause connect/send/origin-draft requests.
The resource observer's known-read positive control initially exposed a full historical timing buffer; a live
observer corrected the instrument instead of declaring false absence. All accepted assertions passed, with
temporary controls/observer removed. Evidence: `evidence/interaction-live-acceptance.md`.

Native acceptance completed in a second Electron build launched with `ORCHESTRA_TEST_ONBOARDING=1`, task-local TMPDIR,
independent profile, in-memory DB, no inherited credentials, an allowlisted environment and its own owned server/CDP 9333.
It opened the disposable project, exercised the real Inbox/read and Sources flows, and was stopped only after exact
command/listener verification and a clean shutdown. Existing apps/servers were not restarted. Build task:
`sh_1b0515119001AUSXB4TStOQk2A`; native launch task: `sh_1b052dbce0012QwTTJczNRzmuz`. Evidence: `evidence/native-app-acceptance.md`.

### Post-approval technical continuation — current status

No background validation had run between the visual approval and the owner's “eai?”; this was acknowledged,
then validation actually resumed. The approved visual materials were left unchanged.

- Full authorized local Core Inbox suite reran after the Teams fingerprint fix: **126 pass / 0 fail**, 1,464 assertions across fourteen files.
  This is local, not CI or independent review; prior mutation-probe evidence remains the non-vacuity basis.
  Omni reported not applicable, not a spawn pass.
- The three established public subscriptions all completed another actual API sync. Twelve genuinely new RSS
  entries arrived since the previous snapshot; the existing six items and their read attention survived, yielding
  eighteen retained items. New feed entries were read-only. YouTube remained successfully initialized/synced but
  supplied no new upload, so later-upload delivery remains unverified rather than declared passed.
- A calibrated secret-value scan compared the actual task grant, without printing it, against four successful
  authenticated Inbox API responses and the database/WAL/SHM bytes. Both access/refresh strings were detected in
  synthetic positive controls, absent from those sampled responses/files, and unchanged after the scan. This is
  bounded live evidence for API non-disclosure/encrypted storage, not a global secret-leak theorem. Method:
  `evidence/credential-live-sampling.md`.
- Natural-expiry endurance is now closed (see the completed receipt at the top). Provider-side revocation and
  human-message/thread samples remain open. Other providers still need legitimate
  Inbox API grants/registrations; browser sign-in alone is not one. A substitute independent review was waived by the owner and returned APPROVE with live gates open. No send, restart, CI dispatch or publication occurred.

### Owner approval — revised material depth

On 2026-11-06, after viewing the denser Inbox/cards and floating-modal revision, the owner approved:
“ta ok aprov”. This approves the revised visual finish and supersedes the visual-review-open status below.
It does not waive outstanding technical/live-provider acceptance, independent review, or authorize a commit,
push, PR, merge or release. The approved layout and revised materials should now remain stable during validation.

### Owner steering — replace the overly transparent, flat finish

The owner rejected the visual result: “glass transparente demais, cards e modais sem profundidade, volume,
sem efeito float, sem sombra”. This **supersedes the earlier visual approval**; do not report the revised UI as
owner-approved. Layout stays fixed. Inbox now uses a denser reading base, tonal raised card faces, contact and
broad shadows, upper/lower edge lighting and a distinctly floating modal with visible viewport margins. Shared
blur mechanics and global theme tokens are unchanged. Values are recorded in `packages/app-shell/src/orchestra/DESIGN.md`.

Actual dark/light captures, the 960×720 modal/focus oracle and calibrated revised text sampling are documented
in `evidence/visual-depth-revision.md`. Local Inbox/navigation/palette suite: 65 pass, 396 assertions / seven files;
app-shell typecheck completed; generator completed. No CI, review substitute or publication was used.
Final source guards: no gate/error, the same four warnings across 140 changed paths; whitespace check completed.

In parallel, the original YouTube pull endpoint genuinely recovered with 15 entries. The retained subscription's
first successful API sync silently established its baseline, repeated sync succeeded, and independent SQLite
confirmed 15 unique remembered identities. This supersedes the active 404 blocker, not its historical evidence
or the still-unobserved next-upload delivery. A second task Location also showed no inherited feeds/items/Slack
grant and rejected a known foreign feed ID with 400 without changing original receipts. At that date, natural
Slack expiry had not yet elapsed; it has since been closed separately. Methods: `evidence/public-feeds-live-acceptance.md` and
`evidence/slack-live-acceptance.md`.

### Continued campaign — isolated provider failure and measured glass samples

The owner again explicitly rejected stopping at the YouTube failure. Continued with independent diagnosis,
production failure-isolation probes and actual rendered contrast measurements, not another request for approval.
YouTube channel and uploads-playlist pulls still return 404; HN RSS works through the same pinned transport.
Feeder's operator documentation and Miniflux's maintainer discussion describe intermittent upstream feed 404s;
this corroborates the symptom without proving this installation's root cause. An actual API retry retained
the visible failed/uninitialized state, all existing item JSON and healthy subscriptions unchanged. The feed
route's authenticated positive control succeeded and its unauthenticated request returned 401.

Calibrated screenshot/background sampling in the real task Chrome tab measured Inbox list/detail and Sources
at two scroll positions in both base schemes. Lowest sampled text ratio was 5.57:1; synthetic passing/failing
controls measured 21:1/about 1.17:1. This closes the absence of *any* live glass measurement, not exhaustive
contrast acceptance: inputs, icons, interaction states, other palettes/viewports/native controls remain outside
the sample. No appearance change was needed. Method, rejected calibration attempts and limits are explicit in
`evidence/contrast-live-samples.md`; provider findings in `evidence/public-feeds-live-acceptance.md`.

Focused authorized local rerun: `feed.test.ts` in full **4 pass / 0 fail**, 37 assertions. The additional
two-file `-t feed` run passed five matching tests (78 assertions) but filtered fifteen out; it is explicitly
not the full two-file suite. These reruns reuse the prior recorded mutation evidence, not new independent review
or CI. Omni correctly reported not applicable; no spawn claim follows. Guards: 139 changed paths, no gate/error,
the same four warnings; whitespace check completed. The extra blank tab created by `agent-browser` attachment
was identified and closed; task app tab and owner tabs remain. No service was restarted in this continuation.

### Continued live verification — rotation, reconnect, process persistence and real feed changes

Continued after the owner correctly challenged an unnecessary stop. The assistant exercised all three discovered
public Slack channels, local disconnect with retained history, actual OAuth reconnection with a new generation,
rediscovery, and calibrated rejection of stale-generation selection/sync. No DMs were selected and nothing was sent.

The production backend genuinely rotated both Slack tokens after only the isolated credential's local expiry was
advanced into the past; identity, generation and new expiry were checked without exposing secret values. Subsequent
discovery/acquisition worked with the rotated grant. Only the verified task backend was restarted; a new process
recovered its encrypted rotated grant, scope, sync receipt and four historical/current-generation imports. The
previous read attention survived. This is real refresh under a controlled expiry condition, not a natural-expiry
endurance test or provider revocation. Detailed methods/controls: `evidence/slack-live-acceptance.md`.

Real public RSS later changed: explicit sync imported two genuinely new read-only entries. Mark read plus another
sync retained read attention without duplicate identities. A real public Atom feed established a silent baseline
of ten entries. Conversely, YouTube live acquisition **failed**: the valid channel's page returned 200 while its
pull feed returned 404, as did two other feed probes. The officially documented `/xml/feeds/` push-topic path was
an explicitly static empty feed, not a valid replacement. No misleading fallback/pass was introduced. Full source
and limits: `evidence/public-feeds-live-acceptance.md`.
An additional owner-Chrome diagnostic confirmed the real channel title/canonical ID and reproduced the feed's
404 with cookies omitted, so this observed failure is not exclusive to the backend transport. The diagnostic
tab was closed without changing existing tabs.

Current live blockers/limits: absent human/thread samples in the selected Slack public channels, actual
provider-side revocation, the other providers' genuine grants and
registrations, Jira/Reddit constraints and the still-spending-blocked permitted independent
review. Chrome authentication is now available; it is not equivalent to an Inbox grant for every provider.
Task backend is now PID 78667 (`sh_1bd6d411c001os6TVDKqitsv8S`) from the desktop acceptance's compiled CLI;
the prior web process stopped with the harness restart. Private state
remains isolated; no owner service restart, commit, push, PR, merge, CI dispatch or substitute reviewer was used.

### Slack live acceptance in the owner's authenticated Chrome

The owner enabled Chrome remote debugging and delegated execution. A pinned Chrome DevTools CLI connected to
the running browser (telemetry/CrUX off, network header redaction on, task-only filesystem root), without changing
global MCP settings or restarting Chrome. A new task tab exercised the actual full app and project chooser.

Slack OAuth completed successfully against the genuine provider; Sources and an independent production API read
confirmed the account/workspace. Six conversations were discovered, only one public channel was selected, and
three explicit snapshots completed. The first imported one channel-join event; subsequent syncs advanced receipts
without duplicating its identity. Mark read persisted, authenticated browser reopen retained connection/scope/read
state, and the third sync preserved read attention. The item remained read-only. No messages were sent.

This supersedes the isolated-browser Slack login blocker below. It does **not** close real-expiry refresh,
provider-side revocation, human-authored-message/thread samples or all other provider-account gates. Raw Slack
actor IDs/mention syntax remain visible on the observed join event. Full scope/limits:
`evidence/slack-live-acceptance.md`. The task instance and its private grant remain available for continued tests.

### Delegated live validation — public RSS and Slack login boundary

Owner explicitly delegated live validation (“voce pode fazer essa validacoa, nao precisa de mim”). The assistant
started the actual Slack authorization flow from the isolated app and followed Continue in Slack. Slack reached
its workspace sign-in page, not consent; the existing Slack developer tab also required sign-in. There was no
available authenticated Slack session in this browser. The pending local attempt was canceled through Sources;
an independent authenticated API read confirmed Slack `connected=false`, `state=idle`. This is a concrete login
blocker, not a requirement that the owner manually operate every validation step. No credentials were invented,
retrieved from other profiles or sent, and no Slack grant or message acquisition occurred.

The assistant also validated a genuine public source without a provider fixture: Sources followed
`https://hnrss.org/frontpage` in the disposable consent project and explicitly synchronized it twice. The first
sync established a baseline, confirmed through the production API (`initialized=true`, `state=synced`) with
zero Inbox items. A separate read-only SQLite query confirmed **20 remembered entry IDs** and an advanced
`checked_at` after the second sync. The UI showed Feed synchronized. This proves real HTTPS acquisition/parsing
and durable baseline storage for that feed, not later-entry delivery, every feed host or Slack interoperability.
The QA subscription remains only in the task's disposable database; no owner project was changed.

### Owner visual approval and delegated technical rerun

Owner explicitly approved the visual result (“do ponto e vista visual ta aprovado”) and delegated the tests
(“os testes”). Visual appearance is owner-approved; this does not certify measured contrast, native-only behavior
or live-provider interoperability. No further aesthetic approval is requested for the reviewed Inbox.

- Authorized local rerun: Core Inbox **125 pass / 0 fail**, 1,457 assertions / fourteen files; app-shell
  Inbox/navigation **49 pass / 0 fail**, 296 assertions / six files. Prior documented mutation probes remain the
  non-vacuity evidence; this rerun did not repeat them or establish an omni-spawn claim.
- Inbox HTTP effect and auth harnesses each completed **38 pass / 0 fail / 0 skip / 0 missing / 0 extra**.
  Initial invocations from the repository root failed to locate the script. Correct-package invocations then
  failed because the installed omni paths were not supplied; specifying the installed addon/supervisor fixed
  that environment error without disabling omni. The first configured effect run exceeded the shell's 120-second
  budget; a complete rerun with a longer shell budget produced the reported effect result. Auth completed normally.
- These are local checks, not CI or real Slack consent. No commit, push, PR, merge or provider grant was made.
- The task-owned consent instance remains available on 3005/4102, with separate state under
  `opencode/inbox-slack-consent-iy50xfl2`. Sources is ready for the owner's Connect Slack action. Its private
  scratch receipt records process/tab ownership; no OAuth approval was delegated to the assistant.

Remaining acceptance: real provider grants/accounts, Jira/Reddit provider constraints, permitted independent
review when xAI spending is unblocked, measured glass contrast and any unexercised native-only behavior.

### Continuation after owner approval — contract compatibility and complete-app proof

Owner steering: “ok, pode continuar, good work”. Scope remains local implementation/verification, no publication,
real grants or substitute reviewer. This continuation closes the gap between standalone fixtures and the full web
app and checks provider response shapes against primary references.

- Public Trello OpenAPI confirmed nullable system-notification creators/data and expanded board/card entities.
  The new regression failed against the prior strict decoder; this is now supported without collecting outside
  selected boards. Contradictory board identities fail. Sentry's official serializer confirmed nullable substatus;
  its new regression also failed before the fix. Null/omitted substatus now share a material fingerprint. The
  official Sentry reference confirms that project slugs are valid; no unnecessary project-resolution layer was
  added. Details/sources: `evidence/provider-contract-review.md`.
- Consolidated authorized local reruns: Core Inbox **125 pass / 0 fail**, 1,457 assertions / fourteen files;
  app-shell Inbox/navigation **49 pass / 0 fail**, 296 assertions / six files. Core typecheck
  `sh_1ae4a3e9d0017JE6dbCtv4Re5m` and app-shell typecheck `sh_1ae4b4890001qAcAnfgq7jrl1U` completed successfully.
  No public API or SQL schema changed in this continuation; Client regeneration was not required.
- The complete web app and production backend ran isolated on 3005/4102 with a disposable project selected via
  the real chooser (Add without git), no project-selection injection and no provider mocks/intercepts. Synthetic
  items were inserted through the actual public API using a guarded script. Native read/filter/theme behavior,
  persisted triage after authenticated reopen, real Sources private-feed refusal and save-without-acquisition were
  checked against independent API responses. Captures: `full-app-*` in `evidence/`.
- LocalStorage probes were calibrated and did not find the chosen content strings. Scoped axe checking was
  calibrated with an unlabeled button; glass contrast remained explicitly incomplete, not an accessibility pass.
  Complete-app page-error log was empty. Details and the one-shot web-auth/reload limitation are recorded in
  `evidence/full-app-acceptance.md`. This does not replace native desktop, real-provider or owner acceptance.
- Task backend/web PIDs 67309/67311 were identified before TERM and their jobs exited 143; only the new named
  agent-browser session was closed. The listener query that found those PIDs returned no listener afterward.
  Owner services/app/tabs were untouched. Guards reran with no gate/error and the same four recorded warnings;
  `git diff --check` completed. The seed helper also refused an unconfigured target as expected, before any request.
  No commit, push, PR, merge, CI dispatch or real grant was made.

Next blocking acceptance: owner-approved real provider consent/accounts, the unresolved Jira/Reddit provider
constraints, xAI independent review when spending is unblocked, and owner/native visual plus measured glass
contrast review. The new full-web-app proof narrows the remaining UI gate; it does not waive those requirements.

### Previous delivery receipt — retained for provenance

The approved ingestion paths now include Calendar as well as Board, GitLab, Trello, Sentry, PagerDuty and public
RSS/Atom/YouTube. This is local implementation, **not** complete provider/owner acceptance, delivered browser
OAuth for every source or permission to publish. Reddit stays approval-gated; WhatsApp remains contact-only.

- Final authorized local Inbox tests: Core **122 pass / 0 fail**, 1,449 assertions / fourteen files; app-shell
  **49 pass / 0 fail**, 296 assertions / six files. Shared capability regression tests: **84 pass / 0 fail**,
  1,722 assertions / three files. The omni control was explicitly not applicable; no omni claim follows.
- All Inbox HTTP effect scenarios: **38 pass / 0 fail**, no skip/missing/extra (`sh_1ae2e5815001f1bwfdBRTVm67b`).
  All Inbox auth scenarios: **38 pass / 0 fail**, no skip/missing/extra (`sh_1ae3012ca001QVFardJ9oVnvaP`). These
  exercise local API behavior/auth boundaries, not live provider grants or account interoperability.
- Calendar/Core, Server, Client and app-shell typechecks completed. Final Core recheck
  `sh_1ae396ccb001NTeoIZlhWqbhSA` and final app-shell recheck `sh_1ae3a43130010i3m1gRx3VGwjd` completed after the
  status-fingerprint, feed-address, status-copy and credential-payload refinements. Migration consistency completed
  after Calendar. These are local package checks, not CI evidence.
- Calendar payload review caught the Outlook selector being omitted from the connection request. The production
  connection-input mapping now preserves provider choice for both Calendar/mail; its regression test also keeps
  unrelated site/provider fields out of other connections. No Outlook grant was used to claim this fixed.
- Synthetic visual review used **agent-browser**, obtained via the documented `bunx` path after the bare command
  was not installed. The existing system Chrome ran in an isolated task-owned session; no personal browser
  profile, login, provider call or owner app was used. `script/inbox-communication.fixture.tsx?synthetic=1` passes
  an in-memory fetch to the real Client/Sources components; it never stores tokens or acquires from providers.
  This helper is not CI E2E or complete-app acceptance. No repository agent-browser dependency was added.
- Exercised Calendar discovery/select/save/explicit sync, GitLab/Trello/Sentry/PagerDuty settings/sync, RSS follow/
  sync and YouTube selection/follow. Dark/light captures are `calendar-sources-*`, `notification-{gitlab,trello,
  sentry,pagerduty}-*`, `feed-sources-*`, `youtube-sources-*` in `evidence/`. Visual review found a misleading feed
  idle message about saved credentials; feeds now have their own accurate status copy and were recaptured.
  Initial unthemed fixture capture was replaced after adding the real kit body marker. HMR while editing the
  portaled dialog produced Language-context errors; a fresh fixture reload and later interactions completed with
  an empty page-error log. This does not certify HMR or the full installed app. Native/owner visual review remains.
- Task-owned Vite on 3004 was PID 63278; its command was verified before TERM, its job exited 143, and the same
  listener query that found it then returned no listener. Only task browser session `inbox-qa-aae08b27b25e` was
  closed. No backend was started for the in-memory fixture; no owner service was restarted/stopped.
- Guards completed with no gate/error and four warnings: the verified exact SAX parser dependency plus three
  earlier migration-copy ignore annotations needing independent reviewer confirmation. No ignore/approval was
  added to suppress them. Final guard rerun after documentation/fixture cleanup returned the same four warnings,
  no gate/error; `git diff --check` also completed successfully.

Remaining gates (not invitations to invent credentials or change models): real provider registrations/consent and
real-account acceptance; Jira's unresolved zero-secret public-client constraint; Reddit approval; independent
review blocked by xAI spending; owner/native visual and long-copy review. Manual credentials are interim, not
delivered browser login. All changes remain uncommitted/unpushed/unmerged; no CI dispatch, PR or release.

## Historical continuation receipts

The following receipts preserve what was known at each stage; their "next", "missing" and pending-check text is
superseded by the current delivery receipt above.

### Latest continuation — Calendar vertical path and consolidated checks

Calendar now has Google events paging, Outlook calendarView, explicit discovery/selection and manual provider
connection, public routes/generated Client, Sources controls and persistent per-connection/calendar baselines.
Migration generated: `20261105235919_inbox-calendar.ts`. The ordinary first snapshot is silent; initial verified
pending invitations and later new/material events notify. Google matches primary-calendar identity, never blind
shared-calendar `self`; Outlook pending invitations are conservatively primary-only. Unknown cancellations and
disappearance do not invent meetings/cancellations. Known tombstones retain prior context. No RSVP or writes.
Removing scope/disconnecting drops baselines, not imported history. Empty scope collects nothing. Horizon is
seven days back / ninety ahead; remembered-event exhaustion (10,000 / 4 MiB/calendar) fails without eviction.

Local adapter/service/controller evidence covers invitation distinction, material baselines, preserved read state,
explicit discovery/save/sync, stale-generation refusal and SQLite-trigger rollback. Ignoring Google nextPageToken
made the empty-first-page acceptance fail; mutation was restored. Consolidated authorized local runs completed:
Core **121 pass / 0 fail**, 1,444 assertions across fourteen Inbox files; app-shell **48 pass / 0 fail**, 293
assertions across Inbox controllers/models/navigation. These runs preceded a small Calendar status-fingerprint
addition and provider-label refinement; final recheck remains due. No CI was dispatched.

Core typecheck `sh_1ae2a2771001IOkkYljsHUuevP` is running; the earlier Calendar typecheck found optional transport
arguments, which were corrected to explicit defaults. Server/Client/app-shell typechecks, all newer route effect/
auth checks, migration consistency, guards, and notification/feed/Calendar visual QA are still pending. User guide
now documents these paths and manual-credential limits. The earlier "Calendar missing" receipts below are history,
not the current implementation queue. Live consent/accounts, Jira public-client registration constraints, Reddit
approval and xAI independent review remain external gates. Continue verification; do not claim campaign acceptance.

### Current continuation — Wave 3 adapters and Wave 4 feeds

Do not stop at the older receipts below. Calendar remains the next missing acquisition path; Reddit stays
approval-gated and WhatsApp contact-only. The campaign is not complete or published.

- Trello/Sentry/PagerDuty now have generation-bound manual credentials, local scope/settings and explicit atomic
  sync receipts in Sources. Trello currently supports a manually supplied OAuth access token, **not** a legacy
  key/token pair or delivered OAuth browser flow; board IDs are explicit. Sentry uses sentry.io organization +
  explicit project IDs/slugs, optional environment and review-vs-assigned relevance. Empty Trello/Sentry scope
  collects nothing; Sentry rejects the `-1` all-projects escape. PagerDuty verifies `/users/me` with a user API
  token and collects only assigned open incidents, optionally filtered by service. Not on-call/export/auto-ack.
- Bounded provider paging covers Trello before cursors, Sentry Link/cursor/results and PagerDuty declared offset/
  limit/more. Headers select PagerDuty v2 explicitly. Per-source bodies/links are sanitized into read-only rows;
  no writes were added. Positive HTTP/DB/controller tests and malformed/cyclic/cross-origin cases were added.
  Ignoring Sentry Link was mutation-probed and failed the empty-first-page test, then restored.
- GitLab Core/app-shell/Server/Client typechecks completed for the prior GitLab batch. New GitLab effect routes
  completed **2 pass**, no skip/missing/extra. Later notification/feed additions still need their own final checks.
- RSS/Atom + YouTube now have explicit subscribe/list/sync/remove contracts, generated clients, a feed table
  migration (`20261105234041_inbox-feeds.ts`), a production Core checkpoint path and Sources controls. First sync
  establishes a silent baseline; later unseen IDs enter Inbox. Titles update an existing item without reopening
  read attention; removing a subscription retains imported items. IDs are subscription-bound and read-only.
- Feed requests use bounded HTTPS, per-hop public-address checks and a pinned resolved IP/socket with original
  TLS server name (no resolve-then-fetch rebinding gap). Local/private/special/transition address ranges are
  refused; redirect validation repeats before another connection. ETag/Last-Modified and 304 are supported.
  SAX parsing rejects DTD/entities, invalid roots/XML, missing/duplicate IDs, oversized fields and excess depth;
  no remote content, HTML execution, XInclude or attachment fetch. Network fixtures + address-vector tests are
  local evidence, **not** a claimed live-DNS conformance audit; independent security review remains pending.
- Limits: 50 feeds/location, 256 KiB response, 2,000 entries/document, depth 64, field 16 KiB, ID 2,048 characters,
  10,000 remembered IDs or 1 MiB per subscription. Exhaustion fails, never silently discards checkpoint history.
  First-baseline, later-entry, 304, malformed XML, cooldown, owner isolation, read-only egress and SQLite-trigger
  rollback of messages/checkpoint are covered through the production service. Parser callback shadowing was
  caught by the initial 304 fixture, corrected, and the later feed test completed.
- Added exact runtime `saxes@6.0.0` (ISC) after checking the npm registry; install used `--ignore-scripts`. Lock
  diff is limited to the new direct parser and retaining ExcelJS's existing saxes 5 resolution. Optional omni
  package registry 404 warnings did not prevent installation; no app/server restart or native build was run.
- Latest focused Core run (feed + work-service + notification-adapters): **23 pass / 0 fail**. New feed UI
  controller tests are added but not yet run. Core typecheck completed just before the latest feed fixture/UI
  additions. Whole-batch tests, new endpoint effect/auth checks, migration consistency, guards and new visual
  acceptance are still due; do not relabel earlier completed checks as these later ones.
- PT-BR terminology cross-check: maintained VS Code pt-BR `main.i18n.json` (read-only, synchronization,
  notifications) and Mozilla Firefox pt-BR `browser.ftl` (site notifications), plus the owner's approved source
  proposal. Product names/RSS/Atom/OAuth/API identifiers are preserved. Long provider-limit copy and regional
  phrasing still need native/owner review; no locale-wide completion is claimed.

Next: finish Calendar baseline/invitation/material-change semantics; run consolidated scoped verification and
record external auth/live/independent/visual gates precisely. No CI dispatch, commit, push, PR, merge or grant.

### GitLab vertical path — local continuation, verification in flight

- Manual GitLab credential/HTTPS instance (defaults to gitlab.com), local numeric project-ID scope, explicit
  sync/receipt and generation-bound settings/disconnect are wired through Sources, Core, Protocol and generated
  Client. Empty projects means all projects in the personal pending feed, not no collection or repository events.
- GET `/api/v4/user` verifies a user response; `/api/v4/todos?state=pending` follows bounded validated Link paging,
  including empty pages. Imports assignments, human mentions and review/approval requests. Unsupported actions
  (including CI and account/system notifications) do not fabricate project events or poison the supported feed.
  Foreign-origin target links do not become open/comment destinations. Imports are read-only, grant-namespaced;
  local read/archive never marks GitLab to-dos done. No pipeline ownership claim, OAuth login or live grant.
- Official reference: https://docs.gitlab.com/api/todos/ — personal pending feed, action names, target types and
  explicit mark-as-done write routes. None of those write routes was called or added to Inbox.
- Adapter/production-service/UI-controller tests were added. Deliberately ignoring GitLab Link made the
  empty-first-page acceptance fail (expected two items, got none); restored immediately. Project filtering,
  late-page failure rollback, cooldown and stale-generation refusal are covered locally.
- After an overloaded parallel verification batch timed out four existing slow/DB tests, the batch was rerun
  without simultaneous typechecks/preview servers, using `bun test --timeout 30000`: **106 pass / 0 fail**, 1,215
  assertions, eleven files. No test case/assertion was removed and the explicit GitHub 15-second budget was not
  loosened. This run preceded the small unsupported-GitLab-action parser improvement; its narrow recheck is due.
  Latest UI batch: **44 pass / 0 fail**, 253 assertions. No CI green is implied by these authorized local runs.
- Pending typechecks: Core `sh_1adfe9d1a0025MhAcrUJZn6O0d`, app-shell `sh_1adfe9d290016kllZeJqPByV8f`, Server
  `sh_1adfe9d38001wEWb4WjiCB2hhB`, Client `sh_1adfe9d38002IzT6ACE6JXUxuq`. GitLab effect/auth API verification,
  final guards and visual/live-account acceptance remain open. Client regeneration completed via `bun run generate`.

Next: Trello/Sentry/PagerDuty acquisition and scope; Wave 4 thereafter. No stopping at a completed internal block.

### Board projection and communication verification — in progress

Mail/Teams/Discord code paths above/below are implemented locally; their real grants/independent/owner visual
acceptance remain pending. Continue Wave 3 code while those concrete external gates remain recorded.

- Board owner questions and manual intake/held Review approvals now project read-only from projects linked to
  the current repository. No Board service/runner, GitHub refresh, owner answer or merge is invoked. Answered/
  withdrawn/resolved requests leave attention without deleting imported history; unchanged requests respect local
  triage. Project/card actors cannot join a human contact/commitment. Board handoff is refused both before
  orchestration and in the pure store, so owner decisions never return to Maestro.
- Public SourceKind/client was regenerated for `board`; no new endpoint or SQL migration was required. Board
  has its existing native action surface; Inbox does not duplicate answer/approval controls. Optional cross-project
  Board configuration is not implemented; current repository association is the acquisition scope.
- Real-DB Board acceptance initially passed, covering unrelated-project exclusion, pending requests, local read,
  material question change, resolution/archive, and refusal of require/handoff/send/origin-draft. Additional
  contact-collision and manual-intake filtering changes are in the final surgical rerun now.
- Communication UI capture completed after correcting the **capture helper**, not bypassing product controls:
  full-app first tries exposed project selection/connection prerequisites; the final isolated component fixture
  renders the production Sources dialog with synthetic Inbox HTTP responses. It discovers/selects/saves/syncs
  mail, Teams and Discord and captures dark/light. `communication-{mail,teams,discord}-{dark,light}.png` are visual
  evidence, **not live accounts or CI E2E coverage**. Browser errors were empty on the successful captures.
- The first visual pass found adjacent unread/save controls touching. Added existing-token spacing and wrapping
  action rows, reran the palette generator and recaptured successfully (`sh_1adf27b98001hGQzx6wz7uD4Gl`). No
  palette anchors/materials changed. Owner visual acceptance is still separate.
- Task-owned preview backend/web PIDs 47102/47104 were checked against commands on 4101/3003, then terminated;
  both owned jobs exited 143 and listener recheck returned none for those ports. Only the new task Review tab was
  closed. Existing 4096/4097/4098/3000 listeners and prior tabs were not stopped/restarted/closed. Isolated state
  remains under `$TMPDIR/opencode/inbox-communication-qa`; it contains no real provider grant.
- Final checks running: Core batch `sh_1adf59686001jMHpit4D875K1n`, UI batch `sh_1adf596d2001zl9c8cYsGSKuS2`,
  Core typecheck `sh_1adf596d4001JmST2WP36jdWjl`, app-shell typecheck `sh_1adf596d50014TIXlQCv80JHPD`, migration
  check `sh_1adf5979a001ieU8GmT7hkM9X9`. These pending runs are not reported as completed.

Next provider code: GitLab/Trello/Sentry/PagerDuty, then Wave 4. Do not stop the campaign at this receipt.

### Active continuation — mail / Teams / Discord

Owner correction: “voce mais uma vez parou no meio, compactei pra aliviar o peso”. Compaction and a completed
internal block are not stop conditions. Continue sequentially, with no substitute agent/model, commits or CI dispatch.

Implemented locally, not yet live-provider or owner-visual accepted:
- Sources now loads/saves connection-generation-bound labels/folders/chats/bot channels, explicitly discovers
  options, then explicitly synchronizes through the existing atomic receipt path. Loading Inbox/settings does
  not collect these sources. Empty scope collects nothing; mail defaults to Inbox, chats/channels to empty.
- Gmail label union follows opaque cursors independently and deduplicates; fixed spam/trash/draft/sent exclusions
  are checked again on fetched metadata. Optional externally-unread filter is separate from local attention.
- Outlook folder discovery traverses nested folders, excludes forbidden well-known subtrees, and uses immutable
  message IDs. Graph pagination checks origin, resource, original query scope, duplicate keys, cycles and budgets.
- Teams collects only selected chats, modified within seven days, with matching date filter/order, namespaced IDs
  and requested-chat binding when Graph omits chatId. Channels/attachments/deletion tracking remain out of scope.
- Discord uses a separate explicit manual **bot** connection, never a user token/selfbot. Discovery verifies
  effective VIEW_CHANNEL + READ_MESSAGE_HISTORY, including role/member overwrites; only server text/announcement
  channels are eligible. Acquisition verifies bot identity and broad Message Content entitlement, pages backward
  within seven days, and refuses missing content rather than claiming an empty personal Inbox. No DMs/threads.
- Imported communication items are explicitly read-only and blocked at both send and origin-draft service paths;
  legacy Discord first-page acquisition on list reads is disabled. Existing legacy rows remain preserved.
- Public communication contracts/routes were added and Client regenerated. Receipt SQL storage is unchanged;
  only its internal source union widened. Six manual credential sources retain location isolation.
- Local focused run: Core **100 pass / 0 fail**, 930 assertions, ten files; UI/controller batch **43 pass / 0 fail**,
  248 assertions, five files. Graph empty-page continuation was mutation-probed: ignoring nextLink made the
  acceptance fail; mutation restored. Latest new-route effect check: **3 pass**, whole-Inbox auth **27 pass**.
  Core, Server and app-shell typechecks completed. Later edits still require final scoped recheck and guards.
- Visual QA in progress: task-owned isolated backend `sh_1ade315f3001fpyi6Ou06iZuKT` on 4101 and web
  `sh_1ade315f3002HF7W25lariJXtn` on 3003, state under `$TMPDIR/opencode/inbox-communication-qa`.
  Do not stop other listeners: inventory found existing 4096/4097/4098/3000 listeners, contrary to stale prior
  recovery notes. New Review tab `tab_1b7b55d7-1a48-4029-aeb6-29c8c0a54ba3` is task-owned.
  `evidence/communication-capture.mjs` uses synthetic Inbox HTTP only, no provider calls/credentials. First attempts
  stopped at the real project-selection requirement; this is not visual acceptance. The corrected capture seeds
  project selection in its disposable browser storage and is running as `sh_1ade820e1001KYDgETX1yrgOhu`.

Next: complete visual/test checks and account for task-owned services; then continue the remaining campaign queue.
Browser login/registration and real grants are still external gates, not delivered by manual credential mode.
Waves 3–4 remain undelivered. Do not report the campaign complete from this internal receipt.

### Campaign continuation — owner “vamos em frente”, no per-block updates

Continue implementation without asking for approval or reporting each internal unit. External account consent,
app registration, independent review and publication remain separate gates, not implied by this instruction.
W1 real consent/visual review and the unavailable independent reviewer are concrete external gates; proceed
with code-only Wave 2 rather than claiming they passed. No new agents or provider/model substitutions.

Next acceptance targets: isolate all existing Inbox account credentials by location before extending acquisition;
preserve legacy unscoped credentials without silently adopting them. GitHub uses its actual personal notification
feed with assignment/team-mention coverage, bounded pagination, optional repository/reason filtering and own-PR
proof only for CI. Linear remains an assigned-issue snapshot with complete bounded GraphQL pagination, not a
native notification inbox. Existing explicit token mode must be labeled as such, not sold as zero-setup OAuth.
Official Linear docs confirm public PKCE and public-client refresh; GitHub docs confirm secret-free device flow
and device-issued refresh. Neither permits inventing a client id or repurposing another product's registration.
Registration/real consent are pending, not a reason to create HuGR hosting or distribute a shared secret.

### Wave 2 continuation receipt — GitHub/Linear (local, not release acceptance)

- Existing manual credentials for **all five** account sources are now location-hashed and owner-checked;
  inherited and legacy global `inbox.*` entries are preserved rather than adopted/overwritten. New connection
  generations protect GitHub settings, work sync and disconnect at the HTTP boundary. Reconnecting resets
  settings/receipts and remounts the corresponding UI controller; a stale request cannot affect the new grant.
- **Usable work-source path in Sources:** save a supported manual credential, optionally configure GitHub's
  repository/review/mention/assignment/own-CI filters, explicitly synchronize, read the durable verdict, and
  disconnect locally. Saving settings/status reads never collect. Disconnect leaves imported items/provider
  authorization intact. Empty GitHub repository selection means the entire *personal unread notification feed*,
  clearly labeled; it is not the Slack empty-selection contract and not all repository events.
- GitHub reads its real unread Notifications feed, follows validated `Link` headers even on an empty page,
  includes assignment/team mentions, and proves own-PR authorship only for CI. A mismatched PR response URL is
  not accepted as evidence. Unsafe/unsupported subjects cannot enable a fabricated comment destination. Optional
  filters are local and do not reduce permission. Missing CI proof excludes that candidate, not the ownership rule.
- Linear uses a supported personal API key header (not OAuth Bearer), a personal-assignment GraphQL query and
  cursor pagination. Errors/partial responses, missing completion, cycles and a changing viewer fail acquisition.
  The query is an assigned-issue snapshot, not the native Inbox. Title/state/priority/due-date fingerprints reopen
  attention only for material changes; `updatedAt` alone does not. GitHub revisions similarly reopen only changed
  notifications. The first revision on an older row attaches a baseline without a fabricated event.
- Work acquisition is explicit (no longer triggered by Inbox list reads for GitHub/Linear), bounded to 100 pages,
  and committed with a per-source receipt in one transaction. Failed pages import no partial snapshot and retain
  earlier items. A receipt-write failure rolls back inserted messages, proved with a real SQLite trigger. HTTP
  429 and GitHub rate-limited 403 responses preserve retry delay; permission-denied 403 is not misclassified.
  Filter changes cannot bypass cooldown. No background poll, provider-side mark-read or automatic send was added.
- Public contracts/clients cover work sync, Github settings and local manual-account disconnect. Clients were
  regenerated through Client; the small transport addition returns only needed Link metadata, retaining the
  original body-only API for existing callers. Two additive generated migrations create work receipts and add
  nullable item revision; no new destructive migration or universal rule engine.
- **Latest surgical tests:** Core nine files **90 pass / 0 fail**, 750 assertions; app-shell five files
  **42 pass / 0 fail**, 212 assertions. Real loopback HTTP, real credential DB and production Inbox commit paths;
  no live accounts/global fetch replacement. The Link-pagination test failed when Link was temporarily ignored,
  then the mutation was restored. Tests exercise both unchanged/read and material-change/reopen directions.
- **API receipts:** after the generation-bound contract change, effect mode `/api/inbox/account` had **4 pass**
  and `/api/inbox/github` **2 pass**, no skips/missing/extra routes. A final whole-Inbox auth run after requiring
  generation on the new work requests had **24 pass / 0 fail / 0 skip**. New-route effect
  cases primarily prove disconnected/auth/schema boundaries; successful acquisition is tested in production Core
  plus HTTP/SQLite and the UI SDK controller fixtures, not a real provider grant.
- Final Core typecheck completed (`sh_1add39bd2002N5kF8q5T7hYoMx`); app-shell also completed. Client and Server
  completed after generation binding, before the internal revision column. Final migration consistency check
  completed (`sh_1add39bdb001z7GS758EveSKl5`). A zero-argument keyed Show child was caught by app-shell typecheck and corrected;
  the later app-shell run completed. No cancelled/failed check counts as green.
- Latest guards: **0 gate / 3 warn / 0 errors**, 78 rules, 111 changed paths. The same three reviewed-copy
  migration exceptions still require independent confirmation; no approval label or rule weakening was used.
- Official read-only references verified: Linear `oauth-2-0-authentication` (PKCE and refresh without secret),
  `graphql` (personal API key vs OAuth header; GraphQL errors), `rate-limiting` (429/Retry-After), and GitHub OAuth
  authorizing/device flow (no secret for device and device-issued refresh). No application id was invented or
  borrowed from another product. These are auth feasibility findings, **not delivered OAuth connections**.

**Still pending / next:** real app registrations and consent for zero-token GitHub/Linear login; real-account
and visual acceptance; independent review. Continue Wave 2 with mail/Teams/Discord's explicit scope rather than
calling their old first-page adapters complete. Teams/mail selection, Linear optional team/project scoping,
unassigned-issue reconciliation and comment/subscription feeds remain undelivered. Waves 3–4 are still future.
All changes remain uncommitted/unmerged. No live source call, provider registration, app/server restart,
preview relaunch, CI dispatch, push/PR/merge or agent/provider substitution occurred in this continuation.

### W1c acceptance and receipt (retained history; Wave 2 continuation above supersedes its queue state)

Owner approved a usable selection → acquisition block. Work stays local and sequential; no new agent,
provider access, consent, process restart, commit or CI dispatch is implied.

Acceptance order:
1. Inbox storage is location-keyed (project/directory/workspace). Two locations can store the same provider id,
   and edits/drafts/egress in either leave the other and legacy unassigned data intact. Legacy data stays under
   an empty, unassigned owner; never guess its project. Item ids must not address another location by collision.
2. Slack connection generation is stable over refresh and replaced on reconnect. Discovery, selection and
   checkpoint commits must validate that generation; disconnect/reconnect cannot reuse an old selection.
3. Cursor-paginated member conversation discovery; explicit validated selection; an empty selection collects
   nothing. No API call to the owner's Slack until their explicit connection/collection action.
4. Bounded, resumable history and replies acquisition, deduplication and atomic data/checkpoint writes. Report
   unfinished pages, unavailable history and rate-limit delay honestly; no partial-success label. Imported
   messages are read-only and cannot fall through to legacy bot send bindings.
5. Existing Sources dialog gains selection and sync feedback without replacing the approved Inbox. Preview
   stays inert. Regenerate contracts through Client, then focused tests/typechecks/guards and guide updates.

Implementation first addresses storage isolation; this prerequisite alone is not a completed W1c or wave.

### W1c implementation and verification receipt (local, 2026-11-05)

- **Delivered in code:** Sources → Slack discovers member conversations page by page, persists an explicit
  allowlist, then starts a bounded synchronization batch. Selection alone does not collect. Empty means none.
  Closing the panel stops its next requests; committed pages survive re-opening. The existing standalone Inbox
  layout stays intact. OAuth imports are read-only, including service-side refusal of legacy send/origin-draft.
- **Acquisition boundary chosen for this block:** a fixed seven-day text snapshot, including separately paged
  replies to roots in that window; not complete account history, old-root activity, attachments or deletion
  tracking. UI/guide state this explicitly. One request acquires one page; one user click handles at most 20.
  Incomplete work stays pending. Run budgets: 1,000 pages / 2,000 queued jobs; up to 200 selected conversations,
  10,000 discovery entries. A budget failure is not success. No automatic/background collection was added.
- **Durability/isolation:** migration adds owner to all three Inbox keys, preserving old data under an empty
  unassigned owner, with no guessed attribution. New item ids are UUID-based. Slack selection/jobs are persisted
  separately, connection generation is checked under the auth lock, refresh preserves it, and login replaces it.
  Each page's messages and checkpoint share one transaction. Reimport updates content without resetting triage.
  429 persists Retry-After; editing the selection cannot bypass cooldown. Malformed/cyclic/limited responses
  remain visible as incomplete. No owner account was contacted; provider HTTP fixtures use loopback only.
- **Calibration:** the isolation acceptance first failed against the global store (shared item id). A temporary
  mutation reporting every page as synced made `explicit selection imports…` fail at pending-vs-synced; it was
  restored before the successful batch. SQLite triggers test both failed message writes and failed checkpoint
  writes *after* message insertion, checking rollback and retry; a fresh Inbox layer proves persisted resume.
- **Latest focused local gates:** Core six files (`location-migration`, `slack-sync`, `service`, `slack-auth`,
  `inbox`, `jira`) **75 pass / 0 fail**, 487 assertions. App-shell scope/login/model/navigation four files
  **38 pass / 0 fail**, 196 assertions. Omni explicitly not applicable. No full/epic CI was run.
- **HttpApi:** all eight Slack routes **8 pass / 0 fail / 0 skip** in effect mode and the same in auth mode.
  New-route scenarios prove disconnected refusal/auth/schema boundaries, not live provider access. Success-path
  acquisition is covered by the production Core service plus actual loopback HTTP/SQLite fixtures and UI SDK
  controller fixtures. Public clients regenerated via `packages/client` generate, never hand-edited.
- **Types/migrations:** Core, Server and app-shell `bun typecheck` completed after correcting an imported
  transport `Request` type that shadowed the browser callback's `Request`. `bun run migration --check` completed;
  generated schema/snapshot/registry agree. The earlier interrupted migration generation was resumed through
  the generator, not patched into the generated schema by hand.
- **Guardrail:** `guardrail-usage` was unavailable via skill lookup; read the actual rule and engine instead.
  `migration-destructive` is an added-lines rule (`clearedBy: ignore` in `script/guards/run.ts`). Its three table
  swaps copy every old row into the replacement table first, verified by `location-migration.test.ts`. Each has
  a line-local reason. Guards now report **0 gate / 3 warn / 0 errors**; the warnings require reviewer confirmation
  of those exceptions and are NOT called a zero-finding result. No approval label or rule weakening was used.
- **Remaining acceptance:** real Slack consent/acquisition, visual approval of the new selection controls and
  independent review (xAI still unavailable; no agent/model substitution). The historical approved Inbox finish
  is not evidence for these new controls. The infrastructure restart cancelled prior preview services and
  in-flight checks; cancelled checks were not counted. No owner app/server was stopped/restarted by this work,
  and no replacement preview process was launched in this verification block.

**Queue:** W1c implemented locally with the above automated evidence, not released/merged or live-accepted.
Keep real consent and independent migration-exception review as named gates. Jira public-client OAuth remains
blocked; Waves 2–4 have not started. No commit, push, PR, provider installation change or release was authorized.

## Current queue — restart recovery (canonical)

**Baseline:** worktree `shiny-harbor`, detached HEAD `9fcb899d50867c1ddc3f25d8345ac9fd8009d788`.
Existing Inbox code, generated client, navigation, guide and visual finishing are uncommitted; no feature
commit or merge is present on this HEAD. Historical plan below is retained, not restarted. No child agents
were dispatched in the prior visual work. Other sessions' branches/worktrees are not this task's cleanup scope.

**Evidence reconciled:** prior package typecheck, palette generation, guard run and manual dark/light/narrow
rendering completed in this session. Typecheck log `sh_1ac2d576b00191ELvPOExo1E7c.out` and material/capture log
`sh_1ac2d578a001my5BjrkjivJmlY.out` survive under the session shell directory. The referenced `waiting-shot`
temporary image directory is missing after the restart; its images cannot currently be reopened. Prior text
receipts are retained, not relabeled as new runs. Preview Vite/backend jobs were cancelled by infrastructure;
the listener inventory has no listener on their previous ports 3001/4097. The owner's processes stay untouched.

### WP inbox-recovery-close

- **Observable result:** the existing standalone Inbox is recoverable and reviewable, its changed decision
  logic has measured surgical test results, and remaining aesthetic/integration approval is stated honestly.
- **Demand/context:** finish the already approved standalone layout with Orchestra's materials, distinct message
  and notification actions, source icons and safe explicit sends; resume rather than redesign after restart.
- **Dependencies:** existing source at the baseline above, installed Bun/dependencies/native assets; isolated
  task preview infrastructure for new screenshots. Reuse completed typecheck/palettes/guards unless source changes.
- **Owned surfaces:** `chapters/inbox/*`, Inbox i18n/navigation tests, guide/design notes, this queue, and task-only
  review artifacts/processes. Backend Inbox test files may be executed read-only; edit only for a concrete failure
  attributable to this feature under a separately specified fix. No other session's files or resources are owned.
- **Excluded:** new provider connectors, WhatsApp pipe, seat/charter changes, unrelated repo cleanup, global theme
  redesign, app/server restart, full/epic CI, commits/push/PR/merge before the owner's outstanding approval.
- **Invariants/contracts:** route `/orchestra/inbox` remains independent; approved filters/split layout stay;
  provider capabilities remain honest; preview never calls account/send/draft/triage routes; review freezes exact
  text/destination before explicit send; no agent sending; no stored preview rows; contracts/client stay unchanged.
- **Acceptance/completeness mapping:** R1 preservation → baseline + source inventory; R2 behavior → exact UI model
  and navigation test files; R3 existing domain safety → exact Inbox core test files; R4 presentation → prior
  material receipts plus recovered preview/current screenshots if infrastructure permits; R5 release truth →
  statuses below, no claim of aesthetic approval, CI or merge from local test success.
- **Quality/DoD:** scoped review against these criteria only; actual implementation tests, no weakened assertions;
  any concrete fix is simple, secure, readable, token-based and consistent with repository style, with proportional
  validation. No extra blur per card or unrelated startup/session work. Update this queue with commands, outcomes,
  blockers and source identity; collect only task-owned auxiliaries. Integration remains a distinct owner gate.
- **Execution:** fingerprint existing source; run UI and core surgical batches independently/in parallel; review
  only affected safety/material boundaries; fix named findings only; recover just the unavailable presentation
  evidence if feasible without touching the owner's services; report once. Local runs use `ORCHESTRA_LOCAL_TESTS=1`
  under the owner's new authorization. Any new agent must be exactly `xai/grok-4.7`; no substitution.
- **Stop:** when R1–R5 have evidence or an explicit real blocker and task-owned resources are accounted for, stop
  this WP. Optional improvements do not reopen it. Aesthetic approval and final bundle integration are not waived.

| Obligation | Current status |
| --- | --- |
| R1 Reconcile/preserve source and prior completed work | Complete; source fingerprint and prior logs retained |
| R2 UI decision/navigation surgical tests | Complete: 27 pass / 0 fail, exact two files below |
| R3 Existing Inbox domain surgical tests | Complete: 32 pass / 0 fail, exact two files below; no omni/process claim |
| R4 Latest finish/source catalog review | Owner approved the live finish: “ta otimo”; images retained in `evidence/` |
| R5 Final bundle/CI/integration | Not started; no intermediate epic or implicit approval |

**Recovery receipts:** Bun 1.3.14, macOS x64. Exact newly authorized runs:

- App shell: `ORCHESTRA_LOCAL_TESTS=1 bun test --conditions=solid ./src/orchestra/chapters/inbox/model.test.ts ./src/orchestra/navigation.test.ts` — 27 pass, 0 fail, 154 assertions.
- Core: `ORCHESTRA_LOCAL_TESTS=1 ORCHESTRA_OMNI_CONTROL=declared bun test ./test/inbox/inbox.test.ts ./test/inbox/service.test.ts` — 32 pass, 0 fail, 257 assertions. Omni explicitly reported **not applicable**; no process spawning was exercised.
- Presentation/test source batch SHA-256: `38a23676fa5964ebc7a6baba5ce1f1b8df811f19144cd76272e4710b297918bd`.
  This fingerprints the explicitly listed UI source/test files and two core test files in the shell receipt;
  dependency/untouched source baseline remains HEAD above and its unchanged lockfile. It is not a whole-repo digest.
- Prior typecheck, palette generation and send-preview interaction receipts are reused; no product source
  changed during recovery. Guards run once for the new recovery documentation/artifacts. Lead scoped review confirmed the DEV fixture branch,
  account-panel guard and action thunk still isolate preview writes; this is not a new whole-feature audit.
- Missing images were regenerated from actual renderer source, with no injected CSS, into
  `evidence/recovered-inbox-dark.png`, `evidence/recovered-inbox-light.png`, `evidence/recovered-sources-dark.png`.
  They use synthetic fixtures and a new isolated task DB/XDG/key directory, never the owner's database.
  `evidence/capture.mjs` preserves the capture procedure; run from `packages/app-shell` only against a task preview.
- First capture hit a 60s `domcontentloaded` timeout. Both services were healthy; the necessary retry waited for
  navigation commit plus the actual Inbox heading and completed. The failed attempt remains in the session log.
- Source fingerprint tool initially rejected ArrayBuffer; corrected to Uint8Array and completed. No test was rerun
  for that tooling error, and no source bytes were changed to obtain a result.
- Task-only preview jobs `sh_1acc3999200136KYf32rGT01EM` (backend) and `sh_1acc399c9001AVcsXv5a5bT6BH`
  (Vite) were launched only to recover missing images. PIDs 6817/6819 and their cwd/arguments were verified before
  sending TERM after capture. Chromium closed in the capture script's `finally`. No other app/server was touched.
  Both jobs exited 143 as expected; their verified task-only DB/XDG/key directory was removed after preserving
  captures and the script in the repository. Worktrees and artifacts belonging to other sessions were left alone.

**Stop state:** recovery implementation/testing/presentation evidence are ready for owner review. No new design,
connector, agent, branch, commit, PR, merge or CI run was created by this recovery WP. The owner's visual decision
and final bundle authorization remain distinct pending gates; the campaign is not reported as shipped.

### WP inbox-view — owner requested live viewing

- **Result/acceptance:** open `/orchestra/inbox?preview=inbox` interactively in Review, with the current fixture
  heading visible and working source controls, then stop making changes. Layout/finish approval stays with owner.
- **Baseline/dependencies:** same HEAD/source batch and existing passing evidence above; Bun, Vite, installed omni
  assets and browser connection. Prior recovery preview processes have exited; ports 3001/4097 checked unoccupied.
- **Scope/ownership:** launch two new task-only preview processes with DB/XDG/credentials isolated under temporary
  `opencode/inbox-view`; open their page. No product source edits, new agents, tests, CI or integration work.
- **Invariants/quality:** reuse all contracts, safety and design rules of `inbox-recovery-close`; never touch the
  owner's app/server/data. No provider connection or send action. Use existing source, not injected CSS.
- **Plan/completeness/DoD:** record process ownership → start isolated backend/web in parallel → open page → verify
  visible Inbox. Keep only these explicitly requested viewing services while the owner evaluates; collect them on
  completion/cancellation after checking ownership. No gates are repeated for a view-only operation.
- **Stop:** once the requested live page is visible, leave it available for the owner and report its URL.

**Viewing active:** backend job `sh_1acd9f895001LvUoGUqr6T7KFY`, web job `sh_1acd9f8ba001O65IDAokQpgmZ4`;
Review tab `tab_42ab88fd-cbbc-4125-bb75-4b31742a8b0a` opened at `http://127.0.0.1:3001/orchestra/inbox?preview=inbox`.
The fixture heading “Choose the recovery strategy” was observed by the browser text wait. These two isolated
services remain intentionally active for the owner's requested viewing, not as unowned recovery leftovers.

**Owner visual decision:** “ta otimo. Nao deveria ter um filtro por source?” approves the displayed finish.
The source filter already exists as the toolbar's “All sources” select, beside refresh, and intersects the
message/notification, attention and search filters. This is a clarification, not a new layout or connector WP.
Visual approval does not by itself authorize a commit, push, PR, merge or final-bundle CI.

The prior broad domain WPs below remain implementation records, not blanket proof that every acceptance or
integration gate passed. Newly suggested sources remain mock-only by the owner's explicit prior scope decision.

## Historical plan and owner decisions

```
TechLead WAVE PLAN — inbox-1 @ 9fcb899d50 | 2026-11-04
================================================================
GO/NO-GO     : NO-GO for fan-out
DISJOINTNESS : shared-file eliminated? yes
               api.ts, schema/inbox.ts, and the source index are lead scaffold.
               Sources land as files under inbox/source/; a glob loads them.
               plan-check: ok, unowned=[], writeConflicts=[].
               conflict-map: parallelSafe, every pair CONFLICT_FREE.
               One read edge: WP-list reads WP-item (item.ts). Not a write conflict.
CONTRACT     : frozen? yes — docs/specs/one-box/CONTRACT.md hash 680b9c3d
WP TABLE     :
  | WP | owner-files (disjoint) | tier | ctx-budget (in/total) | sweet-spot | dep-on |
  | WP-item | packages/core/src/inbox/item.ts | sonnet | 120K/300K | yes (A1 A2 A27 A33) | contract |
  | WP-list | packages/core/src/inbox/list.ts | sonnet | 120K/300K | yes (A4 A19) | WP-item@contract |
  | WP-join | packages/core/src/inbox/join.ts | sonnet | 120K/300K | yes (A3 A23) | contract |
  | WP-triage | packages/core/src/inbox/triage.ts | sonnet | 120K/300K | yes (A10) | contract |
  | WP-draft | packages/core/src/inbox/draft.ts | sonnet | 120K/300K | yes (A5 A6 A30) | contract |
  | WP-send | packages/core/src/inbox/send.ts | sonnet | 120K/300K | yes (A7 A8 A32 A38) | contract |
  | WP-channel | inbox/source/slack.ts, discord.ts | sonnet | 120K/300K | yes (A11 A12) | contract |
  | WP-mail | inbox/source/mail.ts | sonnet | 120K/300K | yes (A13) | contract |
  | WP-teams | inbox/source/teams.ts | sonnet | 120K/300K | yes (A14) | contract |
  | WP-trackers | inbox/source/linear.ts, jira.ts | sonnet | 120K/300K | yes (A15 A16) | contract |
  | WP-github | inbox/source/github.ts | sonnet | 120K/300K | yes (A17 A29) | contract |
  | WP-door | packages/core/src/inbox/door.ts | sonnet | 120K/300K | yes (A21 A26 A36) | contract |
  | WP-seat | packages/core/src/inbox/seat-bound.test.ts | sonnet | 120K/300K | yes (A9 A20 A28 A31) | — |
  | WP-surface | packages/core/src/inbox/surface.ts | sonnet | 120K/300K | yes (A22 A35) | contract |
  | WP-order | docs/specs/one-box/WPS.md | lead | — | judged (J1 J2) | — |
CONFLICT-MAP : CONFLICT_FREE across the table. Read edge WP-item → WP-list only.
RETURN-SHAPE : "WP <id> | files <paths> | tests <ids> red→green | contract hash 680b9c3d unchanged"
DOD (V1)     : owned acceptance ids green; no write outside owner-files; no charter edit;
               no identifier one-box, onebox, or secretary; contract hash 680b9c3d unchanged.
MERGE ORDER  : scaffold → WP-item → the rest against the contract.
               J2 dispatch order, not a compile edge: Slack and mail before Teams,
               then Linear, Jira, and GitHub. Discord may go with Slack.
               J1 is judged. No UI code before a human accepts the mock.
```

Implemented locally by the lead, not by fan-out. The list is owned by `Inbox.Service` in the local database. `/api/inbox` reads it. Slack and Discord use the existing channel adapter. Mail, Teams, Linear, Jira and GitHub read and reply through their APIs when a credential is stored at `/api/inbox/account`; without one, the click is refused. A GitHub CI event is an item only when the pull request author is the authenticated user. Every other CI event is dropped.

Owner correction (2026-11-05): Inbox is its own screen, not a Flight Engineer tab. `/orchestra/inbox` is a primary navigation destination. The old tab route redirects there. Sources are behind a dialog; quick actions, preferred next move, density and previews are customizable local presentation preferences. Meetings and the `live` charter stay unchanged. This work is uncommitted and has not been approved on `dev`; no CI, push or PR is authorized.

Further owner direction (2026-11-05): distinguish messages from actionable notifications and informational updates,
including the Project Board's own decisions and approvals. The new development-only `?preview=inbox` fixture
catalog covers Teams, Slack, Discord, mail, GitHub notifications (not just CI), GitLab, Linear, Jira, Trello,
Reddit, Calendar, Sentry, PagerDuty, YouTube channel updates and RSS/Atom. WhatsApp remains a contact door only.
Event kinds are per item; contextual primary actions and supported quick actions replace generic reply/handoff
defaults. Source cards filter the mock. These additions are frontend proposals only, not new service connectors.
Reddit requires approved API access; YouTube has channel feeds, not a personal notification inbox. Discord's
current adapter binds guild channels; private-inbox access is not promised. No storage/protocol expansion in
this mock revision, no charter edit, no CI or test suite, no commit/push/PR. Updated model tests await approval
to run. UI localization terminology was checked against Firefox pt-BR preferences and Microsoft Teams pt-BR
activity/mentions documentation; issue, merge request, pipeline, API and RSS remain established developer terms.

Owner approved the layout, then requested a finish-only pass using Home and Project Board as the material
reference: glass, depth, shadows, volumes and source icons. This pass preserves the split layout, routing,
filters, action logic and provider scope. It reuses Home/Board surface and shadow tokens; the list is recessed,
the selected row and action card raised, catalog cards have resting/hover elevation, and Sources/Customize
become icon controls with the same accessible labels. Dialog frame specificity is corrected to retain Orchestra
float glass and xl rounding over the generic UI defaults. Layout approval is not permission for CI, push or PR;
everything remains local until the remaining visual finish is approved.

The owner rejected that finishing pass: it lacks refinement, sophistication and beauty. It is not visually
approved or done. Further exploration is a small, screenshot-only material study in the session scratchpad;
do not interpret its injected CSS as an accepted production design. The approved layout remains unchanged.

The next implementation pass corrects material composition instead of adding more shadows: one existing chrome
plate, transparent frame and reading pane, a lightly recessed list, selected-row tonal wash, and a single seam
above actions. Source cards retain the approved grid with a local optical rim and shared Orchestra shadows;
brand silhouettes replace approximate hand-drawn glyphs, with no square frame around each logo. This is now
applied in the renderer source (not only scratch CSS), pending the owner's aesthetic review. No CI/push/PR.

Fan-out is refused. The suite in `REQUIREMENTS.md` is the lead's reading of `docs/specs/live-seat/one-box.md`. The owner stopped the critic loop. The skill does not let the lead waive that check, and it does not let a wave start before the owner accepts the suite. `J1` and `J2` stay human.

Lead scaffold, before any agent, if the owner accepts the suite: `packages/schema/src/inbox.ts`, `packages/protocol/src/groups/inbox.ts`, the one-line add in `packages/protocol/src/api.ts`, and a glob loader under `packages/core/src/inbox/source/`. Agents fill files. They do not structure the module.

### WP study-fontes

- **Observable outcome:** a cited minimal configuration matrix for all 17 catalog sources, plus an implementation proposal. Not implementation.
- **Demand:** study each source, including channels, projects, and workspaces. The owner warned against pointless or overengineered controls. Every control must answer a real relevance, access, or noise case. Target 3–5 first-version controls per provider. Prefer defaults and links into the original app. Mark advanced or redundant options OMIT or LATER. Multi-account is not mandatory without a concrete need.
- **Baseline:** detached HEAD `9fcb899d50867c1ddc3f25d8345ac9fd8009d788`. Approved Inbox source batch `38a23676fa5964ebc7a6baba5ce1f1b8df811f19144cd76272e4710b297918bd`. UI and core surgical tests already completed (27 and 32). Do not rerun. Dirty user work stays untouched.
- **Dependencies:** official provider docs as of 2026-11-05, and the current catalog: board, slack, mail, teams, discord, github, gitlab, linear, jira, calendar, sentry, pagerduty, reddit, trello, youtube, rss, whatsapp. Service adapters exist only for slack, mail, teams, discord, github, linear, jira. No granular settings yet.
- **Owned surfaces:** six disjoint research notes plus one final report. No product-code ownership. Notes live under `research_notes/Configuração granular das fontes/`. Report path: `reports/Configuração granular das fontes.md` (later writer, not the source researchers).
- **Excluded:** live account API calls, auth changes, code edits, builds, tests, services, commits, PRs, git operations, and implementation agents. No desktop notification scraping or self-bots. No automatic or agent send.
- **Invariants:** frozen UI and contracts. Mock versus implemented stays honest. WhatsApp stays deferred. Writes require exact reviewed text and destination and an explicit click. Discord's adapter binds a guild/channel, not a person's private inbox.
- **Acceptance:** each of the 17 sources mapped to useful core fields and defaults, acquisition, permissions, and limits, with official citations and recorded uncertainty.
- **Completeness:** exactly 17. Gmail and Outlook distinguished under mail. Google and Microsoft considered under calendar.
- **DoD:** source-based bounded review, practical minimal synthesis, durable notes and report. No code, CI, repeated gates, or services.
- **Quality:** correctness, simplicity, security, accessibility and localization. No invented scopes or events.
- **Execution:** six parallel xAI researchers (`xai/grok-4.7`, no substitution), then one synthesis writer. No source writers or implementation agents. Groups: conversations (Slack, Teams, Discord); mail/calendar; work (Jira, Linear, Trello, Board); GitHub/GitLab; Sentry/PagerDuty; Reddit/YouTube/RSS/WhatsApp.
- **Stop:** when the matrix is complete and concrete unknowns are recorded. At most one bounded gap round. No optional audit loops.
- **Research state:** all six note files exist (`conversas.md`, `mail-calendario.md`, `trabalho.md`, `codigo.md`,
  `incidentes.md`, `feeds-sociais.md`). Conversations returned normally; the other five final returns failed with
  xAI `personal-team-blocked:spending-limit` after notes had been saved. Preserve them as research drafts, not a
  reviewed final report. No model/provider substitution or automatic retries. Synthesis/review is pending.
  The reported provider usage/subscription block is distinct from source/API feasibility. No UI/source change.

**Lead synthesis completed (owner-authorized, no new agents):**
`reports/Configuração granular das fontes.md` contains the 17-source minimal matrix, proposed defaults,
acquisition/permission differences, official citations, concrete unknowns and bounded future WPs (not authorized
for execution). All six notes were read. Additional direct review used official GitHub notifications, GitLab
To-Dos and Jira search docs plus `remote.ts` acquisition/GitHub helpers. Corrected the researcher claim that
own-PR proof restricts reviews/mentions: actual `githubItems` restricts only CI. GitLab own-MR CI is a proposal,
not an owner invariant. Bot mentions are not silently adopted as human Inbox relevance; shared calendar/event
classification, Reddit access, Trello enums and provider plan/access details remain explicitly unverified.
No product implementation, provider-account calls, tests, CI, commits, pushes, PRs or merges in this WP.
The owner-requested isolated live preview remains intentionally available; no owner app/server restart.

**Study receipt:** catalog/report comparison found exactly the same 17 source keys, one matrix row each;
an in-memory renamed-source control was rejected. Local `bun run check:guards --base origin/dev` reported
78 rules over 84 changed paths, 0 gate/warn findings and 0 errors (working-batch scope, not product tests or CI).
Research complete for owner review; uncertainties remain explicit, not substituted with speculative settings.

## Approved implementation campaign — four waves

**Owner architecture correction (supersedes hosted-broker suggestions below):** “eu nao quero interceptar nada
do user, e self hoted 100%, sem hugr no meio”. All integration authorization, token storage/refresh and provider
requests must remain in the user's own Orchestra deployment/device, directly to the provider. No HuGR-operated
OAuth proxy/callback, Cloudflare relay or third-party token broker; no provider codes/tokens/message content
transiting HuGR infrastructure. Earlier suggestions of a required Orchestra-operated confidential service are
withdrawn: confidential exchange does not imply vendor hosting; an operator-owned server is a distinct option.
Do not promise both zero-admin setup and support for a provider requiring a confidential client secret. Verify
official public-client (PKCE/device) or self-hosted authorization support and provider policy before choosing the
flow. Never embed a shared app secret in a distributed desktop binary, silently use customer-created apps/API
tokens against provider policy, or declare a source plug-and-play if operator setup is actually required.
The owner's Atlassian resource-level 3LO app has been created with `read:jira-work`; no callback/distribution or
secret transfer is authorized. No service deployment or paid/free hosting enrollment is authorized.

**Direct-auth verification after owner asked “ok, e agora??”:**
- **Slack public-client support confirmed in official docs.** PKCE became generally available 2026-03-30:
  https://docs.slack.dev/changelog/2026/03/30/pkce and https://docs.slack.dev/authentication/using-pkce .
  An app with PKCE enabled may redirect to localhost or a custom URI, exchanges at `oauth.v2.access` without
  `client_secret`, and rotates tokens locally. Desktop redirects accept **user scopes only, no bot scopes**.
  Refresh tokens expire after 30 days; do not assume indefinite access. Enabling PKCE is one-way without Slack
  support, so do not change an existing app setting silently. Earlier blanket claims that Slack requires our
  confidential HTTPS service were incorrect and are superseded. User-token acquisition fits the personal Inbox
  better than silently relabeling existing bot bindings. Provider app registration/approval still applies.
- **Jira Cloud public-client OAuth is not established.** Current official 3LO guide requires `client_secret`.
  https://jira.atlassian.com/browse/ECO-283 was read directly: Gathering Interest / Unresolved, updated
  2026-10-12; requests PKCE for Cloud desktop clients. Old community discussion mentions internal feature flags,
  which are not public support. Current guide also warns against integrators requiring each customer to create
  their own app/API token, so do not adopt the old issue's workaround without policy resolution.
- **Execution consequence:** Slack direct-PKCE work can proceed without a HuGR relay; Jira direct public-client
  authorization remains blocked, not magically fixed by putting a shared secret in a local server. No request
  for paid hosting, no workaround registration per customer, no app configuration changed. Do not declare Wave 1
  complete while Jira is blocked; owner-created Jira app may stay unconfigured pending a supported path.

### WP Slack app provisioning — explicit owner authorization

Owner supplied an app configuration credential, clarified that it was intended for agent-operated setup, and
approved “ok do it” after the scope was stated: create/configure the Slack app via API, direct PKCE, user read
permissions only; no install, message access/send, publication, distribution, HuGR relay or hosting. This specific
authorization supersedes the earlier inspection-only restriction for creating this app, not any other account.

- **Scope:** validate then create a new `HuGR Orchestra` app using the manifest in `slack-manifest.json`; capture
  only public app/client identifiers and nonsecret configuration. No temporary configuration credential or app
  secrets in repository files, reports or command stdout. Do not persist returned client/signing secrets.
- **Callback contract:** `http://localhost:19877/inbox/slack/callback`, a planned loopback receiver isolated from
  MCP's existing port 19876. No listener will be started for registration. The OAuth receiver and token refresh
  are still implementation work; registration does not establish a working connection. No external callback.
- **Manifest:** PKCE public client; eight read-only conversation list/history scopes (public/private channels,
  DMs/group DMs), no bot scopes, write scopes, message events, Socket Mode, org deployment or remote webhooks.
  Rotation enabled on this new app, not a change to an existing installation. Future consent must describe the
  selected scope and the broad provider grants honestly. No OAuth user grant is created by this provisioning.
- **Execution:** initial minimal manifest validated successfully with `apps.manifest.validate` (`ok: true`).
  Validate the full callback-bearing manifest before creation; do not retry an ambiguous create operation.
  If rejected, record the provider error without installing or broadening privileges as a workaround.
- **Stop:** successful app registration with public identifiers recorded, or explicit provider failure. This is
  not Wave 1 completion and not authorization to create a second app automatically on retry.

**Provisioning receipt — completed:** `apps.manifest.validate` accepted the full manifest, then a single
`apps.manifest.create` returned `ok: true` (HTTP 200). New app **HuGR Orchestra**, public app id `A0CF46651D1`,
public client id `12522069070273.12514210171443`, settings page `https://api.slack.com/apps/A0CF46651D1`.
An independent read-back via `apps.manifest.export` returned `ok: true` and confirmed PKCE enabled, exact
localhost callback above, all eight intended user read scopes, no bot scopes, token rotation enabled,
org deployment and Socket Mode disabled. Responses were projected to public configuration before tool output;
returned client/signing/verification secrets were not persisted. No token exchange, refresh, installation,
message read/send, user grant, distribution or publication was requested. No callback listener was started.
The manifest artifact is nonsecret. The temporary configuration credential is not runtime app authentication.
Inbox login/callback/storage/refresh/acquisition still need implementation and validation; app registration alone
does not make Slack connected. Jira Cloud remains separately blocked as recorded above.

### WP Slack local login — owner “ok go on”

- **Outcome:** Sources offers Slack browser authorization through the registered public client; state/PKCE checked
  by an owned loopback receiver; verified identity and rotating tokens stored only in the existing encrypted
  credential service. Connection status/cancel/local disconnect work without exposing secrets to the renderer.
  No message collection until a later explicit conversation selection WP; existing bot bindings remain separate.
- **Frozen seam:** location-scoped Inbox methods `slackStart`, `slackStatus(id?)`, `slackCancel(id)`,
  `slackDisconnect`; public schemas carry challenge id/URL/expiry, sanitized state and account names only.
  A process-global auth coordinator owns at most one active callback flow and bounded terminal receipts. Credential
  identity is a hash of project/directory/workspace, not the globally most-recent Slack token.
- **Acceptance first:** actual loopback + provider HTTP fixtures test PKCE exchange/no client secret, CSRF/path/
  host/method rejection, single-use state, denial/cancel/expiry/port conflict, account isolation, redaction,
  refresh serialization, storage failure and disconnect. UI preview must never call these routes. Transport
  form support receives real HTTP coverage rather than a global fetch mock.
- **Security:** callback binds IPv4 loopback only on 19877; never stops an occupied port or existing server. Only
  a local request may begin this desktop login; remote deployments need their own separately supported callback
  rather than an ineffective loopback promise. No raw provider error/code/token in pages or logs. Shared client
  secret absent. No inherited credential refresh/mutation. Closing/cancelling UI settles owned pending auth.
- **Execution/quality:** sequential lead-owned draft, no new agent calls/substitutions; independent critic remains
  unfulfilled, so no merge/overall-wave claim. Surgical local tests authorized by owner, package typechecks,
  generated clients through `packages/client` generate, guides and guards; no full/epic CI or process restart.
- **Stop:** login unit has evidence or a concrete blocker. No real user authorization or grant without the owner's
  click; no live message APIs, new app provisioning, Jira auth workaround, push/PR/merge or release.

**Local login implementation receipt:**
- `slack-auth.ts` owns the temporary IPv4 loopback callback, one active process-wide attempt, single-use CSRF
  state/S256 verifier, sanitized pages, expiry/cancellation and bounded receipts. It verifies `auth.test` identity
  after exchange, writes via the encrypted credential service and serializes refresh/storage/disconnect. Its
  credential slot hashes project/directory/workspace; inherited installed-app grants are not adopted or rotated.
- The existing HTTP transport gained form encoding for Slack OAuth (no separate network framework). The public
  Inbox contract exposes only begin/status/cancel/local-disconnect. Clients were regenerated with
  `bun run generate` from `packages/client`, not edited manually. Start checks loopback Host and rejects a known
  non-loopback peer; the UI also disables this desktop flow for non-loopback server URLs. A proxied/request
  adapter without peer metadata is not claimed to prove network locality; it still needs the loopback Host and
  authenticated API access. No remote-login support is claimed.
- Sources has a localized Slack login section and tested async controller: cancellation on close, including a
  late start response; fixed provider URL validation; no calls when disabled/preview; no browser persistence of
  tokens/challenges. Existing material/button/status styles are reused; no CSS/palette changes. The UI explicitly
  states that conversation selection and message collection are a separate pending WP. No new grant is consumed
  by legacy channel send or ingestion paths.
- Acceptance baseline: the initial stub failed 12 of 13 HTTP/auth cases; the preexisting fail-closed occupied-port
  case passed even against the stub and is not claimed as red→green. Six further regression cases were added for
  replay, expiry, actual SQLite failure, failed refresh/reconnect and cancellation during exchange.
- Final local surgical gates: core `slack-auth.test.ts`, `jira.test.ts`, `inbox.test.ts`, `service.test.ts`:
  **66 pass / 0 fail**. UI controller/model/navigation: **34 pass / 0 fail**. Tests use actual loopback HTTP and the
  real credential DB; no global fetch replacement. Omni control was explicitly not applicable. Jira's two
  100-page HTTP tests have an explicit 15s deadline after a loaded-machine 5s timeout, with identical assertions.
- HttpApi exerciser's four Slack routes passed both effect and auth modes: **4 pass / 0 fail / 0 skip** in each,
  with no missing/extra manifest routes. The begin-route scenario proves remote-Host refusal, not live Slack
  authorization. An initial invocation imported `test/httpapi-exercise/index.ts` without calling `main`, emitted
  no assertions and is expressly NOT counted; the corrected runs used `script/httpapi-exercise.ts` and printed
  per-route verdicts. All exercise data was isolated/in-memory, with inherited credentials off.
- Package `bun typecheck` completed in Core, Server, app-shell, Schema, Protocol and Client. Early concurrent
  120s compiler attempts timed out; app-shell subsequently caught a nonfinite-number wire type, fixed by using
  `NonNegativeInt` for expiry and regenerating clients. The successful receipts are the later completed runs,
  not the timeouts. Local guards: 78 rules / 93 working-batch changed paths, 0 gate/warn findings and 0 errors.
- Visual scope is **not signed off**: agent-browser is unavailable. The in-app QA tab hit resource 502s while
  direct HTTP returned 200; headless Chrome rendered the existing isolated web app and project selector, but no
  authenticated account panel or consent was exercised. No CSS was injected and no app/server was restarted.
  Headless instances were closed. The prior owner-requested preview on 3001/4097 remains owned by `inbox-view`.

**Stop state:** login unit implemented locally, not published or merged. Live consent/refresh against the owner's
Slack account and visual acceptance remain pending an owner click in a fresh build/isolated runtime. No actual
Slack OAuth grant, message read/send, provider installation/distribution change, CI, push, PR or merge occurred in
this unit. Next W1c is explicit conversation discovery/selection and acquisition, not automatic import of all
readable conversations. Jira auth and independent review remain recorded gates; the whole Wave 1 is not done.

### WP Slack live consent preview — owner “ok, e agora”

- **Outcome:** open a fresh isolated runtime of the new login code, select a task-owned empty project and show
  Sources → Connect Slack, then let the owner click and approve/deny in their browser. Never automate consent.
- **Ownership:** temporary `opencode/inbox-slack-login/ownership.json`; web 3002/backend 4098, callback 19877 only
  after owner clicks. Ports checked before launch. Isolate DB/XDG/key and Vite cache; inherited credentials off.
  The existing owner app and `inbox-view` preview on 3001/4097 remain untouched.
- **Scope:** no product source changes, new app registration/distribution, account secret collection, message
  acquisition, send, CI or integration. Record only sanitized connection verdicts, not codes or tokens.
- **Stop:** show the actual connection panel and leave this explicitly owned preview for the owner's validation;
  cleanup only its services after viewing ends. Real connection is pending until the owner's consent completes.

Owner approved the report, the four-wave split and execution (“ok, e isso ai. Shoot”). This authorizes
implementation, not push/PR/merge, account installation or use of the owner's credentials. Preserve the dirty
Inbox batch and the approved standalone UI. Local surgical tests remain owner-authorized; no intermediate
full/epic CI. No process restarts. xAI usage is still a known block; do not retry or substitute agents silently.

| Wave | Observable delivery | Sources | State |
| --- | --- | --- | --- |
| 1 | Small shared connection/scope/sync flow, proven on two different providers | Jira, Slack | Active preparation and bounded prerequisites |
| 2 | Existing adapters use that flow with honest access/configuration | Linear, GitHub, Teams, Discord, mail | Queued |
| 3 | Personal tasks, owner decisions and incident adapters | Board, GitLab, Trello, Sentry, PagerDuty | Queued |
| 4 | Calendar/feed integrations and integrated finish | Calendar, YouTube, RSS; Reddit gated; WhatsApp contact-only | Queued |

### Wave 1 — execution bounds

- **Architecture:** reuse the existing credential store and channel HTTP transport/RPC; no parallel OAuth vault,
  generic rule engine or provider settings platform. Existing channel adapters remain authoritative for access.
- **Success:** connect/authorize, show verified identity/access, choose readable Jira projects or Slack conversations,
  persist that choice, sync only that scope, deduplicate and surface failures honestly. Scope selection is not an
  OAuth grant. Slack bot identity never masquerades as the human's Inbox. Fixture mode makes no real calls.
- **WP sequence:** W1a Jira enhanced-search prerequisite → W1b verified connection/discovery boundary and frozen
  wire contract → W1c stored scope and acquisition → W1d existing Sources dialog wiring and user-facing validation.
  Sequential lead-owned work for now; no agent dispatch or contract-dependent implementation before prep/review.
- **Acceptance anchors to add before each WP:** actual HTTP acquisition and failure behavior; connection identity
  and secret redaction; selection persistence/isolation and empty semantics; real dialog interaction/preview
  isolation. Overall wave acceptance must be independently reviewed; blocked xAI is not a passed critic gate.
- **External dependency:** current Inbox dialog stores tokens, not an OAuth authorization flow. Vendor application
  registration/client configuration must be established before calling this plug-and-play. Do not invent app IDs,
  ask the user to paste secrets into chat, or relabel token storage as authorization.
- **Stop:** no expansion to Wave 2 until Wave 1 acceptance is demonstrated or a concrete external blocker is recorded.

### WP W1a — Jira enhanced-search prerequisite

- **Scope:** one self-contained adapter migration inside `packages/core/src/inbox`, surgical HTTP regression tests
  in `packages/core/test/inbox`, and guide evidence. No public Protocol/schema, UI or auth mechanism changes.
- **Current baseline:** `remote.ts` uses the removed/deprecated `/rest/api/3/search`, eight results and no paging.
  Official Jira enhanced search confirms `/rest/api/3/search/jql`, `nextPageToken`, `isLast` and explicit fields.
- **Acceptance:** uses enhanced search with assignee constraint; follows opaque continuation tokens, including
  empty intermediate pages; rejects malformed/inconsistent/repeated continuation and transport failure rather
  than returning partial success; bounded resource use; no provider writes. Existing converters/store semantics
  are preserved. Credential contents never appear in returned items.
- **Plan:** write HTTP-boundary tests → capture red → implement/reuse converter → green surgical tests and local
  core typecheck/guards. This prerequisite is not the full Wave 1 acceptance suite or a claim of live Jira access.

**W1a implementation receipt:** new `packages/core/src/inbox/jira.ts` uses the existing channel RPC/HTTP
transport; `remote.ts` now invokes it before the existing issue converter. Enhanced GET search follows opaque
tokens through empty pages, validates explicit completion, rejects cycles/malformed/oversized pages and fails
at the 100-page budget without returning partial success. No provider writes, contract generation, UI changes
or new credentials. Existing `remote.pull` swallowing refresh failures remains a W1b/c requirement, not fixed here.

**W1a evidence (local, owner-authorized):** extracted old eight-result acquisition produced 13 failing HTTP
acceptance cases (red). Final surgical run of `jira.test.ts`, `inbox.test.ts`, `service.test.ts`: **47 pass, 0 fail**,
including 15 new Jira cases. Two extra page-boundary cases were added after the initial red run. Actual loopback
HTTP fixtures exercise the production transport without global fetch replacement. Omni control explicitly not
applicable. `bun typecheck` from `packages/core` exited 0. Local guards over the whole working batch: 78 rules,
86 changed paths, 0 gate/warn findings, 0 errors. No CI, commit, push, PR or merge. No independent critic/review is
claimed; this prerequisite is implemented locally, not a completed/landed Wave 1.

**W1b external decision required — real OAuth, not token collection:** direct official documentation review:
- Slack's OAuth code exchange requires app client identity/secret and an **HTTPS redirect**:
  https://docs.slack.dev/authentication/installing-with-oauth/ . User versus bot scopes/tokens must be explicit.
- Atlassian requires a registered 3LO app, confidential code exchange and API calls through
  `https://api.atlassian.com/ex/jira/{cloudid}`. Its current guide explicitly rejects integrations that collect
  customer API tokens or tell each customer to create their own 3LO app:
  https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/ .
- A distributable desktop app cannot safely embed the shared client secret. The next boundary therefore needs
  the Orchestra-owned OAuth app registrations and a confidential HTTPS callback/token-exchange service (or an
  existing equivalent). Do not improvise a public service, embed a shared secret, deploy infrastructure, or turn
  the customer into the integration developer. Ask the owner which existing HuGR registrations/service/domain
  to use; if none, get authorization for that one-time product setup. No secrets in chat.
- OAuth application provisioning is now a concrete dependency, not proof that the provider APIs are unusable.
  W1b–d and the overall wave remain pending this decision and the independent acceptance-review gate. Wave 2
  has not started. The existing owner-requested preview and installed app/server were not restarted or stopped.

**Owner-requested OAuth inventory (read-only):** owner answered “nao sei, verifica ai acho que nao tem”.
Checked current repo application/core paths, infrastructure filename inventory and GitHub repository secret/
variable metadata plus `release` environment metadata (names only, never values). These checks did not identify
Slack/Atlassian app configuration or a deployed integration OAuth broker. Search controls found the existing
Slack API endpoint and other OAuth client code, and GitHub returned known credential metadata; empty searches
are not being treated as proof about all external accounts. GitHub deployment entries inspected were `release`.
The related `hugr-composer` tree contains OAuth primitives/templates, which is not evidence of an installed or
deployed Orchestra integration. No application registration or deployment was inferred from that inventory.

Opened official consoles in Review: Slack tab `tab_48d7dee7-d5ae-4cec-a01b-d74559faf9c5` at
`https://api.slack.com/apps` explicitly asks to sign in; Atlassian tab
`tab_6c6749ca-3e98-4bff-acd3-16b777bc2604` redirected to Atlassian login. Thus actual app ownership/registration
is **unverified, not confirmed absent**. Next action: owner signs into those two consoles in Review, then inspect
app lists read-only. Do not create apps or request permissions as part of inventory. No secrets exposed, accounts
changed, services deployed, product code modified, tests/CI run or owner processes touched by this inspection.
