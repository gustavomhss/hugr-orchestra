# Context continuity replaces the legacy compaction

Status: 2026-10-06. Owner decision: continuity is the only compaction. The legacy summary no longer runs.

## 1. Why

A free replay of 10 real sessions (`script/continuity-bench/versus.ts`, dry transport, no model calls) ran them as
`prompt.ts` would with continuity enabled and the legacy compaction as the overflow fallback.

| Window | Sessions | Memory passes applied | Legacy compactions |
| --- | --- | --- | --- |
| 55k | 3 | 1 | 5 |
| 200k | 7 | 9 | 72 |

Continuity did about one reduction in nine. Two causes:

- It started only at the end of a turn. A long tool-call turn crossed the window in the middle, and the legacy
  compaction took over.
- When it did start, the native tail was cut only at a user message. In a long turn the tail alone left no ceiling
  (`no-ceiling`, `no-room`), so the pass was skipped.

The v3 and v4 benchmarks forced passes at fixed boundaries, so they measured memory quality but could not see this.

## 2. What changed

- **Two limits.** The configurable trigger (default 0.7) starts background maintenance at every finished step,
  tool-call steps included. The hard limit is `min(0.9 × window, input limit)`. It is not configurable: past it,
  `SessionContinuity.compact` runs before the next model request.
- **Tail cut between steps.** The tail is the last user turn that leaves 8 messages, when it fits 15% of the window.
  Otherwise the most recent steps that fit stay native, and at least the last message does. A tail that starts inside a
  turn opens with that turn's user message in the request.
- **Head clipping.** The producer sees each tool output clipped to 2,000 characters and each text part to 8,000. The
  archive keeps every byte, and exact values are still checked against the stored parts.
- **Recall.** Memory no longer needs `context_recall`. Recall only gates masking, because a stub must be restorable.
- **Last resort.** If the context is still past the hard limit after a pass, every old tool result the archive can
  restore is masked (`masking.urgent`). This needs no model call.
- **Provider overflow.** A provider overflow forces a pass. If nothing shrank, the step ends with
  `ContextOverflowError` instead of retrying forever.
- **Manual compaction.** `POST /session/:id/summarize` runs a forced pass.
- **Legacy path.** Legacy compaction tasks already stored in old sessions are still processed. Nothing creates new ones.

The same replay with this code, using the replay's real numbers:

| Session | Passes applied | Urgent masks | Still over the hard limit |
| --- | --- | --- | --- |
| 3 at 55k | 8 | 0 | 0 |
| 5 of 7 at 200k | 131 | 7 | 0 |

The two largest sessions first exposed head-transcript overflow (`input-limit`). This was fixed by the head clipping,
and those two still need a rerun after the clip.

## 3. One-shot quality check

Both methods compacted the same span of a real trace once, with one fresh Claude Sonnet subagent per request
(`script/continuity-bench/oneshot.ts`). Each output was then checked for the exact facts in the gold lists: IDs, hashes,
error strings, commands, paths and the user's literal rules.

| Trace | Span | Legacy | Continuity |
| --- | --- | --- | --- |
| Maestro dark-mode session | 81 messages | 15/19 (~1.7k tokens) | 16/19 (~3.9k tokens) |
| Codex auth debugging | 85 messages | 14/24 (~1.3k tokens) | 20/24 (~6.4k tokens) |
| **Total** | | **29/43 (67%)** | **36/43 (84%)** |

- The legacy summary dropped the exact `-wal` file names, `item_json`, the CLI version and the exact config error.
- Continuity lost 2 facts on the dark-mode trace. The producer joined two errors in one field, and the C8 exact check
  dropped that op. The prompt now says "one value or error per item … two errors are two failures".
- On the codex trace, the first continuity reply failed C6 (a quote spanning two sentences) and passed on its one retry.
  C6 still rejects the whole pass; dropping only the offending op, as C8 does, is the next change.
- The continuity memory is 2–5× larger than the legacy summary.

## 4. What we took from the legacy summary (round 2)

The legacy summary is far shorter and always says where the work stands: done, active, blocked, next move. Three changes
take that over without losing exact facts:

- **Plan first.** The plan renders right after the objective, open steps first: doing, waiting, verify, todo, then done.
  A new check, C14, rejects a memory that has an objective but no open step. The next move is always there, and
  waiting on the user counts.
- **Compact Activity.** Activity lists edits, failed commands and the 8 most recent commands. Older successful commands
  become one count per program, e.g. `22 earlier successful commands: sqlite3 ×14, ls ×8 (t4–t25)`. Every call is still
  one `context_recall` away.
- **Quotes over consecutive sentences.** C6 accepts a quote that runs over consecutive sentences and stores the whole
  sentences. Before, "Sem gambiarras. Temos que ir no problema irmao." failed a whole pass.

The same one-shot check, legacy unchanged:

