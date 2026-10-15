# Requirements — Block RET (retrieval) · S1 lift-and-tag

### REQ-RETR-1 — relevance from structural index only

source: INV-RETR-1 @ reference/atlas-retrieval.md#retr-1
The retrieval layer shall resolve relevance only by scope, dependency, and trigger over the hashed structural index.
normative-clause: "relevance is resolved only by scope / dependency / trigger over the hashed index"

### REQ-RETR-2a — pack token cap

source: INV-RETR-2 @ reference/atlas-retrieval.md#retr-2
The retrieval layer shall keep every pack within `≤ ~2K` tokens.
normative-clause: "Every pack MUST be `≤ ~2K` tokens"

### REQ-RETR-2b — fill T0 in full then T1 by rank

source: INV-RETR-2 @ reference/atlas-retrieval.md#retr-2
The retrieval layer shall fill a pack with every T0 invariant of its territory in full, then T1 by rank `(hits-desc, ppr-desc, nodeKey-asc)` until the cap.
normative-clause: "It MUST carry every **T0** invariant of its territory **in full**, then **T1 by rank until the cap** — where within-tier **rank = `(hits-desc, ppr-desc, nodeKey-asc)`**"

### REQ-RETR-2c — cap wins, never silent drop

source: INV-RETR-2 @ reference/atlas-retrieval.md#retr-2
If a pack reaches its token cap, then the retrieval layer shall emit a truncation marker and a `pull-reachable` tail instead of silently dropping an invariant.
normative-clause: "Then a **truncation marker + a `pull-reachable` tail** — the cap wins over completeness, never a silent drop"

### REQ-RETR-2d — merged pack total budget

source: INV-RETR-2 @ reference/atlas-retrieval.md#retr-2
The retrieval layer shall budget a merged pack over `K` covering territories to `≤ ~2K` total.
normative-clause: "A **merged** pack over `K` covering territories is budgeted `≤ ~2K` **total**"

### REQ-RETR-2e — merged pack fill order

source: INV-RETR-2 @ reference/atlas-retrieval.md#retr-2
The retrieval layer shall fill a merged pack T0-first, then by the same `(hits-desc, ppr-desc)` rank.
normative-clause: "filled **T0-first, then by the same `(hits-desc, ppr-desc)` rank** — \"owner-territory proximity\" is retired in favor of PPR, so a high-centrality hub outranks a merely-closer leaf"

### REQ-RETR-2f — no free prose in a pack

source: INV-RETR-2 @ reference/atlas-retrieval.md#retr-2
The retrieval layer shall include no free prose in a pack, carrying only 1-line structured `PackInvariant`s.
normative-clause: "A pack MUST NOT contain free prose — only 1-line structured `PackInvariant`s"

### REQ-RETR-3a — stale pack not trusted

source: INV-RETR-3 @ reference/atlas-retrieval.md#retr-3
If a pack's `stale` is `true`, then the retrieval layer shall not trust it as-is.
normative-clause: "A pack whose `stale` is `true` MUST NOT be trusted as-is"

### REQ-RETR-3b — stale pack re-grounded before use

source: INV-RETR-3 @ reference/atlas-retrieval.md#retr-3
If a pack's `stale` is `true`, then the retrieval layer shall re-ground it before use.
normative-clause: "it MUST be re-grounded before use"

### REQ-RETR-3c — stale equals a backing drifted

source: INV-RETR-3 @ reference/atlas-retrieval.md#retr-3
The retrieval layer shall set a pack's `stale` to true exactly when any grounding backing the pack drifted.
normative-clause: "`stale` MUST equal \"any grounding backing this pack drifted\" — never a guess"

### REQ-RETR-4a — poke event source is the tool-call hook

