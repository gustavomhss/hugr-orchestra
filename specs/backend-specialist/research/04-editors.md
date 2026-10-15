# R04 — Backend-agent workflows from editor documentation

Research date: **2026-10-03**. Target: independent **Orchestra plugin**, **Atlas mandatory architectural foundation**, **Maestro-native delegation optional**. Product names below identify sources, not proposed branding.

## Decision

Build inspectable workflow primitives: scoped instructions, lazy skills, cited/versioned Atlas Memory, test/review receipts, explainable permissions, explicit handoffs, bounded context selection. Keep execution inside existing host. Atlas owns Knowledge and per-member task/PR/project Memory. Atlas outage permits explicit degraded ordinary work; never substitutes another knowledge store or agent runtime.

Strongest lesson: **discovered ≠ included ≠ followed; retrieved ≠ current; command started ≠ check passed; approval ≠ isolation; handoff requested ≠ ownership transferred.** Expose these distinctions in UX and records.

### Ranked shortlist

Costs below: planning estimates for one experienced plugin engineer, assuming usable host/Atlas contracts. **S: 2–4 engineer-days; M: 5–10; L: 10–20.** Include targeted integration checks; exclude building missing Atlas capabilities, new runners, production rollout, legal review. Not measurements or commitments; shared work means estimates should not be summed mechanically.

| Rank | Idea | Decision | Cost / ongoing cost | Failure and evaluation case |
| --- | --- | --- | --- | --- |
| 1 | Scoped instructions + progressive skills + activation trace | **Adopt primitives; adapt formats** | M; metadata tokens, parsing, skill maintenance | Backend rule leaks into frontend task, or required rule silently omitted. Fixture must show exact included sources, exclusions, conflicts, and applied behavior. |
| 2 | Citation-validated, versioned per-member Atlas Memory | **Adapt** | L; Atlas reads/writes and citation revalidation | Fact from abandoned PR survives on another branch. Changed citation must mark fact stale; unchanged control remains usable. |
| 3 | Run/test receipts feeding bounded review/fix workflow | **Adapt** | M–L; actual test execution and review-model usage | Test command returns successfully but discovers no tests. Receipt must report unverified/empty selection, never passed. |
| 4 | Explainable, narrow terminal/tool approvals | **Adopt UX; adapt enforcement** | M using host controls; high cost if host lacks needed controls | Allowed command prefix contains unsafe second command. Compound call must require host approval or be denied; simple allowed control still works. |
| 5 | Explicit task handoff with optional Maestro execution | **Adapt; reject second scheduler** | M–L; delegated runs plus status transport | Delegation request times out after acceptance. Reconcile existing execution identity before retry; unavailable Maestro leaves usable local task. |
| 6 | Pinned, budgeted context manifest over Atlas + live files | **Adapt UX; reject replacement RAG** | M; retrieval latency and selected-context tokens | Retrieved symbol exists only on old revision; current unsaved buffer differs. Manifest must distinguish revisions and prefer current verified source for edits. |

Ranking expresses operational value and bounded implementation risk. Atlas adapter is architectural prerequisite from first slice, despite Memory feature appearing second.

## 1. Method and evidence limits

Primary vendor pages fetched directly; public Microsoft source inspected through read-only GitHub API. Documentation assertions separated from source-visible behavior. No application installed or exercised, no downloaded code executed, no subagents launched, no configuration changed, no commits/pushes, no local source checkout. Authenticated product UIs, server internals, performance, retrieval quality, and Atlas/Maestro/Orchestra contracts remain untested.

Evidence labels:

- **D — documented:** official page describes behavior. Strong evidence of published contract/claim, not proof deployed product behaves that way.
- **S — source-backed:** inspected implementation at pinned revision supports narrow claim. Not runtime verification, not proof every harness calls that path.
- **O — directly observed:** HTTP redirect or returned document/source content observed during this research. Not application behavior.
- **P — proposal:** independent plugin design; not existing vendor or Atlas capability claim.

Only recommend mechanisms supported by fetched bodies. Search snippets, marketing comparisons, and linked-but-unread pages do not establish behavior. Fetch failures remained transport failures, never evidence feature missing. VS Code `.md` website requests timed out; official `microsoft/vscode-docs` source supplied affected articles.

### Version drift materially changes findings

- **O:** `https://docs.windsurf.com/windsurf/cascade/memories` returned HTTP **308** with `Location: https://docs.devin.ai/desktop/cascade/memories`. Original Windsurf workflow/skill URLs also yielded successor-branded documentation. Current pages explicitly distinguish legacy Cascade from default Devin Local. Report preserves that distinction; does not reconstruct earlier Windsurf releases.
- **O:** `https://cursor.com/docs/context/codebase-indexing` returned HTTP **308** to `/docs/agent/tools/search`. Returned page now describes local exact search and says search does not store codebase embeddings. Historical descriptions of Cursor embedding/index architecture cannot be carried forward from old URL alone.
- VS Code instruction documentation now distinguishes **Local harness** from **Agent Host** harnesses. Nested `AGENTS.md` for Local remains experimental and disabled by default in fetched article. Universal compatibility cannot be inferred from shared Markdown extension.
- GitHub fetched review docs say instructions/skills come from **PR head**, whereas Cursor Bugbot's fetched configuration docs say `bugbot.yaml` comes from **PR base**. Different control surfaces; do not generalize either branch rule to every customization.
- GitHub Memory page marks feature public preview. VS Code local memory, hosted Copilot Memory, and legacy Cascade memories are different systems with different scope/storage semantics.

## 2. Primary-source evidence register

All entries inspected on research date. Section names locate evidence when URLs later change. Short quotations preserve decisive boundaries; surrounding conclusions are paraphrases.

