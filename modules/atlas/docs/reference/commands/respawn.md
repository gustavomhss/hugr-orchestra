# `atlas respawn`

Build the brief that starts a new run of a card from the committed `.atlas/` record. It reads only files a clone
has, so a run can be re-spawned on another machine. It does not replay the old run's model calls.

This page describes the **CLI** command `atlas respawn`. It is CLI-only (not an MCP tool). Run it at the repository
root.

## Invocation

```
atlas respawn <CARD> a<n>
```

- `<CARD>` is the card key, for example `ORC-7`.
- `a<n>` is the attempt, for example `a2`, as the commit's `Attempt` trailer and the PR record name it.

## What it reads

| Source | Gives |
| --- | --- |
| `.atlas/cards/<CARD>/attempts/a<n>.jsonl` | the seat, session, engine, model, verdict and gates of the prior run |
| `.atlas/members/<seat>/memory/` | the seat's own closing fold for the card (attempted, failed with, stopped at, lesson) |
| `.atlas/members/<seat>/context/<session>.jsonl` | the context the prior session archived, which `context_recall` can quote |
| `.atlas/blobs/` | whether the prior transcript is committed |

The brief names each archived context chunk by id and title. It never inlines a transcript.

## Output and exit codes

| Code | Meaning |
| ---- | ------- |
| `0`  | the brief was built. The summary lines name the seat, session, fold, context and transcript, then `brief:` and its text |
| `1`  | usage: no card, or an attempt token that is not `a<n>` |
| `2`  | the attempt is not recorded under `.atlas/cards/` |

## Limits

- Starting the new V2 Session with the brief is the host's step. Atlas has no Orchestra dependency, so the command
  prints the brief and the session to start, and does not start it.
- A public repository never commits transcripts or context chunks. There the brief lists context references whose
  text `context_recall` cannot fetch, and it says the transcript is not committed.
- The closing fold is read for the attempt's seat only. A run re-spawned under another seat does not see it.
