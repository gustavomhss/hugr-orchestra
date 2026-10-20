# `atlas decide`

Decide an open ratification proposal. `reject` records the decision and its reason; the fact keeps its tier and the
rejection stays in the review log. `ratify` re-emits the fact at the proposed tier THROUGH the governed emit door — the
same truth, authorization and ratification gates every [`emit`](./emit.md) faces — and records the decision only when
the door accepts the write.

This page describes the **CLI** command `atlas decide`. It is CLI-only (not an MCP tool).

## Invocation

```
atlas decide <proposalId> <ratify|reject> <reason...> --by <actor>
```

- `<proposalId>` — required. The id [`atlas proposals`](./proposals.md) prints, or a prefix of at least 8 characters
  that matches exactly one open proposal.
- `<ratify|reject>` — required.
- `<reason...>` — required, one or more words; kept with the decision.
- `--by <actor>` — required. The person who decides; recorded in the log.

A ratification runs as the composed actor (`ATLAS_ACTOR`) and needs `ATLAS_RATIFY_TOKEN`: any ratifier name for `T1`,
and `billy` for `T0`. When the door refuses — no token, a fact that no longer re-derives, an actor outside the fact's
scope — nothing is written, the proposal stays open, and the door's own reason is printed (exit `2`).

## Exit codes

| code | meaning                                                                                   |
| ---- | ----------------------------------------------------------------------------------------- |
| `0`  | rejected, or ratified and re-emitted at the proposed tier                                 |
| `1`  | a usage error: no `--by`, a bad verdict, no reason, no open proposal with that id         |
| `2`  | refused: the emit door declined the ratification, the fact is gone, or the log is unreadable |

## Authority

`atlas decide` binds `atlas-emit`: `ratify` publishes governed knowledge through the existing emit door, so it is a
write command over an existing write path, not a new one. `reject` writes only the review record.

## Related

- [`propose`](./propose.md), [`proposals`](./proposals.md).
- [`emit`](./emit.md) — the door a ratification goes through.
