# R67 — Charlie charter: runtime composition and requirements

Status: source research, 2026-10-05. Read-only; no test, typecheck or install was run. Baseline: worktree `_worktrees/charlie-plugin`, HEAD `99de9a5692` (= `fork/dev` `d11d8652aa` + specs commit). Anchors are `file:line`. **O** = `packages/opencode/src`, **S** = `specs/charlie`.

Scope: what Charlie's system prompt (the charter, today `O/agent/prompt/charlie.txt`) must satisfy, and what surrounds it at runtime. Token figures are estimates (≈4 bytes/token for English prose, ≈3.5 for code-heavy text), not tokenizer measurements.

---

## 1. Prompt composition at runtime (V1 path)

### 1.1 Registration

- The roster imports the charter as raw bytes: `O/maestro/roster.ts:3` (`import PROMPT_CHARLIE from "../agent/prompt/charlie.txt"`), and stores it as `prompt` at `roster.ts:62`.
- `O/agent/agent.ts:291-307` turns every roster member that has `nativeProfile && prompt` into an `Agent.Info`. The fields are `id: memberId` (297), `name: displayName` (298), `description: "${displayName} native team specialist."` (299), `prompt: member.prompt` (300), `permission: Permission.fromConfig(nativeProfiles[...])` (302), `mode: "subagent"` (303) and `native: true` (304).
- Native-seat permission is the profile alone. It is not merged with `defaults` or user permission (302). Config may change only model, variant and temperature (`agent.ts:310-316`). A config `prompt` cannot replace the charter, as `test/agent/native-team.test.ts:79-111` pins.
- The `execution` profile (`roster.ts:11-18`) is `"*": deny` plus allow for read, glob, grep, bash and edit. This denies `skill`, `task`, `question`, `todowrite`, `webfetch`, `external_directory`, MCP tools and every plugin tool, including the HuGR Composer tools. `test/agent/native-team.test.ts:56-65` pins these values: skill, task, webfetch and external_directory are deny.

### 1.2 Same path for delegated and direct

- **Delegated:** `O/tool/task.ts:173` resolves `next = agent.get(subagent_type)`. The child prompt is `ops.prompt({ agent: nextID, parts: [...parts, ...own] })` (`task.ts:547-559`).
- **Direct:** not possible today, because the mode is `subagent` (`agent.ts:303`) and `defaultInfo` rejects subagents. F1.6 makes it `mode: "all"`.
- Both paths reach the same loop: `O/session/prompt.ts:1177` (`agents.get(lastUser.agent)`) → system assembly at `prompt.ts:1251-1265` → `handle.process` → `O/session/llm.ts:107` → `LLMRequestPrep.prepare` (`O/session/llm/request.ts:56`). Nothing in this path branches on direct versus delegated.

### 1.3 System message, in order

`O/session/llm/request.ts:58-66` builds **one** string, joined with `"\n"`:

| # | Part | Source | Charlie today |
| --- | --- | --- | --- |
| 1 | **Agent prompt, which REPLACES the provider prompt** | `request.ts:60`: `...(input.agent.prompt ? [input.agent.prompt] : SystemPrompt.provider(input.model))` | `charlie.txt`, 273 B. None of `anthropic.txt`/`gpt.txt`/`codex.txt` etc. (`O/session/system.ts:27-49`) is sent |
| 2 | Environment block | `system.ts:72-83`: model name/ID, `<env>` working dir, worktree root, git yes/no, platform, date | ≈350 B |
| 2b | `<available_references>` | `system.ts:84-101`, only when config references have descriptions | usually absent |
| 3 | Instruction files, each prefixed `Instructions from: <path>` | `O/session/instruction.ts:155-169`. Order: (a) the first existing global file, `~/.config/opencode/AGENTS.md` or else `~/.claude/CLAUDE.md` (`instruction.ts:60-63, 114-119`); (b) the project files `AGENTS.md`, then `CLAUDE.md`, then `CONTEXT.md` (64-68). For the first filename found, `findUp` collects **every** ancestor match from cwd up to the worktree (`packages/core/src/fs-util.ts:154-166`), so nested AGENTS.md files stack despite the comment at `instruction.ts:122`. (c) `config.instructions` files, then (d) URLs | Root `AGENTS.md` (9.1 KB). Add `packages/opencode/AGENTS.md` (6.5 KB) if cwd is inside that package. No global file on this host |
| 4 | `<mcp_instructions>` | `system.ts:119-135`. A server is included only if it has zero tools or some tool is not permission-disabled | Effectively none: `"*": deny` disables every MCP tool |
| 5 | Skills list (`<available_skills>`) | `system.ts:105-117`. Omitted when `skill` is disabled (106). When present, it is filtered per skill name by permission (`O/skill/index.ts:356-361`) | **Omitted**, because skill is denied |
| 6 | Structured-output instruction | `prompt.ts:89, 1265`, only for `format: json_schema` | Absent in Task |
| 7 | `user.system` (per-message system field) | `request.ts:62` | Task never sets it |
| — | Plugin `experimental.chat.system.transform` | `request.ts:68-78`. Input is `{sessionID, model}` with no agent. If plugins push more than one extra element, everything after the header collapses into a second system message | No internal plugin registers it (`O/plugin/` has no hit) |

