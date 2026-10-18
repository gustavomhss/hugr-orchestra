# ADR-0013 — the pack has two bands: governing and advisory

- **Status:** **Accepted (2026-08-03) — IMPLEMENTED IN CODE AND IN THE REQUIREMENT LAYER; THE INVARIANT
  TEXT THIS ADR CLAIMS TO AMEND IS STILL UNAMENDED.** Read the `Amends` bullet below against this, because
  the loop it describes closes on nothing: `req-tls.md:89-95` defers amending `INV-TOOLS-6` to _"ADR-0013's
  own declared surface"_, this ADR names `INV-TOOLS-6` as a surface it amends, and
  `reference/atlas-tools.md:53` still reads _"return a `≤ ~2K` pack of `tier≥T1` invariants"_ as a statement
  about the whole pack. `reference/atlas-retrieval.md:139` is the same for `RETR-12`. Both are recorded as
  live divergences in the requirement layer, so they are declared rather than hidden — and they are open.
  **A third one is not merely a document:** `packages/tools/src/handler.ts:143`, the `atlas-query` MCP tool
  `description` that every client shows a calling agent, still promises _"the merged covering pack of
  `tier>=T1` invariants"_ while the tool returns the advisory band too. The sibling `invariant` string
  (`:77`) was corrected; this one was not. Tracked separately; it is a product defect, not a doc lag, and it
  contradicts clause 3 of this ADR at the first place a reader looks. The owner ratified the _substance_ on 2026-08-03
  ("advisory facts enter the pack, marked as advisory and kept separate from the governing ones"). This ADR
  was first recorded **BLOCKED — deliberately not implemented**, because measurement showed the amendment
  could not be landed honestly without a **second** amendment to a **separately ratified** decision
  (`REQ-TOOLS-6d` / ADR-0002) and a change to the **frozen `Pack` contract** — see §"Why this ADR ships
  without its code", which is that measurement. Both preconditions were then met and the decision shipped:

  | ADR-0013 clause                                                                  | landed by        |
  | -------------------------------------------------------------------------------- | ---------------- |
  | `REQ-TOOLS-6d` amended · ADR-0002 amended · `PackInvariant.freshness` added      | `2cbc5cc` (#107) |
  | clauses 1–4 (two bands) on `atlas-query`, advisory cap `2000`                    | `2cbc5cc` (#107) |
  | clause 5 (every row carries its own freshness verdict)                           | `2cbc5cc` (#107) |
  | extended to `atlas own` via `REQ-RETR-12m`, `OWN_ADVISORY_CAP = OWN_CAP/2 = 750` | `0befe4c` (#112) |

  **Everything below this header block is the record as written on 2026-08-03 and is deliberately
  unamended.** Its present-tense statements about source describe the tree it was grounded against
  (`d079b0f`), not the tree that shipped the amendment; the two commits above moved several of the exact
  lines it cites. Retrofitting the body to look prescient would destroy the only thing that makes the
  measurement worth keeping.

- **Spec author:** lead, grounded against `origin/master` `d079b0f` and measured on the built binary against
  the real 199-fact projection mined from Atlas at `8ada771b`.
- **Amends (ratified surfaces):** `INV-TOOLS-6`, `REQ-TOOLS-6b`, and the `TOOLS-6` guidance string the CLI
  prints on every query (`packages/tools/src/handler.ts:74`).
- **Required, and did NOT itself carry:** an amendment to `REQ-TOOLS-6d` / ADR-0002, and a `PackInvariant`
  field in `@atlas/contracts`. Both are named below with the measurement that made them preconditions; both
  landed in `2cbc5cc` (#107).
- **Does NOT amend:** `REQ-TOOLS-6a`, `REQ-TOOLS-6c`, `RETR-2`, `RETR-7`, `INV-TOOLS-10`. Why each survives
  is stated, because "it survives" is a claim to defend rather than assume.

## Context — the gap, quoted rather than paraphrased

Atlas mined 199 facts from its own source. Every one is durable, addressable, `kind: advisory`, `tier: T2`.
Every one is invisible to `atlas query`, because the pack bound is stated as a floor at `T1`.

`TOOLS-6` (`docs/reference/atlas-tools.md:53`):

> "**TOOLS-6 `atlas-query` returns a bounded pack.** It MUST accept any scope (file/folder/module/crate),
> resolve it through the index to the covering territory/-ies, and return a `≤ ~2K` pack of `tier≥T1`
> invariants; `stale:true` MUST mean re-ground before trusting (§6.1)."

`REQ-TOOLS-6b` (`docs/requirements/req-tls.md:84`) restates it as the normative clause
_"return a `≤ ~2K` pack of `tier≥T1` invariants"_, and `packages/tools/src/handler.ts:74` prints it to the
user on **every** invocation:

> `invariant: TOOLS-6: bounded read projection (tier>=T1)`

**There is a second copy of that string, and it is the one a reader looking for it will find first.**
`packages/tools/src/query.ts:41` exports `QUERY_GUIDANCE`, documented as "the `next + invariant` guidance the
query read surface ships on its result envelope … the same intent the handler stamps for `atlas-query`". It
has **zero production callers** — the only importer in the monorepo is
`packages/tools/test/wp-7.26-b-tools.test.ts`, which asserts both fields are non-empty and nothing more — and
the two strings have already drifted: the exported one reads
`TOOLS-6: bounded read projection (tier>=T1, stale-flagged) — never a global dump`, which no user has ever
seen. Any implementation of this amendment must change **`handler.ts`**; changing only `query.ts` would
produce a green suite and an unchanged product.

The bound is implemented in three places and all three agree: `packages/tools/src/query.ts:57`,
`packages/adapter-io/src/pack-shape.ts:42` (both `isTier(t) && t !== 'T2'`), and
`packages/retrieval/src/pack.ts:148` (`c.tier === 'T0' || c.tier === 'T1'`).

Measured on the built binary, in a scratch repo carrying the real projection, on a scope where 23 facts
demonstrably exist:

```
$ atlas query packages/kernel
status: ok
next: re-ground stale packs before trusting; scope must be a path string
invariant: TOOLS-6: bounded read projection (tier>=T1)
data:
  stale: false
  tokenEstimate: 0
# exit 0
```

## Decision

**The pack is two bands, not one filtered list.** The `tier≥T1` floor stops being a filter over one list and
becomes the boundary between two separately bounded, separately rendered bands.

1. **The governing band is reserved, not merely preserved.** `tier≥T1` under the pinned `~2K` cap, with the
   same within-tier rank, the same cap-wins truncation and the same `pull`-reachable tail. Its budget cannot
   be spent by an advisory row, so its contents are byte-identical to what `TOOLS-6` served before.
2. **The advisory band is additive and separately capped.** `T2` rows under their **own** budget, drawn from
   the existing bound vocabulary (`PACK_CAP` / `CAP_CEILING` / `capFor`) and constrained by the already
   ratified `RETR-7b` ceiling: `PACK_CAP + <advisory cap> < CAP_CEILING`. The constant itself is left for the
   owner — pinning a number here would be inventing one, which ADR-0011's Decision-4 discipline forbids. The
   ratified rule bounds it to `(0, 3000)`; a point in that range is a ratification, not a derivation.
3. **The bands are never interleaved and never share a line form.** A reader who stops at the governing band
   loses nothing it had before the amendment, and no machine-proposed `T2` claim can be read as a ratified
   `T0`/`T1` invariant by looking at the line it arrived on.
4. **`tokenEstimate` is the size of what was returned** — both bands — never of one band alone.
5. **An advisory row carries its own freshness verdict, or it is not served.** Totality, in the same shape
   ADR-0012 gave the obviousness score: an advisory row without a per-row freshness verdict is a defect, not
   a default.

### The amended normative clause

> **TOOLS-6 — `atlas-query` returns a bounded pack of two bands.** It MUST accept any scope
> (file/folder/module/crate), resolve it through the index to the covering territory/-ies, and return a pack
> composed of two **separately bounded, separately rendered** bands.
>
> The **governing band** carries `tier≥T1` invariants under the pinned `~2K` pack cap. Its budget is
> **reserved**: no advisory row may displace a governing one, and the band's contents, order, cap-wins
> truncation and `pull`-reachable tail are unchanged by the presence of an advisory band.
>
> The **advisory band** carries `T2` rows under a **separate** cap from the same ratified cap-table, subject
> to the `RETR-7b` ceiling (`pack cap + advisory cap < CAP_CEILING`). It MUST be rendered under its own
> heading with its own line verb; it MUST NOT be interleaved with the governing band and MUST NOT reuse the
> governing band's line form. **A `T2` row is a machine proposal that passed no ratifier, and the output MUST
> make that unmistakable without the reader parsing a tier letter.**
>
> `tokenEstimate` MUST account for **both** bands — it is the size of what was actually returned.
>
> `stale:true` MUST mean re-ground before trusting (§6.1). **Every advisory row MUST carry its own freshness
> verdict**; an advisory row served without one is a defect, not a default. A pack-level flag is sufficient
> for the governing band, whose rows a human ratified, and is **not** sufficient for the advisory band, whose
> rows nobody did.

## What did NOT change, and why each survives

- **`REQ-TOOLS-6a` (scope resolution)** — untouched. The amendment changes what a covering territory yields,
  never how a scope resolves to one.
- **`REQ-TOOLS-6c` (`stale` means re-ground)** — untouched, and deliberately _not_ weakened. Clause 5 adds a
  per-row obligation on top of it; it does not relax the pack-level one.
- **`RETR-2` / `RETR-7` (the bounded fill, the cap-table)** — untouched. The advisory band reuses `capFor`
  and the cap-wins rule rather than introducing a second bounding discipline. There is no new rank: the
  within-tier comparator `(hits-desc, ppr-desc, nodeKey-asc)` orders the advisory band exactly as it orders
  the governing one, and the tier lattice (`tierRank`, `@atlas/knowledge`) stays the one ordering.
- **`INV-TOOLS-10` (`atlas node`)** — untouched here, and this is the honest limit of the ADR's scope, not an
  endorsement. §"What this ADR does not close" records what `node` still cannot say.
- **The write doors** — untouched. This is a read-projection amendment. Nothing about admission, tier
  assignment or ratification moves. A `T2` row appears in a pack because it is stored, not because anything
  promoted it.

## Why this ADR ships without its code

Clause 5 is not decoration. It is what separates this amendment from making the product worse, and it is the
clause the measurement killed.

**Today's silence has one virtue: it is silent.** Admitting 199 machine-proposed claims into a surface that
_has_ a freshness field, under a flag that cannot say which of them rotted, is worse than not admitting them.

### What was measured

The graph was mined at `8ada771b`. Labelled set: `git diff --name-only 8ada771b origin/master` marks **17**
of the 199 facts as anchored at a file that changed, and **182** as anchored at a file that did not. Three
tree states, all through the built binary or the built (`dist/`) modules — never `src/`:

| tree state                                   | pack-level `stale` (shipped)                    | per-fact `driftDetect` (shipped, uncalled on this path) |
| -------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------- |
| **A** — tree at the mine sha                 | `false` (0/199 flagged)                         | 0 flagged — correct, nothing has changed                |
| **B** — tree at `origin/master`              | `true` (**199/199** flagged: TP 17, **FP 182**) | **TP 17, FP 0, TN 182, FN 0**                           |
| **C** — one commit touching only `README.md` | `true` (**199/199** flagged, **FP 182**)        | **0 flagged** — correct                                 |

Scenario C is the crux. One commit, to a file no fact is anchored at, flips the only freshness signal the
pack has to `true` for all 199 rows. A signal that fires on every commit anywhere in the repository trains
its reader to ignore it — and an ignored freshness flag is exactly how the 17 genuinely-rotten rows in
scenario B come to be read like the 182 sound ones.

This is not a bug. **ADR-0002 ratified it in as many words** (`docs/adr/ADR-0002-freshness-watermark.md:46`):

> "**Granularity is repo-GLOBAL, not scope-scoped (deliberate).** `stale` flips `true` after ANY HEAD
> advance, even a commit touching nothing under the queried scope"

### Where the signal dies — four places, named

1. **`packages/contracts/src/pack.ts:32`** — `PackInvariant { nodeId, tier, claim }`. There is **no per-row
   freshness field in the frozen `Pack` contract**, and `Pack.stale` (line 25) is one boolean for the whole
   pack. Per-row freshness has nowhere to be reported. ADR-0002:52 deferred exactly this as _"a `Pack`
   contract change for a later consumer."_ This ADR is that consumer.
2. **`packages/adapter-io/src/projection-query-index.ts:82-86`** — both legs _are_ evaluated per row and are
   then OR-folded into one pack-scoped boolean. The per-row verdict is computed and immediately discarded.
   The leg is **tier-blind**: it already runs over `T2` rows today, which is why scenario B prints
   `stale: true` over an _empty_ pack — the flag is about rows the pack does not show.
3. **`packages/adapter-io/src/freshness-watermark.ts:107`** — `rowBehindHead` compares the row's `derivedAt`
   to live HEAD. Measured: **199/199 rows carry the same `derivedAt`** (`8ada771b`), because one genesis run
   published them all. For a mined graph the "per-row" stamp is a constant, so the comparison is a
   graph-wide bit by construction.
4. **`packages/adapter-io/src/own-source.ts:205`** — `RelatedFact.stale` is `fact.freshness === 'DRIFTED'`,
   the value stored at write time. Measured: **199/199 stored `FRESH`**. Nothing writes it back on a read —
   `atlas reconcile` is documented and implemented as read-only ("it persists nothing", `INV-TOOLS-8`).

### The one mechanism that works, and the ratified sentence that forbids it

`driftDetect(fact.grounding, axes)` (`packages/grounding/src/drift.ts:99`) is the existing GROUND-1 per-fact
oracle. It is **the same function the write door already uses** (`compose.ts:99-105` `buildGate(axes)`), over
the **same `axes` the composition root already builds once per process**. It is not a second freshness
concept — it is _the_ freshness concept, simply never called on the read path. Measured over all 199 facts:
**17/17 true positives, 0 false positives, 43-109 ms, no git I/O.**

It cannot be wired, because `REQ-TOOLS-6d` (`docs/requirements/req-tls.md:94`) says:

> "`atlas-query` shall NOT re-derive per-fact drift on the read path (the live oracle stays
> `atlas-reconcile`/`atlas-doctor`)."

That is a separately ratified requirement, and ADR-0002's rejected alternative is stated against a _git_
re-derivation ("puts a git-worktree checkout ... on **every** query"), a cost `driftDetect`-against-built-axes
does not have. The rejection may well have been aimed at a cost this design avoids. **Deciding that is an
amendment to ADR-0002, not a reading of it**, and it belongs to the owner rather than to the seat that
noticed the tension.

**Lead recommendation: amend both, in one act.** The precedent is ADR-0012 §"What the owner still has to
ratify" — a principle ratified in one layer and left contradicted in another has been relocated, not
ratified. Landing the advisory band on the watermark alone would put 199 unverifiable claims behind a flag
that fires on every commit; landing it with `driftDetect` requires striking one sentence of `REQ-TOOLS-6d`
and adding one field to `PackInvariant`.

## What this ADR does NOT close

- **`atlas node` still reports no freshness at all.** Measured on the built binary, in both tree states:
  `atlas node aefc0192…` returns `status: ok`, byte-identical, for a claim about the `visit` expression in
  `packages/cli/src/mine.ts` — a file that changed. `NodeOut` carries no freshness field. This amendment is
  about the pack; the drill-down door it feeds has the same hole and is not fixed here.
- **The advisory cap constant.** Bounded to `(0, CAP_CEILING − PACK_CAP)` by `RETR-7b`; the point in that
  range is an owner ratification.
- **How the advisory band ranks internally.** The within-tier comparator applies, but on a cold mined graph
  every row has `hits = 0` and `ppr` is uniform, so the effective order is `nodeKey`-ascending — i.e. hash
  order. ADR-0012's obviousness score is the intended cold-start prior; whether it enters this rank, and
  with what weight, is the retrieval-threshold question ADR-0012 also left open, and one open question
  should not be closed twice in different words.
- **The reference model.** `packages/retrieval/src/pack.ts` states the two-band fill most naturally, and
  **probing the built binary shows its `fill()` is never reached** by `atlas query` or `atlas own` — only the
  module-load `_packBind` line runs. Amending it would change no shipped behaviour. The shipped bound lives
  at `packages/tools/src/query.ts:57` and `packages/adapter-io/src/pack-shape.ts:42`, and any implementation
  of this ADR must land there or land nowhere.
