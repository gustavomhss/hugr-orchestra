# P1 — factual host / standalone delivery audit

Date: 2026-10-04. Source audit only; commands below are future verification, not executed results.

## Baseline and evidence scope

- Source root: `/Users/gustavoschneiter/Documents/HuGR/_worktrees/backend-plugin`.
- Metadata worktree/output: `/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/orchestra/backend-host-plan`.
- `git rev-parse HEAD` in **both** directories returned `76015a9dcd5b0c77164a3f1bee49b0060a4d37f0`. Metadata worktree contains `.git` without checked-out product files; its deletion status is not source-root state. Source status showed intentional untracked `specs/backend-specialist/`.
- Read first: `specs/backend-specialist/research/delivery-planning.md`; then `README.md`, `integration-flow.md`, `skill-catalog.md`, `atlas.md`; relevant root/package/session-LLM/test/HttpApi/app/session-ui `AGENTS.md`.
- Path shorthand below: **O** = `packages/orchestra`; **A** = `packages/app`; **T** = `packages/tui`; **S** = `packages/session-ui`. Paths otherwise relative to source root.
- Evidence: complete public hook types plus actual callers; targeted source/test reads. Hook searches returned known system-transform/start/end/stop call sites; stock searches returned `chat.message`/ordinary triggers as positive controls. Package glob returned known orchestra/atlas-boundary manifests but no `packages/backend-specialist/package.json`.
- No product tests, typechecks, installs, configuration execution, source edits, agents, commits or pushes performed. Only this report authored. Existing tests inspected, not certified green.

## Delivery blockers — lead disposition required

1. Native backend specialist remains protected, `subagent`-only, skill/custom-tool denied. Ordinary V1 plugin config cannot replace its charter, mode, permissions or name.
2. Native V1 system-transform input lacks actual selected agent. Internal request already has it; exported plugin contract does not. Tool-context stable ID exists internally but is undeclared publicly.
3. Lifecycle hooks have callers, but implementation does not satisfy declared lifecycle semantics. They cannot currently guarantee closing-memory checkpoints.
4. Native IDs partly separated already; UI/prompt payloads still route by `.name`, and authority hashes include presentation. Environment-name interpolation alone breaks required invariants.
5. Installed Atlas boundary supplies verified static Own, not native member Memory/header/resume capabilities. This is provider/host work, not backend-specialist-owned storage.
6. Actual stock Orchestra `v1.18.27` lacks fork lifecycle hooks and separate agent ID. Existing APIs support useful pieces, but full rename-safe, selected-turn Atlas integration is **not established**. Lead must choose host capability changes or explicitly narrower stock support.

## Native seams: existing implementation versus required work

