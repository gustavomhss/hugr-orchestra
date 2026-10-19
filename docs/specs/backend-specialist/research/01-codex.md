# R01 — Reusable Codex mechanisms for backend specialist plugin

Research date: **2026-10-03**. Scope: OpenAI Codex CLI, app-facing interfaces, skills, agents, tools, context, verification, isolation, resumption.

## Architecture first — recommendation

Build **host-native specialist policy and workflow layer** inside Orchestra. Reuse Codex mechanisms as design references; execution stays in native Session, tool, permission, Location, and context machinery. **Atlas remains shared Knowledge/Memory foundation** for task/PR recall and persistent per-member project rules. Maestro integration consumes same task/result contracts as standalone entrypoint.

Proposed boundaries—not claims about existing plugin APIs:

| Component | Responsibility | Authority |
| --- | --- | --- |
| Task contract | Objective, constraints, target services, allowed changes, acceptance cases, verification commands, evidence requirements | Explicit task plus host policy |
| Member identity | Stable machine `member_id`; environment-resolved public display name | Plugin identity configuration |
| Context assembler | Resolve scoped repo instructions, Atlas rule revisions, task/PR recall, selected stack skills; record provenance and omissions | Native context lifecycle; Atlas owns persistent knowledge |
| Execution adapter | Native prompt admission, session IDs, tools, permissions, interruption, Location/worktree selection | Orchestra runtime |
| Evidence projection | Bind checks and artifacts to task, native tool call, environment, source revision, and diff | Actual host events and tool results |
| Maestro adapter | Translate native contracts and lifecycle events when Maestro present | Optional integration; independent plugin remains usable |

Illustrative stable ID: `backend.specialist`; illustrative display setting: `BACKEND_SPECIALIST_NAME`. Names never become Atlas membership keys, task ownership keys, or resume identifiers. These names are proposals, not required product branding.

Suggested order: contract/identity → Atlas-backed context → evidence projection → scoped execution/worktree integration → explicit resume reconciliation. Do not introduce Codex app-server, Codex SDK subprocesses, separate LLM loop, or competing memory database. Native execution history and Atlas knowledge have different responsibilities.

## Evidence boundary

- **D — documented:** Current first-party documentation read through `webfetch`. Repository README led to developer docs; current docs link to `learn.chatgpt.com/docs`. Documentation describes supported/intended behavior, not observed execution.
- **S — source-observed:** GitHub REST source inspected at immutable commit **[`b172810921f89847cd310ecc496f9c901760e933`][revision]**, whose commit timestamp is `2026-10-03T19:10:17Z`. This is a `main` snapshot, not verified correspondence with a shipped release.
- **X — actually executed:** Installed `gh` performed read-only repository metadata/tree/content requests; `webfetch` fetched documentation; parent-directory listing verified destination; `apply_patch` wrote this report. Codex, downloaded scripts, test suites, model calls, sandbox probes, and worktree lifecycle operations were **not executed**.
- **P — proposal/inference:** Plugin architecture, adoption choices, cost judgments, and evaluation cases below. Evaluation cases are future acceptance experiments, not reported results.

Source discovery used Git tree response with `truncated: false` and positive control `LICENSE`, then actual returned paths. Initial unquoted `?recursive=1` request failed in zsh; quoted retry succeeded. No absence conclusion was drawn from that failure or from metadata-only worktree contents. Source was read remotely, without checkout.

Cost scale: **Low** = metadata/prompt shaping over available host hooks; **Medium** = typed contracts, adapters, evidence handling; **High** = execution-boundary or recovery semantics requiring host integration. Costs are qualitative design estimates, not measured schedules.

## Findings

### 1. Typed task boundary plus identity separated from presentation

**Primary evidence:** [App-server documentation][app-server], [prompting guidance][prompting], [custom agents documentation][agents]; source [`turn.rs`][turn], [`agent_role_config.rs`][roles]. **D + S.**

