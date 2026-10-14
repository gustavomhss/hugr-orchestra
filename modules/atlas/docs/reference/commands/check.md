# `atlas check`

**Dry-run the governed emit door's whole gate chain** over a candidate — the read-only **dry-run planner**
(ADR-0004, **AUTHOR-11/12**) that answers "would the door accept this fact, and if not, at which gate, why, and
what would fix it". It composes the candidate exactly as [`atlas draft`](./draft.md) does (the author supplies
**EXACTLY three things** — the anchor, the slot, and the claim; every other field is computed or defaulted),
then folds the **same four gate predicates** the real door folds — shape → truth → authz → ratify — **without
any write**.

It is a **planner**, not a governed door: it **persists nothing** (AUTHOR-2) and carries **no** write authority.
The `wouldEmit` verdict and the first-refusing gate agree with the real [`atlas emit`](./emit.md) door's **by
construction** (PROP-AUTH-11): the check runs through the SAME `runGateChain` fold the door's own gate
predicates flow through, never a second gate ladder that could drift.

## Invocation

```
atlas check <anchor> <slot> <claim>
```

- `<anchor>` — required. The `qualifiedPath` of a groundable unit (see [`atlas anchors <path>`](./anchors.md))
  to cite.
- `<slot>` — required. One member of the closed predicate-slot vocabulary (see [`atlas slots`](./slots.md)). A
  value outside that vocabulary is refused BEFORE the candidate is composed — the SAME surface
  [`atlas draft`](./draft.md) refuses it at.
- `<claim>` — required. The claim body to dry-run.

The candidate is composed through the SAME composition planner `atlas draft` uses, then dry-run at the rev the
draft was stamped against (the draft's own `rev`, AUTHOR-7a) — so the check answers about the fact you would
actually emit, at the revision you would emit it.

## Outcome

- **exit 0** — the dry-run produced an ANSWER. The verdict's `status:` is `ok`; the `next:` line states
  whether the candidate **would be ADMITTED** (all gates pass) or **would be REFUSED** — and when refused,
  it **names the first gate that refuses** and carries that gate's **remedy** (AUTHOR-12b). A refusal is a
  legitimate answer, not an error: the sound gate declining to admit is still exit 0, never a crash.
- **exit 1** — a missing/empty `<anchor>`/`<claim>`, an out-of-vocabulary `<slot>`, or an uncomposed runtime —
  a structured error with guidance, never a throw.

Illustrative refusal (the gate and remedy vary by candidate, anchor, and revision, so this is illustrative,
not a fixed transcript):

```
status: ok
next: the candidate would be REFUSED at gate 'truth' — re-derive the citation against the CURRENT
      source tree, or re-anchor the claim to a unit that still exists
```

## Relationship to `draft` and `emit`

`atlas check` is the **dry run before the write**. The authoring flow is: pick a unit with
[`atlas anchors`](./anchors.md), pick a slot with [`atlas slots`](./slots.md), compose a fact with
[`atlas draft`](./draft.md), **check whether the door would accept it here**, then publish it through the
governed [`atlas emit`](./emit.md) door. The one thing a dry run cannot rule out is a store mutation
_between_ the read-only snapshot it reads and a later real `emit` — the emit door's own header states the
identical caveat.

## Authority

`atlas check` binds **`atlas-query`** — a READ authority oracle. It opens **no** governed surface
(`GOVERNANCE_SURFACE` stays 5), it is **not** a member of `WRITE_PATHS`, and it writes nothing (AUTHOR-2 /
PROP-AUTH-2). It is also exposed over MCP as the `atlas-check` tool — the CLI and MCP transports drive the
SAME shared verdict builder for byte-identical behavior.
