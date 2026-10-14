# Atlas

**Layer 0: a shared, grounded knowledge layer for a codebase.** The Atlas is a content-addressed,
git-native substrate that lets an AI coding agent (or a human) ask _what is true about this code, and
is it still true?_ — and get a deterministic, drift-checked answer. No embeddings, no RAG: retrieval is
a hashed structural index (BLAKE3-merkle CAS) resolved by scope, dependency blast-radius, and trigger.

> **Status.** All ten campaigns are built, including **campaign 10 — the authoring surface**, whose card
> carries its own audited close (`docs/requirements/work-packages/wp-campaign-10.md`: _ALL 16 WPs BUILT —
> campaign closed_). `npm run layer-guard` now reports the read partition as bound rather than uncovered,
> which is the mechanical fact that retires the older claim.
>
> **What this paragraph deliberately does NOT say is a built-COUNT**, and that is a real gap rather than an
> omission. Two earlier versions of this line each asserted one — _"all 72 Work Packages"_, then _"87 of
> 103"_ — and neither was derivable from anything in the tree: only campaign 10's card records a build
> status at all, so no gate could ever have contradicted them. The corpus totals below ARE derivable and
> are printed by `npm run id-integrity`; a per-WP build ledger does not exist yet, and until it does this
> README will not claim a number it cannot show you the derivation of.
>
> The Atlas is consumed one-way by downstream orchestrators (e.g. **Orchestra**, its first consumer) — it
> never depends on them.
>
> **New here?** Read [`ARCHITECTURE.md`](./ARCHITECTURE.md) — the module graph, where things live, and
> the invariants that hold across the tree.

## What it guarantees

- **Grounded** — a fact never self-declares true; it is pinned to `source@sha` and goes `FRESH → DRIFTED
→ BROKEN` as the code changes (the drift oracle is the structural subtree hash, not line ranges).
- **Nothing dies** — git-native versioning; every fact/memory is re-spawnable from versioned state.
- **Knowledge ≠ Memory** — Knowledge is shared, project-level, edited/superseded (never blind-append);
  Memory is per-seat, scoped, decays by non-use. Distinct kinds within one substrate. **Read this one as
  partly running:** the Memory kind now has a durable, travelling store (`.atlas/memory.jsonl`, append-only
  and content-keyed) and a governed write projection, but **no CLI command or MCP tool exposes it yet** —
  CAMPAIGN-11 is mid-flight. Until a door ships, no _user_ can exercise this bullet. It sat here with no
  caveat at all while the package was called by nothing, which made a dead library read as a promise the
  product keeps; the caveat shrinks as the campaign lands and does not disappear early.
