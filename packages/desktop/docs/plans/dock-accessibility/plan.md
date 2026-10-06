# App Dock Linux semantic bridge — implementation plan

Status: planning complete and independently reviewed; implementation starts with W0. Native execution and performance are not yet demonstrated.
Planning date: 2026-09-30. Baseline: `5e4bea3b519c04cebfb787e98dfa171f5771d25c`.
Branch: `dock-accessibility`. Worktree: `/Users/gustavoschneiter/Documents/HuGR/_worktrees/dock-accessibility`.
Research assignments: [brief.md](brief.md). Integration specification: [contract.md](contract.md).
Acceptance and performance protocol: [validation.md](validation.md). Runtime-team packet: [handoff.md](handoff.md).
Review decisions and remaining proof obligations: [review.md](review.md).

## 1. Outcome

The same model-facing Dock tools can inspect and operate accessible controls in a real Linux desktop app using semantic data rather than images. The user sees the same app through the runtime's visual bridge. The Linux runtime is developed separately in `dock-runtime`.

| Requirement | Acceptance evidence |
| --- | --- |
| Semantic observations and actions | N01–N03: GTK, Qt and Electron app controls plus independently observed effects |
| Correct app/window and durable-reference behavior | N04–N06: identical labels, owned dialogs, removal/restart and unsupported controls |
| Bounded work, recovery and resources | N07–N09, P01–P05: bounded reads, hang/EOF controls and paired resource curves |
| Reuse of the actual Dock tool chain | N10–N12: registered tool execution, browser regressions and packaged integration |
| Independently deliverable while runtime is unfinished | W0–W2 use an isolated development Linux session and runtime-neutral process channel |
| Small production footprint | One guest helper per accessibility session; explicit bus queries; bounded client work and measured external costs |

Coverage describes the controls and operations actually exposed by each app. An accessible button or editor does not establish coverage of custom drawing, all document contents, all app versions, or every toolkit.

## 2. Architecture decisions

```text
model -> shipped dock_* plugin -> existing dock.rpc -> desktop native adapter
                                                    -> runtime-provided process channel
                                                    -> Python / Gio / GLib helper
                                                    -> explicit AT-SPI D-Bus methods
                                                    -> owned Linux app/window controls

user  -> App Dock viewer -> runtime / Xpra -> the same Linux app instance
```

- The bridge is an adapter to Linux accessibility, not another runtime, MCP server, network endpoint or compositor.
- Python 3 with distro-provided PyGObject Gio/GLib and direct AT-SPI D-Bus calls is the selected first implementation. Use `Gio.DBusConnection`, not an automatic property-caching proxy or the libatspi client. W0 demonstrates pinned wire schemas, asynchronous calls and payload viability before source interfaces are frozen.
- The host consumes a raw bidirectional guest process channel. It does not choose Docker, WSL or a VM engine. The runtime owns guest startup, deployment, app installation and process supervision.
- One helper serves one accessibility session. It uses that session's bus and the separate accessibility bus; `get_desktop(0)` is not a display/window ownership selector.
- Native tool operations address an owned app/window binding. The helper discovers accessible roots from runtime-provided launch evidence and proposes serializable handles; the runtime confirms window associations. It does not implement a second accessibility reader. Title matching, active-window guessing and desktop-wide fallbacks are insufficient.
- Preserve web numeric refs. Add opaque, epoch-qualified native string refs and native capabilities to the common tools. Read/action routing selects the registered backend before execution.
- Native reads are on demand, with bounded tree continuation and text ranges. Subscribe only to bound-exporter lifecycle/removal notifications required for invalidation; callbacks do constant bounded work. No global tree cache fill or full UI-event stream is requested. All observations are non-atomic and action-time fresh checks remain mandatory.
- Native mutations consume their observation's refs. A new read issues a new observation epoch. This avoids promising stable native refs before provider lifetime/path-reuse behavior is established.
- A provider's action reply means dispatch acknowledgement, not a completed task. Report observable postconditions separately; never automatically retry uncertain mutations.
- Native capabilities come from available interfaces and advertised actions, not from inferred roles. Missing/defunct/unsupported data produces explicit status or a partial observation.
- Native coordinate clicks, viewer DOM evaluation/storage/network operations and keyboard simulation are outside the semantic v1 capability set. They must report an unsupported operation on a native binding rather than silently operate on Xpra's viewer page.