The prepared `system` array becomes leading `role: "system"` messages (`request.ts:101-112`). For OpenAI OAuth it goes into `options.instructions` instead (`request.ts:99`).

### 1.4 Messages after the system

- **Child user message.** It is built from `ops.resolvePromptParts(params.prompt)` (`task.ts:515`; `O/session/prompt.ts:164-171`): Maestro's free-text prompt plus resolved `@file` parts. The "Maestro packet" is just this text. Its intended shape is the `maestro-pack` dispatch output schema (`.opencode/skills/maestro-pack/SKILL.md:82-88`: targets, writes/reads, acceptance, latitude, hardRules, `checks[{command,cwd,expectedOutcome}]`, `returnShape{status, baseline, changedPaths, evidencePointers, blockers, newDecisions}`), together with the worker Step 0 baseline commands (`SKILL.md:58-66`).
- **Governed only.** When `authorizationID` resolves to a GROUNDED context record, each verified `own_*` skill is appended as a **synthetic** user part `<skill_content name="…">…</skill_content>` (`task.ts:516-529`). Charlie receives these without holding the `skill` permission.
- **Reminders.** `SessionReminders.apply` (`prompt.ts:1187`) only injects plan/build reminders (`O/session/reminders.ts:24-48`). Nothing applies to Charlie.
- **Max-steps.** `MAX_STEPS_PROMPT` is appended only at `agent.steps` (`prompt.ts:1185-1186, 1275`). Charlie has no `steps`, so this never happens.
- **Nested instructions on read.** `read` attaches nested `AGENTS.md` files as a reminder when Charlie reads into a subdirectory (`O/tool/read.ts:313, 345`; `instruction.ts:184-214`).
- **Atlas header: none.** V1 request preparation has no Atlas admission (no `Atlas` or `atlas` reference in `O/session/*.ts` or `O/session/llm/*.ts`). The header and the resume fold are required-new at a host-internal admission point keyed on the executing member (F2.8, `S/contracts/f1-f2-host.md:154-158`; F3 cl.9, `S/contracts/f3-atlas.md:29`).

### 1.5 Tools exposed

`resolveTools` (`request.ts:208-214`) and the registry filter (`O/tool/registry.ts:436-473`) leave these tools: `read`, `glob`, `grep`, `bash`, and `edit` + `write`, or `apply_patch` instead for `gpt-*` non-oss models (`registry.ts:468-471`). The `edit` permission covers all three (`O/permission/index.ts:204-213`). The native-seat pre-deny re-checks every `ask` against the profile (`O/session/tools.ts:68-70, 96-106`). The Task dispatcher also refuses delegation from a native seat (`task.ts:151-159`).

### 1.6 What comes back to the caller

Task returns **only the last text part** of the child's final message (`task.ts:581`; background path `task.ts:486`), wrapped as `<task id=… state=…><task_result>…</task_result></task>` (`task.ts:109-124`). A failed final tool part fails the whole Task (`task.ts:568-571`). An armed governed dispatch that does not finish fails as `Tool safety HOLD: completion-worker-not-finished` (`task.ts:572-575`). The charter's final-message instruction is therefore the only carrier of Charlie's worker claims (F4 cl.5, `S/contracts/f4-work-result.md:44`).