### Cursor

**C1 — Rules [D]**  
URL: https://cursor.com/docs/context/rules

- Project `.cursor/rules/*.mdc`: `alwaysApply`, `globs`, `description`; activation can be always, matched-file, model-selected, or manual. Rule text enters model context. Plain `.md` inside that directory is documented as ignored.
- Nested `AGENTS.md` combined with parent guidance, more specific guidance taking precedence. Team/Project/User ordering separately documented; do not collapse these mechanisms into one universal ordering.
- Operational reuse: narrow instruction scope, version-controlled text, explanation of activation. Boundary: prompt guidance does not mechanically enforce architecture or tool permissions. Page itself warns guidance should not be sole security control.

**C2 — Agent Skills [D]**  
URL: https://cursor.com/docs/context/skills

- `SKILL.md` packages instructions plus optional scripts/references/assets; discovery presents available skills, body/resources load when needed. `disable-model-invocation: true` requires explicit invocation. `paths` and nested project skill directories can narrow visibility.
- Documentation distinguishes single-message slash invocation from session-persistent custom mode. Local personal skills are not automatically present in every remote/cloud environment.
- Reuse: lazy resource loading, explicit activation, skill-origin visibility. Boundary: portability covers supported format subset; presence on local disk does not prove remote availability. Script packaging grants no execution permission.

**C3 — Search [D, redirect O]**  
Requested: https://cursor.com/docs/context/codebase-indexing  
Current target: https://cursor.com/docs/agent/tools/search

- Describes exact symbol/error/regex search, local search index, and optional exploration in separate context. Says it does not upload paths/code to build search index or store codebase search embeddings; opened matches may still enter model requests.
- Reuse: exact lookup before broad retrieval, return focused evidence instead of bulk files. Product performance comparison against `ripgrep` remains unverified and excluded from recommendation.
- Boundary: implement through existing host search and Atlas; do not reproduce proprietary search engine or spawn another exploration runtime.

**C4 — Run Modes [D]**  
URL: https://cursor.com/docs/agent/security/run-modes

- Documents allowlist, classifier-assisted auto-review, sandbox execution, and unrestricted mode. Explicit: **“Auto-review is not a security boundary.”** Classifier can inspect local read-only context, and approved calls can execute outside sandbox.
- Local versus cloud difference explicit: **“Cloud Agents do not use Run Modes.”** Local approval semantics cannot be assumed for remote delegation.
- Reuse: show execution location, policy reason, sandbox state, and scope. Boundary: never label model risk judgment as deterministic enforcement; preserve host OS/tool controls.

**C5 — Bugbot [D]**  
URL: https://cursor.com/docs/bugbot

- Reviews PR diffs, uses prior PR comments, supports incremental review and verbose list of loaded/truncated/omitted review rules. `.cursor/BUGBOT.md` scopes review guidance; ordinary `.cursor/rules/*.mdc` does not apply to these runs.
- `bugbot.yaml` read from PR base; its autofix setting cannot raise permission above dashboard setting. Review findings normally yield `neutral`, not failure; cancellation/internal error can also yield `neutral`. Requiring check alone therefore does not imply findings block merge.
- Reuse: revision-aware findings, duplicate suppression, rule manifest, separate analysis/publication/fix actions. Boundary: this is hosted-product documentation, not audited detector implementation or evidence of accuracy. Do not copy branded commands, review prompts, cloud autofix runner, or status semantics that conflate findings with errors.

**C6 — Ignore file [D]**  
URL: https://cursor.com/docs/context/ignore-files

- Describes `.cursorignore` restrictions for agent-visible code and mentions, but explicitly says terminal and MCP tools cannot be blocked by that mechanism.
- Reuse: distinguish discovery exclusions from actual access restrictions. Boundary: exclusion checkbox must not claim secret isolation across every tool.

### GitHub Copilot and VS Code

**G1 — Repository custom instructions [D]**  
URL: https://docs.github.com/en/copilot/how-tos/configure-custom-instructions/add-repository-instructions

- Repository `.github/copilot-instructions.md`, path-specific `.github/instructions/**/*.instructions.md` with `applyTo`, and `AGENTS.md` support. `excludeAgent` can separate code review from cloud agent. Applicability varies by product surface.
- Chat references expose used instruction files. Fetched page states review loads repository instructions, agent instructions, and skills from **head branch**, not base.
- Reuse: scoped build/test/architecture guidance and visible references. Boundary: scope/precedence from GitHub web surface must not be asserted for every IDE harness; generation workflow is not evidence generated commands work.

**G2 — Copilot Memory [D, public preview]**  
URL: https://docs.github.com/en/copilot/concepts/agents/copilot-memory

- Distinguishes repository facts from user preferences. Repository facts carry code citations; relevant facts checked against current branch before use: **“Only validated facts are used.”** Repository facts scoped to repository; user preferences scoped to initiating user and, for managed plans, billing entity.
- Repository facts may originate in closed-unmerged PRs. Current citation validation is documented protection. Unused fact/preference deleted after 28 days; timer may reset on successful validation/use.
- Reuse: evidence-linked memory with revalidation, scope, inspection, deletion. Boundary: published behavior does not prove validator accuracy, transactional versioning, or fit for Atlas per-member task/PR/project Memory. Do not transplant repository-wide sharing or fixed retention period blindly.

**G3 — Copilot cloud agent [D]**  
URL: https://docs.github.com/en/copilot/concepts/agents/coding-agent/about-coding-agent

