# QA execution receipts — 2026-11-09

Stories: `evidence/qa-stories-astra.md`. Pin executed: `origin/dev` after #1350/#1352 merges
(HEAD `9e359cdfd5` at QA start). QA instance: task backend :4102 + web :3005 from the clean tree,
disposable DB under `$TMPDIR/opencode/inbox-clean-qa` (installation credentials, never printed).

| Story/variant | SHA | Mode | Source/Location | Action | Before → after | Evidence | Result |
|---|---|---|---|---|---|---|---|
| QA-5 / live | 9e359cdfd5+ | LIVE | jira / gmhschn.atlassian.net | Save email+token+site via UI; GET /api/inbox refresh | jira row absent → KAN-1 row (open=1) | Bearer 403 direct control; Basic 200 direct; absence→presence transition on the production GET (not mere existence — Astra re-framed the inference); 2nd refresh → 1 row, same list_id (dedupe complement, accepted) | **PASS-LIVE (a _subcaso_ auth + first delivery + dedupe, Astra-signed). Story completa pendente: reload UI record + proveniência comum da execução.** |
| QA-25 / live (Linear) | 9e359cdfd5+ | LIVE | linear / hugr-orchestra | Archive row (open=1→0); edit title via Linear API; sync | open=0 → open=1, snippet updated | DB before/after; sync state synced; restored original title after | **FAIL (HISTORICAL vs `9e359cdfd5` code; Astra confirms). CORRECTION: PR #1354 removes repoening on revision change (owner-ordered 2026-11-09). Live re-proof under new code: archive (open=0) → edit title → sync → open stays 0, snippet updated in place; title restored. Failing reopen assertions updated (Linear/GitHub/Teams/Board); suite 144 pass/0 fail.** |
| QA-48 / sampled hygiene (LIVE APIS + DB + log) | 9e359cdfd5+ | LIVE | mail, jira, github, linear | In-memory secret scan, demonstrated positive control per variant | — | 5 secrets (incl. FULL Basic pair) × 4 variants × 6 targets (list, accounts, sync error, send refusal, DB bytes, identified backend log 687 B/19 lines post-restart). Detector demonstrated (absent→False, planted→True). Vigência (active this session). HITS: NONE | **PASS-LIVE DELIMITED (Astra signed). Full QA-48 OPEN: browser console not sampled, upstream error with echo, remaining ops coverage.** |
| QA-45 / restart | 9e359cdfd5+ | LOCAL | QA backend :4102 | Restart task QA backend (old PID 93163), same profile/DB | PIDs 93163→18798; 5 connections recovered (mail, jira, linear, github, calendar); rows=305, draft=1, feed seen=31, linear open=0 — identical before/after | State table compared before/after restart (enumerated states restored) | **PASS-LOCAL DELIMITED — reinício e estados enumerados (Astra-accepted supersession, limited to the states the receipt documents)** |
| QA-29 / draft+egress | 9e359cdfd5+ | LOCAL | mail | draft saved + sync | inbox_draft sent=0 count=1; egress 0 | egress 0 after open/sync/draft — egress absence + local draft existence ONLY | **PASS (subcaso). Outbox matrix (isDraft matrix, Inbox/Outbox separation) = BLOCKED-MOCK (fixture missing) — reconciled per Astra review.** |
| QA-5 / live reload+dedupe | 9e359cdfd5+ | LIVE | jira | second GET /api/inbox refresh after delivery | 1 row → 1 row, same list_id `in_19f482e7…` | No duplicate on re-refresh; row count stable across two production refreshes | **PASS (dedupe complement — accepted by Astra; closes the no-dup subcase only)** |

