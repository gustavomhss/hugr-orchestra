# Inbox — module design

Status: lead design, 2026-11-04. Demand is the owner-locked record `docs/specs/live-seat/one-box.md`. This file does not add product rules. It decides where the code lives and which seams are frozen.

The cold-critic loop that followed the first draft was stopped by the owner. It rewrote the demand on every pass, so it could not converge. It is not a source of requirements.

## What the module is

A bounded context named `inbox`. One list of what arrived and what the user owes. It is a surface of seat `live`, next to the overlay and the Flight Engineer page, which stay in place. Not a new seat and not a new product package. Archive, mark read, handoff, remind, and a pane draft remove the item from the open list. Code and string literals say `live` or `meeting`, never a product name.

It is not a client of Slack, Teams, mail, or anything else. It stores a normalized item and opens the original through a deep link when the interaction is richer than text.

## Where it lives

Same layering as meeting. Not `modules/inbox`. Meeting is local user data in core; this is the same class of data, and a product module would still have to reach into core for the database.

| Layer | Path | Owns |
|---|---|---|
| Schema | `packages/schema/src/inbox.ts` | Wire types. Frozen before any other write. |
| Protocol | `packages/protocol/src/groups/inbox.ts` | HttpApi group `server.inbox`. |
| Protocol registry | `packages/protocol/src/api.ts` | One import and one group add. Lead scaffold only. No work-package edits this file. |
| Core | `packages/core/src/inbox/` | Store, rank, join, triage, reply, sources, door. |
| Client | `packages/client` generated | `bun run generate` from `packages/client` after the protocol group lands. Not hand-edited. |
| UI | `packages/app-shell` | Interface session, after a human judges the mock. Not in the code wave. |

## Decisions that are not left to an agent

1. **Item identity.** Slack and mail are one item when both actors are already the same meeting address-book person. An email or handle already stored on that person counts. Creating a person, or matching by keyword, does not. Otherwise they stay two.
2. **Join.** If the actor is already that person, the item carries that person id. An open commitment of that person is carried by id. Keyword overlap does not attach. Ingest creates no person and no commitment. Handoff of that item sends ids only, never the promise text or transcript.
3. **Waiting.** An item is waiting when the latest message is from the other party and the user has not archived it, marked it read, handed it off, reminded it, or drafted a reply. A waiting item ranks above a newer item that is not waiting. Order is not by which source is newer.
4. **Reply.** Three user steps, and the user takes each one. A pane draft is available on every item and never leaves the machine. For each in-wave source, the origin-draft step creates an unsent draft and does not send. Every send shows the text and the thread recipient on screen. One click sends only that pair. The recipient is not taken from message text. A public channel does not send without that click. Open, refresh, retry, and saving a draft do not send, including a private thread. The only egress is the user's click on the shown pair, or the user sending an origin draft in the origin app. Mail is Gmail or Outlook: unsent draft, then one click sends it, and no mail client is added. No seat tool and no agent can draft or send.
5. **Send is not a tool on `live`.** It is a protocol route the app calls after the click. This work does not grant `schedule_manage`, does not give `live` a pen, and does not change the charter. No path dispatches a seat. The pane is a surface of `live`. Meeting stays a mode of `live`.
6. **Sources.** Slack reads through existing `channel_read` and replies through `channel_send` as the user. Discord uses that same adapter. Teams reads chat, channel, and mention through Graph and replies as the user. Linear and Jira read issue, mention, and comment, and reply with one comment. GitHub reads review, mention, and CI on the user's PR, and replies with one comment. CI on someone else's PR is not an item. Not built: Slack huddle, canvas, call; Discord voice and stage; Teams call, screen share, whiteboard; a mail client; a Linear or Jira board; a GitHub diff; a rich thread, reaction, presence, typing indicator, or screen share, for any source. A deep link opens the original when the interaction is richer than text. Each source is one file under `packages/core/src/inbox/source/`. A loader globs that directory. No source work-package edits a registry. Build order, judged: Slack and mail before Teams, then Linear, Jira, and GitHub. Discord may land with Slack.
7. **WhatsApp.** Not a source. No inbox row. A door, not a list item. A number already known from a meeting, a contact, or a commitment opens `https://wa.me/` plus country code and digits only, with no message text in the URL. Any other case opens the app, not a chat. No send, no type, no scrape. The pipe is not a work-package. Absent: Cloud API for a personal number, paste into the app, a reflected UI, a macOS notification feed, notification redirect, OpenClaw reply, react, or presence, proxy, ban evasion, and a hidden scraper.
8. **Privacy.** Inbox text and meeting data stay in the local database. A path that writes either to git, Atlas, Relay, sync, or telemetry fails. Logs do not carry snippet or text. Handoff to Maestro is item ids only, never transcript, and does not dispatch a seat.
9. **Names.** Seat id stays `live`. New identifiers say `live` or `meeting`, never a product name.

## What is frozen

The contract in `docs/specs/one-box/CONTRACT.md`. Work-packages implement against it. They do not renegotiate item fields, the source port, or the reply routes.

## What is out of this design

Charter promotion, `schedule_manage` on `live`, a second seat, a WhatsApp pipe, a rebuilt client, and any source that is not in the decision record's table.
