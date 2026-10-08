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

## Remaining acceptance

- Reproduce campaign scenarios on the required Linux/Windows/macOS and CLI/TUI/desktop host matrix.
- Obtain quiet V7 timing and V9 rejection measurements; local busy-host refusals remain unrun, not passes.
- Complete Windows background/TUI/graceful-quit campaign harnesses and exercise V8 on real Windows.
- Prove natural event-loop release independently of explicit process.exit; current V10 proves disposal and cleanup.
- Prove all eight release artifact targets and the required signing/notarization path.
- Re-run current integrated packaged smokes and obtain owner signature before WP9a.

No waiver of KPI, scope or rigor has been granted. Omni remains off by default. npm publication remains deferred.

Owner signature: **pending**.
