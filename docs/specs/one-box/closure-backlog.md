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
2. **Other providers' legitimate grants/registrations:** mail, Teams, Discord, Linear, Jira, GitHub, GitLab, Trello, Sentry, PagerDuty and Calendar remain manual-credential/interim. Browser sessions alone do not supply Inbox API grants.
3. **Provider constraints:** Jira's zero-secret public-client requirement remains unsupported by the reviewed references; Reddit stays approval-gated. WhatsApp remains contact-only by design.
4. **CI and publication hygiene:** no commit, push, PR, CI, merge or release has been authorized. The current shared worktree contains unrelated modifications versus `origin/dev`; completion requires a clean, Inbox-only extraction or a deliberate decision about the unrelated changes.

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
5. **Coverage limits to disclose, not waive:** exhaustive measured contrast, every palette/viewport/native surface, large-account Slack pagination, every provider release and independent security review are not proven by the sampled/local evidence.

## Stop rule

Do not send messages, revoke provider grants, use substituted credentials, extract browser cookies, replace a static YouTube topic with an empty feed, restart the owner's app, or claim CI/independent review. Any publication step needs the owner's explicit authorization and a clean Inbox-only diff.
