# Inbox closure backlog — 2026-11-08

This ledger is the active closure state. It does not certify live provider behavior or authorize publication.

## Done

- Four-wave local implementation and approved revised visual material.
- Web full-app, native Electron isolated acceptance, interaction/keyboard and unsaved-credential acceptance.
- Public feeds: RSS, Atom and YouTube baseline/newer-entry behavior; YouTube recovered after an intermittent upstream 404.
- Slack: OAuth, discovery, selection, sync, disconnect/reconnect, process restart, forced and natural expiry rotation; acquisition/read history after rotation.
- Teams reaction-only revision bug fixed; public Schema `Pulled.revision` minor fixed; Client regenerated.
- Local gates: Schema/Core/app-shell typechecks; schema contract hygiene 5 pass; Core Inbox 126 pass; app-shell Inbox/navigation/palette 65 pass; HTTP effect/auth 38 pass each; `git diff --check` clean; guards 0 gate/error with four previously recorded warnings.
- Review: owner-approved visual finish; substitute reviewer waived by owner, verdict APPROVE with live gates open.
- Environment note, 2026-11-09: the harness/server restart removed the private `$TMPDIR/inbox-slack-consent-iy50xfl2` QA root and stopped the task backend/web. The recorded live Slack evidence remains valid for those completed runs; no live backend, grant or current Slack state can be revalidated from this environment without a fresh isolated OAuth. No secret was restored or printed.

## Still open without inventing evidence

1. **Live provider scope that has never produced samples:** human-authored Slack messages and thread replies; provider-side revocation; YouTube's next genuinely new upload. These are not code debts; they are unobserved provider events.
2. **Other providers' legitimate grants/registrations:** Jira, GitHub, Linear, Outlook mail and Calendar now have live
   installation grants (see addendum); Teams, Discord, GitLab, Trello, Sentry and PagerDuty remain
   manual-credential/interim, with Teams blocked on a legitimate work tenant (Microsoft 365 Developer Program sandbox
   unqualified for the fresh signup). Browser sessions alone do not supply Inbox API grants.
3. **Provider constraints:** Jira's zero-secret public-client requirement remains unsupported by the reviewed references; Reddit stays approval-gated. WhatsApp remains contact-only by design.
4. **CI and publication hygiene — CLOSED 2026-11-09.** The owner authorized commit, push, PR and CI in this session
   (merge remained unevidenced until the explicit approval on 2026-11-09T18:48Z), and the Inbox-only extraction
   shipped as PR #1350, merged by squash with all workflows green. The shared-worktree unrelated-modifications note
   above is therefore historical: it described the pre-extraction state, not the merged state.

  An Inbox-only extraction now exists in the `inbox-clean` worktree on local branch `inbox-clean`. It contains only selected Inbox code, contract, migration,
  UI, guides, evidence and generated files copied from the shared checkout; its index was prepared path-by-path
  (no `git add -A`) and no files were committed, pushed or merged.
  The extraction was installed with `bun install --frozen-lockfile` and repeated the Schema/Core/app-shell typechecks,
  contract hygiene (5), Core Inbox (126), app-shell suite (65) and HTTP effect/auth exercises (38 + 38).
  After the harness restart, it was also run as a fresh loopback backend/web pair under a new disposable QA root with
  six synthetic Inbox items: the real project chooser opened `inbox-full-app-clean/project`, Inbox displayed
  Messages 2 / Notifications 4, and the seeded Calendar item was selectable. No provider grant was created and no
  secret was printed.
  In the clean worktree, `git diff --check` was clean and `bun run check:guards --base HEAD` reported no gate/error
  and the same four warnings. This is evidence
  that the extraction is coherent, not a CI pass or publication authorization.
  **Closure update, 2026-11-09 — MERGED.** That extraction shipped as PR #1350 (`inbox-clean` → `dev`), merged by
  squash on 2026-11-09T18:48:00Z under explicit owner merge approval, with `test`, `guards`, `typecheck`, `storybook`,
  `native`, `nix-eval` and `atlas-guard` all green on the merged history (a docs-only commit followed the last green
  run; required checks `atlas-guard` and `guards` stayed green). Items 4 (CI and publication hygiene) and the stale
  "no commit/push/merge authorized" wording above are therefore closed by that merge; the Done/Historical sections
  below describe the merged state. Live QA (Jira fix + KAN-1, GitHub sync, Linear HUG-3, Outlook empty-box sync)
  stands as recorded in the addendum below.
  **Feedback loop, standing rule (owner-ordered 2026-11-09).** Results always return to Astra for review: the lead
  executes, publishes snapshots on the remote, and Astra independently judges — assent, contest, or red flag. The lead
  records his verdicts verbatim in `evidence/` and never treats a lead-only green as a closure. QA stories battery:
  `evidence/qa-stories-astra.md` (53 stories, pin dd789704ff); execution receipts:
  `evidence/qa-receipts.md` (QA-5 PASS-LIVE, QA-25 FAIL historical, QA-48 PASS, rest pending/BLOCKED with reasons).

  **Closure update, 2026-11-09 — QA-25 fix + CI godfile gate fix MERGED.** PR #1354 (`fix-qa25-attention` → `dev`) merged by
  squash on 2026-11-09T23:40:45Z (SHA `cd2e6f1926`) with `test`, `guards`, `atlas-guard` all green. Contents:
  - QA-25 corrected in `store.ts`: edit updates content in place, never reopens attention; live re-proof (archive→edit→sync→open=0).
  - Fixtures MOCK approved by Astra: QA-35/37/39/44 (acquisition/isolate/baseline), QA-29 (Outbox matrix — Outbox not in exclusion set), QA-6 (GitHub variety, authorship via `user.login`).
  - CI godfile gate: base = merge-base (not shallow tip); resolveBase fails closed; fetch full history in `test.yml` + `distribution-bundle.yml`; regressions pin the invariant.
  - Structural test of `distribution-bundle` updated + `BUNDLE_STATIC_HISTORY` assertion (fetch-depth: 0).
  PR #1353 (docs: Astra QA stories + receipts) merged by squash on 2026-11-09T23:41:00Z.

