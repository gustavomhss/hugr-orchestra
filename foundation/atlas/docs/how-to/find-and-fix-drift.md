# How to find and fix drifted knowledge

Code moves; the facts pinned to it go `FRESH → DRIFTED → BROKEN`. This guide is how to find out which facts
moved, what kind of move it was, and what your options actually are today. All **CLI**; `doctor` is
CLI-only, so there is no MCP route for most of this.

There is a real ceiling in step 4, measured and stated rather than glossed. Read it before you rely on a
`stale: false`.

## Prerequisites

- A repository moved in, with at least one emitted fact
  ([how-to](./emit-a-grounded-fact.md)).
- A git repository — drift is measured against revisions.
- The **nodeKey** of the fact you care about: the identifier on `atlas query`'s `inv` lines.

## Steps

1. **Notice it on a read.** Change the code a fact is pinned to, commit, and query the scope:

   ```
   $ atlas query src
   status: ok
   next: re-ground stale packs before trusting; an advisory row is a machine proposal no ratifier saw — check its per-row freshness; scope must be a path string
   invariant: TOOLS-6: bounded read projection, two bands (governing tier>=T1 + separately capped advisory T2), every row carrying its own freshness
   data:
     inv T1 f9517988f330a775ffc767c072fa01e52f38642220442916ca6b9b8c20bef532 [DRIFTED]: greet returns a greeting
     advisoryDropped: 0
     stale: true
     tokenEstimate: 24
   # exit 0
   ```

   `stale: true` is a _do not trust this yet_ signal, not a diagnosis. `query` re-derives nothing; see
   [the reference](../reference/commands/query.md#what-stale-actually-means).

2. **Ask which fact, and what kind of drift.** `doctor why` takes the nodeKey from the `inv` line:

   ```
   $ atlas doctor why f9517988f330a775ffc767c072fa01e52f38642220442916ca6b9b8c20bef532
   status: ok
   doctor: why
   whyBroken: fact=f9517988f330a775ffc767c072fa01e52f38642220442916ca6b9b8c20bef532 class=semantic anchorWas=8fccf7923e4e0725bba4821e8b2ad6562d00589ffddead70779416ee249a8faa anchorNow=a79bc0962eb9bfeaa1c0fdf5d6038f95341acca859f5635007d94ef6dac557b3
   next: doctor is read-only — run any proposed RegroundPlan through atlas-emit to persist it
   invariant: TOOLS-12: read/advisory-only diagnosis, persists nothing, carries no write authority
   # exit 0
   ```

   - `class=mechanical` — the anchored content still exists somewhere; the claim survived, the anchor moved.
     Re-groundable.
   - `class=semantic` — the content is gone. The claim rotted. Re-author or retire it; nothing mechanical
     can save it.
   - `whyBroken: none` — this fact is not drifted.

3. **Get the proposed repair.** `doctor reground` is a planner. It persists nothing and it says so on every
   line:

   ```
   $ atlas doctor reground f9517988f330a775ffc767c072fa01e52f38642220442916ca6b9b8c20bef532
   status: ok
   doctor: reground
   plan: action=retire fact=f9517988f330a775ffc767c072fa01e52f38642220442916ca6b9b8c20bef532 — PROPOSAL only; persists nothing. Run through atlas-emit to persist.
   next: doctor is read-only — run any proposed RegroundPlan through atlas-emit to persist it
   invariant: TOOLS-12: read/advisory-only diagnosis, persists nothing, carries no write authority
   # exit 0
   ```

   `action=reground` for mechanical drift (the primary anchor swaps to the new location);
   `action=retire` for semantic drift (the fact is tagged superseded). Either way the store changes only
   when the plan goes through the governed write door.

4. **Re-emit — and check what actually happened.** The repair is an
   [`atlas emit`](../reference/commands/emit.md) like any other. **Here is the ceiling.** A re-emit whose
   `claimNorm` is byte-identical to the stored claim is _deduplicated_: it exits `0`, hands you back the
   **old** content address, persists nothing new — and still re-stamps the freshness watermark, so
   `stale` flips to `false` while the fact is still drifted. Measured end to end, in this order:

   ```
   $ ATLAS_RATIFY_TOKEN=lead atlas emit f.json --at <HEAD>
     id: aab5c2cc8f36b9f547b876fda6271f8009a61de76d1009634cd22131867f9e7f   ← the FIRST emit's address

   $ atlas query src
     stale: false                                                          ← now says trustworthy

   $ atlas doctor why f9517988…
   whyBroken: fact=f9517988… class=semantic anchorWas=8fccf792… anchorNow=a79bc096…   ← still drifted
   ```

   So: **do not treat `stale: false` after a re-emit as proof the fact was repaired.** Re-run
   `atlas doctor why` and require `whyBroken: none`. A repair that changes the claim text (a re-authoring)
   does write a new node and does clear the drift; a repair that only corrects the anchor under an unchanged
   claim currently does not.

5. **Gate the merge.** `atlas reconcile <mergeBase>` blocks on any semantic flip:

   ```
   $ atlas reconcile 20ff947f42e7a2052326a59399a94a1864301b47
   status: rejected
   next: a semantic flip blocks the merge (exit 2) — re-author before merging
   invariant: TOOLS-8: reviewable drift, block on any semantic flip
   # exit 2
   ```

   That is the whole CLI output — the exit code is the signal, and the drifted set is not rendered. Use
   `doctor why` for the detail, and resolve the merge base yourself: `reconcile` does not validate it, so an
   unresolvable rev classifies as no drift and exits `0`
   ([reference](../reference/commands/reconcile.md)).

## How to verify you got the right thing

- `atlas doctor why <nodeKey>` prints `whyBroken: none`. This is the check that counts.
- `atlas query <scope>` shows the claim you expect on its `inv` line — after a re-authoring, the pack line
  is a set-union of the old and new claim text under one nodeKey, not a second row.
- `atlas reconcile <mergeBase>` exits `0` for the base you are actually merging against.

## Notes

- **`doctor` cannot fix anything.** Every leg is built over a port with no write method, so the repair
  always leaves through `atlas emit`. That is the point, not a limitation.
- **Drift is relative to the base you name.** Re-grounding a fact does not make its anchor un-move relative
  to an older merge base, so `reconcile <oldBase>` can still report drift afterwards.
- **`atlas doctor archive` gives you content addresses**, which is what
  [`atlas node`](../reference/commands/node.md) takes if you want to read a fact whole. The `inv` lines give
  you nodeKeys, which is what `doctor` and `link` take. They are different identifiers.

## Related

- Command reference: [`doctor`](../reference/commands/doctor.md),
  [`reconcile`](../reference/commands/reconcile.md), [`query`](../reference/commands/query.md),
  [`emit`](../reference/commands/emit.md).
- Why freshness is a structural subtree hash and not line ranges:
  [`explanation/versioning.md`](../explanation/versioning.md).
