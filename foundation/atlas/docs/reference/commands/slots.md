# `atlas slots`

List the **closed predicate-slot vocabulary** — the read-only **discovery planner** (ADR-0004, **AUTHOR-5**)
that answers "what can I say?". `slots()` returns EXACTLY the members of the closed `PredicateSlot` union
(`@atlas/knowledge`), each paired with its meaning, in a fixed order — nothing invented, nothing omitted. The
set is **derived from the union**, not transcribed, so a spec revision that adds a slot cannot leave this door
stale.

It is a **planner**, not a governed door: it **persists nothing** (AUTHOR-2) and carries **no** write authority.

## Invocation

```
atlas slots
```

No arguments. `slots` answers over the WHOLE closed vocabulary, never a scoped subset.

## Outcome

- **exit 0** — the listing succeeded (this is the only outcome besides the runtime-not-composed floor). The
  verdict's `status:` is `ok`; the `next:` line reports the count; the `data:` block carries a header line
  (the measured count) followed by one `slot <name>: <meaning>` line per member, in the mapping's own order.
- **exit 1** — an uncomposed runtime — a structured error with guidance, never a crash.

The `data:` block is shaped like this (the count and every row are the closed union's own members — this is
NOT illustrative in the way a rev/hash line is; it is the fixed vocabulary itself):

```
data:
  slots: 13 predicate slot(s)
  slot invariant: a property that must always hold
  slot contract: the interface / signature agreement
  slot precondition: what must hold on entry
  slot postcondition: what is guaranteed on exit
  slot sideeffect: observable effects (IO / mutation)
  slot ownership: owner / lifetime / concurrency ownership
  slot perf-bound: complexity / latency / allocation bound
  slot security-property: authz / crypto / taint property
  slot gotcha: a non-obvious pitfall / footgun
  slot rationale: why it is built this way (the WHY)
  slot dependency: a required relationship / ordering
  slot count: a witnessed lower-bound count over a structural set (e.g. distinct callers)
  slot definition: a term / ontology definition (feeds Awareness `ontology`)
```

## Authority

`atlas slots` binds **`atlas-query`** — a READ authority oracle. It opens **no** governed surface
(`GOVERNANCE_SURFACE` stays 5), it is **not** a member of `WRITE_PATHS`, and it writes nothing (AUTHOR-2 /
PROP-AUTH-2). It is the second step of the authoring flow (after [`atlas anchors`](./anchors.md)): pick a
slot here, then draft a fact against a unit with [`atlas draft`](./draft.md).
