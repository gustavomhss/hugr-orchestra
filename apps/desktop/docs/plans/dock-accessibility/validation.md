# Native Dock verification and performance protocol

Status: N01–N12/P01–P05 define the required evidence categories. Dated executed local evidence is in [closeout.md](closeout.md); it does not imply completion of every N/P category. Runtime composition, packaged/platform and performance execution follows [runtime-execution.md](runtime-execution.md).
Implementation dependencies and ownership: [plan.md](plan.md). Result/identity semantics: [contract.md](contract.md).

## Functional oracles

Use the real production helper and actual registered Dock tools. Codec/fault fixtures test transport mechanics only; they cannot establish native capability. Self-authored GTK/Qt controls expose hard failure cases alongside maintained desktop apps, rather than replacing real-app proof.

Representative applications:

- Mousepad (GTK3): isolated guest home; Unicode full-value replacement and advertised Save/Save As; exact guest file bytes; app restart.
- FeatherPad (Qt): same independent file oracle and selection/dialog paths. Record actual Qt major and X11 backend; one Qt major is not evidence for all Qt versions.
- VS Code Linux desktop (Electron): isolated user-data directory, Settings search for `@id:files.trimTrailingWhitespace`, advertised checkbox operation, fresh CHECKED observation and independent `User/settings.json` postcondition. Exact exposed EditableText/action support is a W0 probe; do not substitute DOM/vision to claim semantic success.
- GTK4 and Qt custom fixtures supplement these apps for removal, duplicate labels, false native results, virtualization and inaccessible drawing. Actual toolkit/version coverage is recorded case by case.

The controller seeds unique input values but never creates the expected output file/config on behalf of the app. Read-after-action and the independent file/config oracle are separate assertions. User/other-session directories and profiles are never test fixtures.

## Required cases and falsification controls

| Case | Required observation | Control that must fail the case |
| --- | --- | --- |
| N01 / semantic discovery | Each named app exposes a nonempty expected owned tree, labels/interfaces/actions; known readable control works | Disable accessibility/point at an unready bus; empty successful read must not pass |
| N02 / editing and durable Save | Replace UTF-8 text, clear an editable field, reread; invoke advertised Save; exact bytes; restart/reopen | Remove the setter/action while retaining a success acknowledgement |
| N03 / Electron setting | Search by accessible text, invoke advertised checkbox; fresh state and app-written settings.json agree | Acknowledge without invoking the action, or alter only the reported state |
| N04 / window scope | Two apps/windows share “Save”; choose owned dialog; sibling file/state is untouched; portal ambiguity reported. Separate manifest cases change sender, tab, tab generation, profile, runtime/session epoch, binding and launch epoch independently | Remove each corresponding scope validator and replay the foreign ref; reject unrelated exporter roots |
| N05 / lifetime | Removed/recycled node, reread, app restart, helper restart and same exporter path with changed backing object reject prior refs | Disable observation/owner/launch invalidation; stale action must trip the wrong-effect assertion |
| N06 / capability failures | Read-only, disabled, defunct, missing interface and inaccessible canvas are distinguished; actual false action result rejected | Convert false/unsupported/provider errors into success; the positive readable sibling must still work |
| N07 / bounded reads | Wide/deep/nonmatching trees, MANAGES_DESCENDANTS, large text and byte-heavy Unicode respect work/output caps; continuation reaches later controls; coverage and non-atomic consistency explicit; outgoing trace avoids eager whole-tree/cache calls; helper resource envelope exercised | Remove traversal/call/byte checks, request Cache.GetItems/GetChildren/GetAll, break continuation/invalidation, or falsely declare complete/atomic coverage |
| N08 / transport recovery | Split/coalesced UTF-8 JSONL; version/duplicate-ID/oversized-frame errors; backpressure; EOF/crash fails pending calls; controlled recovery | Drop EOF notification, accept replay, ignore a cap or let a late response affect a new binding |
| N09 / deadlines and no replay | Queue/connection startup/provider hang includes whole-call deadline; control cancellation bypasses FIFO without a second semantic dispatch; sequences assigned at send preserve overtaken queued requests; caller settlement retains slot until guest terminal result/reaping; unknown action remains unretried | Delay the real response, then disable correlation/timeout/slot/send-sequence checks or add automatic mutation retry; cancel/EOF/terminal races must trip named assertions |
| N10 / registered tool path | Invoke actual installed dock_* definitions through production plugin/RPC/native composition; truthful dispatch/postcondition; native code/outcome preserved on provider/EOF/client faults, plugin-owned 15-second timeout and ToolContext.abort before/after native admission | Bypass adapter routing/permission path, strip code/outcome, drop native admission/cancellation notification, leak abort listeners or return viewer DOM as a native tree |
| N11 / visibility and regressions | Read does not move focus; hidden Dock view does not retarget native operations; browser numeric refs, coordinate precedence and navigation invariants retain behavior | Target the active guest app instead of the captured binding; let native selectors hit browser refs |
| N12 / packaged joint path | Packaged Orchestra deploys the versioned helper into the runtime; same app is visible through Xpra; saved data survives runtime restart | Remove/mismatch packaged helper or recreate wrong session/profile/epoch |

