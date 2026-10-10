# WP9a — native default and rollback

Status: technical default-on gates verified for local use. Final reconciled candidate: `omni-native`
`06699d3fd8f3283a1ee85a9dbecc2e66ecd14d0a`, including `dev` through `ada14ff6ff`; integration PR #73.
Earlier `omni-default-ci` acceptance at product `f036dca9a4` / CI `fc41e41a68` remains pinned below.

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
| [37986601308](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37986601308) | Repaired recorded LLM and Installation fixtures: seven passed, one missing-cassette skip on Linux/Windows. Only stale second-request city values changed; provider responses, both interactions and consumption checks remain. |
| [37995835107](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37995835107) | Lead mutation removed native Node attestation: copied Bun executed the source marker and the named pre-execution assertion went red. Restored before integration. |
| [37996549720](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37996549720) | Thirteen async query instrument proofs passed per Linux/Windows host. Native runtime identity, nonce binding, absolute phase deadlines, exact output cap, inherited-pipe closure, broker death and retained unknown diagnostics execute. |
| [37996549974](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37996549974) | Integrated Windows loader/spawner/toolkit/inventory set: 50 passed, two OS-specific skips. Parent birth/sweep queries now use async native Node; fixture children keep the bounded birth reader. |
| [37997534696](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37997534696) | Windows desktop process adapters: seven passed with the integrated async inventory. |
| [37998169396](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37998169396) | Candidate `45d154692f`: compiled CLI on three OSes, including explicit unset-mode assertions and neighboring native-file resolution. |
| [37998258046](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37998258046) | Candidate `45d154692f`: V9 on three OSes, including unset default rejection and explicit `=0` lazy rollback; V8 on Server 2022; V7 on Linux and macOS Intel. |
| [38003568091](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38003568091) | Lead mutation removed SQL ROLLBACK: actual Node write-before-throw retained failed value; named rollback assertion went red. Restored. |
| [38003902425](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38003902425) | Native Node storage bundle plus Bun ownership/corruption suite: 24 passed on Linux/macOS; 12 passed and one POSIX-only skip on Windows. Immediate rollback, dual-failure cause retention, persist/reopen and sealing execute. |
| [38003902667](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38003902667) | Windows Effect pull-request handlers plus native parent spawn control passed after platform-native absolute temp roots replaced drive-relative `\\tmp`. |
| [38004544234](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38004544234) | Full package typecheck workflow passed at `f036dca9a4`. Core and campaign package typechecks also passed after the CI/harness repair. |
| [38005242768](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38005242768) | Product `f036dca9a4`: compiled CLI default-mode/debug and crash smoke passed on Linux/macOS/Windows. |
| [38004541043](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38004541043) | Product `f036dca9a4`: actual unsigned packaged Electron main/utility crash and natural app.quit matrix passed on Linux/macOS/Windows, including broken controls before restored cells. |
| [38005245577](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38005245577) | Product `f036dca9a4`, attempt 2: V9 on three OSes; V8 on Server 2022; V7 on Linux/macOS Intel. Attempt 1 Linux refused a busy host during V9 and before V7; those observations remain failures/unrun. |
| [38004538102](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38004538102) | Product `f036dca9a4`, both attempts: all other epic lanes passed, but Windows other-packages failed at the recorder readiness deadline. This is not an epic pass. |
| [38012867459](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38012867459) | Repaired manual Windows Turbo probe: strict and loose each execute the real recorder and fresh native AppProcess control; two passed, one nonmatching-test skip per mode, no cache replay. Focused proof, not the full epic. |
| [38013459471](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38013459471) | Deliberately red: removing the `PSModuleAnalysisCachePath` env entry makes the strict recorder readiness test fail while loose and the native control still pass. Entry restored byte-exactly before commit. |
| [38014329741](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38014329741) | Repaired epic at `fc41e41a685f0a597f3679174fb153a809a07018`: all lanes passed, including same-run Linux/Windows native producers/consumers, Linux/Windows unit shards, Windows `=0`, Linux e2e, Atlas, godfile, HttpApi and Relay. Windows Core was a cache miss: 1524 passed, 29 existing skips. |

Local dry-run cache probe changed one real supervisor source comment: native transit hash and Core consumer hash
both changed; byte-exact restoration recovered both original hashes. A no-op was stable; explicit `=0` changed the
Core test hash. These are cache-input proofs, not test-suite passes. Cold CI/runtime reviewers requested corrections
and approved the repaired source; actual workflow execution remains a separate gate. The three-file
`f036dca9a4..326a697ad7` diff changes only CI environment hashing, a manual probe and recorder failure diagnostics;
`fc41e41a68` additionally hashes campaign TypeScript consumed by Core tests. CLI/Electron evidence above belongs
to the unchanged product at `f036dca9a4`, not fresh CI-repair binaries.

