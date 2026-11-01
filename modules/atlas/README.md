# Atlas

Atlas is a shared, grounded knowledge layer for a codebase. It lets an AI coding agent or a person ask _what is
true about this code, and is it still true?_ and get a deterministic, drift-checked answer. It is
content-addressed and git-native: a hashed structural index (BLAKE3 Merkle CAS) is read by scope, dependency
blast radius and trigger. There are no embeddings and no RAG. The user guide is
[docs/guides/atlas.md](../../docs/guides/atlas.md); this page is for people who change the code.

Atlas keeps its own npm workspace (Node 20+, `package-lock.json`) inside the Orchestra repository and never
depends on Orchestra code.

## Who uses it

- `modules/maestro/coordination` consumes Atlas through `@orchestra/atlas-boundary`
  ([modules/atlas/boundary](./boundary/README.md)), the generated bundles that expose `.`, `./materialize`,
  `./native-header` and `./native-memory`. The Maestro context tool, the running-turn header and the memory tools
  are built on it (`src/v2/atlas-source.ts`, `src/v2/atlas-header-source.ts`, `src/v2/tools/atlas-memory.ts`).
- CI uses the CLI and the guards: `atlas-guard.yml` runs the Own snapshot guard on pull requests, and
  `atlas-worklist.yml` writes the stale-Own worklist on pushes to `dev`.

## What it guarantees

- **Grounded.** A fact never declares itself true. It is pinned to `source@sha` and goes `FRESH`, `DRIFTED` or
  `BROKEN` as the code changes; the drift oracle is the structural subtree hash, not line ranges.
- **Nothing dies.** Versioning is git-native, and every fact and memory can be respawned from versioned state.
- **Knowledge is not Memory.** Knowledge is shared and project-level, and is edited or superseded. Memory is
  per seat, scoped and decays by non-use. Both live in one substrate.
- **Governed write doors.** Facts enter only through `atlas-emit` (grounded facts) or `atlas-link` (sameAs
  edges), the frozen `WRITE_PATHS` constant in `packages/tools/src/handler.ts` (ADR-0003). Memory has its own
  governed door, `atlas-memory-emit`. Reads carry no write authority.

## Entry points

The CLI is `atlas` (`packages/cli/package.json` `bin` is `./dist/src/bin.js`). The workspace is not published and
a workspace install does not put `atlas` on `PATH`: build it with `npm ci && npm run build`, then invoke the file.
`packages/mcp-server` is a stdio MCP server over the same handler (`src/bin.ts`).

`COMMANDS` in `packages/cli/src/map.ts` is the oracle for the table below; `command-doc-guard` fails the build when
the table, that array and the reference pages disagree.

<!-- command-table:begin -->

