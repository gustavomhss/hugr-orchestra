# R07 — Portable specialist contracts inside Orchestra

Research date: **2026-10-03**. Worktree base: `76015a9dcd5b0c77164a3f1bee49b0060a4d37f0`.

**Recommendation:** borrow contracts; keep the backend specialist independent backend-specialist plugin. OpenCode/Orchestra owns model loop, Session lifecycle, execution, permissions, durable admission, and result acceptance. Maestro supplies optional native orchestration. The backend specialist uses native Atlas Knowledge/Memory through host-granted capabilities. Environment-configurable names are display/routing aliases; persisted specialist, capability, task, approval, and knowledge identities stay stable.

Evidence below covers official OpenAI Agents **Python** SDK, LangGraph Python, and PydanticAI sources/docs, including current PydanticAI Harness persistence. Source revisions are inspected repository HEADs, not claims about installed packages or TypeScript API parity. Host mappings are **proposals constrained by supplied Session V2 rules**, not assertions that new extension points already exist.

## Six mechanisms worth extracting

### M1. Bounded request/result seam

**Observed:** OpenAI distinguishes manager-controlled agents-as-tools from handoffs that transfer active conversation control. Its actual `as_tool()` implementation invokes a nested `Runner.run`; import boundary alone would not preserve host loop ownership. PydanticAI separates deferred execution `calls` from `approvals`, correlates results by tool-call ID, and demonstrates task identity distinct from call identity. `build_results()` checks IDs against the appropriate pending category. [O1, O2, P1, P2]

**Borrow:** versioned host `TaskRequest` and correlated `TaskResult`, usable through standalone plugin entrypoint or Maestro adapter. Stable task identity spans retries; operation identity spans repeated attempts at one intended effect. Model-generated call IDs remain correlations, not task identity or authorization. Resolve configurable aliases to stable IDs before admission.

**Fit/cost:** high fit; medium cost: schemas, host registry binding, durable correlation. Copying `as_tool()` would import unwanted nested execution.

### M2. Typed output plus host-owned acceptance

**Observed:** OpenAI `AgentOutputSchema.validate_json()` performs runtime validation. PydanticAI validates typed outputs and supports output validators requesting correction through `ModelRetry`. Important exception: `StructuredDict` supplies JSON Schema without validating received contents against it. Streaming output validators can see partial values. [O3, P3]

**Borrow:** tagged results: `candidate`, `blocked`, `failed`, `cancelled`; candidate carries artifact/evidence references. Host validates complete result, current task revision, artifact digest, evidence producer, and required verification outcomes before recording accepted completion. Model text, well-formed JSON, or stream termination cannot independently complete task. Evidence means host-verifiable receipts, not agent-authored `testsPassed: true`.

**Fit/cost:** high fit; low schema cost, medium acceptance/evidence integration cost. Artifact correctness still depends on meaningful verification.

### M3. Durable, identity-bound approval

**Observed:** OpenAI pauses with interruptions and resumes from `RunState`; documented server-side approval flow uses trusted snapshots, authenticated/authorized reviewers, and atomic owner-checked consumption. Deserialization does not authenticate snapshots. Client-carried snapshots require application verification of complete integrity, ownership, and replay protection. PydanticAI explicitly warns that client-supplied history can fabricate calls and approvals. LangGraph supports interrupt-ID resume maps, but multiple interrupts inside one node still match resume values by index. [O4, P1, P4, L1, L2]

**Borrow:** server-owned approval binds Session/task, stable specialist/tool IDs, operation ID, canonical material-arguments digest, semantic tool/policy version, and expected task revision. Reviewer identity comes from host authentication. Decision submission carries opaque approval ID and decision; host loads original request, rechecks current permission, atomically records decision and durable resume intent. Arguments changed by reviewer produce a newly bound request. Persist decision even if scheduling fails; reconcile before explicit recovery.

**Fit/cost:** high fit; medium/high cost: durable approval records and race handling. Cosmetic rename must preserve identity; changed authority, tool semantics, or arguments must invalidate prior approval. Agent recommendation never substitutes for human grant.

### M4. Effect uncertainty separate from retry

**Observed:** LangGraph restarts interrupted node from beginning; earlier effects can repeat. Current PydanticAI Harness records effect lifecycle separately from settled message snapshots. `started` without terminal update means `unknown_after_crash`; even failed tools may have partial effects. Docs assign effect deduplication to application and explicitly reject automatic execution-recovery guarantees. [L1, P5, P6]