**Mechanism.** App-server separates thread, turn, and item identities. `TurnStartParams` carries input, CWD, permission/sandbox overrides, model settings, optional client message ID, and optional `output_schema`. Documentation says most turn overrides become thread defaults, while `outputSchema` applies only to current turn. `TurnSteerParams` requires `expected_turn_id`; documentation specifies rejection when active turn does not match. This provides explicit target identity and stale-input precondition, rather than routing follow-ups by human-readable title.

Custom agent docs identify roles by TOML `name`. Parser validates nonempty role name/developer instructions, extracts descriptive metadata and nickname candidates, then separates those fields from session configuration layer. This is role/config structure, not evidence of a complete engineering task contract or verified acceptance.

**Adopt/adapt.** Define plugin `TaskContract` with stable task/member/session IDs, project and Location reference, base revision, scope, constraints, required checks, and evidence-bearing result shape. Resolve display name independently. Use explicit native Session steering/queue semantics; require matching task/session context for follow-up changes. Freeze effective policy/context revision per execution boundary instead of accidentally inheriting sticky overrides.

**Atlas/plugin fit.** Atlas task/PR records and member rules keyed by stable IDs. Same contract enters standalone plugin or Maestro adapter. Atlas recall informs task; it does not create current authorization. Keep durable prompt admission and advisory scheduling under existing Session rules.

**Reject.** Treating schema-valid output as proof of correctness; role names as mutable persistence keys; embedding Codex as second runtime. Optional client message ID field alone does not establish retry idempotency.

**Cost: Medium. Evaluation:** Change shared API used by Go service and TypeScript gateway. Rename public specialist midway, retry identical admitted task, then submit steering against old active task/turn. Expected: stable Atlas ownership/recall, native exact-retry semantics, stale steering rejected, compatibility case required before acceptance. Test standalone and Maestro entrypoints against same contract.

### 2. Provenance-aware instruction snapshots plus progressive skill disclosure

**Primary evidence:** [AGENTS.md documentation][agents-md], [skills documentation][skills]; source [`agents_md.rs`][instructions], [`agents_md_manager.rs`][instruction-manager], [`render.rs`][skill-render], [`selection.rs`][skill-selection], [`host_prompt.rs`][skill-host-prompt]. **D + S.**

**Mechanism.** Repository instructions are discovered root-to-CWD, with override/default/fallback candidate order. Loader tracks exact source path, environment ID, and CWD; it bounds repository content and bypasses project instructions for untrusted projects. Manager serializes refreshes, calls user/thread providers outside state lock, and replaces applied host instructions only after validation. Repository cache refresh depends on environment selections or project trust changes; this is not unconditional filesystem hot reload.

Skills initially expose metadata rather than complete workflows. Renderer derives default metadata allowance from context window, shortens descriptions before dropping entries, and produces omission/truncation reports. Explicit host-skill selection resolves paths; plain-name selection requires unambiguous name and avoids connector-name collisions. Documentation also supports disabling implicit invocation while retaining explicit invocation.

**Important source qualification.** Source constants use 2% metadata allowance, fallback 8,000 characters, and separate 8,000-byte main-prompt cap. `HostSkillsSnapshot::load_skill_prompts` applies latter to agent-plugin skills, emitting warning; ordinary standalone host skills follow different branch. Thus documentation's “full SKILL.md” language is not universal across inspected loading paths. These are implementation constants, not performance measurements.

**Adopt/adapt.** Assemble compact task context from source-tagged Atlas member/project rules, relevant task/PR recall, repository instructions, and selected stack skills. Keep mandatory constraints outside lossy recall summaries. Track source revision/hash, scope, authority, and omitted content; do not silently truncate task-critical rules. Re-resolve when scope or rules revision changes. Select skills by stable identity/source, not display-name similarity.

**Atlas/plugin fit.** Atlas remains persistent source for member rules and recall. Skills package reusable backend procedures—migration review, API compatibility, concurrency diagnosis—without becoming another memory store. Native context machinery receives bounded fragments and provenance.

