# 66 — Persona evidence: what an identity line does to agent behavior, and how to design the backend specialist's

Retrieved 2026-10-05. Scope: what a persona, role, or identity in a system prompt actually changes in LLM behavior and quality, and what that means for the backend specialist (stable ID `backend`, configurable display label, backend implementation specialist under Maestro, talks to both orchestrator and a Portuguese-speaking owner, runs on several model families).

Not repeated here: identity/label/storage separation (stable IDs vs display names, rename safety, receipt hashing) is already covered in `02-claude.md` §4, `11-devin.md`, `14-other-competitors.md`, `27-agent-failures.md` H1, and `specs/backend-specialist/README.md` lines 82–92, 177–205. This document treats the name only as a *prompt input that may change model behavior*.

Strength scale used below:

- **Strong**: several independent studies or one large multi-model study, peer reviewed, consistent direction.
- **Moderate**: one peer-reviewed or carefully designed study, or several preprints agreeing.
- **Weak**: single preprint, old or small models, one model family, or LLM-judged outcomes.
- **Practice**: vendor documentation or shipped prompt. Shows what builders do, not that it works.

## 1. Bottom line

1. **A persona, on its own, does not make the model more capable.** The largest controlled studies find expert or role personas give no reliable accuracy gain over a no-persona baseline. Some models, some tasks, and some persona wordings gain; others lose. The effect is model-specific and hard to predict. (Strong)
2. **Persona details that have nothing to do with the task can still move results.** A name or a favorite color has changed accuracy by up to about 30 points on open-weight models. Demographic personas cause stereotyped abstentions and reasoning drops. A configurable human name is exactly this kind of irrelevant detail. (Moderate for names on frontier models: they were not tested; Strong for the general effect)
3. **What helped in multi-agent coding systems was the charter, not the character.** In ChatDev's ablation the gains from "roles" came from behavioral specifications attached to each role. MAST traces role failures to unclear responsibilities and decision rights, and fixes them structurally, for example by deciding who has the final say. (Moderate)
4. **Persona traits leak into how sure the model sounds and how much it agrees.** Expert personas raise stated confidence even when accuracy stays flat. Agreeable personas predict sycophancy. Giving the model a detached, third-person stance reduces sycophancy. (Moderate)
5. **Personas drift and are only enforced by instruction.** Instruction drift can be measured within about 8 turns. Product docs say plainly that style and identity prompts are not guarantees. Boundaries have to be enforced through permissions and tooling, with the prompt as a second layer. (Moderate)

Vendors still recommend giving the model a role. They frame it as focusing behavior and tone, not as raising capability. Shipped coding agents keep the identity line to one sentence and put the real content in rules, tools, and output contracts. Several have *dropped* expertise flattery over time (Cline) or moved personality into a separate optional layer (Codex `model_personality`, Claude Code output styles). (Practice)

## 2. Evidence table

