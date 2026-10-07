## F4 — Work/result and owned-tool envelope

Status: draft frozen-interface proposal for LEAD-0, 2026-10-05. Read-only source drafting; nothing was run, typechecked or tested.
Baselines: Orchestra `/Users/gustavoschneiter/Documents/HuGR/_worktrees/backend-plugin` HEAD `d11d8652aa` (paths below are relative to `packages/` unless prefixed). Composer `/Users/gustavoschneiter/Documents/HuGR/skill-001-fastapi-production` HEAD `df04cf8f9c9c4307d22b6447d513b05b94c08572` (prefix `P/`).
Inputs: `specs/backend-specialist/execution-plan.md` §1.1, §2, §3, §4 (H5, C); `README.md` §Work and result protocol; `owned-tools.md`; `integration-flow.md`; `research/delivery-composer.md`; `research/delivery-host.md` (Maestro/Task).
Owner rulings applied without reopening: Maestro picks the checks in the packet and accepts the result. The harness runs and verifies the checks through `ArsenalCompletion`. The backend specialist returns delta, evidence and blockers, and never self-accepts or self-reviews. In direct use the user is the Maestro, with the same packet contract and no harness receipt. The backend specialist consumes `ToolSafety` denials and does not enforce scope itself. Tool success and Memory-write success are separate facts. The Composer error-detail policy belongs to the Composer tool-contract owner.

### Contract

#### A. Three axes, never merged

