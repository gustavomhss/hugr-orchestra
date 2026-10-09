# WP10 — Orchestra integration validation

Status: **hosted lifecycle closeout verified; owner acceptance pending**. Source integration: `omni-native`, PR
[gustavomhss/hugr-orchestra#73](https://github.com/gustavomhss/hugr-orchestra/pull/73).
Closeout branch: `omni-closeout`; reconciled product revision: `50df6ac76a01a00762b22c62d6e053a78f658164`.

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

## Prior integrated evidence (2026-10-08)

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

## Hosted closeout (2026-10-09)

These runs close the previously listed hosted gaps. Evidence belongs to the source SHA recorded by each run;
an earlier campaign result is not a measurement of a later revision.

| Evidence | Result and scope |
|---|---|
| [37832187161](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37832187161) | macOS **Intel/x64** V7: 25 warmup pairs, 1000 samples per arm, AB/BA, 20 ms idle outside the clock. Legacy p50 9.89377 ms; Omni 11.30649 ms; unchanged limit 11.89377 ms. Measured 5 ms in-clock slowdown was rejected: Omni 17.66623 ms, limit 12.06073 ms. Busy/partial ARM runs remain unrun. |
| [37799127882](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37799127882) | Eight native artifact targets: Linux GNU/musl x64/arm64, macOS x64/arm64, Windows MSVC x64/arm64. Clean-install/runtime proofs execute the addon and supervisor under Node/Bun/Deno; Deno on musl is explicitly N/A. This does not enable every target in the Orchestra CLI build table or publish npm packages. |
| [37866046448](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37866046448) | V3–V6 on Linux/macOS/Windows: supervisor-death tiers and fresh recovery; twenty same-instance LSP crashes with real tsservers; one MiB MCP stderr plus final diagnostic marker; real vim/resize, Unicode reconnect replay, cooked 50 MiB responsiveness and supported raw byte accounting. |
| [37809901606](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37809901606) | Earlier Bun and built-Node natural-exit proof on three OSes; timer and orphan stdout-holder controls included. Controlled production-source fixture, not Electron. |
| [37882215212](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37882215212) | Actual packaged Electron on three OSes: main crash, utilityProcess crash with main alive, and unsignalled code-zero app.quit. Real Keychain isolation repairs the macOS fixture. Unsigned --dir packaging only. |
| [37866045782](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37866045782) | Deliberately red lead mutation: removing Windows SIGINT/SIGBREAK listeners broke serve Ctrl+C shutdown. Restored product is exercised by the current Windows lifecycle run below. |
| [37886081319](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37886081319) | Reconciled working-tree snapshot `99d05a535a2a1d5a7b06640cb024d9f79a9abb38`: 26 tests per OS, no skips. Natural-exit fixture now shares seatSkillsFiles and ORCHESTRA_COMPILED=true with production; generated-map hashes are retained. Timer stays red after disposal; orphan stdout holder cannot bypass descendant/broker cleanup. Seat packaging failure controls also execute. |
| [37887074886](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37887074886) | Snapshot on reconciled product: Windows V1 adoption/output and two real frontend Esc in the same Session; V2 compiled serve/TUI crash; V10 TUI quit and real serve Ctrl+C. Omitted adoption, missing inner supervisor ownership, forced kill presented as graceful, disabled Esc and recorder-stop faults are rejected. |
| [37886935451](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37886935451) | Product `50df6ac76a`: compiled CLI crash smoke and in-bundle debug omni passed on Linux/macOS/Windows, using shipped neighboring native files. |
| [37886938068](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37886938068) | Product `50df6ac76a`: actual packaged Electron matrix passed on Linux/macOS/Windows. Live bash/LSP protocol fixture/MCP plus grandchild/two terminals; main and utility crashes leave zero owned trees within 8 s; app.quit exits unsignalled with code zero within 20 s. Legacy-unowned, forced-kill-as-graceful and empty-fixture controls are rejected before restored green cells. |

V6 raw POSIX identity uses receiver-acknowledged 64 KiB blocks; it does not claim lossless unpaced raw bursts.
ConPTY raw byte identity is `supported:false`, `pass:null`; its cooked/render tier executes. Acknowledged raw
accounting and cooked unpaced responsiveness are separate observations.

Unix setsid escapes, the Unix supervisor-death hole and no-pidfd limitations retain their declared guarantees.
Windows inventories retain PID plus creation time and owner chains. A missing identity or incomplete query is a
failure. Cleanup after a failed measurement cannot turn that measurement green.

Earlier run source pins: V7 `097a9faebfcf90a0c0f118bbe708539dea9572d2`; eight targets
`edc12db0a31ecb15f6af73b2e4e99a4fed4fbd0c`; V3–V6 `e4934e51a78935ab1bcc0306b216c0c9018da615`;
natural exit `cc72d7a1868049cee332a924bc6dd5cc5accc247`; Electron
`eb9d5a6f715db0e052d1122345be2f0bc2f02f8f`. Restored Windows lifecycle snapshot:
`256c63d3b74c9b5bd6e61e942dcf47477c1a0db7` (only the request file differs from product `50df6ac76a`).

The natural builder hashes the generated seat map in its full runner-local source manifest. The verdict logs retain
the manifest digest and selected source hashes; `test-ci` does not archive that full manifest as an artifact.
Desktop workflows separately upload their source/artifact pins and mutation evidence.

Core, Orchestra and campaign package typechecks passed locally after reconciliation. A cold source reviewer
approved the shared build/tool merge boundaries and natural-fixture adjustment; the hosted runs above cover their
runtime reach. No public Protocol/Server HttpApi changed in this reconciliation.

## Authorized distribution deferral

WAIVER (human-authorized) — Apple Developer ID signing and macOS notarization proof are deferred.

- authorized-by: owner, 2026-10-09, **"go on"**, in response to continuing technical closeout for local use without
  an Apple Developer membership.
- reason: no paid Apple Developer membership or valid Developer ID identity is available.
- scope: local unsigned/ad-hoc development artifacts only. This is not approval of signed/notarized distribution,
  a public release or npm publication.
- remediation: obtain Developer ID and notarization credentials, then execute the original signing/notarization
  path before that distribution; tracking: WP4/WP5 signing requirements in `docs/orchestra-integration.md`.

No KPI waiver was granted. Busy timing refusals are preserved. npm publication remains owner-deferred.

## Remaining acceptance and WP9a entry

- Owner signature on this report remains pending; distribution deferral is not that signature.
- The plan's owner-Mac V2/V7 rerun at the default-on boundary remains outstanding. Hosted Intel V7 has the reach
  stated above; it is not a new owner-machine measurement.
- The default-on epic suite and current default-on packaged smokes have not run: the flag still defaults off.
- WP9a must provision native artifacts to every consuming test shard, hash Rust/native inputs in Turbo, retain a
  meaningful Windows `=0` rollback cell and prove unset-default behavior before flipping.
- `omni-default-ci` exists for that work. Eight-target artifact proof alone does not enable the currently disabled
  musl/Windows arm64 rows in the CLI build table.
- WP9b stays after one clean release; npm publication requires separate owner authorization.

Owner signature: **pending**.
