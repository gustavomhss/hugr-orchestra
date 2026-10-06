# The backend specialist frozen interfaces F1 and F2 — draft for LEAD-0

Status: draft contract text, 2026-10-05. Source baseline: Orchestra worktree `_worktrees/backend-plugin`, HEAD `d11d8652aa` (`fork/dev`). Source-read only; no test, typecheck or install was run. Anchors are `file:line @ d11d8652aa`; **O** = `packages/opencode/src`, **C** = `packages/core/src`, **P** = `packages/plugin/src`.

Normative words: MUST / MUST NOT / MAY. "Existing" means the behavior is in source at HEAD. "Required new (WP)" means the work package that owns it must add it; no signature below is claimed to exist unless it is marked existing.

Owner rulings this draft applies and does not reopen: Maestro owns scope and permissions per task; the harness owns execution and enforcement; the backend specialist only implements. In direct use (no Maestro) the user acts as Maestro and supplies the same packet. `ToolSafety` (`C/tool-safety*.ts`, wired through `intercept` in `O/session/tools.ts`) is the harness enforcement point, and the backend specialist builds no scope enforcement of its own. Unmodified upstream OpenCode is out of support.

---

## F1 — Native seat adoption

### Contract

**Identity**

- **F1.1 Stable ID.** The backend specialist's identity is the string `backend`. It is the roster `memberId`, the Agent.Info `id`, the agents-map key, the Task `subagent_type`, the Session/message `agent` value, the permission subject, the Atlas memory owner (F3) and the value inside every receipt and hash. It MUST NOT change across releases or labels. Nothing derives it from a label, prompt text or model argument.
- **F1.2 Display label is presentation only.** The host resolves the label once at startup from a single configuration source (default `BACKEND_DEFAULT_LABEL`). It renders that label in `Agent.Info.name`, the description, menus, Task child titles, return cards and charter interpolation. The label MUST NOT be used as a lookup key, routing key, grant subject, memory owner or hash input. *Required new (H1):* a label resolver. Today the label is the fixed `displayName: "the backend specialist"`, and the proposed variable `HUGR_BACKEND_NAME` has no source reference.
- **F1.3 Startup validation.** The host MUST validate the label before it builds agent state. The rules:
  - The trimmed label must be non-empty.
  - It must be a single line with no control characters, and its length is bounded.
  - It must not equal `Maestro`, and it must not equal any agent key or any other native label after NFC normalization and case folding. This rule exists because legacy `.name` paths (F1.12) would otherwise become ambiguous.
  - Unicode is allowed.

  An invalid label produces an explicit configuration error; what happens next is decision F1-D1. A label that duplicates another active roster label produces a diagnostic and never changes routing.
- **F1.4 Hash separation precedes renaming.** Roster, grant and review-policy hashes MUST be computed over a behavioral projection that excludes `displayName` and label-interpolated prompt bytes. The charter is hashed as a template. Historical receipts are verified with a versioned algorithm, and recorded hashes are never rewritten. `route-grant.ts` already uses such a projection. *Required new (H5):* the projected `rosterHash` and `reviewPolicyHash`. **Until F1.4 lands, the host MUST treat any label other than the default as unsupported configuration (F1.3 error path).**

**Registration and mode**

- **F1.5 Host-owned adoption.** Only the host's native registration (`agent.ts` + `roster.ts`, H1) adopts the backend specialist. The V1 plugin `config` and `tool` hooks MUST NOT be able to replace a native seat's charter, mode, permissions, name or ID. The existing native-seat config restriction stays (model, variant and temperature only). There is no plugin-facing agent-registration or selected-agent hook, and no consumer may assume one. The backend specialist package supplies its charter, skills and references as assets that the host admits at registration. *Required new (H1):* the asset admission seam.
- **F1.6 Primary and delegatable.** The backend specialist is registered with `mode: "all"`, `native: true` and is not hidden. This keeps it in the Task catalog, which filters out only `primary`, and makes it a valid primary or `default_agent`. Direct selection and delegated selection run the same Agent.Info, charter, skills and grants. Primary mode MUST NOT add permissions: native seats keep the profile-only ruleset and do not merge `defaults` or user permission.
- **F1.7 No outward delegation or orchestration.** The backend specialist MUST NOT obtain `task`, any `maestro_*` tool, the Arsenal tools, or the approval, validation, review or authorization tools. Authorized and governed Task dispatch still requires a native Maestro caller. Every one of these exclusions is already enforced in source.

