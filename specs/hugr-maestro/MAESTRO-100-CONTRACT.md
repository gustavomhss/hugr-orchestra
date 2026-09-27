# Maestro 100 Program Contract

Status: frozen planning contract for GitHub Epic #169. Grounded independent
cold review approved all five facets of M0.1 and M0.2 on 2026-09-26. This
document does not claim implementation or current CI evidence. `ROADMAP.md`
remains the delivery record for existing #106 through #114 scope.

## Objective

Deliver Maestro as an OpenCode-native governed team operating system. Maestro
orchestrates a fixed team, turns approved work into bounded Relay runs, keeps
GitHub Project current, selects sufficient verification efficiently, integrates
only proven work, and recovers honestly from failure.

## Definition of Done

- A source-cited trace matrix maps every named Maestro surface to owner, state
  transition, input, output, authority, evidence, and owning Epic/WP.
- GitHub Project #2 carries only current Maestro program items, with material
  state mapped to actual configured fields.
- M0.4 freezes the file-level conflict map before any implementation WP other
  than controlled M0.3 bootstrap is marked `READY`.
- Independent cold review approves this candidate after all findings resolve.

## Invariants

- Direct user evidence, not model output, is sole authority for governed work.
- Maestro is one conductor; eight specialist seats execute only granted scope.
- A RelayRun resumes only its bound child Session and agent; a missing or
  mismatched Runner is `HOLD`, never a replacement Runner.
- GitHub Project is operational truth and technical receipts prove transitions.
- Unknown, malformed, stale, or unavailable evidence is `HOLD`.

## Quality Standards

- Work is source-cited, parseable, cold-reviewed, mutation-probed where code
  exists, and bounded by the source-size policy.
- Agents receive only decision-free, conflict-free owner paths and compact
  return-card contracts.
- No contract claim is accepted from a historical session handoff alone.

## Completeness Criteria

- Matrix covers lifecycle, team, Relay, Project, verification, source size,
  Atlas, abilities, recovery, and existing #113 scope.
- Every retained legacy Maestro dependency is normalized or explicitly
  superseded by M0.4 before it can enter `READY`.
- Every implementation WP has owner files, integration owner, interface anchor,
  dependencies, checks, and merge order before dispatch.

## Success Criteria

- This contract gives the lead enough fixed decisions to issue disjoint agent
  briefs without handing any architecture choice to an agent.
- Project #2 reports current program state without mixing legacy Atlas backlog.

## Five-Axiom Work Contract

Every Epic, issue, sub-issue, contract, Task, and Work Package MUST carry all
five non-empty sections below before it reaches `READY`, `QUEUED`, or
`DISPATCHED`:

1. **Definition of Done**: observable completion conditions.
2. **Invariants**: properties that must remain true throughout work.
3. **Quality Standards**: required engineering and evidence bar.
4. **Completeness Criteria**: coverage boundary and closure predicate.
5. **Success Criteria**: user or system outcome after integration.

The contract is parsed from explicit delimiters, not inferred from prose. An
absent, empty, malformed, duplicate, or unparseable section is `HOLD`.
Inheritance is allowed only by an explicit versioned reference plus local
delta; a bare statement such as "standard quality applies" is not a contract.

## Bootstrap And Legacy Migration

Issues #169 through #206 are the one-time manual bootstrap record created
before the work-contract validator exists. They carry the five sections in
their bodies, but they do not claim validator evidence. No further Maestro
work item may be created manually after M0.3 is active.

Existing #106 through #114, #25, #42, #49, #62, #72, #86, #94, and #102 are
legacy dependencies. M0.4 must normalize every retained active Maestro item
to the canonical five-axiom form or close it explicitly as superseded before
the item becomes `READY`. A historical body with equivalent prose is not
enough to enter the governed queue.

## M0.3 Bootstrap Exception

