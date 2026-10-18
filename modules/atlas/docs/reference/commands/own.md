# `atlas own`

The briefing for a scope you are about to work in. `query` gives you a flat, bounded pack of one-line
claims; `own` gives you the same facts _organised_ — a role line, the invariants, the gotchas kept separate
from them, the terrain, what depends on you, and a content-free map of what else is reachable.

It is composed by **index reads alone**: no model call, no free prose, no ranking anybody trained. Equal
input renders byte-identical output. Read-only — it opens no write path.

This page describes the **CLI** command `atlas own`. There is **no `atlas-own` MCP tool**: the governed
surface is still five tools (`atlas-init`, `atlas-query`, `atlas-emit`, `atlas-reconcile`, `atlas-link`) and
this command adds none. It is intercepted at the entrypoint and driven over the composition root's `own`
leg, exactly as [`node`](./node.md) and [`promote`](./promote.md) are.

## Invocation

```
atlas own <scope>
```

- `<scope>` — required. A repo-relative path: a directory, or a single file, or a `::` sub-file unit.
- No flags.

## Worked example

A repo with two files under `src`, four facts filed through `atlas emit` — a `definition`, an `invariant`
and a `gotcha` on `src/greet.ts`, and an `invariant` on `src/caller.ts`:

```
$ atlas own src
status: ok
next: the whole of what is filed under this scope fits the briefing — drill with `atlas own <finer>`, widen with `atlas query src`
invariant: RETR-12: `own_<scope>` is composed by INDEX READS ALONE — 0 LLM, 0 free prose, byte-identical for equal input — two bands (governing tier>=T1 + separately capped advisory T2), and it is bounded: what did not fit is listed as pull-reachable, never silently dropped
own: own_src — 3 invariant(s), 1 gotcha(s), 0 advisory; tokenEstimate 147
  role: src is the greeting service
  grounding: tree
  owner: lead@atlas.local
  tier: T1
  contains src/caller.ts
  contains src/greet.ts
  inv T1 0e2d37a627801366122812417df4a91b38be227f77fe300f771946e4b28f5cf9: src is the greeting service
  inv T1 931c8e317d4a5111198222c0c4e23b5585f566a08ef27baa52168faca51ed77e: the caller retries greet once
  inv T1 f9517988f330a775ffc767c072fa01e52f38642220442916ca6b9b8c20bef532: greet returns a non-empty string
  gotcha T1 3054a626e6adc335e590f0970e6c748d5d624885e4feec010b4b59015ee7b19f: greet does not escape its argument
  advisoryDropped: 0
  finer src/caller.ts
  finer src/greet.ts
  available own_caller.ts (pack) -> atlas own src/caller.ts
  available own_greet.ts (pack) -> atlas own src/greet.ts
  refresh: poke:own_src
  complement: relate:src
# exit 0
```

### The rows, and where each one comes from

| row               | source                                                                                             |
| ----------------- | -------------------------------------------------------------------------------------------------- |
| `role`            | the `definition`-slot fact under the scope; falling back to the covering territory's key           |
| `grounding`       | `tree` for a path scope — it names a real node in the spatial axis                                 |
| `owner`           | the actors the admin put in the covering `authz.scopes` key of `.atlas/policy.json`                |
| `tier`            | the strictest governance class **actually filed** here (`T2` when nothing is)                      |
| `contains`        | the scope's immediate children in the code index                                                   |
| `inv`             | one per fact, `tier≥T1`, **not** in a gotcha/rationale slot — same row format `query` prints       |
| `gotcha`          | one per fact in the `gotcha` or `rationale` slot                                                   |
| `advisory`        | one per `T2` fact — a machine proposal no ratifier saw, with its own freshness verdict in brackets |
| `advisoryDropped` | how many advisory rows the advisory sub-cap cut; each of them is also a `pull-reachable` row       |
| `dependent`       | facts anchored at code that depends on this scope (the reverse closure)                            |
| `finer`           | the child scope-units you can drill into                                                           |
| `available`       | a content-free pointer to a reachable surface, and the command that pulls it                       |
| `pull-reachable`  | a fact the budget pushed out — named, never silently dropped                                       |