**Reject.** Dumping all Atlas history and every language skill into prompt; storing competing project rules in plugin-private global files; presenting recall as authoritative current instructions.

**Cost: Medium. Evaluation:** Monorepo with Java payment service and Python worker, conflicting scoped rules, two identically named migration skills, oversized catalog, and Atlas rule update during task. Expected: correct member/project scope, explicit ambiguity resolution, omission visibility, mandatory migration constraint retained, new rule version applied at defined boundary.

### 3. Verification needs tool evidence, not plan status or polished final prose

**Primary evidence:** [non-interactive JSON events][exec-docs], [bug-fix verification guidance][prompting]; source [`exec_events.rs`][exec-events], [`plan.rs`][plan], [`plan_spec.rs`][plan-spec], [`apply_patch.rs`][apply-patch], bundled [`review-agent/SKILL.md`][review-skill]. **D + S.**

**Mechanism.** Exec protocol distinguishes command, patch, MCP call, plan, and agent-message items. Command execution includes command, aggregated output, optional exit code, and status. `item.completed` marks terminal state—including failure—not guaranteed success. `turn.completed` carries usage, not acceptance evidence.

`PlanHandler` parses supplied step/status data, emits `PlanUpdate`, and returns “Plan updated”. Tool description says at most one in-progress step; inspected handler implements deserialization/event emission, not acceptance-check execution. `apply_patch` handler instead parses patch, verifies it against selected filesystem, checks permissions, executes through tool orchestrator, and emits resulting change evidence. Patch applicability still does not prove backend behavior.

Bundled review skill gives useful review contract: inspect complete merge-base diff and surrounding paths, demonstrate introduced defect, report actionable finding with small overlapping line range, remain read-only. This is instruction source, not proof review follows those rules or detects defects.

**Adopt/adapt.** Bind each acceptance criterion to native tool evidence: command/argv, CWD, source and diff identity, toolchain/environment identity, terminal status, exit code, meaningful test report, artifact reference. Distinguish passed, failed, blocked, skipped, unavailable. Require relevant execution evidence for verification claims; preserve raw logs outside active prompt and retrieve slices when needed. Use defect-first, change-scoped review contract.

**Atlas/plugin fit.** Atlas stores concise task/PR outcomes with links to durable native evidence/artifacts. Stack adapters discover repository's actual commands and test layout; same evidence envelope works for Rust, Go, JVM, Python, .NET, and TypeScript. Build result adapters, not language-specific LLM runtimes.

**Reject.** Counting checklist completion, assistant “tests pass”, successful patch application, or process exit alone as sufficient acceptance. Test runner can select nothing or skip relevant scenario.

**Cost: Medium; High if host cannot expose durable tool evidence. Evaluation:** Reproduce duplicate-payment bug in real service, then fix. Include failed pre-fix execution, passing post-fix integration case, deliberately empty test selection, skipped DB-dependent case, and sandbox-denied runner. Expected: only meaningful passing case satisfies criterion; other states remain explicit. Reintroducing duplicate-write defect must fail behavioral check.

### 4. Separate capability enforcement, approval, and command execution

**Primary evidence:** [sandbox documentation][sandbox], [app-server command boundaries][app-server]; source [`tools/orchestrator.rs`][orchestrator], [`sandboxing/manager.rs`][sandbox-manager], [`apply_patch.rs`][apply-patch]. **D + S.**

**Mechanism.** Documentation distinguishes technical sandbox from approval decision. Orchestrator has explicit forbidden/needs-approval/skip paths, chooses sandbox for selected environment, attempts execution, distinguishes sandbox denial from ordinary tool errors, and conditions escalation on policy/tool eligibility. Retry is not unconditional; strict automatic-review mode has further review conditions. Source manager selects platform backends and constructs execution-boundary requests carrying CWD, environment, filesystem/network profile, and sandbox state.

App-server documentation explicitly distinguishes sandboxed `command/exec` from user-initiated `thread/shellCommand`, which runs outside thread sandbox with full access. Experimental `process/spawn` also runs outside Codex sandbox. API proximity does not imply identical authority.

