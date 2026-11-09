# Inbox — requirements

Demand: `docs/specs/live-seat/one-box.md`, verbatim. Each row is one acceptance test. Red now: no inbox tests exist. `judged` is not auto-greened.

| Id | Test | Judged |
|---|---|---|
| A1 | A connected source message with an external id and a sender becomes one list item with source, external id, actor, snippet, thread id, and a reply-capability flag. | |
| A2 | Ingesting the same source and external id twice does not create a second item. | |
| A3 | Slack and mail are one item when both actors are already the same meeting address-book person, including when that person's stored email or handle is the account. Creating a person, or matching by keyword, does not collapse them. Otherwise they stay two. | |
| A4 | An item the user has not archived, marked read, handed off, reminded, or drafted ranks above a newer item that has. Order is not by which source is newer, including between two items that are both still open. | |
| A5 | A pane draft is available on every item. It calls no provider and does not leave the local database. | |
| A6 | For each in-wave source, the origin-draft step creates an unsent draft in the origin and does not send. The pane does not take this step by itself. | |
| A7 | Every send shows the text and the thread recipient on screen. One user click sends only that shown pair. The recipient is not taken from message text. | |
| A8 | A public-channel send without that click is refused and sends nothing. With the click it sends only the shown pair. | |
| A9 | An agent does not send. The pane draft is the user's action on the live surface, not an agent tool. | |
| A10 | Archive, mark read, and handoff remove the item from the open list. Remind tomorrow removes it until the next local day, then it is listed again. None of the four sends. Handoff delivers those ids to Maestro and never transcript, and does not dispatch a seat. | |
| A11 | Slack items come from existing `channel_read`. Reply uses `channel_send` as the user. Huddle, canvas, and call are not implemented. | |
| A12 | Discord items come from that same adapter. Reply uses it. Voice and stage are not implemented. | |
| A13 | A connected Gmail or Outlook account produces items. Reply is an unsent draft, then one click sends it. No mail client is added. | |
| A14 | Teams chat, channel, and mention come from Graph and become items. Reply is as the user. Call, screen share, and whiteboard are not actions. | |
| A15 | A Linear issue, mention, and comment become items. Reply is a comment. The board is not rebuilt. | |
| A16 | A Jira issue, mention, and comment become items. Reply is a comment. The board is not rebuilt. | |
| A17 | A GitHub review, mention, and CI event on the user's own PR become items. Reply is a comment. The diff is not rebuilt. | |
| A19 | Inbox text is written only to the local database. A path that writes it to git, Atlas, Relay, sync, or telemetry fails. | |
| A20 | Seat id stays `live`. The pane is a surface of `live`. Meeting stays a mode of `live`. No second seat. No path dispatches a seat. `live` is not granted `schedule_manage` or a pen. The charter is unchanged. Code and string literals say `live` or `meeting` and do not use a product name. | |
| A21 | WhatsApp is not ingested and does not send. If a row appears, it is a door with no snippet and no ingested message id. A number already known from a meeting, a contact, or a commitment opens `https://wa.me/` plus country code and digits only, with no message text in the URL. Any other case opens the app, not a chat. | |
| A22 | When the interaction is richer than text, the deep link opens the original. The pane does not show reactions, presence, typing, huddles, calls, or screen share, and has no control that sends them, for any source. | |
| A23 | When the actor is already a meeting address-book person, the item carries that person id. Slack and mail collapsed by a stored email or handle carry that person id. When that person has an open commitment, the item carries that commitment id. Keyword match or creating a person sets neither id. Handoff carries the item id and never transcript. | |
| A26 | The WhatsApp pipe is not implemented. Absent: Cloud API for a personal number, paste into the app, a reflected UI, a macOS notification feed, redirecting other apps' notifications to Orchestra, and OpenClaw reply, react, or presence. No type, scrape, proxy, ban evasion, or hidden scraper. | |
| A27 | Payments, health, passwords, and any source that is not a message or a work item contribute no item. | |
| A28 | Meeting data stays in the local database. A path that writes it to git, Atlas, Relay, sync, or telemetry fails. | |
| A29 | A CI event that is not on the user's PR does not become an item. | |
| A30 | A user pane-draft removes that item from the open list, calls no provider, and sends nothing. | |
| A31 | Opening the pane leaves the live overlay and the Flight Engineer page in place and does not add a seat. | |
| A32 | One user click creates a new egress of the shown text to the thread recipient. | |
| A33 | A Slack message, a mail message, a Linear issue, a Jira comment, and a GitHub CI event on the user's PR are the same item fields in the same list. | |
| A35 | The pane has no thread history, nested replies, or conversation detail view. | |
| A36 | Any agent path that sends, replies, or reacts on WhatsApp is refused, including one not named OpenClaw. | |
| A38 | Open, refresh, retry, and saving a draft do not send, including a private thread. The only egress is the user's click on the shown pair, or the user sending an origin draft in the origin app. | |
| J1 | The pane does not replace Slack, Teams, or mail, and does not reconstruct their client. | yes |
| J2 | Build order is Slack and mail before Teams, then Linear, Jira, and GitHub. Discord may land with Slack and is not the reason to start. | yes |
