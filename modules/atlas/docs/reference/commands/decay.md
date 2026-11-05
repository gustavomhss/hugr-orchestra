# `atlas decay`

Run the KNOW-17 decay pass. An advisory fact that no served pack used across a whole window of hits leaves the
served set: `atlas query` stops serving it. The fact is archived, never deleted. Its bytes stay in the CAS, its
projection row stays current, and one later hit brings it back.

This page describes the **CLI** command `atlas decay`. It is CLI-only (not an MCP tool). Run it at the repository
root.

## Invocation

```
atlas decay [--window <n>]
atlas decay --restore <nodeKey>
```

- `--window <n>` is the number of hit events a window must accrue before it can close. The default is 200.
- `--restore <nodeKey>` logs one hit for that node instead of running a pass. A decayed node is served again.

## How the pass works

`atlas query` logs one hit for each advisory fact it serves in a pack. The hits go to `.atlas/hits.jsonl`.

1. The first run records which advisory facts are eligible and decays nothing. A cold ledger proves nothing about
   use.
2. A later run before `n` hits have accrued since the last pass changes nothing and says how many it has seen.
3. Once `n` hits have accrued, the run decays every fact that was eligible at both ends of the window and got no
   hit in it, and opens the next window. A fact that became eligible mid-window is not judged until the next one.

A fact is eligible when it is current, its CAS bytes are present, it is not retired, and it is in the advisory band.

## What it writes

| Path | Change |
| --- | --- |
| `.atlas/hits.jsonl` | one `decay` line per pass that opens or closes a window, one `hit` line per `--restore` |
| `.atlas/cas/` | re-asserts each decayed fact's bytes (content-addressed, so nothing changes on disk) |

It never writes the knowledge store or its projection.

## Output and exit codes

| Code | Meaning |
| ---- | ------- |
| `0`  | the pass ran. The summary says whether it opened a window, found it still open, or closed it, and lists any decayed node |
| `1`  | usage: `--window` is not a positive integer |

## Limits

- The ledger is local. `.atlas/hits.jsonl` is not committed, so each clone judges use from its own queries.
- A hit is counted each time a fact is served in a pack, not each time it drives a decision.
- The log is never compacted.
- On a store committed to git, the pass reads the raw store, so it can also mark a fact the query path was not
  serving. `--restore` brings it back.
