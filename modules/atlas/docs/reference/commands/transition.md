# `atlas transition`

Produce a **grounded transition** for a unit across **two git revs**. A transition (ADR-0015 **D4** / #234) is
an **immutable advisory historical record** — _unit `unitKey` returned A at `revBefore`, returns B at
`revAfter`_. This command is the **reachable producer**: given a unit and two revs, it reads the unit's **real
content** at each rev through the arbitrary-rev code index, admits a **`justified`** transition (there is no
mechanical HEAD oracle for a historical claim, so it is never `proven` — D-T1), and **persists** it.

## Invocation

```
atlas transition <unit> <revBefore> <revAfter>
```

- `<unit>` — required. The **unit lineage key** (a `qualifiedPath`, e.g. `src/pay.ts::charge`). It must be the
  **same** key at both revs — a move/rename that changes the key is **out of scope** (D-T4).
- `<revBefore>` / `<revAfter>` — required. Two git revs (a sha, tag, or ref). The unit's `subtreeHash` at each
  becomes the content-addressed `shaBefore` / `shaAfter` the record spans.

## Outcome (exit code is the whole contract)

- **exit 0** — a transition was admitted from the two revs and settled durably. Read it back with
  [`atlas transitions <unit>`](./transitions.md).
- **exit 2** — the producer **abstained** (nothing fabricated): the unit did not resolve at a rev, or its
  content was **identical** across the two revs (`shaBefore === shaAfter` spans no interval, so it is not a
  transition) — or the atomic persist did not settle (a contended store).

```
$ atlas transition src/pay.ts::charge HEAD~1 HEAD
status: ok
next: justified transition on 'src/pay.ts::charge' is durable (<id>) — read it back with `atlas transitions src/pay.ts::charge`; a later transition on this lineage supersedes it (D-T3)
invariant: #234 D4: a transition is an IMMUTABLE ADVISORY HISTORICAL record admitted from TWO real revs where the unit changed — sealed `justified` NEVER `proven` (no HEAD oracle exists, D-T1), grounded on the rev-pair (never re-checked at HEAD, D-T2), superseded not falsified by a later transition on the same lineage (D-T3); rename/move is OUT of scope (D-T4)
transition: src/pay.ts::charge @ <hash>… → <hash>… (seal: justified)
```

## Authorization (governed)

`atlas transition` PERSISTS **through the governed emit door** — the same door `atlas emit`/`atlas promote`/
`atlas derive-relations` ride. **KNOW-11 actor-scope authz** and **ARCH-9 anchor binding** apply: the acting
`ATLAS_ACTOR` must be a member of the unit's own scope (e.g. `src` for `src/pay.ts::charge`), and the scope
must OWN the unit. An **unauthorized** actor is **REFUSED** (exit 2, `unauthorized`) and **nothing lands** —
there is no gate-less write path into the governed knowledge projection. The transition door runs **no HEAD
truth gate** (a transition grounds on PAST revs, D-T2, which a HEAD-freshness gate would always drift-reject);
its grounding is validated structurally (the two rev entries carry real content hashes), and authz + anchor are
the gates that bite.

## Honest limits (flagged, not silent)

- **Derivation prose.** The `derivation` the `justified` seal names is **mechanically generated** ("the unit
  changed content across these revs"), not authored by a model that read both bodies. A full model-authored
  producer that describes _what_ changed is out of #234's scope; the transition **fact** is fully admitted from
  real revs — only the richness of the justification prose is deferred.
- **Rename/move** reconciliation (D-T4) and a **proven-flip** (D-T5) are explicitly deferred, documented as
  honest limits rather than silent non-behavior.