| Seam / source | Implemented now | Required delivery change or constraint |
| --- | --- | --- |
| `packages/plugin/src/index.ts:56-80,222-383`; `O/src/plugin/index.ts:115-125,144-169,245-297` | V1 loader invokes server plugin, supplies project/directory/worktree/client, applies config hooks, registers tools, forwards events, disposes instance plugins. | Use loader; explicit trusted native-seat adoption needed. No selected-agent registration hook exists in this Hooks interface. Event callbacks are invoked without awaiting; not durable acknowledgment. |
| `O/src/agent/agent.ts:291-345,378-395`; `O/src/maestro/roster.ts:10-26,54-63` | Roster key/id `backend`, display `BACKEND_DEFAULT_LABEL`, frozen execution profile, `mode: "subagent"`; config permits only model/variant/temperature for native seats. Default rejects subagent. | Adopt real specialist through host-owned registration, primary-capable and still delegatable; keep native restrictions. A primary-only mode would disappear from Task catalog (`tool/registry.ts:307`). |
| `O/src/agent/prompt/backend.txt` | Short scoped-execution/return-card/forbidden-actions charter. | Package charter/skills/work-result contract remain delivery work; preserve narrow implementation role. |
| `O/src/session/system.ts:105-117`; `O/src/skill/index.ts:179-277,319-361`; `O/src/tool/skill.ts:35-96` | Native disk/config-path/URL skill discovery, permissions, cached names/content; verified `own_*` branch; skill tool returns body and sampled companion paths. | Package/register six entry skills and references; grant intended skills and required asset reads. Native seats skip general skill-directory whitelist (`agent.ts:347-350`); allowing `skill` alone does not allow reading external companion files. No reference auto-loading. |
| `O/src/session/prompt.ts:1170-1278`; `O/src/session/llm.ts:106-114`; `O/src/session/llm/request.ts:56-146` | Actual selected `Agent.Info` reaches request preparation; system contains charter/provider prompt, environment/instructions/MCP/skills/user system. Both LLM runtime paths use preparation. | Bind bounded Atlas contribution to actual executing member here. Public system hook receives only `{sessionID, model}`; agent generation also calls it without Session (`agent.ts:432`). Do not inject by prompt/name inference. |
| `O/src/session/tools.ts:60-104`; `O/src/tool/tool.ts:36-47`; `packages/plugin/src/tool.ts:3-20`; `O/src/tool/registry.ts:143-187,343-365` | Internal tools receive `agent` display text, `agentID`, Session/message/call IDs; registry spreads context into plugins, adds placement; native profile is independently checked for visibility and `ask`. | Public ToolContext declares only `agent`, Session/message IDs and placement, not `agentID`/callID/authority/task binding. Expose/consume trusted contract chosen by lead; do not depend on incidental extra properties. Open only intended backend specialist tools, not whole shared execution profile. |
| `O/src/plugin/hugr-composer/index.ts:6-17`, `tools.ts:12-98` | Existing compose/scaffold plugin bridges actual tool handlers; enabled only by composer env opt-in and disabled in pure mode. | Existing presence is not ready-by-default or the backend specialist permission. Coordinate native capability IDs with Composer owner; avoid duplicate handlers. |
| `O/src/maestro/atlas-source.ts:33-130,136-190`; `packages/atlas-boundary/package.json:6-15`, `src/generated/boundary.d.ts:55-115` | Exact project/root/static-artifact/current-blob verification; static Own loading revalidates bytes/cache/currentness. Boundary exports root and materialize, with static verification declarations. | Consume provider-owned installed Memory/header/resume surface when supplied. Current provider config is under `maestro.atlas`; standalone shared binding ownership needs explicit disposition. |
| `packages/plugin/src/v2/effect/context.ts:12-22` | V2 plugin domains: agent, aisdk, catalog, command, integration, plugin, reference, skill. | No generic System Context/tool-registration domain in inspected interface. V2 adapter remains separate; do not migrate runtime to solve V1 delivery. |

## Lifecycle: called does not mean correct

- **`session.start`: invoked.** `O/src/session/session.ts:538-554` publishes Created, invokes hook, then returns. `agent` is supplied creation value or `""`, not later selection. `output.metadata` is discarded: not merged, persisted, or reserved-key filtered here. Creation/fork is not logical task resume or every selected-agent transition.
- **`session.end`: invoked on removal.** `session.ts:623-659` calls it only in `Session.remove` with instance context, after child removal/cancellation. Reports `turn_count: 0`, `reason: "user_exit"`; times callback out after 5000 ms. `output.cleanup` is ignored. Then deletes Session events. Plugin disposal is separate (`plugin/index.ts:266-279`); no general shutdown contract follows from this caller.
- **`stop`: invoked on wrong terminal branch.** `session/processor.ts:693-695` returns `stop` for blocked/error, otherwise `continue`. `session/prompt.ts:1319-1345` invokes hook only for that result, always `reason: "completed"`. Normal finished response exits next iteration at `1111-1130`, bypassing hook. Structured output/content-filter branches also exit earlier (`1288-1315`). Interrupt finalization does not invoke it.
- `output.continue` only changes that branch's loop outcome; completed-message guard may exit on next iteration. It is not proven extra-provider-turn machinery.
- `O/test/plugin/trigger-lifecycle.test.ts` manually calls `Plugin.trigger` with fabricated inputs; proves dispatch/mutation only. `O/test/session/lifecycle-hooks.test.ts:63-79` exercises actual creation/start, not normal completion, abort/error, metadata persistence or shutdown.
- Required if lifecycle-backed Memory is promised: host owner must align actual finalization/terminal reasons, admission and durable acknowledgment semantics with chosen contract, then test real execution paths. Abrupt death can retain earlier checkpoints; never claim guaranteed final fold.

## Stable identity, names and hashes

