# I2: Maestro playbooks and Arsenal

Status: research note, read-only pass. No tests, typecheck or builds were run. Claims are cited as `path:line` or commit sha. Lines marked **Inference** are my reading, not observed fact.

## Scope and baseline

- Worktree: `modules/maestro/...` paths below are relative to `.claude/worktrees/maestro-orchestration-skills-e8a06d`. HEAD `de5cc963c6`, branch `claude/maestro-orchestration-skills-e8a06d`, default branch `dev` (gitStatus at session start).
- Playbook tree: 11 `SKILL.md` files, 46,020 bytes total (sum of `wc -c` over `modules/maestro/coordination/playbooks`). Four declared roots: `frame-request`, `maestro-plan`, `maestro-run`, `maestro-repo` (`modules/maestro/coordination/src/playbook-content.ts:6-17`).
- Arsenal: 27 files in `modules/maestro/arsenal/src/tools/`. Of these, 26 are registered operation names (`modules/maestro/arsenal/src/registry.ts:21-42`). `tools/conflict-semantics.ts` is a helper. The `governance` name covers 28 operations (`modules/maestro/arsenal/src/governance/descriptors.ts:38-63`).
- Seat trees compared: `modules/specialists/backend/skills` (60 `SKILL.md`, 7 roots, 53 non-root nodes) and `modules/specialists/archie/skills` (8 `SKILL.md`, 2 roots). Shared `team-stack` tree: 18 `SKILL.md` (`modules/specialists/team/skills`).
- Git decisions read: `4522451d9b` (group playbooks into a skill tree, 2026-10-27), `37abd465e1` (keep only orchestration in the playbooks, 2026-10-28, 15 files, +58/-456), `c317fd7740` (move from `apps/orchestra`), `2535c3d2d7` (delete V1 app), `35996aba6b` and `d07ac94222` (arsenal checkpoints).

### How playbooks are loaded and gated (fact)

- Shipped inventory is hard-coded: `playbook-content.ts:8-17` lists every file; `validate` at `:19-23` throws unless the tree equals that list exactly. Adding a node therefore edits this file as well as the tree. The spec says the tree rules replace hand-kept lists (`docs/specs/seat-framework/skill-tree.md:226-228`), so this is a second source of truth.
- Tree rules (`modules/maestro/coordination/src/seat-skill-content.ts`): roots must be declared (`:38-52`); depth at most 3 below a root (`:78`); at most 10 children (`:79`); non-root nodes need non-blank `when` and `not-when` (`:82-93`); links must stay inside their node (`:95-109`). `description` is optional in the validator (`:74`), although the spec requires it on every node (`skill-tree.md:25`). The spec also requires each child's description to name a trigger (`skill-tree.md:41`); the validator does not check that.
- Registration: `modules/maestro/coordination/src/v2/skill-sources.ts:13-16` registers playbooks first; `:43-46` denies every other agent every playbook name plus `name-*`, so children are covered. `v2/seats.ts:221` `visibility(id)` applies this to all non-default agents; Maestro is `AgentV2.defaultID` = `"maestro"` (`packages/core/src/agent.ts:11`).
- Prompt pointers: Maestro's prompt names the playbooks and says to open one branch at a time (`packages/core/src/agent/prompt/maestro.txt:86`). It says governed work loads `maestro-run-governed` before the first governed tool call (`:83`).

### Derivation of the playbook tree (fact)

- `37abd465e1` deleted `maestro-composer`, `maestro-plan/decompose`, `decompose/suite-review`, `maestro-plan/contract`, `maestro-plan/pack` (456 deletions). Commit message: the decompose, contract and pack children "repeated authoring that archie's tree already holds"; the composer described the V1 plugin that no longer exists.
- Before that commit, the `maestro-plan` description was "Plan work before dispatch: acceptance coverage and decomposition, shared contracts, and briefs" (`git show 37abd465e1 -- .../maestro-plan/SKILL.md`). That was Maestro-authored planning; the commit removed it.
- `4522451d9b` grouped playbooks into three trees and made companion pages nodes with their own frontmatter. Its diff touched `archie` skills and `maestro.txt`, so the Maestro/archie split was made in one step.
- `skill-tree.md:3` still reads "Status: proposal, waiting for the owner's approval. No code changes until it is approved." The code has landed (`4522451d9b`, `37abd465e1`). **Fact**: the spec status is stale.

## Playbook inventory