**Every identifier printed here is a nodeKey**, the same identifier `atlas query`'s `inv` lines carry.
[`atlas node`](./node.md) takes a _content address_ and will miss on all of them; `atlas doctor why
<nodeKey>` and `atlas link` are the doors that take these.

### Drilling in

`own` on a single file narrows the terrain and keeps the facts that anchor there. With a SCIP dump present
(`.atlas/index.scip`), the reverse closure fills the `dependent` rows — here `src/caller.ts` references a
symbol defined in `src/greet.ts`, so every fact anchored at the caller is in the greeter's blast radius:

```
$ atlas own src/greet.ts
status: ok
next: the whole of what is filed under this scope fits the briefing — drill with `atlas own <finer>`, widen with `atlas query src/greet.ts`
invariant: RETR-12: `own_<scope>` is composed by INDEX READS ALONE — 0 LLM, 0 free prose, byte-identical for equal input — two bands (governing tier>=T1 + separately capped advisory T2), and it is bounded: what did not fit is listed as pull-reachable, never silently dropped
own: own_greet.ts — 2 invariant(s), 1 gotcha(s), 0 advisory; tokenEstimate 102
  role: src is the greeting service
  grounding: tree
  owner: lead@atlas.local
  tier: T1
  contains src/greet.ts::lexical_declaration:0:greet
  inv T1 0e2d37a627801366122812417df4a91b38be227f77fe300f771946e4b28f5cf9: src is the greeting service
  inv T1 f9517988f330a775ffc767c072fa01e52f38642220442916ca6b9b8c20bef532: greet returns a non-empty string
  gotcha T1 3054a626e6adc335e590f0970e6c748d5d624885e4feec010b4b59015ee7b19f: greet does not escape its argument
  advisoryDropped: 0
  dependent 1c768cef108b705541ea0de88ceb9f7de389c651ca802593496bacc8afa2791f
  dependent 68ab72af2cbf63b420a1a929173c8f5a8999342ac9477e65f9f5d1be50ca58df
  dependent 931c8e317d4a5111198222c0c4e23b5585f566a08ef27baa52168faca51ed77e
  dependent 9f979c5f36caacb58e6940ce6bf3dbaf11c803fdef4b016e167e34b3b3248e48
  dependent dd62417c2718eb9c05d32b81b9e45d08d2445f06ac7a021cb3fbbc4c3dab7875
  dependent f0aa8e0bc6801b72b06c45782466d99ebb5f9792f462c9a879121d207abb1e47
  finer src/greet.ts::lexical_declaration:0:greet
  available own_greet (pack) -> atlas own src/greet.ts::lexical_declaration:0:greet
  refresh: poke:own_greet.ts
  complement: relate:src/greet.ts
# exit 0
```

Without a SCIP dump there are no dependency edges at all, so this section is simply absent — which is the
honest rendering of "the index knows of none", not of "there are none".

## The budget, and the tail

A briefing is a **bounded** artifact. Facts are filled in greedily under a cap; what does not fit is listed
by nodeKey rather than dropped, so "the briefing did not mention it" and "there is nothing to mention" are
never the same bytes:

```
$ atlas own src
status: ok
next: 6 invariant(s) and 0 advisory row(s) fit the budget; 2 more are pull-reachable, named below by nodeKey — narrow the scope to one of the `finer` units to fit them into a briefing, or inspect one with `atlas doctor why <nodeKey>`
[…]
own: own_src — 6 invariant(s), 1 gotcha(s), 0 advisory; tokenEstimate 1491
[…]
  pull-reachable dd62417c2718eb9c05d32b81b9e45d08d2445f06ac7a021cb3fbbc4c3dab7875
  pull-reachable f0aa8e0bc6801b72b06c45782466d99ebb5f9792f462c9a879121d207abb1e47
# exit 0
```

