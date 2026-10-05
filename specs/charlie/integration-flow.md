# Charlie, Maestro and Atlas: task and memory flow

Status: integration design, 2026-10-04. Ownership and required behavior are explicit; the complete Charlie plugin/binding has not been implemented or exercised.

Memory terminology and access rules follow the [canonical Atlas source check](atlas-memory-contract.md), including the distinction between stored kinds, derived header slabs and current integration limits.

## Responsibilities

| Participant | Responsibility |
| --- | --- |
| Maestro | Supply assigned behavior, scope, permissions, context/decision references and acceptance requirements; receive results and route independent review or unresolved decisions |
| Charlie | Implement inside that assignment, make local coding choices, execute assigned/required checks, return artifacts/results/blockers and record his own implementation experience |
| Atlas | Supply shared project Knowledge and Charlie's member-scoped Memory; own storage, retrieval, freshness and admission of memory/rules |
| Harness | Bind actual project/member/Session identity and authority; execute tools, persist native history/evidence, enforce permissions, manage cache/compaction/cancellation |

In direct operation, the user/caller supplies the assignment in place of Maestro. Charlie keeps the same role and the same Atlas memory ownership. Pure CLI/MCP generation can run without a conversational Session where supported; it does not fabricate a Session, memory owner or memory receipt.

## Charlie has his own memory in Atlas

Memory is scoped by **Atlas project + stable member ID**, with task or PR identity added for the relevant record. The initial member ID remains `charlie`; a public-name change or new execution Session does not create a different member memory.

| Stored kind | What belongs there | Access |
| --- | --- | --- |
| `task` | `taskId`, `attempted[]`, `failedWith[]`, `stoppedAt`, `lesson`, optional `ref` | Consultable on demand; own resumed-unit fold has the narrow spawn-time exception |
| `pr` | `prId`, `decisions[]`, `reviewOutcomes[]`, `knowledgeDelta[]`, optional `ref` | Consultable on demand; normative own-PR re-spawn push must respect the implementation gaps documented in the source check |
| `project` | `rule`, `scope`, `frecency`, optional `grounding` | Charlie's bounded Rules slab is **always injected into his running context**, not left to an optional lookup |
| `logbook` | Structured PR decision journal with fixed narrative/index fields | Orchestrator-only authoring; consultable, never running-turn injection. Maestro's responsibility, not Charlie's diary |

All members, including Maestro, have `task`, `pr` and `project`; the orchestrator additionally has `logbook`. Atlas's current logbook author key is `orch`. This is member-scoped injection over shared storage, not a confidentiality guarantee.

The full injected header is **Awareness + Orientation + Rules**. Awareness and Orientation are shared derived project context, not additional written memories. Only Rules comes from the member's `project` entries. Task/PR/logbook history is not inserted wholesale into every turn.

Shared Knowledge contains repository facts; personal Memory contains attributed experience. A successful tool call is not automatically a new project rule or shared fact. Rule promotion and Knowledge admission use their respective native Atlas doors.

Folding the earlier `backend-memory` skill into `backend-implement` only simplified skill packaging. It did not remove Charlie's Task, PR or Project Memory requirement.

## Lifecycle

1. **Receive:** Maestro/caller supplies the assignment. The host binds the actual project, stable member, logical task and authority/execution relationship.
2. **Load:** host supplies Awareness, Orientation and Charlie's bounded Project Rules as running context, together with assigned Knowledge/Own references. Explicitly recall relevant task/PR history when needed. On re-spawn, the own resumed-unit fold is a required one-time push through the supported binding, not general archive injection or an already-proven PR/latest-fold implementation.
3. **Implement:** use matching skills and owned or supplied tools. Existing native history/tool records remain the evidence of what happened.
4. **Checkpoint:** record meaningful progress, observed failures and stopping point using the existing TaskMemoryEntry fields and artifact/check `ref`. Do not invent a new checkpoint kind or extra schema fields, a root-cause conclusion, or an unobserved success.
5. **Return:** deliver code, actual checks and blockers to Maestro/caller. Record task outcome and, when applicable, PR experience; memory-write status accompanies the handoff.
6. **Learn:** deliberately propose a reusable `project` rule when evidence warrants it. Use native admission/ranking policy; a model's assertion or invented frecency is not promotion or a logged cited hit.
7. **Resume:** resolve the same project/member/logical task, revalidate applicability and continue from retained work. Stale or insufficient input returns a precise blocker without a new investigation.

Checkpoints are meaningful events, not mandatory writes after every tool call. An abrupt stop may leave an earlier checkpoint; neither Charlie nor the host fabricates a final fold.

## Tools do not secretly own memory

`hugr-compose`, `hugr-scaffold` and external generators return generation facts and artifacts. They do not select an Atlas owner, append private memory files or declare a lesson accepted. Charlie/native integration records relevant experience through the existing bound Atlas capability.

Tool success and memory success remain distinct. If code generation completed but a checkpoint was refused, preserve both facts. On an uncertain memory append, reconcile through the native receipt/state contract; do not blindly append again or rerun code generation to recreate a note.

On Atlas degradation, report the affected read/write capability. Assigned code work can continue only when its supplied context remains sufficient; operations needing unavailable fresh evidence remain blocked. A local Markdown memory file is not a substitute for Atlas.

## Identity and integration status

Persistent owner and execution provenance differ: memory uses the stable member within the project; receipts retain actual authority Session, executing child Session and native invocation references. Model tool arguments cannot supply replacement authority or ownership.

The exact binding, admission, worktree placement, degradation and source-backed compatibility constraints are recorded in [atlas.md](atlas.md) and [atlas-memory-contract.md](atlas-memory-contract.md). Source currently distinguishes internal resume helpers from public read tools and lacks the full durable PR/latest-fold path; this flow does not claim those gaps are already closed. It consumes native capabilities rather than introducing a store, task database, scheduler or replacement context system. Required integration behavior must be tested through actual supported interfaces before being called implemented.
