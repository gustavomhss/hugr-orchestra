# Native bridge implementation progress

Current execution anchor: [closeout.md](closeout.md), updated on 2026-10-03. The original post-crash evidence is [recovery-20261002.md](recovery-20261002.md). Historical results below remain dated. Complete local E01–E10 proof, its measured negative control, affected tests, macOS browser acceptance and full package typechecks are closed. The tested payload package is ready; production runtime/window/permission/Xpra integration and joint performance remain handoff-dependent.

Execution order after the speed/cost request: [closeout.md](closeout.md). Focused E04 feedback comes first; full acceptance follows a frozen functional fix, then production runtime closure. Coverage/guards/oracles remain intact.

Baseline: `5e4bea3b519c04cebfb787e98dfa171f5771d25c`. Branch: `dock-accessibility`.
No Git publication has been requested. Worker work stays on disk in isolated worktrees; no commits, pushes, PRs or merges.

## W0 closure wave — 2026-10-01

GO: two disjoint agents. The lead retains architectural decisions and source contracts.
Shared edits: none. Available general agent/model; compact return cards, no transcripts.

| Work package | Exclusive files | Acceptance | Dependency |
| --- | --- | --- | --- |
| Lifetime | `test/native/lifetime_probe.py` | Real exporter/root identity, duplicate-window exclusion, removal/restart events, bounded outgoing trace, explicit recycled-object limitation | Read-only current bus/context and testbed |
| Resource | `test/native/resource_probe.py` | Helper-only cgroup scope, finite connection/provider calls, bounded retention checkpoints and a measured failure control | Read-only current bus and testbed |

Only the lifetime worker operates the existing testbed GUI. Resource work uses a separate named container/fixture and does not change apps or focus. All containers carry `orchestra.a11y.owner=dock-accessibility`.

Return: branch/baseline; changed paths; exact commands and their actual scope; failure-control evidence; blockers; what the framing missed. Lead repeats critical checks before accepting findings. Changes to shared contracts return to the lead.

## Observed boundary evidence

- Direct Gio/D-Bus transport conformance and four mutation controls completed before this wave.
- Mousepad GTK3 and FeatherPad Qt5 direct setters/readback/advertised Save produced independently read file bytes in W0.
- VS Code 1.140.0 / Electron 43.7.3 / Chromium 150.0.7871.250 lacks EditableText on the tested inputs.
- User approved explicit X11 keyboard replacement. Lead ran `keyboard_probe.py` from the consolidated payload: `status=verified`, Unicode readback, Settings config mutation and app-driven restoration verified. Full receipt: `/session/keyboard-probe.json` in the isolated testbed.
- Source `context.py` and TypeScript protocol are draft anchors, not frozen or shipped. W0 lifetime/resource findings decide final contracts.
- Packaged runtime/Xpra integration and numeric performance acceptance still require the runtime handoff and calibrated baseline.

## W1 / W2 source wave

Shared source tree: `cb8af356dd39eeef8062f6d98e6ee849bee23efe` (Git tree object, not a commit/publication).
Exact callable contracts: [implementation.md](implementation.md). Workers receive that source tree and baseline in separate lightweight worktrees. All shared files remain read-only throughout the wave.

Lead repeated lifetime/resource proofs after fixing boot/namespace validation and nonexistent roots. Lifetime scope mutation required disabling both window-scope guards to become red; baseline restored. Raw receipts: `/session/lifetime-probe.json` and external `a11y-resource-lead-20261001.json`. Resource control produced real `OOMKilled=true` / exit137 in a separate 32MiB helper-only container, with the original apps preserved. This establishes development envelope mechanics, not a production runtime memory guarantee.

| WP | Exclusive files | Dependency | Acceptance |
| --- | --- | --- | --- |
| A / a11y-read | refs.py, snapshot.py, test_snapshot.py | W1 source | Bounded scoped reads, continuation, stale/foreign/unstable refs |
| B / a11y-actions | actions.py, test_actions.py | W1 registry signature | Advertised actions, explicit keyboard/setter mode, false/disabled/read-only/unknown outcomes |
| C / a11y-channel | native-client TypeScript module/test | W1 protocol | Raw UTF8 JSONL, bounded FIFO/control lane, no replay, deadline/EOF/reaping races |
| D / a11y-tools | native adapter module/test, orchestra plugin pair | W1 Client interface | Typed registration, backend selection, tool schema/cancellation/error/web regressions |

GO: four disjoint implementations. Merge/readiness order A -> B; C -> D; then lead-owned bootstrap/RPC/packaging/actual registered-tool proof. No shared manifest/registry edits by workers. Runtime production wiring remains handoff-owned.

## Cold review / R2 corrections

Independent reviewers found and execution controls reproduced retired binding resurrection, subtree depth overflow, invalid interface/output continuation loss, protected-focus drift, malformed native Text acceptance, raw-frame delimiter overflow, delayed-timer deadline bypass, and retained/reaping client lifecycle defects. Corrections and regression tests are integrated. Ref/scope and native adapter received follow-up scoped approval; client startup and snapshot provenance/range follow-up corrections still await final review and native rerun.

Qt 5 native CharacterCount uses UTF-16 positions; GTK uses scalar positions. Reads report native units and preserve supplementary-scalar boundaries. X11 Unicode synthesis now fences individual non-ASCII keycode remaps with native incremental readback. QuickOpen Unicode/decomposed/clear was observed in the direct R2 proof; Settings empty projection is `\n` and is not falsely normalized to an empty value.

User explicitly authorized `dock_action(mode="observed")`; waiver and exact decision are recorded in implementation.md. Stable default remains conservative. Observed mode revalidates eligible controls and reports non-atomic/unverified logical identity; it cannot override invalid fingerprint/interface, stale/transient/protected ancestry. Instability provenance now remains bounded and explicit.

## Current verification / environment interruption

- Latest lead host run: native client/adapter 106 tests executed successfully, including delayed startup hello/subscription regression. Previous meaningful mutation controls and follow-up reviewer probes retained.
- Latest lead plugin run: 24 tests executed successfully, including explicit observed schema/RPC propagation. Full desktop `bun typecheck` executed successfully after integration.
- Native fixture and registered-tool reruns remain pending: Docker API stopped responding. Desktop status says running, but both desktop-linux/default engine requests failed or timed out. Host filesystem had 3.2 GiB available; measured load averages were 233.96/221.96/230.66. These are environment observations, not bridge performance measurements.
- Own generated root node_modules cleanup began after host checks; deletion command exceeded its timeout. No other worktree/runtime/image or unlabelled resources were deleted/restarted. Dependencies can be resolved read-only through external a11y-proof-runtime-20261001.json referencing canonical packages; no source change to canonical.
- Proof worker was terminated twice; its three changed harness files survived and were integrated. Last completed registered-tool receipt remains E01/E02/E05–E10 pass with E03/E04 failed before R2 corrections; do not present that receipt as current all-green proof. Revised QuickOpen/Settings/observed-mode harness has not completed on the consolidated payload.

Remaining at that historical checkpoint: native reruns/reviews/package/handoff and calibrated performance. The consolidated local closure and current delivery dependencies are recorded in [closeout.md](closeout.md); packaged runtime/Xpra and production permission/window confirmation remain joint gates.
