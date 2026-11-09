# Independent Inbox review — 2026-11-08

## Verdict

**APPROVE** (with live gates open).

## Findings

- PASS — InboxGroup carries both locationMiddleware and top-level Authorization middleware; no unauthenticated inbox routes.
- PASS — Credential slots are location-hashed (`inbox.<source>.<sha256(owner)>`); legacy/unscoped entries are preserved, never adopted.
- PASS — Slack generation is minted on login, preserved on refresh, rechecked under lock; stale generations are rejected.
- PASS — `send`/`originDraft` refuse board, `oauth:`, `scoped:` and `feed:` rows; explicit owner-click semantics unchanged.
- PASS — Graph next-link handling enforces origin/resource/query binding; cycles/duplicate-query/limit cases fail rather than truncate.
- PASS — First revision is a baseline; only later material revisions reopen attention; read state survives reimport.
- PASS — Teams material fingerprint is sender plus rendered text, not `lastModifiedDateTime`; the new regression proves reaction-only updates preserve read state while edited text reopens the same items.
- PASS — Unsaved token is cleared on success and source switch; no persisted/localStorage token; password input with autocomplete off.
- PASS — Revised dense content base, tonal card fill and floating-dialog shadows match the owner-approved revision; no visual drift found by reviewer.
- PASS — Generated Client includes the new Inbox surface; regeneration was required and done.
- MINOR — Public Schema `Pulled` lacked `revision` even though Core's internal `Pulled` type has it; internal sync paths were unaffected, but a public upsert could not carry a material revision. **Fixed after review:** public schema now has optional `revision`, Client regenerated, and positive/negative decode-encode controls were run; Core Inbox suite passed 126/0 and app-shell Inbox/navigation/palette suite passed 65/0. HTTP exercise effect+auth also passed 38/0 after aliasing the staged omni paths.
- MAJOR (contamination, not an Inbox defect) — the reviewer observed unrelated changes in the shared dirty worktree versus `origin/dev` (including flight-engineer/navigation/palette generated CSS and many deletions); `bun.lock`'s relevant diff is the legitimate `saxes@6.0.0` addition only.

## Review scope and limits

The reviewer read the instructed Inbox implementation, tests, protocol/schema, HTTP exercise scenarios, WPS and relevant evidence in isolation, then returned a compact card. It did not execute full tests/typechecks or live provider flows; those counts are recorded from the campaign, not re-observed by the reviewer. Existing mutation-probe evidence remains the prior record: empty-page Link/nextLink ignorance, GitHub Link ignorance, Sentry Link, Graph next-link, and SQLite-trigger rollback probes.

Open live gates remain: human-authored message/thread samples, provider-side revocation, other providers' legitimate grants (Reddit approval-gated; Jira client-registration constraint), YouTube next-upload delivery, measured contrast beyond sampled glass, CI green, and unrelated worktree contamination. The existing keyboard/trap and credential sentinel behavior are supported by prior live acceptance evidence, not re-proven by this static review.

## Waiver note

The user explicitly authorized a substitute reviewer despite the prior `xai/grok-4.7`/spending restriction. This review is not same-session self-certification, but it does not cure the missing CI, live provider, or separately-restricted independent review gate.