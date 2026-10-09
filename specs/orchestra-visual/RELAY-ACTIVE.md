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
| Nix consumers | `2796d6311efd373bfd36f5f394bf417a6eec9aaa` | Published, unvalidated; four dependency hashes stale, measurements pending |
| W6 definition/current step | `d438ef8eab` | Source checkpoint; not closure |
| W6 lifecycle | `b72bfccf25` | Preserved committed lifecycle/Task/provider boundaries; production host wiring unfinished |
| Same-lock settlement adapter | `d2cc5b16bf8bc4c64ce5949021d57d282170d506` | Published, unvalidated; consumed as `2e3c15cd89` in W6 |
| Upstream attribution/V3 | `8f73c045307f06da311ee6f8b1bb6ba378bf265c` | Upstream source-reviewed; consumed as `30ac511984` |
| Upstream verifier | `cc6f5a8f755bb7d765c5d918ecd23180244be006` | Upstream source-reviewed; consumed as `4385c5847d`; earlier registration/result helpers still needed |
| V1 pilot launcher | `fe3760f621` | Runtime draft, unvalidated, not consumed; prepare-only default, `--run` only after combined readiness |
| Native-product / WSL harness | `f1a4d8c747` / `80f3ebecfc` | Runtime drafts, not integrated or validated |

W6 working branch/worktree: `relay-workflow`, temporary OpenCode work directory.
Nix working branch/worktree: `nix-closure`. Integrator: `relay-next`.

## Exact remaining code blockers

- Concrete trusted publication/verifier/current revision/approved scope/global completion
  host composition; default undefined ports are not implementation closure.
- V3 producer/reader/hash integration using upstream's canonical DTO and verifier.
- Existing Task hash/presentation/reservation must cover workflow binding, parameters and
  actual write paths. Narrow adjacent sites: `task-hash.ts`, `tool/maestro-plan.ts`,
  `tool/maestro-approval.ts`, `governed-task-reservation.ts`.
- Consume reviewed upstream registration, `UpstreamResult`, `UpstreamProposal`, Seats and
  result assembly base; do not invent substitutes for missing verifier dependencies.
- Reconcile bound Session resume/delivery and exact assistant settlement in existing
  serialized ownership. No second loop, evaluator, coordinator, inbox or drain identity.
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
