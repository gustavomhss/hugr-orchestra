# R02 — Claude mechanisms for an Orchestra-native backend specialist

Research date: **2026-10-03**. Primary sources: current Anthropic documentation, Agent Skills specification linked by Anthropic, and pinned public source from Anthropic repositories. Research only; evaluation scenarios below are proposed, not executed.

## 1. Architecture verdict

**Build specialist as host-owned member profile + progressive skills + thin integration adapter. Orchestra executes; Atlas remembers; Maestro coordinates when present.**

```text
User request or Maestro assignment
  → same native task/session admission boundary
  → stable specialist identity + task contract
  → project/member rules + explicit Atlas task/PR recall
  → selected skill/reference material
  → existing Orchestra runner, tools, permissions
  → evidence-bearing result + Atlas memory updates
  → optional Maestro progress/handoff projection
```

These are **proposed architectural responsibilities**, not claims that named plugin APIs already exist. Orchestra/Atlas/Maestro requirements come from research brief and supplied repository instructions; R02 did not audit their implementation surfaces.

Host boundaries:

- **Orchestra:** session identity, durable prompt admission, execution, cancellation, tools, permission decisions, context assembly, transcript ownership. Preserve supplied SessionV2 admission/execution separation, process-local coordination, and explicit provider-turn boundaries. Specialist task IDs must not become durable identities for execution drains.
- **Atlas:** shared native Knowledge+Memory, including persistent project/member rules, sourced knowledge, task/PR episodes, retrieval, revisions, deletion, access scope. Plugin carries references and projections; Atlas remains authoritative.
- **Specialist:** backend expertise, activation descriptions, proportional procedures, task/result contracts, concise evidence and learning proposals. Existing runner performs all reasoning. Any summarization or memory curation requiring a model uses host execution.
- **Maestro:** optional assignment, dependencies, scheduling policy, progress and outcome aggregation. Standalone invocation supplies same contract locally. Installing/removing Maestro must not change memory ownership or specialist identity.
- **Presentation:** environment-configured public labels and command aliases resolve to stable technical IDs. Renaming persona must preserve rules, recall, permissions, and task lineage.

Claude Agent SDK is useful evidence, but wrong execution dependency for this design: official overview says SDK runs Claude Code binary and its agent loop; inspectable Python transport calls `anyio.open_process(...)` to launch it. Embedding SDK would introduce another runtime rather than extend existing Orchestra loop. [D05][S05]

## 2. Evidence boundaries

| Evidence class | What research establishes | What it does not establish |
| --- | --- | --- |
| **Documented runtime behavior** | Claude skill discovery, memory loading, permission ordering, lifecycle hooks, subagent inheritance, session/workflow resume | Independent verification of closed Claude Code implementation or matching behavior in Orchestra |
| **Inspectable implementation** | Python SDK option translation, callback routing, public agent/skill/workflow examples, evaluation scripts | Internal Claude Code scheduler, skill-selection algorithm, memory-writer policy, permission classifier correctness |
| **Architecture adaptation** | How mechanisms could fit supplied host/Atlas/Maestro constraints | Existing Atlas schemas, available Orchestra hook names, delivery estimates, measured quality gains |

Claude Code repository and TypeScript SDK repository carry **“All rights reserved” / Commercial Terms** notices. Python SDK source carries MIT. Public examples and skill folders require their own license checks; “Anthropic repo” does not imply one reusable license. [S05L][S07][S08][S01R]

Live docs were read on research date. Public source pinned separately; examples can lag docs. Especially important current details:

- Default SDK `query()` loads user/project/local settings; `settingSources: []` suppresses those sources, **not** managed policy, global configuration, or auto-memory. Python source additionally defaults sources to user/project when explicit `skills` option is supplied with sources unset. Pin configuration instead of relying on remembered defaults. [D06][S05]
- Current Claude supports nested subagents, `SendMessage` resume, and scripted dynamic workflows. Historical claims that subagents cannot delegate or that every workflow is only a prompt are stale for current docs. [D03][D14]
- TypeScript V2 session API was removed in SDK 0.3.142; demo repository still advertises V2 examples. Treat maintained reference as API contract, sample as dated evidence. [D08][S06R]

## 3. Ranked mechanisms

Cost labels are relative architectural estimates: **Low** = content/metadata over an existing native facility; **Medium** = adapter, state projection, or permission/context integration; **High** = shared persistence, isolation, or recovery semantics. Exact cost depends on host surfaces not audited here.

### 1 — Progressive skills with deliberate activation

**Decision: ADOPT packaging; ADAPT activation and permissions. Cost: Low–Medium.**

**Documented mechanism.** Agent Skills uses metadata first, full `SKILL.md` on activation, supporting references/assets/scripts as needed. Claude adds invocation control, dynamic shell context, forked execution, and other extensions. `disable-model-invocation` and `user-invocable` govern different audiences. Agent `skills` preloads full bodies, so indiscriminate preloading defeats progressive disclosure. [D01][D02][D03]

