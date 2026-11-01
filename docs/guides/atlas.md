# Atlas

Orchestra's knowledge layer. It lives in the repository, in git, and is checked against the code it describes. No embeddings, no vector store.

| Part | What it does |
| --- | --- |
| Structural index | A BLAKE3 Merkle index gives every unit (file, module, package) a content hash. Retrieval by scope, dependency blast radius and trigger, so an agent gets the facts for the code it is about to touch. |
| Facts pinned to code | Short templated claims (advisory, predicate, relation, negation, transition, test-vacuity), pinned to the hash of the subtree they describe. Tiered by how strongly they bind; the top tier needs human ratification. |
| Drift | When code changes, each fact becomes FRESH, DRIFTED, STALE or BROKEN. Mechanical drift is re-grounded automatically. When a fact's meaning flips, `atlas reconcile` fails and blocks the merge until someone decides. |
| Controlled writes | Facts enter through two doors only: one checks shape, truth, authorization and ratification; one links facts to code. |
| Memory | Project rules (a short decaying set injected each turn), task memory, pull request memory and Maestro's logbook, append-only per seat. Seats read it through `atlas_memory_recall` and write it through `atlas_memory_emit`; Maestro reads the catalog and units through `atlas_context`. |
| Briefings | Per unit of code, a generated briefing skill with a receipt of the facts and file blobs it was built from. A CI guard checks them on pull requests; on every push to the base branch a worklist names stale ones; `atlas repair` refreshes them. |

Atlas also renders the merge queue's pull request bodies and record commits. About 44 CLI commands and 18 MCP tools; its specification has 706 requirements and 1,075 scenarios.

## The graph

The Explore view draws what Atlas knows.

- Each circle is a unit Atlas serves knowledge for: a folder under `packages/`, `docs/` or `harness/`, or the repository root.
- Arrows come from the code index and point to what a unit depends on.
- A unit whose code moved since its facts were checked is marked, so drift is visible before anyone asks.
- The same snapshot is also shown as a Map and a List.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../images/readme/atlas-graph-dark.png">
  <img src="../images/readme/atlas-graph-light.png" alt="The Atlas graph run on Atlas's own repository: 29 units (15 code, 10 docs, 3 harness, 1 root) as circles such as kernel, knowledge, adapter-io, retrieval and memory, linked by dependency arrows; a legend for holds, code moved, depends on and depends on the selection; and Graph, Map and List views.">
</picture>

The picture is Atlas run on its own repository: 29 units, 596 facts, 74 dependency links.

## Versioned by git

No server and no database of its own. What Atlas knows is a set of append-only files under `.atlas/`, versioned, branched, reviewed and merged like the code, and present in every clone.

```text
.atlas/
  policy.json                      who may write what (reviewed like code)
  project/                         orientation, review decisions, board
  members/<seat>/memory/           project rules, logbook, task and PR memory
  members/<seat>/knowledge/        facts, sharded by hash
  members/<seat>/context/          continuity archive events per session
  cards/<CARD>/                    the card and one log per attempt
  blobs/<h[0:2]>/<h>               content-addressed bodies, written once
```

| Property | How |
| --- | --- |
| Only logs travel | The working store (`cas/`, `projection*.json`, `staging*.json`) and the code index are local caches ignored by git. Atlas refuses to serve a store that arrived by commit, because a commit skips every write door. |
| A fresh clone rebuilds itself | On start, Atlas replays the committed logs into a new local projection. A fact sealed as proven is re-proven against this checkout's code index (as `atlas verify-store` does): kept if it holds, dropped and reported if not. Every other line returns as a candidate held for ratification, whoever committed it. Replay is idempotent. |
| Nothing is overwritten | Every line is keyed by its content hash; state is the fold of the set of lines, so a rebase or cherry-pick gives the same state. Superseded memory is archived, not deleted; forgetting hides it from the active view only. |
| Branches merge cleanly | `.gitattributes` sets `merge=union` on `.atlas/**/*.jsonl` and the fold dedupes, so two branches that wrote memory merge without conflicts. GitHub's server-side merge ignores that setting, which is why the merge queue merges locally and fast-forwards. |
| Public repositories keep hashes only | Card messages, decisions and continuity chunks keep only their hashes. Visibility is read from the GitHub remote, never configured; any doubt counts as public. |
| Old layouts move forward | `atlas migrate-layout` converts the earlier single-file layout. |

## What each task cost

Every attempt at a card is metered, and the record lands in git next to the code it produced. When the merge queue lands a bundle it commits `chore(queue): record <label>`, and merge commits on the base branch carry `WP:` and `Attempt:` trailers pointing to the record. `git log` alone answers "who built this, with which model, and what did it cost?", from any clone, months later.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../images/readme/atlas-ledger-dark.png">
  <img src="../images/readme/atlas-ledger-light.png" alt="The Atlas ledger: the record commit chore(queue): record label, the .atlas layout with cards/CARD/card.jsonl and one attempts/a-n.jsonl file per attempt, and the fields of one metered attempt: seat, session, engine and model, tokens in and out with cache, tool calls, wall time, reworks, gates and verdict, cost in micro-dollars and the transcript hash.">
</picture>

Each card has `.atlas/cards/<CARD>/` with its history in `card.jsonl` and one file per attempt in `attempts/a<n>.jsonl`.

| Field | Content |
| --- | --- |
| Seat and session | Seat by role id |
| Engine and model | What ran it |
| Tokens | In and out, cache reads and writes |
| Work | Tool calls, wall time, times sent back |
| Result | Gates passed or failed, verdict |
| Cost | Model spend in micro-dollars (`costMicroUsd`) |
| Transcript | Hash of the full transcript |

- An engine that reports no usage shows "not metered", never zero.
- Budgets warn at 80%, ask at 90% and pause at 100%.
- A card costing three times the median of the other cards in its epic or more is flagged, once the epic has at least two other cards.
- In a public repository the spend is dropped before the line is written; the board's Money panel shows it from the local database.

*Example:* the double-charge card shows two attempts: the first sent back once by cold review for a missing control, the second green, each with seat, model, time and cost, so the price of rework is visible instead of folded into a monthly bill.