`tokenEstimate` is the same advisory measure `atlas query` prints — a **character** count, not a real
tokenizer's output (there is no tokenizer in this repo). The cap is 1500 of them. Since a token is roughly
four characters, this bound is strictly tighter than the `~1.5K tokens` the design calls for: it
under-serves rather than over-serves, which is the safe direction for a budget.

## The advisory band

A briefing has **two bands**, and the difference between them is who signed off.

- the **governing** band — `inv` and `gotcha` rows — is `tier≥T1`: facts a ratifier accepted;
- the **advisory** band — `advisory` rows — is `T2`: machine proposals _nobody_ ratified.

They are never interleaved and they never share a verb, so an advisory row cannot be misread as a ratified
one. Each advisory row carries its own freshness verdict in brackets, re-derived on this read, exactly as a
`query` pack's advisory row does — it is the same row, from the same store, under the same rule.

Here is `own` over Atlas's own mined store, where every fact is a `T2` proposal from `atlas mine`:

```
$ atlas own packages/adapter-io
status: ok
next: 0 invariant(s) and 2 advisory row(s) fit the budget; 42 more are pull-reachable, named below by nodeKey — narrow the scope to one of the `finer` units to fit them into a briefing, or inspect one with `atlas doctor why <nodeKey>`; an advisory row is a machine proposal no ratifier saw — check its per-row freshness
[…]
own: own_adapter-io — 0 invariant(s), 0 gotcha(s), 2 advisory; tokenEstimate 709
[…]
  advisory T2 00bdc8a1c9c554a9f64196ba2df9f79d50df29ec640346e43fcd8a527cfc5176 [FRESH]: Nothing in the tree calls `materializePoke`/`pokeFilePath` (open gap #36), and its `PhasePushSource` import is the last tie keeping `packages/tools/src/transport.ts` reachable — […]
  advisory T2 052853f7628e76de6bf5d1a786a3b6ac67ea41d594094fb326b0aee1cf35496a [FRESH]: Refusal-reason constants quote each other's names inside their own rationale prose, so `expect(rejected).toContain('unauthorized for target')` also passes on an `unverifiable target` refusal — […]
  advisoryDropped: 42
  pull-reachable 09208042b56937f7adcf81bd9317121bef826f0d6b3f803cf09fa1384d508147
  […]
# exit 0
```

**The advisory band has its own cap, inside the briefing's.** `OWN_CAP` is still 1500 characters for the
whole briefing; the advisory band may spend at most **750** of them, and only after every governing row,
gotcha and availability pointer has been paid for. So the governing band cannot shrink because proposals
arrived: a scope whose ratified facts fill the budget serves zero advisory rows, byte-for-byte as before.
Above, two rows fit and the other 42 are counted in `advisoryDropped` **and** named individually in the
`pull-reachable` tail — the same 0-silent-drops promise the rest of the briefing already makes.

## The two emptinesses

They are rendered differently on purpose, because they need different things from you.

A path that is **not a code unit at all** — a typo, or a file that does not exist at HEAD. The door is
total: it answers with an empty briefing, never an error.

```
$ atlas own src/typo.ts
status: ok
next: this path names no unit in the code index and serves nothing — check the spelling (`own` is TOTAL: an unknown scope answers with an empty briefing, never an error), or point it at a directory/file that exists at HEAD
invariant: RETR-12: `own_<scope>` is composed by INDEX READS ALONE — 0 LLM, 0 free prose, byte-identical for equal input — two bands (governing tier>=T1 + separately capped advisory T2), and it is bounded: what did not fit is listed as pull-reachable, never silently dropped
own: own_typo.ts — 0 invariant(s), 0 gotcha(s), 0 advisory; tokenEstimate 0
  role: src/typo.ts
  grounding: tree
  owner: lead@atlas.local
  tier: T2
  advisoryDropped: 0
  refresh: poke:own_typo.ts
  complement: relate:src/typo.ts
# exit 0
```

A **real code unit with nothing filed under it**. The terrain and the availability map are there; the
knowledge is not.

