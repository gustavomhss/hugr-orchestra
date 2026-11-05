---
name: maestro-orchestra-tools-arsenal
description: What the Maestro Arsenal is, how to call it (catalog, describe, execute), and what each operator computes.
internal: true
when: Planning or decomposing work, mapping conflicts between work packages, checking a plan, ordering merges, arming a completion contract, or answering what the Arsenal does.
not-when: Writing the plan itself (that is `archie`'s job) or running code and tests (use bash and the build seats).
covers: [modules/maestro/arsenal]
---

# Maestro Arsenal

A catalog of bounded, schema-validated operators for planning and governing work. Each declares effects from `read`, `write`, `process`. Results are advice: they are not approval, not execution receipts, and never grant permission. Host permissions apply to every call.

## How to call

Three native tools (packages/core/src/tool/maestro-arsenal.ts), always in this order:

| Tool | Input | Returns |
| --- | --- | --- |
| `maestro_arsenal_catalog` | optional `group` (`pure`, `read`, `write`, `process`), `offset`, `limit` 1-10 | a page of names and descriptions, no schemas |
| `maestro_arsenal_describe` | `name` | the exact input schema and declared effects |
| `maestro_arsenal_execute` | `name`, `arguments` | the result; arguments must match the described schema |

Never pass host roots or permissions in `arguments`; the host supplies the project directory, state directory and project id. State lives outside the repository under `<stateDirectory>/<projectID>`. Governance observations, usage and pricing come only from the host. Maestro and `archie` hold these tools; the `archie` floor is limited to the pure authoring operations.

## Operators (26)

Plan authoring, pure (no effects):

| Operator | Computes |
| --- | --- |
| `contract-freezer` | canonical set of declared surfaces plus a deterministic drift id |
| `anchor-gen` | exact shared-surface anchor text for a work package from a frozen contract |
| `stub-gen` | TypeScript scaffold text for a contract; never writes files |
| `seam-checker` | compares supplied signatures with the frozen contract |
| `conflict-map` | separates range-aware write conflicts from write-to-read dependencies; supplied layers may sequence conflicts |
| `plan-check` | validates acceptance ownership, dangling or orphan work, atomicity and write partition; does not run tests |
| `plan-compiler` | assembles symbol conservation, helper relocation, imports, cycles and drift hash from supplied edges |
| `plan-to-dag` | dependency layers, provider first, with cycle diagnostics |
| `plan-to-briefs` | bounded per-slice dispatch packets from a plan |
| `plan-to-gates` | proposes scope, contract and completion checks for host binding; never runs them |
| `plan-to-policy` | proposes scoped write resources; host permissions stay the authority |
| `plan-to-barrel` | re-export source proposal and frozen-surface parity report; does not write |
| `enrich-plan` | attaches dispatch metadata without changing plan structure or drift hash |
| `context-packer` | bounded structured brief: baseline, exact targets, rules, checks, return shape |
| `sliceability` | measures connected-component collapse under hub lifting; decomposition advice |

Repository acquisition (read, some with process):

| Operator | Effects | Computes |
| --- | --- | --- |
| `repo-mapper` | read | bounded path, size and LOC map with pagination and named coverage gaps |
| `move-in` | read, process | scan, tree-sitter extraction and PageRank map, or reader fallback; returns bounded briefs without model calls; optional absorb or persist of advisory results |
| `decompose` | read, process, write | proposes a partition, extracts edges with the compiler, assembles a plan, verifies it against the real project baseline; writes only on an explicit materialize request and refuses overwrites |
| `symbol-flow-check` | read, process | compiles the actual union of work packages and reports undeclared cross-package symbol flows |
| `brief-usage-check` | read, process | rejects declared but unavailable plan symbols and compiler-proven unused declarations |
| `repo-hygiene-check` | read, process | read-only git and filesystem hygiene facts; failures stay unknown, clean is tri-state |

Governance (host evidence):

| Operator | Effects | Computes |
| --- | --- | --- |
| `wave-scheduler` | none | replays readiness and gives one serial DAG merge recommendation; never dispatches or merges |
| `wave-ledger` | read, write | wave outcome evidence, predicted versus actual totals, barrier tax, explicit compaction receipts |
| `relay-arm` | read, write | actions `arm`, `read`, `release`: arms a completion contract for the next native Task, reads one, or asks the owner to release a parked arm (release succeeds only when the owner approves) |
| `profile` | read, write | reads or updates project governance preferences; preferences never grant permission |
| `governance` | read, write, process | scoped repository governance operations and explicit authorized operator actions (release recipe, ruleset, changelog write); supplied captures are advice and compiled host checks own completion authority |

`relay-arm` order matters: arm first, then dispatch that Task. A workflow Task dispatched without an arm holds `WORKFLOW_NATIVE_ARM_UNBOUND`; arming after a workflow Task is bound in the Session is refused. For a workflow Task, arm only `sessionID` and a label naming it, with no chain: the host arms the approved plan's own checks. An ordinary Task's arm needs its chain.

## Using it well

- Describe before execute; the schema is exact and extra fields fail.
- Plan checks (`plan-check`, `conflict-map`, `symbol-flow-check`, `plan-to-dag`) are cheap; run them before dispatching parallel work, not after a collision.
- A repository too large to read goes through `repo-mapper` first, then `move-in`.
- `process` operators request process authority from the host and can be refused; report the refusal.
- Pattern characters (`*`, `?`) in write sets are unresolved and hold until expanded via `repo-mapper`.

## `modules/maestro/arsenal`

Package `@orchestra/maestro-arsenal`. `src/registry.ts` holds static descriptors; handlers in `src/tools/<name>.ts` load lazily when a tool runs. Engine descriptors are in `src/engine`, governance in `src/governance`, repository onboarding in `src/onboard` (tree-sitter with a parser worker). `modules/maestro/coordination` supplies host observations and native bindings. It also ships a standalone stdio MCP adapter (`src/server.ts`) that takes `--directory`, `--state-directory`, `--project-id` and repeated `--allow read|write|process`, with no implicit grants. The module owns no Session execution, model permissions or completion evaluator.