**Borrow:** record logical operation and input fingerprint before dispatch; persist outcome/receipt separately. Reuse operation key for retries of same intent. External idempotency key or outcome reconciliation must cover crash after external commit but before local receipt. Otherwise return blocked/unknown and require explicit recovery. Snapshot rollback cannot undo external effects.

**Fit/cost:** essential fit; highest cost: durable boundaries plus tool-specific reconciliation. Native prompt exact-retry admission protects `session_input`, not arbitrary tool effects. The backend specialist cannot add automatic post-crash provider replay through advisory `wake`.

### M5. Checkpoint lineage as references, not runtime transfer

**Observed:** LangGraph snapshots expose checkpoint identity/namespace, `parent_config`, and pending tasks; underlying checkpoint records carry channel versions. Replay after selected checkpoint re-executes subsequent work. PydanticAI separates conversation sequence from parent-run hierarchy; its `fork_run()` returns history and leaves new identity/lineage to caller. Its snapshots omit capability state and workspace files. [L3, L4, P5, P6, P7]

**Borrow:** task checkpoint references native Session/history position or Context Epoch, parent checkpoint, task revision, repository/working-tree digest, contract/tool versions, and relevant Atlas item revisions. Resume checks expected head/revision atomically; stale reference conflicts. Explicit fork gets new branch/task identity and parent link; effect reconciliation still required. Reject incompatible versions rather than silently treating them as latest.

**Fit/cost:** high fit; medium cost: native references, revision checks, retention. Host Session drain remains process-local with no durable run identity; SDK `run_id` cannot become drain ID. EventV2 replay claims remain separate from Session execution ownership.

### M6. Failure classes with bounded recovery

**Observed:** PydanticAI distinguishes corrective `ModelRetry`, terminal tool-result `ToolFailed`, approval deferral, provider errors, limits, and cancellation. `ToolFailed` does not consume tool retry budget; docs recommend run-level limits for repeated failures. LangGraph `RetryPolicy` has exception filtering, backoff, jitter, and maximum attempts including first attempt. Retry implementation propagates interrupt control flow separately. [P8, L2, L5]

**Borrow:** separate `invalid_result`, `transient_transport`, `denied`, `cancelled`, `limit_reached`, `permanent_failure`, and `effect_unknown`. Host decides recovery: bounded model correction; safe transport retry; terminal denial/cancellation; explicit reconciliation for uncertainty. Keep operation/task budgets across reconnects; preserve native steer/queue provider-turn allowance semantics. Failed required tool or unresolved effect prevents candidate acceptance.

**Fit/cost:** high fit; low/medium cost: typed errors and persistent policy counters. The backend specialist reports failure facts; host schedules recovery.

## Minimal proposed contract contents

| Record | Required meaning |
|---|---|
| Task request | Contract version; stable task/specialist IDs; native Session/admission correlation; optional parent task; scoped capability references; immutable input and expected-result schema references; retry identity. Names excluded from identity. |
| Task result | Task/operation correlation; expected revision; tagged outcome; structured data; artifact and evidence references. Host supplies authenticated producer attribution. |
| Approval | Opaque ID; bound operation/arguments/policy; reviewer principal; decision; revision; consumption state. Separate from result and checkpoint. |
| Checkpoint | Parent/reference identity; native history/context position; settled status; code/input/Atlas revisions. Separate from live execution owner and permissions. |
| Effect record | Logical operation key; input fingerprint; dispatch state; observed outcome; authoritative receipt or explicit uncertainty. |

Reuse native durable records/services where contracts fit; exact storage/API changes require host code audit. Portable wire payloads contain data and references, not Python classes, captured closures, credentials, or framework execution snapshots.

## Counterexamples and real acceptance tests

**Specifications only; not executed in this research.** Exercise actual host entrypoints, persistent DB, temporary workspace, and real test-tool side effects. Each negative case needs matching valid control; removing relevant check must make test fail.