**Adopt/adapt.** Map specialist capabilities onto native host permissions and enforced execution environment. Keep filesystem roots, network destinations, process access, and DB/service credentials explicit. Return denied/blocked state with useful evidence. Any extension of authority belongs to host approval system, not prompt-only permission. Distinguish user terminal actions from agent tool calls.

**Atlas/plugin fit.** Atlas records decisions/context references, never reusable grants inferred from remembered approval. Maestro can request constrained task but cannot broaden host authority merely by supplying orchestration metadata.

**Reject.** Shipping Codex approval-agent runtime; exposing unsandboxed user terminal as ordinary specialist tool; treating `approval_policy = never` as equivalent to unrestricted sandbox. Reuse host policy machinery rather than layering contradictory policy engines.

**Cost: Medium with existing enforced host boundary; High if missing. Evaluation:** Backend test needs temporary build output and ephemeral DB. Allow declared worktree/temp roots and test endpoint; attempt write into sibling repo and undeclared outbound connection. Expected: legitimate test executes, undeclared actions denied, diagnostic retained. Repeat on each supported execution platform; source inspection does not substitute for these probes.

### 5. Owned, reproducible workspaces with careful Git bootstrap

**Primary evidence:** [app worktree documentation][worktrees]; source [`worktree/src/lib.rs`][worktree-lib], [`metadata.rs`][worktree-metadata], [`git.rs`][worktree-git]. **D + S; app Handoff/snapshot claims D only.**

**Mechanism.** Public `WorktreeManager::create` resolves base to commit, creates detached no-checkout worktree, sets destination-local metadata, materializes destination, validates CWD remains safely beneath root, and rolls back incomplete creation. This describes downloaded source only; none of those operations ran during research.

Git wrapper removes inherited repository-selector/config environment, disables hooks/fsmonitor and configured clean/smudge/process filters for bootstrap operations through command-local overrides. Owner metadata uses versioned thread ID, same-owner idempotence, atomic no-clobber publication, and conflicting-owner rejection. Removal validates registered managed checkout, refuses current checkout, checks ignored files, and uses Git removal without force for ordinary removal.

Documentation additionally describes same-chat Handoff, ignored-file inclusion, automatic snapshots before managed cleanup, and restore UX. Those app lifecycle guarantees exceed inspected crate's create/list/bind/remove behavior.

**Adopt/adapt.** Native worktree/Location ownership keyed by stable task/session, explicit base SHA, environment setup fingerprint, and evidence destination. Treat checkout bootstrap as own controlled operation; don't inherit arbitrary hooks/filters. Maintain ordinary development validation hooks separately. For this repository, base resolution must respect configured `dev`/`origin/dev`; inspected helper's conventional main/master fallback is unsuitable when remote HEAD absent.

**Atlas/plugin fit.** Atlas recall links task/PR to base, diff, artifacts, and workspace references. Execution ownership stays native. Optional Maestro consumes those references without becoming worktree owner of record.

**Reject.** Worktree as OS sandbox, transaction boundary, or isolated DB. Shared Git metadata, databases, ports, services, caches, and credentials need separate ownership. Avoid blanket copying ignored secret files because app docs show `.env` examples.

**Cost: Medium for native ownership/bootstrap adapter; High for robust cross-environment Handoff/snapshot recovery. Evaluation:** Two tasks edit same migration filename in separate worktrees, source checkout has dirty user work and custom smudge hook, public agent name changes, both tests target same DB. Expected: checkout/owner isolation and preserved user work; DB namespacing prevents cross-task effects; conflicting workspace bind rejected. Add metadata-only/no-checkout fixture: missing tracked files must not be interpreted as requested deletions.

### 6. Resume from explicit history/provenance, reconcile uncertain side effects