- Existing stable native identity is useful: Agent `.id`, lookup keys, default selection, prompt user/assistant agent fields, `chat.params`/`chat.headers`, Task routing/resume all have ID-aware paths. Preserve `backend`; presentation cannot become memory owner, routing key or grant principal.
- Remaining public tool mismatch is concrete: `SessionTools.context` sends `agent: input.agent.name`, `agentID: input.agent.id`; public ToolContext omits ID. Registry truncation also still calls `agent.get(toolCtx.agent)` (`registry.ts:176`).
- `HUGR_BACKEND_NAME` is proposed only: targeted native-source search found fixed roster `displayName: BACKEND_DEFAULT_LABEL`, not a resolver. Host startup must validate names and render one resolved presentation consistently; blank/control/multiline/reserved/duplicate labels require defined behavior.
- `O/src/maestro/validation-record.ts:104-105,151-153` hashes full roster and full reviewer/profile. Full roster includes `displayName` and prompt bytes. Cosmetic rename changes these hashes; name-interpolated prompt also does. `route-grant.ts` already selects behavioral fields without displayName. Separate behavioral/presentation projections before dynamic labels; version historical receipt verification rather than rewriting recorded hashes.
- `O/test/maestro/roster.test.ts:113-118` tests renamed lookup identity only, not hash or Memory stability.
- Actor contract remains project + **authority** Session + stable executor; execution child and logical task are separate references (`specs/hugr-maestro/actor-identity-contract.md:7-29`). `context-tool-plan.ts:33-42` serializes `maestro-actor-v1`; validation receipts use their own `rfc8785-v1` envelope (`validation-record.ts:161-164`). Preserve respective formats; no blanket actor reserialization.
- App V1 normalization passes agents through; V2 normalization sets `name: agent.id`, drops display name (`A/src/context/global-sync/utils.ts:15-36`). `A/src/context/local.tsx:185-239`, `components/prompt-input/submit.ts:408,443`, `pages/new-session/new-session-draft-controller.ts:28-32` use `.name` for stored selection/payloads. `components/prompt-input.tsx:588` and `prompt-input-v2.tsx:282-285` do same for mentions.
- App direct selection has another condition: `local.tsx:72-73,187-195` uses custom-agent visibility and falls back to `build` when hidden. `local-agent.ts:1-18` recognizes only `native === false` as custom; explicit draft visibility ends in an existing Session unless visibility setting/custom agent enables it. Making native backend specialist primary-capable alone does not establish selectable/resumable app behavior. Shared Task display also resolves by name (`S/src/components/message-part.tsx:437-450`).
- TUI selection filters subagents and keys on name (`T/src/context/local.tsx:77-117`); `component/prompt/index.tsx:1003,1063,1087,1099` submits it; `component/prompt/autocomplete.tsx:407-411` uses it for mentions. Name change needs payload/persistence adaptation, not only display rendering.

## Maestro and independent operation

- Existing Task flow owns child Session execution, history, cancellation, model selection and parent-deny/external-directory inheritance: `O/src/tool/task.ts:164-214,383-416,529-554,614-687`; `agent/subagent-permissions.ts`; `maestro/governed-task-reservation.ts:17-40`. Reuse it.
- Normal Task has no Maestro prerequisite. Native execution seats cannot self-delegate (`task.ts:140-150`). Authorized/governed modes explicitly require native Maestro (`182-185`; `governed-task-reservation.ts:75-85`). Direct work must not invent these grants.
- Dispatch reservation already durably binds authorization, project, routed member, intent hash, deterministic child and permission snapshot; rechecks current context (`maestro/dispatch.ts:51-99`). Task checks selected seat/intent, child/permissions, replay completeness and before-model freshness. Verified grounded Own is appended as synthetic child input (`task.ts:497-542`). This is not Atlas Project Rules/Memory injection.
- `task_id` means child **Session** ID. Existing child must match parent and selected agent. Lookup failure is swallowed into fresh child creation (`209-214,383-386`): insufficient strict logical-task resume. Complete delivery needs explicit logical-task binding/currentness/admission evidence; no new Task database.
- Task returns rendered text plus Session/model metadata, not proposed typed WorkResult or independent acceptance (`task.ts:104-118,432-442,543-554`). Structured handoff must preserve actual failure/interruption/check/Memory outcomes rather than interpret summary as accepted work.
- Full independent behavior can mean same specialist, defined caller packet, native host execution/permissions/history, installed shared Atlas with member header + task/PR/project Memory, direct authority Session = execution Session, no Maestro session/grants. Atlas outage remains explicitly degraded; evidence-dependent work blocks. CLI/MCP pure generators need not fabricate conversation identity.
- This is a delivery target, not baseline readiness. Current fork statically imports Maestro roster, Task governance and Atlas source helpers; absence of an active Maestro conversation is not proof of installation independent from Maestro modules. Shared provider/host registration dependency must be resolved by owners; the backend specialist package itself must not import Maestro services.

