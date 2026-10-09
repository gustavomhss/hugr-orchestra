# Relay closure — active implementation checkpoint

Updated: 2026-10-09. Owner priority: Maestro attribution/V3 → W6 → real-model pilot.
Nix is independent. One final milestone PR; no work-package PRs.

## Owner execution cadence

Implement disjoint slices in parallel. No per-slice typecheck, tests, mutation, CI,
build or product smoke while combined implementation is incomplete. Prepare runnable
checks now; perform one integrated validation batch after combined source is ready.
Reuse existing source-bound evidence; keep gates intact. Static cold review remains required.

## Current ready pin and validation handoff

All known semantic repairs and source-growth extractions are composed in clean published
`35c52d2c6716afb18e89cd3fa219da2f1bd55873`. Runtime received exact pin and three independent
static review receipts in `msg_1212e620c001b0GSfQACTiy8h6`.

- Guards/private port/writer and distinct Maestro-validator/Lucy-reviewer identity fixes:
  `e5e0507dd532ccc63f0af39a021b358cf6171585`.
- Grounded V3 consumer: exact upstream `db4b028360` + prepared cases `0cc55ee829`, mapped to
  `eb1d670878` / `75e643f51b`; V3 requires actual grounding, historical V1/V2 preserved.
- Evaluator settlement/repair extraction: `5acf4d190f`.
- Private prompt operations extraction plus options forwarding: `09ce00affa` (includes `0f29096aad`).
- Background Task extraction: `294c98f6f7`.
- Runtime candidate `75c4370b6c` contributes exactly one internal Relay workspace dependency line
  in Orchestra manifest and Bun lock, plus supported generated SDK and human-only generated cap.
  SDK **16718 LOC** explicitly human-authorized; Client **6646** unchanged. No source waiver.

### Cold source-review receipts

All three review exact HEAD `35c52d2c67` against baseline `75e643f51b`. Verdicts are static
APPROVE only, not compilation, runtime, budget-gate or acceptance results.

| Slice | Reviewer Session | Final assistant receipt |
| --- | --- | --- |
| Evaluator extraction | `ses_eded631b9ffeeuH7Y2JlpZ4P4Q` | `msg_1212a84b7001tGQY9nCG1fj2cZ` |
| Prompt operations extraction | `ses_eded6319bffeD54cwmmW8s7mS8` | `msg_1212cbf3e001w3F8P9BvZWcIAp` |
| Background Task extraction | `ses_eded6318fffevTIEIZGheWYg6T` | `msg_1212b2c36001g13xxJvzkDehF7` |

Runtime owns one coalesced failed-package/Godfile/scoped QA pass after composition and local
PTY setup. Official bun-pty 0.4.9 archive was inspected by runtime; empty installed dist is
local cache/install corruption, not a new source dependency/version change. Relay does not
duplicate those checks. Nix measurement activation waits for actual post-generation/checks
freeze. Core Omni `37943566437` on unrelated `f3b2b67` is not Maestro evidence or a failure card.

## Exact source state

| Front | Source checkpoint | State |
| --- | --- | --- |
| Shared runtime | `b1cad41dc515eec9dcf474c413da853061894ac1` | Consumed into `relay-next`, `nix-closure`, W6 base |
| Nix consumers | `8b812438bc` | Composed initial consumers, provenance/control/PTY source fixes and strict measurement helper; unvalidated, four hashes stale |
| W6 definition/current step | `d438ef8eab` | Source checkpoint; not closure |
| W6 lifecycle | `b72bfccf25` | Initial lifecycle checkpoint; completed by production port/hash and durable settlement checkpoints below |
| W6 production ports / hashes | `992b4c58ec`, `ee502646c7` | Concrete publication/provenance/approval/completion ports, canonical V3/hash path and scoped durable resume implemented |
| W6 host extraction | `b36b725c10ee16ab04771c63b49132b82d92881b` | Named `maestro/workflow-host.ts` boundary; existing composition preserved, no new layer or waiver |
| Complete upstream base | `ed078a033432ef948a813472b888a9245a244166` | Consumes exact b1-based `01a48f6a22`; registration/result/proposal/seat helpers now present |
| Compatible background writer/preservation | `25a7333a045e905d6f23765a74fb9c85c9193f45` | Captured returned assistant, durable V1 readback/private setter, native V2 synthetic/progress with actual parent Location; preserved terminal metadata |
| Canonical background reader | `e032d61e7c19cd4af1ecefacec78b7619e16cf22` | Consumes private `upstreamSettlement`, actual referenced V1 part/V2 synthetic projection, canonical attribution unchanged |
| Same-lock settlement adapter | `d2cc5b16bf8bc4c64ce5949021d57d282170d506` | Published, unvalidated; consumed as `2e3c15cd89` in W6 |
| Upstream attribution/V3 | `8f73c045307f06da311ee6f8b1bb6ba378bf265c` | Upstream source-reviewed; consumed as `30ac511984` |
| Upstream verifier | `cc6f5a8f755bb7d765c5d918ecd23180244be006` | Synchronous source consumed as `4385c5847d`; background reader extension integrated separately |
| V1 pilot launcher | `fe3760f621` | Runtime source consumed; prepare-only default, real execution remains qualification work |
| Native-product / WSL harness | `260d` / `80f3ebecfc` | Runtime source consumed through `56659216d6`; execution proof still pending |

