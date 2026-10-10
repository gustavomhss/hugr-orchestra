# Complete-prefix context continuity

Status: implemented; original feature bundle merged into `dev` on 2026-10-09. Validation below separates frozen-source evaluation, live GPT smoke, and scoped CI.

## Reason

The Warhammer benchmark exercised v4 memory successfully, but its first post-memory request still carried 46 assistant records. Its snapshot protected a complete user turn and its masking replaced outputs without removing completed tool calls or arguments. The owner rejected this result: completed history must become working memory; calls, results and noise belong in the recoverable archive.

Existing source snapshots and original compaction results are frozen externally in `warhammer-sol-20261007T120000/frozen-20261008T050043-v2`. Do not rerun the theme-building competitors. Reconstructed logical histories are not exact captured provider requests.

## Runtime contract

1. Capture a contiguous, session-owned prefix ending at a completed safe assistant step. No running or pending tool is included in covered history. Queued or executing input remains outside that coverage.
2. A successful complete-prefix artifact covers every message through that boundary. Its `coveredThrough` equals its `boundary`. There is no protected native tail within that covered prefix, no user-turn expansion, and no 32k prefix cutoff presented as complete coverage.
3. Publication requires durable archival of every covered source and all existing ownership, generation, backend-epoch, exact-quote, evidence and stale-history checks. Failed or cancelled production preserves the previous context and cannot claim successful coverage.
4. Active context contains working memory, the current real user request, and genuinely new/unresolved records after the captured boundary. Covered assistant text, reasoning, tool calls, tool arguments, results, screenshots and stubs are absent from the active history. Full sources remain recoverable through session-scoped `context_recall`.
5. New work arriving while a producer runs is explicitly outside its coverage. A complete-prefix result must not be described as covering those newer steps. Before reporting compaction complete at a request-admission boundary, settle or catch up that completed delta; preserve genuinely in-flight pairs without orphaning calls or inventing completion.
6. Memory carries objective and intent, literal standing rules/corrections, decisions and rejected alternatives, artifacts and exact operational values, observed outcomes, failure signatures and lessons, open work, and an explicit current cursor (`doing`, `next`, source aliases). Never rely on a large native tail to repair an outdated cursor.
7. The model context does not duplicate all historical user messages or an exhaustive tool/command trail. Render validated semantic items and a compact host-derived artifact/ongoing-work inventory. References point to archived source; long raw text is not copied back through another section.
8. Size is an observed result, not an arbitrary target or percentage reduction. Preserve useful information and actual authority/provenance. Do not promote tool/system observations to user authorization. Structural checks do not prove semantic completeness: frozen-source probes measure it independently.
9. Keep the configured soft trigger and model-derived hard admission bound. Masking remains a reversible pressure fallback while production is unavailable, but masking-only is not a successful complete-prefix compaction.
10. Support validated v4 persisted memory as a migration input; new complete-prefix artifacts use an explicit v5 discriminator. Do not reinterpret a partial v4 boundary as complete coverage.
11. Orchestra and Claude Code adapters must materialize the same coverage contract. Native SDK dependency repair cannot silently pull covered completed turns back into context. Unknown native shapes keep an explicit native-compaction fallback.
12. Maintenance failures retain structural failure classes (for example input budget, timeout, invalid output, archive, stale/backend change) without conversation content. A timeout or false input estimate cannot silently turn a failed pass into success or discard durable memory.
13. The producer has one 600-second abort deadline across model lookup and retries. Return and ownership release wait for confirmed transport cleanup. A blocked uninterruptible finalizer may extend elapsed time beyond 600 seconds; this is not a bounded teardown guarantee.

### Owner-approved deadline clarification

WAIVER (human-authorized) — strict 600-second total elapsed-time guarantee, including teardown
- Authorized by Gustavo, 2026-10-08: "Manter cleanup confirmado".
- Reason: aborting an Effect does not forcibly terminate an uninterruptible transport finalizer. Returning before it closes would release ownership without confirmed teardown.
- Contract: abort at 600 seconds, join cleanup, then report failure. Forced bounded teardown requires a separate transport-specific design; no orphaning or silent cleanup detachment.

## Acceptance evidence

- A long single-user turn containing dozens of completed steps produces zero covered assistant/tool records in the prepared model context.
- The producer sees the whole declared covered span, including a meaningful fact at the final completed step; input that cannot safely carry that span fails explicitly instead of publishing partial coverage.
- Pending/running tools, concurrent new users and post-capture completed steps are handled without orphan pairs, lost prompts, stale application or falsely broadened coverage.
- Old v4 memory restores safely and transitions to v5; old sources remain available by stable aliases and archive references.
- Host rendering does not reintroduce raw historical user/tool noise through ledgers, activity, arbitrary attachments or aliases.
- A current cursor contradicting the latest covered work is caught by meaningful source-based probes rather than hidden behind retained raw history.
- Real frozen benchmark sources exercise the production capture, producer, host decoder and context preparation code. Compare old baseline, new standalone context, and separately archive-assisted recovery using questions and gold facts fixed before seeing new output.
- Record visible-memory size, actual provider input/output/cache usage, retained native records and coverage, factual retention, contradictions, uncertainty and continuation quality. Do not conflate cumulative spending with context size or reconstructed payloads with exact historic wire bytes.
- Tests must fail when complete coverage, covered-record removal, current-cursor requirements or stale-result checks are deliberately broken. Run package typecheck and scoped tests; report local versus CI evidence separately.

