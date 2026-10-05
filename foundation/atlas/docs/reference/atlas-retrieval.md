# atlas-retrieval — Reference

> owner: charlie (FORGE) · grounding: claims checked against `spec/atlas.md` §3.4, §3.6, §6.1, §6.2, A-14, A-15 · status: draft

## Purpose

The retrieval layer decides _what knowledge reaches a worker, and when_. It has no embeddings and no
RAG (A-14): relevance is resolved by the deterministic hashed structural index (§3.6) over three keys —
scope (path), dependency (`depends-on`), and trigger (tag). It packages a territory's invariants into a
**pack**, **pokes** that pack when a navigator enters the scope, and projects the covering nodes into a
**location-scoped MCP tool surface**. Every auto-injection is bounded by a hard ceiling.

## Data model

```
Pack          = { territory, axisHash, invariants: PackInvariant[], tokenEstimate, stale }
PackInvariant = { nodeId, tier, claim }        // 1-line structured, never a prose blob

Poke          = { scope, pack, notice }        // pushed on scope-entry; notice ≤ ~150 tokens
NodeTool      = { nodeId, scope, schema }       // one MCP tool per covering node, dynamic

OwnUnit       = { level, id, grounding }        // level ∈ crate|module|service|feature; the handle behind an `own_<id>` tool
OwnPack       = {                               // a CURATED, zero-assembly briefing for the unit you own — composed mechanically, not by an LLM
  unit,                                         // 1-line role (from a `definition` fact / terrain)
  invariants:  PackInvariant[],                 // top tier≥T1 of the unit, ranked, capped
  shape,                                        // terrain: contents + owner + tier
  edges,                                        // bounded blast summary (from relate() — key dependents/dependencies)
  gotchas,                                      // the non-obvious slots (gotcha / rationale)
  memory,                                       // project-Rules scoped here + recent lesson POINTERS (consultable, not inlined)
  drill: { finer: OwnUnit[], refresh, complement },  // progressive disclosure — finer units, re-poke, relate()
}

RelationSet   = {                              // "what relates to what I'm touching" — deterministic, pre-partitioned
  unit,                                        // the touched unit (path / changed AST unit)
  enclosing:    PackInvariant[],               // spatial roll-up: file → module → crate
  dependents:   RelatedFact[],                 // REVERSE closure (blast radius) — BOUNDED: hop-capped, ranked, truncated (RETR-11)
  dependents_meta: BoundMeta,                  // how the reverse closure was bounded — honest total vs returned
  dependencies: RelatedFact[],                 // FORWARD closure — "this is built on these contracts"
  governing:    PackInvariant[],               // territory rule(s): owner + tier over the unit
  coChanged?:   RelatedFact[],                 // git-history co-change — deterministic but correlational; opt-in
}
RelatedFact   = { nodeId, relation, distance, tier, ppr, claim, stale }   // ppr = precomputed importance (GEN-11); distance = closure hops
BoundMeta     = { maxHops, rank: 'tier-desc,ppr-desc,distance-asc,nodeKey-asc', total, returned, truncated }

InjectionKind = 'awareness' | 'orientation' | 'projectMem' | 'own' | 'pack' | 'protocols.safetyCritical' | 'protocols.advisory' | 'poke'
Budget        = { kind: InjectionKind, capTokens, hits, hitRate }   // per-type cap + hits ledger + observed hit-rate (drop-order oracle, RETR-6)
OffAtlas      = { territory, served, offAtlasReads, offAtlasRate }    // MISS-oracle: per-territory coverage ledger (RETR-13)
```

- **Retrieval keys (all deterministic, §3.6):** (1) _scope_ — resolve a path to its node(s) in the tree
  and roll facts up the hierarchy (a file query surfaces its module's and crate's invariants); (2)
  _dependency_ — follow `depends-on` / blast radius; (3) _trigger_ — protocols matched by territory/pattern.
- A `Pack` carries every `tier≥T1` invariant of its territory, `≤ ~2K` (cap measure below); `stale` is
  `true` iff any grounding backing it drifted (the index is itself the drift oracle, so staleness is
  visible at query time).