M0.3 (#183) is the only Maestro implementation exception before M0.4: it
creates the validator M0.4 requires. Lead may dispatch it sequentially only
after M0.1 and M0.2 records are cold-reviewed, committed, and linked from
Project #2. No other Maestro implementation WP may use this exception.

M0.3 owns exactly these files:

```text
packages/opencode/src/maestro/work-contract.ts
packages/opencode/test/maestro/work-contract.test.ts
```

It exports a pure `validateWorkContract({ kind, body })` seam for `epic`,
`issue`, `sub-issue`, `contract`, `task`, and `work-package` text. Unknown
`kind` is `HOLD(unsupported-kind)`. It normalizes CRLF to LF, then scans lines
outside complete fenced code blocks. A fence opens with a column-zero run of at
least three identical backticks or tildes and closes only with same character
run at least opener length. A canonical delimiter begins at column zero and is
exactly `## ` plus one canonical name with no closing marker or extra text.
The next column-zero Markdown heading of level one or two ends current section.
Section content is its intervening non-blank text; empty content is invalid.
Canonical text in a malformed heading level, quoted/list/indented line, or
fenced block does not satisfy the section and produces `HOLD(malformed-heading)`
when it is only occurrence. Repeated canonical delimiter produces
`HOLD(duplicate-section)`. Missing required delimiter produces
`HOLD(missing-section)`.

Result is `VALID` with all five extracted sections or `HOLD` with stable sorted
reasons from `unsupported-kind`, `missing-section`, `empty-section`,
`malformed-heading`, and `duplicate-section`. It does not register a tool,
mutate GitHub, write Project state, or integrate a readiness writer.

M0.3 tests valid extraction and every rejection class for each of six artifact
kinds. Mutation probes separately remove each rejection guard and corrupt one
kind branch; each must make its targeted
`bun --cwd packages/opencode test --timeout 30000 --only-failures
test/maestro/work-contract.test.ts` case fail, then restore. PR records all
before/after outputs.
`bun --cwd packages/opencode typecheck` is required before review.

Until M4.1 wires Project mutation, lead enforces the validator receipt before
manually moving a non-bootstrap item to `READY`, `QUEUED`, or `DISPATCHED`.
M0.3 itself proves parser capability; it does not falsely claim GitHub
enforcement before that adapter exists.

## CI Health Unblocker

A repository CI-health fix may run before M0.4 only to unblock a required
exact-head verdict. It is not a Maestro implementation exception. Lead must
freeze the affected owner files, interface, checks, and merge order before
dispatch. Every condition below is mandatory:

1. Same required CI job fails on one head and its single bounded retry.
2. Failure target and candidate owner files have current source and CI evidence.
3. Candidate files are disjoint from active Maestro owner files and shared
   integration surfaces.
4. Issue has canonical five-axiom contract and Project records `BLOCKED` with
   named job/issue receipt.
5. Fix adds a focused regression and preserves required full CI.

No CI-health fix may skip a test, increase a timeout, force process exit, waive
a gate, weaken a guard, change Maestro behavior, or open a second retry.
Unknown ownership, interface, cause, or verification is `HOLD`.

#209 is admitted only for lead-owned diagnosis of the Windows
`file HttpApi > serves search endpoints` timeout. It may not receive a code
agent until this exception's owner/interface/check conditions are frozen.

## Core Boundaries

| Boundary     | Core owns                                                   | Must not do                                                                   |
| ------------ | ----------------------------------------------------------- | ----------------------------------------------------------------------------- |
| authority    | lifecycle state, approval binding, grants, policy, receipts | trust model prose or tool output as authority                                 |
| team         | stable roster, routing, grants, independent review boundary | let a seat self-approve, self-review, merge, or expand grants                 |
| Relay        | immutable run/step state, gate result, retry, recovery      | advance because Runner says done                                              |
| GitHub       | operational Project/issue/PR state                          | replace technical receipts or overwrite human scope/priority/cancel decisions |
| verification | required/skipped check plan and exact-SHA evidence          | reduce checks when impact is unknown                                          |
| Atlas        | optional current evidence/context capability                | invent facts, paths, freshness, or use generic fallback retrieval             |
| ability      | discoverable built-in domain capability                     | bypass core authority or mutate external state directly                       |

## Lifecycle

```text
Frame      orient -> admit -> clarify
Ground     resolve scope -> inspect Atlas capability -> assemble context
Contract   draft -> validate -> present -> direct user approval -> revise
Slice      compile immutable Work Packages and Relay runs
Delegate   route seat -> grant tools -> create or resume governed Runner
Verify     gate -> cold review -> CI evidence
Reconcile  compare plan, context, result, Project, PR, and target SHA
Close      merge verification -> provenance -> memory -> outcome
```

Every transition has one durable input set, one durable output event or
receipt, one owning actor, and named `HOLD`, `CANCELLED`, `SUPERSEDED`, and
recovery behavior. A model may propose content; it cannot create authority.

## Source-Cited Trace Matrix

| Surface               | Source anchor                                                                  | From -> event/guard -> to                                                     | Input -> output                                                     | Authority                       | Evidence                                                              | Owner                      |
| --------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------- | --------------------------------------------------------------------- | -------------------------- |
| lifecycle methods     | `specs/hugr-maestro/methods/*.md`                                              | `FRAME/GROUND/CONTRACT` -> validated method event -> next phase or `HOLD`     | durable Session/message/records -> versioned lifecycle event        | core only                       | method acceptance plus EventV2 test                                   | #172 / #185                |
| actor identity        | `actor-identity-contract.md`                                                   | unresolved actor -> canonicalization guard -> identified or `HOLD`            | project, session, member -> canonical actor bytes                   | core only                       | actor collision/cross-project tests                                   | #172                       |
| team roster           | `maestro/packages/core/src/team.ts` V1 reference; `actor-identity-contract.md` | typed WP -> route/grant guard -> seat-bound or `HOLD`                         | WP type and actor -> fixed seat/grants/card                         | conductor routes; core enforces | route/grant/review mutations                                          | #176 / #188-#190           |
| RelayRun              | `relay/SPEC.md` V1 reference; `packages/opencode/src/tool/task.ts`             | `ARMED/RUNNING` -> gate receipt -> `STEP_HELD/STEP_ACCEPTED/COMPLETED`        | immutable run plus bound child Session -> gate receipt and cursor   | host state machine only         | real Task resume seam and Relay integration tests                     | #178 / #181-#182-#179      |
| Project ledger        | GitHub Project #2; #169-#206                                                   | receipt pending -> idempotent adapter mutation -> mapped Stage or `HOLD`      | validated work receipt -> Project field update                      | GitHub adapter only             | GitHub API receipt and exact issue/PR URL                             | #174 / #195-#194           |
| repository delivery   | `packages/opencode/src/tool/task.ts`; git worktree fixture contracts           | planned -> lease guard -> worktree/PR receipt or `HOLD`                       | run/worktree/base SHA -> PR/head SHA receipt                        | repository adapter only         | real git/worktree/PR fixtures                                         | #174 / #193                |
| verification and CI   | `.github/workflows/test.yml`; `script/godfile.ts`                              | head known -> VerificationPlan -> exact-SHA CI verdict or `HOLD`              | base/head/diff/risk -> required/skipped checks and CI receipt       | verifier/CI adapter only        | planner/gate/CI receipt tests                                         | #170 / #191-#192           |
| source size           | `script/godfile.ts`                                                            | changed source -> LOC guard -> target/decision/block                          | source file plus Project size decision -> size receipt or `HOLD`    | Godfile gate only               | band fixtures and real mutation probe                                 | #170 / #196                |
| Atlas context         | `atlas-context-envelope-contract.md`; `own-protocol.md`                        | `ABSENT/BOOTSTRAP/STALE/READY` -> receipt validation -> context or `HOLD`     | capability/snapshot/unit -> verified context or HOLD                | Atlas provider only             | OCE acceptance and freshness tests                                    | #173 / #200-#202           |
| abilities             | `packages/opencode/src/maestro/*`; V1 `tool-registry.ts` reference             | config/grant unknown -> registry check -> available/unavailable               | config/grants -> filtered ability inventory                         | core registry only              | registry/transport parity tests                                       | #175 / #198-#197-#199      |
| recovery              | `SESSION-STATE.md`; Relay state contract                                       | failed receipt -> recovery classifier -> retry/hold/escalate/cancel/supersede | failed receipt -> terminal or recoverable state                     | core only                       | fault injection and replay tests                                      | #171 / #203-#205           |
| existing #113 scope   | `ROADMAP.md`; #113 body                                                        | legacy active -> M0.4 contract audit -> normalized or explicitly superseded   | legacy issue/receipt -> canonical contract state                    | lead then validator             | body parse and dependency audit                                       | #177 / #206                |
| M0 program governance | [#177](https://github.com/gmhelmold/HuGR-Orchestra/issues/177); this contract  | bootstrap `PLANNED` -> M0.1/M0.2/M0.3 receipts -> M0.4 conflict map or `HOLD` | five-axiom issue body plus records -> governed dispatch eligibility | lead until M4.1 adapter         | contract parse, baseline record, validator tests, conflict-map review | #177 / #183-#184-#187-#206 |

The V1 and Relay anchors are behavior references, not imported runtime. Any row
without a current-base proof remains `blocked` in Project #2.

## Team

Maestro is one conductor, not a specialist seat. Team roster contains eight
specialist seats, matching V1 `TEAM` exactly.

| Actor   | memberId  | Role                 | Granted ability class                      | Required return card/evidence                       | Must not do                                           |
| ------- | --------- | -------------------- | ------------------------------------------ | --------------------------------------------------- | ----------------------------------------------------- |
| Maestro | `maestro` | conductor/integrator | lifecycle, routing, reconcile, integration | transition/Project/merge receipt                    | product implementation, self-approval, self-review    |
| Charlie | `charlie` | backend execution    | scoped repository write                    | implementation card, gates, diff receipt            | approve, review own work, merge                       |
| Patty   | `patty`   | frontend execution   | scoped repository write                    | implementation card, sensory evidence, diff receipt | approve, review own work, merge                       |
| Lucy    | `lucy`    | cold review          | read-only artifact review                  | cited APPROVE/FIX_FIRST/REJECT card                 | edit implementation, receive author transcript, merge |
| Bobby   | `bobby`   | architecture         | read-only contract review                  | seam/contract verdict                               | implement product or merge                            |
| Billy   | `billy`   | security             | read-only threat review                    | threat verdict and cited controls                   | implement product or merge                            |
| Jimmy   | `jimmy`   | exploration          | read-only discovery                        | grounded findings card                              | ratify alone or edit product                          |
| Rosie   | `rosie`   | documentation        | scoped docs write                          | docs evidence card                                  | decide product behavior                               |
| Frankie | `frankie` | process audit        | read-only process/ledger audit             | audit verdict                                       | implement product or merge                            |

Roster identity is `memberId`, not display name, model, Task ID, or prompt.
Each seat receives only its current scope, allowed abilities, and return-card
schema. The conductor consumes cards and receipts, not private reasoning.

## RelayRun

A RelayRun is one bounded ordered chain for one compatible Runner, seat,
worktree, and immutable approved revision.

```text
ARMED -> RUNNING -> STEP_HELD | STEP_ACCEPTED
STEP_HELD -> RUNNING | ESCALATED | CANCELLED | SUPERSEDED
STEP_ACCEPTED -> RUNNING | COMPLETED
```

The run binds `planRevisionHash`, `policyHash`, `rosterRevisionHash`,
`baselineSha`, `worktreeId`, optional `atlasSnapshotHash`, `runnerSessionId`,
`runnerAgentId`, `parentSessionId`, and `modelPolicyHash`. A gate result, not
Runner text, moves the cursor. A revision, policy, roster, baseline, context,
Runner, or model-policy change supersedes the run; it never hot-reloads a live
chain.

Initial arm may create exactly one child Session. Every subsequent step and
retry must call Task resume with exact `task_id = runnerSessionId` and exact
bound agent/parent/worktree/model policy. A missing, unknown, or mismatched
task ID is `HOLD`; it must not create a replacement child Session.

OpenCode Task resume is a required seam proof, not an assumption. If it cannot
continue the same child Session with controlled next-step input, the host must
provide an explicit native continuation boundary before Relay implementation.

## GitHub Operational Ledger

GitHub Project is the canonical operational ledger:

```text
Epic -> Capability -> Work Package -> PR -> CI -> Merge -> Close
```

Program Project: <https://github.com/users/gustavomhss/projects/2>.

Use native sub-issues only for independently owned, blocked, reviewed, or
merged work. Relay steps remain technical receipts, not issue spam. Material
GitHub transitions are `PLANNED`, `READY`, `RUNNING`, `BLOCKED`, `REVIEW`,
`CI`, `MERGE_READY`, `CLOSED`, `CANCELLED`, and `SUPERSEDED`.

The Project stores current organization. Durable runtime events, git commits,
and CI artifacts are evidence that proves Project transitions. A GitHub
outage prevents new material state and merge; it does not erase an already
recorded technical receipt. Reconciliation is idempotent and holds on an
unexpected human edit rather than overwriting it.

Human owns priority, scope, cancellation, and direct approval. Maestro owns
derived operational fields, evidence links, and status transitions allowed by
the active contract.

## Project State Mapping

Project configuration receipt dated 2026-09-26 is
`BASELINE-EVIDENCE.md` "Project Configuration Receipt". It records `Status`
field `PVTSSF_lAHODZlCY84BkufizhjeEZQ` and `Stage` field
`PVTSSF_lAHODZlCY84BkufizhjeIiM` with options. Mapping below is frozen M4.1
adapter interface; it is not claim that every current Project item carries
these values:

| Maestro state | Project `Stage` | Project `Status` | Writer                                      |
| ------------- | --------------- | ---------------- | ------------------------------------------- |
| `PLANNED`     | Planned         | Todo             | lead or GitHub adapter                      |
| `READY`       | Ready           | Todo             | GitHub adapter after contract validation    |
| `RUNNING`     | Running         | In Progress      | GitHub adapter after exact dispatch receipt |
| `BLOCKED`     | Blocked         | Todo             | GitHub adapter with named blocker           |
| `REVIEW`      | Review          | In Progress      | GitHub adapter after review request         |
| `CI`          | CI              | In Progress      | GitHub adapter after required CI starts     |
| `MERGE_READY` | Merge Ready     | In Progress      | merge adapter after exact-SHA evidence      |
| `CLOSED`      | Closed          | Done             | merge/reconcile adapter                     |
| `CANCELLED`   | Cancelled       | Done             | lifecycle adapter                           |
| `SUPERSEDED`  | Superseded      | Done             | lifecycle adapter                           |

`Seat`, `Priority`, `Risk`, `CI`, and `Blocked reason` are separate fields.
Project field values are current state, not authority: every Maestro-written
transition carries a stable idempotency key and exact receipt link. Human edits
to Priority, scope/body, cancellation, or an adapter-owned field with an
unexpected revision cause `HOLD` and reconciliation rather than overwrite.

## Verification And CI

Maestro compiles a `VerificationPlan` from exact base/head SHA, changed paths,
known package ownership, risk policy, workflow/gate changes, and Atlas impact.

| Change class                            | Minimum verification                          |
| --------------------------------------- | --------------------------------------------- |
| docs only                               | documentation/contract guards                 |
| known package                           | affected package plus reverse dependencies    |
| workflow or gate                        | changed guard plus workflow validation        |
| API, persistence, security, concurrency | expanded integration/platform/security checks |
| unknown impact                          | expanded verification                         |

Every skipped check has a machine-readable reason. Every required check has a
receipt for exact head SHA. CI cancellation applies only to superseded PR
heads; merge-queue and release runs are not casually cancelled. Retry is
bounded and classified as code failure, infrastructure failure, or stall.

## Source Size Policy

Source includes implementation and test files. Markdown documentation is
excluded. LOC is non-blank physical lines, including comments, so formatting
cannot game the measure.

| Band    | Requirement                                                        |
| ------- | ------------------------------------------------------------------ |
| <=400   | normal target                                                      |
| 401-600 | Maestro records size decision on WP/PR                             |
| 601-700 | Maestro records architecture exception; Bobby and Lucy review seam |
| >700    | owned source blocks until split/refactor                           |

Generated and vendor source require declared origin and regeneration evidence;
they are not a generic waiver. Pre-existing over-cap files may not grow and
must have a shrinking legacy record. The gate fails when source discovery or
required decision extraction is empty or malformed.

## Atlas Capability

```text
ABSENT -> BOOTSTRAP -> READY
                    -> STALE -> BOOTSTRAP | HOLD
```

`ABSENT` supports normal OpenCode work and explicit bootstrap, but not
grounded dispatch. `READY` requires current verified catalog/Own receipts.
`STALE`, missing, malformed, under-approximate, ambiguous, or cross-project
context is `HOLD`. Maestro consumes static verified Own context through an
installed read-only boundary and never imports vendored Atlas implementation
or substitutes generic retrieval.

## Atlas State Glossary

| Term        | Layer                        | Meaning                                                                  | Dispatch result                                            |
| ----------- | ---------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------- |
| `ABSENT`    | Maestro capability           | no Atlas provider/configuration exists                                   | normal ungrounded work allowed; grounded work unavailable  |
| `BOOTSTRAP` | Maestro capability           | explicit Atlas initialization or rematerialization is running            | HOLD grounded dispatch                                     |
| `READY`     | Maestro capability           | provider, snapshot, catalog, and requested static Own receipts verify    | eligible for grounded planning, never automatic dispatch   |
| `STALE`     | Maestro capability           | previously valid evidence/snapshot no longer verifies                    | HOLD grounded dispatch                                     |
| `UN-SEEDED` | Atlas orientation facet only | explicit provider declaration that a named orientation facet has no seed | never means context ready or permission to infer ownership |
| `HOLD`      | Maestro lifecycle outcome    | proof is missing, malformed, ambiguous, incomplete, or unauthorized      | no child Task or fallback retrieval                        |

Empty, missing, or malformed Own data is never `UN-SEEDED`; it is `HOLD`.
`UN-SEEDED` must come from an explicit provider receipt and does not authorize
grounded dispatch.

## V1 To V2 Glossary

`v1-portability-register.md` is the source for this crosswalk. A V1 artifact
may guide behavior or test cases; it is never a V2 runtime dependency.

| V1 term                     | V2 term                                                | V2 decision                                                                            |
| --------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `TEAM` / named fleet        | conductor plus eight specialist roster entries         | preserve fixed roles and stable IDs in M3; do not port Claude agent files as authority |
| Runner                      | `RelayRun` bound to one OpenCode child Session         | preserve continuous context only through proven Task resume; otherwise `HOLD`          |
| Relay hook / `SubagentStop` | native Relay execution adapter                         | host evaluates gate and resumes exact child Session; no Claude hook runtime dependency |
| Gate / DoD chain            | versioned gate receipt                                 | preserve external mechanical oracle and retry bound; Runner prose never advances state |
| `ToolRegistry`              | internal Ability registry plus scoped tool projection  | preserve one discoverable registry; do not expose flat V1 tool catalog to every seat   |
| `.maestro` files and JSONL  | EventV2 records plus typed receipts                    | retain portable evidence semantics; no V1 file store as authority                      |
| V1 internal Atlas           | optional Atlas capability provider/static Own boundary | no direct vendor import; `ABSENT` remains supported                                    |
| Claude plugin hooks         | OpenCode lifecycle/Task/Tool adapters                  | hooks are compatibility adapter behavior, not V2 core architecture                     |

## Internal Abilities

Start with built-in abilities, not an external marketplace:

```text
repository, github, tests, ci, relay, atlas
```

An ability declares only `id`, summary, required configuration, allowed seats,
and tools. The core derives availability from real configuration and health.
An ability proposes operations through the core; only core adapters execute
repository, GitHub, CI, Task, or Atlas effects. CLI and MCP expose the same
small filtered inventory. Do not build a graph database, custom web navigator,
third-party sandbox, or plugin marketplace until multiple built-in abilities
prove a common missing seam.

## Program Trace

| Epic    | Owns                                              | Depends on                | Initial child WPs              |
| ------- | ------------------------------------------------- | ------------------------- | ------------------------------ |
| #177 M0 | program contract, baseline, five-axiom validation | none                      | #184, #187, #183               |
| #178 M1 | Task resume proof and RelayRun                    | M0                        | #181, #182, #179               |
| #172 M2 | durable lifecycle and authority                   | M0, M1 for Relay dispatch | #185, #186, #180               |
| #176 M3 | eight-seat roster, grants, review boundary        | M0, M2                    | #188, #189, #190               |
| #174 M4 | Project ledger and repository operations          | M0                        | #195, #194, #193               |
| #170 M5 | tests, CI, LOC policy                             | M0, M4 for reporting      | #191, #192, #196               |
| #175 M6 | internal abilities and discovery                  | M0, M2                    | #198, #197, #199               |
| #173 M7 | Atlas modes and context                           | M0, M2, M6, #94           | #200, #201, #202               |
| #171 M8 | recovery, security, release proof                 | M1-M7                     | #203, #204, #205               |
| #113    | existing durable plan and Atlas context scope     | existing DAG              | #106-#114 and linked hardening |

M0 additionally owns #206, which normalizes legacy work and freezes the first
file-level conflict map after M0.1, M0.2, and M0.3 complete.

## Conflict Map Rule

An implementation WP other than controlled M0.3 or ratified CI-health
unblocker is not dispatchable until M0.4 records all of:

```text
owner files
shared files and their single integration owner
frozen interface anchor
base SHA
dependency IDs
pairwise conflict verdict
required checks
merge order
```

`different directory` alone is not a conflict-free proof. A shared manifest,
registry, workflow, generated output, barrel, event schema, or session-state
file makes WPs sequential unless the lead creates one explicit integration WP.

## Wave Rules

1. Lead freezes shared contracts, interfaces, and conflict map before dispatch.
2. Each agent gets one WP with disjoint owner files and a compact return card.
3. Shared manifests, registry, CI workflow, generated output, and session
   state are lead-only integration files unless a contract explicitly assigns
   them to one sequential WP.
4. Agents open PRs and stop. They never merge or widen scope.
5. Lead cold-reviews every diff, mutation-probes claimed protections, runs
   required checks, and records GitHub Project evidence before integration.
6. A blocked prerequisite prevents dispatch, not planning. No agent receives a
   live architecture choice to resolve.

## First Execution Wave

| WP        | Owner                             | Status  | Reason                                                                  |
| --------- | --------------------------------- | ------- | ----------------------------------------------------------------------- |
| #184 M0.1 | lead                              | review  | contract source and evidence commit/PR pending                          |
| #187 M0.2 | Jimmy-style read-only research    | review  | evidence record accepted; commit/PR pending                             |
| #183 M0.3 | Charlie-style pure parser         | blocked | wait for M0.1/M0.2 commit plus bootstrap packet                         |
| #181 M1.1 | Charlie-style focused test        | blocked | needs current baseline evidence from #187                               |
| #182 M1.2 | Charlie-style pure model          | blocked | needs exact Relay contract from #184                                    |
| #185 M2.1 | Charlie-style schema/fold         | blocked | needs lifecycle transition table from #184                              |
| #195 M4.1 | Frankie-style configuration audit | blocked | needs GitHub Project credential and field census                        |
| #191 M5.1 | Charlie-style pure planner        | blocked | needs risk/verification contract from #184                              |
| #198 M6.1 | Charlie-style pure registry       | blocked | needs ability boundary from #184                                        |
| #200 M7.1 | Charlie-style pure provider       | blocked | needs Atlas mode contract from #184                                     |
| #206 M0.4 | lead                              | blocked | normalizes legacy items and freezes conflict map after #184, #187, #183 |

No implementation agent is dispatched until its row changes from `blocked` to
`ready` through a lead-owned contract update.