Lifecycle matters: loaded skill text persists across turns; tool pre-approval expires on next user message; skill-declared hooks persist for rest of session. Compaction preserves invoked skills within budgets, not forever. Lazy initial loading alone does not bound accumulated context. [D01][D11]

**Inspectable artifact.** Apache-2.0 `skill-creator/SKILL.md` demonstrates metadata → body → references, variant-specific reference folders, near-miss trigger evaluation, and with/without-skill comparison. Its recommendations are authoring instructions, not source for Claude's loader. [S01][S01L]

**Orchestra adaptation.** Small backend profile; task skills for API/contracts, migrations, concurrency/transactions, diagnostics, and verification. Load framework/provider references only when task needs them. Atlas supplies project facts and member rules; skills supply procedures. Explicit user invocation remains available when routing misses. Side-effectful procedures enter through authorized native task requests, not inference from related keywords. Keep portable frontmatter distinct from host extensions.

Do not transplant Claude's inline shell-expansion syntax as inert text: it executes before model sees skill. Prefer host tools supplying scoped, attributable context. Likewise, a script bundled in a skill must use native tool permissions; progressive disclosure is not execution authorization. [D01]

**Counterexample/evaluation.** “Explain migration tradeoffs” should load relevant reference, not execute migration. “Fix migration lock contention” should activate procedure. Repeat after compaction; include unrelated task and competing skill descriptions. Measure task outcome, unnecessary activation, loaded context, and tool effects separately. Incompatible frontmatter should produce explicit compatibility result, not apparent success with ignored controls.

### 2 — Layered project/member memory on Atlas

**Decision: ADAPT semantics; keep storage native to Atlas. Cost: Medium–High.**

**Documented mechanism.** Claude distinguishes authored instructions (`CLAUDE.md`, rules) from auto-memory. Rule files can load by matching file paths. Instruction layers concatenate; there is no deterministic semantic override when prose conflicts. Both instructions and memories are context, not enforced settings. [D04][D06]

Current auto-memory records `user`, `feedback`, `project`, and `reference` notes. `MEMORY.md` is bounded startup index; topic files load on demand. Current documented index limit: first 200 lines or 25KB, whichever comes first. Main auto-memory is machine-local, shared across worktrees of repository, and independent of transcript retention. Main conversation auto-memory normally does not load into non-fork subagents. [D04]

Subagent `memory` supports `user`, `project`, `local`, stored under agent name. With memory enabled, Read/Write/Edit are automatically enabled. Auto-memory disable also disables subagent memory. These are Claude-specific behaviors, not suitable defaults to mirror blindly. [D03]

**Inspectable artifact.** Apache-2.0 `revise-claude-md` separates reflection, concise proposed additions, shared versus personal placement, and explicit application. Useful curation pattern. Its literal `.claude.local.md` spelling differs from documented `CLAUDE.local.md`; sample cannot substitute for current reference. [S04][S04L][D04]

**Atlas adaptation — logical records, not proposed API fields:**

| Record kind | Scope and authority | Retrieval behavior |
| --- | --- | --- |
| Project knowledge | Project + domain/path + source revision | Relevant facts/references, with provenance |
| Member project rules | Stable project + stable member; authored or explicitly accepted authority | Compact persistent baseline plus matching path rules |
| Learning candidates | Same scope; evidence, origin, observed revision, review/supersession state | Useful hints; do not silently become policy |
| Task/PR episodes | Exact project + task or repository-qualified PR + iteration/head revision | Explicit recall on user request or task admission |
| Resume references | Member + task + host session/attempt + location/revision | Resolve execution context through host; not memory replay |

Distinguish logical member from human principal. Member-specific rules can be team-shared; personal preferences still need explicit audience. Authoritative rules, observations, guesses, and stale branch facts must remain distinguishable. Store source/evidence references and supersession links; support correction/deletion rather than indefinitely accumulating contradictory notes.

A reviewer allowed to save Atlas observations must not gain generic source-file write access. Memory writes need scoped Atlas capability. Auto-curation can be quiet and cheap; changed team policy follows existing rule authority rather than mandatory approval after every task.

**Counterexample/evaluation.** Two members hold different review preferences in one repo; same member works on another repo; two worktrees use incompatible schema revisions. Recall must select correct scope and expose stale/conflicting records. Rename public member label, restart host, delete obsolete rule: persisted rule identity and deletion must behave correctly. Atlas outage must surface unavailable recall/persistence, not an invented “remembered” fact.

### 3 — Evidence-bearing handoff and explicitly scoped resume

**Decision: ADAPT. Cost: Medium–High.**

**Documented mechanism.** Non-fork subagent gets its own prompt plus delegation message, project instructions subject to configuration, tool definitions, and explicitly preloaded skills; parent conversation and auto-memory do not automatically transfer. Fork is different: inherits conversation. Parent generally receives final report rather than all intermediate exploration. [D03][D07]

Session `continue` selects most recent directory session; `resume` selects explicit session; `forkSession` branches conversation. Conversation persistence does not snapshot filesystem. Subagent resume requires original session and agent identity; SDK docs instruct reusing custom agent definition. Current CLI `--from-pr` filters linked sessions, while explicit session-ID lookup can cross project directories. Lookup convenience is not project authorization. [D07][D08][D09]