- **Cap measure (deterministic unit).** Raw token counts are tokenizer-specific and would break
  INDEX-8 / RETR-1 byte-identity. Every numeric cap in this doc (pack `≤2K`, Awareness `≤400`, poke
  `≤150`, the `~5K` ceiling, …) is therefore enforced under **one pinned tokenizer, named here:
  `cl100k_base` (tiktoken), pinned by version + content hash** in the Atlas config — making each cap a
  deterministic function of the input. An implementation MAY instead enforce the equivalent caps in
  **UTF-8 bytes** (also deterministic), but MUST pick exactly one measure and pin it. `Pack.tokenEstimate`
  is this pinned count, not a free estimate.

## Invariants

- **RETR-1 No embeddings / no RAG.** → see spec **A-14**; enforced in atlas-retrieval — relevance is
  resolved only by scope / dependency / trigger over the hashed index (determinism: INDEX-8).
- **RETR-2 Pack bound — cap wins, filled by tier then observed use.** Every pack MUST be `≤ ~2K` tokens. It
  MUST carry every **T0** invariant of its territory **in full**, then **T1 by rank until the cap** — where
  within-tier **rank = `(hits-desc, ppr-desc, nodeKey-asc)`**: the scarce budget goes first to observed-useful
  facts (the `hits` ledger, RETR-8), ties broken by precomputed PPR importance (GEN-11), then `nodeKey`. Then
  a **truncation marker + a `pull-reachable` tail** — the cap wins over completeness, never a silent drop. A
  **merged** pack over `K` covering territories is budgeted `≤ ~2K` **total**, filled **T0-first, then by the
  same `(hits-desc, ppr-desc)` rank** — "owner-territory proximity" is retired in favor of PPR, so a
  high-centrality hub outranks a merely-closer leaf. A pack MUST NOT contain free prose — only 1-line
  structured `PackInvariant`s (§3.4).
- **RETR-3 Stale ⇒ re-ground.** A pack whose `stale` is `true` MUST NOT be trusted as-is; it MUST be
  re-grounded before use. `stale` MUST equal "any grounding backing this pack drifted" — never a guess.
