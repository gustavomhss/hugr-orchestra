# Runtime-team handoff — Linux semantic accessibility

Accessibility branch/worktree: `dock-accessibility`, `/Users/gustavoschneiter/Documents/HuGR/_worktrees/dock-accessibility`.
Shared starting SHA: `5e4bea3b519c04cebfb787e98dfa171f5771d25c`.
Status on 2026-10-03: user assigned composition to this front (**“Integre nesta frente”**). The lead imported the verified runtime snapshot into `dock-accessibility`, preserving `dock-runtime`. Production deployment/Xpra/window/permission integration is in progress. Earlier payload/complete-proof hashes below describe the pre-integration candidate and require refreshed evidence after the current lifecycle repairs and composition freeze.

Execution order and verification scheduling: [runtime-execution.md](runtime-execution.md). First response must freeze the current revisions, shared-file owner, actual channel/deployment symbols, window/lifecycle authority and supported host/guest matrix. Channel and packaged commands are then tied to those real entrypoints.

## Deliverable from this effort

Versioned Python/Gio/GLib helper with explicit AT-SPI D-Bus queries, a runtime-neutral raw process-channel client, native Dock tool adapter and isolated real-app proof/measurement harness. Root discovery belongs to this helper. The runtime's Xpra path presents that same app to the user.

## Inputs requested from the runtime owner

1. Start/deploy the helper under the same guest user, display, home and D-Bus/accessibility session as its apps; provide a raw bidirectional process channel and bounded exit/termination/reaping.
2. Supply runtime/session epoch, app launch identity (PID plus start/namespace identity/process set), ownership revision and guest-window/transient/portal associations. The helper discovers/proposes serializable accessibility roots; confirm associations from that proposal without implementing another accessibility reader. Shared-process/portal ambiguity fails explicitly.
3. Register `{senderID,tabID,generation,profileID}` before native tools become available; report app/window/helper/runtime lifecycle changes and invalidate old bindings.
4. Define viewer hide/close versus app stop/uninstall semantics. Accessibility reads do not activate a viewer or install/delete apps.
5. Agree payload location/version/hash deployment and assign one owner for shared RPC/API/IPC/resource-packaging integration. Guest processes receive no host desktop bus.
6. Provide helper-only resource supervision/enforcement and a machine-readable resource-exit cause. W0 verifies its scope and limits; it is distinct from the full VM/app budget. Candidate Linux boundary: cgroup v2 memory/swap/CPU limits plus bounded termination/reaping.

## Candidate guest prerequisites to verify in W0

System Python 3, `python3-gi` with Gio/GLib typelibs, `at-spi2-core`, `dbus-daemon` with its activation files and dependency closure. `gir1.2-atspi-2.0` is an optional comparison/probe dependency; production does not initialize the libatspi client/cache. Ubuntu Noble/AT-SPI 2.52 is the development reference, not a mandate to replace the runtime's selected image.

The session supervisor can use `dbus-run-session`; apps/helper inherit its address, and `org.a11y.Bus.GetAddress` discovers the separate accessibility bus. The supervisor lifetime must cover the apps as well as the helper. Display/auth and `XDG_RUNTIME_DIR` belong to the runtime.

Launch-time enablement candidates, checked against actual app versions: unset `NO_AT_BRIDGE`; GTK4 `GTK_A11Y=atspi`; Qt `QT_LINUX_ACCESSIBILITY_ALWAYS_ON=1`; Chromium/Electron `--force-renderer-accessibility`. `dbus-x11`/legacy ATK adaptor are conditional, not unconditional duplicate dependencies. Actual toolkit interfaces/actions still require proof.

## Integration boundary

Versioned JSONL over raw stdio; [contract.md](contract.md) specifies discover/confirm binding, identities, readiness, refs, a bounded semantic queue plus cancellation control lane, deadlines and unknown-action outcomes. There is no new host HTTP endpoint. Existing JS utility-process stdout logging is not this transport.

The bridge/testbed can progress independently. Final packaged-runtime proof and performance need the runtime inputs above. Do not wire a ready check to an empty tree or treat a successful native action reply as proof that the app completed the task.

## Concrete handoff packet — 2026-10-03