| Case | Counterexample and executable acceptance scenario |
|---|---|
| T1 — retry duplication | Tool commits DB mutation; host process dies before recording receipt. Restart, resend exact task/admission, then explicit recovery. Assert one admitted input and one external mutation when tool supports idempotency/reconciliation. Without such support, assert `effect_unknown` and no automatic replay. Changed payload/delivery with reused admission identity must conflict. Control: fresh intent runs. |
| T2 — lost approval identity | Pending request stored as “approve the backend specialist's next delete”; rename/reorder or duplicate display name grants different call. Persist real approval, restart host, rename aliases, then submit original decision. Exact bound operation alone may proceed. Different Session, arguments, tool identity, unauthorized reviewer, and replayed decision must fail. Race two valid submissions: one consumed decision and one scheduled operation. |
| T3 — stale checkpoint | Client holds checkpoint N; task advances to N+1 or workspace changes. Resume N through actual host route. Assert conflict and no dispatch; load current compatible reference and assert valid continuation. Explicit fork retains parent reference but cannot inherit stale approvals or silently reuse completed effects as permission to repeat them. |
| T4 — forged completion | Submit schema-valid `candidate` claiming passing tests, forged producer identity, missing receipt, or artifact modified after verification. Host must reject acceptance. Stream disconnect and pending tool batch also cannot complete task. Control: host-produced successful verification receipt bound to current artifact/task revision permits one accepted transition. |
| T5 — failure/cancellation | Test tool returns permanent failure, transient error, and commit-then-disconnect at controlled boundaries. Assert respective terminal outcome, configured bounded retry, and unknown-effect handling. Cancel active native Session ownership chain; late result cannot become success. Required-tool failure cannot be hidden by co-emitted final answer. |
| T6 — identity/host/Atlas fit | Same task flow with Maestro absent/present and labels renamed. Assert stable specialist/task/Atlas references, same authorized Knowledge/Memory access, and rejected cross-scope access. Compare provider fixture's full request log with native boundary: one host-attributed `llm.stream(request)` per provider turn, with no unmatched provider requests. New steer/queue input follows native admission/promotion semantics. Model-supplied approval/completion claims never gain host authority. |

## Rejected complexity; framing gaps

- Reject framework/runtime migration, nested SDK runners, second Session store, Pregel/channel replay machinery, and distributed workflow engines. Cost buys ownership conflicts for this plugin scope.
- Reject checkpoint import/export as “portable task protocol,” display names as primary keys, positional approval identity, blind retries, and generic sticky approvals.
- Keep Atlas Knowledge/Memory native. LangGraph distinguishes checkpoints from cross-thread stores; PydanticAI distinguishes history from persistent memory. Borrow distinction, not additional memory backend. Knowledge/Memory content remains scoped evidence/context, never authorization or completion receipt. [L6, P9]
- Framing missed **independent identity axes**: specialist, task, Session, operation, attempt, approval, checkpoint, parent task. Names and hierarchy alone cannot carry retry or approval semantics.
- Framing missed **acceptance authority and external atomicity**: “agent finished,” “history resumable,” and “effect verified” differ. Old settled checkpoint can predate real side effect. Approval grants action, not truth of result.
- Framing missed **version/retention boundaries**: semantic tool change, dirty workspace, changed Atlas revision, or pruned evidence can invalidate continuation. Shared memory does not imply shared write authority. Current PydanticAI persistence is richer than older deferred-history-only descriptions, but still documents these execution limits.

## Verified primary source register

Docs fetched successfully on research date; moving docs may change. Source paths/revisions below read through GitHub API or raw URLs. `ai.pydantic.dev/deferred-tools/` redirected to current Pydantic docs; LangGraph's former `durable-execution` URL returned Persistence, so checkpoint claims cite current Checkpointers page.

### OpenAI Agents Python — `81f0ccf20c6e24063b9da36fa37f2bdb6a43d8d3`

