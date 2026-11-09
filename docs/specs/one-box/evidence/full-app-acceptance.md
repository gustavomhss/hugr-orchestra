# Full-app Inbox acceptance — isolated local web app

This is the complete web app and production local backend, not `?preview=inbox`, a standalone Sources fixture,
an installed desktop build or a live-provider acceptance. All Inbox content was explicitly synthetic.

## Isolation

- Separate backend/web processes on IPv4 loopback ports **4102/3005**; existing listeners were left alone.
- Separate database, credential key and XDG data/config/state/cache under a new `$TMPDIR/inbox-full-app-*`
  scratch directory. Credential inheritance and model metadata fetching were disabled; no session/model was run.
- A new browser session, `inbox-full-aae08b27b25e`, driven with **agent-browser** and existing Chrome, without a
  personal profile. The browser entry used the task server's local-only authentication token.
- The app's own chooser opened the disposable project: **Choose project → Add project → Search folders →
  Add without git**. No browser-storage project-selection seeding or project trust approval was used.
- `packages/app-shell/script/inbox-full-app-seed.ts` added six explicit synthetic items through the real Client/API.
  The helper refuses other server origins and directories outside its temporary QA prefix. It did not connect
  any provider, acquire messages or send. Six persisted identities were checked after insertion.

## Observed behavior and independent local oracles

1. `/orchestra/inbox` initially required project selection and disabled Sources. After selection it showed the
   actual empty local Inbox, then all six synthetic items after Refresh: two messages and four notifications.
2. The native read action marked the Calendar item read. Needs-you changed from six to five; All items retained
   six. A separate authenticated raw HTTP GET confirmed six records, five waiting and Calendar `waiting=false`.
   The first ad-hoc GETs used the wrong Location query spelling; those were instrument failures, not product
   results. The corrected query was `location[directory]`, matching the public Client's nested query contract.
3. Attention/source filters correctly isolated the retained read Calendar item. Light/dark switched through the
   app's real theme control. Reopening with the authenticated entry URL retained project selection and local read
   state. A plain reload without the one-shot auth token hit the protected server gate; this is not claimed as
   persistent web-login acceptance or changed as part of Inbox work.
4. The actual Sources panel reported every provider disconnected. Adding a private-address feed URL was refused
   and retained the edit/error state. Adding an example HTTPS subscription saved locally; a separate API read
   showed `initialized=false`, no `checkedAt`. It was removed through Stop following without synchronizing it.
   No provider token, live subscription or provider write was created.
5. A calibrated localStorage scan found none of the chosen synthetic message/title probes. A temporary synthetic
   control key proved the scan could see matching stored text, then was removed. This checks those values in
   localStorage, not all browser stores or a general data-leak theorem.
6. Agent-browser's page-error log was empty after the full-app interactions. Axe 4.12.1 found no scoped Inbox
   violations, but **contrast remained incomplete** on glass/pseudo-element backgrounds. An injected unlabeled
   QA button produced the expected `button-name` violation and was removed. This is not a blanket accessibility
   or WCAG pass; measured contrast and owner/native review remain necessary.

## Captures

- `full-app-inbox-dark.png`: complete desktop-width shell and synthetic Inbox.
- `full-app-inbox-light.png`: light scheme, retained history and local read state.
- `full-app-inbox-narrow.png`: 960px viewport, collapsed sidebar and usable list/detail layout.
- `full-app-sources-light.png`: real Sources panel with an explicitly unacquired local QA subscription.

These files document observations for review, not a substitute for owner acceptance or tests that run in CI.

## Cleanup

Backend/web PIDs **67309/67311** were matched to their commands/ports before TERM. Their task jobs exited 143;
the same listener query that had identified them returned no listener after termination.
Only the named task browser was closed. No installed app, owner server, existing tab, project or credential was
stopped, restarted, modified or deleted. Disposable state remains in the scratch directory for inspection.