- Research/plan/branch work can precede PR creation on supported entry points; chat context can carry into cloud session. Ephemeral GitHub Actions environment supports code edits, tests, linters, and logs. Other entry points have different workflows.
- Published limits include one target repository and one branch per run. This constrains conclusions about cross-project orchestration.
- Reuse: task brief, visible artifacts/status, feedback iteration, separate plan from execution. Boundary: existing Orchestra session or optional Maestro owns execution; no GitHub Actions clone or background service added to plugin.

**G4 — Copilot code review [D]**  
URL: https://docs.github.com/en/copilot/concepts/code-review/code-review

- Review can gather wider repository context and hand suggestions to cloud agent. Agentic features can degrade when runner support fails while narrower review remains available.
- Page distinguishes once-only review from review-on-push. Lists excluded file types, including dependency-management files, logs, and SVGs. Says model can miss problems and produce mistakes. Default assessment does not satisfy required approval; opt-in approvals feature is public preview.
- Reuse: explicit review coverage, revision freshness, visible degraded scope, actionable findings. Boundary: a review result is not proof of exhaustive inspection or merge readiness. No detector-quality or cost benchmark inferred.

**V1 — Custom instructions [D]**  
URL: https://code.visualstudio.com/docs/agent-customization/custom-instructions

- File-pattern, task-relevance, and manual activation; user/workspace/organization scopes. Local versus Agent Host discovery differs. Explicit warning not to depend on universal file-order precedence to resolve conflicts.
- Verification instructions distinguish file discovery from actual behavior: **“This verifies discovery, but not whether the instructions are followed.”** References and debug logs help inspect inclusion and errors.
- Reuse: activation trace and representative-task checks. Boundary: plugin defines/documents its own supported precedence while respecting higher-priority host instructions.

**V2 — Agent Skills [D]**  
URL: https://code.visualstudio.com/docs/agent-customization/agent-skills

- Three stages: name/description discovery, body loading, referenced resources. `user-invocable` differs from `disable-model-invocation`; malformed names can silently fail loading. Locations and optional fields vary by harness.
- Experimental `context: fork` uses subagent context; discovery alone does not guarantee invocation.
- Reuse: expose stages and parsing errors; retain manual route. Boundary: optional vendor fork semantics are not required by common skill format and must not silently create plugin-owned agents.

**V3 — Custom agents and handoffs [D]**  
Page: https://code.visualstudio.com/docs/agent-customization/custom-agents  
Inspected official source: https://github.com/microsoft/vscode-docs/blob/main/docs/agent-customization/custom-agents.md

- `.agent.md` combines role instructions, selected tools, optional model. Handoff fields include target, label, prompt, optional `send` and model. Handoff switches role with conversation context and prefilled prompt; `send` defaults false.
- Tool availability depends on harness. Documentation says unavailable named tools are ignored.
- Reuse: plan → implement → review transitions with inspectable brief and explicit send. Boundary: plugin must detect missing required capabilities, not silently treat ignored tools as success. Role switch does not establish independent review or durable ownership transfer.

**V4 — Approvals and permissions [D]**  
Page: https://code.visualstudio.com/docs/agents/run/approvals  
Inspected official source: https://github.com/microsoft/vscode-docs/blob/main/docs/agents/run/approvals.md

- Separates tool availability, call approval, URL request approval, URL response/context admission, and terminal sandboxing. Approval scopes include single use/session/workspace/future use. Saved approvals can be reviewed/reset.
- Terminal `false` rule means ask, not prohibit. Ordinary compound command auto-approval requires approved subcommands and no matching false rule; full-command rules form separate path.
- Explicit limitations: tree-sitter parsing differs across shells; obfuscated/file-write cases can evade detection. **“Terminal auto-approval is a best-effort convenience, not a security boundary.”** Agent Host versus Local confirmation editing differs.
- Reuse: separate approval from sandbox, explain matched policy, scope and revoke grants. Boundary: do not reimplement shell security as plugin regexes.

**V5 — Tools and terminal feedback [D]**  
Page: https://code.visualstudio.com/docs/agents/run/tools  
Inspected official source: https://github.com/microsoft/vscode-docs/blob/main/docs/agents/run/tools.md

- Tool call/input/output inspection, inline output and full terminal access, background commands, timeout controls. Timeout can stop waiting and return partial output while work continues. Shell integration supplies lifecycle signals; unsupported shells rely more on timeout/idle heuristics.
- Reuse: running/finished/timeout/cancelled distinction, full-output reference, background task status. Boundary: partial output and quiet terminal never imply completed test run.

**V6 — Workspace context [D]**  
Page: https://code.visualstudio.com/docs/agents/reference/workspace-context  
Pinned official source: https://github.com/microsoft/vscode-docs/blob/35e82eeecd596e95917037b296b1c83fb4a6be64/docs/agents/reference/workspace-context.md

- Semantic search, exact grep/text, symbols/usages, file search, direct reads; semantic search needs index. Exact search and language intelligence remain available while index unavailable.
- Search output itself consumes context. Exclusions differ by tool; opened/selected ignored files can bypass `.gitignore` context exclusion. Page cautions against treating search as exhaustive codebase counting.
- Reuse: tool choice by query, explicit source/exclusion/coverage status, useful degraded search. Boundary: semantic retrieval stays Atlas-owned; do not add local/remote semantic index mirroring this product.

**V7 — Local memory [D]**  
Page: https://code.visualstudio.com/docs/agents/run/memory  
Pinned official source: https://github.com/microsoft/vscode-docs/blob/35e82eeecd596e95917037b296b1c83fb4a6be64/docs/agents/run/memory.md

- Local user/repository/session memory. Repository memory is workspace-scoped, not shared project file. Reviewed durable guidance should move into version-controlled docs/instructions; update/remove stale local duplicate afterward.
- Reuse: distinguish emerging notes from accepted shared guidance. Boundary: Atlas replaces neither Git source-of-truth nor host transcript, but owns plugin Knowledge/Memory. Local notes directory must not become competing persistence layer.