## Stock Orchestra 1.18.27 — direct primary-source comparison

GitHub tag resolved to **`4b7e19e315cca414121ba1d61523fef74bb3ae8b`**. Registry also publishes `orchestra-ai@1.18.27`. Source inspection only; package binaries not installed/exercised. Fork manifest version does not identify upstream capabilities.

| Stock surface | Source-supported capability | Limit for full backend specialist |
| --- | --- | --- |
| V1 `PluginInput`, config/tool hooks, loader [U1,U4] | Project/worktree/directory + SDK client; config mutation registers custom agent; custom tools receive Session/message/agent/cancellation/ask [U2]. | No protected stock backend specialist to replace. No Maestro authority or Atlas native capability supplied by loader. |
| `Agent.Info`, config loop [U3] | Configured custom `backend` can be primary/all; prompt/permission/skill config supported. | Only `.name`, no separate `.id`. Config key indexes agents, while `.name` is persisted/submitted (`prompt.ts:637,662,679`; defaultAgent returns name). Renaming `.name` is not stable-ID presentation. |
| System transform [U1,U5] | Receives optional Session + model and can change system strings. | No selected-agent input. `chat.params`/headers have agent but run after system/messages assembled and expose other outputs. No invented selected-agent hook. |
| `chat.message` [U1,U6] | Can alter actual user message/parts; resolved `output.message.agent` exists even if optional input.agent omitted. | Admission-time context is not refresh on every provider turn, member-switch retirement or exact one-time durable resume semantics. |
| Session APIs [U7,U8] | `/session/{sessionID}` get exposes project/directory/parent/agent/metadata; update accepts metadata. Tool invocation can consult Session/message identity using supplied IDs. | Latest Session selection is not executing request identity: title uses same Session with `agent: title` (`prompt.ts:216-235`); compaction similarly uses compaction agent. Pending new user admission can also change Session selection before execution completes. |
| SDK distinction [U8] | Exported `@orchestra/sdk/v2` describes above V1 server Session metadata APIs. | `PluginInput.client` is root legacy SDK; its Session type omits agent/metadata and update type accepts title only. SDK `/v2` is not proof of Core SessionV2 execution support. |
| Lifecycle [U1,U6,U7] | Generic events and instance `dispose`; Created/Updated/Deleted events are emitted. | Public `stop`, `session.start`, `session.end` absent; inspected stock prompt/session callers do not invoke them. Events are not exact final-fold/cleanup acknowledgments. |
| Skills [U9] | Native skill directories and `skills.paths`/URLs, permission filtering. | Installing assets does not supply Atlas backend or always-injected member Rules. |

**Answer:** stock host supplies native placement, tool/message-time identity, config, history and metadata APIs. An installed external foundation can be consumed through supported plugin tools; stock itself is not Atlas Memory. These pieces do not establish all required automatic context, stable public renaming, trusted logical-task/authority binding and resume guarantees. Mutable Session metadata alone is not a validated authority capability. No prompt scraping or transient global per-Session map is an acceptable substitute. Lead decides support claim and missing interface ownership.

## Suggested non-overlapping owner file groups

Ownership proposals, not interface decisions. Existing paths listed exactly; `packages/backend-specialist/**` is new reserved package scope.

