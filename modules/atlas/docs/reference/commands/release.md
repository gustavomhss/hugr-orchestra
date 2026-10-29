# `atlas release`

Let a row that [`atlas hold`](./hold.md) kept out of promotion back in: the next [`promote`](./promote.md) pass presents
it again. It appends one `release` record to the review log `.atlas/project/review.jsonl`; the hold record stays in the log.

This page describes the **CLI** command `atlas release`. It is CLI-only (not an MCP tool).

## Invocation

```
atlas release <nodeKey> --by <actor>
```

- `<nodeKey>` — required. A row that is currently held; any other key is refused (exit `1`).
- `--by <actor>` — required. Who releases it; recorded in the log. Without it the command exits `1` and writes nothing.

The latest `hold` or `release` for a nodeKey wins, so a row can be held and released any number of times.

## Exit codes

| code | meaning                                                                  |
| ---- | ------------------------------------------------------------------------ |
| `0`  | the row is released                                                      |
| `1`  | a usage error: no `--by`, or the row is not held                         |
| `2`  | refused: the review log has a line that does not verify                  |

## Authority

`atlas release` binds `atlas-query` — it writes no knowledge, only a review record. It is not a `WRITE_PATHS` member.

## Related

- [`hold`](./hold.md) — keeps a staged row out of every promote.
- [`promote`](./promote.md) — the pass that reads the held set.
