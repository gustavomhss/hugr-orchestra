# `atlas answer`

Answer one question of the [ratification interview](./interview.md). The answer is one record appended to the review
log `.atlas/project/review.jsonl`, and the question drops out of the next batch. Answering a `tier` question with `T1` or `T0`
also opens a proposal for that fact — the interview never ratifies anything itself; a person still decides it with
[`atlas decide`](./decide.md).

This page describes the **CLI** command `atlas answer`. It is CLI-only (not an MCP tool).

## Invocation

```
atlas answer <questionId> <answer...> --by <actor>
```

- `<questionId>` — required. The id `atlas interview` prints, or a prefix of at least 8 characters that matches exactly
  one open question.
- `<answer...>` — required, one or more words. For a `tier` question, exactly `T1` or `T0` opens a proposal; any other
  answer (for example `keep`) is recorded and opens nothing. If that fact already has an open proposal for that tier, no
  second one is added.
- `--by <actor>` — required. Who answers; recorded in the log.

## Exit codes

| code | meaning                                                                       |
| ---- | ----------------------------------------------------------------------------- |
| `0`  | the answer is recorded (and, for a T1/T0 tier answer, a proposal is open)     |
| `1`  | a usage error: no `--by`, no answer text, or no open question with that id    |
| `2`  | refused: the review log has a line that does not verify                       |

## Authority

`atlas answer` binds `atlas-query` — it writes no knowledge, only review records.

## Related

- [`interview`](./interview.md), [`proposals`](./proposals.md), [`decide`](./decide.md).