| QA-24 / 28-part | 9e359cdfd5+ | LIVE | mail / gmail | Gmail resync after attention closed | 302 → 302 rows | Row count stable after sync. **No dedup/provider inference — count observation only (Astra review).** | **PASS (count subcase)** |
| QA-2 / github | 9e359cdfd5+ | LIVE | github | connect (204) vs acquisition | 0 rows after connect; sync state synced after explicit syncWork | `connected: True`, `state: synced`, 0 rows (all 20 unread are non-own-ci `ci_activity`, correctly filtered) | **PASS (saved≠acquired; filter honest)** |
| QA-21 / rss HN | 9e359cdfd5+ | LIVE | rss / Hacker News | resync with no new feed items | seen 31 → 31 | feed state synced, seen unchanged, no new rows | **PASS (subcaso de repetição: baseline silencioso-1s e entrega de item novo NÃO demonstrados nesta amostra)** |
| QA-34 / unavailable on attempt over Jira item | 9e359cdfd5+ | LOCAL | jira item | POST /api/inbox/send with confirm click on a Jira item | refusal | `{"reason":"unavailable"}`; inbox_egress count 0. **Service-level refusal proof; the story's pre-network protection NOT demonstrated (Astra review).** | **PASS (subcaso; full story open)** |
| QA-42 / disconnect | 9e359cdfd5+ | LOCAL | linear | disconnectAccount via API | linear rows 1; jira rows 1 | credential removed (`connected: False`), history preserved; reconnected with same key (`connected: True`) | **PASS** |
| QA-51 / support | 9e359cdfd5+ | LOCAL | core/client/server | check:generated, migration --check, httpapi auth+effect | clean diff; pass=38 fail=0 (auth) and (effect) | Core inbox suite: 127 pass / 0 fail / 1486 assertions | **PASS** |
| QA-7 / live | 9e359cdfd5+ | LIVE | linear | sync via app path after reconnect | connected, 1 assigned row (HUG-3) | raw-key auth (no Bearer); viewer matches token owner; HUG-3 delivered; unassigned issues excluded | **PASS** |
| QA-8 / live | 9e359cdfd5+ | LIVE | mail / outlook | discover folders, select Inbox, save, sync | folder choices listed (inbox, Archive, Outbox, Conversation History); sync state synced | `@odata.count: 0` direct Graph (honest empty); 0 imported rows | **PASS (empty honest)** |
| QA-30/31 / triage | 9e359cdfd5+ | LOCAL | KAN-1 row | markRead then archive | open 1→0→(row present, open=0) | Executed read/archive subcase PASS. **Filters/categories/search intersection experience: supported by model.test.ts/inbox.test.ts tests; full filter experience NOT demonstrated here (no UI filter run in this execution).** |
| QA-33 / draft | 9e359cdfd5+ | LOCAL | linear row | POST /api/inbox/draft | draft saved (sent=0) | inbox_egress 0→0 | **PASS** |
| QA-43 / stale gen | 9e359cdfd5+ | LOCAL | linear | sync with a stale/fake generation | refusal | `{"reason":"unavailable"}`; current generation unaffected (reconnect verified) | **PASS** |
| QA-49 / egress (log+egress examined) | 9e359cdfd5+ | LIVE/LOCAL | backend | log scan for broker/relay/atlas/telemetry/git URLs; egress count | — | 0 URL hits in examined backend log; inbox_egress = 0. **Effective network destinations NOT demonstrated.** | **PASS (log/egress sample only)** |
| QA-50 / contract | 9e359cdfd5+ | LOCAL | schema | schema package suite | 135 pass / 0 fail / 1051 assertions (10 files) | email/revision/generation round-trips covered by model.test.ts + core suite | **PASS (support)** |

Not executed yet (pending): QA-1, QA-3 (LIVE), QA-4, QA-6 (delivery/ownCi variants), QA-9 (two-label union variant), QA-15 (PagerDuty full table), QA-23, QA-26, QA-32, QA-35, QA-37, QA-39, QA-44, QA-52 (keyboard/Escape step), QA-53 (partially covered).
Blocked inputs: Outlook mailbox empty (QA-8 delivery BLOCKED until a message arrives; QA-29 MOCK delivery — fixture missing);
Teams LIVE blocked (no tenant); Slack LIVE grant from a removed QA root (QA-3/QA-36 variants BLOCKED);
GitHub delivery variant pending eligible non-CI notification. QA-25: FAIL remains as the historical result; corrected semantics are covered by PR #1354 and the live re-proof above.

## Consolidated batch — 2026-11-09 (3 parallel subagents, hermetic, no QA-instance contact for A/B)

### MOCK group A

| Story | Result | Evidence |
|---|---|---|
| QA-4 Slack cancel/replay/callback | PASS-MOCK | slack-auth.test.ts: statuses=[200,400], oauth count=1, pending 0, failed reconnect keeps previous; 73 expects |
| QA-10 Teams selected chats | PASS-MOCK | communication.test.ts + work-service-2.test.ts: chat:a/same-id vs chat:b/same-id no collision; empty collects zero |
| QA-20 empty-scope table | PASS-MOCK | work-service-2/slack-sync/communication: Slack/Mail/Teams/Discord/Trello/Sentry/Calendar zero; GitLab [] → 2 rows; 452 expects |
| QA-22 Calendar baseline/invite/tombstone | PASS-MOCK | calendar.test.ts + work-service-2: reconcileCalendar invite-only, tombstone kept, unknown ignored |
| QA-23 Slack pagination/resume | PASS-MOCK | slack-sync.test.ts: cursor `history-next` persisted, reopen resumes pending→synced, replies arrive; 54 expects |
| QA-26 late-page failure | PASS-MOCK | jira.test.ts + work-pagination.test.ts: late-page 403 → `http,403`; 100-page `response_limit`; no partial import |
| QA-27 SQLite atomicity | PASS-MOCK | real SQLite trigger probes: reject_*_receipt/checkpoint → rows [] then retry synced; 153 expects |
| QA-35 expired manual token | BLOCKED | no 401/expired fixture for a manual source with history |
| QA-36 Slack refresh identity | PASS-MOCK | slack-auth/slack-sync: refresh rotates (1 refresh) preserving identity; denied refresh keeps connection; generation mismatch unavailable |
| QA-37 401 vs 403 vs Jira no-email | BLOCKED | no service-route 401/403 distinction test; Jira read()= [] without email, pull() `catch(()=>[])` hides per-source cause (observability gap confirmed by code) |
| QA-38 rate limit persists | PASS-MOCK | slack-sync/work-service-2: rate_limited + retryAt>80s durable, scope edits do not bypass |
| QA-39 provider down isolation | BLOCKED | fixture only has global failPage (fails all sources); no per-source isolation |
| QA-40 unsafe continuations | PASS-MOCK | feed/communication/work-pagination/calendar: cross-origin/cycle/foreign nextLink → invalid_response; private redirect refused |
| QA-41 recovery imports once | PASS-MOCK | work-service-2: fail→synced (GitLab 2, Discord 1, feed initialized), re-sync idempotent |
| QA-44 remove/re-add baseline | BLOCKED | feed removal retains history but no re-add-same-URL + silent-baseline fixture; Calendar re-add silent test missing |

