# `atlas promote`

Carry the explorer's **staged candidates** into governed knowledge. It reads the staging sidecar that
[`mine`](./mine.md) writes, rehydrates each candidate's whole fact from the CAS, and presents it — one row,
one decision — to the **existing** governed emit door. Every gate [`emit`](./emit.md) applies here,
unchanged and in the same order.

This page describes the **CLI** command `atlas promote`. There is **no `atlas-promote` MCP tool**, and there
is no third write door: `WRITE_PATHS` is still `{atlas-emit, atlas-link}` and the governance surface is still
five tools. Promotion is an _ordinary use_ of `atlas-emit` (ADR-0008), so an MCP client cannot promote.

## Invocation

```
atlas promote
```

- **No arguments.** Arity is `0` and there is no flag. The repository is `process.cwd()`, because the
  staging sidecar it reads and the projection it writes are both under the one composed store — a path
  argument would let those two disagree (read one repo's candidates, publish into another's knowledge).
- An extra positional or an unknown flag is **silently ignored**, inheriting the parser's general behaviour:
  `atlas promote some/path` and `atlas promote --force` both ran the ordinary pass and exited `0`. (`link`
  is the one command that refuses unknown flags; this one does not.)
- `ATLAS_ACTOR` decides authorization. `ATLAS_RATIFY_TOKEN` is **required** — see below; it is not optional
  here the way it is for an ordinary `T2` advisory `emit`.

## Worked example — the whole loop

Every block on this page is verbatim stdout from the built binary. Two disclosures about the fixture, both
load-bearing:

1. **`atlas mine` NOW stages candidates** — REQ-CLI-4d wired the admission gate at the composition root, and
   `makeAdmitGate` has a production caller. This paragraph used to read "`atlas mine` stages nothing today";
   it was true, and it is the defect that requirement closed. Measured on Atlas itself with a real SCIP
   index and an operator-configured proposer:

   ```
   $ atlas mine .
   genesis: seeded 200 candidate fact(s); ratified 0
   cost: llmCalls 200 · budgetSpent 200
   prompt: 1ddad3aff78df671b020867dcebb313a88479ce8d4262904fcce0339f28668a7 — the artifact every proposal on this run was built from
   # exit 0
   ```

   TWO THINGS ABOUT THAT BLOCK, because it is the one transcript on this page that could mislead. It is
   verbatim, from a real 54-minute pass over Atlas's own 200-site frontier with an operator-configured
   proposer — and it was captured BEFORE the per-site ledger landed in this same merge, which is why it
   carries no `coverage:` line. It has not been re-run: re-running costs 200 model calls, and editing a
   `coverage:` row into a transcript nobody produced is exactly the fabrication this page exists to refuse.
   The second thing: `llmCalls` counts SITES, not model calls (`run-controller.ts` increments it once per
   visited site whether or not a proposer ran), so read that figure as budget spent, never as spend.

   The ledger's own shape, from the CURRENT build on a one-site fixture — the run that has it:

   ```
   $ atlas mine .
   genesis: seeded 0 candidate fact(s); ratified 0
   cost: llmCalls 1 · budgetSpent 1
   mine: 0 candidate facts — 1 site(s) visited and every one abstained: no proposer model is wired, so nothing could be proposed (facts are never fabricated)
   coverage: coverage CLOSES — all 1 planned site(s) accounted for: 0 seeded, 1 abstained, 0 unrecorded, 0 interrupted, 0 never visited
   site: {"rank":1,"outcome":"abstained","kind":"file","path":"src/charge.ts","whyNot":"model abstained: no grounded fact at site"}
   # exit 0
   ```

   `"outcome":"abstained"` carrying a grounded `whyNot` is what the wire bought. Until this merge the row
   read `"outcome":"unrecorded"`: the `visit` port picked `.facts` off the `ExtractResult`, so each site's
   `WhyNot` died one layer above the controller and an abstention was indistinguishable from a silent drop —
   while the prose line above it said "every one abstained" on the strength of `facts === 0` alone, a word
   the run had no grounds for. The ledger is the row entitled to make that claim; the prose is not.

   The candidate below was nevertheless staged through the product's own staging door directly
   (`packages/e2e-blackbox/test/stage.ts` — the same `commitStaging` + `upsert` + `nodeKey` path `mine`
   takes, with the same `atlas:mined` scope and `T2` class), because this page's example needs ONE known
   candidate with known bytes rather than whatever a proposer answered. Nothing about the promotion is
   faked, and a mined candidate now reaches this door for real.