Size is bytes / lines from `wc`. "Applies to normal work" is my reading of each file's trigger text. "Craft" means it teaches how a lead thinks or decides. "Ceremony" means governed, approval, ledger, or tool choreography.

| Playbook (path under `modules/maestro/coordination/playbooks/`) | Size | Trigger (frontmatter) | Teaches craft | Teaches ceremony | Applies to normal work? | Overlap / contradiction |
| --- | --- | --- | --- | --- | --- | --- |
| `frame-request/SKILL.md` (root, no `when`) | 3,501 / 66 | desc `:3`: "governed intake or when active work makes request intent ambiguous" | `:16-21` orient vs work; known facts vs proposals; one blocker only | JSON contract `:26-47`, runtime gate `:49-58`, admission tool | No, per `maestro.txt:86` (governed intake only). The description `:3` is broader than the prompt. | Example proposal "Draft settings scope before implementation" `:38` conflicts with purpose "without ... scope selection" `:8`. |
| `maestro-plan/SKILL.md` (root, 1 leaf by spec) | 2,739 / 50 | "substantial or multi-part work before dispatch; small tasks stay lightweight" | Hand archie facts, not conclusions (`:14-16`); cold coverage review with a verbatim-demand template `:20-32`; adopt-or-return with FAIL/HOLD/UNKNOWN `:39-49` | Governed card headings `:44-46` (only as presentation) | Yes for substantial work. Only playbook that is squarely Maestro's job. | Consistent with `maestro.txt:38,44`. The headings it requires are the ones the governed step 7 asks Maestro to write itself (see Gaps). |
| `maestro-run/SKILL.md` (root router) | 291 / 8 | desc: "Use once work is ready to dispatch or has come back" | none; router text `:8` | none | Router only | Relies on the generated "Next level" index (`skill-tree.md:31`; `packages/core/src/tool/skill.ts:42`). |
| `maestro-run/loop/SKILL.md` ("maestro-run-loop") | 7,141 / 99 | when: "Slices and briefs exist: dependent execution, failed handoffs or selective recovery" `:4`; not-when `:5` | Normal path `:13` (inspect, edit, verify). Integration order: low blast radius first, serial, union for append-only `:46-49`. No barrier for waiting `:33-34`. Unexpected forks return to lead `:15`. Record predicted vs observed effort `:54-56`. | wave-scheduler, wave-ledger, relay-arm, preflight `:58-69`; receipt-state rules `:38-41`; output schema `:92-99` | Only when slices and briefs exist. The `not-when` is correct. | Scaffolding by Maestro `:26-27` conflicts with archie-owned contracts (see Gaps). Names `stub-gen` and `plan-to-barrel` `:26-27,62`. |
| `maestro-run/governed/SKILL.md` ("maestro-run-governed") | 10,320 / 126 | when: owner asks for a governed or auditable flow `:4`; not-when: normal work `:5` | Evidence discipline: copy IDs, never guess `:14-16`; re-check before dispatch; "Never" list `:116-117` | Almost all: 14 steps `:32-83`, error table `:96-108`, output block `:121-126`. Largest file (22% of playbook bytes). | No. Correct gating by `maestro.txt:83`. | Step 4 `:38` lets Maestro record a Maestro-authored plan revision. Step 7 `:42-44` has Maestro write the work card and dispatch brief. Both conflict with `maestro.txt:44,80` and `maestro-plan:44-46`. |
| `maestro-run/verify/SKILL.md` ("maestro-run-verify") | 6,035 / 95 | when: completion claims, independent review, PR review, pre-integration `:4`; not-when: nothing returned `:5` | Author report is a pointer, not evidence `:13-14`; prove test teeth by planted defect `:31-33`; calibrate absence claims against a positive control `:33`; one green cell cannot hide another `:40`; off-baseline work is HOLD (`loop:44-45`) | Operation table `:53-60`; git commands `:62-68`; output schema `:87-93` | Yes for completion claims. Procedure steps 1-3 are normal craft; the L0-L10/V1-V4 matrix is ceremony for small changes. | Verification role is correct per `maestro.txt:35` ("verification of its proposal"). Operation list names archie-owned checks such as `contract-freezer`, `seam-checker`, `plan-check`, `brief-usage-check`. |
| `maestro-run/verify/review-checks/SKILL.md` | 3,041 / 44 | when: change-scoped review matrix `:4` | L0-L10 levels `:12-24`; V1-V3 checklists `:26-38`; V4 intent-story `:40-41` | Matrix itself | Only for substantial reviews. | **Stale**: line 44 says "Coverage critique belongs to decompose" (the `decompose` playbook was deleted in `37abd465e1`; coverage critique is now `maestro-plan:20-32`). Line 43 names `reviewer-brief.md`; the file is `maintenance/reviewer-brief/SKILL.md`. |
| `maestro-repo/SKILL.md` (root router) | 323 / 8 | desc: "before an authorized branch, PR, release or tag; grants no publication authority" | none | none | Router only | none |
| `maestro-repo/maintenance/SKILL.md` ("maestro-repo-maintenance") | 6,458 / 99 | when: before an authorized branch, PR, integration, release or tag; drift `:3-4` | Inspect before acting; distinguish user work from strays `:25-26`; proportionate verification `:12-13`; destructive/bypass refusal list `:75-82` | Git/PR/release recipe `:58-68`, output schema `:94-99` | Partly: the refusal list and inspection steps apply to any commit. PR and release steps apply only when authorized. | Provenance leak: "Source TechLead scripts/hooks" `:14` and "Do not copy absent `release.sh`... from TechLead" `:46`. |
| `maestro-repo/maintenance/reviewer-brief/SKILL.md` | 1,691 / 29 | when: briefing an independent cold code reviewer on a bounded diff `:4`; not-when: reviewing acceptance coverage `:5` | Brief template with SCOPE/SPEC/DIFF/CHECK/RETURN `:13-23`; do not share author transcript `:10`; praise is not evidence `:28` | Template only | When an independent review is used. | Consistent with `maestro-plan:20-24` (demand-only cold review). |
| `maestro-repo/arsenal-operators/SKILL.md` | 4,480 / 33 | when: operator explicitly asks to adopt a release, ruleset or scoped policy proposal `:4` | Proposal is not authority `:18`; bind exact remote and operation `:22`; deny-by-default for policy self-rewrite `:24` | Operator protocol, catalog, describe, execute, native bash `:10-34` | No. Correctly gated. | Line 33 invites Maestro to "select their exact library descriptor" for "compiler/decomposition, contracts, bounded briefs" (authoring) without naming the archie boundary. |

