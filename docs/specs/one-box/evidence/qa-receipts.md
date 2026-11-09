# QA execution receipts — 2026-11-09

Stories: `evidence/qa-stories-astra.md`. Pin executed: `origin/dev` after #1350/#1352 merges
(HEAD `9e359cdfd5` at QA start). QA instance: task backend :4102 + web :3005 from the clean tree,
disposable DB under `$TMPDIR/opencode/inbox-clean-qa` (installation credentials, never printed).

| Story/variant | SHA | Mode | Source/Location | Action | Before → after | Evidence | Result |
|---|---|---|---|---|---|---|---|
| QA-5 / live | 9e359cdfd5+ | LIVE | jira / gmhschn.atlassian.net | Save email+token+site via UI; GET /api/inbox refresh; archive n/a | no jira row → KAN-1 row (open=1) | Bearer 403 negative control direct (recorded); Basic 200 direct; production-path delivery proves `saved.email` present (read() returns [] without it); row `10000|1` in DB | **PASS-LIVE** |
| QA-25 / live (Linear) | 9e359cdfd5+ | LIVE | linear / hugr-orchestra | Archive row (open=1→0); edit title via Linear API; sync | open=0 → open=1, snippet updated | DB rows before/after; edit success; sync state synced. Restored original title after. | **FAIL** of the no-reopen rule for Linear (edit reopens attention, per store.ts revision semantics). Recorded as divergence, not a crash; same semantics expected for Teams/GitHub/Calendar per code read. |
| QA-48 / live+mock hygiene | 9e359cdfd5+ | LIVE | mail, jira, github, linear | In-memory secret scan against list/accounts API responses, QA DB bytes, backend logs. Variants: plain, base64, URL-encoded; positive control armed. | — | list response 140,760 B, accounts 1,125 B scanned; zero hits across all secrets in all targets | **PASS** |

Not executed yet (pending): QA-1..QA-4, QA-6..QA-24 (remainder), QA-26..QA-47, QA-49..QA-53.
Blocked inputs: Outlook mailbox empty (QA-8/QA-29 delivery variants BLOCKED until a message arrives);
Teams LIVE blocked (no tenant); Slack LIVE grant from a removed QA root (QA-3/QA-36 variants BLOCKED);
GitHub delivery variant pending eligible non-CI notification.
