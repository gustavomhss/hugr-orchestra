---
name: desktop-startup-maintenance
description: How the desktop app starts its owned server, where launch time goes, and the traps that made the first launch fail or every launch slow
---

# Desktop startup maintenance

User guide: `docs/guides/desktop-startup.md`.

## Path

1. `apps/desktop/src/main/index.ts` starts the loading task: Dock channel, then `resolveCliBinary` and `sidecarLaunchEnv` in parallel, then `startOwnedServe`.
2. `resolveCliBinary` (`background-cli.ts`) calls `installCliArtifact` (`cli-install.ts`), which copies the bundled CLI into `userData/cli/<version>-<target>-<sha256>/` once, then runs `--version`.
3. `startOwnedServe` (`owned-serve.ts`) spawns `orchestra serve` through omni and polls `/api/health`. `main.log` records each step with a timestamp; `server.log` has the server's own output.

## Rules

- Readiness fails at once when the child exits. `READY_TIMEOUT` only ends a child that stays alive without answering, so keep it long: macOS scans a new unsigned executable on its first run, and that took about 30s on 0.3.1. A 20s cap turned that scan into "Owned serve not healthy within 20000ms".
- A valid installed copy is hashed against its own manifest on every launch; the bundled copy (about 116 MB) is hashed only when it must be installed. Do not add a second full hash to the warm path.
- Nothing the server start does not need may be awaited before the loading task (the net log once cost about a second there).
- The owned server runs with cwd `userData/global`, an empty folder. Requests that name no directory (Home's provider and model lists) boot a Location for the server's cwd; in the home directory that Location watched the whole home and cost about 3.4s after `server listening`. Never start the owned server in home or another large folder.
- Developer ID signing and notarization remove the first-run scan and the Keychain prompt after each update; until the release secrets exist, builds ship unsigned.

## Measuring

Read the timestamps in the newest `logs/<run>/main.log`: app starting, sidecar connection started, v2 CLI executable resolved, owned serve starting, server ready. Compare a launch right after install with a second launch to separate the macOS scan from our own work.

## Staying connected under load

The banner and the disabled sidebar actions follow `useServerHealth` (`utils/server-health.ts`). On a loaded machine one poll can miss its timeout while the server is fine, so:

- A healthy server is demoted only after two missed polls in a row, and never while the event stream shows life. The decision is `nextServerHealth`; a missed poll is confirmed after 2s instead of 10s.
- The server sends `: heartbeat` every 15s. The generated client drops comment lines, so `tapStreamActivity` (`utils/server-stream-liveness.ts`) reads the raw body and records activity per server URL. `watchStreamStall` cuts a stream silent for 45s (three heartbeats) and the loop in `server-sdk.tsx` reconnects.
- The bounded SSE queue (`subscriberCapacity` in `packages/server/src/handlers/event.ts`) ends a subscriber that falls behind by more than its capacity; the client then reconnects and resyncs. Keep it large enough for a token-delta burst while the renderer is busy.
- An event is encoded once, not once per subscriber. `EventHandler` makes one `eventFrames()` and every `eventStream` maps through it; the bus hands every subscriber the same payload object, and the frame is cached on that object in a `WeakMap`. Keep it that way: a subscriber-specific filter or transform would need its own frame, and the cache is only valid while all subscribers see the same payload. `event-stream.test.ts` counts the encodes.
- Notify order equals commit order per aggregate. `EventV2` (`packages/core/src/event.ts`) takes a `Ticket` inside the commit transaction and delivers listeners, typed streams and the `all` stream only after the previous ticket of the same aggregate has been delivered, so the SSE stream and in-process listeners never see seq 11 before seq 10 even when tool progress, the task tool and the runner publish concurrently. Different aggregates never wait on each other. A listener that publishes to the aggregate it is being notified about delivers inline (the `Delivering` reference); without that it would wait on its own delivery. Durable replay readers (`durable()`) read the table by seq and are unaffected. Any new publish path that notifies after a commit must go through `deliver`; the ticket is released on every exit. The logic lives in `packages/core/src/event/order.ts`; `describe("EventV2 notify order equals commit order")` in `packages/core/test/event-order.test.ts` covers it (a gated delivery, 60 concurrent publishers, unrelated aggregates, and a listener that publishes to its own aggregate).
- `main.log` and `renderer.log` now say what happened: `[server-health] poll failed, keeping last healthy status`, `server marked unreachable`, `[global-sdk] event stream ended, reconnecting`, `event stream stalled, reconnecting`. Read these before guessing at a disconnect.

## Server request caches

Home and settings screens call a few list endpoints on every focus, so the server avoids repeated work on them. Each cache below has one invalidation rule; keep it that way.

- `Config.readGlobal` (behind `config.get`, trust checks and MCP startup) keeps the decoded global settings per config directory. The key is the mtime, size and inode of `orchestra.jsonc` and `orchestra.json`, so an outside edit or a rename-based save is picked up on the next read, and `Config.updateGlobal` drops the entry. Callers get a copy. A same-size in-place edit that lands within one millisecond of the previous mtime would be missed; no writer in the app does that.
- `Catalog.provider.available` and `Catalog.model.available` read credentials once for their own virtual entries (`credentials.all` hits the database and decrypts; `Integration.list` still adds one read). Pass the virtual entries to the helpers instead of calling `provider.all` or `model.all` from inside them.
- `SkillV2.list` already caches per source with a generation guard; `save` and `remove` invalidate it. `skill.list` still returns each skill's full `content` because the skills screen decodes it as required (`skills-data.ts`) and edits from it, so make it metadata-only only together with a by-name read, an API change that needs `bun run generate`.

Left alone on purpose: `agent.detail` and `provider.list` depend on state that has no generation counter (tool toolkits, the credentials database, Claude sign-in), so a cache there could serve a stale answer. `commitDurableEvent` keeps its stringify and parse round trip because the event seal hashes the parsed form, and `Text` and `Reasoning` deltas stay one event per token because the runner tests and the transcript order depend on it; the clients already merge adjacent deltas.
