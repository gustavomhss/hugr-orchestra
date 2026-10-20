# `atlas own-export`

Build the reviewed Own snapshot for chosen units from the live store, so the static Own skills Orchestra's agents
read can be rebuilt from what Atlas knows now. The command writes a FILE for a person to review; it never writes
`OWN-SNAPSHOT.json` or the skills. `npm run own-snapshot-materialize -- <file>` does that, after checking the file
against git.

This page describes the **CLI** command `atlas own-export`. It is CLI-only (not an MCP tool).

## Invocation

```
atlas own-export <unit...> --out <file>
```

- `<unit...>` — one or more units, each a repository path such as `packages/cli`. Each named unit is rebuilt: its
  briefing is the one [`atlas own`](./own.md) serves for that path, and it is anchored to every regular file git
  tracks under the path at `HEAD` (symlinks, submodules and `.atlas/` paths excluded). Any byte under the unit then
  makes it stale.
- `--out <file>` — required. Where the reviewed snapshot is written. It may not be inside `.atlas/`, because the
  materializer refuses input from there.

The materializer replaces the WHOLE snapshot, so the file is complete: every unit of the committed
`OWN-SNAPSHOT.json` that is not named is carried unchanged, and the snapshot's source revision is `HEAD`. A carried
unit whose files changed since is then refused by the materializer, naming the file.

## Refusals

Every fact in a rebuilt briefing must be `FRESH`. When one is not, nothing is written and the refusal names each
one as `<unit> <fact id> (<freshness>)`, for example `packages/cli cli:exit-codes (DRIFTED)`. Re-verify or re-review
those facts, then export again. A unit with no tracked file at `HEAD` and a committed `OWN-SNAPSHOT.json` that does
not parse are refused the same way.

## Exit codes

| code | meaning                                                                          |
| ---- | -------------------------------------------------------------------------------- |
| `0`  | the reviewed snapshot was written to `--out`                                     |
| `1`  | a usage error: no unit, no `--out`, an `--out` inside `.atlas/`, or no runtime   |
| `2`  | refused: a fact is not `FRESH`, a unit has no tracked file, or no readable HEAD  |

## Authority

`atlas own-export` binds `atlas-query` — it reads the store and writes only the file you name, like
[`export`](./export.md) writes a bundle file and never the store. It is not a `WRITE_PATHS` member.

## Related

- [`own`](./own.md) — the briefing each rebuilt unit carries.
