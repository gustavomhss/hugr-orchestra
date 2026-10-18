# ADR — Retrieval modes & the read-only node door (N2 / N6)

Status: accepted
Scope: `packages/cli`, `packages/adapter-io` (composition root), `packages/index` retrieval surface

This ADR records three deliberate decisions taken while wiring the two user-facing read doors
(`atlas query --by …` and `atlas node <addr>`) through the FROZEN designed surfaces.

## 1. `byTrigger` is a declared-but-dormant retrieval mode (N2)

The CLOSED three-mode retrieval surface (`@atlas/index` `retrieval.ts`, INDEX-6) resolves relevance by
EXACTLY `byScope`, `byDependency`, `byTrigger`. `atlas query <target> --by scope|dependency|trigger` now
routes THROUGH `createRetrieval(model)` (the composition root feeds the `RetrievalModel`), so the surface is
no longer dead.

- `byScope` — the pre-existing projection path (covering territory + roll-up + emitted-fact readback), kept
  BYTE-IDENTICAL. It is the default when `--by` is omitted.
- `byDependency` — the EXISTING depgraph reverse closure (blast radius) over `axes.edges`, keyed by each
  current node's `primaryAnchor`, bridged to fact CAS hashes through the current-anchor set.
- `byTrigger` — **dormant**. There is NO trigger-axis producer anywhere in the monorepo (nothing attaches
  fact-level trigger tags to a cross-cutting axis), so the model's `triggers` map is EMPTY (`new Map()`) and
  `byTrigger(tag)` returns `[]` for every tag. This is an HONEST empty (a total, deterministic empty pack),
  NOT a masked bug. Populating trigger tags is a **separate future feature** (a fact-level trigger-tag
  producer + a `tag → object hashes` axis), out of scope for this wiring.

## 2. `atlas node <addr>` — the read-only per-node door (N6)

`resolveNode` (`@atlas/tools` `handler.ts`, TOOLS-10) is a total read-only oracle that was reachable over no
CLI door and was built WITHOUT a `NodeSource` at the composition root (so it always failed closed with "no
per-node projection source wired"). This wiring:

- adds `atlas node <addr>` as a CLI command with NO write authority (it maps to the `atlas-query` read
  authority oracle in `map.ts`, exactly like `doctor`), intercepted before the write handler in `cli.ts`;
- passes a `NodeSource` into `createHandler(legs, nodes)` at the composition root (`wire.ts`), whose
  `resolve(addr)` reads the whole fact back from CAS by its CONTENT ADDRESS over the SAME durable store the
  query readback and governed emit ride. READ-ONLY: it opens NO write path.

A hit renders the `GroundedFact` (exit 0); a miss is total + structured (`status: error`, exit 1, a reason),
never a crash.

## 3. `poke` / push stays orchestrator-owned — deliberately NOT a user command

`materializePoke` / push is NOT exposed as a user command. Per `docs/requirements/req-tls.md:165-171,235-240`
the poke/push channel is ORCHESTRATOR-OWNED and zero-grant: it fires AUTOMATICALLY at a phase boundary with
no human/user grant. A user-facing `atlas poke` command would contradict that contract (it would hand a user
a grant the design withholds). The capability therefore stays a LIBRARY SEAM, invoked by the orchestrator at
the phase boundary, never surfaced as a governance/CLI door.

## 4. `atlas query`'s `stale` flag is a STORED read, not a live drift oracle (N11)

`atlas query`'s `stale` flag reflects the `freshness` field STORED at emit time (read verbatim off the CAS
fact — the projection readback surfaces `stale=true` only when a backing fact's persisted `freshness` is
`DRIFTED`). NO emit/reconcile/doctor path flips an already-persisted fact's `freshness` to `DRIFTED` in place,
so a fact that has genuinely drifted since it was written still queries `stale: false`.

This is a deliberate design boundary, not a bug: `atlas query` is the FAST projection read (a cheap covering
pack), so it does NOT re-derive groundings against HEAD. The LIVE drift oracle is `atlas doctor why` /
`atlas reconcile` — they re-derive each anchor against the working tree / a rev and classify mechanical vs
semantic drift. Trust `stale` as a "was-drifted-when-last-touched" hint, and `doctor`/`reconcile` as the
authoritative "is-drifted-now" verdict. (The three-mode `--by dependency|trigger` packs carry `stale: false`
for the same reason — they are projection reads, not live re-derivations.)

## 5. `atlas node <addr>` resolves ANY fact in CAS by hash — a wider read surface, not an escalation

`atlas node <addr>` resolves ANY content-addressed fact present in CAS — INCLUDING superseded / historical
facts that the current-projection `atlas query` would not surface (query returns only the ONE current node per
`nodeKey`; CAS retains prior versions). This is a WIDER read surface than query, deliberately: a content
address is an exact, grounded, hash-gated handle (you must already know the 64-hex address; there is no
enumeration and no fuzzy match), and the door is READ-ONLY. It is NOT a privilege escalation — there is no
per-node read authorization in the model (reads are open; only WRITES are owner-scoped via KNOW-11), so
exposing historical facts by exact hash grants no capability a user did not already have over CAS. The address
is charset-gated (`^[0-9a-f]{64}$`) + sandboxed to the CAS root at the door AND in the store, so a non-CAS or
traversal address is a structured miss, never a filesystem read (see §2).
