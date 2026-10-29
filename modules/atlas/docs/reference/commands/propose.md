# `atlas propose`

Propose a current fact for a stricter tier — `T1` (a rule) or `T0` (a core fact) — with a reason. A proposal changes
nothing in the store: it is one record appended to the review log `.atlas/project/review.jsonl`, and it waits until a person
decides it with [`atlas decide`](./decide.md). [`atlas proposals`](./proposals.md) lists the open ones.

This page describes the **CLI** command `atlas propose`. It is CLI-only (not an MCP tool).

## Invocation

```
atlas propose <nodeKey> <T1|T0> <reason...> --by <actor>
```

- `<nodeKey>` — required. A current fact in the governed projection (the key `atlas node` and `atlas query` print).
- `<T1|T0>` — required. The tier proposed; it must be stricter than the fact's tier today.
- `<reason...>` — required, one or more words. Why the fact should bind at that tier; kept with the proposal.
- `--by <actor>` — required. Who proposes (a reviewer seat or a person); recorded in the log.

Refused with exit `1`: no `--by`, a tier other than `T1`/`T0`, an unknown nodeKey, a retired fact, a fact already at that
tier or stricter, or a fact that already has an open proposal for that tier.

## Exit codes

| code | meaning                                                                     |
| ---- | --------------------------------------------------------------------------- |
| `0`  | the proposal is recorded and open                                           |
| `1`  | a usage error (see above)                                                   |
| `2`  | refused: the review log has a line that does not verify                     |

## Authority

`atlas propose` binds `atlas-query` — it writes no knowledge, only a review record. Proposing grants nothing: the tier
changes only when [`decide`](./decide.md) ratifies through the governed emit door.

## Related

- [`proposals`](./proposals.md) — the open proposals.
- [`decide`](./decide.md) — ratify or reject one.
