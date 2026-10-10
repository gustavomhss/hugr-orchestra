# WP9a — native default and rollback

Status: technical default-on gates verified for local use. Candidate branch: `omni-default-ci`;
product candidate `f036dca9a4`, CI/harness repairs through `fc41e41a68`; integration PR #73.

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

- Verified candidate is ready for `omni-native` and draft PR #73; the report does not approve a merge into `dev`.
- WP9b legacy removal still waits for one clean release. npm/public release and signed/notarized distribution
  remain outside the owner's local-use approval.