## 3. Evidence informing the design

Shipped repository anchors, all relative to the baseline:

- `packages/opencode/src/plugin/app-dock.ts:38–59,75–88,145–167`: plugin request envelope, permission path, 15-second timeout, numeric refs and existing read/type/click semantics.
- `packages/desktop/src/main/app-dock-rpc.ts:117–132,252–258`: RPC dispatch and implicit tab selection. Native dispatch must preserve the selected tab captured at admission; it cannot drift when activation changes.
- `packages/desktop/src/main/app-dock-browser.ts:1–34,154–174`: web ref registry and snapshot shape. Do not reuse its numeric namespace stride as a native identity scheme.
- `packages/desktop/src/main/server.ts:84–113`: the existing JS utility process uses message IPC and diagnostic stdout handling. It is not a guest Python stdin/stdout transport.
- `packages/desktop/electron-builder.config.ts:58–74`: resource packaging boundary for the eventual helper payload.
- `packages/desktop/docs/corpus/app-dock/01-requirements.md:210–262`: existing browser navigation and WebContentsView invariants; native composition is additive.

Primary-source anchors:

- [AT-SPI bus launcher, pinned 2.52](https://raw.githubusercontent.com/GNOME/at-spi2-core/AT_SPI2_CORE_2_52_0/bus/README.md): accessibility communication “runs in a separate bus just for accessibility purposes”; `org.a11y.Bus.GetAddress` discovers it.
- [Desktop discovery](https://gnome.pages.gitlab.gnome.org/at-spi2-core/libatspi/func.get_desktop.html): “currently multiple virtual desktops are not implemented”.
- [ATK action adaptor](https://raw.githubusercontent.com/GNOME/at-spi2-core/main/atk-adaptor/adaptors/action-adaptor.c): `dbus_connection_send (bus, reply, NULL);` occurs before `atk_action_do_action (action, index);`. W0 repeats this check against the deployed source version.
- [EditableText](https://gnome.pages.gitlab.gnome.org/at-spi2-core/libatspi/iface.EditableText.html): `set_text_contents` replaces the entire text contents. This is not keyboard-event synthesis.
- [GTK](https://docs.gtk.org/gtk4/section-accessibility.html): standard controls implement accessibility; custom widgets require their own implementation.
- [Qt](https://doc.qt.io/qt-6/accessible-qwidget.html): advertised action names and `doAction`; custom elements must send accessibility events.
- [Chromium](https://raw.githubusercontent.com/chromium/chromium/main/docs/accessibility/overview.md): accessibility starts on demand; `--force-renderer-accessibility` enables it; the browser process caches the accessibility tree.
- [Pinned Accessible wire schema](https://raw.githubusercontent.com/GNOME/at-spi2-core/AT_SPI2_CORE_2_52_0/xml/Accessible.xml): `(so)` object references and indexed `GetChildAtIndex` allow explicit traversal rather than a full `GetChildren` request.
- [Pinned libatspi source](https://gitlab.gnome.org/GNOME/at-spi2-core/-/blob/AT_SPI2_CORE_2_52_0/atspi/atspi-misc.c): first exporter references request `Cache.GetItems`, and proxies are retained. Python-side limits do not control this client behavior; direct wire calls avoid that particular path.
- [Gio asynchronous calls](https://docs.gtk.org/gio/method.DBusConnection.call.html): explicit timeout/cancellable and typed reply; [connection startup](https://docs.gtk.org/gio/type_func.DBusConnection.new_for_address.html) separately requires a deadline-triggered cancellation. Local cancellation does not undo app actions.
- [Noble typelib package](https://packages.ubuntu.com/noble/gir1.2-atspi-2.0): the reference release uses AT-SPI 2.52. Its typelib is optional for comparative development probes, not a production client dependency. Latest API documentation must not silently become the runtime minimum.

## 4. W0: prove the native boundary first

W0 runs before the core implementation fan-out. Use an independently named development container/session and its own display, bus, home and artifacts. The runtime team's engine choice remains an integration input.

1. Install the candidate dependencies from [handoff.md](handoff.md), record actual versions and retain their dependency closure.
2. Boot session bus, accessibility bus/registry, display and representative apps under the same guest user/session. Prove readiness with a nonempty known tree; a reachable bus alone is insufficient.
3. Demonstrate direct Gio calls against the pinned Accessible/Action/EditableText/Text XML, bitmask states, exporter owner/PID identity and errors. Prove discover/propose/confirm root binding, including two windows/processes with identical labels and shared-process ambiguity.
4. Probe native text replacement and an advertised action in Mousepad/GTK and FeatherPad/Qt; independently verify saved bytes. Probe VS Code/Electron Settings search and a checkbox/config postcondition in an isolated profile.
5. Exercise removal, app restart, helper restart and a virtualized/recycled item. Test event delivery and fresh-state revalidation; provider identity uncertainty must yield partial/unsupported capabilities.
6. Verify through the actual outgoing method trace that discovery/read never call `Cache.GetItems`, `GetChildren`, `Properties.GetAll` or unbounded Collection helpers. Compare against libatspi only as a development control. Test indexed continuation, lifecycle bursts, Gio internal retention and the runtime's helper-only resource envelope. Exercise stalled connection/provider calls and control-lane cancellation against finite deadlines.
7. Record actual action names and click policy, root-binding strategy, failure values and provider versions in `native-proof.md` plus external raw receipts. Source interfaces are frozen from these observations.

W0 can use two disjoint agents: one owns session/fixture boot; one owns API probes. The lead owns the proof decisions. Only one heavyweight native probe runs at a time on this machine. A failed critical probe stops the dependent slice; it does not become a mock-driven implementation or a declaration of universal support.

## 5. W1: freeze executable anchors

The lead creates the shared protocol schemas/goldens and the callable interfaces before dispatching implementation. [contract.md](contract.md) records the design to instantiate after W0, not source files that already exist.

- `src/main/app-dock-native-protocol.ts`: versioned envelopes, native snapshot/action/error schemas and limits.
- `test/native/contract/*.json`: shared wire examples and invalid-message fixtures consumed by both languages.
- `resources/linux/app-dock-accessibility/bus.py`: small `AtspiBus` boundary for explicit typed asynchronous calls and bound-owner lifecycle invalidation; indexed discovery/root proposals. The lead publishes it before dependent workers dispatch.
- Python interfaces: `RefRegistry.resolve(ref, binding, deadline)`, `snapshot.read(binding, query, registry, deadline)`, `actions.invoke(binding, ref, actionID, registry, deadline)`, `actions.replace_text(binding, ref, text, registry, deadline)`.
- TypeScript interfaces: `NativeDockClient.create(channel, config)`, `request(request, signal)`, `close()`; `NativeDock.bind(identity, target, client)`, `unbind(identity)`, `dispatch(op, identity, args, signal)`.
- Harness interface: `NativeProofDriver.run(caseID, client, outputRoot)` returns the versioned case receipt; `runCondition(conditionID, workload, outputRoot)` returns raw attribution samples and provenance. Freeze their module/import paths and schemas; importing the proof driver cannot execute its CLI entrypoint. E and F use the same driver without editing each other's files.
- Freeze exact signatures, field presence, error codes, budgets and postcondition semantics in source. Interface changes return to the lead; workers do not independently reinterpret them.

## 6. W2: maximum useful core parallelism

Each worker gets a separate branch/worktree pinned to the W1 source snapshot: record the Git baseline SHA plus a digest of the lead-owned shared scaffold, and materialize that exact scaffold read-only in every worker checkout. A published W1 commit can provide the same source pin when Git publication is explicitly authorized. The lead owns shared entrypoints and final integration. All relative paths below are inside `packages/desktop`, unless prefixed otherwise.

| WP / branch | Exclusive file ownership | Deliverable / acceptance | Depends on |
| --- | --- | --- | --- |
| A / `a11y-read` | `resources/linux/app-dock-accessibility/{refs,snapshot}.py`; `test/native/test_snapshot.py` | Scoped, bounded tree/text reads; epoch-qualified refs; N01/N04/N05/N07 | W1 |
| B / `a11y-actions` | `resources/linux/app-dock-accessibility/actions.py`; `test/native/test_actions.py` | Interface/advertised-action checks, click and full-value replacement; N02/N03/N06 | W1 RefRegistry contract |
| C / `a11y-channel` | `src/main/app-dock-native-client.ts`; sibling `.test.ts` | Bounded raw JSONL client, correlation, watchdog/EOF/backpressure; N08/N09 | W1 protocol |
| D / `a11y-tools` | `src/main/app-dock-native.ts`; sibling `.test.ts`; `packages/opencode/src/plugin/app-dock{,.test}.ts` | Native dispatcher and additive tool schemas/descriptions; N10 plus browser routing regressions | W1 client contract |
| E / `a11y-testbed` | `test/native/{Dockerfile,session.sh,gtk_fixture.py,qt_fixture.cpp,scenarios.json}`; `scripts/app-dock-native-proof.ts` | Real-app session and independent postcondition/control harness; N01–N10 | W1 wire contract |
| F / `a11y-metrics` | `scripts/app-dock-native-bench.ts`; `test/native/benchmark-cases.json` | Paired, calibrated measurements/invalid-report handling; P01–P05 | W1 metrics/driver contract |

Conflict map: A–F own disjoint files. B reads A's frozen registry interface; C/D and E/F consume W1 contracts. Package manifests, native bootstrap, RPC/API/IPC/packaging/CI and final docs are lead-owned. Explicit filename sets override broad directory ownership.

E's frozen harness driver accepts a channel and scenario manifest; F uses that driver without editing it. If a slice exceeds the review budget, the lead splits it at this interface before dispatch. Do not add a generic backend/plugin framework to make these packages artificially independent.

Available agent roles: general for implementation, explore for bounded source mapping; use the configured available model, not an invented cheaper model. Supply only the frozen interfaces, owned files, nearby code and relevant acceptance cases. Target a compact context packet; unrestricted user token permission does not require unrestricted transcripts.

Worker return card: baseline/branch; exact changed paths; acceptance commands and scope; actual failure-control evidence; unresolved dependencies; what the brief missed. A harness written against frozen contracts is pending full implementation proof until the real helper is connected.

## 7. W3: lead-owned composition and integration

1. Compose Python protocol input/GLib dispatch in `resources/linux/app-dock-accessibility/main.py`; keep stdout protocol-only, stderr bounded diagnostics, EOF cleanup and payload version validation.
2. Join the six slices against the same baseline. Read complete file lists and every diff; run the slice's named checks and falsify its load-bearing tests before accepting its report.
3. Connect the native adapter to `src/main/app-dock-rpc.ts`, `app-dock-api.ts` and the production composition in `ipc.ts`/`index.ts` as required by the runtime registration contract. Runtime-shared files receive one integration owner after the handoff is acknowledged.
4. Make backend registration precede availability to model tools, capture target ownership at admission, and bind teardown/recovery to epochs. Preserve native error code/outcome through the actual RPC/plugin envelopes. Tool abort needs an explicit correlated control-lane cancellation message; the shipped plugin timeout currently does not cancel guest work.
5. Extend `electron-builder.config.ts` with the agreed payload resource entry; version/hash the payload transferred to the guest. The runtime image owns Linux dependencies, not host Python installations.
6. Add package-local commands and the dedicated Linux-native CI lane after the real harness exists. Existing browser checks retain their meaning; optional local diagnostics cannot stand in for the required native lane.

## 8. W4/W5: independent review and joint acceptance

- Cold reviewers receive only the frozen contracts plus their complete diff slices; author transcript/self-report is excluded. Each slice stays within approximately 400 changed lines; split larger review units.
- Review separately: native scope/lifetime/actions, transport/tool composition, and functional/performance evidence. The lead verifies citations and repeats the critical negative controls.
- Run the real registered-tool path and native acceptance on a Linux guest, then the packaged Orchestra+runtime+Xpra path on the supported macOS/Windows host and guest-architecture combinations.
- Compare bridge disabled/accessibility enabled/bridge enabled resource conditions. Run benchmarks serially after functionality settles; unrelated host workloads invalidate comparisons.
- Release readiness requires observed required CI results and packaged-runtime evidence. A green unit test, package build or model-free direct RPC call alone establishes neither full app coverage nor end-to-end performance.

## 9. Handoff and open proof obligations

The independently developable unit is helper + protocol/client + tools + isolated proof harness. Production integration depends on runtime session topology, process channel, root ownership and payload deployment from [handoff.md](handoff.md).

The remaining empirical decisions have named owners: W0 resolves pinned wire behavior, native root discovery, toolkit control exposure, action mapping, lifecycle delivery and resource strategy; the runtime owner resolves process/window/portal association, helper supervision and channel lifecycle. The lead freezes numeric structural budgets before W2 and freezes performance acceptance policy after baseline/noise calibration and before candidate verdicts. These are implementation prerequisites, not evidence that the feature already works.
