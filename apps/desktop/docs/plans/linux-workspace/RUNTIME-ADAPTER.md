# Linux workspace runtime adapter

Status: in progress on `workspace-runtime-adapter`. Behavior-preserving: Docker stays the only
backend in this change. Goal: a second backend (HuGR Lightr `vz` microVM) can be added later
without touching the workspace orchestration.

## Problem

`app-dock-runtime.ts` mixes two things: the workspace orchestration (serialized queue, durable
metadata, catalogue cache, TLS/viewer verification, accessibility helper lifecycle, terminal access)
and direct Docker calls (`docker` CLI argv, Engine API paths, container JSON fields).
`linux-workspace-access.ts` and `app-dock-native-runtime.ts` also build `docker exec` argv or
create containers directly. A `vz` backend cannot reuse any of that, and the helper cannot be a
second container sharing namespaces there.

## Interface (`app-dock-runtime-backend.ts`)

Generic types the orchestration sees:

- `Workspace = { id, image, running, startedAt, viewerPort? }`: a proven, owned workspace.
  `id` is immutable; `${id}:${startedAt}` stays the placement epoch.
- `Metadata`: the durable `metadata.json` v1 record, unchanged on disk. `dockerContext` and
  `endpoint` are the backend locator; a `vz` backend needs a v2 locator (see risks).
- `Command = { file, args, env }`: a host process that runs argv inside the workspace with stdio
  attached (used by `child_process.spawn` and `node-pty`).
- `Helper = { client, channel, payload, active(), reap() }`: a started accessibility helper.

`Backend` operations:

| Operation | Docker today |
| --- | --- |
| `locate(saved?)` | context discovery, local-socket check, `/info` OSType linux |
| `sandbox()` | read `seccomp.json`, verify the pinned fingerprint |
| `find(metadata)` | inspect by owner name; prove labels, ID, pinned ID, home mount, password env, limits, seccomp, no privilege; `undefined` only when absent by name |
| `ensureImage(metadata, image?)` | inspect / labelled build of the image (rootfs) |
| `ensureHome(metadata)` | labelled home volume |
| `create(metadata, { image, sandbox })` | `docker create` with env, user home, viewer port, limits, labels |
| `start` / `stop(metadata, workspace)` | `docker start` / `docker stop --time 10` |
| `exec(metadata, workspace, { user, argv, timeout })` | short `docker exec`, rejects with `stderr` |
| `copy(metadata, workspace, source, target, timeout?)` | `docker cp` |
| `command(endpoint, workspaceID, { user, argv, tty? })` | long-lived `docker exec --interactive [--tty]` argv |
| `helper({ metadata, workspace, sandbox, payload, session, verifyWorkspace })` | second container joining the workspace PID/net namespaces (`AppDockNativeRuntime`) |
| `Helper.reap()` | inspect the helper by its proven ID, require `kind=accessibility` labels, force-remove, prove absence |
| `close()` | drop the cached Engine client |

The helper is modeled as "start the helper process in the workspace with a stdio channel"; the
"second container" detail stays inside the Docker implementation, so `vz` can implement it as an
exec inside the same VM.

## What moves where

- `app-dock-runtime-backend.ts` (new): interface types plus backend-neutral helpers that were in
  `app-dock-runtime-docker.ts` (`RuntimeError`, `Metadata`, `readMetadata`, `hasCode`,
  `localEndpoint`, `verifyEndpoint`).
- `app-dock-runtime-docker.ts`: everything Docker — labels, `Container`/`Volume` JSON, `requireLabels`,
  `fingerprintPolicy`, `namedMissing`, the seccomp fingerprint, the Engine client cache, CLI
  environment scrubbing, and `create(options)` returning the `Backend`. The ownership proof becomes
  a pure `proveWorkspace(found, home, metadata)` so it is unit-testable.
- `app-dock-runtime.ts`: orchestration only, taking an optional `backend` (default Docker). Keeps
  the queue, metadata load/save, catalogue cache, readiness/TLS/viewer checks, helper lifecycle,
  and `bridgeCommand` (spawned through `backend.command`).
- `linux-workspace-access.ts`: no Docker. `Connection` becomes `{ endpoint, workspaceID, key }` and
  the process argv comes from an injected `command` option.
- `app-dock-native-runtime.ts`: unchanged; only the Docker backend imports it.

## Security checks that stay (none dropped)

- `find` keeps every Docker ownership check; the runtime additionally re-checks the pinned ID
  against `metadata.containerID` for any backend, and the 64-hex ID format of a created workspace.
- `guest` still refuses to exec unless `workspace.id === metadata.containerID`.
- Helper reap still requires proven labels on the exact helper ID before removal and proves absence.
- Access `verify` still compares endpoint, workspace ID and placement before every follow-up exec.

## Stale helper fix (separate commit)

`workspace.py` was copied only before a cold start, so a workspace left running by an earlier app
session kept old helper code (`workspace-access.py` and `browser-bridge.py` already refresh on first
use per session, keyed by in-memory state). `guest` now refreshes `workspace.py` once per workspace
ID per app session before its first exec (copy, `chown 0:0`, `chmod 0644`), single-flight, reset on
failure. Copy replaces the file; the running supervisor keeps its loaded code, new execs use the new
file.

## Test plan

- Existing focused suites stay green: `app-dock-runtime*.test.ts`, `app-dock-native*.test.ts`,
  `linux-workspace*.test.ts` (Docker integration ones stay skipped without `APP_DOCK_RUNTIME_INTEGRATION`).
- Source-snippet mutation plugins in the integration tests are retargeted to the file a snippet
  moved to, with the same snippet and the same asserted property.
- New `app-dock-runtime-backend.test.ts` drives the runtime through a fake backend: stale refresh
  on a running workspace, no exec into a workspace whose ID differs from the pin, no re-create when
  the pinned workspace is gone, reap through `Helper.reap()` when the channel cannot terminate.
- New `app-dock-runtime-docker.test.ts`: `proveWorkspace` rejects each weakened field; `command`
  argv shape.
- Mutation probes: stale refresh, ID pin in `guest`, ownership proof limit, helper reap.

## Risks / open items for `vz`

- `metadata.json` v1 stores a Docker locator (`dockerContext`, `endpoint`) and requires 64-hex IDs;
  `vz` needs a versioned locator.
- `copy` into a stopped workspace (cold-start refresh) is cheap in Docker; a VM may need the
  rootfs mounted or the copy deferred to after boot.
- No workspace removal or label enumeration exists today (only stop, and reap of a known helper
  ID); they are not added here.
- `command` returns a host argv; a `vz` backend needs a host CLI (or a small shim) for PTY use.
