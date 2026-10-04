# Working-memory redesign: validation record

Runtime checkpoint: `dee4b28256356bbd6d9d0c087af719a385d03a8e` plus the recorded
test-only type fixes. Earlier exact-selector experiments are historical, not a
quality gate for this design. Current behavior is specified in
[working memory and transcript archive](context-continuity-memory.md).

## What changed

- The active artifact is Markdown working memory: discovery/result, original
  intent, causal why, current constraints, decisions, corrections and pending work.
- The complete available conversation-visible transcript is stored as immutable
  Markdown fragments with SHA-256 IDs and an own-session index. Large records split
  at Unicode-safe boundaries. Private reasoning is excluded; media remains metadata.
- The fork sees prior working memory plus newly displaced active history. Native
  compaction is respected rather than expanding its old raw prefix again.
- `context_recall` retrieves hashed Markdown pages and can list/search archived
  detail after a reference leaves active memory. Existing message/part lookup works.
- References may retire without deleting archive files. No per-scalar selector,
  dictionary renderer, six-field artifact or exact-retirement bookkeeping remains.
- Approximately 70% reduction is a soft target. There is no fixed 6,000-token
  memory cap. Whole-turn input batches and actual selected-model capacity bound
  requests; a 180-second operational deadline bounds stalled maintenance.

## Local mechanical validation

The integrated archive/memory/lifecycle/request/recall suite completed 177 cases
with no failures. Boundary and final-frame additions completed a focused 47-case
run with no failures; these overlap the earlier suite and are not summed as a
unique test count. Package typecheck then exited successfully after test-only
typing corrections. Logs remain under the persistent evidence root below.

Tests cover full captured text reconstruction, immutable hash mutation detection,
own-session isolation, missing/corrupt files, atomic index publication failure,
idempotence, same-process concurrent publishers and bounded per-operation directory
scans. Listing validates index metadata; reading verifies actual fragment bytes.
The store does not claim cross-process writer arbitration or power-loss durability.

Lifecycle coverage includes nonblocking parent calls, stale outputs, incremental
coverage, reference retirement/recovery, permission revocation, malformed/partial/
tool-attempting output, cancellation and next-job admission. Actual HTTP edit,
delete, revert/unrevert and session deletion entrypoints exercise invalidation.
Budgeted whole-turn batches retain unfinished native history. An indivisible turn
that exceeds admission capacity remains native instead of being silently truncated.

New tests exposed two cancellation defects, both repaired with discriminating
mutations: transport finalization was not joined by the old stream consumer; a
queued low-token refresh inherited a cancelled worker's interruption. Scoped pulls
now join transport cleanup, and queued dispatch is bound to the instance scope
with entry/generation/safe-boundary rechecks.

Applied memory also receives a final assembled-request capacity check after mutable
hooks, including system text, real converted tool schemas/descriptions, OAuth
instructions and response schema. It uses a serialized-input estimate, not exact
provider tokenization. Overflow enters the existing typed compaction/stop path
before SDK/native dispatch. Unmarked requests retain their existing behavior.

Cold acceptance review closed all five identified mechanical coverage gaps. A
separate archive-store review approved the reviewed scope. Neither proves broad
semantic quality; the live scenario below supplies narrower evidence.

## Real Luna continuation and recovery

A new frozen synthetic local-rehearsal scenario replaces the old trivia test for
this pilot. Its investigation disproves a database hypothesis and establishes a
stale generated cache. Recorded verification is read-only; no remediation happened
and deployment awaits approval. The reader must explain the diagnosis, preserve
intent/why and approval boundaries, propose the permitted next action, and retrieve
an exact receipt detail from the archive.

Frozen input hash:
`24ac2add18f9ae7e327bd053688540b45a110e983087d85d646689dd850635db`.
Offline gold hash:
`109e3636d21afe6bb14f756cea3c8508d55f0d454fd9ebdf14c32690e3279f4c`.
Exact model/API: `openai/gpt-5.6-luna` / `gpt-5.6-luna`, HTTP-only through the actual
production provider/fork and real own-session archive tool. Gold stayed offline.

The first attempt was rejected by the harness on an unexpected MIME header before
SDK parsing; its body was not preserved and its exact cause remains unknown. A
separate bounded transport control demonstrated that the installed SDK could parse
valid SSE despite the MIME mismatch. The new evaluation delegates parsing to that
SDK and verifies actual terminal/model/usage; JSON errors, HTML and partial streams
remain negative controls. The lost response was not repaired or graded.