**Inspectable artifacts.** `feature-dev` asks explorers to return key source files and parent to read them; architect prompt asks for file/line evidence, component boundaries, data flow, and implementation map. Research demo passes work through research-note/data/report artifacts. Adopt evidence pointers and constrained output, not demo's independent SDK client or full phase ceremony. [S03][S03A][S06]

**Orchestra adaptation.** One compact task contract describes objective, acceptance evidence, project/location, stable member, relevant task/PR, source revision, permitted effects, critical prior decisions, unresolved questions, and useful source/Atlas references. A result distinguishes completed, partial, blocked, cancelled, and failed work, with actual artifacts/check evidence and next action. These are proposed semantics, not Claude or Atlas API spellings.

Recall starts with explicit task/PR selector; retrieve bounded episodes and persistent rules before deciding whether transcript resume is useful. Resume checks member, project, task, host session, location, current permission profile, and repository state. Same work resumes explicitly; alternative investigation forks through host; missing/incompatible transcript falls back to fresh session with cited handoff.

Atlas preserves outcomes and decisions beyond transcript cleanup. Host preserves execution history. Neither display name nor “last session in cwd” identifies task reliably. PR number alone also collides across repositories; qualify with forge/repository and relevant head revision. Resuming reasoning never proves earlier DB mutation or deployment needs repeating.

**Counterexample/evaluation.** Two PRs active in same checkout; user asks to resume older one. Correct history must win over latest transcript. Restart after DB command sent but result not recorded: first reconcile effect, not resend automatically. Repeat request after cancellation, rebase, permission downgrade, or changed member definition; explain disposition. Standalone and Maestro paths should produce same scoped handoff and Atlas episode.

### 4 — Host-owned capabilities, separate from prompting

**Decision: ADOPT distinction; ADAPT enforcement to native host. Cost: Medium–High.**

**Documented mechanism.** SDK separates available tools (`tools`, agent tool definitions), pre-approved calls (`allowedTools`), deny/ask rules, permission modes, and runtime approval callback. `allowedTools` is not a restrictive allowlist. Already auto-approved calls bypass `canUseTool`. Current documented ordering: hooks → deny → ask → mode → allow → unresolved callback; hook allow does not override deny/ask. [D10]

Parent permission mode can override subagent's selected mode. Plugin-defined subagents ignore `permissionMode`, `hooks`, and `mcpServers` frontmatter; plugin-level hooks/MCP configuration has broader lifetime instead. “Put policy in agent YAML” therefore does not guarantee it applies. [D03]

**Inspectable implementation.** MIT Python SDK serializes permission responses and routes callback requests from CLI. That proves control-channel plumbing, not correctness of runtime's shell/path enforcement. Example substring checks demonstrate callback shape only. [S05Q][S05H][S05L]

**Orchestra adaptation.** Native member profile defines effective tool capabilities and location scope. Task permission snapshot narrows permitted effects; current host policy remains authoritative on resume. Skills and Atlas notes can request operations but cannot grant themselves privileges. Useful backend distinctions: inspect code, write owned code, execute scoped checks, inspect DB, migrate DB, interact with PR, deploy. Separate capabilities for Atlas read and member-scoped memory write.

Use real database read-only roles/transactions and existing filesystem/process isolation when constraints require them. A prompt saying “SELECT only,” or regex filtering shell text, cannot enforce DB semantics. “Read-only agent” must account for Bash and MCP side effects, not merely omit Edit.

**Counterexample/evaluation.** Skill pre-approves Bash while task grants review only; host must reject prohibited mutation. Same attempt through shell alias, script, alternate tool, or MCP must meet same boundary. Learning write succeeds within Atlas member scope without gaining code write. Repeat after permission downgrade and with malformed/out-of-date plugin metadata. Evaluate decisions from actual effects and host receipts, not assistant's claim that it obeyed.

### 5 — Identity-rich lifecycle hooks with explicit failure semantics

**Decision: ADAPT events and receipts, not hook runtime. Cost: Medium.**

