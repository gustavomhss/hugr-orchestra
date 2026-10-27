---
name: live-seat-maintenance
description: How to change the live seat safely — desktop senses and loop, the meeting store and migrations, consolidation, recall tools, handoff — with the traps that already bit and the gates to run
---

# Live seat maintenance

Read `live-seat-ownership` first for who owns what and the invariants. Spec: `docs/specs/live-seat/`.

## Where a change goes

- New wire field or route: `packages/schema/src/meeting.ts` and `packages/protocol/src/groups/meeting.ts`, handler in `packages/server/src/handlers/meeting.ts`, then `bun run generate` from `packages/client`. Tell the Interface session first: the shapes are frozen with them.
- New table or column: a Drizzle table in `session/meeting*.sql.ts` (snake_case fields) and a migration under `packages/core/src/database/migration/`.
- New card item kind or commitment state: schema literals, `meeting-consolidation.txt`, the strict decoder in `meeting-consolidation.ts`, and the read side in `meeting-memory.ts`.
- New core service: a `makeLocationNode` node, registered in `location-services.ts`, exported in `packages/core/package.json`.
- New core tool: the tool file, `tool/builtins.ts`, the text in `tool/text.ts`, the `live` profile grant, the package.json export.
- New desktop sense, setting or hotkey: the matching `live-*.ts` file in `apps/desktop/src/main`; IPC only through `live-ipc.ts`.

## Traps

- The migration runner wraps each migration in a transaction. Rebuilding `meeting` cascades into `meeting_segment` and memory rows unless they are copied out first.
- Every new Electron import must be added to `apps/desktop/src/main/electron-mock.fixture.ts`, or the guard test fails.
- `TransportEntry` in `live-transport-log.ts` is a closed union: add every new log event there.
- Desktop main and preload must never import the `@orchestra/app` root; use the leaf `@orchestra/app/live`.
- The renderer uses a memory router. Main navigates only through deep links (`sendDeepLinks`), never `location` or pushState.
- `meeting_item` is keyed by `(id, revision)`. Changes insert a revision; reads take the latest. Never update a row in place.
- Consolidation keeps one run per meeting with a process-global set; a second `start` is a no-op.
- `team_message` delivery needs the shared `globalSessions` node from `tool/task.ts`; never create a second one.
- The V2 server never publishes `session.status`. `live-session-client.ts` ends a reply on a `session.next.step.ended` whose finish is not `tool-calls`; waiting for an idle status leaves every request open, and Look and Stop then hang on Thinking.
- After a `live_look` call the frame is often admitted before the looking turn's last step, which then answers `[no-answer]`. `live-loop.ts` treats a step as the reply to the frame only after that turn has gone idle; resetting on the first step after admission drops the real answer.
- Run the isolated DEV app from Terminal.app (`open -a Terminal <script>.command`), so macOS grants the microphone to Terminal. Its DB is in memory: a restart drops the OpenRouter and speech-to-text keys.
- An agent's commit can revert unrelated dev files when it was based on an old tree. Before any PR, check `git diff --stat origin/dev...HEAD` lists only your files.

## Gates

- Tests run only on Actions: `bun run test:ci core test/session/meeting.test.ts test/session/meeting-memory.test.ts test/session/meeting-consolidation.test.ts test/tool-meeting-recall.test.ts test/session/meeting-briefing.test.ts test/session/meeting-handoff.test.ts` (trim to the files you touched). Desktop: `bun run test:ci desktop <files>`.
- Typecheck: `gh workflow run typecheck.yml --ref <branch>`. Never on the Mac.
- `bun run check:guards --base origin/dev` before calling a change done.
- A real audio run is the last step of a campaign, not of every change.
- A user-visible change (setup, hotkeys, settings, permissions) also updates `docs/guides/live-meetings.md`.

## Real Mac run

- Launch an isolated DEV app from Terminal.app with a `.command` script that runs `electron-vite dev -- --remote-debugging-port=<port>` from `apps/desktop` with `ORCHESTRA_TEST_ONBOARDING=1`, piping output through `grep -v sk-or`. Pick a port no other session uses.
- Drive it over CDP: the main window target matches `5173/index` (not `index.html`, which also matches the overlay); the overlay matches `live/index`. Main: `window.api.startLiveMeeting(title)`, `stopLiveMeeting()`. Overlay: `window.live.act({ kind: "ask", question })`, `window.live.state()`.
- Keys go in only by the owner (a script the owner runs reads them and posts them through CDP). An agent never types, prints or passes a real key.
- Stealth check: share the full screen in Meet and have the owner watch the share; `screencapture` alone shows the overlay hidden from captures, not from a given call app.