W6 working branch/worktree: `relay-workflow`, temporary OpenCode work directory.
Nix working branch/worktree: `nix-closure`. Integrator: `relay-next`.

## Implementation and qualification boundary

- Background producer and canonical observer are implemented and composed. Final work
  result is captured from the actual returned assistant; delivery reference is written
  after durable readback on the exact original Task. Initial-completion/late metadata
  preservation is implemented; final checks still must establish behavior.
- Frozen private host-only existing Task metadata contract (upstream ACK
  `msg_11f3590e7001Z4VlhB0nt14OBe`):
  `upstreamSettlement: { parentMessageID, parentCallID, workResult, deliveryMessageID,
  deliveryPartID? }`. Multipart V1 requires the actual part reference. Canonical
  `UpstreamAttribution.V1` does not change. Caller notices, process-local job status,
  timestamps and later `lastAssistant()` reads cannot establish these facts.
- Relay owns producer and narrow existing Task/Session settlement; upstream owns observer.
  Missing/failed/undelivered evidence remains named HOLD. No new
  event type/store/approval/loop/coordinator/drain identity. Source readiness is not full closure.
- V1 generic `Session.updatePart` continues to strip caller-new settlement metadata.
  Producer uses private `Session.settleUpstreamTask` after actual User/part readback;
  stored Task receipt is verified before wake. Native V2 uses existing `Synthetic` and
  `Tool.Progress`, explicit actual parent Location, and existing process-global resume.
- Runtime received clean full-source `9b83e5315fa462c0c0ee2053c93380c0ac203b44` in
  `msg_11f70b018001OjTXDuD3LD4kd0` and started the agreed generation/typecheck/scoped CI
  batch. Lead does not duplicate those checks. Nix starts after post-generator source freeze.
- Nix native four-system dependency measurements, consumer builds, output proof and hashes.
- Final native/WSL qualification and read-only V1 credential compatibility/model pilot.

PlanSource/attribution/registry remain upstream-owned. Relay owns binding/lifecycle;
Nix owns `nix/**`, `flake.nix` and Nix workflows; runtime owns native-product workflows.
Peer ACKs grant neither human approval nor permission waivers.

## Evidence reuse and scheduling incident

Native producer proof: `37875718504`; SDK prepared runtime proof: `37877015907`.
Earlier optional `--config PATH` invocation is vacuous and excluded; required `--config=PATH`
fix is part of the valid producer source. Nix toolchain proof `37824668435` is independent.
Initial Nix source push triggered existing toolchain run `37880278652`; cancelled after
prepare/Linux jobs had run. This is not consumer/distribution acceptance. Later source
checkpoints use `[skip ci]`; no further deliberate validation before combined readiness.

Initial Nix static reviews identified unbound measurement provenance, incomplete control
collection and insufficient PTY consumer evidence. Source corrections are composed in
`8b812438bc`; actual controls/native qualification are still deferred. Controlled premerge
bootstrap is restricted to `nix-validation` plus the explicit request in
`nix/distribution.md`; current `ready:false` remains intact.

Unvalidated foreground W6/upstream plus Nix source composition: `dd6c5f367f1a0d8dddd6909cee6fbf0fd1ab13a4`.
No product readiness, test pass, measurement or pilot acceptance follows from this composition.
Full compatible background/runtime/Nix source composition: `9b83e5315fa462c0c0ee2053c93380c0ac203b44`.
Dirty alternative BackendWork delivery implementation was not consumed. Preserve its archived draft.

## Coordination and recovery

Current existing OpenCode server: `http://127.0.0.1:50407`; old `49246` stopped.
Server was discovered, not restarted. Basic auth comes from environment; never log secrets.
Runtime: `ses_ee888bf80ffeckSbRi0RP57V1s`; upstream: `ses_ee6d55370ffe6CYDCP42Ox46NN`.
Recovered host author: `ses_ee10c03f9ffe7gsM6XAunvvWRt`; resumed on live server with
exclusive W6 writes after Task return failed at snapshot `info/exclude`.
Accumulated ACKs persisted; compact existing V1 receipt map sent in
`msg_11ef8eaaf001TcfWB5HVI2uTMG` (review message IDs still being recovered).

Removed only own inactive clean integrated `v1-prompt-admission` and
`python-runtime-retire` worktrees; their branches/commits were preserved. Keep all pending
peer work and frozen Relay golden/fixtures/reviews and oracle pins.