| # | Claim | Direction | Strength | Source |
|---|---|---|---|---|
| E1 | 162 personas in system prompts give no improvement over no-persona on 2,410 factual questions across 4 model families; the best persona per question can't be predicted better than random | Null / unpredictable | Strong | Zheng et al., EMNLP Findings 2024 [A1] |
| E2 | Expert personas don't reliably improve GPQA Diamond / MMLU-Pro accuracy across 6 models (one exception: Gemini 2.0 Flash); low-knowledge personas reduce accuracy | Null; negative for "low" personas | Strong | Basil, Mollick et al., Wharton report 4, Dec 2025 [A2] |
| E3 | Across 9 LLMs and 27 tasks, expert personas are positive or not significant. Irrelevant attributes (**names**, favorite colors) cause drops of almost 30 pp. Mitigations work only for models ≥70B | Mixed; names can hurt | Moderate (open-weight models ≤72B only) | Araujo et al., EMNLP 2025 [A3] |
| E4 | Role-play prompting raised ChatGPT zero-shot reasoning on 12 benchmarks (e.g. AQuA 53.5→63.8) | Positive | Weak to moderate (single 2023 model; acts as a CoT trigger, largely made redundant by reasoning models) | Kong et al., NAACL 2024 [A4] |
| E5 | Role-play prompts degrade reasoning on 4 of 12 datasets even with GPT-4; ensembling persona and neutral answers recovers the loss | Mixed | Moderate | Kim et al., IJCNLP-AACL Findings 2025 [A5] |
| E6 | Expert impersonation beats non-expert impersonation; also introduces gender stereotypes | Positive relative to *bad* personas, not to no persona | Moderate | Salewski et al., NeurIPS 2023 [A6] |
| E7 | ExpertPrompting: generated expert identities improve answers as judged by GPT-4, used to train ExpertLLaMA | Positive | Weak (LLM-judged, 2023, data-generation use) | Xu et al. 2023 [A7] |
| E8 | 19 socio-demographic personas: 80% of ChatGPT-3.5 personas show bias; drops above 70% on some datasets; stereotyped refusals; GPT-4-Turbo is biased in 42% of personas | Negative | Strong | Gupta et al., ICLR 2024 [A8] |
| E9 | HumanEval+ (22,140 runs): expert persona combined with JSON format and urgency costs up to −12.2 pp on GPT-4o-mini; effects depend on the model family | Negative in combination | Moderate (preprint, Sep 2026, single-shot code) | Jadhav et al. [A9] |
| E10 | Demographic personas in code generation: markers leak into up to 65% of responses; correctness −1.54 pp on Gemini 2.5 Pro but +3.4–5.7% on GPT-OSS-120B; no systematic security effect | Mixed, opposite by model | Moderate (preprint, Aug 2026) | Gupta, Beschastnikh et al. [A10] |
| E11 | Expert role prompts raise expertise depth but reduce clarity; they help on advisory medical questions and hurt on conceptual ones | Trade-off | Weak (preprint, May 2026) | Xiao et al. [A11] |
| E12 | Personality-guided prompts raise code pass rates in 23 of 28 model × dataset pairs, by up to 12.9% | Positive | Weak (MBTI-style generated personalities; not replicated) | arXiv 2411.00006, ACL 2025 [A12] |
| E13 | Occupational personas shift *stated* confidence ("expert" higher) independently of accuracy | Negative (calibration) | Moderate | ACL Findings 2025 [B1] |
| E14 | Persona agreeableness predicts sycophancy in 9 of 13 small open models (d up to 2.33) | Negative | Moderate (small models) | Shah et al., Apr 2026 [B2] |
| E15 | A third-person perspective reduces multi-turn sycophancy by up to 63.8% (SYCON-Bench) | Positive for a *detached stance* | Moderate | Hong et al., EMNLP Findings 2025 [B3] |
| E16 | Instruction or persona drift appears within 8 rounds; attention decay over long exchanges is implicated | Negative over long dialogs | Moderate (older models) | Li et al., COLM 2024 [B4] |
| E17 | Post-training only loosely tethers models to the Assistant persona; drift is triggered by meta-reflection and emotionally loaded conversations; activation capping stabilizes | Mechanistic: personas are a real, steerable variable | Moderate (3 open models) | Lu et al., Anthropic, Jan 2026 [B5]; Chen et al. 2025 persona vectors [B6] |
| E18 | Persona Selection Model: training episodes act as evidence about "what character this is", so narrow behaviors generalize into broad traits | Theory: framing generalizes | Weak to moderate (conceptual) | Marks, Lindsey, Olah, Feb 2026 [B7] |
| E19 | ChatDev ablation without roles: quality 0.395→0.221, executability 0.88→0.58. The authors credit role *specifications* ("prefer GUI", "careful for bug detection"). Unstructured chat caused role flipping | Positive for charter | Moderate (2023, single framework, roles entangled with specs) | Qian et al. 2023/2024 [C1] |
| E20 | MAST: 1,600+ traces, 7 frameworks. "Disobey role specification" 1.5%; disobeying the task specification 11.8%; step repetition 15.7%; reasoning–action mismatch 13.2%. Giving the ChatDev CEO the final say added +9.4% success | Role failures are rare but real; structure fixes them | Strong (taxonomy), Moderate (intervention) | Cemri et al. 2025 [C2] |
| E21 | A single agent with strong prompts nearly matches the best multi-agent discussion | Null for multi-agent role-play | Moderate | Wang et al. 2024 [C3] |
| E22 | Multi-agent gains range from +80.8% to −70% depending on task; sequential and tool-heavy work is hurt; decentralized designs amplify errors | Conditional | Moderate | Kim et al., Dec 2025/Apr 2026 [C4] |
| E23 | MetaGPT, CAMEL, AgentVerse: SOP-encoded roles and inception prompting stabilize collaboration; dynamic expert recruitment beats a single agent on their tasks | Positive, but confounded with SOP and structure | Weak to moderate | [C5][C6][C7] |
| E24 | Language confusion (replying in the wrong language) is worse with complex prompts, English-centric models, and high temperature; few-shot prompting mitigates | Risk for bilingual agents | Moderate | Marchisio et al., EMNLP 2024 [D1] |
| E25 | Multilingual LLMs route through English-like internal representations | Supports English prompts for non-English users | Weak to moderate | Schut et al. 2025 [D2] |
| E26 | Training a system-prompt hierarchy makes models prioritize system over user instructions with minimal capability cost | Supports putting boundaries in the system tier | Moderate | Wallace et al. 2024 [D3] |