| Owner group | Exclusive source group | Consumer/dependency edge |
| --- | --- | --- |
| Host plugin/context/lifecycle | `packages/plugin/src/{index,tool}.ts`; `O/src/plugin/index.ts`; `O/src/session/{system,prompt,processor,session,tools}.ts`; `O/src/session/llm/request.ts`; `O/src/tool/{tool,registry}.ts` | Actual host-selected identity/placement and provider-boundary admission → the backend specialist/Atlas consumers. Lifecycle truth before automatic checkpoint claims. `llm.ts` is caller boundary; request lowering/transport needs no new loop. |
| Native registration/skills | `O/src/agent/{agent.ts,prompt/backend.txt}`; `O/src/maestro/roster.ts`; `O/src/skill/index.ts`; `O/src/tool/skill.ts` | The backend specialist exports charter/skill assets → host adoption; permissions/capability IDs from host + foundation/Composer. Coordinate roster projection with hash owner before labels. |
| Maestro identity/dispatch | `O/src/tool/task.ts`; `O/src/agent/subagent-permissions.ts`; `O/src/maestro/{dispatch,governed-task-reservation,validation-record,route-grant,context-tool-plan,context-record,authorization}.ts` | Existing native authorization/reservation → trusted child/authority binding; consumes host IDs and provider evidence; emits truthful retained results. Own hash-version compatibility. |
| Shared Atlas integration (P2 boundary) | `packages/atlas-boundary/{package.json,script/build.ts}`; `O/src/maestro/atlas-source.ts`; `packages/schema/src/config-maestro.ts`; `packages/core/src/v1/config/config.ts` | Provider owns installed header/Memory/resume/receipts and placement contract. Host consumes it; the backend specialist never imports `foundation/atlas` internals. P2 determines canonical producer files; generated boundary files remain generator-owned. |
| Presentation/payload identity | `A/src/context/{global-sync/utils.ts,local.tsx,local-agent.ts}`; `A/src/components/{prompt-input.tsx,prompt-input-v2.tsx,prompt-input/submit.ts}`; `A/src/pages/{new-session/new-session-draft-controller.ts,session/composer/session-composer-controls.ts}`; `A/src/{utils/server-compat.ts,orchestra/chapters/agents.tsx}`; `T/src/context/local.tsx`; `T/src/component/{dialog-agent.tsx,prompt/index.tsx,prompt/autocomplete.tsx}`; `S/src/components/message-part.tsx` | Preserve stable ID through lists, selections, drafts, mentions and Task payloads; render separate label. Consume host schema; do not change routing semantics locally. |
| Specialist package | New `packages/backend-specialist/**` | Shared charter/skills/validated work-result handlers; thin native/CLI/MCP consumers of host/foundation contracts. No Core DB, Server, Maestro runtime imports or model loop. Composer/tool-distribution owners supply their qualified handlers/artifacts. |

Each group owns corresponding focused tests. Single integration owner regenerates SDK/client output and handles shared schema edits after interface freeze; generated files are not parallel hand-edit targets.

Keep runtime dependency direction from Schema to Core/Protocol, then Core/Protocol to Server; Client may use Schema/Protocol, never Core/Server. Host composition owns integration; Atlas does not import the backend specialist or Maestro. Existing Session history/evidence and Atlas storage remain persistence owners.

### Interfaces lead must freeze first

1. Native seat adoption and capability negotiation: stable ID/display projection, primary+delegated behavior, backend-specialist-only grants, startup name validation, stock minimum capability claim.
2. Trusted invocation/context binding: project/storage/source placement, actual executing member, authority/execution Session, logical task/resume, native invocation refs; distinguish Sessionless/title/compaction paths. Choose supported exported seam; this report supplies no invented hook signature.
3. Atlas provider/consumer contract: bounded header/degradation, stable owner versus receipt actor, exact resume fold/admission reference, writes/reconciliation. P2 owns missing provider behavior; host owns binding and existing Session evidence.
4. Work/result and lifecycle meaning: terminal reason versus verification/acceptance; direct versus governed mode; missing/unknown task ID behavior; display-independent/versioned roster-policy hashes.

Dependency order: freeze above → provider/host/registration/hash/UI/package work within exclusive groups → direct no-Maestro integration → native delegated/governed integration → real supported-stock installation checks. Source audit alone cannot close acceptance.

## Source-supported verification commands — NOT RUN

Use source root, not metadata worktree. `AGENTS.md` requires package-local tests and `bun typecheck`; O manifest uses Bun tests/30000 ms, `O/bunfig.toml` supplies test preloads.

**CWD `packages/orchestra`:**

```sh
bun typecheck
bun test --timeout 30000 test/agent/native-team.test.ts test/agent/plugin-agent-regression.test.ts test/maestro/roster.test.ts test/maestro/native-team-runtime.test.ts
bun test --timeout 30000 test/skill/skill.test.ts test/tool/skill.test.ts test/session/system.test.ts test/plugin/trigger.test.ts
bun test --timeout 30000 test/session/lifecycle-hooks.test.ts test/plugin/trigger-lifecycle.test.ts test/session/prompt.test.ts
bun test --timeout 30000 test/tool/task-governance.test.ts test/tool/task-session-prompt.test.ts test/maestro/grounded-lifecycle.test.ts test/maestro/validation-record.test.ts test/maestro/atlas-source.test.ts
```

- Existing native-team tests assert current skill denial/subagent protection; intentionally update expected backend specialist behavior while preserving negative grants. Runtime test executes real write/deny paths but uses constructed contexts; not installed the backend specialist/model evaluation.
- `task-session-prompt.test.ts` uses actual SessionPrompt with test HTTP LLM and checks resumed child history; `grounded-lifecycle.test.ts` checks verified Own/replay and authority fixtures. Neither establishes full backend specialist Memory integration.
- Lifecycle dispatch tests are narrower than names suggest; add actual successful completion/error/interrupt/compaction/delete/disposal tests, metadata behavior, truthful reasons, and continuation semantics if retained.