## Live acceptance addendum — 2026-11-09 (this session, inbox-clean branch, PR #1350)

Owner authorized commit/push/PR/CI; merge remains unevidenced. PR #1350 (`inbox-clean` → `dev`) is OPEN, MERGEABLE,
carrying `epic` + `guardrail-approved`. QA backend (`bun run ./src/index.ts serve` :4102) and web (vite :3005) run
fresh from the clean tree with a disposable QA root under `$TMPDIR/opencode/inbox-clean-qa`; QA DB carries the
owner's own installation credentials (never copied/printed/persisted elsewhere).

- **Jira — live, fixed, delivered.** Live debugging proved the Jira pull used `Bearer` with an Atlassian API token,
  which Jira Cloud rejects (`403 Failed to parse Connect Session Auth Token`); Basic `email:token` returns 200.
  Fix shipped as `65b8f5f0` (`fix(inbox): Jira API token auth via Basic email`): `AccountInput` gained optional
  `email`, the Jira connect form collects it, credentials store it in metadata, and the pull path uses
  `Basic base64(email:token)` (silent `[]` without email). Live proof: assigned issue `KAN-1 "Tarefa 1"` delivered to
  the canonical Inbox surface (`Everything304`, `Notifications2`); credential saved via UI in the QA DB.
- **GitHub — connected, sync `synced`, 0 qualifying rows by design.** PAT with `repo, notifications` verified live via
  `/user` (200, scopes confirmed). All 20 unread notifications are `ci_activity` CheckSuite runs for another branch;
  the `ownCi` proof filter correctly excludes them (anti-noise). Qualifying delivery remains pending PR-linked CI activity.
- **Linear — live, delivered.** Personal API key created by the lead in the owner's Linear account; connected and synced;
  `HUG-3 "Import your data"` delivered (`Everything305`). Raw-token auth confirmed live via `/graphql` viewer query.
- **Outlook mail — connected, empty mailbox.** Graph token minted via Graph Explorer with `Mail.Read` (consent popup);
  folders discovered (`inbox`, Archive, Outbox, Conversation History), `inbox` selected, sync `synced`; the real
  mailbox has **0 messages** (`@odata.count: 0`) — connection proven, delivery pending any message.
- **Teams — blocked, honestly.** The owner has no work account; the Microsoft 365 Developer Program sandbox returns
  "You don't currently qualify for a Microsoft 365 Developer Program sandbox subscription" for a fresh personal signup.
  No tenant was created, no trial with card risk started. Teams remains mock-pipeline covered; live delivery needs a
  legitimate work grant.
- **CI loop:** after the Jira fix, the godfile gate failed ONLY because the regenerated client files grew 6–22 LOC past
  approved waiver ceilings; ceilings raised under the standing owner rule (`cdf5077c9c`). `test` workflow re-dispatched
  for the new head; a shell watcher (`CI_DONE`) was armed to resume the session on completion. Atlas-guard, guards,
  typecheck, nix-eval, storybook, native all green on the prior head.
- **Credential hygiene:** no secret was printed, copied or persisted outside the QA DB/repo state; tokens passed
  transiently (form fill / curl env), never into git or evidence files.
5. **Coverage limits to disclose, not waive:** exhaustive measured contrast, every palette/viewport/native surface, large-account Slack pagination, every provider release and independent security review are not proven by the sampled/local evidence.

## Stop rule

Do not send messages, revoke provider grants, use substituted credentials, extract browser cookies, replace a static YouTube topic with an empty feed, restart the owner's app, or claim CI/independent review. Any publication step needs the owner's explicit authorization and a clean Inbox-only diff.