**Grants and enforcement**

- **F1.8 backend-specialist-only grants.** The backend specialist's grants are a dedicated native profile whose default is `"*": "deny"` plus an explicit allow-list. The shared `execution` profile is also used by `patty` and `rosie`, so it MUST NOT be widened. The allow-list holds:
  - the current execution set: read, glob, grep, bash, edit;
  - `skill`, limited to the backend specialist's packaged skill IDs;
  - read access to those skills' packaged companion paths;
  - additions named by F3 (Atlas memory tools) and F4 (qualified owned tools).

  *Required new (H1):* a backend-specialist-specific `nativeProfiles` entry. Adding it changes `rosterHash`, which is why F1.4 is a prerequisite.
- **F1.9 Enforcement layering.** Three layers apply, in this order:
  1. The native-profile pre-deny at tool-ask time (`session/tools.ts`) and at Task dispatch (`task.ts`) stays authoritative over agent and Session permission.
  2. `ToolSafety` applies the Maestro- or user-bound scope on top (F2.14).
  3. The backend specialist implements no scope or permission enforcement of its own.

  `PermissionV1.DeniedError` and `Tool safety HOLD: <reason>` reach the backend specialist as tool failures. The backend specialist reports them as blockers and never retries around them.

**Stable-ID paths**

- **F1.10 Stable-ID host paths.** Every host path that resolves an agent for routing, lookup or permission MUST key on `id`. The current non-conforming sites below must be converted before F1.3 permits a non-default label:
  - plugin-tool truncation calls `agent.get(toolCtx.agent)` with the display name;
  - the Task caller falls back to a name lookup when `agentID` is absent;
  - background-result injection falls back to `ctx.agent`.

  The child Session title uses `next.name`, and that is allowed because it is presentation.
- **F1.11 Presentation consumers (H4).** App, TUI and session-ui list, store, draft, submit and mention agents by `id` and render the label. Existing `.name` payloads (app submit and draft, TUI prompt and autocomplete, session-ui Task display) are non-conforming until converted. Making the seat primary does not make it selectable in the app on its own: the picker is gated by the custom-agent visibility setting (decision F1-D3).

**Support and inference**

- **F1.12 Support claim.** The backend specialist is supported only on Orchestra builds that contain the F1 and F2 host seams. Neither the backend specialist package nor its docs offer a stock-OpenCode path: no custom-agent emulation and no degraded "works on stock" mode. Any loadable backend specialist artifact that finds itself on a host without these seams MUST refuse with an explicit unsupported-host diagnostic. *Required new (H1):* a host capability marker, if a loadable artifact exists outside the built-in registration.
- **F1.13 Forbidden inference.** No component may infer the backend specialist's identity from a display name, charter or prompt text, a Session title, a model-authored argument or a `.name` string comparison. A missing or malformed member ID fails closed (F2.15).

### Source anchors (@ d11d8652aa)

