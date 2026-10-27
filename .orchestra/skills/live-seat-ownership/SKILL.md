---
name: live-seat-ownership
description: Who owns each piece of the live seat (meeting copilot), where its code lives, the privacy invariants that must not regress, and the owner decisions already taken
---

# Live seat ownership

The live seat (id `live`) is the user's meeting copilot: it hears the call, answers in an overlay, and remembers meetings, people and commitments. Design: `docs/specs/live-seat/README.md`; memory as built: `docs/specs/live-seat/memory.md`. How to change it: skill `live-seat-maintenance`. How to use it: skill `live-seat-usage`.

## Ownership

| Piece | Code | Owner |
|---|---|---|
| Senses (capture, transcriber, transport log) | `apps/desktop/src/main/live-*.ts`, `preload/live-capture.ts` | live seat |
| Loop, bridge IPC, settings, readiness, tray | `live-loop.ts`, `live-ipc.ts`, `live-settings.ts`, `live-readiness.ts`, `live-tray.ts` | live seat |
| Shared renderer types | `packages/app-shell/src/live.ts`, re-exported by `context/platform.tsx` | live seat; tell the Interface session before editing |
| Overlay, screens, locales, deep-link handling | `packages/app-shell` renderer, `apps/desktop/src/renderer` | Interface session |
| Meeting record and memory store | `packages/core/src/session/meeting*.ts`, `meeting*.sql.ts`, migrations | live seat |
| Wire types | `packages/schema/src/meeting.ts`, `packages/protocol/src/groups/meeting.ts` | live seat; frozen with the Interface session |
| Recall tools, briefing, handoff | `tool/meeting-recall.ts`, `session/meeting-briefing.ts`, `session/meeting-handoff.ts` | live seat |
| Seat definition and charter | `modules/maestro/coordination/src/seats/`, `prompt/live.txt` | live seat |
| Peer channel | `packages/core/src/tool/team-message.ts` | shared with Maestro |

## Invariants

- Private to the user. Meeting data lives only in the local database: never git, Atlas, Relay, sync, telemetry or any remote. No code path may copy it out.
- No encryption layer. The owner rejected it; FileVault covers rest. Do not add sealing or key paths.
- Only `live` reads meeting memory: only its profile is granted the recall tools, and Maestro gets only what the user hands off.
- The handoff carries items with ids, never transcript or quotes.
- The live seat never writes Atlas knowledge or rules and never dispatches seats. It suggests; the user or Maestro decides.
- Logs and transport logs carry ids, counts and timings, never text, quotes, names or keys.
- Meetings survive Session deletion; only deleting the meeting erases it. Person rows stay as the user's address book.
- Nothing merges people on its own. Consolidation only proposes.
- Stop never waits for a model.
- Code says `live` and `meeting`. Never a product name or a `fe_` prefix in code.
- The recording indicator is always visible while capture runs. No feature is designed to deceive other participants.

## Owner decisions

- D1 cloud streaming STT (Deepgram) in v1, local in v1.1. D2 suggestions off by default. D3 settled: feature name chosen by the owner, seat id stays `live`.
- M1 personal and local. M2 `kept` by default with a consent prompt; `ephemeral` per meeting. M3 no sealing. M4 never writes Atlas.

## Known limits (declared, not bugs)

- macOS only (14.2+ for system audio). Real audio runs need the packaged app or a dev run from the owner's own terminal (TCC attribution).
- Consolidation has no retry; an interrupted card stays `failed`.
- The tray icon asset and the `orchestra://live` route belong to the Interface session.