### Windsurf documentation, now successor-hosted

**W1 — Memories & Rules [D, redirect O]**  
Original: https://docs.windsurf.com/windsurf/cascade/memories  
Current: https://docs.devin.ai/desktop/cascade/memories

- Legacy Cascade automatic memories: local `~/.codeium/windsurf/memories/`, workspace-associated, not committed/shared across workspaces. Page recommends reviewed Rules/`AGENTS.md` for durable reusable guidance.
- Rules: always-on, glob, model-decision, manual; model-decision includes description until body needed. `.devin/rules` now preferred with legacy `.windsurf/rules` fallback. System rules merge as additional context, unlike Cursor's explicit precedence statement.
- Warning: **“Memories apply to the legacy Cascade agent only.”** Default Devin Local does not persist these memories.
- Reuse: explicit activation and reviewed promotion. Reject local auto-memory store as Atlas substitute.

**W2 — Cascade workflows [D]**  
Original: https://docs.windsurf.com/windsurf/cascade/workflows  
Current: https://docs.devin.ai/desktop/cascade/workflows

- Markdown multi-step runbooks invoked by slash command. **“Workflows are manual-only.”** Examples include addressing PR comments one at a time, tests/fixes, release/deploy. Workflows can call workflows.
- `.devin/workflows` preferred, `.windsurf/workflows` legacy; system/workspace/global/built-in precedence documented. Workflows are Cascade-specific, unsupported by default Devin Local.
- Reuse: explicit repeatable workflow entry point with per-step progress. Boundary: Markdown trajectory is not transaction engine; add bounded recursion/call budget and explicit side-effect permissions through host.

**W3 — Skills [D]**  
Original: https://docs.windsurf.com/windsurf/cascade/skills  
Current: https://docs.devin.ai/desktop/cascade/skills

- `SKILL.md` with name/description, optional references/scripts/templates. Metadata initially visible; body/resources on invocation. Manual `@mention` complements model selection. Cascade and Devin Local use different discovery/format paths.
- Reuse: bundle task-specific reference material without loading every resource each turn. Boundary: syntactic similarity does not prove equal invocation behavior or tool authorization.

**W4 — Terminal [D]**  
URL: https://docs.devin.ai/desktop/terminal

- Selected stack trace can be sent to agent; terminal can be mentioned. Cascade levels: Disabled, Allowlist Only, Auto, Turbo. Denylist overrides allowlist but means require approval, not permanent prohibition.
- Exact allow entries differ from explicit wildcard-prefix entries. Dedicated shell and inherited shell config affect behavior. Page explicitly distinguishes Devin Local allow/ask/deny model.
- Reuse: attach exact failure selection and display reason/scope on command card. Boundary: no broad `git *` or interpreter allowlist defaults; no equivalence between Cascade denylist and hard deny.

**W5 — Context awareness [D]**  
URL: https://docs.devin.ai/desktop/context-awareness/overview

- Vendor describes RAG over local code plus optional remote repositories; context pinning supports focused module/interface/test selection. Warns excessive pinning can slow or harm results.
- Reuse: small explicit pins and visible provenance. “Higher quality”/“fewer hallucinations” and proprietary retrieval descriptions remain vendor claims, not comparative evidence. Reject cloning RAG backend because Atlas owns Knowledge.

**W6 — Cascade overview [D]**  
URL: https://docs.devin.ai/desktop/cascade/cascade

- Problems/terminal selection as context, linter feedback, named code checkpoints, conversation references retrieving selected summaries/parts, queued messages. Warns concurrent edits can race; revert behavior has specific destructive limits.
- Reuse: bring diagnostics directly into bounded fix loop; link conversation evidence instead of full transcript. Boundary: code checkpoint does not roll back DB migration, network call, or Atlas write. Queued-message semantics must remain host-native, not replaced by plugin scheduler.

### Narrow source-backed mechanisms and checked reuse terms

VS Code implementation revision: **`810f80883aaac513572c70e621cc92c884c50263`**, commit API timestamp **2026-10-03T19:26:01Z**. Source inspection only; repository tests not executed.

**S1 — Terminal analysis and explanation [S]**  
https://github.com/microsoft/vscode/blob/810f80883aaac513572c70e621cc92c884c50263/src/vs/workbench/contrib/terminalContrib/chatAgentTools/browser/tools/commandLineAnalyzer/commandLineAutoApproveAnalyzer.ts

- `analyze` parses subcommands and evaluates command/subcommand results. Nonempty command with no parsed subcommands disallows auto-approval on this path. `hasUnanalyzableSyntax` clears auto-approval and suppresses persistent-rule actions.
- `_createAutoApproveInfo` includes actual rule and source labels such as default, user, remote, workspace, session, with settings links. Concrete reusable UX mechanism, not inferred from screenshot.
- Scope caveat visible in same file: session auto-approval returns early before these checks; full-command approval also exists. This file does not prove all terminal routes fail closed or all execution is sandboxed.

**S2 — Parser limitation, including source test [S]**  
Implementation: https://github.com/microsoft/vscode/blob/810f80883aaac513572c70e621cc92c884c50263/src/vs/platform/terminal/common/autoApprove/autoApproveParseSafety.ts  
Test source: https://github.com/microsoft/vscode/blob/810f80883aaac513572c70e621cc92c884c50263/src/vs/platform/terminal/test/common/autoApprove/autoApproveParseSafety.test.ts

