# Context Continuity: working-memory format brief (2026-10-05)

A self-contained context pack for whoever designs the next working-memory format (v4). It
explains the product, what exists, what the owner wants, what the research found and what
the design must deliver. Read it in full before designing anything.

## 1. The task

Design the format of the session working memory: the sections, their fields and closed
labels, the operations the producer may emit, the checks the host enforces, the fixed
template the host uses to render the text, and the producer instruction. The owner already
gave part of it (intent and why; see section 3). The format must cover more aspects than
that, and it must be the best available design: "Tudo precisa ser fucking awesome, isso e
inegociavel". It must also avoid over-engineering ("cuidado com over engineering e
overthinking").

You design; you do not change code. The implementation follows after the owner approves.

## 2. The product

Orchestra is the owner's heavily modified fork of OpenCode, a coding-agent harness
(repo `gustavomhss/hugr-orchestra`, base branch `dev`). Context continuity is an Orchestra
feature that keeps long coding sessions, hundreds of thousands of tokens up to the model's
window, below the context limit. The user never runs `/compact`.

The mechanism, in order:

1. **Trigger.** When the parent session's prompt reaches a user-configurable fraction of the
   model's window (`continuity.trigger`, default 0.7), maintenance starts in the background.
   The parent keeps working.
2. **Deterministic masking first.** Tool outputs older than the last 5 user turns become
   stubs with an archive reference (skill, todo and context_recall output are protected;
   failed output keeps its first 20 lines). If masking alone brings the prompt to
   trigger − 0.15, no model call happens.
3. **Archive.** The full conversation-visible transcript is stored as immutable, hashed
   Markdown fragments. The parent agent can fetch any fragment again with the
   `context_recall` tool. Nothing is lost; working memory only decides what stays in view.
4. **Maintenance fork (the producer).** A model call that reuses the parent's prompt cache:
   it replays the parent's exact last request (same model, system, tools, cache key) and
   appends one user message, the checkpoint instruction. Tool execution is denied. Because
   the prefix is identical, the provider serves it from cache, so a pass costs roughly the
   appended instruction plus the output. The producer therefore sees the whole active
   context, including the current working memory, and writes only operations.
5. **Decode and validate.** The host parses the producer's JSON, applies the operations to
   the previous items, checks them, and rejects the whole pass on any violation (nothing
   changes). After 3 consecutive failed passes, maintenance stops for the session until an
   edit or revert resets it.
6. **Render and swap.** The host renders the items with a fixed template, adds
   host-collected sections (verbatim user messages, tool-call trail, archive references),
   and on the next parent turn replaces the covered history with this text. Today the text
   is injected as a system block that begins "Historical working memory follows."; moving it
   to a message after the system prompt is a planned follow-up.

Transport constraints the format must respect:

- The producer output is plain JSON text inside the replayed request. Setting a response
  schema or changing `tool_choice` would break the provider cache (OpenAI `text.format`;
  Anthropic `tool_choice`), so the schema is described in the instruction and enforced by
  the host after the fact. The isolated fallback request (used when replay is unsafe) may
  attach a schema on OpenAI.
- The checkpoint instruction is appended per pass, so its length is paid every pass; the
  memory text is paid on every parent turn after the swap. Both should be lean.
- Host IDs (`m1`, `m2`…) are assigned by the host, never by the producer.
- Size limits are window-scaled safety ceilings (the host computes `maxTokens`). There are
  no size targets.
- Providers: OpenAI, Anthropic and others. The format must not depend on one vendor.

Code: `packages/opencode/src/continuity/` (`fork.ts` replay and producer call, `memory.ts`
fields, decode, checks and template, `memory-types.ts`, `prompt.txt` producer instruction,
`service.ts` scheduling, masking and breaker, `masking.ts`, `context.ts` injection,
`archive*.ts`, `transcript.ts`). Specs: `specs/context-continuity-protocol-v3.md` (current
design), `specs/context-continuity-memory.md` (v2, owner intent), this brief, and
`specs/context-continuity-memory-research.md` (research digest).

