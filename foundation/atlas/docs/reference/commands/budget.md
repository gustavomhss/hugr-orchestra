# `atlas budget`

The **RETR-8 per-kind hits/hitRate calibration ledger** (WP-3-RETR) — the per-kind `budget()`/`capFor()` the
frozen `@atlas/retrieval` `ledger.ts` builds over the served-injection record set. Caps tune by OBSERVED
hits, never by an invented rate; a kind with zero served records renders at its ratified sweet-spot floor
(`BASE_CAP`, hitRate `0`, never `NaN`).

This page describes the **CLI** command `atlas budget`. It is CLI-only (not an MCP tool): a READ door over
the composition root's `budget` leg, no `Tool` token, no write authority.

## Invocation

```
atlas budget
```

No positional, no flag. The record set it reads is the **honest zero** today: no production writer records
served injections per kind anywhere durable (`adapter-io/src/own-source.ts` names the SAME deficit at
`hits: 0`). The RETR-8 served-injection WRITER is the next work-package; this door renders the floor and says
so — it never fabricates a rate.

## Worked example — a fresh repository

```
$ atlas budget
status: ok
next: ratified BASE_CAP floor — 0 served injections recorded (the RETR-8 writer is the next work-package; nothing fabricated here)
invariant: RETR-8: atlas-budget renders the per-kind hits/hitRate calibration ledger — caps tuned by OBSERVED use, never invented; a kind with zero served records stays at its ratified sweet-spot floor (hitRate 0, never NaN)
# exit 0
```

## Exit codes

| code | meaning                                                                                  |
| ---- | ---------------------------------------------------------------------------------------- |
| `0`  | the calibration ledger was assembled (the honest-zero feed renders fine — never a throw) |
| `1`  | an uncomposed runtime — the composition root failed to stand up, never a throw           |

There is no `2` (rejected) outcome: this door opens no governed token and persists nothing.

## Authority

`atlas budget` binds `atlas-query` — a READ authority oracle, intercepted before the governed handler like
`atlas doctor`/`atlas node`, reading off the composition root's `budget` leg. It opens **no** governed surface
and is **not** a `WRITE_PATHS` member.

## Related

- [`territories`](./territories.md) — the RETR-13 MISS-oracle sibling (coverage, read-rate vs threshold), the
  other half of the calibration ledger.