Gaps: no peer-reviewed 2025–2026 study isolates persona effects on **multi-turn agentic coding with frontier models**. The coding-specific evidence (E9, E10, E12) is single-shot function synthesis. Treat transfer to the backend specialist as a hypothesis to measure, not a fact.

## 3. Product practice (what shipped agents do)

| Product | Identity line | Where the substance lives | Note |
|---|---|---|---|
| Anthropic docs | "Setting a role in the system prompt focuses Claude's behavior and tone" [P1] | Explicit instructions, tools, output format | Recommends a role but claims focus, not capability. Separate guidance targets overengineering and scope creep directly [P1] |
| Anthropic engineering | — | Prompts at the "right altitude": "specific enough to guide behavior effectively, yet flexible enough" [P2]. Delegation must state objective, output format, tools/sources, and task boundaries [P3] | Charter content beats character |
| Claude Code subagents | "You are a code reviewer…" [P4] | `description` says *when* to use; tool allow/deny lists; single responsibility | Identity is one clause; restriction happens through tools |
| Claude Code output styles | Style can change "role, tone, and response format" [P5] | Custom styles drop the built-in engineering instructions unless `keep-coding-instructions: true` | "It doesn't guarantee that something always happens or never happens" [P5]. Voice is a separable layer, and swapping it can silently remove the charter |
| Codex CLI | "You are Codex, based on GPT-5…" [P6] | Long behavioral rules. Since 2026-01-20, `model_personality` (pragmatic default / friendly / none) is injected through a template slot, per model family [P7] | The pragmatic voice explicitly avoids "cheerleading, motivational language, or artificial reassurance" [P8] |
| Cline | Was "a highly skilled software engineer with extensive knowledge…" plus a ban on "Great"/"Certainly" openers [P9]. Now "You are Cline, an AI coding agent." [P10] | Rules and tool protocol | Moved away from expertise flattery |
| Orchestra (upstream) | "You are Orchestra, the best coding agent on the planet." [P11] | Rules | Superlative framing. E1/E2/E13 suggest it adds nothing to accuracy and may inflate confidence |
| Amp | Optional `name` adds "You are <name>, a custom agent running in Amp." "Omit it to avoid adding a named identity to the prompt." [P12] | `instructions`, `tools`, `model` | Treats the name as an optional prompt input, separate from logs/UI metadata |
| Amp subagents | "Subagents are tools, too" [P13] | Task-scoped, condensed return | Early specialized subagents went unused; generic subagents with clear tasks worked better |
| GitHub Copilot custom agents | "You are a testing specialist focused on…" [P14] | Description (required), tools, ≤30k-char body | Role plus responsibility scope |
| Factory Droids | "You are the team's senior reviewer…" [P15] | Concrete checklist after the role line | Seniority framing (see E13 risk) |
| OpenAI GPT-5/5.1 guides | Personas recommended mainly for customer-facing emotional tone [P16] | Explicit verbosity, preambles, eagerness controls. Contradictory prompts "can be more damaging to GPT-5 than to other models" [P17] | Persona as UX, not capability |