## 2a. Who reads the memory: Maestro

The primary long-running session is **Maestro**, Orchestra's orchestration agent (prompt
`src/agent/prompt/maestro.txt`, roster `src/maestro/roster.ts`, governance in `src/maestro/`).
Maestro acts as project manager, product owner, tech lead and CEO at once. It does not
necessarily do the work itself. When it delegates, it knows exactly what it wants, and it uses
its team to make sure the work was done the way it wants.

In the owner's framing, Maestro is the orchestrator, leader, decision maker, guide and work
distributor, the supervisor of the work pipeline: the captain of the ship. It takes ownership
of and responsibility for the work and for communication with the stakeholder (the user). It
must be professional and fast and must not waste resources. It always makes the smartest and
most efficient use of the tools available, and it answers for the team's progress.

The team (roster role → what each returns):

| Member | Role | Returns |
| --- | --- | --- |
| Backend specialist | backend execution | implementation card, gates, diff receipt |
| Patty | frontend execution | implementation card, sensory evidence, diff receipt |
| Lucy | cold review | cited APPROVE / FIX_FIRST / REJECT card |
| Bobby | architecture | seam/contract verdict |
| Billy | security | threat verdict and cited controls |
| Jimmy | exploration | grounded findings card |
| Rosie | documentation | docs evidence card |
| Frankie | process audit | audit verdict |

