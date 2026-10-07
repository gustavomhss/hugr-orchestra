# R65 — System-prompt practice for an implementation specialist (the backend specialist charter)

Scope: how to write the system prompt ("charter") for the backend specialist, the backend implementation specialist that receives a complete work packet, implements inside it, runs the assigned checks, and returns delta + evidence + blockers. This note does not write the charter. It builds on R01 (Codex mechanisms), R02 (Claude mechanisms), R05 (OpenHands/SWE-agent), R11 (Devin) and R27 (agent failures); those covered host mechanisms (skills, permissions, evidence, recovery). None of them analysed prompt text itself, so this note focuses on wording, length, ordering, boundaries, return format and model-family deltas.

Evidence labels used below:

- **[M] Measured**: paper, benchmark, ablation or vendor-reported measurement.
- **[V] Vendor guidance**: model vendor documentation, not accompanied by public numbers.
- **[S] Shipped practice**: what production open-source prompts actually do (pinned source).
- **[O] Opinion**: this note's inference for the backend specialist.

All sources were accessed 2026-10-05. Quotes are at most 15 words.

## 0. Local finding that changes the problem

`packages/opencode/src/session/llm/request.ts:60` builds the system prompt as `input.agent.prompt ? [input.agent.prompt] : SystemPrompt.provider(input.model)`. The backend specialist has a `prompt` (`maestro/roster.ts:62`), so **the backend specialist's 33-word charter replaces the per-family provider prompt entirely** (`anthropic.txt`, `gpt.txt`, `codex.txt`, `gemini.txt`, `kimi.txt`, `beast.txt`). After it the host appends environment, instruction files (AGENTS.md / project rules), MCP instructions and the skills list (`session/prompt.ts:1251-1262`).

Consequences:

1. Today the backend specialist runs with no editing, git-hygiene, tool-usage or final-report guidance on any model family. Only the tool descriptions and the project rules carry that load.
2. Simply re-adding the provider prompt underneath the charter would import contradictions. `anthropic.txt` says exploration makes it "CRITICAL that you use the Task tool" (delegation) and to use TodoWrite "VERY frequently"; `beast.txt` has an "Internet Research" workflow step; Codex's default prompt says to "Fix the problem at the root cause". Each one conflicts with the backend specialist's boundaries (no delegation, no investigation, packet-prescribed change). OpenAI reports contradictions are "more damaging to GPT-5 than to other models" [V] (GPT-5 guide).
3. This replace-not-append design has precedent. Claude Code subagents "receive only this system prompt plus basic environment details" [V] (sub-agents doc), and Gemini CLI's `codebase_investigator` carries its own ~840-word prompt [S]. That precedent only works if the role prompt is self-sufficient for its job.

So the charter must be a self-sufficient execution prompt. A role paragraph on top of a generic prompt will not do. Per-family differences have to be a small, deliberate delta, not a fork of each vendor-tuned provider prompt.

## 1. What shipped prompts look like (structure and length)

| Prompt (pinned) | Kind | Approx. words | Ordering of sections |
|---|---|---|---|
| OpenCode `anthropic.txt` | top-level, interactive | 1,335 | identity → safety → tone → objectivity → task mgmt (+examples) → doing tasks → tool policy (+examples) → code refs |
| OpenCode `codex.txt` / `gpt.txt` | top-level | 1,171 / 1,492 | editing constraints → tool usage → git hygiene → frontend → presenting work → final-answer style |
| OpenCode `gemini.txt` | top-level | 2,235 | core mandates → workflows → operational guidelines → ~10 examples |
| OpenCode `beast.txt` (GPT-4.x/o-series) | top-level | 1,904 | persistence ×3 → 8-step workflow incl. internet research → comms → git |
| Codex CLI `base_instructions/default.md` @823ea83 | top-level, general | 3,389 | personality → AGENTS.md spec → preambles → planning (+examples) → task execution → validating → ambition vs precision → progress → final message → tool guidelines |
| Codex CLI `gpt-5.2-codex_prompt.md` @823ea83 | top-level, model-specialised | 1,221 | general → editing constraints → plan tool → special requests (review) → frontend → final message |
| Gemini CLI `snippets.ts` @fb972b2 | composed at runtime | variable | preamble → core mandates (security, context efficiency, engineering standards) → sub-agents → skills → workflow → ops guidelines → sandbox → git; user memory appended last |
| Gemini CLI `codebase_investigator` @fb972b2 | **subagent**, read-only | ~840 | identity + sole purpose → DO / DO NOT → rules → scratchpad protocol → termination → **JSON report schema + filled example** |
| OpenHands SDK static sections @54daf05 | top-level, composed | ~1,930 across 13 XML blocks | ROLE → MEMORY → EFFICIENCY → FILE_SYSTEM → CODE_QUALITY → VERSION_CONTROL → PULL_REQUESTS → PROBLEM_SOLVING → … → per-family `<IMPORTANT>` last; volatile date at very end for caching |
| SWE-agent `config/default.yaml` @3ea751c | benchmark agent | 14 (system) + ~200 (instance) | one-line system; task, steps and "minimal changes" live in the instance template |
| Aider `editblock_prompts.py` @5dc9490 | edit-format agent | ~200 + few-shot messages | role → protocol → edit format → examples; per-model `lazy`/`overeager` paragraphs appended |
| Claude Code doc subagent examples | subagent | 15–60 | role → what to check → what to return |