| command                                                                | kind      | what it does                                                                                               | page                                                         |
| ---------------------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `atlas init <path>`                                                    | read      | structural `$0`-LLM move-in; installs the `.gitignore` rule for `.atlas/`                                  | [reference](./docs/reference/commands/init.md)               |
| `atlas query <scope> [--by …]`                                         | read      | the bounded read: a scope's `tier≥T1` invariants plus a capped advisory band                               | [reference](./docs/reference/commands/query.md)              |
| `atlas own <scope>`                                                    | read      | the briefing for a scope: role, invariants, gotchas, terrain, dependents                                   | [reference](./docs/reference/commands/own.md)                |
| `atlas node <addr>`                                                    | read      | read one fact whole, by content address                                                                    | [reference](./docs/reference/commands/node.md)               |
| `atlas anchors <path>`                                                 | read      | list the groundable units the built index carries under a tree path                                        | [reference](./docs/reference/commands/anchors.md)            |
| `atlas slots`                                                          | read      | list the closed predicate-slot vocabulary — what you can say                                               | [reference](./docs/reference/commands/slots.md)              |
| `atlas draft`                                                          | read      | compose a candidate fact the door will accept                                                              | [reference](./docs/reference/commands/draft.md)              |
| `atlas check`                                                          | read      | dry-run the emit door's whole gate chain; persists nothing                                                 | [reference](./docs/reference/commands/check.md)              |
| `atlas doctor <archive\|why\|hotset\|reground>`                        | read      | read-only diagnosis and repair _proposals_; persists nothing                                               | [reference](./docs/reference/commands/doctor.md)             |
| `atlas relations <unit>`                                               | read      | the grounded relation facts touching a unit, both directions                                               | [reference](./docs/reference/commands/relations.md)          |
| `atlas negations <scope>`                                              | read      | the grounded negatives and the honest abstentions under a scope                                            | [reference](./docs/reference/commands/negations.md)          |
| `atlas transitions <unit>`                                             | read      | the grounded transitions on a unit lineage                                                                 | [reference](./docs/reference/commands/transitions.md)        |
| `atlas test-vacuities <unit>`                                          | read      | the grounded test-vacuity facts on a unit                                                                  | [reference](./docs/reference/commands/test-vacuities.md)     |
| `atlas verify-fact`                                                    | read      | PROVE, REFUTE or ABSTAIN on a typed claim — three `$0`-LLM oracles                                         | [reference](./docs/reference/commands/verify-fact.md)        |
| `atlas verify-store`                                                   | read      | re-prove every `proven` fact in the store against the live index                                           | [reference](./docs/reference/commands/verify-store.md)       |
| `atlas memory-recall [--owner …] [--kind …] [--task-id …] [--pr-id …]` | read      | MEM-4b's one explicit-consult path to task/pr/logbook memory                                               | [reference](./docs/reference/commands/memory-recall.md)      |
| `atlas memory-header`                                                  | read      | the composed actor's running-turn header (awareness + orientation + own ranked project rules)              | [reference](./docs/reference/commands/memory-header.md)      |
| `atlas memory-awareness`                                               | read      | the SHARED, byte-identical Awareness slab                                                                  | [reference](./docs/reference/commands/memory-awareness.md)   |
| `atlas memory-orientation`                                             | read      | the DERIVED, SHARED, byte-identical Orientation slab                                                       | [reference](./docs/reference/commands/memory-orientation.md) |
| `atlas budget`                                                         | read      | the RETR-8 per-kind hits/hitRate calibration ledger (honest zero until the served-injection writer exists) | [reference](./docs/reference/commands/budget.md)             |
| `atlas territories`                                                    | read      | the RETR-13 per-territory off-atlas MISS-oracle (a crossing raises a calibration prompt)                   | [reference](./docs/reference/commands/territories.md)        |
| `atlas export <outDir>`                                                | read      | dump the WHOLE durable store to one self-contained OKF bundle file                                         | [reference](./docs/reference/commands/export.md)             |
| `atlas import <bundle> <dir>`                                          | read      | replay an OKF bundle 1:1 into a FRESH EMPTY store target — CAS bytes only, never the governed projection   | [reference](./docs/reference/commands/import.md)             |
| `atlas emit <fact.json> --at <sha> [--replace]`                        | write     | governed write door — admits a grounded fact, or says which gate refused it                                | [reference](./docs/reference/commands/emit.md)               |
| `atlas link <a> <b> [--retract]`                                       | write     | governed write door — asserts (or withdraws) `a ≡ b`; never a merge                                        | [reference](./docs/reference/commands/link.md)               |
| `atlas memory-emit <entry.json>`                                       | write     | governed MEMORY write door — admits a per-seat MemoryEntry through seven MEM gates                         | [reference](./docs/reference/commands/memory-emit.md)        |
| `atlas promote [nodeKey...]`                                           | write     | carries staged candidates (all, or the named ones) into knowledge THROUGH the emit door; skips held rows   | [reference](./docs/reference/commands/promote.md)            |
| `atlas hold <nodeKey> --by <actor>`                                    | review    | keeps a staged candidate out of every `atlas promote` until it is released                                 | [reference](./docs/reference/commands/hold.md)               |
| `atlas release <nodeKey> --by <actor>`                                 | review    | lets a held staged candidate back into the next `atlas promote`                                            | [reference](./docs/reference/commands/release.md)            |
| `atlas propose <nodeKey> <T1\|T0> <reason...> --by <actor>`            | review    | proposes a fact for T1 or T0 with a reason; a person decides it                                            | [reference](./docs/reference/commands/propose.md)            |
| `atlas proposals`                                                      | review    | lists the open ratification proposals                                                                      | [reference](./docs/reference/commands/proposals.md)          |
| `atlas decide <id> <ratify\|reject> <reason...> --by <actor>`          | write     | ratify re-emits the fact at the proposed tier THROUGH the emit door; reject records why                    | [reference](./docs/reference/commands/decide.md)             |
| `atlas interview [--json]`                                             | review    | the ranked ratification interview: at most 20 open questions per session, the rest deferred                | [reference](./docs/reference/commands/interview.md)          |
| `atlas answer <questionId> <answer...> --by <actor>`                   | review    | records an interview answer; a T1/T0 tier answer also opens a proposal                                     | [reference](./docs/reference/commands/answer.md)             |
| `atlas derive-relations`                                               | write     | projects proven `depends-on` from the index into governed knowledge                                        | [reference](./docs/reference/commands/derive-relations.md)   |
| `atlas transition <unit>`                                              | write     | produce a grounded transition for a unit across two revs                                                   | [reference](./docs/reference/commands/transition.md)         |
| `atlas test-vacuity`                                                   | write     | produce grounded test-vacuity facts over a repository's HEAD test files                                    | [reference](./docs/reference/commands/test-vacuity.md)       |
| `atlas mine <repo>`                                                    | bootstrap | the genesis bootstrap; writes candidates only, and abstains loudly with no model                           | [reference](./docs/reference/commands/mine.md)               |
| `atlas reconcile <mergeBase> [--accept-reground]`                      | gate      | the merge gate: classifies drift, exits `2` on any semantic flip                                           | [reference](./docs/reference/commands/reconcile.md)          |
| `atlas territory <name> <glob...> --owner <seat> --tier <tier>`        | ops       | declares or replaces one territory in TERRITORY-CATALOG.json; needs ATLAS_RATIFY_TOKEN (billy for T0)      | [reference](./docs/reference/commands/territory.md)          |
| `atlas own-export <unit...> --out <file>`                              | ops       | writes a reviewed Own snapshot built from the live store for the named units; names every non-FRESH fact   | [reference](./docs/reference/commands/own-export.md)         |
| `atlas repair --worklist <file>`                                       | ops       | re-exports the worklist's stale Own units, materializes them, commits a branch and opens a PR              | [reference](./docs/reference/commands/repair.md)             |
| `atlas migrate-layout`                                                 | ops       | moves the single-file `.atlas/` logs into the per-seat and project tree                                    | [reference](./docs/reference/commands/migrate-layout.md)     |
| `atlas respawn <CARD> a<n>`                                            | ops       | prints the brief that re-spawns an attempt from the committed `.atlas/` record                             | [reference](./docs/reference/commands/respawn.md)            |

