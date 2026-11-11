---
name: inbox-usage
description: How to operate Orchestra Inbox day to day. Open it with no project, connect a source, save a scope, synchronize, read a failure, disconnect without revoking the provider, and hand ids to Maestro. Use when someone asks how Inbox works, why it is empty, how to connect Slack, mail, GitHub or Jira, what Disconnect does, or says operação, onboarding, or sources. Do not use it to add a provider or to cut a release.
---

# Inbox usage

For anyone driving or explaining Inbox. First connection: `docs/guides/inbox-onboarding.md`. Day to day: `docs/guides/inbox-operation.md`. Provider rules: `docs/guides/inbox.md`. Boundaries: `inbox-ownership`. Internals: `inbox-maintenance`.

## Open it

Inbox is in the main navigation. It does not need a meeting and it does not wait for a project. With no project, Board rows are absent. Messages, drafts and credentials are still there.

The design preview is `/orchestra/inbox?preview=inbox` in a development build. It shows samples and saves nothing.

## Connect and sync

1. **Sources** is the connection panel. **Credential saved** means stored, not verified.
2. Slack is the browser sign-in. Finish it on the same computer as the server. The return address is `http://localhost:19877/inbox/slack/callback`. Remote-server login stays disabled.
3. Mail, Calendar, GitHub, Linear, Jira and the deferred sources take a manual credential. Saving it does not collect.
4. Load choices, select a scope, save, then **Synchronize**. An empty Slack or mail selection collects nothing. An empty GitHub repository list, an empty GitLab project list, and an empty PagerDuty service list do not: those mean the whole personal feed.
5. There is no background poll. Opening the page lists stored rows, pulls connected Jira, and pulls legacy Slack bindings for the open location. Slack OAuth, mail, GitHub, feeds and calendar wait for **Synchronize**.

## Read the result

- **Needs you** is stored waiting state. **All items** includes informational rows.
- A failed or rate-limited receipt is a failure. Do not treat it as an empty mailbox, and do not delete the subscription to "fix" a provider outage.
- Join, topic and archive notices are not waiting items. GitHub CI appears only for the signed-in user's own pull.
- **Open original** leaves Orchestra. Inbox is not the thread history.

## Act

- **Save draft** writes the local database and sends nothing. **Send reply** or **Post comment** is the send.
- Read-only imports (Slack OAuth, collected mail, Teams, Discord, feeds, calendar) do not send. Use **Open original**.
- **Hand to Maestro** delivers ids. It does not wake a seat. With no repository, it does not create a session.
- **Disconnect on this installation** removes the local credential and keeps imported rows. It does not revoke the provider grant. Say that when someone asks if disconnect logs them out of Slack.

## Do not

- Print a token, a generation id, or a message snippet from the owner's database.
- Restart or attach to the owner's running app.
- Invent a human Slack message, a YouTube upload, or a GitHub review that was not observed.
- Start Discord, GitLab, Trello, Sentry, PagerDuty, or Teams work from an empty Inbox. Those stay deferred or skipped.
- Cut a release. That is the owner's step after `dev`.
