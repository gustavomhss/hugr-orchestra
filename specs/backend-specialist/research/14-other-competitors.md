# R14 — Other coding-agent competitors: portable mechanisms for the backend specialist

Research date: **2026-10-03**. Research-only; acceptance tests below are proposed, not executed. Product claims checked against live primary docs; selected implementation details checked at pinned source revisions; public reports checked through GitHub issue/PR state and comments.

## Decision

Deep selection: **Amp, Factory Droid, Augment/Auggie, Zed Agent, Cline**. Best transfer: spend context deliberately, preserve source links, make capabilities visible in native UI, make correction and recovery cheap. Seven mechanisms below. Selection reflects the backend specialist fit and inspectable mechanisms, not a product-performance ranking.

The backend specialist remains **OpenCode/Orchestra plugin, independent of Maestro**. Atlas owns shared Knowledge/Memory. Reuse host sessions, tools, permissions, model access, diffs and recovery. Configurable names sit above stable IDs. Recommendations describe conceptual behavior, not verified backend specialist/Atlas API availability.

### Evidence labels

- **D — Vendor-documented:** primary usage contract; runtime not independently tested here.
- **M — Marketed:** vendor benefit, quality or efficiency claim; not measured here.
- **S — Source-backed:** specific implementation read at pinned revision; not proof every shipped surface behaves identically.
- **U — User-reported:** firsthand public report; scope/version/date retained. Reporter diagnosis is not established root cause unless separately supported.
- **A — Analysis/proposal:** the backend specialist adaptation, cost reasoning or acceptance criterion.

No benchmark results inferred. Public repository visibility does not establish product-wide source availability or reuse rights. No competitor code or skill package copied.

## 1. Current identities and selection rationale

