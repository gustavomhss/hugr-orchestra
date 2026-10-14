# `atlas territories`

The **RETR-13 per-territory off-atlas MISS-oracle** (WP-3-RETR) — per territory, the OFF-ATLAS RATE =
`offAtlasReads / served` (the fraction of served turns where the seat had to `Read`/`Grep` OUTSIDE the
surfaced scope-set). It measures COVERAGE — the silent failure the drift-oracle cannot see. A territory
with no served history renders rate `0`, never a throw; a rate crossing the OPEN-DEFINE threshold raises a
**calibration prompt** to author the missing tag/edge.

This page describes the **CLI** command `atlas territories`. It is CLI-only (not an MCP tool): a READ door
over the composition root's `territories` leg, no `Tool` token, no write authority.

## Invocation

```
atlas territories
```

No positional, no flag. The served-turn record set it reads is the **honest zero** today: no served-turn log
exists anywhere in the product (the query serve path records neither territory nor off-atlas-ness). The
`known` vocabulary — the territories the oracle reports even when never served — is REAL and read, never
invented: the admin-declared `authz.scopes` keys (`packages/adapter-io/src/policy.ts`).

## The threshold

The off-atlas rate that triggers the calibration prompt is an OPEN-DEFINE parameter (`req-ret.md`
§REQ-RETR-13b — the reference clause is silent on the number). It is bound in EXACTLY ONE place,
`packages/adapter-io/src/calibration-ledger.ts` `OFF_ATLAS_THRESHOLD` (the `USE_THRESHOLD` single-binding
discipline from `@atlas/knowledge` `hits.ts`). The frozen predicate keeps the parameter parametric; this
door surfaces the bound value so a reader can see the number being applied.

## Worked example — a fresh repository

```
$ atlas territories
status: ok
next: no territory crosses the off-atlas threshold (0.3) — no calibration prompt
invariant: RETR-13: atlas-territories renders the per-territory off-atlas MISS-oracle — off-atlas rate = offAtlasReads/served, no-served-history ⇒ rate 0 (never a throw), and a rate crossing the OPEN-DEFINE threshold raises a calibration prompt
# exit 0
```

## Exit codes

| code | meaning                                                                           |
| ---- | --------------------------------------------------------------------------------- |
| `0`  | the MISS-oracle was assembled (the honest-zero feed renders fine — never a throw) |
| `1`  | an uncomposed runtime — the composition root failed to stand up, never a throw    |

There is no `2` (rejected) outcome: this door opens no governed token and persists nothing.

## Authority

`atlas territories` binds `atlas-query` — a READ authority oracle, intercepted before the governed handler
like `atlas doctor`/`atlas node`, reading off the composition root's `territories` leg. It opens **no**
governed surface and is **not** a `WRITE_PATHS` member.

## Related

- [`budget`](./budget.md) — the RETR-8 precision-ledger sibling (hits/hitRate, cap tuning); territory MISS
  (coverage) is the complement.
- [ADR-0006] — the READ_SURFACE / governance-surface partition both belong to.
