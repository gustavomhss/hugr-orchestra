# WP #187 Baseline Evidence

Date: 2026-09-26

Scope: [#187](https://github.com/gmhelmold/HuGR-Orchestra/issues/187),
read-only evidence map plus this required record. This Markdown record is
the only source-controlled documentation output; no product, configuration,
GitHub, branch, checkout, or issue mutation belongs to this WP. Execution
target supplied for this WP: worktree
`/Users/gustavoschneiter/Documents/HuGR/_worktrees/agent-m0-2-baseline-evidence`,
branch `agent/m0-2-baseline-evidence`, based on `fork/dev` commit
`ba2dcb664b53f7d3d842a63dcccd6c6748d0a834`. That supplied branch/base pair is an execution constraint, not
independently re-derived Git state.

## Definition of Done

- Record source-observed runtime, Relay, Atlas, GitHub, CI, and Project
  evidence.
- Name base/branch constraint, commands, SHAs, dates, PR posture, and blockers
  #94, #102, and #113.
- Separate this execution observations from historic claims and proposals.
- Supply candidate owner and shared integration files for M0.4 without deciding
  architecture.

Source: [#187](https://github.com/gmhelmold/HuGR-Orchestra/issues/187),
sections "Definition of Done" and "Completeness Criteria"; [#206](https://github.com/gmhelmold/HuGR-Orchestra/issues/206),
M0.4 objective and DoD.

## Invariants

- No product, configuration, GitHub, branch, checkout, commit, or issue
  mutation belongs to this WP; this required Markdown record is its only
  documentation output.
- A dated handoff, historic branch, or remote check payload is not current-base
  proof.
- Missing durable evidence remains `HOLD`; no model-supplied plan, validation,
  policy, context, or task hash becomes authority.
- Candidate-file list is conflict-discovery input, not ownership assignment or
  architecture decision.

Source: [#187](https://github.com/gmhelmold/HuGR-Orchestra/issues/187),
"Invariants"; `specs/hugr-maestro/SESSION-STATE.md:41-47`;
`specs/hugr-maestro/methods/admit-request.md:144-148`;
`specs/hugr-maestro/ROADMAP.md:107-123`.

## Quality Standards

- Every measured claim below identifies command or inspected source path and
  date.
- Historic claims retain source date and scope. They are not re-labeled current
  evidence.
- GitHub query results are remote metadata snapshots, not tests run by this WP.
- No test is claimed passed by this WP. Only final `git diff --check` is run.

Source: [#187](https://github.com/gmhelmold/HuGR-Orchestra/issues/187),
"Quality Standards"; `foundation/atlas/docs/SESSION-STATE.md:405-425`.

## Completeness Criteria

- Runtime: Task resume, governed approval, admission, registration, and subtask
  launch seams.
- Relay: Atlas relay contract versus absent Maestro host evidence.
- Atlas: catalog, static Own, installed export, and OpenCode consumption
  boundary.
- GitHub: #94, #102, #113, PR #128, PR #129, and one historic-target negative
  control.
- CI: current workflow surface and limits.
- Project: M0.4 source, candidate owner files, shared integration files,
  blockers.

Source: [#187](https://github.com/gmhelmold/HuGR-Orchestra/issues/187),
"Completeness Criteria"; [#206](https://github.com/gmhelmold/HuGR-Orchestra/issues/206),
"Completeness Criteria".

## Success Criteria

- Follow-on WP can cite exact baseline constraint and seams.
- Historic PR evidence cannot be mistaken for `fork/dev` proof.
- M0.4 can form disjoint packets after lead assigns owners for shared files and
  unresolved interfaces.

Source: [#187](https://github.com/gmhelmold/HuGR-Orchestra/issues/187),
"Success Criteria"; [#206](https://github.com/gmhelmold/HuGR-Orchestra/issues/206),
"Success Criteria".

## Evidence Classes

### Observed This Execution

- Date: 2026-09-26.
- Static source inspected in supplied worktree: required Maestro specs, Task
  source, all `packages/opencode/src/maestro/*.ts`, CI workflow, Atlas session
  state, current Atlas candidates, and integration callers named below.
- GitHub metadata queried read-only for [#94](https://github.com/gmhelmold/HuGR-Orchestra/issues/94),
  [#102](https://github.com/gmhelmold/HuGR-Orchestra/issues/102),
  [#113](https://github.com/gmhelmold/HuGR-Orchestra/issues/113),
  [#177](https://github.com/gmhelmold/HuGR-Orchestra/issues/177),
  [#187](https://github.com/gmhelmold/HuGR-Orchestra/issues/187),
  [#206](https://github.com/gmhelmold/HuGR-Orchestra/issues/206),
  [PR #89](https://github.com/gmhelmold/HuGR-Orchestra/pull/89),
  [PR #128](https://github.com/gmhelmold/HuGR-Orchestra/pull/128), and
  [PR #129](https://github.com/gmhelmold/HuGR-Orchestra/pull/129).
- No test, build, typecheck, checkout, merge, rebase, or source mutation
  outside this record was run.

### Historic, Not Current-Base Proof

- `specs/hugr-maestro/ROADMAP.md` snapshot is dated 2026-09-25 and identifies
  planning `fork/dev` `102e763599`; it says historical audit material cannot
  prove current delivery alone (`ROADMAP.md:3-18`).
- Same roadmap records historical Maestro PRs #87, #88, #89, #115, and #116
  target `maestro/rebuild-fork-dev-clean`, not current `dev`; resume requires
  transplant/rebase, current CI, and independent review (`ROADMAP.md:71-80`).
- `specs/hugr-maestro/SESSION-STATE.md` snapshot is dated 2026-09-25 at
  `102e763599`; its only cited prior green test run belongs to `688d264010`,
  expressly not inherited by successor `102e763599` (`SESSION-STATE.md:3-5,21-26`).
- `foundation/atlas/docs/SESSION-STATE.md` is dated 2026-09-06. Its reported
  builds, test counts, PRs, and runner results are historic Atlas-session
  claims, not results from this WP (`foundation/atlas/docs/SESSION-STATE.md:1-32,46-67`).

## Current Source Seams

### Task Resume And Governed Dispatch

- `task_id` is documented as resume input (`packages/opencode/src/tool/task.ts:52-81`).
  Resume loads session and rejects it unless direct child of calling session and
  selected agent (`task.ts:135-146`).
- Explicit `governed` input binds session, project, member, approval message,
  plan/validation/context/policy hashes, and task hash (`task.ts:65-81`).
- Governed Task requires Maestro, call ID, request-context identity, member
  identity, and recomputed task hash (`task.ts:199-220`). It reads approval
  presentation/decision events, verifies exact binding, and writes idempotent
  one-time `Approval.Consumed` evidence (`task.ts:221-310`;
  `packages/opencode/src/maestro/governed-task.ts:25-51`;
  `packages/opencode/src/maestro/task-hash.ts:19-36`).
- Non-governed subtask path in Session Prompt supplies only prompt, description,
  agent, and command (`packages/opencode/src/session/prompt.ts:255-306,324-349`).
  This is current internal fence surface, not public runtime authority; source
  status agrees with `specs/hugr-maestro/SESSION-STATE.md:11-17`.

### Approval

- `maestro_present_approval` is registered but unconditionally refuses because
  durable PlanRevision and ValidationRecord readers do not exist
  (`packages/opencode/src/tool/maestro-approval.ts:29-49`).
- `maestro_record_approval` invokes exact reply recording for Maestro only
  (`maestro-approval.ts:51-93`). Approval evaluation requires valid
  presentation identity, exact rendered presentation, newest visible
  presentation, direct non-synthetic user reply immediately after presentation,
  and unbound reply (`packages/opencode/src/maestro/approval.ts:114-173,176-253`).
- Presentation/decision records are event-backed and idempotence/conflict
  checked; replay reads session messages and emits Decision only when exact
  result is eligible (`packages/opencode/src/maestro/approval-record.ts:125-185,187-289`).
- Ratified actor identity is exact `projectId + sessionId + memberId`; canonical
  serialization must precede durable authority evidence
  (`specs/hugr-maestro/actor-identity-contract.md:7-30`).

### Admission

- `maestro_record_admission` is an explicit Maestro-only tool. It selects latest
  direct user message, then records assessment under caller-provided method
  version (`packages/opencode/src/tool/maestro-admission.ts:13-50`).
- Admission record ID derives from `(sessionID, messageID, methodVersion)`;
  repeat identical input replays, different input conflicts
  (`packages/opencode/src/maestro/admission-record.ts:30-73`).
- Policy accepts only valid assessment: `orient` -> `ORIENT`; active-work
  conflict, missing goal, unknown blockers, or invalid schema -> `CLARIFY`;
  remaining work -> `READY_TO_DRAFT`
  (`packages/opencode/src/maestro/admit-request.ts:54-77`).
- Method contract says durable trigger, record, and replay remain unimplemented
  despite policy kernel (`specs/hugr-maestro/methods/admit-request.md:3-5`);
  documented desired dedupe/replay semantics are contract, not this WP
  measurement (`admit-request.md:25-50,133-142`).

### Atlas And Relay

- Atlas catalog source exposes frozen, versioned, read-only
  `territoryCatalog(projectId)` and rejects invalid/missing/duplicate catalog
  data (`foundation/atlas/packages/index/src/territory-catalog.ts:7-17,41-85`).
  Atlas barrel exports it and package metadata exposes only package-root dist
  entry (`foundation/atlas/packages/index/src/index.ts:1-29`;
  `foundation/atlas/packages/index/package.json:1-21`).
- Static Own source validates schema, snapshot, source revision, units, packs,
  and blobs; export rejects stale packs; verification returns `HOLD` on
  projection or source-blob drift
  (`foundation/atlas/packages/retrieval/src/own-snapshot.ts:7-21,151-190,217-244`).
  `ownImpact` derives base/head impact receipt and marks under-approximate
  coverage (`foundation/atlas/packages/index/src/own-impact.ts:6-33,58-137`).
- Atlas composed runtime has read-only `own(scope)`, Awareness, and Orientation
  legs (`foundation/atlas/packages/adapter-io/src/compose-runtime.ts:26-61,164-190`).
  Seam register says no OpenCode adapter, direct Atlas import, or Atlas write
  door may land before source proof and acceptance
  (`specs/hugr-maestro/atlas-foundation-seam-register.md:57-65`). Session state
  says no installed host catalog boundary and no canonical Own host-consumption
  boundary (`specs/hugr-maestro/SESSION-STATE.md:13-17,41-47`).
- Atlas `relay` is only observed as pull-ladder vocabulary mapped to MCP in
  reference-model transport source; source declares value implementation inert
  and no production caller (`foundation/atlas/packages/tools/src/transport.ts:7-24,41-49,92-120`).
  No Maestro-specific OpenCode Relay runtime seam was identified in this WP
  TypeScript discovery. This is discovery evidence, not proof of global absence.

## GitHub And CI Posture

### Blockers

- [#94](https://github.com/gmhelmold/HuGR-Orchestra/issues/94) is OPEN, updated
  2026-09-18. It records Atlas reference-model ledger drift at audited
  `b0c33d2f6567a2c741240f3c44bc00ca2f01e7e7`; candidate PR #89 does not close
  issue. Issue body requires guard/tree reconciliation without weakening guard.
- [#102](https://github.com/gmhelmold/HuGR-Orchestra/issues/102) is OPEN, updated
  2026-09-19. It records Windows Core process lifetime defect on PR #89-era
  evidence and rejects timeout, force-exit, or skip workaround. Root cause and
  focused regression gate remain required.
- [#113](https://github.com/gmhelmold/HuGR-Orchestra/issues/113) is OPEN, updated
  2026-09-26. Epic blocks usable governed flow on #107, #110, #112, #114, #106,
  #109, #108, #111, and listed hardening issues; it requires current-base
  merge-candidate proof and human merge decision.

### Open PR Metadata Snapshot

Lead confirmation ran 2026-09-26 in
`/Users/gustavoschneiter/Documents/HuGR/_worktrees/maestro-program-contract`:

```text
gh pr view 128 --repo gmhelmold/HuGR-Orchestra --json number,statusCheckRollup --jq '{number, atlas: [.statusCheckRollup[] | select(.name == "atlas") | {name, status, conclusion, detailsUrl}]}'
gh pr view 129 --repo gmhelmold/HuGR-Orchestra --json number,statusCheckRollup --jq '{number, atlas: [.statusCheckRollup[] | select(.name == "atlas") | {name, status, conclusion, detailsUrl}]}'
```

- [PR #128](https://github.com/gmhelmold/HuGR-Orchestra/pull/128): OPEN, base
  `dev` at `30d951fcc4a09e708768551c7c6fd38a0efe3da8`, head
  `maestro-state-update` at `730eddc21d466d47eab94bd9c3c1877172a91dff`, no
  merge commit. Exact filtered check receipt is
  `{"atlas":[{"conclusion":"FAILURE","detailsUrl":"https://github.com/gmhelmold/HuGR-Orchestra/actions/runs/36207516359/job/108307131443","name":"atlas","status":"COMPLETED"}],"number":128}`.
  Other listed check results are remote service reports only, not local verification.
- [PR #129](https://github.com/gmhelmold/HuGR-Orchestra/pull/129): OPEN, same
  base `dev` OID `30d951fcc4a09e708768551c7c6fd38a0efe3da8`, head
  `atlas-own-ledger` at `735a85b8d4a682f880c8d6be963c346467b0b475`, no merge
  commit. Exact filtered check receipt is
  `{"atlas":[{"conclusion":"FAILURE","detailsUrl":"https://github.com/gmhelmold/HuGR-Orchestra/actions/runs/36209053518/job/108311699541","name":"atlas","status":"COMPLETED"}],"number":129}`.
  Remaining listed results are remote service reports only.
- Neither PR is merged. Their remote `dev` base OID is distinct from supplied
  WP base `fork/dev` `ba2dcb664b53f7d3d842a63dcccd6c6748d0a834`; neither supplies proof for that execution
  baseline.

### Workflow Surface

- Test workflow triggers push to `dev`, pull requests, and manual dispatch
  (`.github/workflows/test.yml:1-14`).
- Required unit matrix targets Linux and Windows; unit command is
  `GITHUB_ACTIONS=false bun turbo test` with 45-minute timeout (`test.yml:163-220`).
- Atlas job typechecks, runs named guards, tests snapshot materializer and gate,
  and conditionally runs full Atlas suite for product changes (`test.yml:81-161`).
  Workflow definition is configuration evidence, not a completed run.

## Negative Control: Historic PR Target

Date: 2026-09-26. Read-only command queried
[PR #89](https://github.com/gmhelmold/HuGR-Orchestra/pull/89): it is OPEN,
targets `maestro/rebuild-fork-dev-clean` at
`b0c33d2f6567a2c741240f3c44bc00ca2f01e7e7`, has head `ci-baseline-fixes` at
`db4cc0ea41173cf6160ae296e66ce639838172e6`, and no merge commit.

Temporary comparison: PR #89 target is historical branch, while this WP target
is supplied as `fork/dev` at `ba2dcb664b53f7d3d842a63dcccd6c6748d0a834`. Different target refs and OIDs,
unmerged PR, and roadmap historical-PR rule mean its status payload cannot
prove current-base behavior. No checkout, rebase, merge, or test was used to
bridge that gap.

Source: [PR #89](https://github.com/gmhelmold/HuGR-Orchestra/pull/89);
`specs/hugr-maestro/ROADMAP.md:71-80`;
[#94](https://github.com/gmhelmold/HuGR-Orchestra/issues/94);
[#102](https://github.com/gmhelmold/HuGR-Orchestra/issues/102).

## Project Configuration Receipt

Date: 2026-09-26. Lead confirmation ran in
`/Users/gustavoschneiter/Documents/HuGR/_worktrees/maestro-program-contract`.
Exact output from read-only filtered command:

```text
gh project field-list 2 --owner gustavomhss --format json --jq '.fields[] | select(.name == "Status" or .name == "CI" or .name == "Seat" or .name == "Priority" or .name == "Risk" or .name == "Stage" or .name == "Blocked reason") | [.name, .id, ([.options[]? | "\(.name)=\(.id)"] | join(", "))]'
["Status","PVTSSF_lAHODZlCY84BkufizhjeEZQ","Todo=f75ad846, In Progress=47fc9ee4, Done=98236657"]
["CI","PVTSSF_lAHODZlCY84BkufizhjeEfs","Not required=5e5dc314, Planned=28f62ede, Pending=e9ba446f, Green=b97c0da3, Red=c57b4aa7, Stale=8fac1095"]
["Seat","PVTSSF_lAHODZlCY84BkufizhjeEf0","Maestro=01b0cacc, Charlie=848d4e73, Patty=60a9b6ec, Lucy=11dd93df, Bobby=37d9d703, Billy=905fe6a8, Jimmy=ac92afd9, Rosie=08feaad7, Frankie=bab8dcee"]
["Priority","PVTSSF_lAHODZlCY84BkufizhjeEf4","P0=74ef11b7, P1=a47b10e1, P2=69ca99ab, P3=c7286fe0"]
["Blocked reason","PVTF_lAHODZlCY84BkufizhjeEi4",""]
["Risk","PVTSSF_lAHODZlCY84BkufizhjeEi8","Low=5b547516, Medium=6f6cc626, High=492b6113, Critical=fa5d760f"]
["Stage","PVTSSF_lAHODZlCY84BkufizhjeIiM","Planned=46904642, Ready=b2ba17b9, Running=3634d6bb, Blocked=88760719, Review=1a300016, CI=63dffbae, Merge Ready=befe072e, Closed=e411cd71, Cancelled=328f1833, Superseded=e27ab734"]
```

`Blocked reason` is free text field `PVTF_lAHODZlCY84BkufizhjeEi4`. The
command reported 19 fields. This receipt proves configuration at query time;
it does not prove current item state or adapter implementation.

## M0.4 Candidate Files

M0.4 is [#206](https://github.com/gmhelmold/HuGR-Orchestra/issues/206):
normalize legacy contracts and freeze conflict map. It is explicitly no product
implementation. Candidate list below is derived from observed seams; lead must
assign one owner per shared file before dispatch.

| Surface                              | Candidate owner files                                                                                                                                                          | Shared integration files / conflict risk                                                                                                                                                   |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| #110 admission                       | `packages/opencode/src/maestro/admit-request.ts`; `packages/opencode/src/maestro/admission-record.ts`; `packages/opencode/src/tool/maestro-admission.ts`                       | `packages/opencode/src/tool/registry.ts`; `packages/opencode/src/session/prompt.ts`; `packages/opencode/src/tool/task.ts`                                                                  |
| #106 / #114 approval records/readers | `packages/opencode/src/maestro/approval.ts`; `packages/opencode/src/maestro/approval-record.ts`; `packages/opencode/src/tool/maestro-approval.ts`                              | `packages/opencode/src/tool/registry.ts`; `packages/opencode/src/tool/task.ts`                                                                                                             |
| #111 governed Task                   | `packages/opencode/src/maestro/governed-task.ts`; `packages/opencode/src/maestro/task-hash.ts`; `packages/opencode/src/tool/task.ts`                                           | `packages/opencode/src/session/prompt.ts`; `packages/opencode/src/tool/registry.ts`                                                                                                        |
| #112 territory catalog               | `foundation/atlas/packages/index/src/territory-catalog.ts`                                                                                                                     | `foundation/atlas/packages/index/src/index.ts`; `foundation/atlas/packages/index/package.json`; `.github/workflows/test.yml`                                                               |
| #109 static Own host boundary        | `foundation/atlas/packages/retrieval/src/own-snapshot.ts`; `foundation/atlas/packages/index/src/own-impact.ts`                                                                 | New OpenCode host adapter path remains unnamed; do not invent it in M0.4. `foundation/atlas/packages/index/src/index.ts` and `.github/workflows/test.yml` are shared boundary/CI surfaces. |
| #108 context adapter / Relay         | No OpenCode adapter file observed. Atlas candidate evidence: `foundation/atlas/packages/adapter-io/src/compose-runtime.ts`; `foundation/atlas/packages/tools/src/transport.ts` | New adapter and runtime wiring remain unresolved interface/ownership decisions; keep out of decision-free implementation packet.                                                           |

Contract and program shared files: `specs/hugr-maestro/ROADMAP.md`,
`specs/hugr-maestro/SESSION-STATE.md`,
`specs/hugr-maestro/methods/admit-request.md`,
`specs/hugr-maestro/actor-identity-contract.md`, and
`specs/hugr-maestro/atlas-foundation-seam-register.md`. M0.4 may normalize
their contracts only after legacy issue scope is reconciled; it must not use
prose equivalence to declare readiness ([#206](https://github.com/gmhelmold/HuGR-Orchestra/issues/206)).

## Initial Source Command Record

Commands in this initial source record ran in
`/Users/gustavoschneiter/Documents/HuGR/_worktrees/agent-m0-2-baseline-evidence`
on 2026-09-26. `gh` commands were read-only queries.

```text
gh issue view 94 --repo gmhelmold/HuGR-Orchestra --json number,title,state,stateReason,url,body,closedAt,closedByPullRequestsReferences,labels,milestone,updatedAt
gh issue view 102 --repo gmhelmold/HuGR-Orchestra --json number,title,state,stateReason,url,body,closedAt,closedByPullRequestsReferences,labels,milestone,updatedAt
gh issue view 113 --repo gmhelmold/HuGR-Orchestra --json number,title,state,stateReason,url,body,closedAt,closedByPullRequestsReferences,labels,milestone,updatedAt
gh issue view 177 --repo gmhelmold/HuGR-Orchestra --json number,title,state,url,body,createdAt,updatedAt
gh issue view 187 --repo gmhelmold/HuGR-Orchestra --json number,title,state,url,body,createdAt,updatedAt,labels,milestone
gh issue list --repo gmhelmold/HuGR-Orchestra --search "M0.4 in:title" --state all --json number,title,state,url,body,createdAt,updatedAt
gh pr view 89 --repo gmhelmold/HuGR-Orchestra --json number,title,state,url,baseRefName,baseRefOid,headRefName,headRefOid,mergeCommit,mergedAt,statusCheckRollup,body
gh pr view 128 --repo gmhelmold/HuGR-Orchestra --json number,title,state,url,isDraft,baseRefName,baseRefOid,headRefName,headRefOid,mergeCommit,mergedAt,statusCheckRollup,body
gh pr view 129 --repo gmhelmold/HuGR-Orchestra --json number,title,state,url,isDraft,baseRefName,baseRefOid,headRefName,headRefOid,mergeCommit,mergedAt,statusCheckRollup,body
```

Query result: metadata summarized in this record; no command executed a test,
build, typecheck, mutation, or Git state change.

```text
git diff --check
```

Result: exit 0; no output.

## Lead Framing Corrections

- #187 says both "read-only inventory and evidence record under
  `specs/hugr-maestro/`" and "No ... source mutation." New required record
  necessarily changes one source-controlled documentation file. This WP
  resolves contradiction by creating only this record and changing no
  product/configuration source.
- Historic PR #89 target cannot establish current `fork/dev` evidence. Roadmap
  already says so; carrying its green claims forward would violate #187 stale-
  evidence invariant.
- M0.4 now exists as #206 and is contract/conflict-map work, not an
  implementation wave. Exact host adapter path and shared-file owner remain
  lead decisions, not facts for this evidence WP.
