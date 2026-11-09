# One-box

Status: draft decision record from the owner conversation of 2026-11-04. Not a change to the shipped live-seat invariants. No code, no schema, no mock. Accepting it is a later owner decision.

Formal pack, traced to this record and not a second demand: `docs/specs/one-box/DESIGN.md`, `REQUIREMENTS.md`, `SPEC.md`, `CONTRACT.md`, `WPS.md`.

The owner described the seat as a secretary and the pane as a one-box: one list, inside Orchestra, of what arrived and what the user owes. This file records that idea and the WhatsApp decision that came with it. Seat id stays `live`. Code says `live` and `meeting`, never a product name.

## What it is

A pane in Orchestra. Not a company, and not a client that has to replace Slack, Teams, or mail. Orchestra is a desktop app for software work. The pane is a convenience on top of that. Front, Superhuman, and Missive had to win as the place people read messages. This does not.

The list is one item shape, ranked by who is waiting on the user, not by which app shouted last. The same person in Slack and in mail is one item, not two. The feature the other inboxes cannot copy is the join: the message, the person already in the meeting address book, what was promised in a call, and a handoff to Maestro. Showing every unread message only creates a sixth inbox. The pane earns its place when it empties the list: archive, mark read, turn into a Maestro handoff, remind later, and draft a reply.

It does not reconstruct a network's client. No rich thread UI, reactions, presence, typing indicators, huddles, calls, or screen share. Those stay in the app that already does them. A deep link opens the original when the interaction is richer than text.

## Where it sits

One seat. A meeting is a mode of `live`, not a second seat. The pane is another surface of that same seat, next to the overlay and the Flight Engineer page. Splitting "secretary" into its own seat would split the memory, which is the only asset the join has.

This record does not promote the charter, grant `schedule_manage`, or give `live` a pen. Those stay unaccepted until a later decision. The shipped rules still hold: meeting data stays in the local database, the handoff to Maestro carries items with ids and never transcript, and `live` does not dispatch seats.

Inbox text is a hotter store than a meeting transcript. Until an accepted design says otherwise, it follows the same privacy rule: local database only, never git, Atlas, Relay, sync, or telemetry. A send is a new egress. The recipient comes from the thread, never from text inside the message. Nothing in the pane sends itself.

## This wave

Sources that can return a message id, a sender, and a reply:

| Source | Read | Reply from the pane | Not rebuilt |
|---|---|---|---|
| Slack | yes, `channel_read` already exists | yes, as the user, `channel_send` | huddle, canvas, call |
| Discord | yes, the same adapter | yes | voice, stage |
| Mail | yes, Gmail or Outlook, not built | draft, then send on one click | the mail client |
| Teams | chat, channel, mention, via Graph, not built | yes, as the user | call, screen share, whiteboard |
| Linear | issue, mention, comment; `platform_linear` exists | comment | the board |
| Jira | the same, not built | comment | the board |
| GitHub | review, mention, CI on the user's PR | comment | the diff |

Order when someone builds it: Slack and mail first, Teams chat in the same item shape, then Linear, Jira, and GitHub, which already speak Maestro's language. Discord is free because the adapter exists; it is not the reason to start.

Reply has three steps, and the user takes each one:

1. Draft in the pane. Always available. Nothing leaves.
2. Draft created in the origin app. The user presses send there.
3. Send from the pane, text and recipient on screen, one click. Public channels do not send unattended.

Triage that is not a reply is in scope and more useful: archive, mark read, hand to Maestro, remind tomorrow. An agent does not send on the user's behalf in this wave.

## WhatsApp

Deferred. Not a source in this wave.

If a row appears before the pipe exists, it is a door, not a feed. It opens WhatsApp. When the number is already known from a meeting, a contact, or a commitment, the door is `https://wa.me/<number>`, country code and digits only. Without a number it opens the app, not a chat. Orchestra does not type, scrape, or send.

### The pipe, when it is built

The owner locked this shape and rejected the others. It is a pipe, not an agent.

- The user links the account once, as a companion device, the same class of mechanism OpenClaw uses (WhatsApp Web protocol, Baileys or equivalent). The official app does not have to be open. The phone still has to exist; a linked device dies if the phone is gone too long.
- Inbound messages enter the list with sender and id.
- The user types in the pane and presses send. That text leaves, in that conversation, and only then.
- No model reads the thread, replies, reacts, or sends. No forced presence, no bulk, no mass groups.

Personal number and a shipped feature are different risks. On the owner's own number, the risk is that number. Shipped inside Orchestra, the app is offering the client to whoever installs it. Which of those two it is gets decided when the pipe is turned on, not before.

### Rejected

Recorded so they are not redesigned by accident.

- **Cloud API for the personal number.** The Cloud API receives and sends, and it is not the personal WhatsApp. It needs a business account, a public webhook, and a 24-hour window. A closed Mac does not receive.
- **Paste into the open app.** Send only, and a bad send. The official client must be focused on the right chat. A miss delivers to the wrong person. No id comes back. It does not read.
- **Reflect the official UI** in a container, a webview, or through MCP / app-dock. That is a browser, not a source. Driving the screen does not yield an id, a sender, or a thread.
- **macOS notifications as the feed.** No supported API lets a third-party app read another app's banners. The private Notification Center database is an information-disclosure hole Apple is closing (CVE-2026-20648 on macOS Tahoe), not a feature. A banner is not a thread.
- **Redirecting other apps' notifications to Orchestra.** The system owns the banner. Settings can show, list, or silence it. They cannot address it to Orchestra. A Shortcut trigger is not a copy of the conversation.
- **OpenClaw's agent behavior.** OpenClaw is the prior art for the linked-device pipe. It is not the prior art for who may speak. Its gateway replies, reacts, and can send presence. None of that enters this pipe.

### Terms

WhatsApp Terms of Service, effective 2021-01-04, prohibit reverse engineering the service, creating software that functions substantially as the service, and offering that software to third parties without authorization. They also prohibit auto-messaging and non-personal use unless authorized. A quiet, user-initiated pipe still hits the unofficial-client clauses. It mostly misses the auto-messaging clause, which is about bulk and unattended send.

The grey area is enforcement, not the text. Meta bans numbers, unevenly. A terms breach is not, by itself, a crime. The penalty they apply is losing the number. This file is not legal advice.

Official and in bounds: their mobile, desktop, and web clients, linked devices through those clients, `wa.me`, and the Cloud API on a business number under its own contract.

## Non-goals

- Replacing any network's client.
- Payments, health, passwords, or any source that is not a message or a work item.
- WhatsApp personal as a source before the pipe is explicitly turned on.
- An agent that sends, replies, or reacts on WhatsApp.
- Ban evasion, proxying to look like a phone, or a hidden scraper of WhatsApp Web.
- A second seat for the pane.
