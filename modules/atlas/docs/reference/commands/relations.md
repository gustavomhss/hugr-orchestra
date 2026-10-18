# `atlas relations`

List the **grounded relation facts** touching a unit, in both directions. A grounded relation
(ADR-0015 D2 / #99a) is a `family:'relation'` fact the truth door admitted — `endpointA <relationKind>
endpointB`, read left-to-right. `relations` answers "what relations touch this unit, and which way do they
point". Read-only — it opens no write path.

This command exists on **both transports**: the CLI command `atlas relations` and the MCP tool
`atlas-relations`. Both drive the **same** shared verdict builder over the **same** durable projection
`atlas query` reads back, so identical input yields a byte-identical verdict on either transport.

## Invocation

```
atlas relations <unit> [out|in|both]
```

- `<unit>` — required. The **nodeKey** of the unit the relations touch (the identifier `atlas query`'s `inv`
  lines carry, **not** a content address).
- `[direction]` — optional second positional; one of `out` | `in` | `both`. Defaults to `both`.
  - `out` — the unit is the **subject** (`unit <kind> ?`).
  - `in` — the unit is the **object** (`? <kind> unit`).
  - `both` — the union.
- No flags.

## Worked example

```
$ atlas relations pkg/order.ts::placeOrder both
status: ok
next: 2 grounded relation(s) touch 'pkg/order.ts::placeOrder' (direction 'both') — each carries its own nodeKey; inspect one with `atlas doctor why <nodeKey>`
invariant: REL-1: `atlas relations` reads GROUNDED relation FACTS (family:relation) off the live projection the query readback rides — directed (out=subject, in=object, both=union), sorted (relationKind, endpointA, endpointB, nodeKey) so equal input is byte-identical output, never a throw, no write path
data:
  relations: pkg/order.ts::placeOrder both — 2 edge(s)
  relation calls pkg/order.ts::placeOrder -> pkg/pay.ts::charge (rel:abc…)
  relation depends-on pkg/db.ts::save -> pkg/order.ts::placeOrder (rel:def…)
# exit 0
```

An empty result is a **measured fact**, not an absent line:

```
$ atlas relations pkg/order.ts::placeOrder out
status: ok
next: no grounded relation fact touches 'pkg/order.ts::placeOrder' in direction 'out' — a relation is filed by the truth door (`atlas emit` a family:relation fact); check the spelling of the unit key, or widen the direction to 'both'
invariant: REL-1: […]
data:
  relations: pkg/order.ts::placeOrder out — 0 edge(s)
# exit 0
```

## Exit codes

| code | meaning                                                           |
| ---- | ----------------------------------------------------------------- |
| `0`  | the relations were read (**including** the honest empty result)   |
| `1`  | an out-of-vocabulary direction, or a runtime that is not composed |
| `2`  | a governance gate refused the read (the committed-store tripwire) |

## What it refuses, and why

**An unknown direction is a structured refusal, not a crash.** `relations foo sideways` renders
`unknown direction 'sideways': expected out|in|both` and exits `1` — the shared verdict builder is total.

**A committed durable store.** Like every read door, `relations` is refused at the entrypoint when `.atlas/`
arrived by commit rather than through a governed door (exit 2). See [`query`](./query.md) for the text.

**Writing.** `relations` reads through a leg with no store-mutating method. A relation is _filed_ through
[`emit`](./emit.md); there is no write path here.

## Transport differences

`relations` is on **both** transports. Over MCP it is the `atlas-relations` tool, served directly from the
injected read leg (it is **not** in `GOVERNANCE_SURFACE` — it opens no governed surface, so there is no
`Tool` token and `GOVERNANCE_SURFACE` is untouched by this door). Its input schema is documented on the tool:
`{ unit: string (required), direction?: 'out'|'in'|'both' }`. The **verdict** bytes (`data` + `guidance`) are
identical to the CLI's, because both transports drive the one shared builder.

## Related

- [`query`](./query.md) — the bounded pack; a relation's endpoints are nodeKeys `query` also serves.
- [`node`](./node.md) — read one fact whole by its content address.