| Anchor | Status | Fact |
| --- | --- | --- |
| `O/agent/agent.ts:37-57` | existing | `Agent.Info`: `id` optional, `name`, `mode ∈ subagent/primary/all`, `native` |
| `O/agent/agent.ts:291-307` | existing | Native seats: `id: memberId`, `name: displayName`, `permission: fromConfig(nativeProfiles[..])`, `mode: "subagent"` → H1 changes the backend specialist to `all` |
| `O/agent/agent.ts:309-315` | existing | Native-seat config limited to model/variant/temperature (F1.5 keeps it) |
| `O/agent/agent.ts:347-350, 362-364, 376-394` | existing | Native skip of Truncate allow; `get` by key; `defaultInfo` rejects `subagent`/hidden; `defaultAgent` returns `id ?? name` |
| `O/maestro/roster.ts:10-26` | existing | `nativeProfiles.execution`/`review`; `execution` shared by backend (61), patty (71), rosie (121) |
| `O/maestro/roster.ts:54-63, 136-159` | existing | The backend specialist entry (`displayName: BACKEND_DEFAULT_LABEL`); canonical/unique `memberId`; lookup HOLD reasons |
| `O/maestro/validation-record.ts:89-94, 112-113, 159-161, 167-171` | existing | `hash`; `reviewPolicyHash(reviewer, profile)`; `rosterHash: hash(roster)` includes `displayName` + prompt; `rfc8785-v1` envelope |
| `O/maestro/route-grant.ts:3, 12` | existing | Behavioral projection without `displayName` (model for F1.4) |
| `O/session/tools.ts:68-70, 96-106` | existing | Native-seat resolution by `agent.id`; native-profile pre-deny before `permission.ask` |
| `O/tool/task.ts:147-159, 190-192` | existing (moved) | Caller by `agentID` with name fallback; native seat cannot delegate; authorized Task requires native Maestro |
| `O/tool/registry.ts:242` | existing (moved) | `agent.get(toolCtx.agent)` — display-name lookup (F1.10 violation) |
| `O/tool/registry.ts:396-404` | existing (moved) | Task catalog filters `mode !== "primary"` |
| `O/tool/registry.ts:436-463` | existing (changed) | Maestro/Arsenal/Lucy tool gating by stable `id`; permission-disabled filter |
| `O/tool/task.ts:390-399, 588-592` | existing | Child title `@${next.name}` (presentation); background inject `currentParent.agent ?? ctx.agent` |
| `O/maestro/ability-descriptors.ts:14, 32` | existing | `allowedSeats` keyed by stable IDs (conforming) |
| `O/maestro/project-config.ts:61-76` | existing (not in P1) | GitHub board "Seat" options use literal labels (the default label, not the stable ID); no reader in `O/` today — any future writer must map by stable ID |
| `packages/app/src/context/local.tsx:72-73`, `local-agent.ts:1-7` | existing | Picker hides `subagent`/hidden; visibility gated by custom-agent setting; `resolveAgent` by `.name` |
| `packages/app/src/components/prompt-input/submit.ts:426, 461, 485` | existing (moved) | Payloads use `currentAgent.name` |
| `packages/session-ui/src/components/message-part.tsx:595-599` | existing (moved) | Task display resolves agent by name |
| Label resolver + validation | **required new (H1)** | — |
| Backend-specialist-specific native profile + skill/companion grant | **required new (H1)** | — |
| Behavioral roster/policy projection + versioned verification | **required new (H5)** | — |
| Stable-ID conversion of name paths | **required new (H2: registry/task; H4: UI)** | — |

### Consumers

H1 (registration, profile, resolver), H4 (presentation and payloads), H5 (hash projection), S (charter and skills consume the resolved label and grant list), Q-native (installed registration, grants, role boundaries, rename).

### Non-goals

- Renaming any other member, or any naming scheme for the team as a whole.
- Changing Maestro's fixed name.
- A V2 (`SessionV2`, Core agent) registration path.
- Plugin-driven agent registration.
- Stock OpenCode support.
- Any backend-specialist-side permission or scope logic.

### Open owner decisions

- **F1-D1** — When the configured label is invalid at startup, should the host refuse to start, or start with the default label (`BACKEND_DEFAULT_LABEL`) and show a configuration error?
- **F1-D2** — Is `HUGR_BACKEND_NAME` (environment) the single, ratified source for the label, or must a config-file key also (or instead) set it?
- **F1-D3** — Should primary-capable backend specialist appear in the app/TUI agent picker by default, or stay behind the existing "custom agents" visibility setting like other non-custom agents?