- **Governed write doors** — every write flows through a governed door: `atlas-emit` (grounded facts) or
  `atlas-link` (sameAs edges). Two doors, one bar (ADR-0003 — this line used to say "one governed
  write-door", which stopped being true when `atlas-link` was ratified on 2026-07-21). Reads carry no
  write authority; the doors are the frozen `WRITE_PATHS` constant in `packages/tools/src/handler.ts`.

## What is built but not reachable

Built, tested and documented is not the same as _reached by anything that runs_. A package can be complete
and dead while every other check stays green: the layer guard checks direction and cycles, the doc guards
check correspondence, and each package's suite checks the package against itself. None of them asks whether
anyone CALLS it. This ledger is that question, and `npm run wiring-guard` fails the build when it and the
import graph disagree in either direction.

**`memory` was on this list and is not any more (2026-08-30).** It was the entry this section was written
for: ~2000 lines, fully tested, and called by nothing, while the _What it guarantees_ section above promised
Knowledge ≠ Memory as if the product exercised it. CAMPAIGN-11 W2 gave it a durable store in the composition
layer, so the row is deleted because the fact changed — which is the only reason a row here may ever be
deleted. **Stated precisely, because "reached" is a low bar:** `adapter-io` now imports it at runtime, and no
CLI command or MCP tool exposes it yet. It is wired, not yet reachable by a user, and the _What it
guarantees_ bullet still says so.

The tree already knew this at module granularity — `reference-model-guard` lists the `packages/memory`
modules as zero-production-caller reference models, and has for a long time. What was missing is that the
declaration never rolled up to the package and never reached this page, which claimed the opposite under a
heading that says _guarantees_. Internal honesty a reader cannot see does not protect the reader.

A package is counted as **reached** when some other package's `src/` imports it in a declaration that
survives compilation. An `import type` does not count: it is erased, so it is a design-time reference and not
a call. **Test trees are out of scope on purpose** — a suite exercising a package proves the package works,
not that the product uses it, and conflating the two is how a library reads as shipped surface.

<!-- unreached:begin -->

| package        | why nothing imports it                                                                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cli`          | entry point — it imports the tree, nothing imports it. By design.                                                                                                        |
| `mcp-server`   | entry point, same. By design.                                                                                                                                            |
| `e2e-blackbox` | test suite — it drives the built binary as a subprocess, not as an import. By design. (`e2e` is not listed: it has no `src/` at all, so it is not a node in this graph.) |
| `contracts`    | pure types; every other package imports it `import type`, which is erased. By design.                                                                                    |

<!-- unreached:end -->

### Three fields that are wired but degenerate

Distinct from the above: these run, and return a defensible value that is not the designed one. The code
names each one at the site that serves it (`packages/adapter-io/src/own-source.ts`), and the ranking is
deterministic either way — it is simply not the ranking the design calls for.

- **Frecency (`hits`)** — the retrieval frecency ledger has no production writer; nothing records that a
  pack was served. Every candidate is `hits: 0`, so the `(tier, hits, ppr, nodeKey)` rank degenerates to
  `(tier, nodeKey)`.
- **Graph importance (`ppr`)** — genesis computes a personalized-PageRank score on a candidate, and the
  field is dropped on the way to a stored fact. `0` everywhere.
- **The `dependencies` band** — the index exposes `reverseClosure` and no forward closure, so _"what
  depends on me"_ is real and _"what I depend on"_ is **always empty**, and says so rather than being
  back-filled from a second traversal.

## Commands

The CLI is `atlas` (`packages/cli/package.json` `bin` → `packages/cli/dist/src/bin.js`). The workspace is
not published, so build it from a checkout — `npm ci && npm run build` — and note that a workspace install
does **not** put `atlas` on your `PATH`; alias it or invoke the file.

**Exactly these commands exist.** `COMMANDS` in `packages/cli/src/map.ts` is the oracle, and
`command-doc-guard` fails the build when this table, that array, or the reference pages disagree in any
direction. That sentence used to be false: the gate read the pages and never the README, so the table sat at
ten rows against a shipped surface of twenty-three with every check green. The gate now reads the region
below, so the drift that produced this correction cannot recur silently.

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
| `atlas emit <fact.json> --at <sha>`                                    | write     | governed write door — admits a grounded fact, or says which gate refused it                                | [reference](./docs/reference/commands/emit.md)               |
| `atlas link <a> <b> [--retract]`                                       | write     | governed write door — asserts (or withdraws) `a ≡ b`; never a merge                                        | [reference](./docs/reference/commands/link.md)               |
| `atlas memory-emit <entry.json>`                                       | write     | governed MEMORY write door — admits a per-seat MemoryEntry through seven MEM gates                         | [reference](./docs/reference/commands/memory-emit.md)        |
| `atlas promote`                                                        | write     | carries staged candidates into knowledge THROUGH the emit door; needs a ratifier                           | [reference](./docs/reference/commands/promote.md)            |
| `atlas derive-relations`                                               | write     | projects proven `depends-on` from the index into governed knowledge                                        | [reference](./docs/reference/commands/derive-relations.md)   |
| `atlas transition <unit>`                                              | write     | produce a grounded transition for a unit across two revs                                                   | [reference](./docs/reference/commands/transition.md)         |
| `atlas test-vacuity`                                                   | write     | produce grounded test-vacuity facts over a repository's HEAD test files                                    | [reference](./docs/reference/commands/test-vacuity.md)       |
| `atlas mine <repo>`                                                    | bootstrap | the genesis bootstrap; writes candidates only, and abstains loudly with no model                           | [reference](./docs/reference/commands/mine.md)               |
| `atlas reconcile <mergeBase> [--accept-reground]`                      | gate      | the merge gate: classifies drift, exits `2` on any semantic flip                                           | [reference](./docs/reference/commands/reconcile.md)          |

<!-- command-table:end -->

**Exit codes are a designed surface**, uniform across every one of them (`EXIT` / `deriveStatus`,
`packages/cli/src/map.ts`): `0` ok · `1` **usage or wiring error — your invocation was wrong** · `2`
**governed refusal — your invocation was fine and a gate declined it**, so re-running it unchanged will not
help. A refusal always carries the reason and the invariant it enforced.

Task guides: [move a repository in](./docs/how-to/move-a-repo-in.md) ·
[emit a grounded fact](./docs/how-to/emit-a-grounded-fact.md) ·
[find and fix drifted knowledge](./docs/how-to/find-and-fix-drift.md) ·
[get a territory's knowledge](./docs/how-to/query-the-atlas.md).

## Layout

Fifteen packages: the ten-package layered CORE, the productization RING you actually run, and the two
end-to-end suites. Counts below are measured from the tree, not asserted — the command that reproduces
each one is in the note underneath.

```
packages/
  ── CORE (the layered DAG; a package imports only from packages below it — see ARCHITECTURE.md)
  contracts       L0 shared vocabulary: Hash · SubtreeHash · StructRef · Tier · Pack · Tool (pure types)
  kernel          content-addressed identity · canonical encoding · append-only store · merge fold
  persist         git-native durability · provenance · transcript · re-spawn
  index           the structural index · rollup · drift-state · resolve · relate
  grounding       subtreeHash freshness oracle · truth-gate · 2-door admission · drift classification
  knowledge       write-decision (create/update/supersede) · lifecycle · tier-routed ratification · check-engine
  retrieval       bounded packs · OwnPack · poke · injection budget
  memory          Knowledge≠Memory boundary · Awareness/Orientation/Rules slabs
  tools           the governed tool surface (6 governance + 10 read doors · 3 of them write) · schemas · spawn ladder
  genesis         the one-time $0-LLM seeder · budgeted LLM proposal · mechanical admission
  ── RING (campaign 9 — the productization surface; the core stays pure and does no I/O itself)
  adapter-io      the composition root: filesystem · SCIP · git · LLM · durable store, wired into ONE handler
  cli             the `atlas` CLI — 32 commands through a total argv parser (never throws); see the table above
  mcp-server      a stdio MCP server over that same handler, mapping every Verdict (incl. refusals) to MCP
  ── SUITES
  e2e             story-driven in-process suite over the wired runtime
  e2e-blackbox    the same stories as a stranger: subprocess CLI + real MCP stdio
docs/           design-first artifacts (the decomposition, dogfooding the Atlas doc conventions):
  method/         the governed decomposition method (S0→S1→S2→S3→C→S4)
  requirements/   706 EARS requirements · method-tags · 1075 goldens · 137 work-package cards
                   (113 across the 11 campaigns + 24 remediation cards)
  roadmap/        11 dependency-ordered campaigns; 76 DISTINCT epic ids across the three roadmap files
                  (ids are reused between roadmaps, so a heading count would overcount — see the note below)
  reference/      12 `atlas-*.md` contracts: one per core module (9 — `contracts` has none), plus
                  atlas-adapters (the ring), atlas-architecture, and atlas-authoring (campaign 10, now built)
  adr/ · design/ · spec/ · explanation/ · how-to/ · governance/
```

`npm run id-integrity` recomputes and prints the corpus counts (`706 REQ, 1075 SCN, … 137 WP`);
`npm run layer-guard` prints the package count and the live tool-surface cardinality;
`npm run command-doc-guard` prints the command count three ways and fails if they disagree. The work-package
split is `grep -c '^### WP-' docs/requirements/work-packages/*.md`, and the distinct epic count is
`grep -rho 'EPIC-[A-Za-z0-9.-]*' docs/roadmap/*.md | sort -u | wc -l` — no gate holds these two, so they are
the numbers on this page most likely to rot.

### Transport parity — what holds, and what does not

- **Holds: schema and verdict parity.** The MCP server does not hand-author anything — it reads
  `handler.schema(tool)` verbatim, and both transports route the same call through the one wired handler,
  so an identical input yields a byte-identical `Verdict` on the CLI and over MCP (TOOLS-3).
- **Does NOT hold: surface parity.**
  <!-- transport-parity:begin -->
  The CLI exposes **32** commands; MCP advertises **18** tools (6 governance + 10 read + 2 parallel-path).
  The first two groups are `GOVERNANCE_SURFACE ∪ READ_SURFACE` (ADR-0006), both arrays in
  `packages/tools/src/handler.ts`. The third is `atlas-relations` (#99a) and `atlas-negations` (#99b),
  advertised through a documented path that deliberately leaves both surface constants untouched — so
  "MCP advertises the union" was never the whole truth, and this bullet asserted it for two campaigns.
  **The remaining 14 commands are CLI-only and unreachable over MCP**: `mine`, `promote`, `own`,
  `transitions`, `transition`, `test-vacuities`, `test-vacuity`, `verify-fact`,
  `verify-store`, `derive-relations`, `budget`, `territories`, `export`, `import`.
  <!-- transport-parity:end -->
  The writers among them publish through `atlas-emit` (ADR-0008 — an ordinary use of the existing door, not
  new surface), so no tool token exists for them.
- **This bullet used to rot, and predicted it in writing.** Campaign 10 exported `READ_SURFACE`, moving
  `doctor`, `node`, `anchors`, `slots`, `draft` and `check` onto MCP; campaign 11 then added the memory door
  set and the commands to go with them. After each move
  the numbers here were wrong, and after the second they were wrong by five commands and five tools while
  the paragraph itself carried the sentence _"No gate holds this bullet… it is the paragraph on this page
  most exposed to the next surface change."_ Correct, and useless: naming an unguarded claim does not guard
  it. `command-doc-guard` now reads the delimited region above and checks all five numbers and the CLI-only
  list against source, so the next surface change breaks the build instead of the prose. Its first version
  got this wrong in an instructive way: it derived the advertised set from the two surface arrays, agreed
  with the bullet, and would have certified `relations` and `negations` as unreachable — which running the
  real stdio server disproved in one call (`tools/list` returns eighteen names, not sixteen). The arrays are
  the model; the server is the path. The gate now reads both.

## Build order

Follow the roadmap — `docs/roadmap/roadmap.md` (campaigns 1–8), `roadmap-adapters.md` (campaign 9) and
`roadmap-authoring.md` (campaign 10): campaigns are dependency-ordered (Now/Next/Later). Each
Work Package (`docs/requirements/work-packages/`) is a driftless, zero-decision card — its `acceptance`
is the frozen goldens by reference. The `≤400-LOC` godfile ceiling is enforced in CI from day one.