- Helper returns `language === 'powershell' && hasError`. Test source expects confirmation for PowerShell parse error, but false for bash parse error.
- Positive counterexample to broad “any parse error blocks approval” claim. Describes this helper only; other bash checks can still reject syntax. Reading test assertions is not running tests.

**S3 — Handoff metadata parser [S]**  
https://github.com/microsoft/vscode/blob/810f80883aaac513572c70e621cc92c884c50263/src/vs/workbench/contrib/chat/common/promptSyntax/promptFileParser.ts#L227-L273

- `handOffs` getter parses sequence/maps, requires agent plus nonblank label plus defined prompt; preserves optional send/model fields. Establishes declarative handoff metadata exists in implementation.
- Does not establish execution scheduling, exactly-once delivery, isolation, or context-transfer completeness. V3 documents UX behavior separately.

**L1 — Checked source license**  
https://github.com/microsoft/vscode/blob/810f80883aaac513572c70e621cc92c884c50263/LICENSE.txt

- MIT text inspected. S1/S2 source headers explicitly identify MIT. Reuse of covered source/substantial portions requires retaining copyright and permission notice; software provided without warranty.
- Recommendation remains independent implementation of small UX/data-contract ideas. MIT finding applies to inspected VS Code source, not every dependency, branded binary, marketplace extension, Copilot service/model, vendor documentation, or third-party skill.
- No license conclusion made for Cursor, Windsurf/Devin, GitHub hosted features, documentation prose, or example skill collections; those licenses not inspected. Names cited for attribution only. No branded UI/prompts/assets copied into proposed plugin.

**F1 — Agent Skills format [D/spec]**  
https://agentskills.io/specification

- Common core: directory containing `SKILL.md`, YAML name/description, optional scripts/references/assets, progressive disclosure. `allowed-tools` marked experimental; compatibility varies.
- `license` metadata is optional and can identify proprietary terms. “Open format” therefore does not mean every skill has reusable content/license. Independently author skills; inspect individual package terms before copying.

## 3. Target architecture and outage contract [P]

### Ownership

```text
Orchestra host
  Existing sessions, tool execution, permissions, terminal lifecycle, transcript
    |
    +-- Plugin: scoped customization, context manifest, receipts, handoff UI
          |
          +-- Atlas: Knowledge + per-member task/PR/project Memory
          |
          +-- Maestro, optional: native delegated execution/status/cancellation
```

Plugin composes host extension points. Does not embed editor products, run another LLM orchestration loop, manage replacement workers, duplicate Session coordination, or establish vector/RAG database. If host exposes only subset of needed controls, feature reports capability gap; advisory metadata cannot masquerade as enforcement.

- **Git/source files:** authoritative code and versioned instructions/skills. These are configuration and source artifacts, not competing learned-memory database.
- **Atlas Knowledge:** shared architecture/domain knowledge, source-linked guidance, retrieval and accepted knowledge records. Link canonical repository guidance rather than maintaining conflicting copies.
- **Atlas Memory:** member-specific task, PR, project observations/decisions/results. Distinguish member attribution from authenticated author principal. Shared publication requires explicit visibility transition; membership alone does not make every member's notes shared.
- **Host:** execution, permission policy, session transcript and current work. Existing transcript is execution evidence, not new plugin-owned Memory store.
- **Maestro:** delegated executor only when selected and available. Plugin follows its native ownership/status semantics, never invents parallel scheduler.

Actual interfaces uninspected. Required capabilities below are integration questions, not claimed Atlas APIs: identity/ACL-scoped queries, source/revision metadata, conditional memory updates, retraction/deletion, request reconciliation, and capability/availability reporting.

### Names configurable by environment

Proposed example environment keys, not existing configuration:

| Key | Purpose |
| --- | --- |
| `AGENT_PLUGIN_LABEL` | Deployment-specific visible plugin name |
| `AGENT_COMMAND_PREFIX` | Deployment-specific workflow command namespace |
| `AGENT_ATLAS_BINDING` | Resolve configured host service binding fulfilling Atlas role |
| `AGENT_MAESTRO_BINDING` | Optional binding for native delegation |

Use stable logical role/capability IDs internally. Environment labels must not change memory ownership, authorize member impersonation, expand permissions, or select arbitrary endpoints through prompt text. Authenticated host/Atlas context supplies tenant/member identity. Missing Atlas binding is explicit degraded status, not permission to choose alternate memory backend. Names in briefs resolve through binding metadata; never hard-code vendor/server labels in skill prose.

### Availability states

| State | Ordinary work | Knowledge/Memory | Delegation |
| --- | --- | --- | --- |
| Atlas ready | Host read/edit/test/review as authorized | Atlas-scoped query and versioned writes | Optional Maestro |
| Atlas reads ready, writes unavailable | Continue local work | Reads show revision; write result visibly unsaved/unconfirmed | Only if task can truthfully tolerate missing durable Atlas update |
| Atlas unavailable or unauthorized | Read supplied/current files, exact host search, edit, run authorized tests, inspect diff, draft review | No Atlas recall or persistence claim; current evidence lives in host session only | Only self-contained work whose requirements do not depend on Atlas; otherwise explain blocked dependency |
| Maestro unavailable | Execute ordinary work in existing host session | Atlas remains primary | Explicit local continuation or stop at requested handoff; no substitute scheduler |
| Both unavailable | Self-contained host work remains usable | Clearly limited to current supplied/local evidence | None |

Outage notice concise and actionable: `Atlas unavailable: current-file/search/test work available; shared Knowledge and saved Memory unavailable.` Show once per state transition, retain status indicator. Knowledge-dependent request gets specific missing prerequisite; ordinary task is not globally blocked.

