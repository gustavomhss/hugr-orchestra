# `atlas derive-relations`

Derive **proven `depends-on` relations** from the code index and persist them into governed knowledge. It is
the shipped entrypoint for the #99 sound-relation MECHANICAL PROJECTION (ADR-0018): for every resolved
cross-unit reference the index witnesses — a source file under unit `A` referencing a symbol _defined_ in a
different file `B` — it emits a directed `A --depends-on--> B` relation, **sealed `proven`**, carrying a
re-runnable witness. No model is ever consulted: the derivation _is_ the proof, so the pass is 0-false by
construction and model-independent (the generator and the verifier are the one deterministic index).

This page describes the **CLI** command `atlas derive-relations`. There is **no `atlas-derive-relations` MCP
tool**, and there is no new write door: `WRITE_PATHS` is still `{atlas-emit, atlas-link}` and the governance
surface is still five tools. A derive pass is an _ordinary use_ of `atlas-emit` (ADR-0008), exactly as
[`promote`](./promote.md) is — so it persists through the same governed door, under every gate that door
applies, and an MCP client cannot run it.

## Invocation

```
atlas derive-relations
```

- **No arguments.** Arity is `0` and there is no flag. The repository is `process.cwd()`, because the index
  it projects and the store it writes are both under the one composed store — a path argument would let those
  two disagree (project one repo's index, publish into another's knowledge).
- `ATLAS_ACTOR` decides authorization. A derived relation is scoped to its **subject** endpoint's directory
  (`unitScopeOf(endpointA)`); the actor must own that scope in `.atlas/policy.json`, or the emit door refuses
  that row `unauthorized` and it is reported, not persisted (see below).
- `ATLAS_RATIFY_TOKEN` follows the same rule the emit door applies to any `T2` write.

## What it does, step by step

1. **Enumerate** the distinct resolved intra-repo edges from the index — every non-`local` symbol carrying a
   `definition` occurrence, and each caller document that references it from a **different** file. Same-file
   references (intra-unit) and external / `node_modules` targets are excluded; N references `A→B` collapse to
   one edge (`relation-derive.ts`).
2. **Prove + seal** each edge through the sound relation oracle: it binds _both_ endpoint files to the
   witnessed edge (endpoint `A` a real referrer of the target, endpoint `B` its definer) and admits a
   `proven`-sealed relation with its `RelationWitness`. Only `depends-on` is provable — a `calls` relation can
   never obtain a proven seal (SCIP carries no call-role occurrence).
3. **Persist** every proven relation through the governed emit door (`origin:'promoted'`, the trusted channel a
   sound-minted seal survives). The door re-runs the truth door, authz, and the D-d forged-seal strip, then
   lands the seal on the durable row and the witness in the CAS bytes in one atomic commit.

Read the persisted relations back with [`atlas relations <unit>`](./relations.md) — it surfaces each proven
`depends-on` edge in both directions, carrying its seal.

## Output shape

The command reports, per pass: the resolved-edge count (the AR-28 budget metric), how many the oracle
**proved**, how many the door **persisted** durably, and how many it **refused** — then one line per relation:

```
status: ok
next: <N> proven `depends-on` relation(s) are now durable — `atlas relations <unit>` reads each one back (both directions) carrying its proven seal
invariant: #99 R7: a `depends-on` relation is PROVEN by the index alone (a witnessed cross-unit reference, re-derivable) and persisted only THROUGH the governed emit door — the count reported is what SETTLED durably, never what was derived; no LLM anywhere (the derivation is the proof)
derive-relations: resolved <E> intra-repo edge(s), proved <P>, persisted <K>; <R> refused
  persisted <A> --depends-on--> <B> (<contentHash>)
```

The counts are **settled, never derived**: `persisted` is the emit door's `emitted:true` count, reported
alongside `proved` and the resolved-edge total so a partial pass (`persisted 12, refused 3`) is legible as one
rather than rounding to a success.

## Exit codes

| code | meaning                                                                                                                                                                        |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `0`  | every proven relation the projection derived was made durable — including the honest empty case (an index with no resolved cross-unit edges derives nothing, persists nothing) |
| `1`  | the runtime is not composed. Not reachable from the shipped binary; it is the injected-handler seam tests use                                                                  |
| `2`  | a **governed refusal**: at least one proven relation a gate declined, **or** the over-budget fail-loud (the resolved-edge count exceeded the ceiling, so nothing was derived)  |

`2` is the code that matters: the invocation was well-formed and a _gate_ said no. Every `2` names the row and
the reason, or (for the budget breach) the count that tripped the ceiling.

## The exhaustive budget — fail-loud, never truncated

A dependency graph is only useful **complete**, so the projection is exhaustive over resolved intra-repo
edges — but it is not silently unbounded. There is a row-count ceiling; if the resolved-edge count exceeds it,
the run **refuses** (exit `2`) and derives nothing, rather than emit a partial set labelled complete (an
"exhaustive" run that silently truncated would be unfalsifiable). Raise the ceiling deliberately or scope the
projection; never silence the breach.

## What it refuses, and why

- **An actor not in the endpoint's scope — `unauthorized`.** A relation is owned by whoever owns its subject
  endpoint's directory. Grant that scope in `.atlas/policy.json`, or the row is refused and reported. An unset
  `ATLAS_ACTOR` is in no scope, so every row is refused for the same reason.
- **A relation whose grounding does not re-derive FRESH — `ungrounded`.** The proven seal does not bypass the
  truth door: if an endpoint's file has drifted, the row is refused, nothing persisted.
- **A committed durable store** — the same provenance refusal every other command gets, raised at the
  entrypoint before any door opens; see [`query`](./query.md).

## Related

- [`relations`](./relations.md) — reads the proven `depends-on` relations this command persists.
- [`emit`](./emit.md) — the governed write door the projection publishes through; every gate is described there.
- [`promote`](./promote.md) — the other write command that funnels into `atlas-emit` rather than opening a door.
- [`verify-store`](./verify-store.md) — re-proves every stored proven relation's witness against the live index.
