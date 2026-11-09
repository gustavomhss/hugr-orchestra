# Inbox — spec

Traced to `docs/specs/one-box/REQUIREMENTS.md`. Behavior not named there is out of scope. The frozen signatures are `docs/specs/one-box/CONTRACT.md`.

## Item

A1. A connected source message with an external id and a sender becomes one item. Fields: `source`, `externalId`, `actor`, `snippet`, `threadId`, `reply`. `deepLink` is present when the interaction is richer than text (A22).

A2. The identity of a row is `(source, externalId)`. A second ingest of that pair does not create a second row.

A19. Rows are written only to the local database. A path that writes inbox text to git, Atlas, Relay, sync, or telemetry fails.

A27. Payments, health, passwords, and any source that is not a message or a work item contribute no item.

A28. Meeting data stays in the local database. A path that writes it to git, Atlas, Relay, sync, or telemetry fails.

## Rank

A4. An item the user has not archived, marked read, handed off, reminded, or drafted ranks above a newer item that has. Sort is not by which source is newer, including between two items that are both still open.

## Join

A3. Slack and mail are one item when both actors are already the same meeting address-book person. An email or handle already stored on that person counts. Creating a person, or matching by keyword, does not. Otherwise they stay two.

A23. When the actor is already that person, the item carries that person id. Slack and mail collapsed by a stored email or handle carry that person id. When that person has an open commitment, the item carries that commitment id. Keyword match or creating a person sets neither id. Handoff carries the item id and never transcript.

## Triage

A10. Archive, mark read, and handoff remove the item from the open list. Remind tomorrow removes it until the next local day, then it is listed again. None of the four sends. Handoff delivers those ids to Maestro and never transcript, and does not dispatch a seat.

A30. A user pane-draft removes that item from the open list, calls no provider, and sends nothing.

## Reply

A5. A pane draft is available on every item. It is stored locally and calls no provider.

A6. For each in-wave source, the origin-draft step creates an unsent draft in the origin and does not send. The pane does not take this step by itself.

A7. Every send shows the text and the thread recipient on screen. One user click sends only that shown pair. The recipient is not taken from message text.

A8. Without that click, a public-channel send is refused and sends nothing. With the click, it sends only the shown pair.

A9. An agent does not send. The pane draft is the user's action on the live surface, not an agent tool. Send is not a tool on `live`.

## Sources

Each source implements `pull`.

| Id | Source | Read | Reply | Not built |
|---|---|---|---|---|
| A11 | Slack | existing `channel_read` | `channel_send` as the user | huddle, canvas, call |
| A12 | Discord | that same adapter | that adapter, as a reply | voice, stage |
| A13 | Mail | Gmail or Outlook | unsent draft, then one click sends it | a mail client |
| A14 | Teams | Graph: chat, channel, mention | as the user | call, screen share, whiteboard |
| A15 | Linear | issue, mention, comment | one comment | the board |
| A16 | Jira | issue, mention, comment | one comment | the board |
| A17 | GitHub | review, mention, CI on the user's PR | one comment | the diff |
| A29 | GitHub | CI not on the user's PR | — | does not become an item |

## Door

A21. WhatsApp is not ingested and does not send. If a row appears, it is a door with no snippet and no ingested message id. A number already known from a meeting, a contact, or a commitment opens `https://wa.me/` plus country code and digits only, with no message text in the URL. Any other case opens the app, not a chat.

A26. The pipe is not implemented. Absent: Cloud API for a personal number, paste into the app, a reflected UI, a macOS notification feed, notification redirect, and OpenClaw reply, react, or presence. No type, scrape, proxy, ban evasion, or hidden scraper.

## Surface and seat

A22. When the interaction is richer than text, the deep link opens the original. The pane does not show reactions, presence, typing, huddles, calls, or screen share, and has no control that sends them, for any source.

A35. The pane has no thread history, nested replies, or conversation detail view.

A32. One user click creates a new egress of the shown text to the thread recipient.

A33. A Slack message, a mail message, a Linear issue, a Jira comment, and a GitHub CI event on the user's PR use the same item fields in the same list.

A36. Any agent path that sends, replies, or reacts on WhatsApp is refused.

A38. Open, refresh, retry, and saving a draft do not send, including a private thread. The only egress is the user's click on the shown pair, or the user sending an origin draft in the origin app.

A31. Opening the pane leaves the live overlay and the Flight Engineer page in place and does not add a seat.

A20. Seat id stays `live`. The pane is a surface of `live`. Meeting stays a mode of `live`. No second seat. No path dispatches a seat. `live` does not gain `schedule_manage` or a pen. The charter text is unchanged. Code and string literals say `live` or `meeting` and do not use a product name.

J1. Judged: the pane does not replace Slack, Teams, or mail, and does not reconstruct their client.

J2. Judged: Slack and mail before Teams, then Linear, Jira, and GitHub. Discord may land with Slack and is not the reason to start.