Pattern: the field converges on **one functional identity sentence + rules + tools + output contract**, with tone as an optional, swappable layer.

## 4. Persona vs charter: sorting the components

| Component | Effect on task performance | Evidence | The backend specialist verdict |
|---|---|---|---|
| Functional role ("backend implementation specialist") | Small, model-dependent. Mostly helps by focusing attention and by mapping onto the orchestrator's routing | E1–E3, P1, P4 | **Include**, one sentence |
| Decision rights (what the backend specialist decides vs escalates) | Positive: unclear rights cause role violations and premature termination; fixing them structurally adds success | E19, E20, P3 | **Include**, core of the charter |
| Competence boundary plus a named escalation target per boundary | Positive: prevents task derailment and role flipping | E19, E20 (FM-1.2, FM-2.3) | **Include** |
| Return contract, stop conditions, and evidence duty | Positive: verification gaps (FM-3.x) are common | E20, P3 | **Include** |
| Epistemic stance (evidence over assertion; report conflicts; no confidence adjectives) | Positive for calibration and anti-sycophancy | E13–E15 | **Include** as behavior, not as a trait |
| Tone (terse, factual) | Mostly UX. Brevity lowers cost, and verbosity is controllable | P5, P8, P16 | **Include**, short, separate layer |
| Display name | Cosmetic for users. As a *prompt input*, it can shift results on some models | E3, P12 | **Keep out of the canonical charter**, inject only for self-reference |
| Expertise superlatives ("world-class", "best", "senior") | No accuracy gain; can inflate stated confidence; can hurt in combination with other constraints | E1, E2, E9, E13 | **Omit** |
| Personality traits (warm, enthusiastic, agreeable), emotions, backstory | No capability gain; agreeableness predicts sycophancy; adds drift surface | E14, E16, E17 | **Omit** from the subagent charter |
| Demographic or human attributes (gender, nationality, age) | Bias, stereotyped refusals, leakage into code | E8, E10 | **Omit** absolutely |
| "Never" lists without definitions (e.g. "no self-review" next to "run checks") | Contradictions cost reasoning tokens and invite inconsistent behavior | P17 | **Rewrite** as defined terms |

## 5. Observations on the current backend specialist surface

Read-only, from `packages/orchestra/src/agent/prompt/backend.txt`, `packages/orchestra/src/maestro/roster.ts`, and `packages/orchestra/src/agent/agent.ts:294–300`:

1. **The prompt hardcodes "You are <default label>"** while `displayName` is meant to be configurable. If the label changes, the user sees one name and the model calls itself another. This also makes the canonical behavioral template depend on the label, which `README.md:205` already says to avoid.
2. **The routing description has almost no content.** `${displayName} native team specialist.` gives Maestro, or any model choosing an agent, no signal about *when* to pick the backend specialist. Shipped practice (P4, P14) makes the description the "when to use" contract.
3. **"run focused checks" and "Forbidden: self-review" sit side by side without definitions.** Gate execution is evidence production; acceptance belongs to Lucy and Maestro. Without saying so, models will resolve the overlap differently (P17).
4. **the backend specialist is told what it is forbidden to do but not what to do at the boundary.** MAST's fixes are structural ("who has the final say"). The backend specialist needs a defined exit: a HOLD or BLOCKED return naming the boundary and its owner (architecture → Bobby/Maestro, investigation → Jimmy, review → Lucy). It should neither silently comply nor silently refuse.
5. **Enforcement is already partly structural.** The `execution` profile denies everything except read/glob/grep/bash/edit, so delegation is impossible by tooling. That matches P5's warning that instructions are not guarantees. Scope and architecture boundaries are still prompt-only. Packet-scoped write paths, if the host supports them, would be the structural counterpart.

## 6. Recommended persona design for the backend specialist

Design principle: **a thin identity over a thick charter.** Every sentence should either change a decision the backend specialist makes or shape the return contract. Anything that does neither is presentation and belongs outside the canonical template.

### 6.1 Include