A recorder-source comment probe exposed an additional blind cache input: before the extension, both Core and native
transit hashes stayed unchanged. With the explicit campaign input, Core changed from `f931030248c41725` to
`dfcae1ccc4cde971`; byte-exact restoration recovered `f931030248c41725`. Native transit remained
`a7bc40b96369db56`, as expected for a test-only input. `PSModuleAnalysisCachePath` values `cache-probe-a` and
`cache-probe-b` produced different Core hashes (`61ef8bce08aa2795`, `ba37197b0e1a82e9`). Dry-run cache probes only.

## Integration findings and authorized ceiling extension

The first epic exposed stale help/route/replay fixtures and a mock spawner bypassed by native collection. Those
assertions were repaired rather than skipped. The Windows full suite also exposed Bun synchronous query stalls;
the instrument now positively attests native Node and keeps query-source completion distinct from broker exit.

Packaged Electron then exposed a real eager `bun:sqlite` import added by the merged `dev` storage path. A conditional
Bun/Node SQLite adapter fixes runtime linking and preserves the same private database and transaction semantics;
lazy loading alone would only postpone the failure. Windows standalone package scheduling is serialized so cold
embedded bootstrap does not contend with another runtime suite; all packages and existing deadlines remain.

The final Windows epic failure differed from direct `test-ci`: Turbo strict omitted the runner's
`PSModuleAnalysisCachePath`, and PowerShell stalled before completing the recorder's first CIM warmup. Matched
strict/loose execution reproduced that difference. Preserving only this variable repaired it; preserving
`PSModulePath`, `LOCALAPPDATA` or `COMPUTERNAME` individually did not. The Core test task declares it in `env`, so
Turbo preserves and hashes the path value. Cache-file contents are not hashed. Strict mode and the 10-second
recorder deadline remain; the full-Core epic still provides the ordinary regression gate. The hosted probe is a
manual diagnostic counterpart, not protection against future test deletion.

WAIVER (human-authorized, 2026-10-09) — owner answered **"Autorizar tetos gerados"** to extending only these generated
output ceilings for the two Session process routes: Effect Client 1146, Client 1637, Client types 6661 and V2 SDK
8703 lines. Recorded in `godfile-waivers.json`; all other caps and automatic generation remain unchanged.

## Owner-Mac rollout boundary

The owner's darwin-x64 machine executed pinned rollout probes under the campaign-only local authorization.
V2 used the local CLI built from `d4a32678c6`; V7 used the Bun source checkout
`feeb526787f445d32b4a9d59198218186c4d18e6`, recorded by every sample's real Git output. These are not fresh
`f036dca9a4` binary measurements. The local CLI SHA-256 is
`bb7deb98810eebef1219e73934d0f2c81b3926332c8f07e7155624013fe39c36`. Native files came from eight-target artifact
`37799127882` (`edc12db0`); the complete Rust/native build inputs were byte-identical to the candidate, verified by
Git diff, and shipped file hashes matched `proof.json`. These source pins describe the proof's actual revision.

- V2 compiled serve: every bash/LSP/MCP/two-terminal tree had live PID/birth and supervisor controls; zero observed
  at 579 ms, retained identities and nonce sweeps still zero in the final sample at 7659 ms. Measurement passed
  before fallback cleanup. TUI repeated this: zero at 536 ms, final sample at 7703 ms.
- V7: 25 warmup pairs, AB/BA, 1000 samples per arm, 20 ms idle outside both clocks. Legacy p50 20.115001 ms;
  Omni 21.756657 ms; unchanged limit 22.1265011 ms. Native spawn count 1000, delegations zero. Samples:
  `campaign/logs/v7-samples-1791583142423.json`, SHA-256
  `40bf74b7af8233cb897ff40c292d5870f0c90cd537724573e45d4bf3982d8787`.

Earlier busy-host V7 refusals, missing local dependencies and a V2 `ps` timeout remain failed/unrun observations,
not passes. Raw campaign logs are retained locally; they are not uploaded by ordinary `test-ci`.

## Landing and deferred delivery

- Owner authorized final reconciliation and merge: **"ok manda bala. paraleliza o que puder, vamos resolver isso logo"**,
  then **"siga"**. Verified candidate is integrated into `omni-native`; final PR landing follows the gates below.