source: INV-RETR-4 @ reference/atlas-retrieval.md#retr-4
The retrieval layer shall source every poke event from the harness tool-call hook (the push tier of TOOLS-11), inferring the scope from the paths in the navigator's tool calls.
normative-clause: "The poke's **event source** MUST be the harness tool-call hook — the **push tier of TOOLS-11** — from which scope is inferred (file/folder/module/crate) via the paths in the navigator's tool calls"

### REQ-RETR-4b — single-file call is a navigation signal

source: INV-RETR-4 @ reference/atlas-retrieval.md#retr-4
When a navigator issues an `Edit`, `Read`, or `Write` on a single file path, the retrieval layer shall treat it as a navigation signal whose scope is that file's node.
normative-clause: "an `Edit`/`Read`/`Write` on a **single file path** IS a navigation signal (scope = that file's node)"

### REQ-RETR-4c — multi-file Grep/Glob suppressed

source: INV-RETR-4 @ reference/atlas-retrieval.md#retr-4
If a `Grep` or `Glob` spans multiple files, then the retrieval layer shall suppress the poke.
normative-clause: "a **multi-file `Grep`/`Glob`** spanning many files has **no single scope** and MUST be suppressed (no poke)"

### REQ-RETR-4d — Bash path-arg is not navigation

source: INV-RETR-4 @ reference/atlas-retrieval.md#retr-4
If a `Bash` call carries a path-shaped argument, then the retrieval layer shall not infer a scope from it.
normative-clause: "a `Bash` **path-shaped argument is NOT navigation** (`cargo test -p foo` is a command, not a location) and MUST NOT infer scope"

### REQ-RETR-4e — only single-file navigation drives scope-change

source: INV-RETR-4 @ reference/atlas-retrieval.md#retr-4
The retrieval layer shall let only a resolved single-file navigation signal drive a scope-change.
normative-clause: "Only a resolved single-file navigation signal MAY drive a scope-change"

### REQ-RETR-4f — scope-entry fires an unasked poke

source: INV-RETR-4 @ reference/atlas-retrieval.md#retr-4
When a navigator crosses into a new scope, the retrieval layer shall fire a poke injecting a compact notice and that scope's pack, unasked.
normative-clause: "Crossing into a new scope MUST fire a poke injecting a compact notice + that scope's pack, unasked"

### REQ-RETR-4g — poke fires only after debounce settles

source: INV-RETR-4 @ reference/atlas-retrieval.md#retr-4
When a scope change occurs, the retrieval layer shall fire its poke only after the change settles as the current scope across a debounce window of `N = 2` consecutive tool calls.
normative-clause: "a scope change MUST _settle_ (remain the current scope across a debounce window of **`N = 2` consecutive tool calls**) before its poke fires"

### REQ-RETR-4h — transient crossings do not poke

source: INV-RETR-4 @ reference/atlas-retrieval.md#retr-4
If a scope crossing is transient (in and out), then the retrieval layer shall not poke.
normative-clause: "transient in-and-out crossings MUST NOT poke"

### REQ-RETR-4i — poke at most once per scope per session

source: INV-RETR-4 @ reference/atlas-retrieval.md#retr-4
If a scope has already been poked in the current session, then the retrieval layer shall not re-poke on re-entry or on reasoning over the already-injected pack.
normative-clause: "A poke MUST fire **at most once per scope per session** — re-entering an already-poked scope, or a seat merely reasoning over an already-injected pack (which emits no new path event), MUST NOT re-poke"

### REQ-RETR-5a — only current-scope nodes as tools

source: INV-RETR-5 @ reference/atlas-retrieval.md#retr-5
The retrieval layer shall expose only nodes covering the current scope as MCP tools at once.
normative-clause: "Only nodes covering the **current** scope MAY be exposed as MCP tools at once"

### REQ-RETR-5b — retract tools on leaving scope

source: INV-RETR-5 @ reference/atlas-retrieval.md#retr-5
When the navigator leaves a scope, the retrieval layer shall retract that scope's node-tools.
normative-clause: "on leaving the scope they MUST retract"

