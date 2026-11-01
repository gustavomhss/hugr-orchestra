---
name: app-dock-native-maintenance
description: Who owns the native (AT-SPI helper), Docker runtime and Linux display side of the App Dock and the Linux workspace in apps/desktop/src/main, the invariants that must not regress, and how to change and test them; use when touching app-dock-native*, app-dock-runtime*, app-dock-linux*, linux-workspace-*, docker-engine, the Linux workspace container or its resources, or when a Linux dock call hangs, reports an unknown outcome, loses its binding, or leaks a helper container.
---

# App Dock native and Linux workspace maintenance

Related: `app-dock-browser-maintenance` (browser tabs, `app-dock-rpc.ts`, `ipc-app-dock*`), `mcp-dock-servers-maintenance` (MCP servers over the same RPC; not repeated), `desktop-startup-maintenance` and `desktop-main-maintenance` (main process boot). Global skills: `atspi-any-app`, `gui-agent-layers`, `gui-agent-security`, `dock-guide`. Container build context: `apps/desktop/resources/linux-runtime/README.md`; native test image: `apps/desktop/test/native/README.md`.

All files below live in `apps/desktop/src/main`.

## Ownership

| Piece | Owner file(s) | Rule |
|---|---|---|
| Wire contract (newline JSON v1) | `app-dock-native-protocol.ts` | Types, `limits` (262144-byte frame, 32 pending), `NativeError`, strict `decode`/`encode`/hello validation. Golden replies live in `test/native/contract`. |
| Transport | `app-dock-native-channel.ts` | Docker attach upgrade (HTTP 101) with multiplexed stdout/stderr; strict header parse, write queue with deadlines, terminate/stop ordering. |
| Request client | `app-dock-native-client.ts` | Hello handshake, sequencing, bindings, control lane (cancel with grace), retire/close. |
| Facade | `app-dock-native.ts` | `NativeDock`: slots, client admission, `bind`/`rebindWorkspace`/`dispatch`/`unbind`/`closeTab`, argument and root/handle validation, cleanup. |
| Workspace-scope glue | `app-dock-native-workspace.ts` | Builds the `WorkspacePreparation` the RPC layer binds (`workspaceScope` plus `native`). |
| Helper container | `app-dock-native-runtime.ts` | Creates the second container that joins the workspace PID and network namespaces, verifies and archives the helper payload, proves config, stops and reaps. |
| Runtime orchestration | `app-dock-runtime.ts` | `AppDockRuntime.create`: per-root serialized mutations, `metadata.json`, guest commands, start/stop/install/launch, `startNative`/`nativeEpoch`/`closeNative`, browser bridge, terminal access. |
| Backend seam | `app-dock-runtime-backend.ts` | `Backend` contract, `RuntimeError`, `readMetadata`, `localEndpoint`, `verifyEndpoint`. The runtime knows nothing Docker-specific. |
| Docker backend | `app-dock-runtime-docker.ts`, `docker-engine.ts` | Ownership proof (labels, pinned 64-hex id, seccomp fingerprint), create flags, image, reap. `docker-engine.ts` is the raw HTTP client over unix socket or npipe. |
| Linux display view | `app-dock-linux.ts`, `app-dock-linux-display.ts` | The privileged Xpra HTML5 `WebContentsView` (alias `appdock://linux`), certificate pinning, auth, visibility, window list/focus/launch; display floor script. |
| Guest access | `linux-workspace-access.ts`, `-files.ts`, `-omni.ts`, `-rpc.ts` | Run/shell/terminal in the workspace (`workspace-access.py` guest helper), file read/write/list, spawn adapters (omni or legacy), the `linux.rpc*` message handler wired in `index.ts`. |
| Fixtures | `app-dock-native.fixture.ts`, `app-dock-native-client.fixture.ts`, `app-dock-rpc-workspace.fixture.ts`, `app-dock-linux-live.fixture.ts`, `app-dock-linux-live-child.fixture.ts` | Test support only: identities/targets, fault-injecting memory channel, rpc workspace harness, the live Electron + Docker child. |
| Guest files | `apps/desktop/resources/linux-runtime/` (`workspace.py`, `workspace-access.py`, `browser-bridge.py`, `seccomp.json`, `Dockerfile`) | Shipped through `extraResources` as `linux-runtime`. The helper payload ships from `resources/linux/app-dock-accessibility`. |

Seam: browser-side files (`app-dock-browser*`, `app-dock-input`, `app-dock-page`, `app-dock-session`, `app-dock-security`, `ipc-app-dock*`, `dock-channel`) belong to `app-dock-browser-maintenance`. `app-dock-linux.ts` wraps the browser `AppDockAPI` and hides the Linux tab behind it: content, script, navigation and command calls on a Linux tab throw.

## Invariants

