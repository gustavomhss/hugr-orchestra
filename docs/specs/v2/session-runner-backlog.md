# Session runner historical backlog

This checklist was moved from the runner's source header. It is historical planning material, not a current completeness claim; check each item against the implementation before scheduling it. Current runtime-context parity lives in [session.md](session.md).

## Session ownership and controls

- [x] Coordinate one local active drain per Session; explicit resumes join and prompt wakeups coalesce.
- [ ] Replace local ownership with durable multi-node ownership when clustered.
- [ ] Mark busy, retrying, idle, interrupted, or terminal-failure status durably.
- [ ] Honor interruption and reject stale work after runtime attachment replacement.
- [x] Honor optional agent step limits.
- [ ] Bound provider retries and repeated identical tool calls.

## One provider turn

- [x] Translate every projected V2 Session message variant into canonical `@orchestra/llm` messages.
- [ ] Resolve policy-filtered built-in, MCP, plugin, and structured-output tool definitions.
- [x] Stream exactly one `llm.stream(request)` provider turn.
- [x] Persist assistant text and usage events incrementally as they arrive.
- [ ] Persist snapshots, patches, and retry notices incrementally as they arrive.
- [x] Persist reasoning, provider errors, and tool-call events incrementally as they arrive.

## Tool settlement and continuation

- [x] Durably record each tool call before side effects begin.
- [x] Authorize and execute recorded local calls through a core-owned registry hook.
- [x] Persist typed success, failure, and provider-executed tool outcomes.
- [x] Start each recorded local call eagerly and await all settlements before continuation.
- [ ] Add scoped runtime context, progress updates, attachment normalization, plugins, and cancellation settlement.
- [x] Reload projected history and start the next explicit provider turn after local tool results.
- [x] Continue for durable user steering accepted during an active provider turn.
- [ ] Continue for compaction or another continuation condition when required.

## Post-run maintenance

- [ ] Settle final status and expose durable output events to replayable consumers.
- [ ] Coalesce streamed deltas and add covering projected-history indexes.
- [ ] Update title, summaries, compaction state, and cleanup in bounded background work.

Keep the runner as orchestration over smaller collaborators rather than rebuilding the legacy monolith. Tool execution and continuation remain Session-owned. Durable continuation recovery requires a separate design with an explicit retry policy.
