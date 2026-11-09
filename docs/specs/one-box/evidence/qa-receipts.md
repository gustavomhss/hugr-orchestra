# QA execution receipts — 2026-11-09

Stories: `evidence/qa-stories-astra.md`. Pin executed: `origin/dev` after #1350/#1352 merges
(HEAD `9e359cdfd5` at QA start). QA instance: task backend :4102 + web :3005 from the clean tree,
disposable DB under `$TMPDIR/opencode/inbox-clean-qa` (installation credentials, never printed).

| Story/variant | SHA | Mode | Source/Location | Action | Before → after | Evidence | Result |
|---|---|---|---|---|---|---|---|
| QA-5 / live | 9e359cdfd5+ | LIVE | jira / gmhschn.atlassian.net | Save email+token+site via UI; GET /api/inbox refresh; archive n/a | no jira row → KAN-1 row (open=1) | Bearer 403 negative control direct (recorded); Basic 200 direct; production-path delivery proves `saved.email` present (read() returns [] without it); row `10000|1` in DB | **PASS-LIVE** |
| QA-25 / live (Linear) | 9e359cdfd5+ | LIVE | linear / hugr-orchestra | Archive row (open=1→0); edit title via Linear API; sync | open=0 → open=1, snippet updated | DB rows before/after; edit success; sync state synced. Restored original title after. | **FAIL** of the no-reopen rule for Linear (edit reopens attention, per store.ts revision semantics). Recorded as divergence, not a crash; same semantics expected for Teams/GitHub/Calendar per code read. |
| QA-48 / live+mock hygiene | 9e359cdfd5+ | LIVE | mail, jira, github, linear | In-memory secret scan against list/accounts API responses, QA DB bytes, backend logs. Variants: plain, base64, URL-encoded; positive control armed. | — | list response 140,760 B, accounts 1,125 B scanned; zero hits across all secrets in all targets | **PASS** |

| QA-24 / 28-part | 9e359cdfd5+ | LIVE | mail / gmail | Gmail resync after attention closed | 302 → 302 rows | Row count stable after sync; deduped (provider patience unchanged is implied by no reimport of the same IDs) | **PASS (dedup)** |
| QA-2 / github | 9e359cdfd5+ | LIVE | github | connect (204) vs acquisition | 0 rows after connect; sync state synced after explicit syncWork | `connected: True`, `state: synced`, 0 rows (all 20 unread are non-own-ci `ci_activity`, correctly filtered) | **PASS (saved≠acquired; filter honest)** |
| QA-21 / rss HN | 9e359cdfd5+ | LIVE | rss / Hacker News | resync with no new feed items | seen 31 → 31 | feed state synced, seen unchanged, no new rows | **PASS** |
| QA-34 / read-only send | 9e359cdfd5+ | LOCAL | jira item | POST /api/inbox/send with confirm click on a read-only import | refusal | `{"reason":"unavailable"}`; inbox_egress count 0 | **PASS** |
| QA-42 / disconnect | 9e359cdfd5+ | LOCAL | linear | disconnectAccount via API | linear rows 1; jira rows 1 | credential removed (`connected: False`), history preserved; reconnected with same key (`connected: True`) | **PASS** |
| QA-51 / support | 9e359cdfd5+ | LOCAL | core/client/server | check:generated, migration --check, httpapi auth+effect | clean diff; pass=38 fail=0 (auth) and (effect) | Core inbox suite: 127 pass / 0 fail / 1486 assertions | **PASS** |