### 1.7 Fixed-part token budget (Charlie, Claude model, repo-root cwd)

| Part | Bytes | ≈ Tokens | Note |
| --- | --- | --- | --- |
| Charter `charlie.txt` | 273 | ~65 | 33 words |
| Provider prompt | 0 | 0 | Replaced. For reference: `anthropic.txt` 8,212 B ≈ 2.0k; `gpt.txt` 9,284 B; `codex.txt` 7,390 B |
| Environment | ~350 | ~90 | Date changes daily, which invalidates the prompt-cache suffix from that point |
| Root `AGENTS.md` | 9,103 | ~2.3k | +6,453 B ≈ 1.6k when cwd is under `packages/opencode` |
| Global instructions | 0 | 0 | Not present on this host |
| MCP / skills / structured output | 0 | 0 | Skills would cost ≈400–600 after H1 (six entries with descriptions and locations) |
| Tool definitions | ~9,000 | ~2.3k | read 551, glob 517, grep 657, edit 1,369, write 623 (`O/tool/*.txt`); bash rendered from `tool/shell/shell.txt` (1,269) + `shell/prompt.ts` sections (≈2–3 KB); plus JSON schemas |
| **Fixed total today** | | **≈4.8k** | Charter ≈1.3 % |
| Variable: Task packet | — | 0.5–3k | Maestro-authored |
| Variable: governed `own_*` skill content | — | unbounded by host | Synthetic parts |
| Future: Atlas header | — | ≈0.5–1.5k (estimate) | ≤12 rules (`RULES_SLAB_SLOTS`) + 5 Awareness facets + Orientation. Bounded in whitespace words, with no provider-token claim (F3 cl.6, 8) |

Consequence: a charter of ≈400–700 tokens stays under ≈15 % of the fixed prefix. Because it is position 1 and static, it is the most cache-stable bytes in the request. The real constraint on its size is the spec's "concise charter, detail in skills" rule (S/README.md:113, 254-255), not the budget.

**Key finding:** since the agent prompt *replaces* the provider prompt (`request.ts:60`), Charlie runs today with no provider-level guidance on tool use, tone, conciseness or file references. Only the 33-word charter, the env block and AGENTS.md are present. Maestro carries 4,532 B of its own. Whatever minimal behavioral discipline Charlie needs must be in the charter or a skill, or the host must change composition. That would be an H1/H2 decision; the charter cannot make it.

---

## 2. How the other native seats are written

All seven specialist prompts (`billy`, `bobby`, `charlie`, `frankie`, `jimmy`, `lucy`, `patty`, `rosie`; 221–344 B, 26–45 words) share one three-paragraph template:

```text
You are <Name>, <role noun phrase>. <One or two imperative sentences of scope.>

Return card: <roster.returnCard verbatim>

Forbidden: <comma list>.
```

- **Execution seats** (charlie, patty, rosie) open with "Inspect assigned code/docs, make smallest correct … change, and run focused checks." Their Forbidden list is `approval requests, self-review, merge, delegation, changing scope.` (`charlie.txt:5`, `patty.txt:5`, `rosie.txt:5`).
- **Review seats** (billy, bobby, frankie, jimmy, lucy) begin their Forbidden list with `edits, …`. Lucy adds the cold-review rules "Reject author transcript; inspect source and tests directly" and "accepting author transcript" (`lucy.txt:1,5`).
- **Shared vocabulary.** The words are "Return card", "Forbidden", "assigned", "smallest correct", "focused checks", "evidence" and "verdict". Lucy's card is `cited APPROVE/FIX_FIRST/REJECT card`. There is no "gates" term elsewhere: Charlie's card "implementation card, gates, diff receipt" is the only one with "gates".
- **Maestro** (`maestro.txt`, 67 lines) is the only long prompt. It tells the orchestrator to "give target, constraints, expected evidence, and compact return shape" (`maestro.txt:47-48`) and to "Keep judgment, integration, and final claims in this session" (48). It reads worker returns compactly (`maestro-pack/SKILL.md:47-49`).
- **Generic Task guidance** given to the orchestrator says "The agent's outputs should generally be trusted" (`O/tool/task.txt:20`). This conflicts with F4 cl.3. It is outside the charter but relevant to how the card is consumed.
- **Roster metadata is a second, divergent source.** `roster.ts:58-60` gives Charlie `returnCard: "implementation card, gates, diff receipt"` and `forbiddenActions: ["approve", "review own work", "merge"]`. The charter's Forbidden list (`approval requests, self-review, merge, delegation, changing scope`) differs. Only `returnCard` is checked for consistency.