Every required negative case includes a matching valid-operation positive control. Baseline tests must execute and pass before mutation checks; the planted defect must produce a named failed assertion, then restored code must pass. A no-op edit stays valid. A provider-side “true” acknowledgement alone cannot satisfy any effect oracle.

## Test artifact contract

An acceptance artifact carries baseline/head SHA, package/helper/image/app/toolkit versions, host and guest architecture, session/display configuration, executable tool inventory, required case manifest, attempted/completed/skipped/failed cases, bounded request/response trace and independent postcondition receipts. Record each mutation, the actual command/result and restoration.

Missing dependencies, unreadable bus, missing apps/expected controls, empty required-case list, missing/duplicate case IDs, invalid provenance, missing postcondition receipts or skipped required cases are named failures in the required lane. A local unsupported-platform diagnostic earns no native-pass credit. Declared partial UI coverage is separate from a missing required test.

## Check commands and actual reach

Existing commands, cwd `packages/desktop`:

```sh
bun typecheck
bun run test:app-dock:rpc
bun run test:app-dock:tools
bun run test:app-dock:e2e
```

The current desktop Electron harness launchers use the macOS executable path. Desktop typecheck excludes `src/**/*.test.ts`; running the named executable harness is a separate requirement. These commands establish existing browser/RPC behavior in their supported environment, not AT-SPI coverage.

Existing commands, cwd `packages/orchestra`:

```sh
bun typecheck
bun test ./src/plugin/app-dock.test.ts --timeout 30000
```

The current plugin suite uses a fake parent port. Extend its schema/routing regressions, but use N10 to prove actual guest/tool transport. Existing App Dock live tests enumerate registered sidecar tools and execute direct RPC; enumeration and direct RPC are not substituted for registered-tool execution.

Existing native local checks, cwd `packages/desktop`:

```sh
bun test src/main/app-dock-native-client.test.ts src/main/app-dock-native.test.ts
bun test src/main/app-dock-rpc-proof.test.ts
bun run scripts/app-dock-native-proof.ts --container "$A11Y_TEST_CONTAINER" --output "$A11Y_EVIDENCE_DIR/normal-$A11Y_RUN_ID.json"
bun run scripts/app-dock-native-proof.ts --container "$A11Y_TEST_CONTAINER" --suppress-action --output "$A11Y_EVIDENCE_DIR/suppressed-$A11Y_RUN_ID.json"
```

Set the variables to the inspected owned test container, existing private evidence directory outside any Git checkout and a unique run ID. The normal proof must pass all required cases; the suppressed-action control must fail at the independent effects, with the control actually exercised and cleanup/restoration intact. Partial `--diagnostic-case E04` execution intentionally retains an overall failed/missing-case verdict. The earlier draft `--required` spelling is not an option of this proof command.