Totals (fact, from `wc`): governance- or ceremony-heavy files `governed + arsenal-operators + verify + review-checks + maintenance` = 30,334 bytes (66% of 46,020). Adding `loop` (wave, ledger, relay) = 37,475 bytes (81%). Craft-first files (`maestro-plan`, `frame-request`, `reviewer-brief`) = 7,931 bytes (17%). **Inference**: the playbooks teach Maestro more about gates and receipts than about leading.

## Arsenal inventory

Columns: **Class** is my role classification against `maestro.txt:35,38` and archie's boundary (`archie-plan/SKILL.md:37-39`). **Reach** is from `v2/seats.ts:207` plus `packages/core/src/tool/upstream-arsenal.ts:7-21`: Maestro (`nativeMaestro`, `core/src/tool/maestro-arsenal.ts:617-620`) gets all; archie gets only the 13 listed "authoring" operations. **Playbook** is what grep found in `playbooks/`. **Test** is what grep found in `modules/maestro/arsenal/test`, `packages/core/test`, `modules/maestro/coordination/test` (grep counts, not a confirmation that every positive path runs).

| # | Tool (file) | One-line function (cite) | Class | Reach | Playbook | Test evidence | Flag |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `anchor-gen` | Exact shared-surface anchor for a dependent WP from a frozen Contract (`registry.ts:22`) | Authoring (contract) | Maestro + archie | none | registry, pure, upstream-arsenal; 2 execute calls | Archie's job (`archie-plan/load-bearing-contracts`) |
| 2 | `conflict-map` | Write conflicts vs write-to-read deps, range-aware (`registry.ts:23`) | Planning analysis / scheduling | Maestro + archie | none | 6 files, 5 run calls | `maestro.txt:35` lists "conflict maps" under Maestro's use |
| 3 | `context-packer` | Compose a bounded dispatch brief (`registry.ts:24`) | Authoring (briefs) | Maestro + archie | none | pure.test:200-205 | Brief writing is archie's (`archie-plan/briefs`) |
| 4 | `contract-freezer` | Canonicalize surfaces, stamp a drift id (`registry.ts:25`) | Authoring (freeze) / verification | Maestro + archie | verify:56 | 11 execute calls | Freezing a contract is authorship; verify uses it as a check |
| 5 | `enrich-plan` | Attach dispatch metadata without changing a frozen plan (`registry.ts:26`) | Planning | Maestro + archie | none | 3 execute calls | Planning |
| 6 | `plan-check` | Acceptance ownership, orphan work, write partition; no test run (`registry.ts:27`) | Verification of archie's plan | Maestro + archie | verify:55 | 5 run calls | Allowed by `maestro.txt:35` |
| 7 | `plan-compiler` | Symbol conservation, imports, cycles, drift hash from supplied edges (`registry.ts:28`) | Planning (decomposition) | Maestro + archie | none | 1 run call | Planning |
| 8 | `plan-to-barrel` | Re-export source proposal, parity report; does not write (`registry.ts:29`) | Authoring (source) | Maestro only* | loop:62 | pure.test:165 | Source generation in Maestro's loop |
| 9 | `plan-to-briefs` | Per-slice dispatch packets from a Plan (`registry.ts:30`) | Authoring (briefs) | Maestro + archie | none | 2 execute calls | Archie's briefs |
| 10 | `plan-to-dag` | Provider-first dependency layers, cycle diagnostics (`registry.ts:31`) | Orchestration (scheduling) | Maestro + archie | loop:62 | 5 execute calls | Correct use |
| 11 | `plan-to-gates` | Proposed scope, contract and completion checks (`registry.ts:32`) | Verification proposal | Maestro + archie | verify:59; maintenance | 2 run calls | Correct: "never executes or certifies" |
| 12 | `plan-to-policy` | Proposed scoped write resources (`registry.ts:33`) | Orchestration (permission proposal) | Maestro + archie | verify:60; maintenance | 1 run call | Correct |
| 13 | `seam-checker` | Supplied signatures vs frozen Contract (`registry.ts:34`) | Verification | Maestro + archie | verify:56 | 7 run calls | Correct |
| 14 | `sliceability` | Connected-component collapse under hub lifting (`registry.ts:35`) | Planning (decomposition advice) | Maestro + archie | none | 3 run calls | Planning |
| 15 | `stub-gen` | TypeScript scaffold text for a Contract, never writes (`registry.ts:36`) | Authoring (scaffold) | Maestro only* | loop:62, loop:26-27 | pure.test:44-53 | `archie-plan/SKILL.md:39` says archie is not granted it |
| 16 | `brief-usage-check` | Declared-but-unavailable Plan symbols; compiler-proven unused declarations (`engine/descriptors.ts:6-15`) | Verification of briefs | Maestro only* | verify:55 | resource-conformance; registry | `archie-plan:39` says not granted |
| 17 | `decompose` | Partition, extract edges, assemble Plan, verify, optional materialization with write authority (`engine/descriptors.ts:16-22`) | **Planning authorship** | Maestro only* | review-checks:44 (stale text) | compiler.test:89 | Highest conflict: archie's job, granted to Maestro, write-capable |
| 18 | `move-in` | Scan, filter, extraction, PageRank map, reader fallback; optional persist (`engine/descriptors.ts:23-29`) | **Discovery** | Maestro only* | none | acquisition.test:77; onboard.test | Jimmy's domain; Maestro does not do discovery |
| 19 | `repo-mapper` | Bounded read-only path, size, LOC map (`engine/descriptors.ts:34-40`) | Discovery | Maestro only* | maintenance | integration, acquisition | Discovery tool |
| 20 | `repo-hygiene-check` | Read-only Git and filesystem facts, tri-state (`engine/descriptors.ts:30-33`) | Verification / orchestration | Maestro only* | verify:58; maintenance; arsenal-operators | acquisition; maestro-arsenal-package | Correct |
| 21 | `symbol-flow-check` | Compiler-checked cross-WP symbol flows (`engine/descriptors.ts:41-48`) | Verification | Maestro only* | verify:57 | **only a negative test** (registry.test:49, missing_context); no positive execution found | Thin test coverage |
| 22 | `profile` | Read and update governance preferences; never grants permission (`governance/descriptors.ts:7-10`) | Orchestration (config) | Maestro only* | maintenance; arsenal-operators | profile.test, others | Correct |
| 23 | `relay-arm` | Arm a completion contract for the next native Task; read; request release (`governance/descriptors.ts:11-16`) | Orchestration (lifecycle) | Maestro only* | loop:62-69; arsenal-operators:29 | v2-workflow-arm.test; native-seams; evidence | Correct for Maestro |
| 24 | `wave-ledger` | Bounded wave outcome record, read, compact (`governance/descriptors.ts:17-20`) | Orchestration (evidence) | Maestro only* | loop; arsenal-operators | ledger.governance.test | Correct; ceremony for small work |
| 25 | `wave-scheduler` | Readiness and one serial merge recommendation; never dispatches (`governance/descriptors.ts:21-27`) | Orchestration (scheduling) | Maestro only* | loop; arsenal-operators | scheduler.test; native-seams | Correct; ceremony for small work |
| 26 | `governance` (28 ops, `governance/descriptors.ts:38-63`) | Audit, usage, status, cost, acceptance, budgets, CI select, metrics, changelog, release/ruleset/policy/sandbox proposals and operator runs, preflight, recovery | Mixed: verification (audit, acceptance, ci-select, change-budget), orchestration (preflight, recovery), **operator** (release-run, ruleset-run, changelog-write) | Maestro only* | arsenal-operators; maintenance | many (about 121 files mention it) | Operator ops act on remote repos; gated by `operatorRequest` and native bash (`arsenal-operators:20`) |

