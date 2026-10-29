# `atlas proposals`

List the open ratification proposals: every [`atlas propose`](./propose.md) record that no
[`atlas decide`](./decide.md) has closed, oldest first, each with its id, nodeKey, target tier, who proposed it, when,
and why.

This page describes the **CLI** command `atlas proposals`. It is CLI-only (not an MCP tool).

## Invocation

```
atlas proposals
```

No positional, no flag. It reads the review log `.atlas/project/review.jsonl` and writes nothing.

## Exit codes

| code | meaning                                                                     |
| ---- | --------------------------------------------------------------------------- |
| `0`  | the open proposals are listed (none is a valid answer)                      |
| `2`  | refused: the review log has a line that does not verify                     |

## Authority

`atlas proposals` binds `atlas-query` — a read; it writes nothing.

## Related

- [`propose`](./propose.md) — add a proposal.
- [`decide`](./decide.md) — close one.
