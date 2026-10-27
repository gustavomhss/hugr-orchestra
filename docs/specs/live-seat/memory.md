# Live seat — meeting memory as built

Companion to `README.md`. It records how packages B, D, E and F of the memory plan landed. Package A (bridge) and package C (store) are described in `README.md` under "as built".

## Privacy model (owner decision, 2026-10-26)

- Everything the live seat produces belongs to the user of the OS account, not to the project. Maestro and the other seats are project-first; `live` is user-first.
- Meeting data stays in the local Orchestra database. It is never written to git, Atlas, Relay, sync or telemetry. There is no encryption layer: disk encryption (FileVault) is the at-rest protection.
- Only the `live` seat reads meeting memory. The one crossing to the project is a handoff the user chooses (package F).
- Meetings survive Session deletion (`meeting.session_id` is set to null). Only deleting the meeting erases it.
- Logs carry ids and counts, never transcript text, quotes or names.

## B: menu-bar item

Code: `apps/desktop/src/main/live-tray.ts`, `live-elapsed.ts`; registered from `index.ts`. macOS only.

- While a meeting runs the title shows `● mm:ss`, refreshed every second; otherwise it is empty.
- Menu: Start or Stop meeting, Open, and the last meeting's title.
- The renderer routes in memory, so the tray navigates by sending `orchestra://live` and `orchestra://live?meeting=<id>` through the deep-link ingress (`sendDeepLinks`). The shell parses them in `parseLiveDeepLink` (`pages/layout/deep-links.ts`) and routes them in `orchestra/shell/ingress.tsx` before the server lookup.
- The icon is `trayTemplate.png` from the icons directory (`iconsDir` in `windows.ts`); the `Template` suffix lets macOS tint it.

## D: consolidation after stop

Code: `packages/core/src/session/meeting-consolidation.ts`, prompt `meeting-consolidation.txt`. `POST /api/meeting/stop` calls `start`, which forks the work and returns at once; stop never waits for the model.

- One model call, using the model of the live seat's Session, turns the transcript into the card: summary, decisions, commitments, questions, suggestions and proposed people.
- Output is decoded strictly (extra fields are refused). Invalid output fails the card; it is never repaired.
- Names the model attributes are stored as `unknown:N`. People are only proposed (`meeting_proposal`); the user confirms a new person or a merge. Nothing merges on its own.
- `card_status` goes `pending` to `ready` or `failed`. `card_error` is one of `no_session`, `no_transcript`, `no_model`, `model_error`, `invalid_output`, `internal_error`, `interrupted`.
- A process-global set stops a second run for the same meeting. On boot, meetings still `pending` after stop are marked `failed` with `interrupted`; there is no retry.
- Ephemeral meetings: items get an empty quote and no start time, and the transcript is deleted after consolidation, whether the card succeeded or failed.

Limits: a consolidation that starts during the boot sweep can be marked `interrupted`. The interrupted sweep does not delete an ephemeral meeting's transcript.

## E: recall and briefing

Code: `packages/core/src/tool/meeting-recall.ts`, `packages/core/src/session/meeting-briefing.ts`.

- Tools, granted to `live` only: `meeting_recall {query?, person?, since?, until?, kind?}` searches what was said and decided, and `meeting_commitments {person?, direction?, state?}` lists commitments. Search is SQL `LIKE`. Both read only; there is no write tool on the live path.
- `meeting_commitments` returns open commitments (proposed, accepted, overdue) unless `state` asks for `done` or `dropped`.
- The briefing is a System Context for a `live` Session with a running meeting: the last three meetings with their summaries, plus open commitments in both directions. It is capped at 2400 characters (about 600 tokens) and is empty when there is nothing to say.

## F: handoff to Maestro

Code: `packages/core/src/session/meeting-handoff.ts`, `POST /api/meeting/handoff`.

- The user picks card items; they go to Maestro as one queued `team_message` from `live`, with meeting and item ids as provenance. No transcript and no quotes are sent.
- The message goes to Maestro's most recently active top-level conversation in the project. With none, the handoff opens a new Maestro Session for it.
- Dismissed items and suggestions meant for the owner are refused. Sent items get a new revision with `sent_to_maestro`.
- Maestro decides what to do with them. The live seat never writes Atlas knowledge or rules.