---

## F2 — Trusted invocation binding

### Contract

**Binding source**

- **F2.1 Host-produced, read-only.** For every provider turn and every tool invocation in which the backend specialist executes, the host produces one `InvocationBinding` from host state. The binding MUST NOT come from:
  - model arguments or prompt or packet text;
  - display names or Session titles;
  - plugin-mutable Session metadata;
  - a process-global "current agent" map.

  the backend specialist and its tools read the binding and cannot change it. *Required new (H2):* the binding value and its exposure (F2.9). Its fields are F2.2–F2.8 and F2.10–F2.11.

**Fields**

- **F2.2 Project and source placement.**
  - `projectId` = `Session.projectID`. It MUST equal `InstanceRef.project.id`; on a mismatch the binding is refused.
  - `directory` = `Session.directory`.
  - `worktree` = `InstanceContext.worktree`. When the worktree is the non-git `"/"`, the root is `directory`, matching the existing ToolSafety `projectDirectory` rule.
  - `workspaceID` is carried when present and is reserved.

  A tool argument or command cwd MUST NOT move these roots.
- **F2.3 Storage placement.** The Atlas storage binding is the host-resolved provider configuration, and its `projectID` MUST equal the binding `projectId`. The existing check is `maestro.atlas` in `atlas-source.ts`. The provider surface, degradation shape and config ownership for use without Maestro belong to F3. F2 freezes only the rule that storage placement is host-resolved and project-matched, never chosen by the backend specialist.
- **F2.4 Executing member.**
  - For a provider turn, `memberId` is the stable `id` of the Agent.Info resolved for that turn: the agent of the user message being processed (`agents.get(lastUser.agent)`). It is not `Session.agent`, which `setAgentModel` changes when the next prompt is admitted.
  - For a tool invocation, `memberId` is the `agentID` of the assistant turn that issued the call.

  When the host stores the agent on user and assistant messages, it MUST store `id`, as it already does.
- **F2.5 Authority and execution Session.**
  - `executionSessionId` is the Session actually running the turn.
  - `authoritySessionId` is the direct stakeholder conversation, meaning the root of the `parentID` chain.
  - In direct use the two are equal; in delegated use the execution Session is the child.

  Neither value can be selected or overridden by a tool argument. *Required new (H2/H5):* an exported authority resolver. `task.ts` walks the chain today, but only to enforce the depth limit.
- **F2.6 Actor serialization reuse.** The provenance actor is `{ projectId, sessionId: authoritySessionId, memberId }`, serialized as the existing `maestro-actor-v1` RFC 8785 bytes. In delegated work the executing member is `backend`, not Maestro. Receipts carry `executionSessionId` and the invocation refs beside the actor, not inside it. F2 introduces no new actor version.
- **F2.7 Native invocation refs.** Each tool invocation carries `{ executionSessionId, assistantMessageID, callID, memberId }`. All of these values exist on `Tool.Context`. `ToolSafety.Invocation` already declares optional `agent` and `assistantMessageID`, but only the outer `wrapTools` layer fills them. *Required new (H2):* the `intercept` guard in `session/tools.ts`, `Tool.wrap` and the plugin-tool wrapper in `registry.ts` MUST pass `agent: agentID` and `assistantMessageID` too. `ToolSafety.Observation` carries no member, so a receipt that needs the member takes it from the binding, never from an observation.

**Context admission**