- Ownership is proven, never assumed. `find` returns undefined only when the owned workspace is absent; any doubt throws. A saved locator is re-verified, never rediscovered, and `localEndpoint` admits only a local unix socket or Windows named pipe.
- The seccomp policy must match `sandboxFingerprint` (canonical-JSON sha256) both when read from `seccomp.json` and when inspected on an existing container. Editing `seccomp.json` without updating the constant makes the sandbox "unavailable".
- Scope fields (senderID, tabID, generation, profileID, runtimeID, runtimeEpoch, accessibilitySessionID, appID, launchEpoch, ownershipRevision, scopeKind) identify every native call; a stale scope must fail, not retarget. Placement is `<containerId>:<startedAt>`.
- A native request ends as "not-dispatched" or "unknown". There is no automatic retry: an unknown outcome may have acted. Cancel is a control op with a grace period.
- Everything is bounded: frame size, pending count (32), native slots (8), per-operation deadlines. A slot is retained until the original terminal or ACK arrives, so a late reply cannot be routed to a new binding.
- A helper counts as reaped only on proven `Running=false` or absence, never on EOF or exit of the attach stream.
- Runtime mutations are serialized per root; `metadata.json` is v1 and mode 0600 (owner uuid, 64-hex password, optional pinned container id). Keep the on-disk shape so existing workspaces keep their owner.
- Guest execution: a failed transport is not proof the guest stopped. `linux-workspace-access.ts` escalates (cancel, then SIGKILL, then `workspace-termination-unknown`) and always runs `clean` in `finally`. Output is capped at 1 MiB, 8 concurrent runs, 8 terminals.
- All host processes in `linux-workspace-access.ts` go through `linux-workspace-omni.ts`. The one exception is `shell()`, which keeps `child_process` with inherited stdio because it needs the real terminal (see `script/spawn-allowlist.json`).
- The Linux view only trusts `https://127.0.0.1` with the pinned certificate fingerprint, never lets its origin become an ordinary tab (`allowPopup`), and keeps clipboard, file transfer and printing disabled. The renderer only ever sees the alias URL.
- Slack-style `slack:` callbacks reach the guest only for an HTTPS popup that descends from an authenticated Linux view (`authTabs`, 15 minute expiry). The URL carries credentials: keep it out of argv, output and errors.

## Traps

- `rebindWorkspace`, retire and reap interleave. The tests in `app-dock-rpc-workspace-rebind.test.ts` pin ordering (join the old unbind before discovering again); do not "simplify" awaits there.
- `ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER`: unset or `1` is omni on, `0` or empty is legacy rollback, `strict` has no delegation, and a build without a native omni target stays on legacy. `DesktopOmni.enabled()` decides each call; the legacy `@lydell/node-pty` is loaded only then.
- `readMetadata` rejects a malformed file with `RuntimeError("failed")`; only a missing file is `undefined`. Do not widen its regexes to be tolerant.
- The Xpra display floor is serialized into the page with `Function.toString`: `fit` in `app-dock-linux-display.ts` must stay self-contained (no imports, no closure). `app-dock-linux-display.test.ts` pins that.
- Background throttling is turned off until the Linux view is ready, then follows window visibility; the throttling and `suspend`/`resume` logic exists because a minimized owner otherwise keeps painting. Do not remove the window listeners installed in `open`.
- A timed-out display admission can still finish later; `app-dock-linux.ts` closes only that exact generation. Do not close by tab id alone.
- `open` pre-warms the native helper without awaiting it and swallows its rejection; a failed open must not warm it (`app-dock-linux-prewarm.test.ts`).
- Docker engine calls are capped at 20s and 2 MiB each way and never follow redirects. A longer operation needs a different mechanism, not a larger cap.

## Testing

Tests run only on CI: `bun run test:ci desktop src/main/<file>`. Per area:

- Protocol and goldens: `app-dock-native-wire.test.ts`, `app-dock-native-client.test.ts`, `app-dock-native-client-admission.test.ts` (slot retention, cancel/ACK races).
- Transport and facade: `app-dock-native-channel.test.ts`, `app-dock-native.test.ts`, `app-dock-native-workspace.test.ts`, `app-dock-native-runtime.test.ts`.
- RPC seam over the workspace scope: `app-dock-rpc-native.test.ts`, `app-dock-rpc-workspace.test.ts`, `app-dock-rpc-workspace-rebind.test.ts`.
- Runtime and backend: `app-dock-runtime.test.ts`, `app-dock-runtime-backend.test.ts`, `app-dock-runtime-docker.test.ts` (ownership proof), `app-dock-runtime-identity.test.ts`, `app-dock-runtime-native.test.ts`, `app-dock-runtime-access.test.ts`, `app-dock-runtime-performance.test.ts`, `docker-engine.test.ts`.
- Linux view: `app-dock-linux-display.test.ts`, `app-dock-linux-prewarm.test.ts`.
- Real Electron + Docker (skipped unless env is set): `app-dock-linux-live.test.ts` (`APP_DOCK_LINUX_INTEGRATION=1` plus an existing image), `linux-workspace.integration.test.ts` (`APP_DOCK_ACCESS_INTEGRATION=1`), `test/native/workspace-proof.test.ts`. Native guest tests live in `test/native`.
- No same-named test: `app-dock-linux.ts` beyond display and prewarm is covered only by the live test; `linux-workspace-access.ts`, `-files.ts`, `-omni.ts` and `-rpc.ts` have no unit test of their own (access is exercised via `app-dock-runtime-access.test.ts` and the integration proof; `scripts/linux-workspace-proof.ts` is the proof driver).

## Changing it

- A wire change touches `app-dock-native-protocol.ts`, the helper in `resources/linux/app-dock-accessibility`, the goldens in `test/native/contract`, and the fixtures. The helper rejects frames the protocol does not define, so both sides change together.
- A `seccomp.json` or guest-script change in `resources/linux-runtime` also needs the new `sandboxFingerprint`, and existing workspaces will be refused until recreated.
- A new host process in this area goes through `linux-workspace-omni.ts` or `Process`; `bun run check:spawn-imports` fails otherwise.
- Errors leaving the runtime are `RuntimeError` with a `LinuxError` code (from `@orchestra/app/app-dock-linux`); do not add English strings here.