### REQ-RETR-5c — never project the whole graph

source: INV-RETR-5 @ reference/atlas-retrieval.md#retr-5
The retrieval layer shall not project the whole graph as tools simultaneously.
normative-clause: "The whole graph MUST NOT be projected as tools simultaneously"

### REQ-RETR-6a — injection ceiling per turn

source: INV-RETR-6 @ reference/atlas-retrieval.md#retr-6
The retrieval layer shall keep the sum of everything auto-injected in a turn within a hard ceiling of `~5K` tokens.
normative-clause: "The SUM of everything auto-injected in a turn MUST respect a hard ceiling of `~5K` tokens (~3–5% of context)"

### REQ-RETR-6b — drop by hit-rate on overflow

source: INV-RETR-6 @ reference/atlas-retrieval.md#retr-6
If the auto-injected sum would exceed the ceiling, then the retrieval layer shall drop droppable kinds by observed per-kind hit-rate, least-used first.
normative-clause: "If the sum would exceed it, droppable kinds MUST be dropped by **observed per-kind hit-rate — least-used first** (the RETR-8 `hitRate` ledger), never in an undefined or purely-hardcoded order"

### REQ-RETR-6c — two pins never drop

source: INV-RETR-6 @ reference/atlas-retrieval.md#retr-6
If a drop is required, then the retrieval layer shall never drop `Awareness.constitution` or `protocols.safetyCritical`.
normative-clause: "**Two kinds are exempt and MUST NOT drop, ever:** `Awareness.constitution` (T0) and `protocols.safetyCritical` (T0-adjacent)"

### REQ-RETR-6d — cold-start default drop order

source: INV-RETR-6 @ reference/atlas-retrieval.md#retr-6
While the ledger has no data, the retrieval layer shall apply the documented cold-start default drop order.
normative-clause: "The documented **cold-start default** — used only until the ledger has data, highest-priority first, dropped from the bottom — is: `Awareness.constitution(T0)` _[pin]_ → `protocols.safetyCritical` _[pin]_ → `Orientation` → `project-Rules` → `own (curated briefing)` → `pack (T0 in full, then T1 by rank)` → `related (dependents by rank)` → `protocols.advisory` → `poke notice` → `Awareness tail`"

### REQ-RETR-6e — ledger-driven reorder once data exists

source: INV-RETR-6 @ reference/atlas-retrieval.md#retr-6
While the ledger has data, the retrieval layer shall reorder every kind except the two pins by observed hit-rate, dropping the least-used first.
normative-clause: "Once the ledger has data, every kind except the two pins MUST reorder by observed hit-rate (drop the least-used first)"

### REQ-RETR-6f — per-kind drop-counter ledgered

source: INV-RETR-6 @ reference/atlas-retrieval.md#retr-6
The retrieval layer shall ledger a per-kind drop-counter.
normative-clause: "A drop-counter per kind MUST be ledgered (a kind dropped `>20%` of turns is mis-capped or mis-prioritized)"

### REQ-RETR-7a — per-type sweet-spot caps

source: INV-RETR-7 @ reference/atlas-retrieval.md#retr-7
The retrieval layer shall keep each injection kind within its own sweet-spot cap.
normative-clause: "Each injection kind MUST respect its own sweet-spot cap: Awareness `~400`, Orientation `~250`, project memory `~500` (**orchestrator `~800`**), **`own` briefing `~1.5K`**, pack `~2K`, **`related` band `~300`**, protocols `~500` (`safetyCritical` + `advisory` share this cap), poke `~150`"

### REQ-RETR-7b — no single kind consumes the ceiling

source: INV-RETR-7 @ reference/atlas-retrieval.md#retr-7
The retrieval layer shall not let a single kind consume the whole ceiling.
normative-clause: "A single kind MUST NOT consume the whole ceiling"

### REQ-RETR-7c — Awareness and Orientation are never written