```
$ atlas own lib
status: ok
next: the scope is a real code unit but NO fact is filed under it yet — the terrain, the finer units and the availability rows below are structural (from the index); `atlas emit` is what puts knowledge here
invariant: RETR-12: `own_<scope>` is composed by INDEX READS ALONE — 0 LLM, 0 free prose, byte-identical for equal input — two bands (governing tier>=T1 + separately capped advisory T2), and it is bounded: what did not fit is listed as pull-reachable, never silently dropped
own: own_lib — 0 invariant(s), 0 gotcha(s), 0 advisory; tokenEstimate 12
  role: lib
  grounding: tree
  owner:
  tier: T2
  contains lib/spare.ts
  advisoryDropped: 0
  finer lib/spare.ts
  available own_spare.ts (pack) -> atlas own lib/spare.ts
  refresh: poke:own_lib
  complement: relate:lib
# exit 0
```

The empty `owner:` there is also real: no `authz.scopes` key covers `lib`, so nobody is authorized to write
it — the fail-closed default.

## Exit codes

| code | meaning                                                                                      |
| ---- | -------------------------------------------------------------------------------------------- |
| `0`  | the briefing was composed — **including** the honest empty one                               |
| `1`  | a missing `<scope>` argument, or a runtime that is not composed                              |
| `2`  | a governance gate refused the read (the committed-store tripwire, applied at the entrypoint) |

There is no exit-2 leg inside this command. It is a read that no gate can decline; the one refusal that can
reach you fires before it, over a `.atlas/` that arrived by commit. See [`query`](./query.md) for that text.

```
$ atlas own
status: error
next: command 'own' requires 1 positional argument(s), got 0
invariant: CLI-1b: a malformed invocation yields a structured error + guidance + non-zero exit, never a crash
reason: command 'own' requires 1 positional argument(s), got 0
# exit 1
```

## What it refuses, and why

**Writing.** `own` composes from the durable projection through a path with no store-mutating method on it.
Driving the door leaves `.atlas/` byte-identical. Writes funnel through [`emit`](./emit.md) and
[`link`](./link.md); there is no third door, and this is not one.

**Serving a `T2` on a governing verb.** A `T2` is a machine proposal no ratifier saw. It never arrives on an
`inv` or a `gotcha` row — it arrives on the `advisory` verb, under its own cap, exactly as it does in a
`query` pack. The two doors apply the _same_ bound, from the same place; a second read door with a _laxer_
bound would be a route around the first one, and a second read door that stayed _stricter_ was a door that
disagreed with its neighbour about what the store contains (see [The advisory band](#the-advisory-band)).

**Serving an unrecognized tier.** Neither band admits one. Both are stated as membership — `tier≥T1` for the
governing band, `tier = T2` for the advisory one — so a row carrying, say, `T3` out of a committed `.atlas/`
that passed no write door is in _neither_, and it is not counted as a truncation either: it was refused, not
cut for budget.

**Guessing.** It reads one store — the same one `atlas query` reads — and reports what is in it.

## What is honestly missing

Four inputs the design calls for have no producer in this product yet. They are reported as their honest
zero rather than as a plausible-looking number, because a fabricated ranking signal is indistinguishable
from a real one at the point where somebody trusts the order.

| input                  | state                                                                                                                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **frecency** (`hits`)  | nothing records a served pack anywhere durable, so every candidate is `hits: 0` and the ranking degenerates to `(tier, nodeKey)` — deterministic, but not frecency-ranked                  |
| **importance** (`ppr`) | the personalized-PageRank score lives on a mining _candidate_ and is not carried onto a stored fact; `0` for every row                                                                     |
| **memory pointers**    | the per-seat memory layer has no production instance; the briefing carries none                                                                                                            |
| **`dependency` edges** | the index exposes a reverse closure and **no forward closure**, so the briefing can say what depends on you and cannot say what you depend on. There are no `dependency` rows, ever, today |

## Related

- [`query`](./query.md) — the flat bounded pack over the same store; `own` serves exactly the same fact set
  for a given scope, organised rather than listed.
- [`emit`](./emit.md) — the door that puts knowledge under a scope in the first place.
- [`doctor`](./doctor.md) — `why <nodeKey>` is where you take an identifier this command printed.
