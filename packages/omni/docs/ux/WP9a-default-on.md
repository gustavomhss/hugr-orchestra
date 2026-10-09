# WP9a — native default and rollback

Status: candidate, full epic and packaged acceptance pending. Branch: `omni-default-ci`; integration PR #73.

The owner accepted the WP10 hosted report for local use on 2026-10-09: "eai, pode seguir". Developer ID/notarization
and npm publication remain deferred under the separate decisions recorded in that report.

## User-facing changes

- Supported builds select Omni when `ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER` is unset. `=0` keeps the legacy backend for
  rollback; empty is also off. `=1` and `=strict` retain their existing meanings; invalid values fall back to legacy
  with a warning. Targets still compiled with `OMNI_ENABLED=false` retain legacy behavior.
- Background shell processes adopted at successful tool completion remain visible in the Session process panel.
  Esc cancels the foreground turn; Session removal/server shutdown stops adopted processes.
- Windows GUI launches started by Session shell commands close with that Session under the supervised tree policy.
- The `!` shell template has a 120-second deadline.
- Local source development needs the matching Omni addon and supervisor (`bun run omni:build`), or an explicit `=0`
  rollback. This change does not publish binaries or remove legacy dependencies.

## CI contract

- Same-run Linux/Windows native producers feed every unit shard and the Windows rollback cell. Downloaded files
  must exist and be nonempty; Unix supervisor execute permission is restored and checked. Missing artifacts cannot
  fall back to an unrelated cache/build in the consumer.
- Turbo transit hashes include the Rust workspace, manifests/lockfile, pinned toolchain, `.cargo` and binding
  inputs. Mode, positive-control preload and native action affect cache keys; native paths pass into strict Turbo
  environments. Cached shards still validate their downloaded native artifacts.
- `test-ci` provisions native files for Bun/Node requests even when the flag is unset. Python requests do not need
  them. The standalone build-time godfile test explicitly selects `=0`; ordinary runtime suites stay default-native.
- Cache warming shares its native producer artifacts rather than compiling the same source again in test jobs.

## Recorded verification

| Evidence | Result and scope |
|---|---|
| [37949294973](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37949294973) | Toolkit/dev reconciliation: 25 tests passed on Linux/macOS; 19 passed and six existing hosted-toolkit skips on Windows. Cancellation/staging and shared startup failure assertions execute on every OS. |
| [37948734653](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37948734653) | Deliberately red: excluding nonzero-exit stdout from diagnostic inspection exposed a synthetic token before the retained tail. Named redaction assertion failed; scan restored. |
| [37949294157](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37949294157) | SDK boundary lifecycle on three OSes, with explicit `=0`: actual process exit, abort, failed spawn and machine-login controls. This declared transport exception is outside Omni-tree guarantees. |
| [37953921922](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37953921922) | Unset default/loader set on three OSes; platform-specific loader/shell skips remain explicit. |
| [37953921334](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37953921334) | Windows `=0` rollback: 26 real AppProcess/spawner tests passed, including pipelines and cmd scripts. |
| [37955328299](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37955328299) | Deliberately red: reverting unset to off made fresh AppProcess/spawner report off and zero native spawns instead of on and two. Named selection assertion failed; default restored. |
| [37955747658](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37955747658) | Restored portable fresh-process proof on three OSes: real collected/streamed output, exact spawn/delegation counts for unset/0/1/strict, and compiled unsupported-target fallback. Two tests per OS, no skips. |

Local dry-run cache probe changed one real supervisor source comment: native transit hash and Core consumer hash
both changed; byte-exact restoration recovered both original hashes. A no-op was stable; explicit `=0` changed the
Core test hash. These are cache-input proofs, not test-suite passes. Cold CI/runtime reviewers requested corrections
and approved the repaired source; actual workflow execution remains a separate gate.

## Pending gates

- Full epic suite and same-run artifact round-trip on the candidate revision.
- Compiled CLI default-mode/crash and actual unsigned Electron default-mode/crash/quit matrices.
- Current V9 missing/corrupt-native-file checks with unset default.
- V2/V7 on the owner's Mac at the rollout boundary; busy timing refusal remains unrun, not green.
- Integrate the verified candidate into `omni-native`. WP9b removal still waits for one clean release.