- **Functional identity (one sentence, no name, no superlative).** The backend specialist is the backend implementation specialist on the team, working inside one assigned packet. The orchestrator owns planning, scope, and acceptance.
- **Decision rights, split in two:**
  - The backend specialist decides local implementation details inside the packet's files and contract: naming, internal structure, which existing helper to reuse, test placement within the given acceptance.
  - The backend specialist never decides scope, architecture, public contracts, dependency additions (unless the packet allows them), or acceptance.
- **Boundary protocol.** When the packet is ambiguous, contradicts the source, or needs out-of-packet work, stop and return HOLD with the observed fact, the conflicting packet clause, and the role that owns the decision. Do not investigate beyond what is needed to establish the conflict.
- **Evidence duty, defined against "self-review".** Run the packet's gates and report raw results. Never claim the work is correct, complete, or approved. Acceptance is someone else's verdict.
- **Epistemic stance.** Report observations with file:line or command output. Separate observed facts from assumptions. No confidence adjectives ("robust", "fully", "guaranteed"). When the orchestrator or the user asserts something the source contradicts, report the contradiction instead of agreeing. This is the detached stance (E15), not a personality trait.
- **Return card shape** (already in the roster): implementation card, gates, diff receipt.

### 6.2 Omit

Name in the charter; "senior", "expert", or "world-class"; personality adjectives; enthusiasm or emotion; backstory; any human attributes; claims of memory ("I remember") that Atlas might not back; persuasion toward approval (already forbidden).

### 6.3 Tone by audience

| Audience | Register | Language | Shape |
|---|---|---|---|
| Orchestrator (Maestro, via task result) | Machine-readable first, prose second. No greetings, no narrative, no hedging adjectives | English always | Fixed card fields. HOLD/BLOCKED reasons use fixed codes plus one evidence line |
| User (direct conversation) | Terse, collegial, factual. One-line status updates during long tool runs. No cheerleading (P8). Name the boundary and the owner when declining out-of-packet work | Language of the user's latest message (pt-BR for the owner) | Short paragraphs or bullets. Identifiers, paths, commands, and error text stay verbatim |
| Artifacts (code, comments, commits, docs, test names, card field values) | Project conventions | English always, even inside a Portuguese conversation | — |

Language rule rationale: E24 shows wrong-language replies get worse with complex prompts, so the rule must be explicit and short, ideally with one bilingual example. E25 supports keeping the system prompt in English. The artifact rule matches the repo convention. Restate the rule at compaction or in the summary prompt, because drift is cumulative (E16).

### 6.4 Display name handling

- Canonical charter: name-free ("the backend implementation specialist").
- Presentation layer: an optional single line such as "When referring to yourself in user-facing text, use the name {label}." This is injected after the charter and kept out of the behavioral hash. It is the same split as Amp's optional `name` (P12) and README line 205.
- Agent `description` (routing): role-bearing and label-independent, e.g. "Backend implementation inside an assigned packet; returns implementation card, gates, diff receipt. Not for investigation, architecture, or review." The label goes only in `name`.

### 6.5 Multi-model handling

Persona effects differ in sign across models (E2 Gemini exception, E9 GPT-4o family, E10 Gemini vs GPT-OSS). So keep the identity surface minimal to shrink the variance, keep the charter identical across families, and allow **per-family voice overrides only** (verbosity, update cadence), as Codex does with per-model personality templates (P7) and Anthropic does with per-model verbosity notes (P1).

## 7. Risks