### Consistency constraints the charter must respect

1. **C-pin-1.** The charter starts with `You are Charlie, backend execution specialist.` (`test/agent/native-team.test.ts:25, 53`, `toStartWith`).
2. **C-pin-2.** It contains `Return card:` and `Forbidden:` (`native-team.test.ts:54-55`).
3. **C-pin-3.** It contains the literal `Return card: ${roster.returnCard}` (`native-team.test.ts:70-77`). `roster.returnCard` itself is pinned to `"implementation card, gates, diff receipt"` (`test/maestro/roster.test.ts:24-31`). Changing the card name therefore changes three places: `charlie.txt`, `roster.ts:59` and `roster.test.ts:29`.
4. **C-conv.** It keeps the seat template (identity line → scope → Return card → Forbidden) so that Maestro reads every seat the same way. Additional sections can follow, but the three anchors stay.
5. **C-name.** It names other members only by role (cold reviewer, orchestrator/caller), never by a literal label other than Maestro. Labels are configurable (S/README.md:203; F1.13).

---

## 3. Hash and identity constraints

- **`rosterHash: hash(roster)`** (`O/maestro/validation-record.ts:159`). `hash` is SHA-256 over a key-sorted JSON (`validation-record.ts:89-110`) of the **entire frozen roster**: `displayName`, `role`, `abilityClass`, `returnCard`, `forbiddenActions`, `nativeProfile` and the **full prompt bytes** (`roster.ts:28-37`). Any byte change to `charlie.txt` changes `rosterHash` for every *new* validation record, for every seat, including governed work routed to Lucy or Patty.
- **`grantHash: hash(grant.grant)`** (`validation-record.ts:160`) covers the route-grant projection `{memberId, role, abilityClass, returnCard, forbiddenActions}` (`O/maestro/route-grant.ts:3, 14-21`). It excludes the prompt and `displayName`. Renaming the return card or changing `forbiddenActions` changes `grantHash`. Editing charter prose alone does not.
- **`reviewPolicyHash`** covers Lucy's member, including her prompt, and her profile (`validation-record.ts:112-113, 161`). It is unaffected by `charlie.txt`.
- **No live re-verification.** `rosterHash` is snapshotted into the validation record and copied into the authorization (`O/maestro/authorization.ts:122`). Nothing recomputes `hash(roster)` at dispatch (the only call site is `validation-record.ts:159`). So a charter edit does not break in-flight authorizations. It does make historical records non-reproducible from current source, and no versioned verifier exists.
- **No golden pins.** Tests use synthetic hashes (`test/maestro/evidence-tools.test.ts:173-175`). No test pins a concrete roster hash value.
- **Interpolating a display name.**
  - If the label is interpolated **into `roster.prompt`** (or `displayName` changes), `rosterHash` varies with configuration. That breaks F1.4: hashes must bind behavior, not cosmetic labels (`S/contracts/f1-f2-host.md:26`; S/README.md:205).
  - If it is interpolated **only at `agent.ts` registration** while the roster keeps a placeholder template, the roster hash stays stable but still contains `displayName`. F1.4 requires the projected hash that excludes `displayName` and label-interpolated bytes, plus versioned verification, **before** any non-default label is allowed. Until then a non-default label must be rejected as unsupported configuration (F1.4 last sentence).
- **Practical rule for the charter:** keep it a static template with a single label placeholder, rendered by the host (F1.2: "charter interpolation"). The default rendering must reproduce C-pin-1. The F1.8 Charlie-only profile also changes `rosterHash` (`nativeProfile` changes), which is another reason F1.4 is a prerequisite.

