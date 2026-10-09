# Relay closure — active implementation checkpoint

Updated: 2026-10-09. Owner priority: Maestro attribution/V3 → W6 → real-model pilot.
Nix is independent. One final milestone PR; no work-package PRs.

## Owner execution cadence

Implement disjoint slices in parallel. No per-slice typecheck, tests, mutation, CI,
build or product smoke while combined implementation is incomplete. Prepare runnable
checks now; perform one integrated validation batch after combined source is ready.
Reuse existing source-bound evidence; keep gates intact. Static cold review remains required.

## Exact source state

| Front | Source checkpoint | State |
| --- | --- | --- |
| Shared runtime | `b1cad41dc515eec9dcf474c413da853061894ac1` | Consumed into `relay-next`, `nix-closure`, W6 base |
| Nix consumers | `8b812438bc` | Composed initial consumers, provenance/control/PTY source fixes and strict measurement helper; unvalidated, four hashes stale |
| W6 definition/current step | `d438ef8eab` | Source checkpoint; not closure |
| W6 lifecycle | `b72bfccf25` | Preserved committed lifecycle/Task/provider boundaries; production host wiring unfinished |
| W6 production ports / hashes | `992b4c58ec`, `ee502646c7` | Concrete publication/provenance/approval/completion ports, canonical V3/hash path and scoped durable resume implemented |
| W6 host extraction | `b36b725c10ee16ab04771c63b49132b82d92881b` | Named `maestro/workflow-host.ts` boundary; existing composition preserved, no new layer or waiver |
| Complete upstream base | `ed078a033432ef948a813472b888a9245a244166` | Consumes exact b1-based `01a48f6a22`; registration/result/proposal/seat helpers now present |
| Same-lock settlement adapter | `d2cc5b16bf8bc4c64ce5949021d57d282170d506` | Published, unvalidated; consumed as `2e3c15cd89` in W6 |
| Upstream attribution/V3 | `8f73c045307f06da311ee6f8b1bb6ba378bf265c` | Upstream source-reviewed; consumed as `30ac511984` |
| Upstream verifier | `cc6f5a8f755bb7d765c5d918ecd23180244be006` | Upstream source-reviewed; consumed as `4385c5847d`; background observer extension in progress |
| V1 pilot launcher | `fe3760f621` | Runtime draft, unvalidated, not consumed; prepare-only default, `--run` only after combined readiness |
| Native-product / WSL harness | `f1a4d8c747` / `80f3ebecfc` | Runtime drafts, not integrated or validated |

W6 working branch/worktree: `relay-workflow`, temporary OpenCode work directory.
Nix working branch/worktree: `nix-closure`. Integrator: `relay-next`.

## Exact remaining code blockers

- Background producer and canonical observer extension: final work result captured from
  the actual returned assistant, then referenced durable parent delivery on the exact
  original Task. Preserve settlement through initial-completion and late metadata races.
- Frozen private host-only existing Task metadata contract (upstream ACK
  `msg_11f3590e7001Z4VlhB0nt14OBe`):
  `upstreamSettlement: { parentMessageID, parentCallID, workResult, deliveryMessageID,
  deliveryPartID? }`. Multipart V1 requires the actual part reference. Canonical
  `UpstreamAttribution.V1` does not change. Caller notices, process-local job status,
  timestamps and later `lastAssistant()` reads cannot establish these facts.
- Relay owns producer and narrow existing Task/Session settlement; upstream owns observer.
  Missing/failed/undelivered evidence remains named HOLD until actual closure. No new
  store/event/approval/loop/coordinator/drain identity. Foreground source is not full closure.
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
