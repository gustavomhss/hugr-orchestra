---
name: inbox-ownership
description: What Orchestra Inbox owns and never owns, the invariants that must not regress, and the owner decisions already taken. Use before adding a provider, a project filter, a background poll, a send path, or a release step, and before treating an unobserved live sample as a missing fix. Also use when someone says the inbox should follow the open project, live in ~, or wait for Astra.
---

# Inbox ownership

Inbox is one list of what arrived and what the person owes, for this installation. It is not a seat and not a project store. How to change it: `inbox-maintenance`. How to run it: `inbox-usage`. Guides: `docs/guides/inbox-onboarding.md`, `docs/guides/inbox-operation.md`, `docs/guides/inbox-maintenance.md`. Provider detail for a reader: `docs/guides/inbox.md`.

## Owns

- Rows, drafts, egress, feed subscriptions, calendar snapshots and the Slack checkpoint, under the constant owner `install` (`packages/core/src/inbox/install.ts`).
- Hashed source credentials for that same installation slot. The unhashed legacy id is left alone.
- Explicit acquisition and the account receipt (`synced`, `failed`, `rate_limited`). A pull error is a failure, not an empty list.
- Local triage: archive, mark read, remind, pane draft. None of those sends.
- Board projection of the open project's local owner requests, and handoff of item ids to Maestro when that project is a repository. Resolving a request archives only that project's row.

## Never owns

- The open project, `os.homedir()`, or a project filter. A selected project projects Board and receives handoff. It is not the row owner. Opening the page does not pull that folder's legacy Slack bindings. An empty or missing folder still lists stored rows; it does not project Board and does not hand off.
- Provider revocation. Disconnect removes the installation credential. It does not revoke the grant.
- Sending on a read-only import. Slack OAuth messages, mail/Teams/Discord collection, feeds and calendar events do not send through Inbox.
- Invented evidence: a human Slack message, a thread reply, a provider revocation, a new YouTube upload, or a GitHub notification that is not CI on the signed-in user's own pull.
- Discord, GitLab, Trello, Sentry and PagerDuty as a go-live requirement. Teams stays skipped. WhatsApp is a contact shortcut, not a source. Reddit stays approval-gated.
- A release tag, a restart of the owner's app, or an Astra review. Those are not this surface's job.

## Boundaries

| Surface | Where Inbox stops |
|---|---|
| Project Board | Inbox shows open questions, intake cards that need acceptance, and held Review deliveries. It does not start a runner, refresh GitHub, approve work, or answer the question. |
| Maestro | Handoff delivers ids only. It does not wake a seat and does not create a session when the project id is `global`. |
| Integrations | Legacy bot bindings stay there. An Inbox Slack grant does not send through a bot. |
| Release | The owner cuts the release. An agent's job ends when the change is on `dev`, tested and audited. |

## Invariants

- One installation inbox. Stored rows are shared after adoption. Adoption moves a non-install row onto `install` and drops a duplicate key, including a second Slack checkpoint.
- Jira and GitLab sites are https origins: no user, no password, no query, no hash, no path.
- GitHub CI is an item only when every related pull is the signed-in user's. A proof error fails the sync. A suite that also names someone else's pull is excluded.
- Slack join, leave, topic, purpose, rename, archive, pin and bot add/remove subtypes are not waiting items. The sync path and the channel page use the same `slackSystem`. Huddle, canvas and call are not items.
- A channel pull that fails is not swallowed into `[]`.
- `inbox-maintenance`, `inbox-ownership` and `inbox-usage` are repo-only. Never add them to a seat's `skills`.

## Owner decisions

- **2026-11-11.** Leftovers are not a go-live gate. The cut on `dev` (`adc623c0ac`) is the go-live cut. It does not certify missing samples and does not tag a release. The older "does not declare go-live" line in `docs/specs/one-box/closure-backlog.md` does not override this.
- **2026-11-11.** There is no Astra loop on this surface. Do not send a pin out for a second model to judge.
- **2026-11-11.** Release stays with the owner. Do not open a release PR, tag, or publish step from Inbox work.