The new evaluation generated a real accepted working memory. The full-history
baseline searched and read the archive, then answered correctly in substance.
However, the frozen question also demanded that the model echo the internal tool
call ID. The baseline returned descriptive call text instead, so its strict contract
failed. That failure and the original stopped evaluation remain unchanged.

After independent review, two previously unused candidate slots were used without
rerunning the producer/baseline, changing the question/settings/artifact, or repairing
outputs. The memory-based reader retrieved the exact archive reference and returned
the correct detail and permitted next action. It too failed the internal call-ID
echo requirement. Host-side call, argument, result and archive hashes nevertheless
bind the real retrieval independently of that model-authored field.

**Strict frozen benchmark: NOT PASS for both readers.**
**Independent goal-oriented semantic review: JUDGED PASS for this one scenario.**
These are separate findings. The question's internal-ID requirement exceeds the
core product intent but cannot be silently removed from an already executed test.

| Measurement | Full-history reader | Working-memory reader |
| --- | ---: | ---: |
| First provider input tokens | 17,153 | 2,985 |
| Raw SDK JSON `Token.estimate` | 18,423 | 3,324 |

Observed first-reader-input reduction: **82.60% provider tokens**, or **81.96%** using
the separate host character estimate. The completed producer cost **21,694 input /
916 output tokens** once. This is not an aggregate cost-saving claim: it excludes
amortization assumptions, and the failed first attempt has unknown billable usage.
The total authorization of eight forwards was exhausted across the failed attempt,
transport control, producer, baseline and candidate. No further call is implied.

The model retained the opaque nonce in memory as well as its reference; it was not
required to forget every literal. Retrieval credit comes from the actual tool read,
whose complete stored Markdown page was delivered to the next model request.
The reviewer found accurate intent, cause, corrected hypothesis, read-only scope
and pending state, with mild repetition but no investigation-log bloat. One noisy
fixture is not evidence of universal retention, relevance or savings.

## Source-built private Electron workflow

`memory-ui-v2/runs/memory-dee4b282-01/final-report.json` records
`FULL_PRIVATE_MEMORY_UI_V2_EXECUTED`. The actual DOM flow created a parent session,
selected agent/model, continued while maintenance was held, rejected stale output,
applied incremental memory, retired a reference, rediscovered it via archive listing,
and recovered the nonce with real Allow Once approvals. Parent Read, maintenance
tool rejection, partial failure, actual Stop, next Send, full durable history and
reload/Home reopening passed. No maintenance child session was persisted.

The UI provider was deterministic Chat Completions with synthetic threshold usage;
it is wiring evidence, not Luna quality or native HTTP UI proof. Its separate
production compiler/format controls reject planted mutations. Source/build hashes
matched before and after; cleanup used a positively calibrated OS group query and
verified only the owned process groups.

## Persistent evidence

Root: `/Users/gustavoschneiter/Documents/HuGR/_recovery/context-continuity-20261002/`.

- `working-memory-bundle-tests.log`, `working-memory-boundaries-final.log`,
  `working-memory-typecheck-completed.log`.
- `memory-archive-worktree/memory-archive-evidence/`, `memory-lifecycle-evidence/`,
  `memory-boundaries-evidence/`, `memory-capacity-evidence/`.
- `memory-quality-v2/`: original failed attempt and frozen scenario/gold.
- `memory-quality-v2-postflight/`: separate transport control and MIME diagnosis.
- `memory-quality-v2-eval2/MEMORY.md`: real model-generated memory; its run contains
  hashed transcript files, raw public receipts and original strict baseline failure.
- `memory-quality-v2-candidate-followup/`: unchanged-artifact candidate continuation
  using only the two unused slots; strict failures remain explicit.
- `memory-acceptance-review/semantic-review-candidate-eval2.md` and companion
  `.metrics.json`: independent semantic judgment and hash-bound measurements.
- `memory-ui-v2/`: private build, DOM captures, archive/reference/permission receipts
  and calibrated cleanup.

Quality source fingerprint:
`951ef1fa3e1bc51890c3c2ed722ecb42fa6a3ca8e1cf940af45208724afc8a36`.
UI full-source fingerprint (different scope):
`f1b6e6a51dcb8005b8229ed08931ca6db5f451aabf4173e5c3cfae672a38adb1`.
Real artifact file SHA-256:
`71e5eb06d263069f22cdc993d30a17ff902398405d27de24415afdf6edec51b0`.

Later documentation/test-only closure does not constitute another model run.
Current-head remote CI and merge authorization remain separate from this record.
