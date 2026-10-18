# `atlas verify-store`

**Re-prove every `seal:'proven'` fact in the durable store against the live index** — the REVERIFY-GATE for
the versioned-store chapter. A fact sealed `proven` carries its own derivation (`witness` — #195,
SEAL-CARRIES-ITS-WITNESS): the oracle FAMILY, the `target`, the VERIFY-SCOPE, and (for `count`) the witnessed
lower bound. This door replays every stored witness through the SAME `atlas verify-fact` oracle
(`@atlas/genesis`) and reports whether the fact still holds — read-only, opens no write path
(`GOVERNANCE_SURFACE` stays 5).

The premise this door closes: content-addressing authenticates INTEGRITY (the CAS hash matches the bytes),
never PROVENANCE (whether the fact ever passed a gate). A fact whose own witness re-proves against the
CURRENT index is true regardless of who or what committed the row that carries it — the re-verification is
the trust, not the byte's origin.

## The four buckets

Every `seal:'proven'` fact lands in EXACTLY one bucket. They never merge, and none but `re-proven` is
rendered as a pass:

| bucket         | meaning                                                                                                                                                                                                                                                                                                |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `re-proven`    | the witness replayed through the live oracle and came back `proven`                                                                                                                                                                                                                                    |
| `broken`       | replayed and did NOT come back `proven` — the store has drifted from what it claims (a deleted caller, a moved symbol, a rewritten index)                                                                                                                                                              |
| `unverifiable` | `seal:'proven'` with NO witness, or an incomplete one — there is nothing to replay. A witness-less `proven` seal is precisely the trust-me-it-was-proved shape this door exists to eliminate                                                                                                           |
| `dangling`     | `seal:'proven'` and its `contentHash` resolves to nothing in the CAS. The bytes ARE the fact, so there is nothing left to re-prove — the store is referentially broken, which is a storage fault rather than a proof-strength one. `atlas doctor cas` is the store-wide audit of that layer (ADR-0022) |

A fact carrying no `seal` at all is out of scope for this pass — it is simply not counted.

### `dangling` was added because this door used to answer ZERO

The pass paired each projection row with the fact its `contentHash` resolves to, and **dropped** rows that
resolved to nothing — silently, uncounted, in two independent code paths. Measured on Atlas's own store: 17
rows carry `seal:'proven'`, every one of their objects is missing, and this command printed

```
verify-store: 0 sealed-proven fact(s) — 0 re-proven, 0 broken, 0 unverifiable
```

and exited **0**, under guidance reading _"an honest zero, not a skip"_. It was exactly a skip, and the
sentence denying it is what made it dangerous: the gate whose whole job is to catch a proven fact that
stopped being true reported a clean, empty, healthy store — for the one fault it could not see by looking at
facts, because the facts are what went missing. The seal lives on the projection row, not in the bytes, so
there was never a technical reason to drop these rows. The same store now reports 17 `dangling` and exits 2.

## Invocation

```
atlas verify-store
```

No positional argument, no flags: the pass runs over the WHOLE durable store at `process.cwd()` — the same
root the entrypoint composes the runtime over, so the store re-verified can never diverge from the one every
other command reads.

## Exit code

- `0` — the pass ran and every `seal:'proven'` fact re-proved (`broken: 0` and `unverifiable: 0`),
  **including the honest empty case** (no `seal:'proven'` fact in the store at all — an honest zero, never
  rendered like "verified N, all clean").
- `2` — the pass ran and found at least one `broken` or `unverifiable` row. A governance-shaped refusal:
  the invocation was fine, the STORE failed to re-prove itself.

## Worked example

An empty, freshly-initialized store holds no `seal:'proven'` fact — the honest zero, distinguishable from a
populated-and-passing store by its own sentence, never silently rendered the same way:

```
$ atlas verify-store
status: ok
next: the durable store holds NO seal:'proven' fact — nothing to re-verify (an honest zero, not a skip); `atlas mine` + `atlas promote` are what seal a fact `proven`
invariant: REVERIFY-GATE: every `seal:'proven'` fact is re-proved against the LIVE index via its OWN recorded witness — re-proven / broken / unverifiable, three buckets that never merge; a witness-less `proven` seal is `unverifiable`, never a pass
verify-store: 0 sealed-proven fact(s) — 0 re-proven, 0 broken, 0 unverifiable, 0 dangling
# exit 0
```

All three buckets firing together — a `re-proven`, a `broken` and an `unverifiable` fact in one pass — is
mechanically pinned end to end by `packages/adapter-io/test/reverify-gate-compose.test.ts` (over a REAL
composed runtime + REAL oracle, three CAS rows seeded directly) and by
`packages/e2e-blackbox/test/s34-reverify-store.blackbox.test.ts` (over the shipped binary: a promoted
dependency fact re-proves, then the SAME durable fact goes `broken` once its caller is rewritten out of the
index). Reproducing a `broken`/`unverifiable` row needs a populated store this page cannot carry, so those two
transcripts are **illustrative**, not re-run by `doc-transcript-guard`:

```
$ atlas verify-store
status: rejected
next: 1 sealed-proven fact(s) no longer re-prove against the live index — the store has drifted from what it claims; read the rows below
invariant: REVERIFY-GATE: every `seal:'proven'` fact is re-proved against the LIVE index via its OWN recorded witness — re-proven / broken / unverifiable, three buckets that never merge; a witness-less `proven` seal is `unverifiable`, never a pass
verify-store: 1 sealed-proven fact(s) — 0 re-proven, 1 broken, 0 unverifiable, 0 dangling
  broken nk-a: replay did NOT re-prove — oracle returned 'abstain' (target-unresolvable)
# exit 2
```

```
$ atlas verify-store
status: rejected
next: 1 sealed-proven fact(s) carry NO witness (or an incomplete one) — nothing could be replayed for them; read the rows below
invariant: REVERIFY-GATE: every `seal:'proven'` fact is re-proved against the LIVE index via its OWN recorded witness — re-proven / broken / unverifiable, three buckets that never merge; a witness-less `proven` seal is `unverifiable`, never a pass
verify-store: 1 sealed-proven fact(s) — 0 re-proven, 0 broken, 1 unverifiable, 0 dangling
  unverifiable nk-b: seal:proven but no witness was recorded — nothing to replay
# exit 2
```

## Invariant

> **REVERIFY-GATE** — every `seal:'proven'` fact is re-proved against the LIVE index via its OWN recorded
> witness: `re-proven` / `broken` / `unverifiable`, three buckets that never merge; a witness-less `proven`
> seal is `unverifiable`, never a pass.

The index is built ONCE per invocation and reused for every fact, so the binding cost is the index build and
NOT the per-fact check: `reverifyStore` is a filter plus a loop over an in-memory array with no IO of its own,
while the build parses the whole SCIP dump and folds the repo. That is a claim about SHAPE, which the code
carries and a reader can re-derive; a wall-clock number is deliberately NOT quoted here, because a figure
committed to prose cannot be re-run and rots silently against the machine, the repo size and the index form
that produced it. To get the number for YOUR repo, time the command — that measurement is reproducible and
this sentence never will be.

This door rides the SAME `verifyFact` oracle and the SAME durable-store readback `atlas doctor` /
`atlas reconcile` use, never a second index build or a second oracle.