### LOCAL group B

| Story | Result | Evidence |
|---|---|---|
| QA-1 identifiable execution, non-preview | BLOCKED (observation step) | Code verified non-preview path calls `api().list({location})` (inbox.tsx:35-38,82-90); SHA/PID/Location/DB identity + UI operation trio not observed (QA instance off-limits to subagents) |
| QA-30 waiting/categories/filters agree | PASS-LOCAL (test support; executed read/archive subcase lives in QA-31 row and the QA-30/31 joint row) | model.test.ts intersection + waiting-first + history; inline store known-link grouping, no keyword grouping; 29-pass file |
| QA-31 select/read/archive distinct | PASS-LOCAL (EXECUTED subcase: KAN-1 read+archive live; see QA-30/31 joint row) | inbox.tsx `choose()` only sets selection (no API); triage() read/archive/remind close waiting+reminder; state kept server-side |
| QA-32 remind tomorrow = next local day | PASS-LOCAL | inline store 6/6: revealAt = next midnight, reappears once, read/archive clear it; no clock change |
| QA-33 local draft, no egress | PASS-LOCAL | service.test.ts: InboxDraftTable 1 row sent:false, egress 0; roundtrip preserves text |
| QA-45-parte restart | **SUPERSEDED by restart receipt (QA-45 PASS above)** | persist/provenance code-level; historical BLOCKED retained only as history |
| QA-46 location/migration isolation | PASS-LOCAL | account-isolation + location-migration suites: per-location creds, legacy migrated to owner:"", cross-location archive → `missing` |
| QA-47 unsaved credential | PASS-LOCAL (SUPORTE ESTÁTICO) | controls.tsx: token in createStore only, cleared on switch/connect; 0 localStorage/sessionStorage hits in inbox chapter; dynamic typed/switch/close traffic step NOT executed |
| QA-50 contract preserves fields | PASS-LOCAL | decodeUnknownOption inline: revision Some, email preserved, missing generation → None (required enforced) |
| QA-52 auth+effect full scenarios | PASS-LOCAL (partial) | re-ran both commands: pass=38 fail=0 skip=0 missing=0 (auth) and (effect); keyboard/Escape UI step not run |
| QA-53 handoff no seat dispatch | PASS-LOCAL | service.test.ts: prompts=1, resume=false, ids only (no snippet), created=0; board refused |

### LIVE group C (QA instance, read-only)

| Story | Result | Evidence |
|---|---|---|
| QA-6 GitHub ownCi variants | BLOCKED (variant delta) | preferences read `{ownCi:true}`; accounts github connected/synced; rows=0. ownCi toggle needs forbidden PUT; no own/foreign PR CI event pair available |
| QA-9 Gmail scope/seen | PASS-LIVE | communication GET `{selected:["inbox"],unreadOnly:true}`; syncWork synced; mail 302→302 |

| Story | Result | Evidence |
|---|---|---|
| QA-16 Calendar scope (Google) | PASS-LIVE | GET /api/inbox/calendar `{selected:["primary"]}`; calendar connected/synced; inbox_calendar primary events=[] (1 row) — primary-only synced calendar |
| QA-17 RSS/YouTube state | PASS-LIVE (estado observado; follow/list/remove sem fetch NÃO demonstrado) | rss synced/initialized, youtube synced/initialized |
| QA-18 Board projection | BLOCKED | board=0 rows; no pending board owner-question/manual-intake linked to the QA location — event missing |
| QA-19 Reddit/WhatsApp limits | PASS-LIVE | accounts list has 11 sources, no reddit/whatsapp; inbox rows reddit/whatsapp=0 — not connectable, no ingestion |
| QA-28 gmail unread isolation | PASS-LIVE (count observation only; provider unread preservation NOT demonstrated) | communication `{unreadOnly:true}`; syncWork synced; mail 302→302; total 305; egress 0 |
| QA-29 Outlook read-only sync/draft | LOCAL (subcase) | egress=0; draft sent=0 count=1; syncWork synced; open/sync/draft left no egress | **draft/egress subcase PASS — Outbox matrix BLOCKED-MOCK (reconciled per Astra review)** |