Do not implement persistent offline shadow DB or retry journal. Unsaved observations stay explicit in current session. Recovery revalidates sources and submits through Atlas with current ACL/revision; no blind replay. A write timeout means **outcome unknown**, not failed: reconcile request identity if supported, otherwise require explicit resolution before retrying durable write. Already retrieved private context must not survive tenant/member switch through plugin cache.

## 4. Ranked implementation recommendations [P]

### 1 — Scoped instructions, skills, and activation trace

**Adopt:** separate standing constraints from procedures. **Adapt:** compatibility adapters, precedence, diagnostics. Sources: C1/C2, G1, V1/V2, W1–W3, F1.

Backend value: API, persistence, migrations, generated-client, package-test rules apply to relevant paths/tasks without loading every team's runbook each turn.

Suggested flow:

1. Reuse host's native `AGENTS.md`/skill discovery first. Add importer only for needed foreign format; do not inject duplicate host instructions.
2. Normalize supported metadata into internal entries: origin, repo/revision, scope, trigger, description, body reference, required capabilities, parse diagnostics. Preserve foreign activation semantics explicitly; unsupported fields reported, not guessed.
3. Keep common `SKILL.md` core portable. Manual-only workflow remains manual; `user-invocable` controls UI, not execution authorization. Vendor `context: fork` remains unsupported unless explicitly mapped to permitted native delegation.
4. Show `discovered → eligible → included → resources read`, with reason, scope, source revision, omissions, conflicts and budget truncation. Inclusion never labeled compliance.
5. Honor host instruction hierarchy. Plugin-resolved structured collisions follow documented priority; arbitrary contradictory prose is surfaced, not pretended solvable by perfect parser. Atlas record appears as cited data unless explicitly accepted as instruction under host policy.

**Cost:** M; foreign-format breadth drives maintenance. Start shared `AGENTS.md` and skill core, then one needed adapter. **Reject:** importing whole marketplaces, silent malformed-file fallback, or letting skill metadata grant tool access.

**Evaluation:** monorepo with root architecture rule, backend-only rule, frontend-only rule, manual migration skill, malformed skill, and conflicting same-name skills. Backend task must show correct eligible/included set; frontend control must differ. Manual migration skill must require explicit invocation. Verify resulting behavior, not merely discovery list. Atlas outage must still permit repository-local rules through existing host.

### 2 — Citation-validated, versioned Atlas Memory

**Adapt:** G2 validation and V7/W1 reviewed-promotion patterns. **Reject:** local auto-memory folder and indiscriminate shared facts. Sources: G2, V7, W1, C5 learned-rule behavior.

Backend value: remember why task chose queue semantics, which PR changed API behavior, known build prerequisites, unresolved incident observations—without treating obsolete branch facts as current architecture.

Proposed logical record, stored by Atlas:

- Stable record ID and revision; authenticated author and attributed member; tenant/project/repository.
- Scope kind `task | pr | project` plus stable scope ID and visibility.
- Statement/decision, evidence references, source commit plus content hash for working-tree evidence, relevant tool receipt IDs.
- Status `candidate | accepted | superseded | retracted`; validation time; superseding revision; retention/deletion metadata as Atlas policy permits.
- Conditional update against expected revision. Concurrent edits conflict visibly; no last-writer-wins memory overwrite hidden by plugin.

Candidate notes may be useful without becoming normative Knowledge. Promotion to accepted project Knowledge requires supporting current evidence and correct visibility. Code facts revalidated against current tree; user preferences rechecked against explicit current instruction. “Same path” alone insufficient—content may have changed.

Retain history through Atlas revision facility, not plugin event journal. Retraction means fact stops entering context; privacy deletion follows Atlas policy rather than retaining sensitive text in supposedly immutable history. If Atlas lacks revision/CAS support, prerequisite must be solved there or feature truthfully reduced; cannot patch around with second DB.

**Cost:** L; contract/ACL/version support dominates. **Evaluation:** member A's task note, member B's PR note, and accepted shared Knowledge have distinct visibility. Seed citation valid on branch A but false on branch B; B retrieval must reject/mark stale while unchanged positive-control citation remains usable. Concurrent updates produce conflict. Atlas timeout yields unavailable/unknown status, never claimed persistence.

### 3 — Test receipts and bounded review/fix feedback

**Adapt:** W2/W4/W6 runbooks/diagnostics, V5 lifecycle, C5/G4 review iteration. Backend value: actual compiler/test/API feedback drives fixes; reviewer sees precisely what ran and what was inspected.

Use explicit workflows such as `verify-change`, `review-change`, `address-feedback`; names deployment-configurable. Each uses existing host tools and permission decisions.

Receipt fields: task/member/repository, source revision + dirty-tree fingerprint, command/arguments, cwd, shell/runtime/platform, start/end, exit status, lifecycle state, selected test target, discovered/executed/skipped tests when available, bounded output excerpt + full host artifact reference, timeout/cancellation, environment caveats with secrets redacted. Unknown fields stay unknown.

Report `passed`, `failed`, `running`, `cancelled`, `timed-out`, `not-run`, or `unverified` based on tool evidence. Empty discovery and skipped-only suite cannot establish behavior. A completed build does not establish test success; successful local tests do not establish CI/platform coverage.

Review packet pins base/head or dirty diff, instruction revisions, current Atlas references, changed paths, exclusions, prior findings and receipts. Finding includes evidence path/lines/revision, failure scenario, severity, proposed action, and resolution state. Deduplicate by issue/evidence identity, not comment wording. New code can invalidate earlier resolution.

Reviewer does not silently modify code. User can transition to bounded fix workflow and rerun affected checks. Existing host/session budgets stop loops; external publication and commits remain separate authorized actions. Trusted/base review policy is distinct from proposed head-branch instruction changes; new PR instructions cannot quietly weaken review authority.

