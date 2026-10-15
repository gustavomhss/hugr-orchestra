# `atlas negations`

List the **grounded negatives** and the **honest abstentions** under a scope. A grounded negation
(ADR-0015 D3 / #99b — "the honesty core") is a `family:'negation'` fact the truth door admitted: _within a
CLOSED scope S under edge-model E, no `relationKind`-edge targets X was found_ — a `¬∃` that carries its own
completeness proof. An **abstention** is the door **declining to decide** such a negative because the scope
was not closed (an unresolved/dynamic edge left it OPEN); it asserts nothing about the world, it records that
the question was ASKED and could not be soundly answered, and **why**. Read-only — it opens no write path.

`negations` answers both halves in one read: "what negatives are grounded under this scope, and where did the
door abstain". Surfacing the abstention is the point (#202): an abstention that fired must be **observable**,
so a human can SEE the door declined to decide instead of it vanishing silently.

This command exists on **both transports**: the CLI command `atlas negations` and the MCP tool
`atlas-negations`. Both drive the **same** shared verdict builder over the **same** durable projection
`atlas query` reads back, so identical input yields a byte-identical verdict on either transport.

## Invocation

```
atlas negations <scope> [--abstained]
```

- `<scope>` — required. The **scope key** (a directory key, e.g. `src/payments`) whose grounded negatives and
  abstentions to read. Rows whose own scope is **under** this scope are returned (segment-wise path
  containment: `src` covers `src/payments`, `sr` does **not** cover `src`).
- `--abstained` — optional boolean flag. **Focuses** the output on the abstentions only. The verdict `data`
  always carries **both** arrays regardless, so an abstention is observable with or without the flag; the flag
  only changes what the CLI renders.

## Worked example

The default shows the grounded negatives **and** the abstentions — a fired abstention is on the screen:

```
$ atlas negations src
status: ok
next: 1 grounded negative(s) and 1 ABSTENTION(s) under 'src' — an abstention is the door declining to decide a negative over an OPEN scope (see its reason + witness), NOT a negative; it fired and is on the record (#202)
invariant: NEG-1: `atlas negations` reads GROUNDED negatives (family:negation) AND honest ABSTENTIONS off the live projection the query readback rides — scope-contained (segment-wise path-prefix, #153-safe), sorted for byte-identical output, never a throw, no write path; an abstention that FIRED is observable (closes #202)
data:
  negations: src — 1 negation(s), 1 abstention(s)
  negation calls src/payments/charge.ts::charge in src/payments (neg:abc…)
  abstained calls src/orders/place.ts::place in src/orders — scope-open
# exit 0
```

`--abstained` focuses on the abstentions:

```
$ atlas negations src --abstained
status: ok
next: […]
invariant: NEG-1: […]
data:
  negations: src — 1 abstention(s)
  abstained calls src/orders/place.ts::place in src/orders — scope-open
# exit 0
```

An empty result is a **measured fact**, not an absent line:

```
$ atlas negations lib
status: ok
next: no grounded negative and no abstention under scope 'lib' — a negation is filed by the truth door (`atlas emit` a family:negation fact over a CLOSED scope); check the scope spelling, or widen it
invariant: NEG-1: `atlas negations` reads GROUNDED negatives (family:negation) AND honest ABSTENTIONS off the live projection the query readback rides — scope-contained (segment-wise path-prefix, #153-safe), sorted for byte-identical output, never a throw, no write path; an abstention that FIRED is observable (closes #202)
data:
  negations: lib — 0 negation(s), 0 abstention(s)
# exit 0
```

## Exit codes

| code | meaning                                                                         |
| ---- | ------------------------------------------------------------------------------- |
| `0`  | the negatives and abstentions were read (**including** the honest empty result) |
| `1`  | a missing scope, or a runtime that is not composed                              |
| `2`  | a governance gate refused the read (the committed-store tripwire)               |

## What it refuses, and why

**A missing scope is a structured refusal, not a crash.** `negations` with no positional fails at the parser
arity floor with `command 'negations' requires 1 positional argument(s)` and exits `1` — the shared verdict
builder additionally enforces `required:['scope']`, so a bare MCP `{}` call fails closed the same way.

**A committed durable store.** Like every read door, `negations` is refused at the entrypoint when `.atlas/`
arrived by commit rather than through a governed door (exit 2). See [`query`](./query.md) for the text.

**Writing.** `negations` reads through a leg with no store-mutating method. A negation is _filed_ — and an
abstention _recorded_ — through the governed emit door; there is no write path here.

## Transport differences

`negations` is on **both** transports. Over MCP it is the `atlas-negations` tool, served directly from the
injected read leg (it is **not** in `GOVERNANCE_SURFACE` — it opens no governed surface, so there is no `Tool`
token and `GOVERNANCE_SURFACE` is untouched by this door; production advertises it alongside the governance
surface plus `atlas-relations`, `atlas-negations`, and every read/planner door — see the README's command
table for the current surface). Its input schema is documented on the tool:
`{ scope: string (required), abstained?: boolean }`. The **verdict** bytes (`data` + `guidance`) are identical
to the CLI's, because both transports drive the one shared builder.

## Related

- [`relations`](./relations.md) — the sibling grounded-relation read (ADR-0015 D2); same separate-command shape.
- [`query`](./query.md) — the bounded pack over a scope.
- [`node`](./node.md) — read one fact whole by its content address.
