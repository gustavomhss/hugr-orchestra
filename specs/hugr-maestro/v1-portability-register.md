# HuGR Maestro V2: V1 Portability Register

Status: historic evidence register, measured 2026-09-07. Named V1 source paths are absent from this checkout, so rows
remain source pointers plus reported test results, not re-verified local-source evidence. `PORT CONCEPT` preserves a
guarantee, never V1 transport/API by default. V1's internal `atlas/` subsystem predates current Atlas foundation; its
behavior is never evidence of a current Atlas seam.

## Measured Suites

```text
npm test -- --run packages/core/test/gate/approval.test.ts \
  packages/core/test/cli/approve-plan.test.ts \
  packages/core/test/campaign.test.ts \
  packages/core/test/ax-genesis-contract.test.ts

4 files, 41 tests passed
```

```text
npm test -- --run packages/core/test/plan-check.test.ts \
  packages/core/test/compile.test.ts \
  packages/core/test/campaign-driver.e2e.test.ts

3 files, 31 tests passed
```

```text
npm test -- --run packages/core/test/atlas/pack.test.ts \
  packages/core/test/organs/context-packer.test.ts

2 files, 19 tests passed
```

## Register

| V1 capability                                                                                                                          | Exact V1 evidence                                                                                        | V2 verdict                                                 | V2 consumer                                                       |
| -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------- |
| Pure goal capture preserves prose; explicit valid acceptance is required                                                               | `packages/core/src/tools/genesis.ts`; `ax-genesis-contract.test.ts`                                      | PORT CONCEPT                                               | `admit-request`, `clarify-decision`                               |
| Non-interactive campaign start synthesizes conservative acceptance from goal prose                                                     | `packages/core/src/campaign-driver.ts`; `campaign-driver.e2e.test.ts`                                    | DISCARD                                                    | none; violates R4                                                 |
| Typed plan manifest records spec, tests, scenarios, scope, dependencies, gates, return shape, and task contract                        | `packages/core/src/plan.ts`; `compile.test.ts`, `plan-check.test.ts`                                     | PORT CONCEPT                                               | `draft-plan`, `validate-plan`, later `freeze-work-contract`       |
| Plan compiler refuses missing/overlapping scope, orphan tests, illegal DAG, invalid anchors, and under-decided work                    | `packages/core/src/plan-check.ts`; `plan-check.test.ts`                                                  | PORT CONCEPT                                               | `validate-plan`, later decomposition/freeze methods               |
| Lifecycle is durable events plus pure projection; illegal transitions remain visible issues                                            | `packages/core/src/campaign.ts`, `campaign-driver.ts`; `campaign.test.ts`, `campaign-driver.e2e.test.ts` | PORT CONCEPT                                               | all lifecycle methods                                             |
| Replan transitions to `REPLAN`; only later approval returns lifecycle to `APPROVED`                                                    | `packages/core/src/campaign.ts`; `campaign.test.ts`                                                      | PORT CONCEPT                                               | `revise-plan`, `request-approval`                                 |
| Approval signs exact `{waveId, baselineSha, planAddress, nonce}` with Ed25519 DSSE/PAE and dispatch rechecks exact binding fail-closed | `packages/core/src/gate/approval.ts`; `gate/approval.test.ts`, `cli/approve-plan.test.ts`                | PORT CONCEPT                                               | `request-approval`, later `dispatch-work`                         |
| Local `.maestro/owner.key`, JSONL log, CLI, hooks, and transcript transport implement V1 lifecycle                                     | `cli/approve-plan.ts`, `campaign-driver.ts`                                                              | REDESIGN                                                   | native OpenCode Session/Task/event seams                          |
| V1 internal territory pack is content-addressed, marks drifted source stale, and never exceeds 2K estimated tokens                     | `packages/core/src/atlas/pack.ts`; `atlas/pack.test.ts`                                                  | REFERENCE ONLY; map against current Atlas foundation first | none yet                                                          |
| V1 internal dispatch pack is bounded before delivery and quarantines untrusted seat memory                                             | `packages/core/src/tools/context-packer.ts`; `organs/context-packer.test.ts`                             | REFERENCE ONLY; map against current Atlas foundation first | none yet                                                          |
| Context threshold ledger records token-cap crossings                                                                                   | `packages/core/src/context-ledger.ts`                                                                    | PORT CONCEPT                                               | later context/resource recovery, not `assemble-context` grounding |

## V2 Use Rule

1. Copy V1 invariant and negative proof where row says `PORT CONCEPT`.
2. Reimplement only through native OpenCode/Atlas seams proven from their current source and tests.
3. Never treat V1 internal `atlas/` types, pack protocol, store, or tests as current Atlas foundation contract.
4. Never import V1 `.maestro` storage, hooks, CLI, or local owner-key lifecycle as V2 architecture.
5. A detailed V2 method seeking ratification cites a relevant row, or records `UNRESOLVED`/`REDESIGN` explicitly.