**Cost:** M–L; receipt schema smaller than portable runner integration. **Reject:** status `success` as universal quality signal, automatic merge, unbounded fix-until-green, or reviewer self-report as proof.

**Evaluation:** valid suite first demonstrates executed test; wrong package/filter produces empty selection and cannot pass. Long-running test moved to background stays running. New commit makes old receipt stale. Review fixture changes DB constraint and related call site outside diff; report records inspected dependency or explicit coverage gap. Atlas failure allows session-local review but marks Memory save unavailable.

### 4 — Explainable terminal/tool permission UX

**Adopt UX:** visible action, reason, scope, expiry, revocation. **Adapt enforcement:** host is authority. Sources: C4/C6, V4, W4, S1/S2.

Backend value: distinguish harmless inspection from migration, package script, network call, external-file write, or PR publication without endless repeated vague prompts.

Command/tool card should display:

- Exact proposed command/tool arguments and cwd; actual tool/server identity; human-readable purpose.
- Effective permission outcome `allow | ask | deny`, rule origin, grant scope, and whether sandbox active for this operation.
- For permitted choices: approve once, bounded session grant, inspect/revoke grant. Durable workspace/global grant only through host-supported settings and explicit user intent.
- Separate tool availability from call approval; separate contacting external service from admitting returned text as instructions. Untrusted tool output remains data.
- Explain changed input: approved command cannot silently expand cwd, endpoint, arguments, or referenced script without reevaluation required by host policy.

Use deterministic host checks and existing OS isolation. Model risk assessment can explain or request approval; cannot confer authority. Terminal prefix matching cannot prove package scripts/aliases/substitutions safe. If parser/sandbox capability unsupported, show limitation and follow host's explicit approval path. Avoid a second plugin allowlist that contradicts host.

**Cost:** M if hooks/UI expose decisions; L or blocked if enforceable controls missing. **Reject:** “deny” label when behavior means ask, hidden escalation from sandbox to host, global interpreter wildcard defaults, and `.ignore` as security boundary.

**Evaluation:** simple allowed `git status` control works; `git status && <write-command>`, substituted command, edited package script, remote MCP mutation and stale session grant receive correct host decisions. UI reason names actual rule rather than inferred rationale. Source S2 specifically prevents assuming shell parser failures behave uniformly.

### 5 — Explicit handoffs, optional Maestro

**Adapt:** V3/S3 declarative transition and G3 tracked task context. Backend value: plan, implement, verify, review, resume remain distinct phases without unnecessary delegation.

Default transition changes role/next action in existing host session. Handoff brief includes objective, acceptance criteria, repository/location, base/current revision, allowed edit surface, relevant instruction/skill versions, Atlas Knowledge/Memory refs, unresolved questions, validation commands/results, permission constraints and budget. Receiver re-resolves authorized references; caller's access is not transferable by pasting private content.

Show destination and brief before explicit send. Record request identity and native execution identity separately; visible states include prepared, accepted, running, blocked, cancelled, completed, and outcome-unknown. Parent completion requires returned evidence, not mere acceptance.

When enabled, route only through Maestro's native delegation/status/cancellation contract. Reconcile duplicates using existing identities. Cancellation requests are not proof subprocesses or external side effects stopped. Do not implement fresh task queue, recursive agents, durable session ownership or replacement worker supervisor. Preserve host steer/queue and Session execution semantics.

**Cost:** M–L; identity/cancellation/capability mapping hardest. **Reject:** automatic broad fan-out, infinite nested handoffs, complete-history copying, and claim that role switch provides independent reviewer.

**Evaluation:** timeout immediately after Maestro accepts request. Recovery finds same native execution rather than creating duplicate. Missing required tool produces explicit blocked capability; no silent success. Maestro unavailable still permits local plan/act/review. Atlas unavailable blocks context-dependent delegated task while self-contained ordinary work remains possible.

### 6 — Bounded context manifest, not another index

**Adapt:** C3 exact lookup, V6 multi-tool search, W5 pinning, W6 selective history reference. **Reject:** new RAG/vector DB, remote mirror, proprietary retrieval clone.

Backend value: include API schema, implementation, callers, migration and relevant failure receipt at useful granularity; omit unrelated generated output and stale snapshots.

Selection sequence: explicit user/task references → current buffer/diff and exact symbols → Atlas Knowledge/member Memory with ACL/revision validation → bounded neighboring callers/tests. This is preferred strategy, not forced order for every query. Exact search and current files remain host capabilities during Atlas outage.

Manifest records source kind, canonical reference, revision/hash, line range, selection reason, owner/visibility, freshness, token estimate, and omitted/truncated reason. Pins consume budget; allow unpin/replacement, not permanently sticky context. Unsaved-buffer content is a distinct revision overlay; never attach committed-file citation as if it proves that content.

Distinguish `no matches`, `source unavailable`, `excluded`, `permission denied`, `stale`, and `budget omitted`. Display retrieval scope; do not infer whole-repository absence from top-k semantic results. Exclusions tune search noise but must not bypass actual permission checks.

**Cost:** M; cheap UI only if host already exposes provenance and context assembly. Session-bounded manifest uses existing source references; Atlas handles any durable Memory/Knowledge record.

**Evaluation:** pinned API file changes, unsaved implementation differs, stale Atlas item references removed symbol, and fixture includes excluded path. Correct context uses current evidence and labels stale/excluded entries. Unchanged known symbol is positive control for search availability. Atlas outage still answers supplied-file question and reports shared retrieval unavailable.

## 5. Reuse and implementation boundary matrix