1. **Separate axes.** Every backend specialist work unit has three independent results: **terminal reason** (how the attempt ended), **verification** (what the harness observed when it ran the packet's checks) and **acceptance** (what the deciding authority decided). No adapter, renderer or model output may derive one axis from another. In particular, `ended` does not imply verified, verified does not imply accepted, and a completed tool operation implies none of the three (README "A completed tool operation establishes that operation's outcome").
2. **Vocabulary freeze (supersedes the README sketch).** The `WorkResult` block in README §Work and result protocol is replaced as follows. `execution` becomes `terminal.reason`. The check statuses `passed|failed|skipped|unavailable` become the existing `ArsenalCompletion.CheckOutcome.status` set `pass|fail|skip|missing|acquisition-error` (`orchestra/src/maestro/arsenal-completion.ts:24`). Verification becomes the four host-sourced states in clause 13. README `unavailable` corresponds to `missing` or `acquisition-error`. No second check vocabulary may be introduced.
3. **Trust split.** Each `WorkResult` field belongs to one of three classes. *Host facts* are authoritative: Session and tool identities, terminal error or abort, `metadata.completion`, the completion-check capture, `ToolSafety` observations and Atlas receipts. *Worker claims* are untrusted until they are bound to host evidence: changes, worker-run checks, blockers, risks and next actions. *Authority decisions* come only from Maestro or the user: acceptance. A worker claim cannot fill a host-fact or authority field. Text that says "verified", "accepted", "approved" or "all checks pass" has no effect on any field.

#### B. WorkResult shape (`backend-work-result-v1`)

4. **Shape.** The host adapter (H5) assembles the `WorkResult`. The backend specialist does not author it directly. Column "Source" names an existing seam (E) or a required-new seam with its owner WP (N).

| Field | Meaning | Source |
| --- | --- | --- |
| `schema` | `"backend-work-result-v1"` | N (H5) |
| `taskId` | Logical task from F2. **Not** `metadata.completion.taskID`: that value is the child Session ID (`tool/task.ts:427-429` passes `taskID: nextSession.id`) | N (F2/H5) |
| `memberId` | Stable `backend` (F1) | E: agent `.id` (`tool/task.ts:177`) |
| `authoritySessionId` / `executionSessionId` | Parent and child Session in delegation; equal in direct use | E: `metadata.parentSessionId` / `metadata.sessionId` (`tool/task.ts:446-451`); F2 binds direct-mode authority |
| `mode` | `direct` \| `delegated` \| `delegated-armed` (clause 18) | N (H5); `delegated-armed` = completion receipt present (`tool/task.ts:427-430`) |
| `terminal.reason` | `ended` \| `blocked` \| `failed` \| `interrupted` (clauses 7–10) | N (H5), derived from E host facts |
| `terminal.source` | `host` \| `worker-declared` | N (H5) |
| `terminal.hostDetail` | Verbatim host reason, bounded and passed through `ToolSafety.inspect`: assistant error name or message, `ToolSafety.Denied.reason`, `"Task cancelled"` | E strings (`tool/task.ts:561-575,696-697`; `core/src/tool-safety.ts:58-64`) |
| `delta.baseRevision` | Git HEAD recorded at dispatch | E only inside the receipt (`arsenal-completion.ts:119-122`), not exported; N (H5) export |
| `delta.changes[]` | `{ path, change: created\|modified\|deleted, callIDs[] }`: a worker claim that must cite tool calls in `executionSessionId` | N (H5 binding, clause 16) |
| `delta.toolOutcomes[]` | Owned-tool envelopes (§C), keyed by `callID` | N (CB) |
| `checks.worker[]` | `{ checkId, command, cwd, status: CheckOutcome.status, exitCode?, callID }`: checks that the backend specialist ran | N (H5 binding); status vocabulary E (`arsenal-completion.ts:24`) |
| `checks.host` | The existing `Capture` `{ complete, results[{ name, status, exitCode?, provenance }] }` | E: `arsenal-completion.ts:43-48,147`; durable as the native fact `completion-check` (`orchestra/src/maestro/arsenal-bindings.ts:572-597`, schema `arsenal-observations.ts:63-75`) |
| `verification.state` | `host-verified` \| `host-failed` \| `host-incomplete` \| `not-host-verified` (clause 13) | N (H5), derived from E |
| `verification.receipt` | Existing `{ verified: true, planID, taskID, checks }` | E: `metadata.completion` (`tool/task.ts:487-490,576-580,699-700`) |
| `verification.hostReason` | `completion-*` reason from `ToolSafety.Denied` | E: `arsenal-completion.ts:70-156` |
| `acceptance` | Always emitted as `{ state: "pending" }`; the decision is recorded outside (clause 20) | N (H5); decision record: open decision O3 |
| `blockers[]` | `{ kind, reason, code?, ref? }` (clause 11) | N (H5) |
| `risks[]`, `nextActions[]` | Informational worker claims | N (H5) |
| `memory` | `{ reads[], writes[]: { outcome, callID, receiptRef? } }`, using F3 receipt vocabulary | N (F3/H5) |
| `card` | `{ parsed: boolean, messageID }`: carrier status (clause 5) | N (H5) |

5. **Return-card carrier.** The backend specialist's worker claims (changes, worker checks, blockers, risks, next actions) are carried in the child's final assistant text part. Task already selects that part (`tool/task.ts:580` `findLast(type === "text")`). The text contains exactly one fenced JSON block tagged `backend-result`. H5 decodes it with `Schema.decodeUnknownOption(Schema.UnknownFromJsonString)` plus a closed struct, using `onExcessProperty: "error"`. The block carries no fields from the host-fact or authority classes. Decoding failure gives `card.parsed = false`, keeps the raw text by `messageID`, and leaves every worker-claim field empty. Nothing is fabricated. The existing `backend.txt` "Return card: implementation card, gates, diff receipt" becomes this block (H1 owns the prompt).
6. **Placement and survival.** The assembled `WorkResult` is written to the Task tool part as `metadata.workResult`, next to the existing `metadata.completion`. On every failure path (verification failure, worker-not-finished HOLD, subagent failure, cancellation) H5 MUST stream `metadata.workResult` through `ctx.metadata` **before** the Task effect fails. `SessionProcessor.failToolCall` keeps the running metadata on the errored part (`orchestra/src/session/processor.ts:187-200`, "Keep metadata streamed while running"), and abort keeps it with `interrupted: true` (`processor.ts:604-607`). Today Task fails through `Effect.orDie` (`tool/task.ts:735`), and only `{parentSessionId, sessionId, model}` survives. The child's delta, blockers and check output are lost from the tool part. That is the gap H5 closes.

#### C. Terminal reason

7. **`ended`.** The child's final assistant message has `finish` not in `["tool-calls","unknown"]` and no `info.error`, and no host failure from clauses 9–10 applies. This is the existing finish predicate (`tool/task.ts:466-479,572-575`).
8. **`blocked`.** This is the host-ended case (clause 7) in which the card declares at least one blocker and does not claim the assigned change complete. It is also used when a host safety or permission refusal stopped the worker: `PermissionV1.RejectedError` sets `ctx.blocked` (`processor.ts:204-205`), and an observation `held` comes from `ToolSafety.Denied` (`tool-safety.ts:251-258`). `blocked` reports a stop that the worker or host chose before acceptable completion. It is not an error.
9. **`failed`.** The assistant `info.error` is set (`tool/task.ts:561-567`), or an unrecovered tool error remains in the final message (`tool/task.ts:568-571`), or a provider or process failure ends the child. The existing "last errored tool part fails the whole Task" rule is a host fact and stays. H5 must still emit the `WorkResult` per clause 6, so the failure keeps its delta.
10. **`interrupted`.** This covers parent abort or cancellation (`tool/task.ts:679-711`, `"Task cancelled"` at :697), the processor abort path (`processor.ts:604-607`), and the completion HOLD `completion-worker-not-finished` (`tool/task.ts:483-484,575`). The worker did not reach a terminal finish, so partial effects are possible.
11. **Precedence and blockers.** Host `failed` or `interrupted` overrides any worker declaration. The worker can lower `ended` to `blocked` but can never raise anything to `ended`. Blocker kinds form a closed set:
    - `safety-hold`: the `ToolSafety.Denied.reason` verbatim.
    - `permission`: a native Rejected or Denied error.
    - `tool`: the owned-tool `error.code`.
    - `packet`: a missing or contradictory decision, context or scope (worker-declared).
    - `atlas`: a degraded or unavailable F3 capability.
    - `check-unavailable`: an assigned check that could not run.

    the backend specialist reports a `safety-hold` and does not work around it through another tool or path. Consuming the denial is the whole of its scope duty under §1.1.
12. **No prose classification.** Consumers classify only typed fields. Today `"Tool safety HOLD: completion-worker-not-finished"` is a plain `Error` (`tool/task.ts:483-484,575`), not a `ToolSafety.Denied`, so `ToolSafety.run` observes it as `failure`, not `held` (`tool-safety.ts:253-257`). H5 records the reason as a typed `terminal.hostDetail` plus `verification.hostReason`. No consumer may match on the message text.

#### D. Verification (harness-owned)

13. **States.**
    - `host-verified` is set only when `ArsenalCompletion.verifiedCompletion` returned `{ verified: true }` for **this** Task call and the child Session (`arsenal-completion.ts:126-158`). That return requires evaluator `PASS`, no failures, an unchanged contract fingerprint and an unchanged HEAD before and after the checks (:131-149).
    - `host-failed` applies when a receipt existed and at least one `checks.host.results[].status === "fail"`.
    - `host-incomplete` applies when a receipt existed and verification did not reach PASS without any `fail`. Examples are `skip`, `missing` or `acquisition-error` results, `completion-contract-drift`, `completion-revision-drift`, `completion-receipt-unbound`, `completion-evaluation-acquisition`, or terminal `failed`/`interrupted` before verification.
    - `not-host-verified` applies when no receipt existed (direct mode, or unarmed delegation).

    `host-failed` and `host-incomplete` are derived from the per-check capture. The evaluator's single `FAIL` status is not enough, because skips also produce `FAIL` (`maestro-arsenal/test/evidence.governance.test.ts:80`).
14. **Consume, don't rebuild.** The backend specialist and H5 do not run, re-evaluate or reimplement host checks. The check set, binding and evaluator are Maestro's packet (the arm contract, `arsenal-bindings.ts:380-436,742`) and the harness's (`ArsenalCompletion` with host `checks`, `arsenal-bindings.ts:489-562`). H5 reads the capture from the `completion-check` native fact or from the in-call capture. It does not keep a parallel store.
15. **Blocked is never masked by verification.** In armed mode, a normally finished child whose card says `blocked` still reaches `verifiedCompletion` (`tool/task.ts:576`). Its failing checks would currently turn the result into an opaque HOLD. H5 MUST parse the card and stream `metadata.workResult` (clause 6) before calling `verifiedCompletion`. The resulting verification state is then recorded **alongside** `terminal.reason = blocked` and never replaces it.
16. **Worker evidence binding.** Each `checks.worker[]` entry and each `delta.changes[].callIDs` entry must reference a tool call in `executionSessionId`. For a check, the call's part must be `completed` and must carry the claimed command or path in its input. H5 validates this against the existing part history. If validation fails, the claim is kept with `evidence: "unbound"`, and unbound evidence never counts toward any state. Worker checks never set `verification.state`.
17. **Revision binding gap (stated, not solved).** Host checks bind provenance to `git rev-parse HEAD` (`arsenal-completion.ts:119,133,143`) and run against the working directory. An uncommitted delta is therefore checked but not identified by `revision`. Until open decision O4 is settled, `WorkResult.delta` must state `baseRevision` and must not claim that the receipt identifies the delta's bytes.

#### E. Modes

18. **Mode derivation.** `direct` means the user drove the backend specialist with no Task dispatch. `delegated` means a Task dispatch with no completion receipt: `ArsenalCompletion.NativeHost.resolve` returned `undefined` because no `completion-arm` fact exists (`arsenal-bindings.ts:384-411`). `delegated-armed` means a receipt was issued (`tool/task.ts:427-430`). The packet contract (README WorkRequest) is the same in all three.
19. **Direct variant.** In direct use the user is the Maestro. The user supplies scope and checks, the backend specialist runs exactly the assigned checks and reports them in `checks.worker[]` with bound evidence, `verification.state = not-host-verified`, and the user decides acceptance. The only difference from delegated use is the missing harness receipt. Direct use never fabricates a receipt, `planID`, authorization or Maestro identity, and never reports `host-*`.
20. **Acceptance.** The backend specialist always emits `acceptance.state = "pending"`. An `accepted` or `rejected` state exists only as a decision by the deciding authority (Maestro when delegated, the user when direct), recorded outside the worker's output and referencing `taskId`, `executionSessionId` and the `WorkResult` it decided. Backend-specialist-authored acceptance, review verdicts or approval requests are invalid card content (`backend.txt`: "Forbidden: approval requests, self-review"). Independent review stays with the existing reviewer seam (`orchestra/src/maestro/validation-record.ts:348-415`, `recordReview`, `self-review` guard at :354). A review verdict is not acceptance.

#### F. Owned-tool envelope (`hugr-compose`, `hugr-scaffold`)

21. **Envelope fields.** The fields are frozen exactly as in `owned-tools.md` §Shared result semantics: `tool`, `status`, `producer`, `artifact_kind`, `artifacts`, `planned_files`, `observed_changes`, `effects`, `requirements`, `remaining_work`, `checks`, `error{code, reason, refs, uncertainty}`. F4 adds `schema: "hugr-owned-tool-v1"` and `contract_version` (the qualified producer contract, per `delivery-composer.md` contract item 1).
22. **Effects semantics.**
    - `none`: no project writes, verified.
    - `observed`: writes occurred, and `observed_changes` is the complete inventory.
    - `partial`: writes occurred and the intended publication did not complete, while `observed_changes` completely lists what was written.
    - `unknown`: observation lacked reach, so writes may be missing from `observed_changes`.

    `planned_files` is never evidence of a write.
23. **Status × effects × code legality.** Any other combination is `INVALID_PRODUCER_RESULT` and settles as `failed` with `effects: unknown`.

| `status` | Allowed `effects` | Allowed `error.code` | Other invariants |
| --- | --- | --- | --- |
| `previewed` | `none` | none | `artifacts` non-empty and recoverable; `observed_changes` empty |
| `generated` | `observed` | none | `artifact_kind` matches the requested kind; inventory complete; empty or skipped producer output is not allowed |
| `blocked` | `none` | `INVALID_INPUT`, `CAPABILITY_UNAVAILABLE`, `SELECTION_UNAVAILABLE`, `UNSUPPORTED_OUTPUT`, `OUTPUT_CONFLICT`, `PERMISSION_DENIED` | Decided before any project mutation |
| `failed` | `none`, `observed`, `partial`, `unknown` | `PRODUCER_FAILED`, `INVALID_PRODUCER_RESULT`, `OUTPUT_CONFLICT` (create race), `PERMISSION_DENIED` (mid-publish) | Effects preserved; no automatic replay |
| `interrupted` | `none`, `partial`, `unknown` | `CANCELLED`, `TIMEOUT` | `none` only if publication provably never started |

24. **Unqualified producer fallback.** The current producer returns `{ok, what_happened, result, next_steps, elapsed_ms}` with prose and no code (`P/mcp_tools/compose.py:71-78`, `P/mcp_tools/tier1.py:49-62`). It returns `ok:false` for conditions that are pre-mutation in reality: input errors at `compose.py:486-512` and an existing target at :516-530. It also returns `ok:true` for the material-less `tool_delegate` mode (:545-568). Until CQ ships the canonical envelope:
    - a legacy `ok:false` maps to `failed` + `PRODUCER_FAILED` with `effects: unknown` (or `none` only for `dry_run` compose).
    - `ok:true` with `mode: tool_delegate` maps to `blocked` + `UNSUPPORTED_OUTPUT`.
    - Any other legacy `ok:true` maps at most to `failed` + `INVALID_PRODUCER_RESULT` for qualified callers, because legacy `files_written` is not a complete inventory (`compose.py:628-638`; scaffold `files_created` is unvalidated, `tier1.py:484-506`).

    The bridge never parses `what_happened` prose to derive a code (`delivery-composer.md` contract item 12).
25. **Tool outcome is not task outcome.** `generated` feeds `delta.changes` (through `observed_changes`) and `delta.toolOutcomes`. `blocked` may become a `WorkResult` blocker of kind `tool`. `failed` or `interrupted` with `partial` or `unknown` effects must appear in `delta.toolOutcomes`, and the worker must reconcile them inside the assigned scope before any further mutating call (`owned-tools.md` "do not automatically replay mutating calls"). No tool status sets `terminal`, `verification` or `acceptance`. No tool status implies Memory success, and no Memory outcome changes a tool status (clause 30).
26. **Composer reason-code requirement (requirement, not decision).** The current bridge collapses every backend failure into `"HuGR Composer backend operation failed"`: the client throws on `isError` (`orchestra/src/plugin/hugr-composer/client.ts:87-88`), and the tools throw on `isError`, `ok:false` or a non-empty `error` (`tools.ts:21,28`). This drops the structured payload. The backend specialist's requirement is narrow: for every non-success, the native result must expose `tool`, `status`, `effects` and a closed-set `error.code` that the backend specialist can copy into a `tool` blocker. Whether producer messages or payloads also pass through, and in what bounded or sanitized form, is the Composer tool-contract owner's decision. Until a reason code exists, the qualified `hugr-compose` and `hugr-scaffold` cannot be advertised (`execution-plan.md` §2 done #5).

#### G. Failure settlement across native, CLI and MCP

27. **Native V1.** Success (`previewed`, `generated`) returns `{ title, output: <canonical JSON>, metadata: { hugrTool: <envelope> } }` through the existing `string | {output, metadata, attachments}` result (`plugin/src/tool.ts:36-43`). Non-success MUST settle through the real failure path, so the tool part status is `error`. The failure carries a message of the form `hugr-<op> <status> <CODE>`. Before throwing, the envelope MUST be streamed into the running metadata so that `failToolCall` keeps it (`processor.ts:187-200`). Returning a failed envelope as a successful result is non-conforming. Note that `ArsenalOutcome.classifyOutcome` would observe such a result as `failure` from `metadata.isError`/`exitCode` (`orchestra/src/maestro/arsenal-outcome.ts:4-17`), but the part would still be `completed`.
28. **Plugin metadata seam (required-new, H2/CB).** Plugin tools receive `pluginCtx = {...toolCtx, ask, directory, worktree}` (`orchestra/src/tool/registry.ts:215-220`). Native `Tool.Context.metadata` returns an `Effect` (`orchestra/src/tool/tool.ts:52`), while plugin `ToolContext.metadata` returns `void` (`plugin/src/tool.ts:18`). From source, a plugin call to `context.metadata(...)` appears to build an Effect that nothing runs, so it would not reach the streamed-metadata channel. This needs a CB/Q-tools witness. Either H2 (owner of `tool/registry.ts`) adapts the bridge, or CB registers the qualified tools as native `Tool.define` tools. Clause 27 is unsatisfiable for plugin-registered tools until this is fixed.
29. **ToolSafety interaction.** `ToolSafety.Denied` raised by `before` / `beforeInvocation` (`registry.ts:206-214`, `tool-safety.ts:134-231`) happens before `execute`, so it is equivalent to `blocked` + `PERMISSION_DENIED` with `effects: none`, and no envelope exists. A `Denied` raised by post-execution `inspect` (`registry.ts:233,238`; `tool-safety.ts:266-269`) replaces the tool's result after it may already have written files. For mutating owned tools this settles as `failed` with `effects: unknown`, unless the envelope was streamed first (clause 27). The `ToolSafety.Observation` outcome (`started|success|failure|cancelled|held`, `tool-safety.ts:80-88`) is audit, not envelope status. Both are recorded, and neither replaces the other.
30. **Memory is separate.** A backend specialist Atlas write is its own tool call with its own F3 outcome (`admitted`/`refused`/`unavailable`/`uncertain`) in `WorkResult.memory.writes[]`. A refused or uncertain write never changes a tool envelope, `terminal`, `verification` or `delta`, and never triggers a replay of a tool or generation call (`integration-flow.md` §Tools do not secretly own memory).
31. **MCP, served (the backend specialist's owned tools exposed over MCP; required-new).** Non-success sets `isError: true` and carries the envelope in **both** `structuredContent` and `content[0].text` as JSON. The text copy is needed because the V1 MCP consumer throws on `isError` and keeps only joined text (`orchestra/src/mcp/catalog.ts:68-74`). For non-error results it also uses `structuredContent` only when `content` is empty (:76-80). The current producer server registers plain FastMCP tools with no output schema (`P/mcp_tools/discovery.py:380-384`) and returns `ok:false` as a non-error result. Producer exceptions such as the `ValueError` raised by `path_guard.output_dir` (`P/mcp_tools/path_guard.py:9-20`) become whatever FastMCP emits by default, and that behavior was not verified here.
32. **MCP, consumed (Orchestra as client).** Settlement is the existing path: the tool error reaches `failToolCall`, and the `ToolSafety` observation is `failure` (`session/tools.ts:543-552`). The `isError` field set at `session/tools.ts:528` is not reached for errored calls, because `catalog.ts:68` throws first. Consumers recover the envelope from the error text JSON (clause 31), never from prose.
33. **CLI (required-new).** `hugr-backend compose|scaffold --input <request.json> --json` writes exactly one canonical envelope to stdout on every path, including non-success. Exit codes are 0 for `previewed`/`generated`, 2 for `blocked`, 1 for `failed`, and 130 for `interrupted`. An exit code of 0 with any other status is non-conforming. The current Composer CLI is a stdio MCP server only (`P/mcp_tools/cli.py:6-12`), and no execution-plan WP owns `hugr-backend` (see Source anchors).
34. **Surface equivalence.** One shared handler produces the envelope. The native, CLI and MCP adapters only parse, bind and encode it. For the same bound request, all three surfaces yield the same `status`, `effects`, `error.code` and inventory. Mutating calls keep `{retry:false}` on every surface, including reconnect (`client.ts:44-52,77-82`; `tools.ts:62,117`).

#### H. Background and delivery

35. **Delivery is not result.** Background Task results are injected into the parent with `Effect.ignore` (`tool/task.ts:584-611`), so delivery failure is invisible today. F4 does not claim delivery. Persistence of `metadata.workResult` on the child's Task part is the only result fact. A delivery retry re-reads that fact and never re-runs the work.

### Source anchors

Existing (consumed, not reinvented):
- `orchestra/src/maestro/arsenal-completion.ts:24` CheckOutcome; `:43-48` Capture; `:59` Receipt `{taskID, planID, directory}`; `:104-124` `beforeDispatch`; `:126-158` `verifiedCompletion` and drift/HOLD reasons; `:164-207` built-in host checks (`owned-files`, `git-state`).
- `orchestra/src/maestro/arsenal-bindings.ts:380-436` `resolve` (arm lookup, native Maestro required); `:489-562` production host checks; `:563-598` `observe` → durable `completion-check` fact; `:742` `completion-arm` emission. `orchestra/src/tool/registry.ts:150` constructs TaskTool under `runtime.construct` (NativeHost provided).
- `orchestra/src/tool/task.ts:109-124` rendered output; `:427-430` receipt dispatch (`taskID` = child Session); `:446-458` metadata; `:462-492` strict replay + HOLD; `:561-580` failure/HOLD/verified metadata; `:584-611` background inject; `:679-711` abort/cancel; `:735` `orDie`.
- `core/src/tool-safety.ts:58-64` `Denied` ("Tool safety HOLD: …"); `:80-88` `Observation`; `:134-231` `before`; `:233-260` `run` outcome classification; `:266-269` `inspect`; `:301-309` `sanitizeFailure`. `core/src/tool-safety-output.ts:6-14` outcome from structured output. `orchestra/src/maestro/arsenal-outcome.ts:4-17`.
- `orchestra/src/session/processor.ts:187-200` failure keeps streamed metadata; `:204-205` permission rejection → blocked; `:604-607` abort → `interrupted: true`. `orchestra/src/session/tools.ts:116-127,543-552` intercept; `:432-536` MCP path. `orchestra/src/mcp/catalog.ts:68-80`.
- `orchestra/src/plugin/hugr-composer/client.ts:9-10,44-89`; `tools.ts:7-32,47-64,102-120,193-202`. `plugin/src/tool.ts:3-43`; `orchestra/src/tool/registry.ts:201-254`.
- `orchestra/src/maestro/validation-record.ts:21,141-146` (validation PASS/FAIL/HOLD → VALID/INVALID/HOLD), `:348-415` review (Lucy, APPROVE/FIX_FIRST/REJECT, self-review guard). There is no task-result acceptance event in `schema/src/maestro-event.ts` (plan-revision `acceptance` at :202 is criteria, not a decision).
- Composer `P/mcp_tools/compose.py:71-78,486-530,545-568,608-675`; `P/mcp_tools/tier1.py:49-62,440-506`; `P/mcp_tools/path_guard.py:9-20`; `P/mcp_tools/discovery.py:372-384`; `P/mcp_tools/cli.py:6-12`.

Required-new (owner WP):
- `WorkResult` assembly, card decoding, evidence binding, pre-failure metadata streaming, typed host reasons, `baseRevision` export, verification projection from the capture: **H5** (`tool/task.ts`, maestro files).
- Logical `taskId` and direct-mode authority binding: **F2 → H2/H5**.
- Memory outcome vocabulary and receipts: **F3 → A1/A4**.
- Return-card instruction in `backend.txt`: **H1**.
- Canonical producer envelope, codes, capability/contract version and inventory: **CQ** (CC/CS producers).
- Bridge mapping, legality matrix enforcement, native failure settlement, reason-code exposure (policy per the Composer tool-contract owner): **CB**.
- Plugin `metadata` bridge: **H2** (registry) or **CB** (native registration), decided at LEAD-0.
- Conformance witnesses for clauses 22–34, including negative controls: **CV + Q-tools**.
- `hugr-backend` CLI and backend-specialist-served MCP adapter: **unassigned in §4. LEAD-0 must assign** (candidates are `packages/backend-specialist` (C) or CQ `mcp_tools/cli.py`).
- Acceptance decision record: depends on O3.

### Consumers

- **H5** implements §B–E and clause 35. It also depends on F2.
- **CQ** emits the §F envelope and codes. **CC/CS** produce it per operation.
- **CB** maps and settles §F–G.
- **CV** and **Q-tools** witness every legality row, settlement path and adverse control (false producer success, partial or cancel, post-inspect denial, plugin metadata loss).
- Secondary consumers: **H3** (lifecycle terminal semantics depend on F4), **S/T-owned** recipes (`references/recipes/hugr/**` describe outcomes in this vocabulary), and **Q-memory** (the separation in clause 30).

### Non-goals

- New scheduler, task database, run container, delivery receipt or acceptance UI.
- Scope enforcement by the backend specialist. `ToolSafety` profiles and native permissions own it, and the backend specialist only reports denials.
- Re-implementing host checks or the completion evaluator. Defining which checks a packet contains (Maestro or the user decides).
- Review semantics (Lucy's receipt) and merge or commit policy.
- Atlas entry templates, owner binding or receipt shapes (F3). Identity binding (F2).
- The V2 adapter. Governed V2 delegation is unavailable (README §V2).
- Deciding what the Composer bridge exposes beyond the reason-code requirement in clause 26.

### Open owner decisions

- **O1. Unarmed delegation.** May Maestro accept a delegated backend specialist result that has no completion receipt (`mode: delegated`, `verification: not-host-verified`)? Or must every Maestro→the backend specialist dispatch be armed?
- **O2. Acceptance override.** May the deciding authority accept a result whose verification is `host-failed` or `host-incomplete` (known baseline failure, flaky or unavailable check)? If so, must the override record a reason?
- **O3. Acceptance record.** Should accept or reject be a durable host record for delegated work (a new Maestro event), for direct work, or for both? Or does it stay conversational, leaving durable results permanently `pending`?
- **O4. Delta identity for verification.** Host checks bind provenance to git HEAD while the backend specialist's delta is normally uncommitted. Should the delta be committed before verification, and by whom (the backend specialist's charter forbids merge but says nothing about commit)? Or should the harness bind a working-tree digest instead?
- **O5. Duplicate check runs in armed mode.** In `delegated-armed` mode, does the backend specialist also run the packet's checks before returning (repairs earlier, costs more time)? Or does it rely only on the harness run?

Routed, not product-owner: the Composer failure-detail policy (clause 26) goes to the Composer tool-contract owner. The owners of the `hugr-backend` CLI, the served MCP adapter and the plugin metadata bridge are assigned at LEAD-0.