| Trace | Legacy | Continuity round 1 | Continuity round 2 |
| --- | --- | --- | --- |
| Maestro dark-mode session | 15/19 (~1.7k) | 16/19 (~3.9k) | 18/19 (~4.3k) |
| Codex auth debugging | 14/24 (~1.3k) | 20/24 (~6.4k), one retry | 18/24 (~4.4k), no retry |
| **Total** | **29/43** | **36/43** | **36/43** |

- Round 2 needed no retry. It dropped nothing on the dark-mode trace (round 1 dropped 2 joined errors) and dropped 1 op
  on the codex trace.
- The codex memory shrank by 32%. Both memories now open with a plan that says what is in progress, what to verify and
  what is next. The codex one includes "tell the user honestly that the .bak databases were deleted".

## 5. Limits: prune early, no post-compaction ceiling (owner decision)

The owner set the shape: the protocol prunes the conversation continuously and keeps it in a sweet spot. It is not an
abrupt 700k → 10k cut. Most of a long context is noise (tool calls, logs); replacing a tool call and its output with a
one-line record of the action and its result already compacts most of it.

- **Trigger: 0.4 of the window** (default, configurable below the hard limit). Maintenance runs in the background.
- **Hard limit: 0.7 of the window**, or the input limit when the output reservation leaves less. It is not
  configurable; past it, a pass runs before the next model request. It replaces 0.9.
- **No post-compaction ceiling.**
  - The memory no longer has to fit `(trigger − 0.15) × window`, and it may be larger than what it replaces.
  - C12 and the `no-ceiling` / `no-room` skips are gone; the producer judges what stays.
  - The window still sizes the host-collected sections (verbatim user messages and Activity), so they do not grow
    forever. Older entries stay one `context_recall` away.
- **`context_compact` tool.**
  - The agent can call it at a milestone, when earlier work has gone stale. It runs a forced pass on the real context and
    returns the outcome.
  - The Maestro prompt decides when to call it (owned by the Maestro workstream).

The native tail cut (15% of the window, cut between steps in a long turn) stays: it decides what stays verbatim, not
how large the memory may be.

## 6. Continuous pruning by steps

The owner approved pruning that keeps the conversation small between memory passes.

- **Tail by steps.** Tool output in the last 5 assistant steps stays verbatim. Before, it was the last 5 user turns, so one
  long autonomous turn was never pruned until the hard limit.
- **Prune below the trigger.** Each time the context grows by 5% of the window (`PRUNE_STEP`), older tool output becomes a
  one-line record (`[masked tool result: <call> → <status>, ~N tokens; full output: context_recall …]`). Failures keep
  their first 20 lines. No model call is made. After the first batch, each batch rewrites only output that has just left
  the tail, so the cached prefix before it stays valid.
- **Attachments.** An inline file (image, PDF page) counts 1,600 tokens, not its base64 length, and a stub drops it.
  Before, a 2 MB screenshot counted ~530k tokens, so `compact()` saw the context over the hard limit and the memory was
  dropped as too large. Masking never freed the screenshot, because only the text output was counted.
- **Delegations in Activity.** Open delegations and the 8 latest returns stay listed. Older returns become one count per
  member, as older successful commands do.

Trade-off: the producer reads what the agent reads. A long successful output that was pruned before a pass shows only its
record, so a value that appears only there is not written to memory. It stays one `context_recall` away. Short outputs
and the last 20 lines of failures are still in the index.

The same replay of the 10 traces (`versus.ts` dry; head clipping included), with pruning off and on:

| Trace | Window | Passes off → on | Pruned batches | Tokens freed by pruning |
| --- | --- | --- | --- | --- |
| f-f0b5d8c0 | 200k | 52 → 52 | 87 | 758k |
| f-f0c3ddc4 | 200k | 41 → 40 | 86 | 780k |
| f-f0fde466 | 200k | 31 → 30 | 73 | 642k |
| f-maestro200 | 200k | 28 → 24 | 36 | 391k |
| f-f33fe530 | 200k | 10 → 10 | 26 | 196k |
| f-f2f68ffc | 200k | 10 → 9 | 14 | 169k |
| f-lgtv | 200k | 4 → 4 | 5 | 49k |
| codex, darkmode, lgtv | 55k | 8 → 7, 9 → 9, 9 → 9 | 5, 1, 0 | 2k, 0, 0 |

- **The two largest traces now fit.** f-f0c3ddc4 had 1,780 input-limit skips before head clipping; now its passes apply.
  f-f0b5d8c0 had 141 steps still over the hard limit, all caused by the screenshot; now it has none.
- **Pruning removes the noise, not the memory passes.** It frees 50k–780k tokens per long trace without model calls.
  Passes drop a little (up to 4 of 28), because the 40% trigger is still reached by growth that pruning cannot remove:
  the agent's own text, user messages and the protected outputs (delegation returns, todos, recall).
- **Still over in one place.** f-f0c3ddc4 opens with a 2.7 MB user message (a pasted file), larger than the window by
  itself. Nothing can cut a message in the native tail; the first pass covers it once the turn has steps. A real
  provider would reject that first request.
