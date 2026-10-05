# Context Continuity: working-memory research digest (2026-10-05)

Inputs to the working-memory v4 design. Five parallel surveys: open-source agent memory schemas,
papers on memory structure, compaction techniques, text structuring and handoff protocols, and
long-term memory construction. Weak evidence is marked **[W]** (preprint, synthetic, few runs) or
**[P]** (vendor or practitioner claim).

## 1. Open-source schemas (sources cloned at the listed commits)

| System | Structure | Update model | Notable |
| --- | --- | --- | --- |
| Claude Code compact (Piebald-AI/claude-code-system-prompts e5c92fb) | 9 sections: intent, concepts, files, errors and fixes, problem solving, all user messages, pending, current work, next step | full rewrite | quotes the latest request verbatim; security constraints verbatim; lean variant: "only what they typed themselves", permissions "with the scope they gave it" |
| Claude Code session memory (removed 2.1.128) | Title, Current State, Task spec, Files and Functions, Workflow, Errors and Corrections, Docs, Learnings, Key results, Worklog | incremental edits into fixed headers; per-section token cap | "Always update Current State" |
| Codex compaction (codex-rs 7c2ce90) | progress and decisions; constraints; next steps; critical references | full rewrite | keeps recent user messages verbatim up to 20k tokens |
| Codex memories | task_outcome success/partial/fail/uncertain; preference signals as "the user said: '…' -> implication"; failures and how to do differently; numbered evidence references | consolidation under 10 KB | distinguishes observed evidence, user-authorized actions, implemented changes, proposals, hypotheses, uncertainty |
| OpenHands StructuredSummaryCondenser (0.40.0) | typed fields: user_context, completed_tasks, pending_tasks, current_state, files_modified, function_changes, tests_passing, failing_tests, error_messages, branch, commits, pr_status (draft/open/merged/closed/unknown) | full rewrite | booleans allow "unknown" |
| Cline SDK c00bf86 | Goal / State (Done, In Progress, Blocked) / Highlights / Next / Files | full rewrite | files computed by the host from tool calls and merged across summaries |
| Kilo/OpenCode anchored summary c0f038d | Objective / Important Details / Work State / Next Move / Relevant Files | merge rules: carry forward unmentioned items; conversation wins on conflict | every section rendered, "(none)" when empty |
| pi (pi-mono 28dcce2) | Goal / Constraints / Progress / Key Decisions / Next Steps / Critical Context | "preserve all existing, add, move" | host-computed read and modified files; truncated summaries rejected |
| Goose 7debb27 | JSON: user_intent, technical_concepts, files{path, summary, key_code}, errors_and_fixes, problem_solving (chosen/rejected/why), user_messages, pending_tasks, current_work, next_step | full rewrite | host renders JSON through a fixed, user-overridable template; "omit rather than invent" |
| Letta 0.16.8 | blocks {label, value, limit, description, read_only} | replace/insert/patch/rethink/finish_edits | writer sees chars_current/limit per block |
| Mem0 c93420c | v3 is add-only with linked_memory_ids; changes recorded as transitions | nothing overwritten | relative dates resolved against observation date |
| Graphiti 2a85bbb | edges {fact, episodes[] provenance, valid_at, invalid_at, expired_at} | contradiction invalidates, never deletes | bi-temporal |
| CrewAI 1133f16 | records {content, scope, categories, importance, source} | consolidation plan with reasons | |

No coding agent uses typed items with incremental operations; the memory systems handle
provenance, validity and history better than any compactor.

## 2. Papers on memory structure

- **Delta updates over rewrites.** ACE (arXiv 2510.04618): one full rewrite shrank an 18,282-token
  context to 122 tokens and accuracy fell from 66.7% to 57.1%, below the 63.7% no-context baseline.
  Mem0 and Memory-R1 use ADD/UPDATE/DELETE/NOOP.
- **Tombstones, not deletion.** Removing tombstones caused 16/16 exact replay failures [W]
  (arXiv 2609.20045). MEMAUDIT and Graphiti keep superseded facts with validity bounds.
- **Constraints are what compaction loses.** Claude Code `/compact` kept 53% of safety rules after
  one round and 10% after five; a type-aware compactor kept 96% over five (Compaction Cliff, arXiv
  2608.22752). Compactors kept 17% of user session constraints; a verbatim registry kept over 90%
  (arXiv 2608.11242). Violations rose from 0% to 78% over four compactions; pinning and verbatim
  re-injection brought them back to 0% (Governance Decay, arXiv 2606.22528).
- **Execution position, not facts, is the main loss** [W]. TRACE (arXiv 2608.06503): correct
  termination 44.6% with summaries vs 77.2% keeping the last turns.
- **ACON** (arXiv 2510.00615) converged on REASONING, VARS (name/value/purpose of runtime values),
  TODO, COMPLETED, GUARDRAILS. A cost-cutting pass with caps cut AppWorld from 42.3 to 32.7.
- **Artifacts are the weakest dimension** for every evaluated compactor: 2.19 to 2.45 out of 5
  (Factory probes [P]). Retrieval calls tripled when execution state was dropped while completion
  stayed flat (arXiv 2608.16370).
- **Over-structuring risk** [W]. A fixed JSON state scored slightly below free form; citation plus
  exact-recall pointers scored best (arXiv 2607.25066).
- **Hallucinated memory.** HaluMem (arXiv 2511.03506): extraction recall below 60% and accuracy
  below 62% for every system tested.

## 3. Compaction techniques

- **Deterministic first.** Observation masking matches or beats LLM summaries at about half the
  cost (Complexity Trap, arXiv 2508.21433). CliffCompaction (arXiv 2609.26779) keeps results of 500
  characters or less, turns calls into signatures, never re-compacts compacted text, and keeps
  86-98% cache hit rates because context is append-only between events. Clearing tool results before
  summarizing raised a structured summary from 42.7% to 52.0% (arXiv 2609.32961).
- **Re-readable vs non-reproducible.** File reads and greps can be re-run; command output at a
  moment, user messages and external responses cannot (CWL, arXiv 2606.11213).
- **Latest state wins** for files: an earlier read is superseded by a later read or edit.
- **Type-specific reducers** for tests, stack traces and logs, with the raw output archived.
- **Verification.** Deterministic anchor checks (paths, identifiers and error strings must appear
  in the source span); entailment checkers such as MiniCheck (arXiv 2404.10774) for model-written
  items.
- **Optimization.** ACON-style guideline updates or GEPA over paired success/failure continuations,
  scored with probes (recall, artifact, continuation, decision).
- **Token-level compressors** (LLMLingua) corrupt code and paths; KV-cache methods need self-hosting.

## 4. Text structuring and handoff protocols

Pending: survey still running.

## 5. Long-term memory construction

Pending: survey still running.