## Observed validation

- The lead's final local continuity/Claude Code/recall scope passed 360 tests across 37 files, with no failures. Package `bun typecheck` and `git diff --check` passed. These are local results, not CI.
- Lead mutation probes reintroduced covered raw history and bypassed the prepared-prefix receipt signature. The projection test and eight receipt mutation tests failed respectively. Both mutations were restored, and the targeted nine-test scope passed afterward.
- Real `openai/gpt-6.1-sol` requests with reasoning `high` evaluated the same frozen 147-message continuity source and 170-message legacy source. Both v5 artifacts covered exactly through the safe boundary, retained zero covered assistant/tool records, and projected only the original current user request alongside memory.
- Rendered memory estimates were 9,364 and 10,225 tokens, without a prescribed output-size target. Both passes were accepted without a corrective retry; the legacy-source pass dropped one unverified exact-field operation.
- Standalone readers answered 24/28 and 20/28 frozen questions correctly and explicitly reported the remaining answers unknown. No incorrect answers or contradictions were detected in the source review. Both continuation plans were current and avoided repeating completed work.
- Separately supplying bounded archive spans yielded 28/28 and 27 correct plus one partial answer. This is a host-selected archive-assisted condition, not autonomous recall-tool verification.
- Some frozen questions concern opaque call identifiers, duplicated planning queries or long raw snippets. These counts are exploratory probe results, not a universal measure of information retention. No matched OLD reader calls were made, and historical wire bodies were not captured. Neither global superiority nor a SOTA claim is established.
- Evidence is retained externally under `warhammer-sol-20261007T120000/complete-eval-actual-20261008T191115/`: source/code hashes, accepted artifacts, consumer proofs, replies, source-grounded scores and lean actual-usage telemetry. Theme-building agents were not rerun.

## Live GPT 6 Luna smoke — 2026-10-09

The owner selected `openai/gpt-6-luna`. This run used Orchestra's OpenAI/ChatGPT OAuth transport,
not the Claude Code SDK adapter. Session: `ses_edeb7dd80ffey9ezDarZwSQwhD`.

- Eight real calls used the exact model: six parent turns, one continuity producer, one continuation.
- Compaction returned `applied`; the accepted artifact was version 5 with 12 covered sources,
  `coveredThrough === boundary`, and `now.src = ["a6"]`.
- The original raw prompt contained `ORCHID-GPT-9E37`. Actual continuation messages did not contain it;
  the working-memory system block did, with `contextMemory: true`. Continuation recalled the exact value.
- Covered assistant records were absent from the continuation projection. Compaction preserved durable
  history, and continuation preserved the full prior durable prefix.

### C15 instruction correction

The first live attempt failed C15 after its corrective retry, so no artifact was applied. The host
requires a completed assistant/tool alias from the exact boundary in `now.src`; the producer instructions
did not make that requirement explicit. Commit `3ba62b13f98c5f427a47349d6b1750ba5d52c298` aligns the
prompt, host index and failure diagnostic with that predicate. Complete-prefix retries request both `now`
and `ops`; partial v4 retries retain the ops-only instruction. The validation predicate is unchanged.
The successful live attempt used this patch and required no producer retry.

The regression verifies that the index advertises boundary aliases `a2` and `t1`, that each can satisfy
C15, and that earlier-only `u2` or `a1` cannot. Removing the alias instruction made its assertion fail;
restoring it passed. That mutation run also had an unrelated teardown timeout, excluded from the evidence.

Scoped CI [37954559865](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37954559865) tested
`contract-regressions.test.ts`, `complete.test.ts`, and `fork-replay.test.ts` against the patch snapshot:
**27 passed, zero failed, 289 assertions on each of Linux and Windows**. Package `bun typecheck` passed.
An independent read-only review found no blocking issues; it did not execute tests or approve a merge.

### Reproduction evidence and limits

Receipts, requests, producer replies, usage, harness and launcher are retained externally in
`continuity-gpt-live-20261009/{result.json,verification.json,events.jsonl,run.log,smoke.ts,launch.ts}`.
Receipts, harness, catalog, isolated model configuration and commit-verification record were also backed
up to the durable external archive `_worktrees/continuity-gpt-live-20261009.tgz`.
The isolated OAuth copy was removed after the run; raw logs and credentials are not part of this document.
The harness included `SessionProjector.node`, isolated HOME/XDG storage, and the real ModelsDev catalog.
OAuth auto-list filtering omitted the integer-major model name; isolated configuration declared the
catalog's exact GPT 6 Luna definition and limits. That production filter remains a separate issue.

This is a forced functional smoke. A one-step allowance constrained parent output; it is not a
near-context-limit stress test, matched benchmark, or global quality claim. GPT success does not validate
Claude Code native session-store materialization; that adapter's live smoke remained quota-blocked.