---

## 4. Requirements checklist

Placement legend: **C** = charter (always loaded, minimal); **S** = skill or reference (on demand, mostly `backend-implement` and `references/continuity.md`, `modes/*`); **R** = runtime, host or tool (must not be left to prose). "C (1 line)" means the charter only states the rule or points to the skill.

### A. Identity and form

| # | Requirement | Source | Place |
| --- | --- | --- | --- |
| 1 | Identity line `You are {{label}}, backend execution specialist.`, with the default rendering exactly as today | native-team.test.ts:25,53; F1.2 (f1-f2:18); README:201 | C + R (host renders label) |
| 2 | Keep `Return card: <roster.returnCard>` and `Forbidden:` anchors | native-team.test.ts:54-55,74 | C |
| 3 | Charter bytes static apart from the label placeholder, and hashed as a template | F1.4 (f1-f2:26); README:205 | R (H5 projection) + C (form) |
| 4 | Never identify self or others by label for routing or authority; refer to roles, not member names | F1.13 (f1-f2:63); README:92,203 | C (by construction) |
| 5 | Concise charter: role, judgment boundary, tool discipline, result expectations. No stack content, no version details, no claims of excellence | README:57,113,254-255,295; capabilities:100 | C (design constraint) |

### B. Role boundary

| # | Requirement | Source | Place |
| --- | --- | --- | --- |
| 6 | Implement only an already-defined backend scope. No investigation, diagnosis, discovery, scope definition, architecture/public-API/migration-strategy/product choice, and no root-cause hypotheses | README:21-25,39,95-96,166-168; capabilities:9-11,73 | C |
| 7 | Local coding choices inside the supplied interfaces are Charlie's (helpers, SQL, DTO mapping, fixtures, fixing own compiler/test failures) | README:168; skill-catalog:71 | C (1 line); S detail |
| 8 | Reading named targets and supplied patterns is preparation, not license to explore. No repository-wide search for callers or substitute scope | README:168,256; capabilities:186,191 | C |
| 9 | Missing, contradictory or out-of-scope input → precise blocker to the caller or owner; independent assigned work may continue | README:25,66; skill-catalog:69; F4 cl.11 | C |
| 10 | Same role and contract in direct and delegated use; in direct use the user acts as Maestro | README:158-164; contracts/README:17 | C |
| 11 | No delegation, orchestration or self-delegation | README:146; F1.7 | C (Forbidden) + R (task denied, task.ts:151-159) |
| 12 | No self-review, approval requests or acceptance; a self-check is not review | README:94,279; F4 cl.20 | C (Forbidden) |
| 13 | No merge, **commit, push, branch or PR**; the harness binds the working-tree digest | contracts/README:49 (F4-O4); README:94 | C (Forbidden), **new** |
| 14 | Never author or widen own grants or authority; worker narrative mints nothing | README:29,94; F4 cl.3 | C |
| 15 | Packet decisions, host grants and live instructions outrank memory, skills and project files; a skill or reference cannot override the contract or grant; material contradictions go back to the owner | README:98; skill-catalog:106 | C (precedence line) |
| 16 | Repairs require a supplied diagnosis and fix direction | capabilities:119; skill-catalog:59 | C (part of 6) / S `modes/repair.md` |
| 17 | Server-side scope only: UI, provisioning and production operations belong to other owners | capabilities:50; skill-catalog:140 | S |

### C. Packet

| # | Requirement | Source | Place |
| --- | --- | --- | --- |
| 18 | Expect a packet with: change + acceptance, decisions/diagnosis, authorized read/write targets, interfaces/patterns, stack versions, checks with cwd, known baseline failures, latitude/escalation, return address | README:223-230; maestro-pack:82-88 | C (one sentence: "check the packet is complete"); S field detail |
| 19 | Worker Step 0 baseline check (`git rev-parse HEAD`, `status`, `merge-base --is-ancestor`) | maestro-pack:58-66 | S / packet; not charter |
| 20 | Packet may be plain text; never demand a form | README:246 | S |

### D. Tools and enforcement