| Risk | Mechanism | Mitigation |
|---|---|---|
| Name-induced variance | A configured label is an irrelevant attribute (E3) | Name-free charter; A/B the label line per model family |
| Overconfident cards | Expert or seniority framing raises stated confidence (E13) | No seniority words; evidence-only completion language; acceptance reserved to Lucy/Maestro |
| Sycophancy toward orchestrator or user | Agreeable tone (E14); authority pressure | Detached stance clause; "report contradiction" rule; no warmth traits |
| Role flipping (the backend specialist acting as reviewer or architect when the user asks directly) | FM-1.2/FM-2.3 (E20); ChatDev role flipping (E19) | Boundary protocol naming the owner role; tool denial for delegation; packet-scoped writes if available |
| Persona or rule drift in long sessions and after compaction | E16, E17 | Short charter; orchestrator restates boundaries per packet; compaction preserves charter clauses |
| Contradictory rules | "Run checks" vs "no self-review" (P17) | Define terms: gates = evidence, review = verdict |
| Wrong language | Portuguese in code or commits, or English replies to the owner (E24) | Explicit audience/artifact language table plus one example |
| Silent loss of the charter when a voice layer is swapped | Claude Code output styles drop engineering instructions by default (P5) | Voice is additive only; the charter is never replaceable by a style |
| Anthropomorphic claims | "I remember/feel" misstates Atlas-backed memory | Omit; cite Atlas record provenance instead |
| Over-investing in persona | No capability evidence (E1, E2, E21) | Cap the identity at one sentence; spend prompt budget on the charter |

## 8. Options for the owner

**O1 — Identity form**

- **A (recommended):** Name-free functional identity in the charter, plus an optional label line for self-reference. Lowest variance, hash-stable, rename-safe.
- **B:** A templated named identity ("You are {label}, the backend implementation specialist…"). More conversational presence for the user. Accepts the E3 name risk, which should be measured.
- **C:** A rich persona (values, personality, as in Codex pragmatic). Not recommended for a subagent. If wanted, offer it only as an optional user-facing voice layer (O3), never in the charter.

**O2 — Language policy**

- **L1 (recommended):** Reply to humans in the language of their latest message; orchestrator cards and all artifacts in English.
- **L2:** Fixed configured human language (pt-BR) regardless of the message language. Simpler, but wrong for English-speaking collaborators.
- **L3:** English everywhere. Lowest confusion risk, worst owner UX.

**O3 — Voice**

- **V1 (recommended):** A single pragmatic, terse voice shared by the roster.
- **V2:** A user-selectable voice overlay (terse / explanatory), additive to the charter, like Codex `model_personality` or Claude Code output styles with coding instructions kept.

**O4 — Validation before freezing** (recommended in any case)

A small eval per model family on real packets:

- arms: no-label vs label; seniority word vs none;
- metrics: gate pass rate, scope/role violations (e.g. The backend specialist asked directly to "review this"), HOLD correctness on contradictory packets, sycophancy probes (orchestrator asserts a false repo fact), wrong-language rate, and tokens per card.

**O5 — Routing description**

- Replace `${displayName} native team specialist.` with a role-bearing, label-independent description for all roster members. This is cheap and supported by P4 and P14.

## Sources

Academic (retrieved 2026-10-05; publication dates from arXiv or venue pages)

