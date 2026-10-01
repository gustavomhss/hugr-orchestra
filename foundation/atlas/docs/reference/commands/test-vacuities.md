# `atlas test-vacuities`

Read the **grounded test-vacuity facts** on a unit. A test-vacuity fact (ADR-0015 **D5** / #95) is a
**single-anchor `proven`** record — _named test `testName` in unit `unitKey` has every assertion-shaped call
inside a `catch` clause and no assertion-count guard_ (one shape of the closed `TestVacuityShape` vocabulary). This is the
**read-only** door: it folds the `family:'test-vacuity'` rows off the **same durable projection** `atlas query`
reads back, so a fact produced by [`atlas test-vacuity`](./test-vacuity.md) is visible to the very next call.

## Invocation

```
atlas test-vacuities <unit>
```

- `<unit>` — required. The **unit key** (a repo-relative test-file path, e.g. `test/sample.test.ts`) whose
  proven test-vacuity facts to read. An empty result is a **measured** fact (this unit, zero vacuous tests),
  never an absent line.

## Outcome

- **exit 0** — the read succeeded; the facts (possibly zero) are reported on the `next:` line. A test-vacuity
  fact is **single-anchor**: there is **no lineage** and **no supersession** verdict — each admitted fact stands
  alone and reads back as itself.
- **exit 1** — a malformed invocation (missing unit key) or an uncomposed runtime — a structured error with
  guidance, never a crash.

```
$ atlas test-vacuities test/sample.test.ts
status: ok
next: 1 proven test-vacuity fact(s) on unit 'test/sample.test.ts' — each a named test proven to hold one of the vacuity shapes, sealed proven
invariant: TV-READ: `atlas test-vacuities` reads GROUNDED single-anchor proven facts (family:test-vacuity) off the live projection the query readback rides — sorted (unitKey, testName, nodeKey) so equal input is byte-identical output, each fact standing alone (no lineage, no supersession — the family is single-anchor), never a throw, no write path
```

## Authority

`atlas test-vacuities` binds **`atlas-query`** — a READ authority oracle. It opens **no** governed surface
(`GOVERNANCE_SURFACE` stays 5) and writes nothing. To read a single fact back with its **witness** and **seal**,
use [`atlas node <id>`](./node.md).