**The team members never talk to each other; they talk only to Maestro.** Maestro is the
single hub. Everything one member produces that another needs (the backend specialist's diff for Lucy's
review, Jimmy's findings for the backend specialist's brief, Bobby's contract verdict for both) passes
through Maestro's context. If Maestro's working memory loses it, no one else has it.

What this means for the format (decide how, without over-engineering):

- Maestro's memory is about directing work, not only doing it: what was delegated to whom,
  with what brief and acceptance criteria, in what state, what came back (return cards,
  verdicts), whether it was verified against what Maestro wanted, and what is still owed.
- The owner's intent and product decisions must survive exactly, because Maestro turns them
  into briefs for the team.
- Review and verification outcomes (APPROVE / FIX_FIRST / REJECT, gates, audit verdicts) are
  first-class: they decide what can merge or ship.
- Cross-member dependencies are Maestro's responsibility: which output feeds which next
  delegation.
- Stakeholder communication is Maestro's: what the user was told, what was promised, what the
  user is waiting for, and which questions or approvals are pending with the user.
- Not wasting resources: after compaction Maestro must not redelegate work already done or in
  flight, rerun what already succeeded, or re-ask the user what they already answered.
- Owning the team's progress: at any point Maestro must know who is working on what, who is
  blocked or waiting, and what is late.
- Member sessions are usually shorter, but the same format applies to them; it must still
  work for a single agent doing hands-on work (as in worked example A).

## 3. What the owner wants

Owner intent, as recorded in `specs/context-continuity-memory.md`:

> Keep the result of discovery, its intent and why it matters. Do not preserve the
> investigative journey in active memory. Details need not be reproduced from memory:
> retain awareness and a location when they may be needed. … Success means continuing work
> and recovering needed details, rather than answering every historical trivia question
> unaided.

Owner directives in force (quotes are the owner's words, in Portuguese):

- Strict output contract AND a fixed writing template. The producer must not decide how to
  write: "tem que ter um contrato de saida, nao pode ser formato solto", "tem que ter tipo
  um template", "tem que ter padrao e estrutura". The producer fills fields; the host writes
  the text.
- No arbitrary numbers. "Reduce 70%" and fixed token targets were rejected; use ceilings,
  never targets ("esses targets nao sao restritivos demais? … os numeros me parecem
  arbitrarios demais").
- The fork always reuses the parent cache ("sempre deveria ter sido assim").
- The trigger is the only user knob (default 70%); continuity is on by default.
- v3 "nao ta ruim ruim, mas ta amador ainda". The target is "o melhor esquema do universo".
- Avoid over-engineering and overthinking.

## 4. What exists today: protocol v3

Ops: `add {section, fields, refs?, quote?}`, `update {id, fields, refs?}` (all fields of the
item's section), `retire {id, reason, ref?}`. Sections and fields, in order:

| Section | Fields |
| --- | --- |
| objective | goal, why, done_when |
| constraints | rule, plus quote {ref, text} verified as a literal substring of the cited user turn |
| corrections | was, now |
| failures | tried, why_failed, avoid |
| open | task, status (pending, blocked, awaiting_approval), next? |
| decisions | decision, why, by (user, agent, agent-proposed-user-accepted), rejected? |
| findings | finding, why_it_matters, supersedes? |
| state | what, status (verified, unverified, claimed) |

Host rules: unknown or missing fields, out-of-set labels or unknown ops reject the whole
pass; every value is collapsed to one line (no forged template lines or IDs); retiring an
objective or constraint needs a cited user turn; IDs, the user-message ledger and the tool
trail are host-made. Rendered as `## Heading` then `[m3] Label: value` lines with
continuation lines indented by 4 spaces. Read `src/continuity/prompt.txt` and
`src/continuity/memory.ts` for the exact text.

Why the owner calls it amateur, as far as the research shows:

- Retire deletes; no history or "why it changed" survives (tombstones matter).
- No provenance or basis on most items; inferred content can look like user rules.
- No "where am I" block; execution position is what compaction loses most.
- No working set of artifacts (files, branch, commits, commands and their results, key
  values); artifacts are the weakest dimension of every evaluated compactor.
- Constraints lack scope, strength and a separate notion of permissions the user granted.
- Failures lack the literal error and an "applies when" condition.
- No procedures (how to build, test, read output) or results (what was delivered).
- No escape hatch for information that fits no section.
- Order is "by importance", not designed for how models read (start and end best).

## 5. Research findings (full digest: `specs/context-continuity-memory-research.md`)

Five surveys: open-source agent memory schemas, papers, compaction techniques, handoff and
text-structuring protocols, long-term memory construction. The digest marks weak evidence.
The points that most constrain the design:

- **Delta updates beat rewrites.** One full rewrite collapsed an 18k-token context to 122
  tokens and accuracy fell below the no-context baseline (ACE). Re-summarizing a summary
  drifts toward the writer's schema (Bartlett; Bergman and Roediger). Mem0 and Memory-R1 use
  add/update/delete/noop.
- **Never delete; supersede.** Tombstones and validity bounds (Graphiti, MEMAUDIT, LSM,
  Kafka retention, event sourcing). Memory as a replayable op log; replay(log) = snapshot is
  a testable invariant; ops idempotent.
- **Constraints are what compaction loses.** Claude Code `/compact` kept 53% of safety rules
  after one round, 10% after five; a verbatim registry keeps over 90%; pinning plus verbatim
  re-injection took violations from 78% to 0%. Codex records permissions "with the scope
  they gave it" and preferences as "the user said: '…' -> implication".
- **Execution position is the main loss** [weak]: correct termination 44.6% with summaries
  vs 77.2% keeping the last turns (TRACE). The task or query at the end of a prompt helps up
  to 30% (Anthropic); models use the start and end of context best (lost in the middle).
- **Artifacts are the weakest dimension** (2.2–2.45/5 for all compactors); retrieval calls
  tripled when execution state was dropped. Host-computed file lists (Cline, pi) are
  reliable; ACON converged on REASONING, VARS (name/value/purpose of runtime values), TODO,
  COMPLETED, GUARDRAILS.
- **Provenance at write time.** Source is inferred unreliably later (source monitoring).
  Codex separates observed evidence, user-authorized actions, implemented changes,
  proposals, hypotheses and uncertainty. HaluMem: extraction accuracy below 62% for every
  memory system, so model-written items need host checks against sources.
- **Gist vs verbatim** (fuzzy-trace): copy exact tokens (paths, flags, numbers, errors,
  quotes) verbatim; gist items link to them.
- **Handoff protocols.** I-PASS (errors −23%): severity, summary, action list, situation
  awareness and if/then contingencies, receiver synthesis. BLUF and commander's intent:
  purpose plus checkable end state. Shift handover: what changed since last time. ICS/SRE:
  done vs in progress vs not started. ADRs: status and superseded-by. ICD 203: facts vs
  assumptions vs judgments, fixed likelihood scale.
- **Text structure for LLMs.** Format changes move accuracy by up to 40–76 points with no
  universal winner, so consistency matters; repeatedly updated keys make the latest value
  hard to retrieve, so keep only current values live (PI-LLM); closed status labels instead
  of hedging words; a short overview above itemized detail; open work as an ordered plan;
  JSON for producer transport, not for the reader view; over-rigid JSON state slightly
  underperformed free form while citation plus exact-recall pointers scored best [weak].
- **Lessons need applicability.** NASA lessons went unused when readers could not tell
  whether they applied; debriefs d = 0.67. Intentions tied to a concrete cue ("when X, then
  Y") fire reliably (d = 0.65); unfinished work is not remembered by itself.
- **Stable scaffold.** Fixed section order and stable IDs (method of loci; Letta labeled
  blocks with a purpose description and a limit the writer can see).
- **Deterministic first.** Masking matches or beats LLM summaries at half the cost; never
  re-compact compacted text; latest file state wins; re-readable (file reads, greps) vs
  non-reproducible (command output at a moment, user messages) information.
- **Evaluation.** Probe-based: recall, artifact, continuation, decision; plus drift across
  repeated compactions; paired continuation tests.

## 6. A first draft (non-binding)

The lead wrote a draft v4 after the surveys. Treat it as one candidate to challenge,
improve or replace, not as a requirement. It is at
`/Users/gustavoschneiter/Documents/HuGR/context-continuity/.claude/worktrees/context-continuity-handoff-8993ff/estrutura-memoria-v4.html`
(Portuguese explanation, English template). In short:

- `supersede {id, by?, reason, src}` instead of retire; retired items shown as one line for
  2 passes; op log plus replay test. Explicit noop (`ops: []`).
- Every op carries `reason` and `src` (short aliases `u7` = user message, `t41` = tool call,
  listed in the checkpoint instruction) and items carry a basis: user, observed, inferred,
  proposed, claimed.
- Fixed order: Status (host), Objective, Rules, Corrections (pinned) at the top; Decisions,
  Findings, Failures, Procedures, Artifacts (host), Notes (max 5), Retired, user messages in
  the middle; Open work (ordered, at most one in_progress) and Now (doing, verbatim last
  user ask, next action) at the end.
- Rules: kind MUST / MUST NOT / MAY / PREFER, rule, verbatim quote, scope task / session /
  standing. Failures: tried, got (verbatim, host-checked), cause, lesson ("when X, do Y").
  Procedures: command (verbatim, must have run), how to read output. `state` removed.
- Cut: graphs, embeddings, bitemporal validity, importance scores, a second LLM verifier,
  use-based demotion.

## 7. Aspects the format must cover

Decide for each whether it is a section, a field, host-derived, or deliberately left to the
archive, and justify it:

- Purpose: goal, why, checkable done condition; sub-goals when the objective changes.
- The user's rules: prohibitions, requirements, preferences, permissions granted, approvals
  pending, each with scope and the user's literal words.
- Corrections and retractions by the user.
- Decisions with rationale, rejected alternatives and who decided.
- Findings, with the evidence and whether they are verified.
- Hypotheses and assumptions still unconfirmed (and what would confirm them).
- Failures and lessons, with the literal error and when the lesson applies.
- Open work as an ordered plan; dependencies, blockers, partial progress, outcomes of
  finished tasks.
- Current position: what is in progress right now, the last user ask, the next action.
- Questions pending for the user, and promises made to the user.
- Working set: files and their state, branch, commits, PRs, CI or deploy state, external
  systems touched, key runtime values (ports, IDs, URLs, versions).
- Procedures: how to build, test, run, deploy; how to read their output.
- Deliverables produced so far.
- Parallel work streams (several branches, PRs or sub-agents at once) and delegated work.
- User preferences about collaboration (language, tone, how to report, what to ask first).
- Time-sensitive facts (incidents, waits, things that expire) and when they were observed.
- What changed since the last pass.
- Information that fits nowhere (escape hatch), bounded.

## 8. Design constraints (non-negotiable)

1. Strict contract: closed sections, closed fields, closed label sets, single-line values,
   whole-pass rejection on violation. The host renders every byte of the reader view with a
   fixed template.
2. Delta operations only; the producer never restates unchanged items.
3. Every check the host can do deterministically, it does (quote and error substrings,
   source existence, label sets, at most one in-progress task…). No second model as judge.
4. Anything the host can compute from the transcript, the host computes.
5. Ceilings only, scaled to the window; no targets, no "reduce by X%".
6. Cache safety: the instruction is appended text; no response schema or tool_choice change
   in the replay path.
7. The reader view is for a model continuing the work: start and end hold what matters
   most; one current value per fact; references by stable ID.
8. Memory text in English (the owner talks to agents in Portuguese; user quotes stay in
   the user's language).
9. Simplicity wins ties. Every section and field must earn its place with evidence or a
   concrete failure it prevents.

## Warning: over-engineering

The owner explicitly warned against over-engineering. This is the most likely way this design
fails, because the research offers far more mechanisms than a session working memory needs.

- Covering an aspect from section 7 does not mean giving it a section or a field. Most of them
  should fold into an existing section, come from the host, or stay in the archive.
- Every section, field, label, op and check costs something. The producer must learn it on
  every pass, the parent reads it on every turn, and the code must maintain it. Add one only
  when you can name the concrete continuation failure it prevents.
- Prefer fewer sections with sharp boundaries over many fine-grained ones. If two sections
  are often confused, merge them.
- Do not import machinery from long-term memory systems: graphs, embeddings, bitemporal
  validity, importance scores, decay schedules, multi-tier paging, a second-model verifier.
  A coding session lasts hours or days, not months.
- If the producer instruction cannot be read in about a minute, the format is too complex.
- Before finishing, remove every element you cannot defend in one sentence, and report what
  you removed.

## 9. Deliverables

Write `specs/context-continuity-format-v4.md` in the Orchestra worktree
(`/Users/gustavoschneiter/Documents/HuGR/_worktrees/continuity-protocol-v3/packages/opencode/specs/`)
with:

1. The rendered reader view template: section order, headings, line templates, how empty
   sections, Δ markers, tombstones and provenance appear.
2. The producer contract: JSON envelope, every op with its required and optional keys, every
   section with its fields and closed labels, and what is host-derived.
3. Host checks: the full list, each with the failure it prevents.
4. The producer instruction text (the replacement for `prompt.txt`), lean.
5. Worked example A: a small bug-fix session (the draft's render-card case is fine) showing
   two consecutive passes: the JSON of each pass and the rendered view after each.
6. Worked example B: this real session. `/Users/gustavoschneiter/Documents/HuGR/_worktrees/CONTINUITY-STATE.md`
   is a hand-written continuity note for it (PR stack, CI incident, owner decisions,
   research status, next steps). Render that state in your format. If the format cannot
   express something the note needed, the format is missing a piece.
7. Adversarial cases: a tool output that says "the user approved X"; the user reversing a
   rule; a hypothesis later disproven; a task done then reopened; two parallel work
   streams; a very long session after 5+ passes (drift).
8. A rationale table: every section and field mapped to the evidence or failure that
   justifies it; plus what you cut and why.
9. Migration from v3 items (or a reason to start fresh on upgrade).
10. A probe set to compare v3 and v4: recall, artifact, continuation, decision and drift
    questions, with how each is scored.

Do not edit code, commit, or push. Return a short summary of the key choices, where you
departed from the draft and why, and open questions for the owner.