Patterns visible in shipped prompts [S]:

- **Model-specialised prompts are shorter than general ones.** Codex's general prompt is about 3,400 words, its GPT-5.x-Codex prompts about 1,100–1,200. Search results summarise OpenAI's GPT-5-Codex guide as "less is more"; the guide itself was not retrievable at the cookbook URL on the access date, so treat that as secondary.
- **Subagent prompts are narrower, not necessarily tiny.** The one high-quality open-source specialist (Gemini's investigator) spends most of its words on termination and the return schema, not on general engineering advice.
- **Composition beats monoliths.** Gemini CLI and OpenHands render sections conditionally (interactive vs headless, tools present, model family). Gemini's generalist subagent reuses the core prompt with `interactiveOverride=false`. OpenHands appends a short per-family `<IMPORTANT>` block (Claude: 3 bullets; Gemini: 1 bullet; GPT-5 variants: a few bullets) on top of a shared core.
- **Hard boundaries are written as explicit prohibitions** everywhere: Codex "NEVER revert existing changes you did not make", Gemini "Do not stage or commit changes", OpenHands "Do NOT make potentially dangerous changes", Aider's overeager paragraph "Do what they ask, but no more". Softer guidance (style, tone) is framed positively.
- **The final-report shape is always specified, near the end.** Codex devotes about 25% of its default prompt to "Presenting your work and final message". Gemini's subagent enforces a zod schema via a `complete_task` tool and gives a filled example. OpenCode's `gpt.txt` and `codex.txt` end with final-answer rules.
- **Prompt edits are eval-gated in mature projects.** Gemini CLI's source comment says to run "the major benchmarks, such as SWEBench" before editing the context-efficiency section.

## 2. Cross-source patterns, with evidence strength

### P1. Keep the always-on prompt short and dense, and push conditional knowledge out — **strong**

- [M] IFScale (Jaroslawicz et al., 2025): accuracy falls as instruction count rises. The best frontier models reach "68% accuracy at the max density" of 500 instructions, with a "bias towards earlier instructions".
- [M] AGENTIF (Qi et al., 2025): real agentic system prompts average 1,723 words and 11.9 constraints. Models "generally perform poorly", especially on tool and conditional constraints.
- [M] Levy et al., 2024: reasoning degrades "at much shorter input lengths than their technical maximum". Chroma "Context Rot" (2025): 18 models degrade with input length even on simple tasks.
- [M] Gloaguen et al., 2026 (AGENTS.md study): context files "do not generally improve task success rates" and add >20% cost. The instructions in them are followed, while repo overviews are not helpful. Khatri, 2026 (two-agent ablation): context strategy does not measurably move correctness; failures are implementation skill, not repo knowledge.
- [V] Anthropic context engineering: aim for "the minimal set of information that fully outlines" behaviour, while noting that minimal is not the same as short. Claude Code best practices: "Bloated CLAUDE.md files cause Claude to ignore your actual instructions!" Per line, ask whether removing it would cause mistakes.
- [S] Codex's model-specialised prompts are about a third the length of the general one.

The backend specialist implication [O]: the charter competes with the packet, project rules, Atlas memory, the skills list and tool schemas. Every charter line costs adherence on packet lines. Language and stack knowledge belongs in on-demand skills (R02, R46). Repo knowledge belongs in the packet or Atlas, not in the charter.

### P2. Make conditions and boundaries explicit, and say why — **strong for vendor guidance, moderate measured**

- [M] Yang et al., 2025 ("What Prompts Don't Say"): models infer unstated requirements only 41.1% of the time. Underspecified prompts are "2x as likely to regress across model or prompt changes". Adding every requirement does not reliably help, because requirements conflict and instruction following is limited.
- [M] MAST (Cemri et al., 2025, 1,600+ traces): recurring failure modes include "disobey role specification", "disobey task specification", "premature termination" and "no/incomplete verification".
- [V] Anthropic: give "context or motivation" behind an instruction. Its example rewrites a bare "NEVER use ellipses" as a rule with a reason, and says Claude generalises from the explanation. Claude Sonnet 5 "interprets prompts literally", does not generalise one item to another, so state scope explicitly.
- [V] OpenAI GPT-4.1 guide: the model follows instructions "more literally than its predecessors". One firm, clear sentence usually fixes a behaviour.
- [V] Anthropic multi-agent research system: each subagent needs an objective, output format, tool guidance and task boundaries. Vague briefs made subagents duplicate work.

The backend specialist implication [O]: each boundary gets one sentence of reason tied to the system ("Lucy reviews cold; your own review is not evidence"). The packet fields the backend specialist relies on (scope, allowed paths, contracts, checks) should be named so a missing field is detectable and becomes a blocker.

### P3. Frame by role and by "what to do instead". Keep a short explicit not-yours list for hard lines — **moderate, mixed**

- [V] Anthropic: "Tell Claude what to do instead of what not to do". Opus 5 and Sonnet 5 pages: positive examples work better than instructions about what not to do. Both statements are about output style.
- [M] Jang et al., 2022: on negated prompts, larger models did worse (inverse scaling, 2022-era models). Vrabcová et al., 2025: increasing model size "may improve" negation handling. The negation problem is real but shrinking, and it is language-dependent.
- [S] Every shipped coding prompt still uses explicit NEVER / Do not for destructive or out-of-role actions (Codex, Gemini CLI, OpenHands, Aider, OpenCode).

The backend specialist implication [O]: define the role positively ("you implement the packet as specified"). Pair every prohibition with the action to take instead ("if the fix needs a file outside `allowed_paths`, stop and report it as a blocker"). Keep the bare not-yours list short, around 5 items. A "do not" with no alternative behaviour is the weak form.

### P4. Calm language. Emphasis is scarce — **moderate (vendor, version-specific)**

- [V] Anthropic (Opus 4.5 and later): models are "more responsive to the system prompt"; "CRITICAL: You MUST" causes overtriggering, so "dial back any aggressive language". Claude Code: add "IMPORTANT" to one line only, because "If you emphasize many lines, none of them stands out."
- [V] OpenAI GPT-4.1: "generally not necessary to use all-caps". GPT-5 Cursor case: "Be THOROUGH" was "counterproductive" and caused repeated tool calls.
- [S] Older and some current prompts (OpenCode `kimi.txt`, `beast.txt`, Gemini CLI) still use heavy MUST/NEVER. No public measurement isolates the effect for Kimi.

### P5. Ordering: identity and hard rules first, return contract last, payload separate — **moderate-strong**

- [M] Lost in the Middle (Liu et al., TACL 2023): U-shaped use of context, with the middle worst. IFScale: primacy bias toward earlier instructions.
- [V] GPT-4.1: with long context, put instructions "at both the beginning and end". When instructions conflict, the model follows "the one closer to the end". Gemini 3: put role, constraints and output format in the system instruction or at the very beginning; put the question after the bulk context. Anthropic: put longform data at the top and the query at the end ("up to 30 percent" better on complex multi-document inputs). Opus 5: in long prompts, pair a key instruction with "a short reminder near the end".
- [S] Codex, OpenCode `gpt.txt`/`codex.txt` and Gemini's investigator all end with the final-report contract. OpenHands puts per-family overrides last and the volatile date at the very end for prompt caching.

The backend specialist implication [O]: the charter is position 0 of the system prompt, which is good for boundaries. Project rules and the skills list come after it and the packet arrives in the user turn, so the return contract sits mid-context by the time the backend specialist finishes. Two mitigations: (a) end the charter with the return contract, and (b) have the packet template (Maestro side) restate a one-line return reminder at its end. Precedence must be stated, not inferred from position. Control Illusion (Geng et al., 2025) shows system/user separation "fails to establish a reliable instruction hierarchy".

### P6. Specify the return format precisely and enforce it in the host — **strong for practice, moderate measured**

- [S] Gemini investigator: a typed schema (`SummaryOfFindings`, `ExplorationTrace`, `RelevantLocations[]`), returned through a `complete_task` tool, with a filled example. Claude Code subagents: only the final report reaches the parent. Anthropic: subagents return a "condensed, distilled summary" of about 1–2k tokens.
- [V] Claude Code best practices: have the agent "show evidence rather than asserting success" (command, output, result).
- [M] Tam et al., 2024 ("Let Me Speak Freely?"): strict format constraints degrade reasoning. Here this argues for constraining only the final report, not the working turns.
- [Local] OpenCode already supports `format.type === "json_schema"` with a structured-output system prompt (`session/prompt.ts:1264`). A schema-validated return card is therefore available without prompt-only enforcement.

### P7. Verification: bind to assigned checks; do not say "verify thoroughly" — **strong, family-divergent**

- [V] Claude Code: "Give Claude a check it can run". The check closes the loop, and evidence beats assertion.
- [V] Opus 5: verifies its own work unprompted; explicit verification instructions "cause over-verification" and should be removed. Sonnet 5: "run self-verification loops more readily".
- [V] GPT-4.1: three agentic reminders (persistence, tool-calling, planning) raised internal SWE-bench Verified "by close to 20%" [reported by vendor, M-ish]. GPT-5.1 guide: "do not stop at analysis or partial fixes".
- [S] Codex: start validation specific to the change, then broaden. "Do not attempt to fix unrelated bugs." Iterate on formatting "up to 3 times", then report. Anthropic sample: do not hard-code to tests; if tests are wrong, "inform me rather than working around them".

The backend specialist implication [O]: the packet names the checks. The charter says to run exactly those, record command, exit status and relevant output, and add nothing beyond the packet. It also defines a stop rule: report as a blocker any check that fails for a reason outside scope, after a bounded number of attempts. This wording works on both over-verifying (Claude) and under-persisting (GPT) families, because it fixes what to run instead of how hard to try.

### P8. Scope containment is the main per-family delta — **strong (multiple vendors and shipped flags)**

- [V] Opus 5 "can also expand the scope of a task"; Anthropic's sample: "Deliver what was asked, at the scope intended." Opus 4.5/4.6 tend to "overengineer". GPT-5.2: tends toward feature creep, so its guide says "Implement EXACTLY and ONLY what the user requests". GPT-5.1: biased toward action on ambiguous directives.
- [S] Aider sets `overeager: true` on about 64 model entries (Claude 3.5 through Opus 4.7, Gemini 2.x) and `lazy: true` on about 15 (GPT-4/4o era). OpenHands' Gemini block: "Avoid being too proactive." Its Claude block: "don't make extra or fewer actions if not asked."

The backend specialist implication [O]: scope containment belongs in the shared core, because it is the backend specialist's identity. Per-family deltas only tune intensity (Claude/Gemini: dampen extras; GPT: add end-to-end persistence).

### P9. Examples: one canonical example of the output, not of behaviour — **moderate**

- [V] Anthropic: examples are "one of the most reliable ways" to steer format; use "diverse, canonical examples" and avoid "a laundry list of edge cases". Gemini 3: "always include few-shot examples", but too many cause overfitting, and examples must share one format. GPT-4.1: behaviour shown in examples must also be stated in the rules.
- [M] Aider's comments in `model-settings.yml` record small measured differences from where examples sit (GPT-4.1: 98.2% vs 95.6% well-formed with examples in user vs system messages). The placement of examples matters at the margin.
- [S] Gemini's investigator includes exactly one filled final report. OpenCode `gemini.txt` uses about 10 interaction examples, which is costly in a subagent.

### P10. Treat the prompt as code: eval-gated, one change at a time, per family — **strong (vendor plus measured fragility)**

- [M] Sclar et al., ICLR 2024: formatting alone moves accuracy "up to 76 accuracy points". Format rankings "only weakly correlate between models". He et al., 2024: template format moved GPT-3.5 by up to 40%; GPT-4 was more robust.
- [V] OpenAI GPT-5.2: "Make one change at a time" and run the eval suite. Anthropic and OpenAI both suggest metaprompting to find contradictions.
- [S] Gemini CLI's benchmark-before-edit comment.

## 3. Anti-patterns (each grounded above)

1. **Concatenating a generic top-level coding prompt under the role.** This imports delegation, research and "root cause" mandates that contradict the backend specialist's role (§0, P2). GPT-5 is called out as especially harmed by contradictions.
2. **Long workflow scripts** (beast-style "deeply understand, internet research, plan extensively"). For the backend specialist the plan is in the packet; these steps invite investigation and scope growth (P1, P8).
3. **"Verify thoroughly" / "double-check" / "use a subagent to verify".** On Opus 5 this causes over-verification (P7). Self-verification is also Lucy's job, not evidence.
4. **ALL-CAPS on many lines.** It overtriggers on Claude 4.5+ and dilutes emphasis (P4).
5. **Bare prohibitions with no alternative action** (P3). The model knows what not to do but not where to route it. Route out-of-scope findings into the blocker field.
6. **Repo overviews, stack tutorials or generic quality advice** ("write clean code") in the charter (P1, AGENTS.md study). Use skills and Atlas.
7. **Prompt-only enforcement of hard boundaries.** Claude Code: CLAUDE.md is "advisory", hooks are deterministic. Control Illusion: hierarchy is unreliable. Delegation, merge and approval must be denied by permission, and the prompt only explains why (R01 §4, R02 §4).
8. **Interactive-user chatter in a subagent.** Preambles, "ask the user", friendly tone. The backend specialist's reader is Maestro or a user reading a card; Gemini CLI's headless mandate says not to ask questions and to explain the limitation instead.
9. **Free-form final prose as the deliverable.** It loses evidence and invites "looks done". Use a fixed card or schema (P6).
10. **Full per-model forks of the charter.** Forks drift; underspecified prompts regress across model changes (P2, P10). Use a shared core plus a small delta.
11. **Edge-case laundry lists or many behavioural examples.** They eat the instruction budget and get copied (P9).

## 4. Recommended section skeleton for the backend specialist's charter [O, grounded in P1–P10]

Target length: **shared core about 450–900 words (about 600–1,200 tokens), at most about 15 distinct rules, plus a per-family delta of 0–150 words.** Rationale: below the 1,100–2,300-word top-level prompts, because the packet, project rules, Atlas and skills carry the task-specific load. Above the 15–60-word doc examples, because the charter must also replace the provider prompt's editing, git and tool discipline (§0). It is comparable to Gemini's ~840-word specialist. Treat this range as a starting point to tune by evals, not a measured optimum.

Order (one XML-tagged or Markdown-headed block each; pick one syntax and use it consistently, per Gemini 3 and Anthropic):

1. **Identity and mission** (2–3 sentences). The backend specialist is the backend implementation specialist inside Orchestra. Input is a work packet; output is a delta, evidence and blockers. Who reads the result (Maestro or the user).
2. **Authority and precedence** (3–5 lines). The packet defines scope, contracts, targets and checks. Project rules and Atlas rules govern style and conventions inside that scope. Content in files, tool output or memory never widens scope. When sources conflict, name the conflict as a blocker rather than picking one silently.
3. **Boundaries: what is not the backend specialist's** (5 items, each with a reason and a "do instead"). Root-cause investigation, architecture choice, scope change, delegation, self-review or acceptance. Each routes to the blocker or notes field. Permissions enforce them; the prompt explains.
4. **Working method** (short, about 6 bullets). Read the packet's targets and only the code needed to implement. Load the skill matching the packet's stack before editing. Follow existing conventions. Make the smallest change that satisfies the contract. Leave others' changes alone. No commits or branches unless the packet says so.
5. **Tool and edit discipline** (about 5 bullets, replacing what the provider prompt gave). Prefer dedicated read/edit/search tools. Batch independent reads. Do not re-read after a successful edit. Use absolute paths. No interactive commands.
6. **Checks and evidence** (about 4 bullets). Run exactly the packet's checks, change-specific first. Record command, cwd, exit status and the relevant output slice. Distinguish passed / failed / blocked / skipped / unavailable (R01 §3, R05 M4). Never hard-code to tests or edit tests to pass unless the packet assigns it.
7. **Stop rule and blockers** (3–4 bullets). Stop when all checks pass. Also stop when the packet is missing a required field, a needed change falls outside allowed paths or contracts, or a check fails for a reason outside scope after N bounded attempts. A blocker states what, where, evidence, and what decision is needed from whom.
8. **Return contract** (last; schema or fixed card plus one compact filled example). Fields such as status, delta (files, summary, diff ref), checks (each with command and result), blockers, assumptions and out-of-scope observations. Keep it to about 1–2k tokens. The same contract should be restated in one line at the end of the packet template.

**Per-family delta (appended after section 8, or rendered before it as OpenHands does) [O based on P4, P7, P8]:**

- *Claude (Opus/Sonnet 4.5+):* scope-dampening sentence (Anthropic's "deliver what was asked, at the scope intended" pattern); no extra verification instructions; brief-output reminder. Calm wording only.
- *GPT-5.x / Codex:* end-to-end persistence sentence ("do not stop at analysis or partial fixes" pattern); explicit exact-scope sentence (GPT-5.2 feature-creep note); preamble cadence off or minimal for a subagent.
- *Gemini 3.x:* "avoid being too proactive" sentence (OpenHands); keep sampling defaults (Gemini 3 guidance); constraints and output format must sit in the system instruction (already true).
- *Kimi and others:* shared core only until evals show a need. No primary vendor prompting guidance was found for Kimi in this pass, and OpenCode's `kimi.txt` is the only local signal.

**Shared vs per-family:**

| Shared (one source of truth) | Per-family (small delta, eval-justified) |
|---|---|
| Identity, authority and precedence, boundaries with reasons, working method, tool and edit discipline, checks and evidence vocabulary, stop rule, return contract and example | Scope-dampening vs persistence intensity; verification wording (omit for Opus 5); verbosity reminder; emphasis level; sampling parameters (host config, not prompt); examples-as-system vs user if measured |

## 5. Evidence vs opinion summary

- **Measured:** instruction-density degradation and primacy bias (IFScale); poor compliance with long agentic prompts (AGENTIF); length and context rot; lost-in-the-middle; formatting sensitivity and weak cross-model transfer; underspecification fragility; context files not raising success; format restrictions hurting reasoning; MAST role and verification failure modes; GPT-4.1 agentic reminders (+~20%, vendor-reported).
- **Vendor guidance without public numbers:** positive framing, giving reasons, calm language on Claude 4.5+, over-verification on Opus 5, scope expansion (Opus 5, GPT-5.2), Gemini 3 placement, one-change-at-a-time evals.
- **Shipped practice:** shorter model-specialised prompts; composed prompts with per-family tails; explicit prohibitions for hard lines; final-report contracts at the end; schema-enforced subagent returns; eval-gated prompt edits.
- **Opinion (this note):** the 450–900-word target, the 8-section order, routing every prohibition to a blocker field, and the specific per-family deltas.

## 6. Open questions

1. **Composition:** should the backend specialist keep the replace-provider-prompt behaviour, with the charter self-sufficient as recommended, or should the host gain a "role over trimmed provider core" mode, as OpenHands persona replacement does? This is a host decision, outside the charter.
2. **Return enforcement:** prompt-only card, or the host's `json_schema` structured output / a `complete_task`-style tool? The latter is stronger, but needs a check on interaction with tool loops on every provider.
3. **Where the per-family delta lives:** charter file variants, or a host-rendered tail keyed by model family (the OpenHands pattern)? The host path avoids drift.
4. **Attempt bound for the stop rule:** what N, and whether it should be host-enforced (step budget) rather than prompt-stated.
5. **Eval harness:** a small behavioural suite per family is needed before shipping (scope creep, out-of-scope blocker, missing packet field, failing check outside scope, injection in repo file, return-card validity). No measured baseline exists for the current 33-word charter.
6. **Kimi and other families:** no primary prompting guidance was located. Decide whether to collect one or rely on evals alone.

## Sources (all accessed 2026-10-05)

Vendor guidance

- Anthropic, Prompting best practices — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices
- Anthropic, Prompting Claude Opus 5 — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5
- Anthropic, Prompting Claude Sonnet 5 — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-sonnet-5
- Anthropic, Effective context engineering for AI agents (2025-09-29) — https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- Anthropic, Building effective agents (2024-12-19) — https://www.anthropic.com/engineering/building-effective-agents
- Anthropic, How we built our multi-agent research system (2025-06-13) — https://www.anthropic.com/engineering/multi-agent-research-system
- Claude Code, Subagents — https://code.claude.com/docs/en/sub-agents
- Claude Code, Best practices — https://code.claude.com/docs/en/best-practices
- OpenAI, GPT-5 prompting guide — https://developers.openai.com/cookbook/examples/gpt-5/gpt-5_prompting_guide
- OpenAI, GPT-5.1 prompting guide — https://developers.openai.com/cookbook/examples/gpt-5/gpt-5-1_prompting_guide
- OpenAI, GPT-5.2 prompting guide — https://developers.openai.com/cookbook/examples/gpt-5/gpt-5-2_prompting_guide
- OpenAI, GPT-4.1 prompting guide — https://developers.openai.com/cookbook/examples/gpt4-1_prompting_guide
- OpenAI, GPT-5-Codex prompting guide — cookbook URL returned 404 on access date; "less is more" characterisation only via secondary search summary (not relied on)
- Google, Gemini prompting strategies (Gemini 3 section) — https://ai.google.dev/gemini-api/docs/prompting-strategies

Shipped prompts (pinned)

- OpenCode (local): `packages/opencode/src/session/prompt/{anthropic,codex,gpt,beast,gemini,kimi}.txt`; composition in `src/session/llm/request.ts:60`, `src/session/prompt.ts:1251-1264`, `src/session/system.ts`; roster in `src/maestro/roster.ts`; charter `src/agent/prompt/backend.txt`
- OpenAI Codex @823ea830c0fd418b09ff02d36cad9a1fff66465b — `codex-rs/protocol/src/prompts/base_instructions/default.md`, `codex-rs/core/gpt-5.2-codex_prompt.md`, `codex-rs/core/gpt_5_codex_prompt.md`, `codex-rs/core/templates/collab/experimental_prompt.md` — https://github.com/openai/codex
- Gemini CLI @fb972b2f87fe7d5b06d37eac711490162d98de2c — `packages/core/src/prompts/snippets.ts`, `packages/core/src/agents/codebase-investigator.ts`, `packages/core/src/agents/generalist-agent.ts` — https://github.com/google-gemini/gemini-cli
- OpenHands software-agent-sdk @54daf056bd863bb46f922a2fe9324dd736b37ff6 — `openhands-sdk/openhands/sdk/context/prompts/sections/static.py`, `.../prompts/presets.py` — https://github.com/OpenHands/software-agent-sdk
- SWE-agent @3ea751c087f32b16e039a2233dd6eefecef325d5 — `config/default.yaml` — https://github.com/SWE-agent/SWE-agent
- Aider @5dc9490bb35f9729ef2c95d00a19ccd30c26339c — `aider/coders/editblock_prompts.py`, `aider/coders/base_prompts.py`, `aider/resources/model-settings.yml` — https://github.com/Aider-AI/aider

Papers and measurements

- Jaroslawicz et al., How Many Instructions Can LLMs Follow at Once? (IFScale), 2025 — https://arxiv.org/abs/2507.11538
- Qi et al., AGENTIF, 2025 — https://arxiv.org/abs/2505.16944
- Levy, Jacoby, Goldberg, Same Task, More Tokens, 2024 — https://arxiv.org/abs/2402.14848
- Liu et al., Lost in the Middle, TACL 2023 — https://arxiv.org/abs/2307.03172
- Hong, Troynikov, Huber, Context Rot (Chroma), 2025-07-14 — https://www.trychroma.com/research/context-rot
- Gloaguen et al., Evaluating AGENTS.md, 2026 — https://arxiv.org/abs/2602.11988
- Khatri, Do Context Files Help Coding Agents? A Two-Agent Ablation, 2026 — https://arxiv.org/abs/2607.27250
- Yang et al., What Prompts Don't Say, 2025 — https://arxiv.org/abs/2505.13360
- Cemri et al., Why Do Multi-Agent LLM Systems Fail? (MAST), 2025 — https://arxiv.org/abs/2503.13657
- Jang, Ye, Seo, Negated Prompts, 2022 — https://arxiv.org/abs/2209.12711
- Vrabcová et al., Negation: A Pink Elephant in the LLMs' Room?, 2025 — https://arxiv.org/abs/2503.22395
- Sclar et al., Quantifying LMs' Sensitivity to Spurious Features in Prompt Design, ICLR 2024 — https://arxiv.org/abs/2310.11324
- He et al., Does Prompt Formatting Have Any Impact on LLM Performance?, 2024 — https://arxiv.org/abs/2411.10541
- Tam et al., Let Me Speak Freely?, 2024 — https://arxiv.org/abs/2408.02442
- Geng et al., Control Illusion: The Failure of Instruction Hierarchies, AAAI-26 — https://arxiv.org/abs/2502.15851