- **RETR-4 Poke on scope-entry (debounced, once per scope).** The poke's **event source** MUST be the
  harness tool-call hook — the **push tier of TOOLS-11** — from which scope is inferred (file/folder/
  module/crate) via the paths in the navigator's tool calls. **Scope-signal filter (which calls count as
  navigation):** an `Edit`/`Read`/`Write` on a **single file path** IS a navigation signal (scope = that
  file's node); a **multi-file `Grep`/`Glob`** spanning many files has **no single scope** and MUST be
  suppressed (no poke); a `Bash` **path-shaped argument is NOT navigation** (`cargo test -p foo` is a command,
  not a location) and MUST NOT infer scope. Only a resolved single-file navigation signal MAY drive a
  scope-change. Crossing into a new scope MUST fire a poke
  injecting a compact notice + that scope's pack, unasked. To prevent poke-storms on rapid file-hopping
  the hook MUST apply **scope-change hysteresis / debounce**: a scope change MUST _settle_ (remain the
  current scope across a debounce window of **`N = 2` consecutive tool calls**) before its poke fires, and transient
  in-and-out crossings MUST NOT poke. A poke MUST fire **at most once per scope per session** — re-entering
  an already-poked scope, or a seat merely reasoning over an already-injected pack (which emits no new
  path event), MUST NOT re-poke. Knowledge announces itself where it applies; no explicit call is required.
- **RETR-5 Location-scoped tool projection.** Only nodes covering the **current** scope MAY be exposed as
  MCP tools at once; on leaving the scope they MUST retract. The whole graph MUST NOT be projected as tools
  simultaneously — the tool surface is dynamic, following the navigator (A-15).
- **RETR-6 Injection ceiling + a ledger-calibrated drop order.** The SUM of everything auto-injected in a turn
  MUST respect a hard ceiling of `~5K` tokens (~3–5% of context). If the sum would exceed it, droppable kinds
  MUST be dropped by **observed per-kind hit-rate — least-used first** (the RETR-8 `hitRate` ledger), never in
  an undefined or purely-hardcoded order. **Two kinds are exempt and MUST NOT drop, ever:**
  `Awareness.constitution` (T0) and `protocols.safetyCritical` (T0-adjacent). The documented **cold-start
  default** — used only until the ledger has data, highest-priority first, dropped from the bottom — is:
  `Awareness.constitution(T0)` _[pin]_ → `protocols.safetyCritical` _[pin]_ → `Orientation` → `project-Rules`
  → `own (curated briefing)` → `pack (T0 in full, then T1 by rank)` → `related (dependents by rank)` →
  `protocols.advisory` → `poke notice` → `Awareness tail`. Once the ledger has data, every kind except the two
  pins MUST reorder by observed hit-rate (drop the least-used first). A drop-counter per kind MUST be ledgered
  (a kind dropped `>20%` of turns is mis-capped or mis-prioritized).
- **RETR-7 Per-type caps.** Each injection kind MUST respect its own sweet-spot cap: Awareness `~400`,
  Orientation `~250`, project memory `~500` (**orchestrator `~800`**), **`own` briefing `~1.5K`**, pack `~2K`,
  **`related` band `~300`**, protocols `~500` (`safetyCritical` + `advisory` share this cap), poke `~150`. A
  single kind MUST NOT consume the whole ceiling. Awareness + Orientation are derived (never
  written); only project memory is a written per-member entry. Every cap here — and the RETR-6 ceiling — MUST be enforced under the **pinned
  cap measure** (data model): enforcement is deterministic and byte-identical under that fixed unit.
- **RETR-8 Ledger-calibrated, not guessed.** Caps MUST be tuned by the ledger's observed `hits` (what
  injected knowledge was actually used), never by static guesswork. The `hits` counter is the calibration
  oracle; its per-kind **`hitRate`** MUST also drive the RETR-6 drop order (least-used dropped first).
  Precision is not coverage: a high `hits` count says served facts were used, not that nothing more was
  needed — coverage is the MISS-oracle's job (RETR-13).
- **RETR-9 Empty & total.** A malformed or missing territory/scope MUST yield an empty pack / empty tool set
  / no poke — never a throw (mirrors §3.4, A-14 determinism).
- **RETR-10 Deterministic relation resolution — no model graph-walk.** `relate(unit)` MUST return the exact
  related-node set computed purely from the index's three axes (spatial roll-up + `depends-on` forward &
  reverse closure + territory), **partitioned by relation kind** (`enclosing` / `dependents` /
  `dependencies` / `governing` / optional `coChanged`). It MUST be deterministic (byte-identical for equal
  input) and MUST NOT consult an LLM; the model supplies only the touched unit — the closure is the index's
  job, never the model's. `coChanged` is git-history-derived (deterministic but correlational) and MUST be
  opt-in and labeled, never mixed into the structural bands.
- **RETR-11 Bounded blast radius.** `dependents` (the reverse closure) MUST NOT be returned unbounded — for
  a hub node the naive reverse closure is most of the repo. It MUST be (a) cut at a **max hop-distance
  `maxHops = 2`** from the unit; (b) ordered by a **deterministic rank** — `tier` descending, then **`ppr`
  descending** (the precomputed PPR importance, GEN-11), then `distance` ascending (demoted to a tiebreak),
  then `nodeKey` ascending; and (c) capped at a hard count **`K = 8`** one-line
  `RelatedFact`s. When the closure exceeds `K` the set MUST be truncated **after ranking** and MUST carry
  `dependents_meta.truncated: true` with the honest `total` (full pre-truncation count) and `returned`. A
  hub node MUST thus yield a bounded, ranked, deterministically-truncated set. (This upgrades build-system
  affected-target selection: rank by **precomputed PPR importance** — genesis already maintains it (GEN-11) —
  with reverse-reachability `distance` demoted to a tiebreak, so a high-centrality hub 2 hops out correctly
  outranks a trivial leaf 1 hop away; then cap the frontier.) Forward `dependencies` MUST use the same rank
  and the same `K = 8` bound; `enclosing` / `governing` are already bounded by the hierarchy.
