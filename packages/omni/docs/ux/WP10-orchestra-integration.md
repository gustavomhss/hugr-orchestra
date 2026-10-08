# WP10 — Orchestra integration validation

Status: **in progress, not signed**. Source integration: `omni-native`, PR
[gustavomhss/hugr-orchestra#73](https://github.com/gustavomhss/hugr-orchestra/pull/73).

## Findings closed during recovery

- macOS PTY API tests: test preload loaded database flags before in-memory test configuration. Fixed in the earlier
  integration; the integrated LSP/PTY set was rerun on Linux, macOS and Windows.
- Toolkit installation: async subprocesses now use AppProcess. Shared startup failures settle on every Exit;
  caller-owned population cancellation joins process cleanup before deleting staging. Shared installations retain
  their pre-existing lifetime independent of any single waiter.
- LSP: dead cached clients report error; next demand stops the old tree and starts one replacement. Closing state
  fences new admission and joins in-flight initialization during instance disposal.
- CLI signal handling: an interrupted handler could return to process.exit before runtime disposal finished. It now
  joins the shutdown promise and logs disposed, failed or timed-out distinctly.
- Shipped native files: compiled CLI preflight runs before the command graph when the explicit Omni flag is on.
  Explicit addon paths cannot borrow a supervisor from another resolution candidate.
- Cooked macOS PTY byte discrepancy: the same additional CRs occurred in the independent Python system PTY. Native,
  OS and WebSocket captures matched. A separate raw-mode workload checks exact source bytes without normalization.

## Lead verification

| Evidence | Result and scope |
|---|---|
| [37676510280](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37676510280) | Packaged Linux desktop crash smoke: main, shell and terminal. Earlier integration revision. |
| [37714003055](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37714003055) | Integrated strict LSP restart/disposal and PTY API set: 16 passed on Linux/macOS; 8 passed and 8 existing PTY-API skips on Windows. |
| [37714003987](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37714003987) | Installer/loader set passed on Linux/Windows; two macOS loader assertions failed because fixture used the symlink spelling of its temp path. Fixture canonicalized. |
| [37715058409](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37715058409) | Restored installer/loader set on macOS: 29 passed, 3 platform-specific skips. |
| [37714753596](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37714753596) | Lead mutation: falsely resolving startup failure as success failed the named startup assertion. Filtered zero-spawn control also failed; it is not the mutation's evidence. |
| [37714754597](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37714754597) | Lead mutation: disabling LSP closing transition failed both disposal-barrier tests. |
| [37715058546](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37715058546) | Restored LSP tests: all three passed on Linux. |

Independent cold reviewers inspected each product slice, requested fixes, and approved the repaired slices. These
checks verify their stated revisions and scopes, not an untested later source revision.

## Current integrated evidence (2026-10-08)

The Orchestra rename and Relay test-runner changes are reconciled. Canonical package path is `packages/orchestra`;
the explicit switch is `ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER`. Product revision for the following delivery evidence:
`205d67c3cd2b77147f0c76e403682fbc5672afc6`.

| Evidence | Scope |
|---|---|
| [37719045239](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37719045239) | Renamed installer/loader tests executed on Linux, macOS and Windows; all three jobs passed. |
| [37719045708](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37719045708) | Renamed LSP restart/disposal and PTY API tests passed; existing Windows PTY-API skips remain explicit. |
| [37742345554](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37742345554) | Inventory/marker/ownership controls: 11 passed on Linux/macOS, 12 on Windows, including real failure and mutation controls. |
| [37734395382](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37734395382) | Lead mutation removed start-time equality; stale identity incorrectly killed the sacrificial child and the named assertion failed. Restored before integration. |
| [37739571207](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37739571207) | Linux V7 fixed p50: legacy 1.7363 ms, Omni 2.8117 ms, unchanged limit 3.7363 ms. Full 1000 pairs. Exact baseline mutation: Omni 9.4375 ms, limit 3.7995 ms, red. |
| [37741576258](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37741576258) | Lead removed the native prefilter: real full V7 became red (Omni 6.7892 ms, limit 3.4763 ms). Restored byte-exactly before integration. |
| [37743712564](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37743712564) | Current native gate passed on Linux, macOS and Windows. |
| [37743712533](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37743712533) | Current compiled CLI crash smoke passed on three OSes. |
| [37743712649](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37743712649) | Current packaged Linux desktop crash smoke passed. |
| [37743712802](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37743712802) | V9 passed on three OSes; V8 passed on Windows Server 2022; Linux V7 passed. macOS V7 aborted at pair 495 after host load crossed the quiet criterion: acceptance unrun. Overall workflow remains red. |

The Linux optimization skips unrelated procfs reads using a kernel SID hint; accepted process facts still come from
one stat. Complete scans, root pinning and incomplete-observation failures remain. No-pidfd limitations and setsid
escapes remain the declared tiers, not newly strengthened guarantees.

## Remaining acceptance

- Reproduce campaign scenarios on the required Linux/Windows/macOS and CLI/TUI/desktop host matrix.
- Obtain complete quiet macOS V7 timing; busy-host refusals and interrupted partial runs remain unrun, not passes.
- Complete Windows background/TUI/graceful-quit campaign harnesses; V8 now has real Server 2022 evidence.
- Prove natural event-loop release independently of explicit process.exit; current V10 proves disposal and cleanup.
- Prove all eight release artifact targets and the required signing/notarization path.
- Re-run current integrated packaged smokes and obtain owner signature before WP9a.

No waiver of KPI, scope or rigor has been granted. Omni remains off by default. npm publication remains deferred.

Owner signature: **pending**.