- [A1] Zheng, Pei, Logeswaran, Lee, Jurgens. "When 'A Helpful Assistant' Is Not Really Helpful: Personas in System Prompts Do Not Improve Performances of LLMs." EMNLP Findings 2024; v3 2024-10-09. https://arxiv.org/abs/2311.10054 — "adding personas in system prompts does not improve model performance"; "automatically identifying the best persona is challenging".
- [A2] Basil, Shapiro, Shapiro, Mollick, Mollick, Meincke. "Prompting Science Report 4: Playing Pretend: Expert Personas Don't Improve Factual Accuracy." 2025-12-05. https://arxiv.org/abs/2512.05858 ; https://gail.wharton.upenn.edu/research-and-insights/playing-pretend-expert-personas/
- [A3] Araujo, Röttger, Hovy, Roth. "Principled Personas: Defining and Measuring the Intended Effects of Persona Prompting on Task Performance." EMNLP 2025. https://arxiv.org/abs/2508.19764 ; https://aclanthology.org/2025.emnlp-main.1364/ — "models are highly sensitive to irrelevant persona details"; mitigations "only work for the largest, most capable models".
- [A4] Kong et al. "Better Zero-Shot Reasoning with Role-Play Prompting." NAACL 2024; v 2024-03-14. https://arxiv.org/abs/2308.07702
- [A5] Kim, Yang, Jung. "Persona is a Double-Edged Sword…" Findings IJCNLP-AACL 2025. https://aclanthology.org/2025.findings-ijcnlp.51/ ; https://arxiv.org/abs/2408.08631
- [A6] Salewski et al. "In-Context Impersonation Reveals Large Language Models' Strengths and Biases." NeurIPS 2023. https://arxiv.org/abs/2305.14930
- [A7] Xu et al. "ExpertPrompting: Instructing Large Language Models to be Distinguished Experts." 2023-05-24, rev. 2025-03-05. https://arxiv.org/abs/2305.14688
- [A8] Gupta et al. "Bias Runs Deep: Implicit Reasoning Biases in Persona-Assigned LLMs." ICLR 2024. https://arxiv.org/abs/2311.04892
- [A9] Jadhav et al. "Compound Prompt Constraints in LLM Code Generation: A Factorial Study of Format, Persona, and Urgency." 2026-09-02. https://arxiv.org/abs/2609.03156 — "the largest interaction is -12.2 pp on GPT-4o-mini".
- [A10] Gupta, Figueiredo, Machado, Wright, Beschastnikh, de Souza, Rodríguez-Pérez. "When Who You Are Can Change the Code You Get." 2026-08-12. https://arxiv.org/abs/2609.22102
- [A11] Xiao et al. "When Does Persona Prompting Actually Help?" 2026-05-28. https://arxiv.org/abs/2605.29420 — "role prompting systematically increases expertise depth while reducing clarity".
- [A12] "Personality-Guided Code Generation Using Large Language Models." ACL 2025. https://arxiv.org/abs/2411.00006
- [B1] "Do Language Models Mirror Human Confidence? Exploring Psychological Insights to Address Overconfidence in LLMs." ACL Findings 2025. https://arxiv.org/abs/2506.00582v2 ; https://aclanthology.org/2025.findings-acl.1316.pdf
- [B2] Shah, Mishra, Silpasuwanchai. "Too Nice to Tell the Truth: Quantifying Agreeableness-Driven Sycophancy in Role-Playing Language Models." 2026-04-12. https://arxiv.org/abs/2604.10733 — "agreeableness functions as a reliable predictor of persona-induced sycophancy".
- [B3] Hong, Byun, Kim, Shu, Choi. "Measuring Sycophancy of Language Models in Multi-turn Dialogues." EMNLP Findings 2025. https://arxiv.org/abs/2505.23840 — "adopting a third-person perspective reduces sycophancy by up to 63.8%".
- [B4] Li et al. "Measuring and Controlling Instruction (In)Stability in Language Model Dialogs." COLM 2024. https://arxiv.org/abs/2402.10962 — "attention decay over long exchanges".
- [B5] Lu, Gallagher, Michala, Fish, Lindsey. "The Assistant Axis: Situating and Stabilizing the Default Persona of Language Models." 2026-01-15. https://arxiv.org/abs/2601.10387
- [B6] Chen, Arditi, Sleight, Evans, Lindsey. "Persona Vectors: Monitoring and Controlling Character Traits in Language Models." 2025-07-29. https://arxiv.org/abs/2507.21509
- [B7] Marks, Lindsey, Olah. "The Persona Selection Model." Anthropic Alignment, 2026-02-23. https://alignment.anthropic.com/2026/psm/
- [C1] Qian et al. "ChatDev: Communicative Agents for Software Development." v5 2024-06. https://arxiv.org/abs/2307.07924 (ablation Table 4) — "role flipping, instruction repeating, and fake replies".
- [C2] Cemri et al. "Why Do Multi-Agent LLM Systems Fail?" 2025-03-17, rev. 2025-10-26. https://arxiv.org/abs/2503.13657 — FM-1.2: "Failure to adhere to the defined responsibilities and constraints of an assigned role".
- [C3] Wang et al. "Rethinking the Bounds of LLM Reasoning: Are Multi-Agent Discussions the Key?" 2024-02-28. https://arxiv.org/abs/2402.18272 — "a single-agent LLM with strong prompts can achieve almost the same performance".
- [C4] Kim et al. "Towards a Science of Scaling Agent Systems." 2025-12-09, rev. 2026-04-08. https://arxiv.org/abs/2512.08296
- [C5] Hong et al. "MetaGPT." rev. 2024-11-01. https://arxiv.org/abs/2308.00352
- [C6] Li et al. "CAMEL." NeurIPS 2023. https://arxiv.org/abs/2303.17760
- [C7] Chen et al. "AgentVerse." 2023. https://arxiv.org/abs/2308.10848
- [D1] Marchisio et al. "Understanding and Mitigating Language Confusion in LLMs." EMNLP 2024. https://arxiv.org/abs/2406.20052
- [D2] Schut, Gal, Farquhar. "Do Multilingual LLMs Think In English?" 2025-02-21. https://arxiv.org/abs/2502.15603
- [D3] Wallace et al. "The Instruction Hierarchy." 2024-04-19. https://arxiv.org/abs/2404.13208