\* "Maestro only" is inferred from the 13-name allowlist (`upstream-arsenal.ts:7-21`) and `upstream-arsenal.test.ts:198-216`, which checks that `stub-gen`, `plan-to-barrel`, `governance`, `profile`, `repo-mapper` and `wave-scheduler` are described for Maestro and rejected for upstream.

Notes on the table (fact):
- Registration: `registry.ts:38-42` merges 15 definitions, 6 acquisition descriptors (`engine/descriptors.ts`) and 5 governance-area descriptors. Count: 26.
- Execution path: `registry.ts:55-88` validates arguments, checks `missing_context` for non-pure tools, and loads `./tools/<name>.ts` lazily. Handler and schema must match the descriptor (`:82`).
- Caveat on the 27 count: the tool-file count includes the `governance` module and the `conflict-semantics` helper, so 27 files means 26 operations.
- Playbook-referenced tools all exist in source. A grep for every `maestro_*` name in `playbooks/` found definitions in `packages/core` or `modules/maestro/coordination` (e.g. `maestro_record_admission`, `maestro_record_plan_revision`). `maestro_record_result_decision` is in the Maestro tool list (`v2/seats.ts:191`) but no playbook mentions it.

### Dead or unwired code (fact)

- `modules/maestro/coordination/src/ability-descriptors.ts` and `ability-registry.ts`: only their own tests import them (grep over `packages`, `modules`, `apps`). Every descriptor has `tools: []` (`ability-descriptors.ts:16,25,34,43,52,61`). The pre-deletion consumer was `packages/core/src/capability/catalog/descriptors.ts` at `2535c3d2d7^`. No production importer remains.
- `modules/maestro/coordination/src/arsenal-outcome.ts` `classifyOutcome`: exported in `package.json:13`, referenced nowhere else. Its V1 consumers (`apps/orchestra/src/maestro/arsenal-bindings.ts`, `apps/orchestra/test/maestro/arsenal-outcomes.test.ts`) were deleted in `2535c3d2d7`.
- `arsenal-native.ts`, `arsenal-observations.ts`: live (`v2/seats.ts`, `v2/tools.ts`, `v2/workflow/arm.ts`).

