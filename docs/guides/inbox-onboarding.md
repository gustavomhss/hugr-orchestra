# Inbox onboarding

How to get from an empty Inbox to one working source. Day to day is [Inbox operation](inbox-operation.md). Each provider's rules are in [Inbox](inbox.md).

Inbox is one list for this installation. It does not follow the project in the sidebar, and it does not live in your home folder. You can open it before you pick a project.

## 1. Open Inbox

Choose **Inbox** in the main navigation. You do not need a meeting running.

With no project open, the page still loads. Board requests appear only while a project is open. That is expected, not a failure.

A development build can show sample rows at `/orchestra/inbox?preview=inbox`. The banner says **Design preview**. Those rows are not saved and no account is connected.

## 2. Pick one source

Open **Sources**. Connect one source before the rest. **Credential saved** means Orchestra stored a secret. It does not mean the provider accepted it. The check is the first successful synchronize.

Start with a source you already have a grant for:

- **Slack.** **Connect Slack**. The browser opens on this computer. The return address is `http://localhost:19877/inbox/slack/callback`. If something else holds that port, the login fails and Orchestra does not stop the other program. Finish the sign-in on the same computer as the Orchestra server. A remote server cannot use this loopback login.
- **Mail, Calendar, GitHub, Linear or Jira.** Paste the manual credential the provider documents. Jira also needs the site as an `https` origin, with no path and no user in the URL, and the account email. GitHub wants a personal token that can read notifications. Linear wants a personal API key, not some other product's login token.

Teams, Discord, GitLab, Trello, Sentry and PagerDuty can be stored as manual credentials. They are not part of the go-live path. Skip them until you mean to set one up. WhatsApp is only a contact shortcut.

## 3. Choose a scope, then synchronize

Saving a credential does not import anything. Opening Inbox does not import anything.

1. Load the choices the provider returns.
2. Select the conversations, folders, calendars or repositories you want. An empty Slack or mail selection imports nothing. That is the safe default.
3. Save the selection.
4. Choose **Synchronize**. Slack calls this **Synchronize last 7 days**. One click imports a bounded page, not the whole history. **Continue synchronization** resumes after you close the dialog or restart the process.

The first feed sync remembers what is already in the feed and stays quiet. Only a later new entry becomes an item. Do not delete a YouTube or RSS subscription because the first sync showed nothing.

## 4. Know it worked

You are done with onboarding when all of these are true:

- The source shows synchronized, not failed and not still idle.
- At least the scope you saved is listed. An empty scope that you saved on purpose is also done: it must stay empty.
- A row you recognize, if the provider had one, opens and **Open original** reaches the provider.
- Disconnect is still available and you have not revoked the provider grant unless you meant to, in the provider's own site.

A rate limit tells you when to retry. Wait. Do not reconnect to get around it.

## What this setup does not do

- It does not send Slack messages. Imported Slack text is read-only. Reply in Slack.
- It does not revoke a grant when you disconnect. Disconnect removes the credential from this installation only.
- It does not watch the account in the background. You synchronize when you want a new snapshot.
- It does not create a Maestro session just because you handed off an item with no repository open.