Product and vendor (retrieved 2026-10-05)

- [P1] Anthropic, Prompting best practices, "Give Claude a role"; overeagerness. https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices (redirect from docs.claude.com …/system-prompts) — "Setting a role in the system prompt focuses Claude's behavior and tone".
- [P2] Anthropic, "Effective context engineering for AI agents," 2025-09-29. https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- [P3] Anthropic, "How we built our multi-agent research system," 2025-06-13. https://www.anthropic.com/engineering/multi-agent-research-system — subagent misreads when the task is "vague enough that subagents misinterpreted the task".
- [P4] Claude Code, Subagents. https://code.claude.com/docs/en/sub-agents
- [P5] Claude Code, Output styles. https://code.claude.com/docs/en/output-styles — "It doesn't guarantee that something always happens or never happens."
- [P6] OpenAI Codex, `codex-rs/core/gpt_5_codex_prompt.md` (main). https://github.com/openai/codex/blob/main/codex-rs/core/gpt_5_codex_prompt.md
- [P7] OpenAI Codex commit 714151e "feat(personality) introduce model_personality config (#9459)," 2026-01-20. https://github.com/openai/codex/commit/714151eb4ead7f6e29ada12402efbb009e9bae76
- [P8] OpenAI Codex, `codex-rs/core/templates/personalities/gpt-5.2-codex_pragmatic.md`. https://github.com/openai/codex/blob/main/codex-rs/core/templates/personalities/gpt-5.2-codex_pragmatic.md — "avoiding cheerleading, motivational language, or artificial reassurance".
- [P9] Cline v3.0.0, `src/core/prompts/system.ts` lines 10, 842. https://github.com/cline/cline/blob/v3.0.0/src/core/prompts/system.ts
- [P10] Cline main, `sdk/packages/shared/src/prompt/system/act.ts` (last commit 2026-09-15). https://github.com/cline/cline/blob/main/sdk/packages/shared/src/prompt/system/act.ts
- [P11] Orchestra upstream, `packages/orchestra/src/session/prompt/anthropic.txt` (dev). https://github.com/sst/opencode/blob/dev/packages/orchestra/src/session/prompt/anthropic.txt
- [P12] Amp, Plugin API (`CreateAgentConfig.name`). https://ampcode.com/manual/plugin-api — "Omit it to avoid adding a named identity to the prompt."
- [P13] Amp, "Agents for the Agent," 2025-06-10. https://ampcode.com/notes/agents-for-the-agent
- [P14] GitHub, Custom agents configuration. https://docs.github.com/en/copilot/reference/custom-agents-configuration
- [P15] Factory, Custom Droids. https://docs.factory.com/cli/configuration/custom-droids
- [P16] OpenAI, GPT-5.1 prompting guide. https://developers.openai.com/cookbook/examples/gpt-5/gpt-5-1_prompting_guide
- [P17] OpenAI, GPT-5 prompting guide. https://developers.openai.com/cookbook/examples/gpt-5/gpt-5_prompting_guide — contradictory prompts "can be more damaging to GPT-5 than to other models".

Local files read (read-only): `packages/orchestra/src/agent/prompt/{backend,maestro,lucy}.txt`, `packages/orchestra/src/maestro/roster.ts`, `packages/orchestra/src/agent/agent.ts:280–310`, `specs/backend-specialist/README.md`, `specs/backend-specialist/research/{02-claude,11-devin,14-other-competitors,27-agent-failures}.md`.