## Tree conventions from backend and archie

Facts from the trees, then the conventions I infer a Maestro tree would need.

### Structure

| Seat | Roots (cut by) | Non-root nodes | Max depth below root | Median file | Max file |
| --- | --- | --- | --- | --- | --- |
| backend (`backend-implement`, `backend-api`, `backend-data`, `backend-concurrency`, `backend-refactor`, `backend-check`, `backend-codegen`) | Kind of change: one common procedure plus five domain boundaries plus codegen. Shared stack in `team-stack` (`seats/backend.ts:26-35`) | 53 (api 10, codegen 24, check 4, concurrency 4, data 3, implement 6, refactor 2) | 2 (`backend-codegen/schema/buf` is 3 levels including the root) | 2,748 B | 6,792 B |
| archie (`archie-plan`, `archie-work-package`) | Routed artifact: an "Authoring route" table maps a need to a child and its output (`archie-plan/SKILL.md:11-19`) | 6 (`archie-plan`: decomposition, load-bearing-contracts, briefs, product-design-spec; `archie-work-package`: native-proposal, native-fields) | 1 | 6,386 B | 9,125 B |
| team (`team-stack`) | Language, then framework or library | 17 | 2 (`team-stack/python/fastapi`) | 4,265 B | 5,038 B |
| maestro (`frame-request`, `maestro-plan`, `maestro-run`, `maestro-repo`) | Moment of the work (`skill-tree.md:124`) | 7 | 2 (`maestro-run/verify/review-checks`) | 3,501 B | 10,320 B |

