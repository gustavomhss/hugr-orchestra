# `atlas draft`

Compose a **candidate `GroundedFact`** — the read-only **composition planner** (ADR-0004, **AUTHOR-6/7**)
that answers "give me a payload the door will accept". The author supplies **EXACTLY three things**: the
anchor, the slot, and the claim (AUTHOR-6d). Every other field of the composed fact is **computed** — the
identity by the product's own `nodeKey` formula (AUTHOR-6b), the grounding's `subtreeHash` by the SAME
`GroundingComputer` [`atlas anchors`](./anchors.md) reads (AUTHOR-6c/AUTHOR-1) — or **defaulted** (`tier`,
`scope`), **never demanded** of the author.

It is a **planner**, not a governed door: it **persists nothing** (AUTHOR-2) and carries **no** write authority.

## Invocation

```
atlas draft <anchor> <slot> <claim>
```

- `<anchor>` — required. The `qualifiedPath` of a groundable unit (see [`atlas anchors <path>`](./anchors.md))
  to cite.
- `<slot>` — required. One member of the closed predicate-slot vocabulary (see [`atlas slots`](./slots.md)). A
  value outside that vocabulary is refused BEFORE the grounding computer is ever consulted.
- `<claim>` — required. The claim body to draft.

No INPUT flag is accepted — there is no `--id`, `--subtree-hash`, or `--rev` flag: those fields are ALWAYS
computed (AUTHOR-6d/6f), never a positional or a flag this door reads. The one flag it honors is an OUTPUT
mode:

- `--json` — on a successful draft, print the WHOLE `DraftOut` envelope (`{ fact, rev, operation, route,
requires? }`) as a single machine-readable JSON object to stdout, INSTEAD of the human `data:` render. This
  is what lets an author capture the envelope and feed it straight to `atlas emit` (see the round trip below).
  On a failed draft it is ignored and the same human error render is printed.

## Outcome

- **exit 0** — the draft composed. The verdict's `status:` is `ok`; the `data:` block carries the minted
  identity, tier, slot, claim, the `rev` the grounding was computed at (AUTHOR-7a), whether this is a `CREATE`
  or an `UPDATE` (AUTHOR-10), and the ratification `route` — with the authorizing channel (`requires:`) when
  the route is `full-ratify` (AUTHOR-9).
- **exit 1** — a missing/empty `<anchor>`/`<claim>`, an out-of-vocabulary `<slot>`, or an uncomposed runtime —
  a structured error with guidance, never a crash.

The `data:` block is shaped like this (`<id>` is the real minted `nodeKey`, `<rev>` is the live HEAD the
grounding was computed at — both vary by repo and revision, so this is illustrative, not a fixed transcript):

```
data:
  draft: <id>
  tier: T2
  slot: invariant
  claim: never returns empty
  rev: <rev>
  operation: CREATE
  route: full-ratify
  requires: ATLAS_RATIFY_TOKEN
```

## Rev-stamping and the round trip (AUTHOR-7/8)

A draft is **rev-stamped**: the `rev:` line names exactly the commit its `subtreeHash` was derived at. Capture
the envelope with `--json` and emit it with [`atlas emit`](./emit.md) at the **SAME rev** to close the round
trip (AUTHOR-8), entirely through product doors:

```
atlas draft <anchor> <slot> <claim> --json > draft.json
atlas emit draft.json --at <rev>
```

`atlas emit` accepts EITHER a bare `GroundedFact` (its pre-existing input shape) OR the whole
draft envelope this command's `--json` output carries; when it is fed the envelope and `--at` names a
**different** rev than the one the draft carries, the refusal **names the rev mismatch explicitly** —
DISTINCT from the generic "ungrounded: citation does not re-derive at source@sha" refusal a genuinely stale
citation gets — and does **not** attribute the failure to the claim (AUTHOR-7b/7c).

## Authority

`atlas draft` binds **`atlas-query`** — a READ authority oracle. It opens **no** governed surface
(`GOVERNANCE_SURFACE` stays 5), it is **not** a member of `WRITE_PATHS`, and it writes nothing (AUTHOR-2 /
PROP-AUTH-2). It is the third step of the authoring flow: pick a unit with `atlas anchors`, pick a slot with
`atlas slots`, draft a fact here, then publish it through the governed [`atlas emit`](./emit.md) door.