2. `.atlas/policy.json` grants `atlas:mined` to `seat:orchestrator`. Without that grant every promotion is
   correctly refused — the last refusal block below is that state.

With one candidate staged and **no ratifier named**:

```
$ ATLAS_ACTOR=seat:orchestrator atlas promote
status: rejected
next: every staged candidate was refused (1) — read the per-row reasons below; nothing was written
invariant: KNOW-8: a staged candidate reaches governed knowledge only THROUGH the emit door, and only with a ratifier named — the count reported is what SETTLED durably, never what was attempted
promote: 0 of 1 staged candidate(s) promoted; 1 refused
  refused 802f2bcde25d0ab2211a10d639bdde37ffbbe2c3b8251c7ea3b85f7fc5522f6a: unratified: this write owed FULL ratification and no valid ratifier was named (KNOW-8) — set ATLAS_RATIFY_TOKEN. A write owes full ratification when it is T0, a predicate, contested, or a PROMOTION of a staged candidate (the fast path does not apply to a machine-proposed fact no human has read). A T0 fact additionally requires the billy token
# exit 2
```

Nothing was written: no `projection.*.json` generation exists on disk after that run. Name a ratifier and
the same candidate lands:

```
$ ATLAS_ACTOR=seat:orchestrator ATLAS_RATIFY_TOKEN=seat:orchestrator atlas promote
status: ok
next: 1 staged candidate(s) are now governed knowledge — `atlas node <addr>` reads each one back (a T2 fact is bounded OUT of the `atlas query` pack, TOOLS-6)
invariant: KNOW-8: a staged candidate reaches governed knowledge only THROUGH the emit door, and only with a ratifier named — the count reported is what SETTLED durably, never what was attempted
promote: 1 of 1 staged candidate(s) promoted; 0 refused
  promoted 802f2bcde25d0ab2211a10d639bdde37ffbbe2c3b8251c7ea3b85f7fc5522f6a -> 83660b81ecf5f0b371e37448124b1465d1626bc134b7be5ac8adf9c8184645c7
# exit 0
```

`projection.1.json` now holds `current=1 row(s), cas=1 object(s)`.

The `promoted <nodeKey> -> <contentHash>` line carries **two different identities and you need the right one
for the next step**: the left value is the routing `nodeKey` (what `atlas query` prints on its `inv` lines
and what [`link`](./link.md) takes); the right one is the CAS **content address**, which is what
[`node`](./node.md) takes.

## Reading a promoted fact back — `node`, and now `query` too

```
$ atlas node 83660b81ecf5f0b371e37448124b1465d1626bc134b7be5ac8adf9c8184645c7
status: ok
next: a node is reached as a drill-down within its pack; the same address resolves byte-identically over MCP | poke | CLI
invariant: TOOLS-10: one read-only oracle, no divergence across transports, no write path
data:
  node: 802f2bcde25d0ab2211a10d639bdde37ffbbe2c3b8251c7ea3b85f7fc5522f6a
  tier: T2
  kind: advisory
  claim: greet() returns a greeting for the supplied name
# exit 0
```