- Payload: `/Users/gustavoschneiter/.local/share/opencode/recovery/dock-accessibility-20261002/app-dock-accessibility-v1.tar.gz`.
- SHA256: `a55bc92fb2eda8355c3e6fccc234a88b835054223f321c1384550235df63faaa`; manifest alongside the archive and inside it as `payload-manifest.json`.
- Protocol v1; all eight guest sources match the complete registered-tool normal proof. Python syntax, archive members and each source hash were checked. No host credentials or session/process identities are embedded in the source-byte package.
- Candidate guest directory: `/opt/orchestra/app-dock-accessibility`, subject to runtime-owner agreement. Launch `python3 -u -B /opt/orchestra/app-dock-accessibility/main.py --session-id <runtime-session-identity>` in the actual app's guest environment. `DBUS_SESSION_BUS_ADDRESS` and `XDG_RUNTIME_DIR` are required; X11 keyboard mode additionally requires the intended DISPLAY/auth session. The helper owns a session-local lock.
- Host composition anchors: `NativeDockClient.create(channel, { sessionID })` in `src/main/app-dock-native-client.ts`; `registerAppDockNativeBinding(identity, target, client, confirm)` / `unregisterAppDockNativeBinding(senderID, tabID)` in `src/main/app-dock-rpc.ts`. The fixture exercises the class equivalent through actual registered plugin definitions. `confirm` must use actual runtime window/process/portal authority before a proposed root becomes routable.
- Deployment must hash-check the actual resolved bytes. The current desktop configuration includes resources in the application file set; this source-byte tar does not establish an outside-ASAR guest deployment path. Ownership of the shared packaging/RPC/IPC seam still needs agreement before production composition.
- Local evidence: complete `registered-normal-6.json`; calibrated `registered-suppressed-1.json`; consolidated `closeout-verification-20261003.json` and error-free macOS browser receipts in the same private evidence directory. Full Desktop/OpenCode typechecks and affected tests passed. Production permission decisions, actual runtime pairing/supervision, Windows/arm64 and packaged Xpra/N12 remain unexecuted boundaries.
- Acknowledgment must name the runtime owner and agreed transport/deployment/window/lifecycle fields, then record the joint proof command/receipt. It is not inferred from a local helper hello, source inspection or this packet's existence.

## I1 ownership and supervision decision

Composition owner: this lead, by the user's explicit choice above. Immutable runtime input and disjoint transfers are recorded in [integration-review.md](integration-review.md).

- The runtime presents one workspace tab containing multiple applications. Semantic selection must name the app/window explicitly and capture it at admission; the visual launcher’s title/class heuristic and current focus cannot authorize a native binding. Until such authority is available, semantic readiness stays unavailable while viewer close/activation remain usable.
- The semantic helper will run in a separate runtime-owned container with a helper-only resource envelope, sharing the actual workspace PID/network namespaces and HOME/session volume. This preserves real app identities and D-Bus/X11 access while making helper termination/resource exit independent of app termination. Its immutable container ID, workspace incarnation and session epoch are checked before admission. The actual cross-container D-Bus/X11 behavior must pass an I1 probe before this is treated as viable.
- The session bus must have an explicit socket path in the shared runtime directory, rather than an incidental `/tmp` path from an independent exec. The session supervisor publishes a fresh session ID and full process identity; stale/recycled supervisor records fail readiness.
- Production transport attaches raw Docker streams to that helper container over the already captured local engine endpoint. No TTY, text trimming, arbitrary renderer argv or whole-workspace kill fallback. Termination joins the helper-container exit; uncertain or failed cleanup remains visible.
- Actual package/deployed payload hashes, helper limits and process/session identity evidence are required by the smoke probe. Existing test-only exec transport is supporting code, not the production transport or an excuse to reuse its hardcoded test socket/UID/namespace-kill policy.

## Authorized production scope — isolated workspace

The user selected **“Workspace inteiro (Recommended)”** in response to this explicit scope choice: **“Binding ao workspace Linux isolado completo. Tools podem ler/agir nos apps dele; refs continuam específicas por objeto, com permissões e proteção de texto. Combina com a aba de workspace atual.”**

Contract revision (human-authorized): production binding covers the isolated workspace's eligible guest-user processes and their concrete AT-SPI roots, rather than a selected X11 window or an asserted installed-application identity. This matches the runtime's workspace presentation. References still identify individual native objects, with fresh role/name/parent/ownership checks; authorization to the workspace does not authorize a different workspace/profile/runtime epoch. Protected text, finite budgets, explicit keyboard/observed modes and unknown/no-replay semantics are unchanged.

WAIVER (human-authorized) — replace the production requirement to prove selected-XID ↔ AT-SPI-frame pairing with explicit whole-workspace authorization.
- Authorized by: user, current integration session, 2026-10-04; selection quoted above.
- Reason: audited stock GTK3/Qt5/Chromium providers do not expose the needed native-window correspondence; process identity cannot distinguish sibling windows. Titles, classes, focus and geometry are not substitutes.
- Future remediation: a narrower window-scoped mode requires a producer-backed identity link and its own proofs. Track under I2 window-identity research; do not advertise that mode through workspace binding.

Private native protocol adds explicit `scopeKind: "workspace" | "application"` and startup `scopeKinds` negotiation. Omitted kind retains legacy application semantics. Workspace uses the legacy wire target identifier `appID: "workspace"`, with `launchEpoch` equal to the accessibility session ID; model-facing metadata names workspace scope rather than claiming a specific application. An older helper without the negotiated capability must reject workspace admission.

Runtime workspace authority is a fresh, bounded process census in the actual session: guest UID, boot ID, PID namespace and mount namespace must match the workspace supervisor. The helper's separate mount namespace is excluded. Current census-command PID is excluded so observation alone does not force binding replacement. Inaccessible/incomplete or oversized required census evidence fails explicitly. Host confirmation revalidates the same runtime/session/census before accepting the helper's proposed concrete roots. Application/window titles and Xpra focus remain presentation data.

Fresh top-level reads may refresh workspace membership and bind a new observation after captured Dock/profile/runtime checks. Root-ref/cursor reads and mutations stay on their captured binding; they never retarget automatically. Viewer opening establishes a native tombstone even when semantic readiness fails. Failed binding or helper retirement keeps browser DOM fallback unavailable.