**CWD `packages/plugin`:** `bun typecheck`.

**CWD `packages/app`** (flags from package manifest):

```sh
bun typecheck
bun test --conditions=solid --preload ./happydom.ts ./src/context/global-sync/utils.test.ts ./src/context/local-agent.test.ts
```

**CWD `packages/tui`:** `bun typecheck`; `bun test --timeout 30000 test/context/local.test.ts` currently covers model helpers only, so new identity/payload tests are required. Also typecheck `packages/session-ui` when changing shared display/payload shapes.

**Generated ownership:** legacy SDK regeneration command from repository root is `./packages/sdk/js/script/build.ts`. Public Protocol/Server HttpApi changes additionally require `bun run generate` in `packages/client`; never edit `src/generated`/`src/generated-effect` directly. These are future mutation steps, not audit commands.

Required integration cases beyond current fixtures: direct selection without Maestro installation/session, with independently bound Atlas; renamed label retaining ID/permissions/Memory and historical hashes; concurrent Sessions and selected-member switch; title/compaction isolation; malformed/unknown logical resume; exact resume after restart/compaction without duplicate fold; actual Atlas outage/write refusal; actual installed stock loader with supported APIs. Use real provider/transport boundaries where claimed. Inspected manifests/tests supply no ready-made full backend specialist/stock conformance command; add it only after lead freezes supported host contract.

## Primary upstream sources

- Tag identity: https://api.github.com/repos/anomalyco/opencode/git/ref/tags/v1.18.27
- Published package metadata: https://registry.npmjs.org/orchestra-ai/1.18.27
- [U1 — stock public plugin Hooks](https://github.com/anomalyco/opencode/blob/4b7e19e315cca414121ba1d61523fef74bb3ae8b/packages/plugin/src/index.ts)
- [U2 — stock ToolContext](https://github.com/anomalyco/opencode/blob/4b7e19e315cca414121ba1d61523fef74bb3ae8b/packages/plugin/src/tool.ts)
- [U3 — stock Agent/config/name lookup](https://github.com/anomalyco/opencode/blob/4b7e19e315cca414121ba1d61523fef74bb3ae8b/packages/orchestra/src/agent/agent.ts)
- [U4 — stock V1 plugin loader](https://github.com/anomalyco/opencode/blob/4b7e19e315cca414121ba1d61523fef74bb3ae8b/packages/orchestra/src/plugin/index.ts)
- [U5 — stock request preparation and hook ordering](https://github.com/anomalyco/opencode/blob/4b7e19e315cca414121ba1d61523fef74bb3ae8b/packages/orchestra/src/session/llm/request.ts)
- [U6 — stock prompt execution/title/message admission](https://github.com/anomalyco/opencode/blob/4b7e19e315cca414121ba1d61523fef74bb3ae8b/packages/orchestra/src/session/prompt.ts); [compaction](https://github.com/anomalyco/opencode/blob/4b7e19e315cca414121ba1d61523fef74bb3ae8b/packages/orchestra/src/session/compaction.ts)
- [U7 — stock Session lifecycle](https://github.com/anomalyco/opencode/blob/4b7e19e315cca414121ba1d61523fef74bb3ae8b/packages/orchestra/src/session/session.ts); [HTTP get/update contract](https://github.com/anomalyco/opencode/blob/4b7e19e315cca414121ba1d61523fef74bb3ae8b/packages/orchestra/src/server/routes/instance/httpapi/groups/session.ts)
- [U8 — SDK exports](https://github.com/anomalyco/opencode/blob/4b7e19e315cca414121ba1d61523fef74bb3ae8b/packages/sdk/js/package.json); [root legacy types](https://github.com/anomalyco/opencode/blob/4b7e19e315cca414121ba1d61523fef74bb3ae8b/packages/sdk/js/src/gen/types.gen.ts); [SDK/v2 types](https://github.com/anomalyco/opencode/blob/4b7e19e315cca414121ba1d61523fef74bb3ae8b/packages/sdk/js/src/v2/gen/types.gen.ts)
- [U9 — stock skill discovery/permissions](https://github.com/anomalyco/opencode/blob/4b7e19e315cca414121ba1d61523fef74bb3ae8b/packages/orchestra/src/skill/index.ts)