**`atlas query` now shows it — on an `advisory` row, not an `inv` row.** A mined candidate is stamped `T2`
(`mine` stamps the class from a constant), and since [ADR-0013](../../adr/ADR-0013-the-pack-has-two-bands-governing-and-advisory.md)
the pack has **two separately bounded bands**: the governing band (`inv`, `tier≥T1`, unchanged) and a
separately capped **advisory** band that is exactly `T2`. So the row is served, under its own verb, with its
own per-row freshness verdict. Same repository, immediately after the promotion above:

```
$ atlas query src
status: ok
next: re-ground stale packs before trusting; an advisory row is a machine proposal no ratifier saw — check its per-row freshness; scope must be a path string
invariant: TOOLS-6: bounded read projection, two bands (governing tier>=T1 + separately capped advisory T2), every row carrying its own freshness
data:
  advisory T2 802f2bcde25d0ab2211a10d639bdde37ffbbe2c3b8251c7ea3b85f7fc5522f6a [FRESH]: greet() returns a greeting for the supplied name
  advisoryDropped: 0
  stale: false
  tokenEstimate: 48
# exit 0
```

So promotion makes a mined fact **addressable, durable and readable** — but readable as a _proposal_, never
as ratified knowledge. What has **not** changed is the thing the two bands exist to keep apart: no mined
candidate reaches the **governing** band. Promoting a fact into `inv` still means a fact at `T1` or stricter,
which no mined candidate is; that is a re-classification, it has no door (ADR-0009 / task #88), and the
`advisory` verb on the row above is what stops a reader mistaking one for the other.

> **The shipped binary still says otherwise, and it is recorded here rather than papered over.**
> `atlas promote`'s guidance line — visible in every `promote` transcript on this page — still ends
> _"(a T2 fact is bounded OUT of the `atlas query` pack, TOOLS-6)"_. That was true before ADR-0013 and is not
> true now. It is a string in the shipped binary, so it is a code fix and not a documentation one, and it is
> not made here. Believe the transcript above it, not the sentence.
>
> The `node` read at the top of this section is still the right way to read a promoted fact **whole** — it
> is the door that returns the fact's own identity, tier and claim — which is why the section keeps it.

## Running it twice — idempotent by UPSERT, not by refusal

Staging has **no delete**, and the two sidecars have no shared commit, so a promoted row is neither removed
from staging nor marked as promoted. A marker would be a second mutable state machine that can disagree with
the projection. So a second run re-presents the same rows to the same door. Re-run the successful command
above, unchanged:

```
$ ATLAS_ACTOR=seat:orchestrator ATLAS_RATIFY_TOKEN=seat:orchestrator atlas promote
status: ok
next: 1 staged candidate(s) are now governed knowledge — `atlas node <addr>` reads each one back (a T2 fact is bounded OUT of the `atlas query` pack, TOOLS-6)
invariant: KNOW-8: a staged candidate reaches governed knowledge only THROUGH the emit door, and only with a ratifier named — the count reported is what SETTLED durably, never what was attempted
promote: 1 of 1 staged candidate(s) promoted; 0 refused
  promoted 802f2bcde25d0ab2211a10d639bdde37ffbbe2c3b8251c7ea3b85f7fc5522f6a -> 83660b81ecf5f0b371e37448124b1465d1626bc134b7be5ac8adf9c8184645c7
# exit 0
```

Byte-identical to the first run, including the content address — and the store did **not** move: same
`nodeKey`, same `contentHash`, `current=1 row(s)` before and after, the claim set unchanged. A new
generation file is published (`projection.2.json`) because the commit protocol publishes per decision, but
it carries the same one row.

**Read `1 of 1` as "this invocation settled one row", not as "one new row appeared."** The count is what
this run made durable, not a delta against what was already there. That wording is deliberate and it is the
honest one: a run that reported `0` on the second pass would be claiming knowledge about a previous
invocation it does not have. If you need the delta, compare the projection.

The re-run is **not** free of governance: it pays a full ratification again. Withdraw the token before the
second run and it is refused `unratified`, exactly as the first run was — promotion never becomes tokenless
just because the node already exists.

## Exit codes

| code | meaning                                                                                                       |
| ---- | ------------------------------------------------------------------------------------------------------------- |
| `0`  | every candidate found was made durable — including the honest empty case (nothing staged, nothing to do)      |
| `1`  | the runtime is not composed. Not reachable from the shipped binary; it is the injected-handler seam tests use |
| `2`  | a **governed refusal**: at least one row a gate declined, or a staging read that refused                      |

`2` is the code that matters. It means the invocation was well-formed and a _gate_ said no, so re-running it
with different arguments will not help — grant a scope, name a ratifier, or repair the store. Every `2` on
this page names the row and the reason.

## What it refuses, and why

**No ratifier named — `unratified`.** Shown above, and it is the gate this door exists for. A staged
candidate is `T2`, advisory and grounded, which is exactly the shape the confidence fast path auto-accepts;
if promotion took that path, a machine-proposed fact no human has read would reach the durable store with no
ratifier consulted. It does not: the door derives _where the write came from_ and the fast path does not
apply to a promotion. `ATLAS_RATIFY_TOKEN` is therefore genuinely required here, unlike an ordinary `T2`
advisory `emit`.

**No curator appointed — `unauthorized`.** Reproduced by running the same repository with `atlas:mined`
absent from `.atlas/policy.json` (`"scopes": {}` — the repo's own policy grants it, so the grant has to be
removed to see this):

```
$ ATLAS_ACTOR=seat:orchestrator ATLAS_RATIFY_TOKEN=seat:orchestrator atlas promote
status: rejected
next: every staged candidate was refused (1) — read the per-row reasons below; nothing was written
invariant: KNOW-8: a staged candidate reaches governed knowledge only THROUGH the emit door, and only with a ratifier named — the count reported is what SETTLED durably, never what was attempted
promote: 0 of 1 staged candidate(s) promoted; 1 refused
  refused 802f2bcde25d0ab2211a10d639bdde37ffbbe2c3b8251c7ea3b85f7fc5522f6a: unauthorized: actor not in fact scope (KNOW-11)
# exit 2
```

Mining has no actor, so a mined node is owned by **nobody** until an admin grants `atlas:mined` — granting
it _appoints a curator_. An unset `ATLAS_ACTOR` produces the same refusal for the same reason: the empty
actor is in no scope.

**A staged row whose bytes are gone from the CAS.** `mine` writes the bytes before it publishes the row, so
this means the CAS was pruned or corrupted underneath. It is that **row's** refusal — not a skip, which
would make the row vanish from the report, and not a throw, which would take the batch down:

```
  refused 802f2bcde25d0ab2211a10d639bdde37ffbbe2c3b8251c7ea3b85f7fc5522f6a: candidate bytes absent from CAS — the staged row names a contentHash the store cannot return, so there is no fact to promote
```

**A staging sidecar that will not parse.** This is a refusal, and it is _not_ "0 candidates" — the
distinction is the whole point of the message, because reporting a clean, complete promotion of nothing over
candidates that are still on disk is the failure mode this door was built to avoid:

```
$ ATLAS_ACTOR=seat:orchestrator ATLAS_RATIFY_TOKEN=seat:orchestrator atlas promote
status: rejected
next: promote read nothing — the staging sidecar refused (unreadable). This is NOT "0 candidates": nothing was read, so nothing could be promoted, and whatever is staged is still staged. Restore `.atlas/staging.*.json` from a backup, or re-run `atlas mine` to rebuild it.
invariant: KNOW-8: a staged candidate reaches governed knowledge only THROUGH the emit door, and only with a ratifier named — the count reported is what SETTLED durably, never what was attempted
# exit 2
```

The honest-empty case says something different, and exits `0`:

```
$ ATLAS_ACTOR=seat:orchestrator ATLAS_RATIFY_TOKEN=seat:orchestrator atlas promote
status: ok
next: staging holds no candidates — nothing to promote. `atlas mine` stages candidates; a pass that abstained at every site staged none
invariant: KNOW-8: a staged candidate reaches governed knowledge only THROUGH the emit door, and only with a ratifier named — the count reported is what SETTLED durably, never what was attempted
promote: 0 of 0 staged candidate(s) promoted; 0 refused
# exit 0
```

**A committed durable store** — the same provenance refusal every other command gets, raised at the
entrypoint before any door opens; see [`query`](./query.md).

**Everything `emit` refuses, per row.** The gate ladder is `atlas-emit`'s, so `ungrounded`,
`unauthorized for target`, `governance-relocation`, `governance-downgrade`, `malformed tier|scope|family`
and the commit-level `contended` / `unreadable store` all reach a promotion as that row's `refused` line.
Two are worth naming because a mined identity makes them reachable: a mined `nodeKey` can collide with an
existing governed node (the identity is `hash(primaryAnchorId ‖ slot)` and carries neither scope nor tier),
and when it does the incumbent guard refuses `unauthorized for target` rather than set-unioning a mined
string into a ratified fact.

## A partial pass — the count is what settled

Two candidates staged, one of them with its CAS bytes pruned:

```
$ ATLAS_ACTOR=seat:orchestrator ATLAS_RATIFY_TOKEN=seat:orchestrator atlas promote
status: rejected
next: 1 promoted, 1 refused — read the per-row reasons below; the refused rows are still staged
invariant: KNOW-8: a staged candidate reaches governed knowledge only THROUGH the emit door, and only with a ratifier named — the count reported is what SETTLED durably, never what was attempted
promote: 1 of 2 staged candidate(s) promoted; 1 refused
  promoted 802f2bcde25d0ab2211a10d639bdde37ffbbe2c3b8251c7ea3b85f7fc5522f6a -> 83660b81ecf5f0b371e37448124b1465d1626bc134b7be5ac8adf9c8184645c7
  refused c3017aea403c417b4bf32c1d84e921ba364a5b951b8e6378bc10220d34dfed13: candidate bytes absent from CAS — the staged row names a contentHash the store cannot return, so there is no fact to promote
# exit 2
```

`1 of 2`, and the projection gained exactly one row. `promoted + refused` always equals the candidates
found, so a partial pass is legible as one instead of rounding to a success.

## Things worth knowing before you rely on it

- **A candidate has to be MINED first.** This line used to read "nothing shipped produces a candidate yet";
  the mine admission gate is wired now, so `atlas mine` on an indexed repository with a configured proposer
  stages rows this command can promote. On a repository nobody has mined, `atlas promote` still reports
  `0 of 0` — that is the honest state, not a defect in this command.
- **A promoted row stays staged.** There is no delete and no marker; see the idempotence section. The
  projection is the only record of what was promoted.
- **`ATLAS_RATIFY_TOKEN` is a name, not a credential.** It is compared as a string, with no verification of
  any kind, and anyone able to invoke the CLI can set it. It is an anti-accident guardrail — it makes
  promotion a deliberate, visible act — not an adversarial control. The same is true of `ATLAS_ACTOR`.
- **`atlas:mined` is a namespace grant, not a truth claim.** It decides who may write those rows. Whether a
  claim is true is decided by the truth gate, which re-derives every citation mechanically and refuses what
  does not hold, whoever wrote it.
- **The batch is not atomic.** Each row is its own governed decision and its own commit. A pass that refuses
  halfway leaves the rows that already settled in place — which is why the report is per row.

## Related

- [`mine`](./mine.md) — writes the candidates this command reads.
- [`emit`](./emit.md) — the governed write door promotion publishes through; every gate is described there.
- [`node`](./node.md) — the read-back for a promoted fact.
- [`query`](./query.md) — the bounded read that will **not** show a `T2` promoted fact.