- **F2.8 Context admission point.** backend-specialist-specific running context (the Atlas header and the resume fold from F3) is admitted only inside host request preparation. There, `input.agent` is the actual executing Agent.Info and `sessionID` is the execution Session.
  - The public `experimental.chat.system.transform` hook MUST NOT be used for this. Its input is `{ sessionID?, model }` with no agent, and the same hook also runs for title generation (same `sessionID`, agent `title`) and for `Agent.generate` (no Session).
  - `chat.params` and `chat.headers` carry the agent, but they run after the system and messages are assembled, so they are not admission points.

  *Required new (H2 for the seam, A4 for the producer):* a host-internal admission step keyed on the executing member. If a plugin-facing form is ever exposed, it is a new typed hook that H2 names. No existing hook may be repurposed by looking up the agent from the Session.
- **F2.9 Public ToolContext.** *Required new (H2):* `P/tool.ts` `ToolContext` gains stable `agentID`, `callID` and a frozen read-only `binding`. Until then, the backend specialist plugin tools MUST NOT rely on incidental spread properties (`pluginCtx = { ...toolCtx }`). `agent` stays display text.

**Non-member paths**

- **F2.10 Non-member paths are distinguished.** The following paths are bound to their own hidden native agent, never to `backend`, even when `Session.agent === "backend"`:
  - title generation;
  - compaction;
  - summary;
  - `Agent.generate`, which has no Session.

  On these paths the backend specialist context is not admitted and the backend specialist memory is not written. After compaction, the next backend specialist provider turn re-admits the header normally. Compaction is not a logical resume and does not re-push the resume fold (F2.11, F3).
**Logical task and resume**

- **F2.11 Logical task and resume identity.**
  - `taskId` is a logical work-item ID, distinct from any Session ID. Today the Task `task_id` and the completion receipt `taskID` are both the child Session ID. Those names are execution references, not `taskId`.
  - In delegated use, the host binds `taskId` from the Maestro dispatch: via the reservation and authorization for governed work, via the dispatch packet for ungoverned work (H5).
  - In direct use, `taskId` is bound as decided in F2-D1.
  - A resume is admitted only when the host resolves the same `(projectId, memberId, taskId)` to existing retained work. Unknown, malformed, cross-project or cross-member resume input MUST produce a typed refusal. It MUST NOT silently create a fresh child: today's `task_id` lookup swallows failure and creates one, which is non-conforming for the backend specialist (scope: F2-D2).
  - Resuming an interrupted attempt in the same Session keeps the `taskId`. A replacement Session continues a `taskId` only through an explicit host binding.
  - Each admitted logical resume gets exactly one `resumeRef` (H2/H5), so F3 can admit the fold once.
- **F2.12 Member switch.** In a direct Session where the user switches agents, the binding follows the executing member of each turn. The previous member's injected rules are retired at the switch. No authority or memory ownership carries over between members.

**Sessionless use**

- **F2.13 Sessionless invocation.** CLI and MCP pure-generator invocations have no Session. Their binding has `projectId` and placement when the caller supplies a real project context, and no `memberId`, `executionSessionId` or actor. They MUST NOT fabricate a Session, an actor or a memory owner. Atlas memory reads and writes that need an owner are refused as `sessionless`. Generation results are returned without memory side effects (F4).

**Enforcement and failure**