- **O1:** [Agent orchestration](https://openai.github.io/openai-agents-python/multi_agent/).
- **O2:** [`Agent.as_tool`, lines 606–666; nested Runner, 1044–1059](https://github.com/openai/openai-agents-python/blob/81f0ccf20c6e24063b9da36fa37f2bdb6a43d8d3/src/agents/agent.py#L606-L666).
- **O3:** [`AgentOutputSchema`](https://raw.githubusercontent.com/openai/openai-agents-python/81f0ccf20c6e24063b9da36fa37f2bdb6a43d8d3/src/agents/agent_output.py).
- **O4:** [Human-in-the-loop](https://openai.github.io/openai-agents-python/human_in_the_loop/); [pinned documentation](https://github.com/openai/openai-agents-python/blob/81f0ccf20c6e24063b9da36fa37f2bdb6a43d8d3/docs/human_in_the_loop.md#L191-L224).

### LangGraph Python — `9a0394d88b2211f299dcd69df92db3480c69ee61`

- **L1:** [Interrupts](https://docs.langchain.com/oss/python/langgraph/interrupts). Typed response schemas require `langgraph>=1.2.12`; raw JSON Schema dictionaries are exposed without runtime validation.
- **L2:** [`RetryPolicy`, `StateSnapshot`, and `interrupt`](https://github.com/langchain-ai/langgraph/blob/9a0394d88b2211f299dcd69df92db3480c69ee61/libs/langgraph/langgraph/types.py); inspected lines 427–446, 711–735, 991–1035.
- **L3:** [Checkpointers](https://docs.langchain.com/oss/python/langgraph/checkpointers).
- **L4:** [`CheckpointMetadata`, `Checkpoint`, `CheckpointTuple`](https://github.com/langchain-ai/langgraph/blob/9a0394d88b2211f299dcd69df92db3480c69ee61/libs/checkpoint/langgraph/checkpoint/base/__init__.py#L39-L147).
- **L5:** [Retry implementation](https://raw.githubusercontent.com/langchain-ai/langgraph/9a0394d88b2211f299dcd69df92db3480c69ee61/libs/langgraph/langgraph/pregel/_retry.py).
- **L6:** [Persistence: checkpointer versus store](https://docs.langchain.com/oss/python/langgraph/persistence).
- Documentation source cross-check: [`interrupts.mdx` at `b7119d5c5fd07711477bb42910149eddbad8648d`](https://github.com/langchain-ai/docs/blob/b7119d5c5fd07711477bb42910149eddbad8648d/src/oss/langgraph/interrupts.mdx).

### PydanticAI — `f06bba53794db67d7fc2bb2bcf06c2e85edf450e`

- **P1:** [Deferred tools](https://pydantic.dev/docs/ai/tools-toolsets/deferred-tools/).
- **P2:** [Deferred request/result implementation](https://raw.githubusercontent.com/pydantic/pydantic-ai/f06bba53794db67d7fc2bb2bcf06c2e85edf450e/pydantic_ai_slim/pydantic_ai/_deferred.py). `tools.py` re-exports these types.
- **P3:** [Output: typed validation, validators, custom JSON Schema, streaming](https://pydantic.dev/docs/ai/core-concepts/output/).
- **P4:** [Messages/history: identity and client-history trust boundary](https://pydantic.dev/docs/ai/core-concepts/message-history/).
- **P5:** [Harness Step Persistence](https://pydantic.dev/docs/ai/harness/step-persistence/); [pinned documentation](https://github.com/pydantic/pydantic-ai/blob/f06bba53794db67d7fc2bb2bcf06c2e85edf450e/docs/harness/step-persistence.md).
- **P6:** [Effect, snapshot, event, and lineage types](https://raw.githubusercontent.com/pydantic/pydantic-ai/f06bba53794db67d7fc2bb2bcf06c2e85edf450e/src/pydantic_ai_harness/pydantic_ai_harness/step_persistence/_types.py).
- **P7:** [Continuation/fork helpers](https://raw.githubusercontent.com/pydantic/pydantic-ai/f06bba53794db67d7fc2bb2bcf06c2e85edf450e/src/pydantic_ai_harness/pydantic_ai_harness/step_persistence/_helpers.py).
- **P8:** [Failure and cancellation types](https://raw.githubusercontent.com/pydantic/pydantic-ai/f06bba53794db67d7fc2bb2bcf06c2e85edf450e/pydantic_ai_slim/pydantic_ai/exceptions.py).
- **P9:** [Pinned persistence documentation: history, execution, and memory distinction](https://raw.githubusercontent.com/pydantic/pydantic-ai/f06bba53794db67d7fc2bb2bcf06c2e85edf450e/docs/persistence.md).

### License/reuse disposition

Recommend independent implementation of contract patterns, **not source-code reuse or dependencies**. Repository license texts inspected at same revisions:

- [OpenAI: MIT, copyright OpenAI](https://raw.githubusercontent.com/openai/openai-agents-python/81f0ccf20c6e24063b9da36fa37f2bdb6a43d8d3/LICENSE).
- [LangGraph: MIT, copyright LangChain, Inc.](https://raw.githubusercontent.com/langchain-ai/langgraph/9a0394d88b2211f299dcd69df92db3480c69ee61/LICENSE).
- [PydanticAI: MIT, copyright Pydantic Services Inc.](https://raw.githubusercontent.com/pydantic/pydantic-ai/f06bba53794db67d7fc2bb2bcf06c2e85edf450e/LICENSE).

MIT requires retaining copyright and permission notice in copies/substantial portions. These checks cover linked repository code; they do not license unrelated hosted services, dependencies, or separate documentation repositories.