source: INV-RETR-7 @ reference/atlas-retrieval.md#retr-7
The retrieval layer shall derive Awareness and Orientation without ever writing them.
normative-clause: "Awareness + Orientation are derived (never written); only project memory is a written per-member entry"

### REQ-RETR-7d — caps enforced under the pinned measure

source: INV-RETR-7 @ reference/atlas-retrieval.md#retr-7
The retrieval layer shall enforce every cap and the RETR-6 ceiling under the pinned cap measure.
normative-clause: "Every cap here — and the RETR-6 ceiling — MUST be enforced under the **pinned cap measure**"

### REQ-RETR-8a — caps tuned by observed hits

source: INV-RETR-8 @ reference/atlas-retrieval.md#retr-8
The retrieval layer shall tune caps by the ledger's observed `hits`, never by static guesswork.
normative-clause: "Caps MUST be tuned by the ledger's observed `hits` (what injected knowledge was actually used), never by static guesswork"

### REQ-RETR-8b — hitRate drives the drop order

source: INV-RETR-8 @ reference/atlas-retrieval.md#retr-8
The retrieval layer shall use per-kind `hitRate` to drive the RETR-6 drop order, least-used dropped first.
normative-clause: "its per-kind **`hitRate`** MUST also drive the RETR-6 drop order (least-used dropped first)"

### REQ-RETR-9a — malformed scope yields empty results

source: INV-RETR-9 @ reference/atlas-retrieval.md#retr-9
If a territory or scope is malformed or missing, then the retrieval layer shall yield an empty pack, an empty tool set, and no poke.
normative-clause: "A malformed or missing territory/scope MUST yield an empty pack / empty tool set / no poke"

### REQ-RETR-9b — malformed scope never throws

source: INV-RETR-9 @ reference/atlas-retrieval.md#retr-9
If a territory or scope is malformed or missing, then the retrieval layer shall not throw.
normative-clause: "never a throw"

### REQ-RETR-10a — relate computed purely from the index axes

source: INV-RETR-10 @ reference/atlas-retrieval.md#retr-10
The retrieval layer shall compute `relate(unit)`'s related-node set purely from the index's three axes.
normative-clause: "`relate(unit)` MUST return the exact related-node set computed purely from the index's three axes (spatial roll-up + `depends-on` forward & reverse closure + territory)"

### REQ-RETR-10b — relate partitioned by relation kind

source: INV-RETR-10 @ reference/atlas-retrieval.md#retr-10
The retrieval layer shall return `relate`'s set partitioned by relation kind.
normative-clause: "**partitioned by relation kind** (`enclosing` / `dependents` / `dependencies` / `governing` / optional `coChanged`)"

### REQ-RETR-10c — relate deterministic

source: INV-RETR-10 @ reference/atlas-retrieval.md#retr-10
The retrieval layer shall make `relate` deterministic, byte-identical for equal input.
normative-clause: "It MUST be deterministic (byte-identical for equal input)"

### REQ-RETR-10d — relate consults no LLM

source: INV-RETR-10 @ reference/atlas-retrieval.md#retr-10
The retrieval layer shall not consult an LLM when computing `relate`.
normative-clause: "MUST NOT consult an LLM; the model supplies only the touched unit — the closure is the index's job, never the model's"

### REQ-RETR-10e — coChanged is opt-in

source: INV-RETR-10 @ reference/atlas-retrieval.md#retr-10
Where `coChanged` is explicitly requested, the retrieval layer shall include it as opt-in.
normative-clause: "`coChanged` is git-history-derived (deterministic but correlational) and MUST be opt-in"

### REQ-RETR-10f — coChanged labeled and kept separate

source: INV-RETR-10 @ reference/atlas-retrieval.md#retr-10
The retrieval layer shall present `coChanged` labeled and never mixed into the structural bands.
normative-clause: "labeled, never mixed into the structural bands"

