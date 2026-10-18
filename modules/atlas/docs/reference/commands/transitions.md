# `atlas transitions`

List the **grounded transitions** on a unit lineage. A transition (ADR-0015 **D4** / #234) is an **immutable
advisory historical record** — _unit `unitKey` returned A at rev `shaBefore`, returns B at rev `shaAfter`_ — a
2-rev fact the producer admitted, spanning a closed valid-time interval. It is sealed **`justified`**, never
`proven` (there is no mechanical HEAD oracle for a historical claim — D-T1), and it is **superseded, not
falsified**: a later transition on the same unit lineage takes over as the current head, and the earlier record
is **retained** and readable (D-T3). Read-only — it opens no write path.

`transitions` reads one lineage and reports, per row, whether it is the **current head** (`TRANSITIONED`) or a
**predecessor** (`SUPERSEDED`). That head/predecessor verdict is **derive-on-read** over the
`shaBefore → shaAfter` chain — nothing is mutated in place, so the store never falsifies a historical record.

## Invocation

```
atlas transitions <unit>
```

- `<unit>` — required. The **unit lineage key** (a `qualifiedPath`, e.g. `src/pay.ts::charge`) whose grounded
  transitions to read. Identity is the **exact** lineage: a move/rename that changes the unit key is **out of
  scope** (D-T4), so a renamed unit's transitions are not silently linked across the rename.

## What a row carries

- `unitKey` / `shaBefore` / `shaAfter` — the identity legs (the lineage + the rev-pair the record spans).
- `authoring` — the **derive-on-read** verdict: `TRANSITIONED` for the lineage head (the tip of the chain,
  whose `shaAfter` is no other same-unit transition's `shaBefore`), `SUPERSEDED` for every predecessor.
- `freshness` — **stamped at emit and never re-checked** (D-T2). A transition is a true statement about the
  past regardless of HEAD, so `atlas transitions` does **not** re-derive it against the current index, and
  `atlas verify-store` skips it (its seal gate admits only `proven`; a transition is `justified`).

## Worked example

```
$ atlas transitions src/pay.ts::charge
status: ok
next: 2 transition(s) on lineage 'src/pay.ts::charge': 1 current (TRANSITIONED), 1 SUPERSEDED — supersession is derive-on-read over the shaBefore→shaAfter chain (D-T3), the record is never falsified
invariant: TRN-1: `atlas transitions` reads GROUNDED 2-rev historical records (family:transition) off the live projection the query readback rides — one unit LINEAGE, sorted (unitKey, shaBefore, shaAfter, nodeKey) so equal input is byte-identical output, the current head marked TRANSITIONED and predecessors SUPERSEDED (derive-on-read, D-T3), never re-checked at HEAD (D-T2), never a throw, no write path
```

## Producing a transition

Transitions are produced by [`atlas transition`](./transition.md) over two git revs where the unit's content
changed. `atlas transitions` is the read-back door for what that producer landed.