**Documented mechanism.** Claude exposes `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `SubagentStart`, `SubagentStop`, `PreCompact`, `Stop`, and further events. Event fields and blocking power differ. Tool events correlate with `tool_use_id`; subagent events/tool hooks expose `agent_id` and `agent_type`. SDK message lineage also uses `parent_tool_use_id`. [D11][D12][D07]

Important limits:

- `PostToolUse` runs after effect. Async hooks cannot block it retroactively. [D11][D12]
- `Stop` is response completion, not durable task success; user interruption skips it and API failure uses `StopFailure`. `TaskCompleted` corresponds to Claude task bookkeeping, not every successful user request. [D11]
- Hooks can run in parallel. Skill hooks survive skill's turn; subagent hooks end with that subagent. No assumed ordering between separate handlers. [D11][D12]
- Transcript writes can lag event, so reading transcript path at Stop is weaker than supplied final message. Shutdown hook has limited budget. [D11][D12]
- Error behavior is event/transport-specific. Command exit 1 can be non-blocking; HTTP connection failure is non-blocking. A callback timeout on `PreToolUse` blocks tool, while Stop timeout renders no decision. “Hook installed” is not a blanket enforcement guarantee. [D11][D12]
- Python typed callback surface omits `SessionStart`/`SessionEnd`; TypeScript exposes them. Python settings-file command hooks are a different route. Source `HookEvent` confirms documented difference. [D12][S05T]

**Inspectable counterexample.** Research demo tracker attributes activity through mutable `_current_parent_id`, updated from latest message. Its code does not bind each hook to incoming native `agent_id`. Interleaving is therefore a design concern to test, not a measured runtime bug here. Current Python types explicitly document per-event identity for interleaving subagent hooks. [S06T][S05T]

**Orchestra adaptation.** Attach to verified native events only; names above are Claude names, not promised Orchestra hooks. Build attribution from explicit host session/member/task/tool-call identity. Deterministic handlers record context provenance, tool outcomes, handoff status, and Atlas persistence receipts. Use idempotent writes keyed to native event/operation identity; avoid global “current agent.”

Commit important task state as work progresses through host/Atlas boundaries, not exclusively on Stop/SessionEnd. Keep optional telemetry failures separate from authoritative state failures. Any continuation feedback needs bounded retries/cancellation; no hidden verifier model, recurrent prompt hook, or independent LLM loop.

**Counterexample/evaluation.** Interleave two member tool calls, duplicate result delivery, kill host before Stop, and fail Atlas write. Every effect retains correct attribution; duplicate notification does not duplicate learning or completion. Task stays partial when evidence/persistence missing. Resuming preserves cancellation and does not rerun side effects merely to rebuild logs.

### 6 — Conditional workflows, evidence handoffs, baseline evaluation

**Decision: ADAPT selectively. Cost: Low for recipes; Medium for bounded host orchestration/evals.**

**Documented mechanism.** Skills encode instructions model follows; dynamic workflows put orchestration into script with `agent()`, `pipeline()`, `parallel()`, phase grouping, structured outputs, and saved results. Workflow script cannot access filesystem/shell directly; agents perform work. Replay is not exactly-once effects: failed agent can cause later completed agents to rerun. Example filters `null` results, but null can mean cancellation/API failure, not absence of findings. [D14]

**Inspectable artifact.** Apache-2.0 feature-dev command encodes discovery, exploration, clarification, architecture, implementation, review, summary. It also prescribes repeated fan-out and approvals. Useful backend architecture/evidence templates; poor unconditional default for tiny edits. [S03][S03L]

**Orchestra adaptation.** Select smallest useful procedure: answer directly, inspect-and-fix, or staged investigation/design/change/verify when complexity warrants. Independent review or parallel analysis only when requested/justified and supported by native orchestration. Maestro can choose richer scheduling without changing specialist task/result interface. Saved recipes should identify inputs, expected evidence, continuation conditions, and stop conditions; do not import Claude workflow engine.

**Evaluation mechanism.** Official plugin-eval docs compare with/without-plugin outcomes and distinguish activation indicators from quality score. Skill-creator source adds realistic positive/near-miss cases and held-out iteration. Reuse methodology through Orchestra: same model/task/tool context, plugin on/off, outcome correctness, factual evidence, unwanted effects, routing accuracy, and resource cost. Model-judged quality complements executable checks; tool-call presence alone does not prove result correctness. [D15][S01]

Two source limitations to carry into evaluation design:

1. `run_eval.py` launches `claude -p`, discards subprocess stderr, and records exceptions as `False` trigger results; negative cases pass below trigger threshold. A broken runner can thus look like correct non-activation. Adapt explicit execution-error outcome; do not reuse evaluator unmodified or run it inside plugin. This is source-level deduction, not executed finding. [S02]
2. Claude plugin-eval isolates away project instructions, memory, other plugins, and default real MCP servers. That measures plugin-in-isolation, not actual Atlas/Maestro integration. Keep host integration scenarios with real scoped services alongside isolated content evaluation. [D15]

**Counterexample/evaluation.** One-line validation fix should not trigger architectural committee or repeated approvals. Transactional schema migration should expose lock/backfill/rollback assumptions and necessary checks. Cancel one parallel review: report incomplete coverage, not “no defects.” Break evaluator transport: case must be error, not negative success. Compare standalone and Maestro-backed outcomes with same task constraints.

## 4. Identity and packaging contract

Claude manifest provides concrete precedent: `name` namespaces/looks up components; `displayName` changes UI only. Plugin agents report scoped type names; runtime `agent_id` identifies invocation, not permanent teammate. Plugin data directory survives updates, while installed root path changes. These facts support separating presentation, component identity, and state—but not creating another memory store. [D13][D03][D11]

Recommended identity dimensions, **conceptual rather than API schema**:

| Dimension | Purpose |
| --- | --- |
| Package/component ID | Stable technical lookup and compatibility |
| Persistent member ID | Agent's enduring project rules and contribution lineage |
| Human/tenant principal | Who may access or authorize records/actions |
| Project/repository ID | Memory boundary independent of checkout path |
| Task/PR identity | Explicit episodic recall and assignment |
| Host session + attempt/tool-call identity | Execution, cancellation, event attribution |
| Definition/skill revision | Reproducible instructions and resume compatibility |
| Display label/aliases | Environment-configurable public name only |

Environment-specific label resolver belongs at presentation boundary. Do not assume Claude `displayName` supports arbitrary environment interpolation; documentation describes plain field and defined substitution sites elsewhere. Canonical IDs remain durable across label changes. Historical alias lookup must detect ambiguity rather than silently select newly reused name. Claude's documented `SendMessage` name-reuse protection is useful precedent. [D13][D03]

Plugin bundle should carry profile, skill catalog, references/assets, optional deterministic native adapters, compatibility declaration, and source/license notices. Runtime caches may be local; knowledge and memory remain Atlas-owned. `CLAUDE.md` placed at Claude plugin root is not automatically loaded, another reason not to infer portability from filenames. [D13]

## 5. What framing missed

1. **Authority is different from recollection.** Persisting rule is not enforcing it. Define who may change member/project rules and how conflicts/supersession work. Auto-memory is candidate knowledge until appropriate authority accepts policy change. [D04][D10]
2. **Memory has multiple lifetimes.** Standing rules, sourced domain knowledge, task/PR episodes, active transcript, execution attempts, permission grants, loaded skill text, and hooks expire differently. Treating all as “agent memory” causes stale rules and unintended privilege carryover. [D01][D04][D08][D11]
3. **Recall needs explicit query semantics.** Project/member/task/PR/revision scope, evidence links, result budget, stale-state handling, and deletion are as important as saving notes. Repository-wide memory alone cannot safely represent branch-specific operational facts. This is design deduction from documented memory sharing and session behavior. [D04][D09]
4. **Resume is reconciliation, not replay.** Conversation fork does not fork DB/files; restored transcript is not permission grant or proof tool finished. Unknown external effect must remain unknown until checked. Apply supplied native Session execution constraints. [D08][D09][D14]
5. **Agent identity is more than persona name.** Separate persistent member, execution instance, human principal, task, and label. Environment branding must not partition Atlas records or retarget old work. [D03][D11][D13]
6. **Compatibility must be explicit.** CLI, Python SDK, TypeScript SDK, plugin agents, standard skills, and product-specific frontmatter differ. Same-looking YAML may load while controls are ignored. Source/public examples can contain older tool names and file conventions. [D01][D03][D12][S03A][S04]
7. **“Amazing” needs marginal value evidence.** Richer persona and more stages can lower quality through noise/latency. Evaluate real backend failure cases plus simple-task restraint against native baseline. Separate runtime errors, blocked attempts, cancellation, non-activation, and genuinely clean findings. [D15][S01][S02]
8. **Shared Atlas needs concurrency and availability semantics.** Per-member isolation alone does not prevent conflicting shared-rule edits, stale reads, duplicate learning, or lost persistence during shutdown. Revisions, provenance, idempotency, and visible degraded mode are architectural work, not prompt-writing. Derived requirements; specific Atlas implementation remains unverified.

## 6. Public artifact reuse and license ledger

License texts/declarations below were read at pinned revision. Copy permission is not proof artifact is suitable unchanged. No source artifact was executed.

| Artifact | Verified license evidence | Reuse decision |
| --- | --- | --- |
| `anthropics/skills/skills/skill-creator/` | Folder `LICENSE.txt`: Apache-2.0, Anthropic copyright. [S01L] | Adapt progressive layout, trigger/eval guidance; preserve license/notices and mark modifications if copying |
| Same folder `scripts/run_eval.py` | Same folder Apache-2.0. [S01L][S02] | Inspect methodology; do not transplant Claude subprocess or exception-as-negative behavior |
| `claude-plugins-official/plugins/feature-dev/` | Plugin-local `LICENSE`: Apache-2.0. [S03L] | Adapt architect/evidence templates, conditional phases; avoid fixed fan-out/approval ceremony |
| `claude-plugins-official/plugins/claude-md-management/` | Plugin-local `LICENSE`: Apache-2.0. [S04L] | Adapt concise learning proposal/authority distinction; write into Atlas semantics, fix sample filename assumptions |
| `claude-agent-sdk-python` source/examples | Root `LICENSE`: MIT, copyright 2025 Anthropic. [S05L] | Inspect/optionally adapt callback attribution patterns; retain MIT notice for copied substantial source. Runtime dependency rejected for host-loop architecture |
| `claude-agent-sdk-demos` research demo | Root README declares MIT but does not contain full license text. Complete-tree license-filename query returned nested licenses; same query verified known README and research entrypoint paths. [S06R][S06TREE] | Reference-only for handoff/tracker study; complete scoped license text not established for general demo copying |
| Research demo's vendored PDF skill | Its own license grants use for PDF operations “within the research agent framework.” [S06L] | Do not infer unrestricted MIT reuse from repository README |
| `anthropics/skills` document skills | README explicitly distinguishes source-available document skills from Apache-licensed examples. [S01R] | Not in reusable-artifact shortlist; no blanket Apache claim |
| `anthropics/claude-code` | Root `LICENSE.md`: all rights reserved, Commercial Terms. [S07] | Documented behavior reference; no open-source runtime reuse claim |
| `claude-agent-sdk-typescript` | Root `LICENSE.md`: all rights reserved, Commercial Terms. [S08] | API/docs reference; do not describe SDK as MIT because Python wrapper is MIT |
| Official documentation / Agent Skills specification | Specification/docs consulted for behavior; redistribution license not independently established in this research | Implement ideas and cite; no wholesale documentation copying recommendation |

Pins:

- Skills: `8a1541c4a3ffa5a20a5a91de0dcf3f0bab1d1ef4` — commit date 2026-09-29.
- Official plugins: `d182ca456ca09d31d139f7d3818d1d333b103cce` — 2026-10-02.
- Python SDK: `68db221ebe29c1d82b0001ae80fa71e10d57d80a` — 2026-10-02.
- SDK demos: `826b268506a5f3707623c9e6140b200befcbebae` — 2026-03-13.
- Claude Code: `1c229fcd1e1e4e452e29a8f116b45fe4cfe2c528` — 2026-10-02.
- TypeScript SDK: `36836f000b931056f7de6471bcc90b31d658d4e9` — 2026-10-02.

## 7. Source limitations and next architecture evidence

- Research verifies current written contracts and inspected source shapes. No Claude/Orchestra execution, behavioral benchmark, model-quality claim, or measured integration cost.
- Closed runtime's memory selection, hook firing/order, permissions, and workflow replay treated as documented behavior. Python callback plumbing does not expose those internals.
- Current docs are mutable; pinned public sample revisions are independently reproducible. Version constraints matter, especially hooks, agent inheritance, configuration defaults, session APIs.
- Public source defects/risks described as static findings or deductions. No claim that proposed interleaving/error scenario has been reproduced.
- Before implementation, map proposed responsibilities to actual Orchestra extension points, native member identity, Atlas record/retrieval authority, and Maestro assignment/result contracts. Confirm which invariants host already enforces; extend native host only where required. Do not invent matching Claude-style hooks to fill gaps.
- Highest-value next architecture artifact: one standalone backend task and same task under Maestro, both showing identical stable identity, effective permissions, Atlas context provenance, task/PR recall, result evidence, and explicit resume disposition. This is bounded design validation, not mandatory ceremony for every future task.

## 8. Primary source register

### Official documentation

- **D01 — Skills:** https://code.claude.com/docs/en/skills — invocation control, frontmatter, lifecycle, pre-approved tools, dynamic context, forked execution, standard/extensions.
- **D02 — Agent Skills specification:** https://agentskills.io/specification — portable directory/frontmatter format and progressive disclosure. Primary standard linked from Anthropic docs.
- **D03 — Subagents:** https://code.claude.com/docs/en/sub-agents — definition identity, plugin restrictions, startup context, persistent memory, permission inheritance, resume and name-reuse checks.
- **D04 — Project memory:** https://code.claude.com/docs/en/memory — authored instructions, path rules, auto-memory categories/index/scope, compaction, instruction authority.
- **D05 — SDK overview:** https://code.claude.com/docs/en/agent-sdk/overview — embedded Claude Code binary/loop and terms. Also reached through official https://platform.claude.com/docs/en/agent-sdk/overview entrypoint.
- **D06 — SDK configuration loading:** https://code.claude.com/docs/en/agent-sdk/claude-code-features — `settingSources`, ambient memory, skills and filesystem/programmatic hooks.
- **D07 — SDK subagents:** https://code.claude.com/docs/en/agent-sdk/subagents — `AgentDefinition`, context inheritance, `parent_tool_use_id`, session/agent resume.
- **D08 — SDK sessions:** https://code.claude.com/docs/en/agent-sdk/sessions — continue/resume/fork, conversation versus filesystem, removed V2 interface, cross-host guidance.
- **D09 — CLI sessions:** https://code.claude.com/docs/en/sessions — `--from-pr`, cross-project ID lookup, restoration, permissions, interrupted calls, transcript format limitations.
- **D10 — SDK permissions:** https://code.claude.com/docs/en/agent-sdk/permissions — evaluation order, tool availability versus pre-approval, callback bypass, inherited modes.
- **D11 — Hooks reference:** https://code.claude.com/docs/en/hooks — event schemas, identity, lifetimes, parallel handlers, async limitations, exit/HTTP behavior, Stop/TaskCompleted semantics.
- **D12 — SDK hooks:** https://code.claude.com/docs/en/agent-sdk/hooks — language parity, callbacks, correlation, event-specific timeout behavior.
- **D13 — Plugin manifest:** https://code.claude.com/docs/en/plugins/manifest-reference — `name` versus `displayName`, component layout, ignored fields, variables, persistent data.
- **D14 — Dynamic workflows:** https://code.claude.com/docs/en/workflows — script-controlled orchestration, primitive examples, null results, replay boundaries, permissions and limits.
- **D15 — Plugin evaluations:** https://code.claude.com/docs/en/plugin-evals — baseline comparison, graders, failure/partial results, isolation scope, real-service limitations.
- Discovery index: https://code.claude.com/docs/llms.txt.

### Pinned public source and licenses

- **S01 — Skill creator:** https://github.com/anthropics/skills/blob/8a1541c4a3ffa5a20a5a91de0dcf3f0bab1d1ef4/skills/skill-creator/SKILL.md
- **S01L — Skill creator Apache-2.0:** https://github.com/anthropics/skills/blob/8a1541c4a3ffa5a20a5a91de0dcf3f0bab1d1ef4/skills/skill-creator/LICENSE.txt
- **S01R — Skills repository caveats:** https://github.com/anthropics/skills/blob/8a1541c4a3ffa5a20a5a91de0dcf3f0bab1d1ef4/README.md
- **S02 — Trigger evaluator:** https://github.com/anthropics/skills/blob/8a1541c4a3ffa5a20a5a91de0dcf3f0bab1d1ef4/skills/skill-creator/scripts/run_eval.py — subprocess at lines 70–91; exception-as-false and negative scoring at lines 213–241.
- **S03 — Feature workflow:** https://github.com/anthropics/claude-plugins-official/blob/d182ca456ca09d31d139f7d3818d1d333b103cce/plugins/feature-dev/commands/feature-dev.md
- **S03A — Architect definition:** https://github.com/anthropics/claude-plugins-official/blob/d182ca456ca09d31d139f7d3818d1d333b103cce/plugins/feature-dev/agents/code-architect.md
- **S03L — Feature-dev Apache-2.0:** https://github.com/anthropics/claude-plugins-official/blob/d182ca456ca09d31d139f7d3818d1d333b103cce/plugins/feature-dev/LICENSE
- **S04 — Rule curation command:** https://github.com/anthropics/claude-plugins-official/blob/d182ca456ca09d31d139f7d3818d1d333b103cce/plugins/claude-md-management/commands/revise-claude-md.md
- **S04L — Memory-management Apache-2.0:** https://github.com/anthropics/claude-plugins-official/blob/d182ca456ca09d31d139f7d3818d1d333b103cce/plugins/claude-md-management/LICENSE
- **S05 — Python subprocess transport:** https://github.com/anthropics/claude-agent-sdk-python/blob/68db221ebe29c1d82b0001ae80fa71e10d57d80a/src/claude_agent_sdk/_internal/transport/subprocess_cli.py — skills/source translation at lines 530–568; CLI settings at 723–730; process launch at 873–881.
- **S05Q — Python callback routing:** https://github.com/anthropics/claude-agent-sdk-python/blob/68db221ebe29c1d82b0001ae80fa71e10d57d80a/src/claude_agent_sdk/_internal/query.py — registration/agent initialization at 318–355; permission/hook dispatch at 586–654.
- **S05T — Python types:** https://github.com/anthropics/claude-agent-sdk-python/blob/68db221ebe29c1d82b0001ae80fa71e10d57d80a/src/claude_agent_sdk/types.py — `AgentDefinition` at 108–126; `HookEvent` and identity fields at 284–349.
- **S05H — Python hook examples:** https://github.com/anthropics/claude-agent-sdk-python/blob/68db221ebe29c1d82b0001ae80fa71e10d57d80a/examples/hooks.py
- **S05L — Python SDK MIT:** https://github.com/anthropics/claude-agent-sdk-python/blob/68db221ebe29c1d82b0001ae80fa71e10d57d80a/LICENSE
- **S06 — Research demo:** https://github.com/anthropics/claude-agent-sdk-demos/blob/826b268506a5f3707623c9e6140b200befcbebae/research-agent/research_agent/agent.py
- **S06T — Demo tracker:** https://github.com/anthropics/claude-agent-sdk-demos/blob/826b268506a5f3707623c9e6140b200befcbebae/research-agent/research_agent/utils/subagent_tracker.py
- **S06R — Demo README/MIT declaration:** https://github.com/anthropics/claude-agent-sdk-demos/blob/826b268506a5f3707623c9e6140b200befcbebae/README.md
- **S06L — Demo PDF scoped license:** https://github.com/anthropics/claude-agent-sdk-demos/blob/826b268506a5f3707623c9e6140b200befcbebae/research-agent/.claude/skills/pdf/LICENSE.txt
- **S06TREE — Complete demo tree:** https://api.github.com/repos/anthropics/claude-agent-sdk-demos/git/trees/826b268506a5f3707623c9e6140b200befcbebae?recursive=1 — API returned `truncated: false`; license-path query also verified known README and research entrypoint paths.
- **S07 — Claude Code license:** https://github.com/anthropics/claude-code/blob/1c229fcd1e1e4e452e29a8f116b45fe4cfe2c528/LICENSE.md
- **S08 — TypeScript SDK license:** https://github.com/anthropics/claude-agent-sdk-typescript/blob/36836f000b931056f7de6471bcc90b31d658d4e9/LICENSE.md

[D01]: https://code.claude.com/docs/en/skills
[D02]: https://agentskills.io/specification
[D03]: https://code.claude.com/docs/en/sub-agents
[D04]: https://code.claude.com/docs/en/memory
[D05]: https://code.claude.com/docs/en/agent-sdk/overview
[D06]: https://code.claude.com/docs/en/agent-sdk/claude-code-features
[D07]: https://code.claude.com/docs/en/agent-sdk/subagents
[D08]: https://code.claude.com/docs/en/agent-sdk/sessions
[D09]: https://code.claude.com/docs/en/sessions
[D10]: https://code.claude.com/docs/en/agent-sdk/permissions
[D11]: https://code.claude.com/docs/en/hooks
[D12]: https://code.claude.com/docs/en/agent-sdk/hooks
[D13]: https://code.claude.com/docs/en/plugins/manifest-reference
[D14]: https://code.claude.com/docs/en/workflows
[D15]: https://code.claude.com/docs/en/plugin-evals
[S01]: https://github.com/anthropics/skills/blob/8a1541c4a3ffa5a20a5a91de0dcf3f0bab1d1ef4/skills/skill-creator/SKILL.md
[S01L]: https://github.com/anthropics/skills/blob/8a1541c4a3ffa5a20a5a91de0dcf3f0bab1d1ef4/skills/skill-creator/LICENSE.txt
[S01R]: https://github.com/anthropics/skills/blob/8a1541c4a3ffa5a20a5a91de0dcf3f0bab1d1ef4/README.md
[S02]: https://github.com/anthropics/skills/blob/8a1541c4a3ffa5a20a5a91de0dcf3f0bab1d1ef4/skills/skill-creator/scripts/run_eval.py
[S03]: https://github.com/anthropics/claude-plugins-official/blob/d182ca456ca09d31d139f7d3818d1d333b103cce/plugins/feature-dev/commands/feature-dev.md
[S03A]: https://github.com/anthropics/claude-plugins-official/blob/d182ca456ca09d31d139f7d3818d1d333b103cce/plugins/feature-dev/agents/code-architect.md
[S03L]: https://github.com/anthropics/claude-plugins-official/blob/d182ca456ca09d31d139f7d3818d1d333b103cce/plugins/feature-dev/LICENSE
[S04]: https://github.com/anthropics/claude-plugins-official/blob/d182ca456ca09d31d139f7d3818d1d333b103cce/plugins/claude-md-management/commands/revise-claude-md.md
[S04L]: https://github.com/anthropics/claude-plugins-official/blob/d182ca456ca09d31d139f7d3818d1d333b103cce/plugins/claude-md-management/LICENSE
[S05]: https://github.com/anthropics/claude-agent-sdk-python/blob/68db221ebe29c1d82b0001ae80fa71e10d57d80a/src/claude_agent_sdk/_internal/transport/subprocess_cli.py
[S05Q]: https://github.com/anthropics/claude-agent-sdk-python/blob/68db221ebe29c1d82b0001ae80fa71e10d57d80a/src/claude_agent_sdk/_internal/query.py
[S05T]: https://github.com/anthropics/claude-agent-sdk-python/blob/68db221ebe29c1d82b0001ae80fa71e10d57d80a/src/claude_agent_sdk/types.py
[S05H]: https://github.com/anthropics/claude-agent-sdk-python/blob/68db221ebe29c1d82b0001ae80fa71e10d57d80a/examples/hooks.py
[S05L]: https://github.com/anthropics/claude-agent-sdk-python/blob/68db221ebe29c1d82b0001ae80fa71e10d57d80a/LICENSE
[S06]: https://github.com/anthropics/claude-agent-sdk-demos/blob/826b268506a5f3707623c9e6140b200befcbebae/research-agent/research_agent/agent.py
[S06T]: https://github.com/anthropics/claude-agent-sdk-demos/blob/826b268506a5f3707623c9e6140b200befcbebae/research-agent/research_agent/utils/subagent_tracker.py
[S06R]: https://github.com/anthropics/claude-agent-sdk-demos/blob/826b268506a5f3707623c9e6140b200befcbebae/README.md
[S06L]: https://github.com/anthropics/claude-agent-sdk-demos/blob/826b268506a5f3707623c9e6140b200befcbebae/research-agent/.claude/skills/pdf/LICENSE.txt
[S06TREE]: https://api.github.com/repos/anthropics/claude-agent-sdk-demos/git/trees/826b268506a5f3707623c9e6140b200befcbebae?recursive=1
[S07]: https://github.com/anthropics/claude-code/blob/1c229fcd1e1e4e452e29a8f116b45fe4cfe2c528/LICENSE.md
[S08]: https://github.com/anthropics/claude-agent-sdk-typescript/blob/36836f000b931056f7de6471bcc90b31d658d4e9/LICENSE.md