| Selected product | Verified current identity | Why useful; main gap |
| --- | --- | --- |
| **Amp** | Coding agent/development environment with web, CLI, macOS/iOS and per-thread cloud **orbs**. Current docs use **Dial** modes `low`, `medium`, `high`, `ultra`; old descriptions of a fixed model or editor-only assistant are incomplete. [Introduction](https://ampcode.com/docs), [Dial](https://ampcode.com/docs/the-dial). **D** | Task-specific thread recall, effort choice and explicit cache tradeoffs. Vendor routing changes; public docs explicitly reject backward-compatibility commitments. Useful semantics require backend-specialist-owned stable IDs. **A** |
| **Factory / Droid** | Factory platform; **Droid CLI**, Factory App, Droid Exec and SDK expose its runtime. Custom droids are specialized subagents, not separate products. [Droid CLI](https://docs.factory.com/droid-cli/overview.md). **D** | Most useful here: progressive skills with effective-source inspection. Missions and software-factory orchestration add substantially more machinery than the backend specialist needs. **A** |
| **Augment Code / Auggie / Cosmos** | **Auggie** is terminal agent; **Context Engine MCP** exposes retrieval independently; **Cosmos** hosts expert workflows and scoped memory. Do not attribute every Cosmos feature to local Auggie. [CLI](https://docs.augmentcode.com/cli/overview.md), [Context Engine](https://docs.augmentcode.com/context-services/mcp/overview.md), [Memory](https://docs.augmentcode.com/cosmos/experts-memory.md). **D** | Best Atlas-relevant ideas: working-tree-aware retrieval and correction-derived memory. Hosted indexing/pricing and expert-specific VFS ownership should not become the backend specialist dependencies. **A** |
| **Zed Agent** | Native agent inside Zed. **External Agents** run separate ACP processes; **Terminal Threads** host CLI/TUI sessions. These have distinct configuration/capability boundaries. [AI overview](https://zed.dev/docs/ai/overview), [External Agents](https://zed.dev/docs/ai/external-agents.md). **D** | Strong native context selection and hunk review; source exposes action-log integration. External-agent feature parity is conditional, and review-state bugs remain reported. |
| **Cline** | Shared agent core with editor extensions, CLI, Desktop and SDK; separate Kanban surface. Cline, Roo and Kilo are not interchangeable current identities. [Overview](https://docs.cline.bot/). **D** | Useful separation of file rollback from conversation rollback, plus inspectable source. Checkpoint documentation currently overgeneralizes implementation and reversibility; see M7. |

### Screened candidates — deliberate deferral

- **JetBrains Junie:** current homepage distinguishes **Junie CLI** and **Junie Local** inside JetBrains IDEs; advertises IntelliJ-engine foundation. Good host-native integration reference, but reproducing IDE engine capabilities is outside lightweight plugin scope. Borrow host diagnostics through existing tools. Benchmark positioning is **M**, not selection evidence. [Primary](https://www.jetbrains.com/junie/).
- **Warp:** current product combines terminal/development environment, Warp Agent CLI and cloud Automation Platform; Warp Factories is labeled Early Access. Warp Drive automatically retrieves workflow/notebook context with “References”/“Derived from” citations. Valuable corroboration for Atlas provenance; separate shared knowledge product would duplicate Atlas. [Identity](https://docs.warp.dev/), [context citations](https://docs.warp.dev/knowledge-and-collaboration/warp-drive/agent-mode-context.md). **D/A**
- **Google Antigravity:** current docs distinguish **Antigravity 2.0** desktop command center, CLI, Python SDK and IDE. Artifacts include plans, diffs, diagrams and browser recordings with inline feedback. Strong asynchronous-review UX; defer dedicated artifact cockpit/browser-recording pipeline until real backend specialist workflows need it. Zed offers narrower native-review transfer. [Identity](https://antigravity.google/docs/home/), [artifacts](https://antigravity.google/docs/artifacts/). **D/A**
- **Kilo Code:** active platform spanning VS Code, JetBrains, CLI and gateway. Docs announce Anaconda acquisition; acquirer's announcement dated **2026-07-15**. Gateway breadth and routing savings are vendor claims, not demonstrated backend specialist advantage. Defer another routing/orchestration layer. [Docs](https://kilo.ai/docs), [acquisition](https://www.anaconda.com/blog/anaconda-acquires-kilo-code). **D/M/A**
- **Roo Code:** docs announce extension shutdown **May 15**, page updated **2026-05-15**, and point to community ZooCode fork or Cline. Treat Roo as historical mechanism reference, not active maintained competitor. No claim that ZooCode has inherited equivalent support or behavior. [Primary shutdown notice](https://docs.roocode.com/). **D**

## 2. Seven portable mechanisms

### M1 — Retrieval bound to actual checkout and evidence

**Primary:** [Augment Context Engine MCP](https://docs.augmentcode.com/context-services/mcp/overview.md), [index exclusions](https://docs.augmentcode.com/cli/setup-auggie/workspace-indexing.md).

- **Mechanism/value — D/A:** Augment distinguishes local working-directory indexing from remote default-branch indexing; exposes `codebase-retrieval`. Relevant snippets reduce repeated broad searches and whole-file reads. Its claims of semantic understanding and compression “without losing information” remain **M**.
- **Failure/limitation:** remote default branch can disagree with active branch or dirty worktree. `.gitignore`/`.augmentignore` exclusions affect coverage. “Local server” describes where MCP runs, not a guarantee all indexing/data storage stays local. Historical `--print` spend report **U80** below does not prove indexing caused charges.
- **Minimal backend specialist adaptation — A:** one retrieval entrypoint backed by **Atlas**, with workspace/repo identity, checkout revision, query and output budget. Return source path/range, revision or freshness state, and expandable original references. Check live file content before acting on retrieved code. Exact-symbol/file requests should use existing direct tools rather than trigger semantic retrieval automatically. If Atlas cannot establish freshness, report `unknown` and read source.
- **Recurring cost — A:** existing Atlas indexing/storage plus incremental refresh, query latency and retrieved input tokens. Repeated identical revision/query can reuse retrieval result; dirty-file changes invalidate relevant entries. Avoid per-session full indexing. Vendor alternative currently bills LLM usage plus service fee; see cost note below.
- **Acceptance test — proposed:** same symbol differs on default branch, feature branch and dirty file. Query feature workspace: active content wins or stale result is explicitly marked and refreshed. Change file, rerun query, verify old answer is not silently reused. Duplicate retrieval at unchanged revision does not rescan whole repository; exclusion case identifies missing coverage rather than inventing evidence.
- **Reject:** second vector store, routine whole-repo scans, default-branch snippets presented as current truth, unmeasured “lossless” summaries.

### M2 — Goal-specific handoff plus addressable thread recall

**Primary:** [Amp threads](https://ampcode.com/docs/threads), [referencing/finding threads](https://ampcode.com/docs/prompting).

- **Mechanism/value — D/A:** Amp can read mentioned thread IDs/URLs, extract task-relevant information, search prior threads by repo/file/author/date and hand off long work to fresh threads. Relief: fewer repeated explanations without carrying every old tool result forward.
- **Failure/limitation — A:** summary can omit constraints, promote guesses into facts or reference stale code. Retrieval/summarization adds calls; small tasks may cost less by staying in current cached session. Amp search visibility and updated-time filters are documented boundaries, not universal memory access.
- **Minimal backend specialist adaptation — A:** native “Continue with focused context” action. Persist compact handoff through Atlas with goal, explicit constraints, decisions and source IDs, changed-file references, verification status and next action. Keep raw session transcript host-owned; Atlas holds durable links and selected knowledge. Referenced thread expansion is on demand. Session and handoff IDs survive display-name changes.
- **Recurring cost — A:** occasional summary call, Atlas lookup/storage and selected snippets in new context; fresh session also incurs cache warming. Never summarize every turn or copy full transcript into shared memory.
- **Acceptance test — proposed:** prior session contains relevant decision, rejected approach, explicit user constraint and unrelated large logs. Handoff retains decision/constraint, marks rejected approach, links original evidence and stays inside configured context budget. Rename thread and agent; links still resolve. Changed source revision remains visible. Lossy summary can be expanded to original evidence.
- **Reject:** mandatory short sessions, invisible destructive compaction, conversation dump as authoritative Knowledge.

### M3 — Cache-aware effort profiles and bounded second opinion

**Primary:** [Amp Dial](https://ampcode.com/docs/the-dial), [Oracle tool](https://ampcode.com/docs/tools), [Zed profile source](https://github.com/zed-industries/zed/blob/a84689073d296dfd39987bc7dd478e43ef76d83a/crates/agent_settings/src/agent_profile.rs).

- **Mechanism/value — D/S:** Amp picks model, reasoning, prompt and tool set together, fixes mode after first message, and explains prompt-cache invalidation when these change. Oracle is optional because it costs more time/usage. Zed source separates profile ID from displayed name and stores explicit tool toggles/default-model preference. Initial Zed custom ID is name-derived; do not mistake that for collision-free identity allocation.
- **Failure/limitation:** Amp's claim that cross-model continuation confuses models is vendor experience, not general benchmark. Cheap first pass can cost more after retries; strongest mode can waste spend. Profile names alone do not communicate actual provider, tool scope or billing.
- **Minimal backend specialist adaptation — A:** small configurable profile set using host model/tool settings. Stable opaque/namespaced profile IDs; editable labels. Show selected model, tool scope and cost state. Keep prompt/tool prefix stable within host context epoch; explicit profile change uses host's normal transition. Optional focused second-opinion action uses existing host execution boundary with bounded input/output; default remains single execution path.
- **Recurring cost — A:** normal inference plus explicitly invoked consultation and possible cache warm-up. Record input/output/cache tokens, tool calls and actual or clearly estimated spend through host usage data. Unknown usage stays unknown.
- **Acceptance test — proposed:** label rename preserves profile/history links and tool settings. Repeated same-profile turns retain identical stable prefix. Explicit profile change is visible. Simple edit does not invoke consultation; requested consultation respects budget. Compare verified task completion and total retries/cost before adopting cheaper defaults.
- **Reject:** learned router service, permanent critic swarm, model switching each turn, hard-coded branded role identities.

### M4 — Lazy skills with inspectable effective resolution

**Primary:** [Factory skills](https://docs.factory.com/harness/skills.md), [Agent Skills specification](https://agentskills.io/specification), [Amp skills](https://ampcode.com/docs/customize/skills).

- **Mechanism/value — D:** Factory loads name/description first, body on invocation, resources deliberately. `/skills` exposes Enabled, Disabled, Overridden and Invalid states plus winning source. Narrow reusable procedures reduce repeated prompting; visible resolution reduces “wrong skill loaded” debugging.
- **Failure/limitation:** metadata still consumes context. Duplicate-name precedence varies by host. Factory explicitly says `allowed-tools` is metadata, not runtime sandbox. Amp connects skill MCP servers on discovery even while hiding their tools until invocation: lazy prompt exposure does not imply lazy process/network cost. Public Factory migration report **U23** exposes catalog/runtime disagreement.
- **Minimal backend specialist adaptation — A:** reuse host loader; add effective-source/version visibility where missing. Scope catalog to relevant project capabilities, then load body/resources on demand. Preserve portable `SKILL.md` core. Track stable skill ID and content revision separately from alias/display label. Tool access remains host-enforced. Imported extension fields require explicit compatibility handling.
- **Recurring cost — A:** catalog tokens on each uncached prompt prefix, body tokens when loaded, scripts/tool output and dependency maintenance. Keep descriptions short and stable. No automatic marketplace scans or eager service starts introduced by the backend specialist.
- **Acceptance test — proposed:** unrelated prompt includes metadata only; matching request loads selected body once. Duplicate names, disabled skill and malformed frontmatter produce visible effective states. UI and runtime report same revision. Renaming display label preserves pinned identity. Unknown capability metadata cannot silently grant tools.
- **Reject:** global prompt stuffing, keyword-only activation, marketplace popularity as correctness proof, second plugin registry/database.

### M5 — Human corrections become scoped, evidence-linked shared memory

**Primary:** [Augment Cosmos Memory](https://docs.augmentcode.com/cosmos/experts-memory.md), [Code Review Memory](https://docs.augmentcode.com/cosmos/experts-code-review-memory.md), [Cline Memory Bank contrast](https://docs.cline.bot/best-practices/memory-bank.md).

- **Mechanism/value — D:** Cosmos distinguishes simple memory for explicit human feedback from noisy memory that accumulates evidence before curation. Capture → curate → load; narrow repo/path scopes; contradictions against current evidence should surface. Relief: stop repeating corrections and repeated review false positives.
- **Failure/limitation — A:** noisy reactions or merged PRs do not establish truth. Automatic curation can fossilize one-off decisions; broad scope leaks conventions across projects. Cosmos stores team-owned VFS memory; that ownership model need not dictate the backend specialist storage. No measured learning-quality claim established here.
- **Minimal backend specialist adaptation — A:** begin with explicit corrections only, written once to **shared Atlas Memory** with source event/evidence IDs, scope, actor ID, timestamps and supersession link. Retrieve relevant records into context; promote curated Knowledge only with supporting evidence. Expose native inspect/edit/forget actions. Agents share authorized scoped views, not private persona databases. Current source contradictions supersede recalled guidance visibly.
- **Recurring cost — A:** small structured writes and retrieval tokens; optional curation work only when justified by feedback volume. No mandatory post-task learning agent. Retention and stale-record review remain ongoing costs.
- **Acceptance test — proposed:** user corrects repository convention; another authorized agent recalls it on matching task after restart. Different repo does not. Rename both agents: record still resolves. Retry same source event: no duplicate learning. Correction supersedes old record; contradictory current source is surfaced, not ignored.
- **Reject:** six always-read memory files per agent, treating thumbs-up/merge as proof, storing every transcript, separate backend specialist knowledge service. Cline's example explicitly says read **all** Memory Bank files at every task start; portable format, poor default for bounded context and existing Atlas.

### M6 — Native review driven by real action records and capabilities

**Primary:** [Zed Agent Panel](https://zed.dev/docs/ai/agent-panel.md), [ACP boundaries](https://zed.dev/docs/ai/external-agents.md), [pinned diff implementation](https://github.com/zed-industries/zed/blob/a84689073d296dfd39987bc7dd478e43ef76d83a/crates/agent_ui/src/agent_diff.rs#L111-L175).

- **Mechanism/value — D/S:** native context mentions include symbols, selections, diagnostics and branch diffs. Multi-buffer review supports individual hunks. Source derives changed buffers from thread action log; keep/reject operates on selected ranges and records undo information ([source](https://github.com/zed-industries/zed/blob/a84689073d296dfd39987bc7dd478e43ef76d83a/crates/agent_ui/src/agent_diff.rs#L270-L443)). Less copying between chat, terminal and diff viewer.
- **Failure/limitation:** Zed explicitly limits external-agent parity: skills/profiles/auth often remain agent-owned; checkpoints, token counts and restored history depend on integration. **U65053** reports inline review disappearing after subagent edits while main-chat controls remain. Attractive UI does not prove correct ownership/state.
- **Minimal backend specialist adaptation — A:** native thread action/command opens host's existing changed-file review, cited Atlas context and tool/test evidence. Render real host session/tool IDs; preserve main-session review ownership across auxiliary activity. Show unsupported capabilities honestly. Preserve host steer/queue semantics. Avoid another ACP process merely to put the backend specialist back inside its own host.
- **Recurring cost — A:** event projection, diff retention and UI maintenance; local deterministic rendering needs no model turn. Optional model-generated review order costs inference and should remain opt-in.
- **Acceptance test — proposed:** review two changed files, reject one hunk, switch threads and return: ownership and pending decisions persist. Interruption/restart restores accurate state. Repeat U65053 parent/auxiliary edit sequence. Unsupported integration lacks functional restore/usage claims. Selecting existing symbol/diagnostic supplies direct context without exploratory tool search.
- **Reject:** transcript parsing as source of truth, separate dashboard, duplicate permission/model selectors, assuming ACP means identical capabilities.

### M7 — Separate file recovery from conversational recovery

**Primary:** [Cline checkpoints](https://docs.cline.bot/core-workflows/checkpoints.md), [pinned restore source](https://github.com/cline/cline/blob/39ff2359f7e08231281539696e48a166ce49270c/sdk/packages/core/src/session/checkpoint-restore.ts), [checkpoint hooks](https://github.com/cline/cline/blob/39ff2359f7e08231281539696e48a166ce49270c/sdk/packages/core/src/hooks/checkpoint-hooks.ts#L624-L708).

- **Mechanism/value — D/S:** Cline offers Files, Task, or Files & Task restore semantics. Valuable distinction: useful conversation can survive failed edit, and corrected prompt can fork/retry from earlier point.
- **Documentation drift — S:** public guide describes separate shadow Git repository and snapshots after each tool. Current SDK source stores stash-shaped checkpoints under private `refs/cline/checkpoints/...`, keyed by user-run count; hooks capture before first model iteration for eligible root runs. Restore executes Git operations against supplied working directory. Do not repeat guide's storage/frequency statements as universal current implementation.
- **Failure/limitation:** “cost of a mistake drops to nearly zero” is **M**. Filesystem snapshots cannot reverse external side effects. Large repos incur storage/latency costs. Historical branch-rewind bug **U13550** has merged fix; separate ignored-file-loss report **U14367** has open proposed fix. Details below.
- **Minimal backend specialist adaptation — A:** expose existing host scoped restore and separate conversation fork/rewind where supported. Review affected paths before restore; detect intervening user changes. Reuse host recovery machinery and show actual recovery scope. Atlas memory is not rewound implicitly with code/chat. Omit restore action when host cannot supply required guarantees.
- **Recurring cost — A:** snapshot/diff storage, filesystem I/O, retention cleanup and conflict handling; no model needed for mechanical restore. Do not add second shadow repository or snapshot whole workspace after every read tool.
- **Acceptance test — proposed:** dirty user file, untracked file, changed nested `.gitignore`, later user commit and agent edit coexist. File-only rollback reverts eligible agent edits while preserving user data/history and chat. Chat-only operation leaves filesystem and Atlas untouched. Crash/restart preserves checkpoint identity. Replay U13550/U14367 scenarios against host before exposing recovery UX.
- **Reject:** blanket `git reset`/`git clean` rollback, promising undo for arbitrary shell/network effects, automatic deletion of learned memory on chat rewind.

## 3. Public failure ledger — dates and resolution matter

State checked **2026-10-03**. Open report is not prevalence estimate; merged fix is not proof every installed version contains it.

| Evidence | First report / scope | Current disposition and bounded lesson |
| --- | --- | --- |
| **U80** — [Auggie #80](https://github.com/augmentcode/auggie/issues/80) | **2026-02-20**; repeated `auggie --print`; reporter attributes heavy credit burn to repeated indexing. | **Open**. Reporter supplies usage narrative, not independently verified billing attribution. Historical credit-plan arithmetic must not be used as current pricing: current docs describe tokens plus service fee. Lesson: attribute retrieval, inference and background work separately; reuse context deliberately. |
| **U23** — [Factory #23](https://github.com/Factory-AI/factory/issues/23) | **2026-08-27**, Droid CLI **0.157.1**, Windows; migration leaves management commands reading old aggregate files while sessions load plugins. | **Open, partly improved per user follow-up**. **2026-10-02**, **0.232.0**, macOS: `plugin list` works; `marketplace list` still empty and add reports already exists. Do not claim all commands remain broken. Lesson: effective catalog and runtime must share identity/version resolution. |
| **U65053** — [Zed #65053](https://github.com/zed-industries/zed/issues/65053) | **2026-10-01**, Zed **1.22.0**, macOS, built-in Agent; auxiliary edit makes main-file inline review disappear. | **Open**. Reporter describes AI-assisted local fix, not upstream release. Main-chat Keep/Reject still available. Narrow lesson: test review ownership across thread creation; not “all review broken.” |
| **U13550** — [Cline #13550](https://github.com/cline/cline/issues/13550) | **2026-08-25**, shared SDK source; checkpoint restore could move branch behind later commits. | **Fixed in source, issue closed 2026-08-27**. [PR #13626](https://github.com/cline/cline/pull/13626) merged **2026-08-27 20:47:50 UTC**, commit [`89c2efa`](https://github.com/cline/cline/commit/89c2efa970a115d0815942e4eb69f1a74f9d3b5e). Current inspected source checks HEAD and uses compare-and-swap ref update. Keep as regression lesson, not current blanket accusation. |
| **U14367** — [Cline #14367](https://github.com/cline/cline/issues/14367) | **2026-09-21**, Desktop **0.0.32**, SDK **3.33.x**, Windows; uncommitted ignore rules can disappear before cleanup, exposing ignored data to deletion. | **Open**. [PR #14377](https://github.com/cline/cline/pull/14377), created **2026-09-22**, remains **open/unmerged**. Pinned current restore source contains `stash --include-untracked`, reset and conditional `clean -fd`, supporting described mechanism; not locally reproduced here. Distinct from fixed HEAD-movement issue. |

**Current cost context — D:** [Augment pricing](https://docs.augmentcode.com/models/token-based-pricing.md) states provider-list LLM rates plus **40% service fee** and separate Cosmos compute; Context Engine docs give vendor-observed query-cost examples, not controlled benchmarks. [Amp pricing](https://ampcode.com/docs/pricing) distinguishes model/tool spend from orb compute. The backend specialist adoption costs above concern ported mechanisms through existing host/Atlas; competitor subscriptions are not implied dependencies.

## 4. Portable skills: concrete interoperability, bounded quality claim

Portable core worth adopting: directory + `SKILL.md`, `name`, `description`, Markdown body and relative supporting resources. **Format interoperability is stronger evidence than ecosystem quality.** This research examined loading/resolution contracts and one parser; it did not execute imported skills or establish catalog-wide correctness.

| Concrete difference | The backend specialist consequence |
| --- | --- |
| [Factory](https://docs.factory.com/harness/skills.md) prioritizes project/folder skills above personal in ordinary sessions; [Amp](https://ampcode.com/docs/customize/skills) lists machine-local roots ahead of project/repository skills; [Auggie](https://docs.augmentcode.com/cli/skills.md) documents user `.augment` highest. **D** | Show effective source and overridden copies. Importing identical files into different hosts need not preserve behavior. |
| [Zed](https://zed.dev/docs/ai/skills.md) uses project-over-global, flat layout and documented **50 KB catalog budget**; metadata edits invalidate prompt cache. **D** | Stable short catalog, explicit overflow/invalid states; avoid silently implying all installed skills are available. |
| [Agent Skills spec](https://agentskills.io/specification) describes experimental `allowed-tools` as space-separated string. Factory examples use YAML lists and document metadata-only enforcement. [Cline Agent Plugins parser](https://github.com/cline/cline/blob/39ff2359f7e08231281539696e48a166ce49270c/sdk/packages/core/src/extensions/agent-plugin/agent-skill.ts) requires string, rejects unrecognized fields; its comment distinguishes stricter Agent Plugins path from permissive native skills. **D/S** | Portable envelope does not imply portable permissions or extension fields. Keep the backend specialist UI identity/config outside unsupported frontmatter. No blanket claim all Cline loading paths reject those fields. |
| [Auggie skill browser](https://docs.augmentcode.com/cli/skills.md) exposes source and estimated token size; Factory asks for clear triggers, completion criteria and linked support resources. **D** | Useful quality signals: precise task boundary, relevant examples, current source references, testable finish condition, visible context cost. Marketplace stars/download counts do not establish these. |

Minimal import policy **A**: selected task-relevant packages only; retain source URL/revision and applicable license information; inspect actual package terms before redistribution. Reusable procedure becomes skill; evolving project facts remain Atlas Knowledge/Memory. Share links are references, not evidence that bundled scripts/dependencies are portable.

## 5. Minimal backend specialist landing shape and rejected overhead

**Conceptual ownership — A:**

- **Host:** session IDs and transcript, execution, steer/queue delivery, tool permissions, model/provider access, usage, diff and recovery primitives.
- **Atlas:** shared knowledge, scoped memory, evidence references and handoff records. One shared authority; actor ownership/provenance does not create per-agent silos.
- **The backend specialist plugin:** small profile/skill/context affordances and host-native actions. Persist stable `agentId`, `profileId`, `skillId`, `sessionId` and source IDs; editable `displayName`/aliases never serve as foreign keys. No dependency on Maestro's runtime or orchestration.

**Suggested order — A:**

1. Start with M1 retrieval/provenance, M4 lazy effective skills, M6 existing native review surfaces. Direct pain relief, bounded new state.
2. Add M2 handoff and M5 explicit-correction memory through Atlas. Inspectable records before automatic learning.
3. Add M3 budgeted consultation after usage is visible. Expose M7 only atop verified host recovery behavior.

**Rejected overhead:** cloud orb/VM factory, mission orchestrator, always-on critic team, second MCP/ACP loop, independent context index, automatic marketplace service, per-persona Memory Bank, full-workspace shadow snapshots, dedicated artifact cockpit. Their value can be real at platform scale; observed mechanisms do not establish need inside the backend specialist.

**Acceptance across all mechanisms — proposed:** task completes against same correctness checks; compare total input/output/cache tokens, tool calls, retries, retrieval freshness and human correction effort using host telemetry. Include failed attempts and setup/maintenance work. Claim efficiency only after measured task-level comparison. Candidate-specific marketing percentages and issue anecdotes supply hypotheses, not benchmarks.