- WP9b legacy removal still waits for one clean release. npm/public release and signed/notarized distribution
  remain outside the owner's local-use approval.

## Final dev reconciliation and landing gates — 2026-10-10

The Cassandra compatibility pins/preparation from `dev` and Omni installer cancellation/cleanup were reconciled.
Source builders now validate a regular executable in staging before `.complete` publication. Shell adoption waits
for zero foreground exit and output finalization; the adopted job also owns its sandbox broker/scratch scope.
The native Node TCP broker now runs through AppProcess, preserving FIN/backpressure and explicit `=0` rollback,
without a new spawn-ledger exception. Independent cold reviewers approved these boundaries; lead probes rejected
removed readiness, resource retention and native broker selection.

The desktop smoke's private quit command is atomic authenticated JSON with a fresh action ID. All six main-process
shutdown witnesses must echo that ID. This replaces invalid cross-process wall-clock ordering, with unchanged
8-second kill / 20-second quit bounds, code-zero, no-signal, closed-handle and no-watchdog checks. Log artifacts now
retain the actual onboarding-derived Effect log and UTC-stamped desktop logs, with copied/missing/failed receipts.
Tracing is opt-in only; default acceptance retains the original sanitized environment.

| Evidence | Result and scope |
|---|---|
| [38017657553](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38017657553) | Reconciled toolkit/Cassandra/cleanup/project pins: 26 passed per OS, including real production Go acquisition/build. |
| [38018979518](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38018979518) | Staged source-output readiness restored: Linux/macOS six passed; Windows four passed, two POSIX permission skips. Real Node builder fixture exercises publication, not Go compilation. Lead guard-removal probe [38020268655](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38020268655) rejected invalid output. |
| [38019538392](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38019538392) | Full ShellTool with real background registry: success/Esc/removal, nonzero refusal and real output-write failure on all OSes; actual post-return broker exchange on macOS. Lead lease-removal probe [38020268619](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38020268619) failed post-return exchange. |
| [38022635906](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38022635906), [38022113499](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38022113499) | macOS TCP broker: nine passed with native default, nine with explicit legacy `0`. Lead real-legacy broker probe [38023773681](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38023773681) rejected zero native broker spawns before client exchange. The earlier missing-filesystem probe is not mutation evidence. |
| [38024550335](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38024550335) | Real compiled Windows V1/V2/V10 and controls: Session/registry adoption, two frontend Esc, foreground cancellation, serve/TUI crash and console quit. |
| [38056634201](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38056634201) | Final fixture repairs: 31 passed, one Darwin broker skip per Linux/Windows host. Includes exact worker-evidence result and complete Bun/Node production seat-map transport. |
| [38057262233](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38057262233) | Lead foreign quit ID probe deliberately red on all OSes: required quit rejected while owned inventory still became zero within the original bound. Exact challenge restored before landing. |
| [38058250760](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38058250760) | Final `06699d3fd8` epic passed, attempt 2. Attempt 1's only failed lane was Windows Orchestra 3: fixture birth-reader `spawnSync ... ETIMEDOUT`; exact-source retry passed. Cached e2e/other prior-success lanes do not imply fresh browser execution at this SHA. Same-run artifact validation and all unit/Atlas/HttpApi/Relay/rollback lanes remained required. |
| [38058252749](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38058252749) | Final `06699d3fd8` full package typecheck passed. |
| [38058254890](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38058254890) | Final `06699d3fd8` actual unsigned Electron matrix passed on three OSes: all required restored crash/quit cells, old mutants rejected, matching action IDs and original default logging environment. |
| [38058254418](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38058254418), [38058254442](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38058254442) | Final PR-head compiled CLI and native gates passed on three OSes. The synthetic PR merge tree matched `06699d3fd8` byte-exactly before landing. |
| [38058254455](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38058254455) | Final PR-head delivery passed, attempt 2: V9 three OSes, V8 Windows, V7 Linux/Intel. Attempt 1 Linux stopped at pair 118 for busy host; incomplete timing remains unrun, not a pass. |

Linux/Windows package scheduling is serialized to prevent cold bootstrap/generation contention; every package and
original per-test deadline remains. Historical macOS `/pty` 500 activation errors did not reproduce in fresh
original-environment matrices; their cause remains unknown, not a claimed product fix. No diagnostic-only desktop
intervention substitutes for the required restored cells. Source changes after the final candidate are documentation
only unless separately recorded.