Median is over all `SKILL.md` files in the tree. Maestro's roots (`frame-request`, `maestro-plan`) hold content; `maestro-run` and `maestro-repo` are 8-line routers.

### Frontmatter and body

- Root `description` is the trigger text. Backend roots name the work and end with a boundary: "Not for investigation, diagnosis, design or review." (`backend-implement/SKILL.md:3`). Archie's root sets `internal: true` (`archie-plan/SKILL.md:4`, `archie-work-package/SKILL.md`), an undocumented field that the validator ignores. Maestro roots have no `not-when`, and `frame-request`'s description widens the trigger (see Gaps).
- Child frontmatter is `name`, `description`, `when`, `not-when` (`backend-api/graphql/SKILL.md:2-5`; `team-stack/python/SKILL.md:2-5`). Maestro children also use all four.
- Scope gate in roots: backend uses "When this applies" with "Applies:", "Does not apply:", "Not yours:" lines, the last one naming the owner (`backend-implement/SKILL.md:10-14`, `backend-api/SKILL.md:10-14`). Archie uses an "Authoring route" table and a closing "Stop at proposal handoff" (`archie-plan/SKILL.md:45`). Maestro's loop and verify use "Trigger and rationale" and "Not-when" in frontmatter but no named owner handoff.
- Input contract: backend has a required-fields table for the packet the seat receives (`backend-implement/SKILL.md:17-30`: target behavior and acceptance; write paths; checks with command and cwd; diagnosis for repairs; decisions; interfaces; versions; baseline failures and return address). Maestro's loop lists "bounded packets" as an input (`loop/SKILL.md:19`) and never states what a packet must contain.
- Evidence vocabulary: archie labels each claim as fact, observed source, proposal, assumption, owner decision or blocker, and says "Missing data stays UNKNOWN" (`archie-plan/SKILL.md:25`). Maestro uses UNKNOWN, HOLD, FAIL and REJECT in verify and governed (`verify:81-82`, `governed:114-117`) but has no fact/decision/blocker split for its own reports; `frame-request:16-19` separates known facts from proposals only.
- Return shape: backend's return is a "backend-result card" (`backend-implement/SKILL.md:3` description; the card is named in the body). Archie returns an "upstream-result card" with transferred decisions and source refs (`archie-plan/SKILL.md:43`). Maestro's loop ends in an output schema block (`loop:92-99`).
- Boundary tool lists: `archie-plan/SKILL.md:35-39` names the 13 granted operations and the six it is not granted (`move-in`, `repo-mapper`, `decompose`, `symbol-flow-check`, `stub-gen`, `brief-usage-check`). Maestro's playbooks never list their granted set or say which operations are not theirs.
- References: backend keeps one `references/` file (`backend-implement/references/continuity.md`). Maestro has none. Links are local: `verify/SKILL.md:36` and `maintenance/SKILL.md:31` link to child nodes.

### Authoring conventions the Maestro tree would need (inference, derived from the above)