### REQ-RETR-11a — dependents cut at maxHops

source: INV-RETR-11 @ reference/atlas-retrieval.md#retr-11
The retrieval layer shall cut the `dependents` reverse closure at a max hop-distance `maxHops = 2` from the unit.
normative-clause: "cut at a **max hop-distance `maxHops = 2`** from the unit"

### REQ-RETR-11b — dependents deterministic rank

source: INV-RETR-11 @ reference/atlas-retrieval.md#retr-11
The retrieval layer shall order `dependents` by the deterministic rank `tier` descending, then `ppr` descending, then `distance` ascending, then `nodeKey` ascending.
normative-clause: "ordered by a **deterministic rank** — `tier` descending, then **`ppr` descending** (the precomputed PPR importance, GEN-11), then `distance` ascending (demoted to a tiebreak), then `nodeKey` ascending"

### REQ-RETR-11c — dependents capped at K

source: INV-RETR-11 @ reference/atlas-retrieval.md#retr-11
The retrieval layer shall cap `dependents` at a hard count `K = 8` one-line `RelatedFact`s.
normative-clause: "capped at a hard count **`K = 8`** one-line `RelatedFact`s"

### REQ-RETR-11d — truncate after ranking with honest meta

source: INV-RETR-11 @ reference/atlas-retrieval.md#retr-11
If the closure exceeds `K`, then the retrieval layer shall truncate the set after ranking and carry `dependents_meta.truncated: true` with the honest `total` and `returned`.
normative-clause: "When the closure exceeds `K` the set MUST be truncated **after ranking** and MUST carry `dependents_meta.truncated: true` with the honest `total` (full pre-truncation count) and `returned`"

### REQ-RETR-11e — forward dependencies same bound

source: INV-RETR-11 @ reference/atlas-retrieval.md#retr-11
The retrieval layer shall bound forward `dependencies` by the same rank and the same `K = 8`.
normative-clause: "Forward `dependencies` MUST use the same rank and the same `K = 8` bound"

### REQ-RETR-12a — scope-unit projects an own tool

source: INV-RETR-12 @ reference/atlas-retrieval.md#retr-12
The retrieval layer shall project every scope-unit into an `own_<id>` tool that returns a curated `OwnPack`.
normative-clause: "Every scope-unit (`crate` / `module` / `service` / `feature`) MUST project into an **`own_<id>`** tool that returns a **curated `OwnPack`**"

### REQ-RETR-12b — OwnPack pre-composed, zero-assembly

source: INV-RETR-12 @ reference/atlas-retrieval.md#retr-12
The retrieval layer shall pre-compose the `OwnPack` so the agent never chooses a scope or assembles a pack.
normative-clause: "**pre-composed so the agent never chooses a scope or assembles a pack**"

### REQ-RETR-12c — OwnPack composed mechanically from index reads

source: INV-RETR-12 @ reference/atlas-retrieval.md#retr-12
The retrieval layer shall compose the `OwnPack` mechanically and deterministically from index reads.
normative-clause: "The composition MUST be **mechanical/deterministic** (index reads: the unit's `tier≥T1` invariants + terrain + a bounded `relate()` + scoped project-memory pointers)"

### REQ-RETR-12d — OwnPack uses no LLM

source: INV-RETR-12 @ reference/atlas-retrieval.md#retr-12
The retrieval layer shall use no LLM to compose an `OwnPack`.
normative-clause: "**no LLM**"

### REQ-RETR-12e — OwnPack carries no free prose

source: INV-RETR-12 @ reference/atlas-retrieval.md#retr-12
The retrieval layer shall include no free prose in an `OwnPack`.
normative-clause: "no free prose"

### REQ-RETR-12f — OwnPack capped under the ceiling