**Primary evidence:** [app-server resume/fork/compact documentation][app-server], [exec resume documentation][exec-docs]; source [`history/src/lib.rs`][history], [`compaction_resume_metadata.rs`][resume-metadata], [`compaction_checkpoint.rs`][checkpoint], [`rollout/src/recorder.rs`][recorder], [`persisted_resume_settings.rs`][resume-settings], [`compact_remote_history.rs`][compact-history]. Authored tests: [`compact_resume_fork.rs`][resume-tests]. **D + S, not runtime-tested.**

**Mechanism.** Persistence distinguishes session metadata, response envelopes, turn context, compacted history, world state, retained context, and events. Resume metadata explicitly includes last-started-turn identity and previous settings. Presence can distinguish intentionally absent value from old-format missing information. History metadata preserves origin, inherited user-message status, compaction producer, and truncation budget; inherited context is not treated as fresh local authorization in its declared semantics.

Checkpoint helper selects latest compaction even if malformed and separately checks usable encrypted payload plus matching recorded producer hash. Scope: inspected helper; this is not proof all resume paths perform identical compatibility validation. Context-window trimming replaces oversized tool output with explicit truncation message while preserving call identity and success field.

Recorder separates queue admission (`record_canonical_items`) from acknowledged persist/flush barriers. Writer keeps unwritten suffix for retry and retains supplied writer-lock guard with background task. Reader counts/skips malformed JSON or undecodable records; `get_rollout_history` receives but discards parse-error count. Inspected write path calls `flush`, so it does not establish power-loss durability or exactly-once external effects. Partial-history recovery needs explicit interpretation.

**Adopt/adapt.** Reuse native Session history/Context Epoch boundaries and process-local coordinator. Store resumable task references to contract version, Atlas rule/recall revisions, artifacts, last known tool outcome, and worktree/base. After interruption, inspect actual filesystem/service state before explicit continuation; treat uncertain side effects as unresolved. Preserve admission-versus-execution distinction and existing steer/queue semantics. Do not turn advisory wake into automatic provider retry after crash.

**Atlas/plugin fit.** Atlas supplies long-lived recalled outcomes and rules; native Session store owns execution record. Compaction summary is lossy view, not replacement for Atlas or raw evidence. Resume must reload relevant source references and current effective host policy.

**Reject.** Importing provider-specific encrypted compaction as general polyglot memory; copying JSONL store as second persistence authority; treating history recovery as proof command can safely run twice.

**Cost: High for robust reconciliation; Medium for reference-only projection over existing native resume. Evaluation:** Interrupt migration task after DB side effect but before tool-result acknowledgement; compact and restart; alter member display name and Atlas rule revision. Expected: same task/member identity, preserved constraint/evidence references, explicit uncertain outcome, DB migration state inspected, no duplicate migration from blind replay. Include corrupt/truncated history and incompatible checkpoint provenance cases.

## Exact unresolved source limitations

1. **Release alignment:** inspected current `main` SHA; installed Codex release, feature flags, account settings, and client-specific execution paths unverified. Documentation and source can differ. Do not present this as shipped-version certification.
2. **App implementation reach:** inspected public app-server and managed-worktree crate; desktop UI Handoff, automatic snapshot/restore, cleanup scheduling, and `.worktreeinclude` implementation were not traced. Those assertions remain D only. Official [open-source inventory][open-source] explicitly labels IDE extension and Codex cloud non-open-source; it does not provide full desktop UI source provenance.
3. **Skill loading divergence:** documentation says selected skill reads full instructions; inspected plugin-skill injection imposes main-prompt cap and warning. Exact path used by each app/CLI/plugin configuration unresolved. Standalone host branch was observed to differ.
4. **Instruction refresh divergence:** AGENTS docs describe once-per-run discovery; manager supports request-boundary provider refresh and conditional repository cache refresh. Full caller/client trigger map not traced. Do not claim universal hot reload or universal once-only loading.
5. **Verification reach:** event/handler code and bundled review instructions inspected; model obedience, review accuracy, test-selection adequacy, and source-to-binary parity unmeasured. `outputSchema`, plan state, and tool status each cover narrower properties than task success.
6. **Recovery reach:** queue/flush/read behavior observed, not crash- or power-loss-tested. Supplied writer-lock lifecycle does not prove every caller acquires lock. Malformed-record tolerance can yield incomplete history. Exactly-once DB/network effects require separate design.
7. **Tests are source evidence:** inspected compact/resume/fork tests use mocked SSE/model responses and contain early return when sandbox network-disabled environment flag is present. They were not executed; their existence supplies useful scenarios, not green-result evidence or real-model retention proof.
8. **Target integration:** this assignment did not inspect Atlas APIs, Orchestra plugin hooks, native artifact storage, or host sandbox implementation. Architecture maps user-specified ownership; method signatures, capability gaps, and qualitative costs need target-side design validation.

