# Inbox operation

Day to day use after the first source is connected. First connection: [Inbox onboarding](inbox-onboarding.md). Provider limits and field rules: [Inbox](inbox.md). People changing the code: [Inbox maintenance](inbox-maintenance.md).

## Find the next item

- **Everything**, **Messages** and **Notifications** split conversations from events about work. One provider can produce both.
- **Needs you** is what is still waiting. **All items** includes updates you do not have to answer.
- Search by person, title, context, message or thread, or filter by source. The list keeps the service order.
- A row is not a thread transcript. **Open original** opens the provider when a link exists.

Join notices, topic changes and archive notices from Slack are not waiting items. GitHub shows CI only when it is on a pull you authored. Someone else's checks stay out.

## Reply, or don't

Write the text, then **Save draft** if you are not ready. The draft stays in this installation and nothing is sent.

**Review reply** or **Review comment** shows the exact text and the destination. Only **Send reply** or **Post comment** sends. Editing, searching and refreshing do not send.

Slack messages imported through **Connect Slack** are read-only. So are collected mail, Teams, Discord, feeds and calendar events. Use **Open original**. A missing connection refuses the send and keeps the draft.

## Synchronize

Nothing polls. Open **Sources** and synchronize the source you care about.

- An empty selection imports nothing.
- A failed sync keeps the previous rows. It is not an empty mailbox. Read the receipt: failed or rate-limited. Retry when it says you can. Do not delete the source to cure an outage.
- One click is a bounded page. Continue when the panel says more pages remain.
- Changing a filter does not delete rows already imported.

## Hand off and Board

**Hand to Maestro** sends item ids, not the conversation, and does not wake a seat. It is the default next move only when the item is a known meeting commitment. Board decisions cannot be handed back.

While a project is open, Inbox also lists that repository's open Board questions, intake cards that need acceptance, and held deliveries in Review. Use **Open decision/approval** on the Board. Inbox does not approve, answer, or start a runner. With no project, that block is absent. The rest of Inbox stays.

If the open folder is not a repository, handoff does not create a Maestro session.

## Disconnect and secrets

**Disconnect on this installation** removes the credential stored here. Imported rows stay. The provider grant stays until you revoke it on the provider's site.

Credentials belong to this installation, not to the project that happened to be open when you connected. A second project on the same app sees the same Inbox.

Do not copy a token into a chat, a note, or a screenshot. A generation id is not something to paste into a bug report.

## When it looks wrong

| What you see | What it means |
|---|---|
| Page loads with no project | Normal. Board is the only part that needs a project. |
| Source saved, list empty | Scope is empty, the snapshot had nothing in window, or sync has not been pressed. |
| Failed | The provider call failed. Previous rows remain. Not an empty account. |
| Rate limited | Wait for the time shown. Another sync before then does not call the provider. |
| Slack login button disabled | The server is not on this computer's loopback. This login cannot run remotely. |
| Same item in two projects | Expected. There is one Inbox per installation. |