Python conformance uses the production `resources/linux/app-dock-accessibility` payload. Isolated fixture sessions must unset inherited `AT_SPI_BUS_ADDRESS`/`XDG_RUNTIME_DIR` and start Xvfb before D-Bus so service activation inherits the correct display. Do not run tests from the repo root or use `tsc` directly. Exact production-runtime/packaged and benchmark commands are F3 deliverables, frozen with their actual runner and entrypoint rather than inferred from these local fixture commands.

## CI and host reach

- A dedicated required Linux lane installs the pinned test image/dependencies and runs native semantic acceptance. Missing prerequisites fail; it does not silently skip. Register that lane only when its real runner exists and observe it execute on the branch.
- Exercise both supported guest architectures on real runners; cross-built artifacts or emulated guest tests are labeled precisely, not reported as native ABI/performance proof.
- Existing macOS browser acceptance continues to exercise its actual Electron environment. Changing a launcher to a tiny synthetic environment must not delete its lifecycle/profile coverage.
- Joint acceptance runs with packaged macOS and Windows hosts and the runtime's supported x64/arm64 guest combinations. Record host/runtime/display-specific unsupported combinations rather than inferring portability from Linux semantic tests.
- CI additions extend the checked surface. They do not weaken an existing guard, reinterpret skips as passes, or satisfy a gate using only its own expected-name copy.

## Performance experiments

Measure the incremental cost, including app-side accessibility activation. A small helper process alone is not the total overhead.

| Experiment | Paired conditions / retained evidence |
| --- | --- |
| P01 / baseline attribution | Same app+Xpra with bridge absent/accessibility disabled where controllable; accessibility enabled without bridge; helper idle; exact actual activation states |
| P02 / interactions | Bounded read, text replacement, action acknowledgement and independently observed postcondition; fresh cold and repeated warm scenarios |
| P03 / background | Visible/hidden Dock view and background guest browser tab separately; focus/state invariants and semantic read/idle resource samples |
| P04 / stress and close/reopen | Wide/deep trees, long Unicode text, nonmatches, event bursts, app/helper restarts; settled checkpoints for maps/processes/fds/tasks and memory curve |
| P05 / packaged pipeline | Complete model-tool/RPC/guest path plus Xpra visual responsiveness under the runtime's supported Mac/Windows configurations |

Pin versions/configuration, workload, warmup/settling windows, repetitions, durations and test ordering. Randomize paired baseline order and reset activation/cache state as needed. Record raw measurements and failed/time-out samples rather than dropping them from quantiles. Benchmarks use one heavyweight runner at a time and avoid other sessions' build/test load.

Retain host total CPU/memory and VM footprint; guest per-process CPU/PSS/RSS for helper, app/renderer, AT-SPI, D-Bus and Xpra; queue delay, scheduled native calls, instrumented D-Bus calls when measurable, bytes, events, ref-map size and cleanup curve. Never add host VM memory and guest process memory as though independent allocations.

Separate tool-to-reply latency, native action dispatch, semantic postcondition latency, Xpra presentation and model inference. They have different clocks/oracles. A semantic state event is not screen photons, and JSON acknowledgement is not task completion.

Calibrate instruments with deliberate reply delay, a known growing tree/event burst, a known process load outside the helper and completed close/reopen cycles. Samples/receipts must demonstrate the instrument sees the intended scope and a planted regression changes its verdict.

Reports include planned/attempted/completed samples, failures/skips, raw artifacts, units/clock domains, quantile method, thresholds with their source, calibration outcomes and resource curves. Empty/incomplete/skipped/mock-only measurements are INVALID/UNVERIFIED, not green.

The user's qualitative latency/overhead goal is not yet a numeric SLA. Ordering is mandatory: calibrate the baseline/instrument/noise; agree numeric latency quantiles, timeout/failure treatment, CPU/memory deltas and settled-growth tolerance; freeze that acceptance policy; only then collect/judge candidate results. Do not select thresholds after seeing candidate performance. W1 separately freezes finite structural limits before worker dispatch. Unmeasured speed/RAM promises are not release evidence.