## License and reuse provenance

- Source origin: `https://github.com/openai/codex`, pinned [commit][revision]. Relevant Rust modules and bundled review skill cited individually above.
- Root [`LICENSE`][license]: **Apache-2.0**, copyright 2025 OpenAI. Root [`NOTICE`][notice] also identifies Ratatui-derived code under MIT and its attribution. If copying/adapting code, retain applicable copyright/attribution and NOTICE material, provide license, and mark modified files as required by Apache-2.0.
- Prefer host-native behavioral reimplementation; Rust runtime transplantation would add unsuitable integration weight and violate single-runtime intent if deployed as Codex agent subprocess.
- File-specific vendored assets, bundled skill licenses, and transitive dependencies need review if later selected for copying. Root license is not evidence that every linked external skill repository or hosted documentation page shares same license. This report did not import third-party implementation code or audit complete dependency licensing.

## What did this research framing miss?

**Backend specialization is mostly about semantics and evidence beyond coding-agent UX.** Codex yields reusable control mechanisms, not demonstrated polyglot backend superiority.

- **Cross-service correctness:** versioned API/event/schema compatibility, auth boundaries, retries/idempotency, concurrent updates, migrations/backfills, rollback, and distributed failure need task-specific acceptance cases. Language routing alone misses these.
- **Executable environments:** toolchain/runtime versions, real database/broker fixtures, network/proxy behavior, secrets, ports, and service cleanup determine whether “verified” means anything. Git worktree separation does not supply these.
- **Atlas lifecycle:** memory write admission, provenance, branch/version freshness, member/project visibility, invalidation after reverted PR, and contradictory rules need explicit policy. Competitor memory should not displace shared foundation.
- **Host affordances:** validate which hooks expose admission, permissions, tool completion, context epochs, and explicit resume before promising plugin behavior. Plugin cannot enforce OS boundaries through prompt text.
- **Evaluation design:** compare mechanisms using same task, model, fixture, tools, budget, and failure injections; assess evidence quality and defect escape, not prettier plans. No benchmark or superiority conclusion established here.
- **Operating modes:** standalone and Maestro-native paths must share identities and contracts while preserving independent availability. Public naming needs configuration semantics and migration tests; persona branding is insufficient architecture.

## Primary source index