| # | Requirement | Source | Place |
| --- | --- | --- | --- |
| 21 | Permission denials and `Tool safety HOLD:` are blockers: report them verbatim and never route around them with another tool or path | F1.9 (f1-f2:43-48); F4 cl.11 | C |
| 22 | Do not install toolchains or select alternative environments; report the exact missing tool or service | capabilities:100; integration-flow:55 | C (1 line); S recipes |
| 23 | Minimal tool discipline, because the provider prompt is absent: dedicated file tools for read/search/edit; bash for commands; batch independent reads; do not reread unchanged context; do not run unrelated checks | request.ts:60; capabilities:186-200; README:268 | C (1–2 lines) |
| 24 | Owned or generator tools: copy the closed-set `error.code` into a `tool` blocker; never auto-replay a mutating call; reconcile `partial`/`unknown` effects before the next mutation | F4 cl.24-26; owned-tools | C (1 clause) + S `recipes/hugr/*` + R (CB envelope) |
| 25 | Project instructions (AGENTS.md) govern style and commands, but cannot widen the role (for example their commit or branch guidance) | AGENTS.md:7-15 injected after the charter (instruction.ts:166) | C (precedence line) |
| 26 | Do not read or write Atlas Memory files with file tools; memory goes only through the bound recall/emit tools | F3-D5/D7 (contracts/README:25,45); F3 cl.27-28 | C (Forbidden) + R (ToolSafety `neverTouch`) |
| 27 | No mid-run questions: `question` is denied, so the blocker is the channel | agent.ts:129; roster.ts:12 | R (fact); C covered by 9 |

### E. Checks and honesty

| # | Requirement | Source | Place |
| --- | --- | --- | --- |
| 28 | Run exactly the assigned checks plus applicable mandatory project checks; return a need for broader checks to the owner | README:277; capabilities:206 | C |
| 29 | Write tests only when assigned | README:23; capabilities:67 | C |
| 30 | Never claim an unexecuted or unobserved result; unavailable or partial stays unavailable or partial | README:97,244; capabilities:243 | C |
| 31 | Keep three axes distinct: execution ended, verified, accepted. Worker checks never mean "verified" | README:242; capabilities:136; F4 cl.1-3,13,16 | C |
| 32 | Check status vocabulary `pass\|fail\|skip\|missing\|acquisition-error`; no second vocabulary | F4 cl.2 | C (card schema) |
| 33 | On failure, adjust own code within the contract; a needed new diagnosis or decision → blocker with the observed evidence; no diagnostic loop | capabilities:128-130; README:71 | C |
| 34 | Whether to pre-run checks in armed mode is the packet's call (default: yes for cheap checks) | F4-O5 (contracts/README:50) | Packet / S |
| 35 | Local success is not deployment success; a preview is not production evidence | README:69; capabilities:136 | C (half-clause) / S |

### F. Result

| # | Requirement | Source | Place |
| --- | --- | --- | --- |
| 36 | The final assistant message carries the result: Task forwards only the last text part | task.ts:581; F4 cl.5 | C |
| 37 | Exactly one fenced JSON block tagged `charlie-result`, decoded by H5 with a closed struct (`onExcessProperty: "error"`) | F4 cl.5 (f4:44) | C (exact schema) + R (H5 decoder) |
| 38 | The block carries only worker claims: `changes`, worker `checks`, `blockers`, `risks`, `nextActions`. No host facts (`taskId`, session IDs, terminal, verification, memory) and no `acceptance` | F4 cl.3-5; table f4:20-42 | C |
| 39 | Worker may lower `ended` to `blocked` and must not claim the change complete while declaring a blocker; it can never raise status | F4 cl.8,11 | C |
| 40 | Blocker kinds are a closed set: `safety-hold`, `permission`, `tool`, `packet`, `atlas`, `check-unavailable`, with fields `{kind, reason, code?, ref?}` | F4 cl.11; f4:39 | C |
| 41 | Changes `{path, change: created\|modified\|deleted, callIDs[]}`; checks `{checkId, command, cwd, status, exitCode?, callID}`, bound to real tool calls, otherwise `unbound` | F4 table f4:31,33; cl.16 | C (shape) + R (H5 binding) — see conflict K7 |
| 42 | Prose before the block: outcome first, then delta, the verification actually run, use/run instructions and remaining limits; depth depends on the audience | capabilities:136-138; README:69,73 | C (1 line); S for audience detail |
| 43 | Acceptance is always `pending` and decided outside the worker | F4 cl.20 | C (via 38 + Forbidden) |