1. Cut roots by what Maestro does with a unit of work: dispatch, verify returned evidence, integrate, repository operations, governed intake. Keep the lifecycle cut the tree already has, but give each root a "When this applies / Does not apply / Not yours" gate that names `archie` for planning and `jimmy` for discovery, as backend does.
2. Give every leaf one dispatch-or-return shape (inputs table, numbered procedure, one output block, named failure states), following `backend-implement`'s packet table as the receiving contract. Maestro's dispatch briefs are the mirror image of that table.
3. Keep normal-path leaves short (backend median ~2.7 KB). Put governed, operator and release machinery in leaves whose `not-when` says "normal work", and keep the normal-path verification steps in a separate small leaf.
4. Enumerate the granted operation subset in the Maestro leaves that call them, the way `archie-plan` does (`:35-39`). Say which operations are not Maestro's to use for authorship.
5. Use one evidence vocabulary across seats (archie's fact, observed source, proposal, assumption, owner decision, blocker) and reuse `UNKNOWN` and `HOLD` as archie does.
6. Keep the inventory in one place: generate `playbook-content.ts`'s list from the tree, as the spec describes, so adding a node does not edit two files (`playbook-content.ts:8-17`, `skill-tree.md:226`).
7. Enforce the spec's description rule in the validator, or drop it from the spec (`skill-tree.md:41` vs `seat-skill-content.ts:74`).

## Gaps and conflicts

Severity: **H** = contradicts the role boundary or the prompt; **M** = stale or inconsistent text; **L** = hygiene.

### Role boundary (Maestro must not author plans)

1. **H. Governed step 7 has Maestro write the work card and dispatch brief.** `governed/SKILL.md:42-44`: "Write, in your reply rather than in a file, the work card ... and separately the complete dispatch brief the seat will receive." `maestro.txt:80`: "Upstream authors the criteria and planning content." `maestro-plan/SKILL.md:44-46` presents "the authored card". These three disagree on who writes the card. Governed step 4 `:38` also records a `source: maestro` plan revision, a Maestro-authored plan, which `maestro.txt:35` discourages.
2. **H. `frame-request` example proposes scope.** `frame-request/SKILL.md:8` says "without planning, scope selection"; `:38` is `"Draft settings scope before implementation."` with `source: maestro`.
3. **H. The prompt contradicts itself on decomposition.** `maestro.txt:35` lists "repository and conflict maps, decomposition, plan checks and wave scheduling" as Maestro's `maestro_arsenal_*` offer. `maestro.txt:38` and `maestro-plan/SKILL.md:8` say decomposition is archie's.
4. **H. The arsenal gives Maestro the authorship tools and withholds them from archie.** `decompose` (`engine/descriptors.ts:17`: "assemble Plan ... explicit materialization requests native write authority"), `stub-gen` (`registry.ts:36`), and `move-in`/`repo-mapper` (discovery) are Maestro-only (`upstream-arsenal.ts:7-21`). `archie-plan/SKILL.md:39` says archie is not granted them. The map is inverted: the seat that should author has the 13 pure checks, and the seat that should orchestrate has the authoring and discovery tools.
5. **H. Loop asks Maestro to create scaffolds.** `loop/SKILL.md:26-27`: "Create only needed scaffold/anchors through authorized native edits ... `stub-gen` and `plan-to-barrel` generate source." Contracts and anchors are archie's (`archie-plan/load-bearing-contracts`, listed in `archie-plan/SKILL.md:17`).
6. **M. Discovery in Maestro's surface.** Maestro does not do discovery (jimmy). `move-in` persists "advisory results" and produces distill/reader briefs (`engine/descriptors.ts:24`); `repo-mapper` is cited by `maestro-repo/maintenance`. The playbook uses a discovery tool without naming jimmy.
7. **M. `arsenal-operators:33`** tells Maestro to "select their exact library descriptor on demand" for "compiler/decomposition, contracts, bounded briefs, graph advice and scaffolds". This invites authoring use without the archie boundary.
8. **Allowed, not a conflict:** verification of archie's proposal with `plan-check`, `brief-usage-check`, `seam-checker`, `contract-freezer` (`verify:55-56`) is what `maestro.txt:35` permits. The line is whether Maestro uses them to check or to write. Several playbook entries blur it.

### Stale and inconsistent text

9. **M. Stale pointer.** `verify/review-checks/SKILL.md:44` "Coverage critique belongs to decompose." The `decompose` playbook was deleted in `37abd465e1`; coverage critique is now `maestro-plan:20-32`.
10. **M. Stale filename.** `review-checks/SKILL.md:43` cites `reviewer-brief.md`; the node is `maestro-repo/maintenance/reviewer-brief/SKILL.md`.
11. **M. Trigger drift.** `frame-request/SKILL.md:3` says "or when active work makes request intent ambiguous". `maestro.txt:86` says frame-request is "for governed intake". The description is broader than the prompt.
12. **M. Spec says "one leaf" for `maestro-plan`** (`skill-tree.md:133`) but it is a declared root (`playbook-content.ts:6`), and the spec's Maestro list has 4 entries where it says "ten playbooks" (`skill-tree.md:124`).
13. **M. Spec status.** `skill-tree.md:3` "proposal, waiting for approval" while `4522451d9b` and `37abd465e1` implement it.
14. **M. Spec's Maestro section** says the V2 root registration must be checked first (`skill-tree.md:240-243`). `skill-sources.ts:22-31` now registers seat roots. I did not run the tests, so I cannot say the check passes end to end.
15. **M. Duplicate inventory.** `playbook-content.ts:8-17` is a hand-kept list beside the tree; the spec says the tree rules replace hand lists (`skill-tree.md:226`).
16. **L. Provenance.** `maintenance/SKILL.md:14,46` name "TechLead" in shipped text. Arsenal headers say "Adapted from TechLead" (`registry.ts:1`, `engine/descriptors.ts:2`). Related to the owner's rule that nothing inherited from upstream stays. Repo-only vs shipped is not settled by the spec.
17. **L. "Lead" voice.** Playbooks say "Lead owns scaffolding decisions" (`loop:14`) and "decisions return to lead" (`loop:15`), while the Maestro prompt addresses the agent as "you" and never uses "lead". Readers may not know who the lead is.

### Ceremony versus craft

18. **Ceremony for normal work.** `governed` (10.3 KB), `loop`'s wave and relay sections (`:58-69`), and `verify`'s L0-L10 and V1-V4 matrix (`review-checks:12-41`) are the bulk of the tree. `maestro.txt:38` says tasks have "no compulsory WP, arm or steps", which the loop's wave and arm language conflicts with in tone even though `loop:13` says "no mandatory workers, waves, commits, or approval ceremonies".
19. **Craft that is present and good (fact):** `maestro-plan:20-49` (demand-only cold review, adopt-or-return); `loop:46-49` (serial integration, low blast radius first, deliberate union); `loop:33-34` (no barrier that only buys waiting); `verify:31-33` (teeth probe, positive control for absence claims); `maintenance:75-82` (destructive refusal list); `reviewer-brief:10,28` (no transcript, praise is not evidence).
20. **Craft that is missing (inference from the backend and archie trees):**
    - A dispatch-packet contract for Maestro, mirroring `backend-implement:17-30`: target and acceptance, exact write paths, checks with command and cwd, decisions, return address. Maestro briefs are checked by the seat that receives them, but Maestro has no written standard for what to send. Dispatch is Maestro's job, so this is in scope.
    - A return-intake card, mirroring the backend-result and upstream-result cards.
    - The fact / observed source / proposal / assumption / owner decision / blocker split for Maestro's reports to the owner.
    - An explicit handoff rule that names archie for planning and jimmy for discovery, as backend names its contract owner (`backend-api/SKILL.md:14`).

### Dead or unwired

21. **Dead:** `ability-descriptors.ts`, `ability-registry.ts` (own tests only; every `tools: []`).
22. **Dead:** `arsenal-outcome.ts` `classifyOutcome` (package export only; V1 consumer deleted in `2535c3d2d7`).
23. **Thin test:** `symbol-flow-check` has a negative test only (`registry.test.ts:49`). No positive execution found.
24. **Unreferenced by any playbook:** `maestro_record_result_decision` (`v2/seats.ts:191`). Maestro can call it, but no procedure says when.

## Open questions

1. Owner decision: should the Maestro surface keep the authoring and discovery tools (`decompose`, `stub-gen`, `move-in`, `repo-mapper`, and the non-archie authoring ones), or only the verification and orchestration ones? The current map gives Maestro the authorship tools and withholds them from archie (Gaps 4, 6).
2. Governed step 7 (`governed/SKILL.md:42-44`): is the work card and dispatch brief meant to be authored by Maestro or by archie through the `task` tool? The prompt and `maestro-plan` say archie. The answer decides whether governed step 7 changes.
3. Does `frame-request` run outside governed intake (`frame-request/SKILL.md:3`)? If not, the description should match `maestro.txt:86`.
4. Who runs the teeth probes and mutation checks (`verify/SKILL.md:31-33`)? Maestro, or the review seat (`lucy`)? The playbook says Maestro, and `maestro.txt:42` says Maestro does not send changes back to their author.
5. Should `ability-*` and `classifyOutcome` be deleted or wired? Both are dead in production.
6. Should `skill-tree.md` be updated to the landed state (status line, "one leaf", "ten playbooks") before the owner's approval?
7. Does `maestro_record_result_decision` belong in a playbook? If it is an upstream-result tool, which playbook owns it?
8. Is the "TechLead" provenance in shipped playbook text (`maintenance/SKILL.md:14,46`) acceptable under the release-vs-repo rule?
