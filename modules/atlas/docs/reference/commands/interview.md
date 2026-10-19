# `atlas interview`

The ratification interview. Genesis only writes suggestions; a rule (`T1`) or a core fact (`T0`) needs a person, and
Atlas asks once: one batch of the questions that matter most, at most 20 per session, ranked by how much code depends
on the answer. The rest waits for the next session. Answer with [`atlas answer`](./answer.md); an answered question
drops out of the next batch.

This page describes the **CLI** command `atlas interview`. It is CLI-only (not an MCP tool).

## Invocation

```
atlas interview [--json]
```

- No positional. `--json` prints `{"batch": [...], "deferred": <count>}` instead of text: `batch` is the questions in rank
  order, each with `id`, `kind`, `subject`, `ask`, `rank`, `rankReason`, `site`, and `options` / `nodeKey` where they apply.

## The four kinds of question

| kind        | asked when                                                               | rank                          |
| ----------- | ------------------------------------------------------------------------ | ----------------------------- |
| `owner`     | a unit has no owner in `.atlas/policy.json`                              | files depending on the unit   |
| `tier`      | a `T2` fact's slot is `invariant`, `contract` or `security-property`     | files depending on it × 3     |
| `contested` | two or more live facts share one file and one slot                       | files depending × top tier weight (T0 3, T1 2, T2 1) |
| `intent`    | a unit has no `rationale` fact                                           | files depending on the unit   |

A unit is `packages/<name>`, `docs/<name>` or `harness/<name>`; other files share one root unit, which is not asked
about. "Files depending" is the reverse closure of the code index (`.atlas/index.scip`); with no index every rank is
`0`. Retired facts are not asked about.

## Exit codes

| code | meaning                                                                 |
| ---- | ----------------------------------------------------------------------- |
| `0`  | the batch is printed (an empty batch is a valid answer)                 |
| `2`  | refused: the review log has a line that does not verify                 |

## Authority

`atlas interview` binds `atlas-query` — a read; it writes nothing.

## Related

- [`answer`](./answer.md) — answer one question.
- [`decide`](./decide.md) — where a `T1`/`T0` answer is ratified, by a person.