[revision]: https://github.com/openai/codex/commit/b172810921f89847cd310ecc496f9c901760e933
[app-server]: https://learn.chatgpt.com/docs/app-server
[prompting]: https://learn.chatgpt.com/docs/prompting
[agents]: https://learn.chatgpt.com/docs/agent-configuration/subagents
[agents-md]: https://developers.openai.com/codex/agent-configuration/agents-md
[skills]: https://developers.openai.com/codex/build-skills
[exec-docs]: https://learn.chatgpt.com/docs/non-interactive-mode
[sandbox]: https://learn.chatgpt.com/docs/sandboxing
[worktrees]: https://developers.openai.com/codex/environments/git-worktrees
[open-source]: https://learn.chatgpt.com/docs/open-source
[turn]: https://github.com/openai/codex/blob/b172810921f89847cd310ecc496f9c901760e933/codex-rs/app-server-protocol/src/protocol/v2/turn.rs
[roles]: https://github.com/openai/codex/blob/b172810921f89847cd310ecc496f9c901760e933/codex-rs/agent-roles/src/agent_role_config.rs
[instructions]: https://github.com/openai/codex/blob/b172810921f89847cd310ecc496f9c901760e933/codex-rs/core/src/agents_md.rs
[instruction-manager]: https://github.com/openai/codex/blob/b172810921f89847cd310ecc496f9c901760e933/codex-rs/core/src/agents_md_manager.rs
[skill-render]: https://github.com/openai/codex/blob/b172810921f89847cd310ecc496f9c901760e933/codex-rs/ext/skills/src/render.rs
[skill-selection]: https://github.com/openai/codex/blob/b172810921f89847cd310ecc496f9c901760e933/codex-rs/skills/src/selection.rs
[skill-host-prompt]: https://github.com/openai/codex/blob/b172810921f89847cd310ecc496f9c901760e933/codex-rs/ext/skills/src/host_prompt.rs
[exec-events]: https://github.com/openai/codex/blob/b172810921f89847cd310ecc496f9c901760e933/codex-rs/exec/src/exec_events.rs
[plan]: https://github.com/openai/codex/blob/b172810921f89847cd310ecc496f9c901760e933/codex-rs/core/src/tools/handlers/plan.rs
[plan-spec]: https://github.com/openai/codex/blob/b172810921f89847cd310ecc496f9c901760e933/codex-rs/core/src/tools/handlers/plan_spec.rs
[apply-patch]: https://github.com/openai/codex/blob/b172810921f89847cd310ecc496f9c901760e933/codex-rs/core/src/tools/handlers/apply_patch.rs
[review-skill]: https://github.com/openai/codex/blob/b172810921f89847cd310ecc496f9c901760e933/codex-rs/skills/src/assets/samples/review-agent/SKILL.md
[orchestrator]: https://github.com/openai/codex/blob/b172810921f89847cd310ecc496f9c901760e933/codex-rs/core/src/tools/orchestrator.rs
[sandbox-manager]: https://github.com/openai/codex/blob/b172810921f89847cd310ecc496f9c901760e933/codex-rs/sandboxing/src/manager.rs
[worktree-lib]: https://github.com/openai/codex/blob/b172810921f89847cd310ecc496f9c901760e933/codex-rs/worktree/src/lib.rs
[worktree-metadata]: https://github.com/openai/codex/blob/b172810921f89847cd310ecc496f9c901760e933/codex-rs/worktree/src/metadata.rs
[worktree-git]: https://github.com/openai/codex/blob/b172810921f89847cd310ecc496f9c901760e933/codex-rs/worktree/src/git.rs
[history]: https://github.com/openai/codex/blob/b172810921f89847cd310ecc496f9c901760e933/codex-rs/history/src/lib.rs
[resume-metadata]: https://github.com/openai/codex/blob/b172810921f89847cd310ecc496f9c901760e933/codex-rs/history/src/compaction_resume_metadata.rs
[checkpoint]: https://github.com/openai/codex/blob/b172810921f89847cd310ecc496f9c901760e933/codex-rs/history/src/compaction_checkpoint.rs
[recorder]: https://github.com/openai/codex/blob/b172810921f89847cd310ecc496f9c901760e933/codex-rs/rollout/src/recorder.rs
[resume-settings]: https://github.com/openai/codex/blob/b172810921f89847cd310ecc496f9c901760e933/codex-rs/app-server/src/request_processors/persisted_resume_settings.rs
[compact-history]: https://github.com/openai/codex/blob/b172810921f89847cd310ecc496f9c901760e933/codex-rs/core/src/compact_remote_history.rs
[resume-tests]: https://github.com/openai/codex/blob/b172810921f89847cd310ecc496f9c901760e933/codex-rs/core/tests/suite/compact_resume_fork.rs
[license]: https://github.com/openai/codex/blob/b172810921f89847cd310ecc496f9c901760e933/LICENSE
[notice]: https://github.com/openai/codex/blob/b172810921f89847cd310ecc496f9c901760e933/NOTICE