source: INV-RETR-12 @ reference/atlas-retrieval.md#retr-12
The retrieval layer shall cap the `OwnPack` at a bounded briefing budget under the ceiling.
normative-clause: "It MUST be **capped** (a briefing budget, larger than a poke's `~150` but bounded, e.g. `~1–1.5K`, under the ceiling)"

<!-- SCOPE OF THIS CLAUSE AFTER REQ-RETR-12m (2026-08-03), stated here because the budget is now shared by
     two bands rather than filled by one. The `OWN_CAP` total does NOT change and this clause is unamended:
     `OWN_ADVISORY_CAP` is a SUB-cap inside the same 1500, filled LAST, so `tokenEstimate ≤ OWN_CAP` holds
     exactly as before and a briefing whose governing band fills the budget serves zero advisory rows. -->

### REQ-RETR-12g — OwnPack drill-down affordances

source: INV-RETR-12 @ reference/atlas-retrieval.md#retr-12
The retrieval layer shall equip the `OwnPack` with drill-down affordances so more detail is pull-reachable, never inlined.
normative-clause: "MUST carry **drill-down affordances** (`finer` units, `refresh`, `complement`) so more detail/granularity is **pull-reachable**, never inlined"

### REQ-RETR-12h — seat receives its own by default

source: INV-RETR-12 @ reference/atlas-retrieval.md#retr-12
The retrieval layer shall deliver each seat its `own_<unit>` by default.
normative-clause: "A seat MUST receive its `own_<unit>` by default (pushed at dispatch or exposed as a tool)"

### REQ-RETR-12i — grounding source by unit level

source: INV-RETR-12 @ reference/atlas-retrieval.md#retr-12
The retrieval layer shall ground `crate`/`module` units by the tree and `service`/`feature` units by a declared, drift-checked manifest.
normative-clause: "`crate`/`module` units are grounded by the tree, `service`/`feature` by a declared manifest (drift-checked)"

### REQ-RETR-12j — epic is not a grounded own unit

source: INV-RETR-12 @ reference/atlas-retrieval.md#retr-12
If a unit is an `epic`, then the retrieval layer shall not treat it as a grounded `own` unit.
normative-clause: "An `epic` is **not** a grounded `own` unit"

### REQ-RETR-12l — compose own_epic from goal and feature packs

source: INV-RETR-12 @ reference/atlas-retrieval.md#retr-12
When a unit is an `epic`, the retrieval layer shall compose `own_<epic>` from its project-memory goal and the features' `OwnPack`s.
normative-clause: "`own_<epic>` composes from that goal + the features' `OwnPack`s"

### REQ-RETR-12k — dedup own against co-injected pack

source: INV-RETR-12 @ reference/atlas-retrieval.md#retr-12
If a seat's `own` and a co-injected pack cover the same or an enclosing territory in one turn, then the retrieval layer shall not repeat an `own` fact in the pack, deduping by `nodeId` with `own` winning and the pack showing a `pull-reachable` pointer.
normative-clause: "a fact carried in `own` MUST NOT be repeated in the co-injected pack (dedup by `nodeId`): `own` wins and the pack shows a `pull-reachable` pointer in its place"

### REQ-RETR-12m — the own briefing is two separately bounded bands [AMENDED 2026-08-03]

source: INV-RETR-12 @ reference/atlas-retrieval.md#retr-12 (extends ADR-0013 / REQ-TOOLS-6f from `atlas-query` to `atlas-own`)
The `own_<scope>` briefing shall carry a GOVERNING band of `tier≥T1` facts and a separate ADVISORY band of `T2` rows under its own sub-cap INSIDE the unchanged `OWN_CAP` total; both bands shall be stated as tier MEMBERSHIP, so a row whose tier is off the lattice lands in NEITHER; the governing band shall keep priority, so no advisory row may displace a ratified one; every advisory row shall carry its own `Freshness` verdict and be rendered under its own line verb, never interleaved with the governing bands; and where the advisory sub-cap truncates, the briefing shall report the dropped count and name every refused row in its existing pull-reachable tail.
normative-clause: "two separately bounded, separately rendered bands on this door as on the pack; an unrecognized tier is in neither; the governing band is served first and the total budget does not grow; 0 silent drops"

