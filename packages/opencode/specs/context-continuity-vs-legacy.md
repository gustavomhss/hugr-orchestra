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