### G. Atlas and Memory

| # | Requirement | Source | Place |
| --- | --- | --- | --- |
| 44 | Header (Awareness + Orientation + own top-12 Rules) is host-injected. Never fetch it; treat Rules as constraints that never expand role or packet | README:257-258; F3 cl.6,9,28; integration-flow:26,31 | R (A4/H2) + C (1 line) |
| 45 | Header absent or degraded: continue ordinary work only if the supplied context is sufficient; otherwise return an `atlas` blocker. Never substitute local notes | integration-flow:55; F3 cl.10,20; README:43 | C (1 line) / S continuity |
| 46 | Explicit `task`/`pr` recall only when needed; never recall across owners; the resume fold is host-admitted once | F3 cl.12,18,20; integration-flow:40 | S + R |
| 47 | Checkpoint at meaningful events with TaskMemoryEntry template keys only; no invented fields, no fabricated final fold, no success claim for a skeleton | integration-flow:42,47; F3 cl.19,22; skill-catalog:125 | S |
| 48 | Propose `project` rules only on evidence; the model never sets frecency | integration-flow:44; F3 cl.22; F3-D6 | S |
| 49 | Tool success and memory success are separate; an uncertain write is reconciled, never blindly re-appended; a refused write is never reported as remembered | integration-flow:53; F3 cl.24-25; F4 cl.30 | S + R |
| 50 | Resume: continue from retained work if it is still current; stale packet or changed scope → blocker, with no drift investigation | README:70,248; integration-flow:45; capabilities:124 | C (1 line) / S |

### H. Skills

| # | Requirement | Source | Place |
| --- | --- | --- | --- |
| 51 | Load the matching entry skill on demand (six fixed names) and read only the references the task needs; a companion path list is not loaded content | skill-catalog:98-105; F6.2,F6.9 | C (pointer to `backend-implement`) + S + R (H1 skill grant) |
| 52 | Stack, framework and version practice lives in references, never in the charter | capabilities:100,108; README:255 | S |
| 53 | User-facing skill text uses the configured label; lookups use stable IDs | capabilities:108 | S + R |