<!-- command-table:end -->

Exit codes are uniform (`EXIT` and `deriveStatus` in `packages/cli/src/map.ts`): `0` ok, `1` usage or wiring error,
`2` governed refusal. A refusal means the invocation was fine and a gate declined it, so re-running it unchanged
will not help; it always carries the reason and the invariant it enforced. `ATLAS_ACTOR` and `ATLAS_RATIFY_TOKEN`
are the two environment channels (`packages/cli/src/help.ts`).

Task guides: [move a repository in](./docs/how-to/move-a-repo-in.md),
[emit a grounded fact](./docs/how-to/emit-a-grounded-fact.md),
[find and fix drifted knowledge](./docs/how-to/find-and-fix-drift.md),
[get a territory's knowledge](./docs/how-to/query-the-atlas.md).

## Layout

```
packages/   the layered core, a package imports only from packages below it (see ARCHITECTURE.md)
  contracts · kernel · persist · index · grounding · knowledge · retrieval · memory · tools · genesis
  adapter-io    composition root: filesystem, SCIP, git, LLM and the durable store, wired into one handler
  cli           the `atlas` CLI, through a total argv parser that never throws
  mcp-server    stdio MCP server; every Verdict, refusals included, maps to MCP
  e2e           story-driven in-process suite over the wired runtime
  e2e-blackbox  the same stories through the subprocess CLI and real MCP stdio
boundary/   generated bundles for Orchestra (@orchestra/atlas-boundary)
harness/    gates, gate libraries and probes (see harness/README.md)
scripts/    Own snapshot materializer, git source roots, wp-audit
docs/       Diataxis docs, ADRs, EARS requirements, roadmaps, method (see docs/README.md)
```

[ARCHITECTURE.md](./ARCHITECTURE.md) has the module graph and the invariants that hold across the tree.

## Working on it

All commands run in `modules/atlas`. Tests run on GitHub Actions: from the repository root,
`bun run test:ci atlas [files]`. The `atlas` job in `.github/workflows/test.yml` installs with `npm ci`, runs
`npm run typecheck`, then every guard in `package.json` (`godfile-guard`, `layer-guard`, `reference-model-guard`,
`spec-conformance-guard`, `id-integrity`, `command-doc-guard`, `wiring-guard`, `adr-citation-guard`,
`req-clause-guard`, `ears-coamend-guard`, `doc-transcript-guard`, `service-gate-guard`, `own-snapshot-guard`), and
the product suite. A guard run from `npm run <name>` is cheap and prints what it measured, including the corpus
counts (`id-integrity`) and the live tool surface (`layer-guard`). Change a command, a tool or a package and the
README regions above and below follow, or the guard fails. After changing anchored source, refresh the Own
snapshot (`npm run own-snapshot-materialize`, or `atlas own-export` and `atlas repair`).

## Limits

Built and tested is not the same as reached by anything that runs. `wiring-guard` compares the ledger below with
the import graph in both directions. A package counts as reached when another package's `src/` imports it in a
declaration that survives compilation; `import type` and test trees do not count.

<!-- unreached:begin -->

| package        | why nothing imports it                                                                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cli`          | entry point — it imports the tree, nothing imports it. By design.                                                                                                        |
| `mcp-server`   | entry point, same. By design.                                                                                                                                            |
| `e2e-blackbox` | test suite — it drives the built binary as a subprocess, not as an import. By design. (`e2e` is not listed: it has no `src/` at all, so it is not a node in this graph.) |
| `contracts`    | pure types; every other package imports it `import type`, which is erased. By design.                                                                                    |

<!-- unreached:end -->

Three fields run but return a defensible value, not the designed one (named at the site that serves them,
`packages/adapter-io/src/own-source.ts`): frecency `hits` has no production writer, so ranking is
`(tier, nodeKey)`; graph importance `ppr` is dropped on the way to a stored fact; and the `dependencies` band is
always empty because the index exposes `reverseClosure` and no forward closure.

Transport parity: both transports route the same call through one wired handler, so an identical input yields a
byte-identical `Verdict` on the CLI and over MCP. Surface parity does not hold, and `command-doc-guard` checks the
region below against the source and the running stdio server.

  <!-- transport-parity:begin -->
  The CLI exposes **44** commands; MCP advertises **18** tools (6 governance + 10 read + 2 parallel-path).
  The first two groups are `GOVERNANCE_SURFACE ∪ READ_SURFACE` (ADR-0006), both arrays in
  `packages/tools/src/handler.ts`. The third is `atlas-relations` (#99a) and `atlas-negations` (#99b),
  advertised through a documented path that deliberately leaves both surface constants untouched — so
  "MCP advertises the union" was never the whole truth, and this bullet asserted it for two campaigns.
  **The remaining 26 commands are CLI-only and unreachable over MCP**: `mine`, `promote`, `own`,
  `transitions`, `transition`, `test-vacuities`, `test-vacuity`, `verify-fact`,
  `verify-store`, `derive-relations`, `budget`, `territories`, `export`, `import`, `hold`, `release`, `propose`, `proposals`, `decide`, `interview`, `answer`, `territory`, `own-export`, `repair`, `migrate-layout`, `respawn`.
  <!-- transport-parity:end -->

The writers among the CLI-only commands publish through `atlas-emit` (ADR-0008), so no tool token exists for them.
