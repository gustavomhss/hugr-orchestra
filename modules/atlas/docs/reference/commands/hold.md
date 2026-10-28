# `atlas hold`

Keep a staged candidate out of every `atlas promote` until someone releases it. Promotion reads the staging sidecar
that [`mine`](./mine.md) writes; staging has no delete and no marker, so a hold is not written there. It is one record
appended to the review log `.atlas/project/review.jsonl`, and every [`promote`](./promote.md) pass reads that log first and
skips the held rows, printing each as `held <nodeKey>`.

This page describes the **CLI** command `atlas hold`. It is CLI-only (not an MCP tool).

## Invocation

```
atlas hold <nodeKey> --by <actor>
```

- `<nodeKey>` — required. The staged row's key: the key `atlas promote` prints on each `promoted …` / `refused …` line.
  A key that no staged row carries is refused (exit `1`).
- `--by <actor>` — required. Who holds it; recorded in the log. Without it the command exits `1` and writes nothing.
- Holding a row that is already held writes nothing and exits `0`.

## The review log

`.atlas/project/review.jsonl` is append-only: one content-keyed record per line, never edited. The latest `hold` or `release`
for a nodeKey decides whether it is held. The file travels in git (`.gitignore` re-admits it and `.gitattributes`
merges it by union), so a hold made on one branch survives the merge. If the log has a line that does not verify (torn
or edited), `hold` and `promote` refuse (exit `2`) rather than act on a state that may be missing a record.

## Exit codes

| code | meaning                                                                               |
| ---- | ------------------------------------------------------------------------------------- |
| `0`  | the row is held (or already was)                                                      |
| `1`  | a usage error: no `--by`, or no staged row has this nodeKey                           |
| `2`  | refused: the staging sidecar or the review log could not be read in full              |

## Authority

`atlas hold` binds `atlas-query` — it writes no knowledge, only a review record, like [`export`](./export.md) writes a
bundle file and never the store. It is not a `WRITE_PATHS` member.

## Related

- [`release`](./release.md) — lets a held row back into the next promote.
- [`promote`](./promote.md) — skips held rows; `atlas promote <nodeKey...>` promotes only the named ones.
