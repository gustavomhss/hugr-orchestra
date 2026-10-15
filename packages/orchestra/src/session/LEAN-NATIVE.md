# Standard native tool model projection (Lean 2.0)

The standard Orchestra V1 tools use the approved `hugr-lean@0.4.0` dependency after
native execution and baseline policy/plugin processing. Commands, permissions, exit
status, streamed metadata and lifecycle are not rewritten; only the model-visible
output text changes.

## Pipeline

1. Native ShellTool attests every real result with nonempty output (any exit code,
   timeout, truncation); `Tool.define` attests native `read`, `webfetch`, `glob` and
   `grep` results. Tool names or serialized metadata cannot impersonate either.
2. The lossless profile engine (`LeanProcessor`) runs first, exactly as in 0.2.0: only
   exit-0, complete shell output, within the whole-view budget.
3. Lean 2.0 `summarize()` then runs on that text: shell output above 4 KiB becomes
   head + tail + every failure block (kept whole when the command failed) with omission
   markers; `read` above 8 KiB is cut at a line with a `Use offset=N to continue` hint;
   `webfetch` above 8 KiB is capped; `glob`/`grep` and small outputs only get lossless
   compaction (ANSI, CR overwrites, repeats, path factoring).
4. A lossy summary first stores the complete approved original in the profile's
   `RawStore` (`<data>/lean/raw/<sha256(project, directory)>`, 64 MiB, 7-day TTL,
   oldest evicted when full) and ends with `[full output: lean recall <id>]`.
   Append-only policy text stays after it. Storage failure keeps the lossless text.
5. The native `lean_recall` tool returns that original byte for byte, or a 1-based line
   range. It is offered to every agent that can run `bash`, `read` or `webfetch`, except
   the discovery seat, whose research sources stay exact (no lossy summaries there).

## Configuration

Enabled unless explicitly disabled globally or for the Orchestra profile:

```json
{ "tool_output": { "lean": { "enabled": false } } }
```

Per-item toggles on the profile screen switch off both stages for that item: command
families (Cargo, Go, …), `Other shell commands` (compound or unattributed commands),
`Read`, `Web fetch`, `Glob` and `Grep`. Unknown config, unreadable preferences, wrong
owners, plugin mutations or budget refusal preserve the approved result.

The profile page's "Summarized when large" badge also applies to command families
without an item-specific filter, such as Bun and npm. With Lean enabled, their native
shell output still passes through the 4 KiB summary stage. Jest and Vitest may also
normalize terminal SGR formatting before that stage. Failure blocks from failed
commands stay in full; `lean_recall` recovers the complete stored original byte for byte.

## Persistence and metrics

SessionProcessor persists the selected output once; the next provider request and replay
reuse it. Each decision (`metadata.lean`) records bytes and estimated tokens before and
after, so the profile screen's KPIs include summaries. Decisions stamped by earlier engine
versions stay decodable.
