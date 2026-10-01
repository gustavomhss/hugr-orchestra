# Context Continuity: Research and Design Rationale

Research date: 2026-09-30. This document supports the proposed
[fork contract](context-continuity-contract.md); it is not a claim that the
contract has already been implemented or achieved state-of-the-art performance.

## Decision

Treat the maintenance fork as a source-grounded state transformer, not a coding
agent that happens to receive a request to summarize. Give it a dedicated system
role and a mandatory, versioned protocol. Its output is a small typed artifact.
Keep exact material separate from compressed interpretation and operational
references. Use the existing conversation as the backing record.

This requires a prompt, one decoder/materializer, and source identity. A new
memory database, vector index, agent framework, or independently acting worker
is not justified by the observed failures.

## Primary Sources

| Source | Established guidance | Limit of the evidence |
| --- | --- | --- |
| [Anthropic: effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents), 2025-09-29 | Preserve high-signal decisions, unresolved work and implementation detail; maximize recall before removing superfluous content. References support just-in-time retrieval. System prompts should be concrete without becoming brittle rule inventories. | Engineering guidance, not proof of lossless summarization or a best universal format. |
| [Claude: background compaction](https://platform.claude.com/docs/en/build-with-claude/compaction-background), retrieved 2026-09-30 | Capture a prefix; continue work; replace exactly the summarized prefix and retain later appended turns. Failed compaction leaves history unchanged. | Its documented swap assumes append-only history and native compaction blocks. It does not license ignoring our edit/revert checks. |
| [Claude: keep recent turns](https://platform.claude.com/docs/en/build-with-claude/compaction-keep-recent-turns) | Keep recent turns verbatim; do not split a tool call from its result across the cutoff. | The application must still choose a suitable boundary. |
| [Claude: context editing](https://platform.claude.com/docs/en/build-with-claude/context-editing) | Old tool results can become explicit cleared placeholders while the client retains its recorded history. | A recorded preview is not necessarily the complete original output; native thinking compatibility has separate conditions. |
| [OpenAI: compaction](https://developers.openai.com/api/docs/guides/compaction), retrieved 2026-09-30 | Native compaction items carry opaque state. Standalone compact output is the canonical next window and must not be arbitrarily pruned. | An encrypted provider artifact is not an inspectable, cross-provider summary contract. |
| [Codex checkpoint prompt](https://github.com/openai/codex/blob/5aa92804d255dcaefe169dd7febb4006a2474e32/codex-rs/prompts/templates/compact/prompt.md) | Explicit assignment: "You are performing a CONTEXT CHECKPOINT COMPACTION." Produce a handoff for another LLM, covering progress, decisions, constraints, remaining work and critical references. | The short template does not itself establish byte-exact fidelity, citation validity or nonblocking fork isolation. |
| [Codex local compaction](https://github.com/openai/codex/blob/5aa92804d255dcaefe169dd7febb4006a2474e32/codex-rs/core/src/compact.rs) | Retains selected user messages with a token budget; whole retained text messages preserve their content parts and annotations. | Its retained-user-message strategy differs from our complete recent-turn tail. |
| [OpenAI: Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs) | Schema adherence improves shape reliability; required fields and closed objects make omissions and invalid enums detectable. | "Structured Outputs can still contain mistakes." Structure does not prove truth or completeness. |
| [LongMemEval](https://arxiv.org/abs/2410.10813v2), ICLR 2025 | Evaluate extraction, temporal reasoning, updates, multi-session reasoning and abstention separately. Indexing, retrieval and reading are distinct failure points. | Its datasets/models do not establish scores for Luna or this feature. |
| [LongMemEval-V2](https://arxiv.org/abs/2605.12493v1), 2026 work in progress | Evaluates compact evidence drawn from long trajectories; raw observations, events and strategy notes serve different retrieval roles. | A pre-collected environment-memory benchmark is not a live continuity implementation or a universal retention policy. |
| [Lost in the Middle](https://arxiv.org/abs/2307.03172v3), TACL 2023 | Evidence position changes retrieval/reading performance. Test beginning, middle and end, rather than only easy recent facts. | Older models and specific QA tasks; not proof that shorter context always improves accuracy. |

Codex implementation citations are pinned to commit
`5aa92804d255dcaefe169dd7febb4006a2474e32`. Live vendor documentation can change.

## What the Luna Measurements Actually Showed

The first synthetic history used 55,281 provider-reported input tokens for its
full-history answers. Thirty questions were graded offline against a frozen gold
register. Questions and gold were not supplied to the maintenance request.

| Variant | Baseline, three rounds | Candidate, three rounds |
| --- | --- | --- |
| Initial free-form prompt | 29 / 29 / 29 | 25 / 25 / 25 |
| More explicit preservation rules | Same recorded baselines | 27 / 28 / 28 |
| Additional scope/actor guidance | Same recorded baselines | 28 / 29 / 26 |
| Medium verbosity for maintenance | Same recorded baselines | 29 / 29 / 28 |
| Medium with a word target | Same recorded baselines | 29 / 28 / 27 |
| Head plus tail-reference experiment | Same recorded baselines | 27 / 29 / 28 |

Reused baseline receipts, requests and raw answers were byte-verified; they were
not described as newly executed calls. Parent-answer generation parameters stayed
unchanged. Gold and grading rules were not changed to improve scores.

The medium-verbosity variant lost a correction actor once, but introduced no
additional registered critical error in those three original-history pairs.
Its separate 71,741-token holdout failed the production 60-second summary timeout.
That attempt produced no valid artifact or candidate quality score.

A different, lower-verbosity variant answered the holdout 29/30 by strict matching,
versus 30/30 baseline. Its only mismatch was a terminal period on the same immutable
artifact rule. Independent semantic review found no change in that prohibition;
the strict score remains recorded separately from that judgment.

Both full-history and compacted readers shortened one original-history project
identifier. That shared reader error must not be misattributed solely to compaction.
It also means a good summary is insufficient if the resumed reader reconstructs
protected literals instead of using their exact values.

These are two synthetic histories, not a universal quality certification. The
unpublished prompt experiments and all failed attempts remain identifiable.

## Consequences for the Contract

1. **Identity precedes task data.** The model must know it is a maintenance fork,
   not the parent worker. Source instructions are records to preserve, not commands
   for the producer to execute.
2. **Exact material should be extractive.** Where possible, the model selects a
   source handle and the host copies the original literal or source unit. Asking
   a model to rewrite an identifier "exactly" still permits corruption.
3. **Status needs evidence and scope.** A completed invocation, a zero exit code,
   a reported success and verification of the requested objective are different.
4. **Correction provenance matters.** Preserve who corrected a claim, what was
   retracted, the replacement evidence, and the applicable task/branch/environment.
5. **Reference-only is an operational promise.** A citation for auditing is not
   automatically a retrieval capability available to the resumed model.
6. **Availability can expire.** Preserve essential observations before moving bulk
   content out of the active window. An expired handle must not remain labelled
   recoverable.
7. **Shape validation is necessary, not sufficient.** Schema, source membership,
   literal equality and freshness can be checked locally. Semantic completeness
   still requires adversarial and downstream evaluation.
8. **Budget pressure is a reason to decline, not corrupt.** Keep the parent context
   when critical content cannot fit. Do not silently remove qualifiers to satisfy
   an arbitrary word target.

## Verified Local Reference Constraints

In the candidate V1 path, `src/tool/truncate.ts` saves full received output to a
file and returns a bounded preview plus `outputPath` when limits are exceeded.
Its cleanup makes files older than seven days by modification time eligible for
removal. This is not a guaranteed minimum lifetime or an exact expiry timestamp.

`src/tool/shell.ts` supplies exit code, truncation flag and output path as metadata.
A completed shell tool can still represent a failed command. The maintenance
serializer currently omits these metadata fields.

The built-in tool list in `src/tool/registry.ts` exposes filesystem read/search,
but not a parent-session transcript recall tool. `Session.Service.getPart` is a
host API, not a capability the model automatically possesses. Accordingly, the
contract forbids pretending that message/part IDs alone make detail recoverable.

## Chosen Minimal Direction

Use strict JSON for the model-to-host boundary because this application needs to
reject ordinary resumed-work prose. Render the validated artifact into readable
historical context for the parent. JSON is selected for checkability, not because
the research demonstrates semantic superiority over Markdown.

Keep the mandatory method in a versioned, embedded maintenance protocol. Loading a
skill by model discretion cannot guarantee that the fork follows its contract.

The producer needs no execution tools when the snapshot contains its evidence.
If reference-only history recovery is enabled, provide one parent-only, scoped,
read-only recall capability using the existing conversation store. Until that
capability is operational, affected history references are provenance only.

Before adopting this contract, measure direct artifact fidelity, reference recovery,
reader correctness, repeated-compaction loss, latency and generation failures.
Token reduction alone is not the acceptance criterion.