| Source feature | Reusable idea | Boundary |
| --- | --- | --- |
| Markdown rules/skills | Scoped text, progressive loading, explicit invocation | Independently authored text; format adapter only; host hierarchy/permissions prevail |
| Editor discovery/reference UI | Explain origin, eligibility, inclusion, omissions | Own UI/labels; no branding/assets copied; no compliance claim from inclusion |
| Hosted memory | Citation validation, scope, deletion, inspectability | Atlas records only; revisioning is target requirement, not proven vendor capability |
| Semantic workspace context | Query intent, pins, source manifest, degraded exact search | Atlas retrieval only; no independent embeddings/index store |
| PR review | Diff/commit anchoring, finding lifecycle, previous-feedback context | Own workflow; no proprietary prompts/model pipeline, detector benchmark, or merge guarantee |
| Terminal approvals | Rule-origin explanation, narrow scope, revoke/inspect | Host permissions/OS isolation; no bespoke shell-policy engine |
| Handoffs | Explicit destination/brief/send and evidence return | Existing host continuation or Maestro-native delegation; no extra runtime |
| Checkpoints | Link code/diff state to workflow evidence | Never promise rollback of terminal/network/DB/Atlas side effects |
| Public VS Code source | Narrow MIT-covered implementation concepts/source if needed | Preserve checked notices for copied portions; independently verify dependencies before reuse |

## 6. Evaluation plan and rollout order

Proposed evaluations, **not executed results**. Use actual host/Atlas integration when implementation begins; fake tools alone cannot establish execution, permissions, or persistence semantics.

1. **Foundation slice:** Atlas capability/identity/availability adapter plus truthful degraded state; host tools remain usable. Exercise ready, unauthorized, read-only, timeout, and recovery states. Successful known read/write provides positive control before testing failures.
2. **Instruction/context slice:** scoped rules and skill activation trace, current-revision manifest, bounded exact search. Known applicable and inapplicable fixtures check both inclusion and exclusion. Missing sources are named failures, not empty success.
3. **Evidence slice:** run/test receipts and review packets. First run real check that executes known behavior; then wrong filter, intentional failing assertion, background timeout and revision change. Each must change reported status appropriately.
4. **Memory slice:** Atlas ownership/revisions, citation invalidation, concurrent update and deletion/retraction. Verify access with permitted control before cross-member denial case. Confirm deleted/retracted content stops entering future context.
5. **Handoff slice:** local phase transitions first, optional Maestro after native identity/status contract known. Test ambiguous acceptance, cancellation and unavailable capabilities; parent reports evidence completeness.

Track task-level outcomes: first-run validation success, accepted versus rejected review findings, stale-citation rejection, incorrect instruction activation, approval interruptions, duplicate execution, missing-scope reports, context tokens and elapsed time. These are measurement proposals, not observed gains. Compare same tasks/model/environment, include unsuccessful and cancelled runs, and report coverage changes instead of celebrating faster but weaker checks.

## 7. Limitations and what initial framing missed

### Limits of this evidence

- Cursor, legacy Cascade/successor product behavior, and hosted Copilot retrieval/review/Memory remain **vendor-documented claims** here. Public VS Code source confirms only named local mechanisms. Open local client source does not expose hosted model/server pipeline.
- Static source review does not establish released-version behavior, runtime wiring, model adherence, retrieval accuracy, permission strength across shells, or operational reliability. Documentation can change without stable version URL; pinned source anchors only listed code/articles.
- Official pages sometimes differ by surface: custom-instruction precedence, head/base selection, memory scope, approval meanings, remote feature availability. Report preserves differences rather than averaging them into invented contract.
- Atlas/Maestro/plugin APIs, installed host version, tenancy model and permission extension points not inspected. Estimates depend on those contracts. Atlas versioning, ACL enforcement and request reconciliation remain explicit integration prerequisites.
- No measured quality/latency/cost comparison. Vendor productivity, “fewer hallucinations,” speed, detector effectiveness and illustrative pricing excluded from ranking evidence.
- License checked only for pinned VS Code source. No general license claim for product docs, downloadable skills, proprietary services or brands.

### Missing dimensions worth adding

1. **Authority and freshness, not just context amount.** Same fact can be true on abandoned PR and false now. Track provenance, revision, visibility and rule authority separately.
2. **Customization compatibility needs capability negotiation.** Common `SKILL.md` does not standardize discovery scope, optional metadata, remote sync, permissions or delegation. Missing tool must be visible.
3. **Review policy can be changed by reviewed work.** Pin trusted policy authority separately from proposed head changes. Evaluate rule modifications as changes themselves.
4. **Task identity and ambiguous effects matter more than handoff button.** Timeouts, retries, cancellation, concurrent edits and external side effects require existing runtime contracts; code checkpoints cannot undo them.
5. **Knowledge lifecycle includes conflict and deletion.** Version history, candidate promotion, supersession, retraction, member departure and privacy deletion belong in Atlas design. A fixed expiry timer alone does not solve these.
6. **Degraded mode is task-specific.** Ordinary source work can proceed; requests needing unavailable shared architecture must identify missing evidence. Generic “offline mode” hides this distinction.
7. **Evaluation must measure reach.** Empty test selection, skipped platforms, stale reviews, excluded files and incomplete retrieval must remain visible. Attractive green badge can answer narrower question than user asked.
8. **Terminal context includes environment.** Shell, cwd, aliases, mutable package scripts, container/network boundary and background lifecycle affect meaning of command and receipt.

Bottom line: **adopt inspectability, adapt workflow semantics, reject competing persistence/runtime.** Start with Atlas-aware degraded state plus instruction/context trace; add evidence-rich verification; introduce optional delegation only after native ownership contract is clear.