**Count:** 53 requirements. **27 are charter-resident** (#1–2, 4, 6, 8–15, 21, 23, 25, 26, 28–31, 33, 36–40, 43), most of them one clause each. **15 are charter pointers or single lines whose detail lives in a skill** (#7, 16, 18, 22, 24, 32, 35, 41, 42, 44, 45, 50, 51, and the form constraints #3 and #5). **11 are skill-only or runtime-only** (#17, 19, 20, 27, 34, 46–49, 52, 53).

The implied charter shape keeps the four-anchor seat template and adds about five short sections: Boundary, Packet, Tools/Holds, Checks/Honesty, Result (with the `charlie-result` schema). Estimated size is ≈450–650 tokens.

---

## 5. Gaps and conflicts with the current `charlie.txt`

| ID | Current text / runtime fact | Requirement | Severity |
| --- | --- | --- | --- |
| K1 | "Inspect assigned code" (`charlie.txt:1`). The scope verb is ambiguous, and nothing forbids investigation, diagnosis, discovery or architecture choice | #6, #8, #16 | High: the core owner correction (README:21) is missing from the prompt |
| K2 | "make smallest correct implementation change" | #6/#7: implement the *assigned* behavior within the supplied design. "Smallest" can under-deliver a feature; README:275 says minimal *within the supplied design and acceptance* | Medium |
| K3 | "run focused checks" | #28: run exactly the assigned and mandatory checks. "Focused" invites self-selected checks | Medium |
| K4 | `Return card: implementation card, gates, diff receipt` | #36–41: one fenced `charlie-result` JSON block with the worker-claim schema, closed blocker kinds and the F4 status vocabulary. Renaming touches `roster.ts:59`, `roster.test.ts:29` and the `grantHash` input, and both `rosterHash` and `grantHash` change (§3) | High (H1 + H5 must land together; the decoder needs a frozen schema) |
| K5 | Forbidden list lacks commit/push/branch/PR, investigation/diagnosis/discovery, tool installation, acceptance claims, editing Atlas Memory files, and working around safety holds | #6, #13, #22, #26, #21 | High |
| K6 | Two Forbidden sources: the charter says "approval requests, self-review, merge, delegation, changing scope", while `roster.ts:60` says `["approve", "review own work", "merge"]` and feeds `grantHash` | Single source or an explicit mapping. Today nothing checks consistency (only `returnCard` is tested) | Medium |
| K7 | F4 asks the card for `callIDs[]`/`callID` (f4:31,33). The model may not see or reliably reproduce provider tool-call IDs | #41. H5 should bind by command/path against part history (cl.16 already allows `unbound`). The charter should not require IDs the model cannot observe; this needs a decision in the schema freeze | Medium (risk of systematic `unbound`) |
| K8 | No skill guidance, and `skill` is denied at runtime: `roster.ts:12-18`, pinned `native-team.test.ts:62`; the skills block is omitted (`system.ts:106`) | #51. The H1 Charlie-only profile must allow `skill` for the six names and read-only `external_directory` for the skill root (F1.8; F6.14). Until then a charter pointer to skills is dead text | High (blocks the charter/skill split) |
| K9 | The provider prompt is replaced (`request.ts:60`), so Charlie has no tool-use, tone or file-reference guidance. Maestro has 4.5 KB; Charlie 273 B | #23. Either the charter carries 1–2 lines of tool discipline, or H1/H2 append a provider-neutral base for native seats. The host decision is outside the charter | Medium |
| K10 | Literal "Charlie" in the prompt | #1, #3: label placeholder rendered by the host; the default must stay byte-identical for C-pin-1. Blocked by F1.4 (projected hash) | Medium (sequencing) |
| K11 | No direct-mode wording. The seat is `subagent` today (`agent.ts:303`) | #10. The charter must read correctly as primary (user = Maestro, blocker = question back to the user) once F1.6 lands | Low now, required at H1 |
| K12 | Bash tool text invites commits "when explicitly requested", and says `${tmp}` is "pre-approved for external directory access" (`O/tool/shell/shell.txt`). For native seats `external_directory` is denied (`native-team.test.ts:63`) | #13: the charter must forbid commits explicitly. The tmp claim is false for Charlie: H1 must grant tmp or the description must vary per seat | Medium (host + charter) |
| K13 | AGENTS.md (commit, branch, CI guidance) is injected *after* the charter (`instruction.ts:166`) with no precedence statement | #15, #25: a precedence line | Medium |
| K14 | No three-axis honesty rule and no "unavailable stays unavailable" | #30, #31 | High (F4 trust split; a false verification is an unconditional fail, execution-plan §2.7) |
| K15 | No Atlas wording. In V1 no header exists today (§1.4) | #44, #45: the charter must handle header present, absent and degraded without assuming any of them | Low now, required at A4 |
| K16 | Orchestrator-side: `task.txt:20` "outputs should generally be trusted", and the Task catalog description "Charlie native team specialist." (`agent.ts:299`) | Outside the charter; flag to H5/Maestro. The catalog description is what Maestro uses to choose the seat (`registry.ts:396-409`) | Low |
| K17 | Nested `AGENTS.md` files stack (`fs-util.ts:154-166`), contrary to the comment at `instruction.ts:122` | Budget only (+1.6k tokens in `packages/opencode`) | Low |

### Sequencing implication

A charter rewrite is coupled to:
- H1: Charlie-only profile with `skill` and the skill root granted; `mode: "all"`; label rendering.
- F1.4/H5: projected `rosterHash`/`grantHash` before any label change.
- H5: the `charlie-result` decoder with a frozen schema.
- Test updates in `native-team.test.ts:25,53-65,74` and `roster.test.ts:24-31`.

Shipping the new charter text alone (K1–K3, K5, K13, K14) is safe at any time. It changes `rosterHash` for new records only, and no golden pin exists. The `Return card:` rename (K4) must wait for the H5 decoder.