- **RETR-12 The curated `own` pack — zero-assembly by default.** Every scope-unit (`crate` / `module` /
  `service` / `feature`) MUST project into an **`own_<id>`** tool that returns a **curated `OwnPack`** — the
  briefing an owner needs, **pre-composed so the agent never chooses a scope or assembles a pack**. The
  composition MUST be **mechanical/deterministic** (index reads: the unit's `tier≥T1` invariants + terrain +
  a bounded `relate()` + scoped project-memory pointers) — **no LLM**, no free prose. It MUST be **capped**
  (a briefing budget, larger than a poke's `~150` but bounded, e.g. `~1–1.5K`, under the ceiling) and MUST
  carry **drill-down affordances** (`finer` units, `refresh`, `complement`) so more detail/granularity is
  **pull-reachable**, never inlined. A seat MUST receive its `own_<unit>` by default (pushed at dispatch or
  exposed as a tool); `crate`/`module` units are grounded by the tree, `service`/`feature` by a declared
  manifest (drift-checked). An `epic` is **not** a grounded `own` unit — it is a project-memory goal (an
  Orientation milestone spanning features); `own_<epic>` composes from that goal + the features' `OwnPack`s.
  **Dedup with a co-injected pack.** When a seat's `own` (`~1.5K`) and a poke `pack` (`~2K`) cover the same or
  an enclosing territory in the same turn, a fact carried in `own` MUST NOT be repeated in the co-injected
  pack (dedup by `nodeId`): `own` wins and the pack shows a `pull-reachable` pointer in its place, so the seat
  never pays for the same fact twice.
- **RETR-13 MISS-oracle — off-atlas coverage per territory.** The ledger MUST log, per territory, an
  **off-atlas rate**: the fraction of served turns in which a seat had to `Read`/`Grep` **outside the
  surfaced scope-set** to finish (the served pack under-covered the work). Where `hits` (RETR-8) measure the
  _precision_ of what was served, the off-atlas rate measures _coverage_ — the one silent failure the
  drift-oracle (RETR-3) cannot see, because unanchored knowledge has no grounding to drift. A territory whose
  off-atlas rate crosses a threshold MUST raise a **calibration prompt to author the missing tag/edge** (its
  structural keys under-cover that territory), turning invisible misses into a visible signal. The off-atlas
  ledger MUST be per-territory and deterministic; a territory with no served history MUST yield rate `0`,
  never a throw.

## Surface / API

```
resolve(scope: Path): Territory[]           // scope → covering territory/-ies via the index (§3.5)
own(unit: OwnUnit): OwnPack                  // the CURATED, zero-assembly briefing for a scope-unit (the `own_<id>` tool)
relate(unit: Path): RelationSet              // ALL nodes related to a touched unit, partitioned by relation kind
pack(territory: Territory): Pack             // ≤2K, tier≥T1 invariants, stale-flagged (§3.4)
poke(scope: Path): Poke | null              // scope-entry push; null if no covering knowledge
projectTools(scope: Path): NodeTool[]        // the current scope's nodes as MCP tools (retract off-scope)
budget(): Budget[]                           // per-kind caps + live hits + hitRate, for calibration (RETR-6/8)
offAtlas(): OffAtlas[]                        // per-territory coverage (MISS-oracle); high rate ⇒ author a missing tag/edge (RETR-13)
```

- `relate` is the deterministic answer to "**which nodes relate to what I'm touching?**" — it unions the
  three index axes (spatial roll-up + `depends-on` forward/reverse closure + territory) and returns them
  **partitioned by relation kind**, so the model reads a short labeled list and **never traverses the graph
  itself**. The closure work lives in the index; the model supplies only the unit (RETR-4 infers it from
  tool-call paths). The `dependents` band is **bounded, ranked, and honestly truncated** (RETR-11), so a
  hub node never returns most of the repo. The poke carries the same `RelationSet`; `atlas-query` surfaces
  it as its `related` band.

- `pack` and `poke` share one resolution path (§3.5) — drift and discovery are one structure, not two.
- `projectTools` MUST be called on scope-entry and its result retracted on scope-exit; it MUST NOT
  accumulate across scopes.

## Acceptance

1. **RETR-1** — Grep the retrieval layer: no embedding model, vector store, or RAG call. Two identical
   queries return byte-identical results.
2. **RETR-2** — Every emitted pack is `≤ ~2K` tokens; a territory with more T1 than fits carries all T0 in
   full + T1 by rank `(hits-desc, ppr-desc, nodeKey)`, then a truncation marker + pull-reachable tail (never a
   silent drop); a merged pack fills T0-first then by the same rank (no owner-territory proximity); no prose blob.
3. **RETR-3** — Drift a grounding backing a pack ⇒ `stale:true`; a `stale` pack is refused until re-grounded.
4. **RETR-4** — Navigate into a module ⇒ a poke fires with that module's pack, no explicit query issued;
   a rapid hop in-and-out of a scope fires **no** poke until it settles; re-entering an already-poked scope
   in the same session fires **no** second poke (poke-once-per-scope-per-session); a single-file `Read`/`Edit`
   drives scope, but a multi-file `Grep`/`Glob` and a `Bash` path-shaped arg (`cargo test -p foo`) do **not**.
5. **RETR-5** — On scope-entry only that scope's node-tools are exposed; on leaving they retract; the tool
   list never holds the whole graph.
6. **RETR-6** — Force injections whose sum exceeds `~5K` ⇒ kinds are dropped by observed hit-rate (least-used
   first) with `own` and `protocols.advisory` in the droppable set, the ceiling holds; `Awareness.constitution`
   and `protocols.safetyCritical` are never dropped; the cold-start default order applies before the ledger fills.
7. **RETR-7** — Each injection kind stays within its cap (Awareness `~400`, Orientation `~250`, project mem
   `~500`, pack `~2K`, protocols `~500`, poke `~150`).
8. **RETR-8** — Caps are read from / adjusted by the ledger `hits`, not a hard-coded constant divorced from
   usage; per-kind `hitRate` is exposed and drives the RETR-6 drop order.
9. **RETR-9** — A malformed scope returns an empty pack + empty tool set + no poke; nothing throws.
10. **RETR-10** — `relate` on a changed unit returns its enclosing roll-up, its reverse-closure dependents,
    its forward dependencies, and its governing territory, each **labeled** by relation kind; two identical
    calls are byte-identical; no LLM is in the path; `coChanged` appears only when explicitly requested.
11. **RETR-11** — `relate` on a node with `N` dependents (N ≫ K) returns a set cut at `maxHops=2`, ranked
    `tier-desc, ppr-desc, distance-asc, nodeKey-asc`, capped at `K=8`, with `dependents_meta.truncated: true`
    and the honest `total` = N; a high-PPR hub 2 hops out outranks a low-PPR leaf 1 hop in; forward
    `dependencies` are bound at the same `K=8`; two identical calls truncate to the byte-identical set.
12. **RETR-12** — `own_<unit>` returns a curated `OwnPack` (`≤ ~1.5K`) assembled by index reads alone (no
    LLM, no free prose), carrying `drill.finer/refresh/complement`; a seat receives its `own` without
    choosing a scope or calling `relate`/`query`; an `epic` resolves via its Orientation goal + the
    features' `OwnPack`s, not as a grounded node; two identical `own_<unit>` calls are byte-identical. A seat
    co-injected `own` + a pack for the same/enclosing territory sees each fact once (dedup by `nodeId`, `own`
    wins, pack shows a pointer).
13. **RETR-13** — A territory where seats repeatedly `Read`/`Grep` outside the surfaced scope-set records a
    rising off-atlas rate; crossing the threshold raises a calibration prompt to author the missing tag/edge;
    a territory with no served history reports rate `0` and never throws; two identical reads are byte-identical.