<!-- AMENDMENT, 2026-08-03. WHAT THIS REVERSES, and the measurement that forced it. `own-source.ts` applied
     `atLeastT1` (TOOLS-6) to BOTH fact sections, on a stated rationale that had expired: "the alternative is
     a read door that serves a `T2` … that `atlas query` is correctly declining to show. A second read door
     with a laxer bound is a route around the first one." ADR-0013 (owner-ratified 2026-08-03) made `query`
     serve `T2` in a separately capped ADVISORY band, so `query` declines nothing of the sort. `REQ-TOOLS-6f`
     as landed reads "The `atlas-query` pack shall…" — the amendment was scoped to one door and never
     reached this one, and `wp-per-fact-freshness.md` recorded that as a deliberate exclusion.
     MEASURED through the built binary against this repository's own 199-fact mined store, where every fact
     is `T2`: `atlas own packages/adapter-io/src/policy.ts` answered `0 invariant(s), 0 gotcha(s)` while
     `atlas query` on the same path from the same store served the row. Two read doors over one store
     disagreeing about what the store contains.
     WHAT IS NOT AMENDED: REQ-RETR-12c/-12f (the composition and the cap) — the total budget is unchanged and
     the advisory band is a sub-cap inside it. `INV-RETR-12` (`reference/atlas-retrieval.md#retr-12`) still
     states "the unit's `tier≥T1` invariants" as a statement about the WHOLE briefing; amending a ratified
     INVARIANT is ADR-0013's own declared surface, exactly as `wp-per-fact-freshness.md` recorded for
     `atlas-tools.md#tools-6`, so it is registered here as a live REQ-vs-INV divergence rather than
     straddled silently. -->

### REQ-RETR-13a — log off-atlas rate per territory

source: INV-RETR-13 @ reference/atlas-retrieval.md#retr-13
The retrieval layer shall log, per territory, an off-atlas rate — the fraction of served turns in which a seat had to `Read`/`Grep` outside the surfaced scope-set to finish.
normative-clause: "The ledger MUST log, per territory, an **off-atlas rate**: the fraction of served turns in which a seat had to `Read`/`Grep` **outside the surfaced scope-set** to finish (the served pack under-covered the work)"

### REQ-RETR-13b — threshold raises a calibration prompt

source: INV-RETR-13 @ reference/atlas-retrieval.md#retr-13
If a territory's off-atlas rate crosses its threshold, then the retrieval layer shall raise a calibration prompt to author the missing tag/edge.
normative-clause: "A territory whose off-atlas rate crosses a threshold MUST raise a **calibration prompt to author the missing tag/edge**"

### REQ-RETR-13c — off-atlas ledger deterministic

source: INV-RETR-13 @ reference/atlas-retrieval.md#retr-13
The retrieval layer shall keep the off-atlas ledger deterministic.
normative-clause: "The off-atlas ledger MUST be per-territory and deterministic"

### REQ-RETR-13d — no history yields rate zero

source: INV-RETR-13 @ reference/atlas-retrieval.md#retr-13
If a territory has no served history, then the retrieval layer shall yield an off-atlas rate of `0`.
normative-clause: "a territory with no served history MUST yield rate `0`"

### REQ-RETR-13e — no history never throws

source: INV-RETR-13 @ reference/atlas-retrieval.md#retr-13
If a territory has no served history, then the retrieval layer shall not throw.
normative-clause: "never a throw"

## [NEEDS RECONCILIATION]

- INV-RETR-13: the off-atlas "threshold" that triggers the calibration prompt (REQ-RETR-13b) is normative in behaviour but carries no value in the reference clause — the number is silent; route to DEFINE so S3 can write a concrete golden.