- **F2.14 Scope enforcement binding.** The scope a task is given (a Maestro packet, or the user's packet in direct use) is enforced by `ToolSafety`, bound by the host to the execution Session. The existing hook point is `RuntimeProfileLoader` / `NativeHost` / `NativeContext`, provided per Session by `ArsenalBindings.withSession`. Today the loaded profile is project-scoped (`preferences.json` under the state root) and not per-task. *Required new (H5):* per-task profile binding from the dispatch. The backend specialist only consumes the resulting denials as blockers (F1.9). Direct-use enforcement depends on F2-D3.
- **F2.15 Fail closed.** If the project, authority Session, execution Session or member is missing or malformed, governed operations fail closed. Ungoverned work MAY continue with a visible `HOLD` or degraded marker, never with a synthetic actor (actor-identity-contract rule 5).
- **F2.16 Scope.** F2 freezes the V1 server path (`SessionPrompt` → `LLM` → `LLMRequestPrep`, `SessionTools`/`SessionNativeTools`, `TaskTool`). The `SessionV2`/Core runner binding is a separate adapter built on the same field semantics. It is not delivered by F2, and it MUST NOT be bridged through `SessionPrompt.loop`.

### Source anchors (@ d11d8652aa)

| Anchor | Status | Fact |
| --- | --- | --- |
| `O/session/session.ts:225-238` | existing | `Session.Info`: `projectID`, `workspaceID?`, `directory`, `path?`, `parentID?`, `agent?` |
| `O/project/instance-context.ts:5-9`; `O/effect/instance-ref.ts:5` | existing | `InstanceContext { directory, worktree, project }`; `InstanceRef` reference |
| `O/maestro/atlas-source.ts:33-41` | existing | `maestro.atlas` provider; `provider.projectID !== session.projectID` → HOLD |
| `O/session/prompt.ts:642-669, 682-695` | existing (moved) | Admission resolves agent, stores `agent: ag.id ?? ag.name`; `setAgentModel` mutates `Session.agent` |
| `O/session/prompt.ts:1006-1015` | existing | `chat.message` input `agent` = raw caller input (resolved value only on `output.message.agent`) |
| `O/session/prompt.ts:1177-1197` | existing (moved) | Turn agent = `agents.get(lastUser.agent)`; assistant `mode/agent: id ?? name` |
| `O/session/prompt.ts:1229-1236` | **changed** | Tools resolved via new `SessionNativeTools.resolve` (was `SessionTools.resolve`) |
| `O/session/prompt.ts:1248-1270` | existing (moved) | System assembly (skills/env/instructions/MCP) → `handle.process({ agent, sessionID, … })` |
| `O/session/prompt.ts:223-243` | existing (moved) | Title: agent `title`, same `sessionID`, `small: true` |
| `O/session/compaction.ts:358, 398-399` | existing | Compaction agent `compaction` |
| `O/session/llm.ts:107-114` | existing | `LLMRequestPrep.prepare({ ...input })` — actual `agent` present |
| `O/session/llm/request.ts:56-78` | existing | System built from `input.agent.prompt`; `system.transform({ sessionID, model })` — no agent |
| `O/session/llm/request.ts:114-146` | existing | `chat.params`/`chat.headers` with `agent: id ?? name`, after system assembly |
| `O/agent/agent.ts:432` | existing | `Agent.generate` calls `system.transform({ model })` without Session |
| `P/index.ts:56-66, 222-296, 344-386` | existing | `PluginInput`; Hooks incl. `chat.message`, `chat.params/headers`, `tool.execute.before` (`{tool, sessionID, callID}`, no agent), `system.transform`, `stop`/`session.start`/`session.end` |
| `P/tool.ts:3-20` | existing | Public `ToolContext`: `sessionID, messageID, agent, directory, worktree, abort, metadata, ask` — no `agentID`/`callID` |
| `O/tool/tool.ts:42-54` | existing (moved) | Internal `Context` with `agentID?` ("Stable runtime agent identity") and `callID?` |
| `O/tool/tool.ts:146-161` | **changed (new)** | `Tool.wrap` runs `ToolSafety.before` with placement, **no agent** |
| `O/session/tools.ts:66-67` | **changed (new)** | `ToolSafety.make` + `InstanceRef` binding per resolve |
| `O/session/tools.ts:72-114` | existing (changed: metadata inspected) | Context: `agent: name`, `agentID: id`, Session/message/call IDs |
| `O/session/tools.ts:116-126, 147-148, 543-552` | **changed (new)** | `guard` → `intercept(safety, {tool, args, sessionID, callID, directory, projectID, projectDirectory})` — **no agent, no assistantMessageID** |
| `O/session/native-tools.ts:14-48` | **new file** | Outer `wrapTools` with `agent: id ?? name`, `assistantMessageID`, Session placement; inner registry `durableSafety: false` |
| `O/tool/registry.ts:201-262` | **changed** | Plugin-tool wrapper: `beforeInvocation` + `safety.run` without agent; `pluginCtx = { ...toolCtx, directory, worktree }` |
| `O/tool/registry.ts:368-388` | **changed (new)** | `definitions` → `ArsenalBindings.run` with `agent: agentID ?? agent`, `assistantMessageID` |
| `C/tool-safety.ts:16-56, 66-88` | **new** | `Profile`, `RuntimeProfile`, `NativeContext`, `NativeHost`, `RuntimeProfileLoader`; `Invocation` (`agent?`, `assistantMessageID?`); `Observation` (no agent) |
| `C/tool-safety-profile.ts:19-69` | **new** | Project-bound preferences loader; grants nothing |
| `O/maestro/arsenal-bindings.ts:257-261, 602-642` | **new** | Project-scoped `loadProfile`; `withSession` provides profile/approval/placement per Session; `run` emits `native-host` safety fact |
| `O/tool/task.ts:66-70` | existing | `task_id` = prior subagent Session |
| `O/tool/task.ts:217-222` | existing (moved) | Resume lookup failure swallowed → fresh child; parent/agent mismatch denied |
| `O/tool/task.ts:299-304` | existing | Root-ancestor walk (depth only) |
| `O/tool/task.ts:425-430` | **changed (new)** | `completion.beforeDispatch({ taskID: nextSession.id, planID, … })` |
| `O/maestro/arsenal-completion.ts:24-59, 104-160` | **new** | Completion receipt bound to Session/child/plan; `taskID` = child Session ID |
| `O/maestro/dispatch.ts:51-99` | existing | Governed reservation: project, routed member, intent hash, deterministic child, permission snapshot |
| `O/maestro/context-tool-plan.ts:41`; `specs/hugr-maestro/actor-identity-contract.md:7-29` | existing | `maestro-actor-v1` RFC 8785 actor bytes |
| `InvocationBinding` value + exposure | **required new (H2)** | — |
| Host-internal backend specialist context admission keyed on executing member | **required new (H2 seam, A4 producer)** | — |
| `agentID`/`callID`/`binding` on public `ToolContext` | **required new (H2)** | — |
| Agent + assistantMessageID on all ToolSafety invocation layers | **required new (H2)** | — |
| Authority-Session resolver; logical `taskId`; strict resume + `resumeRef` | **required new (H2/H5)** | — |
| Per-task ToolSafety profile bound from dispatch | **required new (H5)** | — |

### Consumers

H2 (binding, admission, ToolContext), H5 (task/resume, authority, per-task profile), A4 (Atlas producer at the admission point), F3 (owner vs receipt actor, fold-once by `resumeRef`), F4 (WorkResult carries `taskId` and refs), Q-memory (direct/delegated/rename/resume/compaction/title isolation).

### Non-goals

- A new task database, scheduler or durable run container.
- A V2 runner binding.
- Atlas provider behavior: that is F3.
- WorkResult or lifecycle semantics: that is F4.
- Backend-specialist-side permission or scope checks.
- Exposing Maestro authority data to non-governed use.
- Confidentiality of previously admitted context.

### Open owner decisions

- **F2-D1** — In direct use (no Maestro), who creates the logical `taskId`: does the host generate it at the first backend specialist turn of a direct Session, or does the user name it in the packet with the host binding it after validation?
- **F2-D2** — Should an unknown or mismatched `task_id` on Task resume fail closed for every agent (a change to generic Task behavior), or only for the backend specialist and governed dispatch?
- **F2-D3** — In direct use, is the scope in the user's packet enforced by a host-bound per-Session ToolSafety profile (a new user-facing binding)? Or does direct use rely only on project-level ToolSafety preferences plus native permission asks, with the packet scope enforced only through the backend specialist's charter?

---

## Seam drift since 76015a9

Diff basis: `git diff 76015a9 d11d8652aa` on every file P1 cited for F1/F2, plus new files reached from them.

| Seam (P1 anchor) | Now (@ d11d8652aa) | Drift | Matters for |
| --- | --- | --- | --- |
| `O/agent/agent.ts:291-345, 378-395, 432` | 291-307, 309-345, 376-394, 432 | unchanged | — |
| `O/maestro/roster.ts:10-26, 54-63` | same | unchanged | — |
| `P/index.ts:56-80, 222-383`; `P/tool.ts:3-20` | same | unchanged; still no agent in `system.transform`/`tool.execute.before`; no `agentID` in public ToolContext | F2.8, F2.9 |
| `O/session/llm/request.ts:56-146`; `O/session/llm.ts:106-114`; `O/session/system.ts:105-117` | same | unchanged | — |
| `O/plugin/index.ts`, `session/session.ts`, `session/compaction.ts`, `maestro/dispatch.ts`, `route-grant.ts`, `context-tool-plan.ts`, `atlas-source.ts`, `skill/index.ts`, `tool/skill.ts`, `agent/prompt/backend.txt` | same | unchanged | — |
| `O/session/tools.ts:60-104` | 66-67, 72-114, 116-126, 543-552 | **changed**: ToolSafety + `InstanceRef` binding; `intercept` wraps every V1 tool (native/custom, MCP, MCP resources); metadata and outputs inspected; guard Invocation omits `agent`/`assistantMessageID` | F1.9, F2.7, F2.14 |
| — | `O/session/native-tools.ts:14-48` | **new**: outer `wrapTools` now carries stable `agent` and `assistantMessageID` into ToolSafety; inner layer runs `durableSafety: false` | F2.7 (one of three layers already conforms) |
| `O/session/prompt.ts:1170-1278, 216-235` | 1177-1270, 223-243 | **moved +7**; tool resolution moved to `SessionNativeTools`; all `prompt/loop/shell/command` wrapped in `ArsenalBindings.withSession` | F2.4, F2.10, F2.14 |
| `O/tool/tool.ts:36-47` | 42-54; 146-161 | **moved +6 / changed**: `Tool.wrap` runs `ToolSafety.before` with placement, no agent | F2.7 |
| `O/tool/registry.ts:143-187, 176, 307, 343-365` | 201-262, 242, 400, 436-474; new 368-388 | **changed**: plugin wrapper adds ToolSafety without agent; `agent.get(toolCtx.agent)` name lookup still present (now 242); new `definitions` passes `agentID ?? agent`; Arsenal tools gated to native Maestro | F1.10, F2.7, F2.9 |
| `O/tool/task.ts:140-150, 182-185, 209-214, 383-386` | 147-159, 190-192, 217-222, 390-399 | **moved +7..8 / changed**: completion receipt (`beforeDispatch`, `taskID` = child Session ID), `completion-worker-not-finished` HOLD; resume swallow unchanged | F2.11 (receipt `taskID` ≠ logical taskId) |
| `O/maestro/validation-record.ts:104-105, 151-153, 161-164` | 112-113, 159-161, 167-171 | **moved +8**: only error `message` getters added; hashing unchanged (still includes `displayName`) | F1.4 |
| — | `C/tool-safety*.ts`, `C/tool-safety-profile.ts`, `O/maestro/arsenal-bindings.ts`, `arsenal-completion.ts` | **new**: enforcement seam; profile is project-scoped, not per task or member | F1.9, F2.14 (per-task binding is required new) |
| App/session-ui `.name` payloads (`submit.ts:408,443`; `message-part.tsx:437-450`) | `submit.ts:426,461,485`; `message-part.tsx:595-599` | **moved**; still name-based | F1.11 |
| — | `O/maestro/project-config.ts:61-76` | not cited by P1; present at both baselines; board "Seat" options use literal labels | F1.2 (future writers map by ID) |
