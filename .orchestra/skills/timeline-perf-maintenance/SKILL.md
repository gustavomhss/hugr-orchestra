---
name: timeline-perf-maintenance
description: Streaming cost rules for the session timeline and the panels that derive from session parts (timeline/projection.ts, timeline/rows.ts, tasks-data.ts). Use before changing how rows or panel data are computed from messages and parts, or when a long chat janks while tokens stream.
---

# Timeline streaming cost

A streamed token changes one `text` or `reasoning` part. Anything that reads every part's text reruns on every token, and the cost grows with the length of the session. Keep the work proportional to the part that changed.

## Where it lives

- `packages/app-shell/src/pages/session/timeline/projection.ts`: `createTimelineProjection` builds rows one turn at a time (`mapArray` over user message ids, one memo per turn).
- `packages/app-shell/src/pages/session/timeline/rows.ts`: `Timeline.constructTurns` groups messages (structure only), `Timeline.constructMessageRows` builds one turn's rows, `Timeline.constructSessionMessageRows` is the one-shot composition of the two.
- `packages/app-shell/src/pages/session/tasks-data.ts`: `deriveTasks` reads task tool calls.

## Rules

1. Per-turn memo. A turn's rows are a memo of that turn only. A delta on the last message must not rerun the memo of an earlier turn. Do not add a memo that walks every message.
2. No full-text subscriptions in renderable checks. Row builders ask `PartProbe` (`renderable`, `reasoningHeading`), never `part.text` directly. The projection answers from a boolean memo per part, so a token reruns that memo and the turn rebuilds only when the answer flips (text goes from empty to non-empty).
3. Panels derive from tool parts. Anything that scans parts for a panel (tasks, process control, evidence, capabilities) reads tool parts only and keys its work by part id, so a text delta does not retrigger it. Never `flatMap` over all parts to find tool calls.
4. Row output is identical to the one-shot build. `reuseTimelineRows` keeps row identity; every row key includes the user message id, so per-turn reuse equals global reuse.

## Tests that hold the rules

- `packages/app-shell/test-browser/timeline-projection-streaming.test.ts`: projection rows equal a fresh `constructSessionMessageRows`, and after a delta on the last message no part of an earlier turn is read again (`reads` excludes earlier message ids).
- `packages/app-shell/test-browser/tasks-streaming.test.ts`: text deltas do not rerun `deriveTasks`; a tool call changing state does.
- `timeline/rows-current.test.ts` and `tasks-data.test.ts`: row and task output for fixture sessions.

Reactive tests must live in `test-browser/`. The `src/` unit run uses `--conditions=solid`, which loads solid-js' server build, where memos never recompute, so a reactive test there passes without proving anything.

When you change the projection, keep these green with `bun run test:ci app <files>`; the full suite is not needed.
