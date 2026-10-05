# ADR-0003 — INV-TOOLS-1 evolves: "single write door" → "governed write doors (same bar)"

- **Status:** Accepted (2026-07-21)
- **Owner-authorized:** yes — when WP-SAMEAS surfaced the conflict, the owner was asked to choose and
  ratified "Aceitar 2ª porta governada" (accept the second governed write door).
- **Spec author:** lead, grounded against the shipped code (`d290bd2`) + the billy/bobby/lucy cold reviews.
- **Amends:** INV-TOOLS-1 (reference/atlas-tools.md#tools-1) + REQ-TOOLS-1a/1b/16e (req-tls.md).

## Context

WP-SAMEAS (#43, owner-authorized) adds a human-asserted `sameAs` equivalence: a person links two EXISTING
nodeKeys that name the same fact at unrelated code sites. That is a **write** (it mutates the durable
projection) but it is NOT an `atlas-emit` (it grounds no new fact; it relates two facts that already passed
the truth gate). Making it a governed write therefore requires a write path that is not `atlas-emit`.

INV-TOOLS-1 as ratified said the write surface is exactly one door (`atlas-emit`), structurally enforced by
a single-write-door guard, and the governance surface is exactly four tools. Building sameAs as a governed
write **necessarily** conflicts with that literal count.

## Decision

INV-TOOLS-1 is amended from a **count** invariant to a **property** invariant:

> Every write to the durable store goes through a GOVERNED door — one enforcing KNOW-11 owner-scoped
> authorization AND a ratifier, and whose refusal is FAIL-CLOSED-VISIBLE on both transports (CLI exit 2 /
> MCP `isError`, never a silent ok — F2/F5). The set of governed write doors is closed and enumerated
> (`WRITE_PATHS`); today it is two: `atlas-emit` (grounded-fact write) and `atlas-link` (sameAs write).

The read/derive tools (`atlas-init`, `atlas-query`, `atlas-reconcile`) and the read projections
(`doctor` / `diff` / `node`) remain writeless. Governance surface = 5 tools; write surface = 2 doors — both
single-sourced from the `Tool` union, so surface-count assertions derive from one place.

## Why this preserves what INV-TOOLS-1 protected

The real guarantee was never "the number four." It was: **no ungoverned path mutates the store, and no write
silently succeeds-or-fails invisibly.** Intact:

- `atlas-link` (`createGovernedLink`) gates distinct-nodes → both-nodes-exist → KNOW-11 authz on BOTH
  endpoints' scopes → non-empty ratifier — the same fail-closed discipline `atlas-emit` enforces. Actor +
  ratifier are env-sourced by the composition root, never the payload (the spoof-guard).
- Both doors funnel through ONE generalized guard (`isFailClosedWrite`: `emitted:false` OR `linked:false`),
  so a refused link is as visible as a refused emit (F2/F5), on both doors.
- `sameAs` is NON-DESTRUCTIVE on read (a derived observability edge, like `subsumes`), never a fact merge.

## Rejected alternative — fold sameAs into `atlas-emit`

Keeping the literal single door by modeling a link as a "link-flavored emit" was rejected: it overloads
emit's semantics (emit = "a new grounded fact passed the truth gate"; link = a relation over two
already-grounded facts) and smuggles a second operation behind one contract — LESS honest than a named,
separately-gated door. The count was the accidental part of INV-TOOLS-1; the governance property is the
essential part, and a second named governed door serves it better.

## Consequences

- `WRITE_PATHS = ['atlas-emit', 'atlas-link']`; `GOVERNANCE_SURFACE` = 5. Adding a future governed write door
  is now a bounded, precedented change (join `Tool` + `WRITE_PATHS` + a governed door; the guard generalizes).
- ~10 frozen surface-count assertions were updated to the real 5-tool / 2-write-door surface (honest surface
  growth, cold-reviewed as NOT a loosened gate).
- ~~**v1 scope boundary (conscious deferral):** `atlas-link`'s ratifier is a NON-EMPTY check, NOT emit's
  tier-graded ratification…~~ **SUPERSEDED — the deferral was closed by task #84 and this bullet had gone
  stale.** `createGovernedLink` now runs the SAME KNOW-8 law emit runs, over the JOIN of every class the link
  merges (`strictestTier` over each member's stored fact), so a link touching a `T0` node requires `billy`
  exactly as a `T0` emit does — and the join is over the CLASS, not the two endpoints, which closes the
  two-hop bypass (billy equates a `T0` A with a `T2` B; anyone then links B to their own node M and lands
  inside A's class). Recorded here rather than silently dropped: "non-destructive is not ungoverned" was the
  argument that retired the original deferral.
- Teeth: `packages/e2e-blackbox/test/s16-sameas.blackbox.test.ts` (authorized link surfaces the edge on both
  doors; unauthorized / unknown-node / empty-ratifier rejected fail-closed; transitive A≡B,B≡C ⇒ A≡C) +
  `packages/knowledge/test/wp-sameas.test.ts` (white-box union-find / reducer goldens).

## Retraction — a MODE of `atlas-link`, not a sixth tool (A-D3, task #83, owner-authorized)

**Context.** `deriveSameAs` is a union-find, so a single wrong `atlas-link` merged an equivalence class
permanently, on every read, forever. There was no way to undo it. Recorded as **A-D3** (OPEN — DEFINE
required) in `reference/atlas-authoring.md`, and as **F2 / D2** in `design/authoring-surface-study.md`,
where the options were framed as _a third write door · a superseding link record · accept permanence_.

**Decision.** Retraction is a **MODE of the existing `atlas-link` door** — `atlas link <a> <b> --retract`
on the CLI, `atlas-link {a, b, retract: true}` over MCP. It is **not** a sixth tool and **not** a third
write door.

**Why this needs no amendment.** INV-TOOLS-1 is already a _property_ invariant (above): _every write goes
through a governed door_. INV-TOOLS-15 scopes `sameAs` to the **projection sidecar** medium, explicitly not
the store-row medium. A retraction that rides the existing `atlas-link` leg therefore adds no door and no
medium: `GOVERNANCE_SURFACE` stays **5**, `WRITE_PATHS` stays **{`atlas-emit`, `atlas-link`}**, and no
ratified invariant moves. A sixth tool would have moved TOOLS-1's measurable and required a real amendment,
for what is the same governed act on the same carrier in the opposite direction.

**The measurement that made it cheap.** `deriveSameAs` is **REBUILD-PER-READ**, not an incrementally
maintained union-find: it mints a fresh `parent` map per call, there is no module-level cache, and the only
persisted state is the per-node edge list (`WireProjection` serializes `current`/`cas`/`builtAt`/`gen`/
`identity` — nothing derived). So filtering a withdrawn edge out of the fold **input** splits the class on
the very next read. Classical union-find has no DELETE; this fold never needed one. _(Had it been
incrementally maintained, removing an edge would have left the class merged and the door would have been a
false promise — worse than no door, because it makes a guarantee it does not keep.)_

**Two non-negotiable properties, both enforced in one code path.**

1. **Identical gates.** `link(a, b, retract)` is ONE function with ONE ladder. The mode is consumed at
   exactly two points — the pair-state gate 4.5 and the reducer choice at stage 5 — so distinct →
   both-known → authz-over-the-merged-class → ratify are the _same lines_ for both modes. Retracting a link
   whose merged class contains a `T0` node requires `billy` for the same reason, through the same code, that
   asserting it did. An asymmetry here would be a governance hole: an unratified actor undoing a ratified
   merge.
2. **An APPEND, never a delete.** The peer STAYS in `sameAs`; the withdrawal is recorded in
   `sameAsRetracted` on both endpoints. So the row distinguishes _"never linked"_ from _"linked, then
   withdrawn"_, and who asserted and who retracted both survive. Deleting the edge would have made those two
   states the same bytes — the store lying about its own history, which is the failure A-D3 names one
   direction over.

**Consequences and the deliberate asymmetries, stated rather than left to be discovered.**

- `deriveSameAs` (the READ relation) honours retraction and the class **splits**. A retraction recorded on
  **either** endpoint is enough — fail-closed, because a half-written marker that kept an edge live would
  keep it transitively contagious, which is the harm; a half-written marker that splits loses one bounded,
  visible equivalence.
- `sameAsClassOf` (the GATE fold) is deliberately **retraction-blind**, and its docstring now carries the
  caller contract: it prices authority and must never serve the observed relation. Blindness never
  under-charges (shrinkage is the bypass direction, and the projection is untrusted input, so a hand-written
  marker must not be able to cheapen a gate) and it keeps PROP-SAMEAS-1 (`derived ⊆ door`) true by
  construction. **The cost, stated:** after retracting, further links across that class still require the
  signature the widest class ever demanded. Retraction restores what readers observe; it does not buy back a
  lower price.
- **Retraction LATCHES.** Re-asserting a retracted pair is refused (`retracted-pair`), because un-retracting
  means deleting the retraction record — the evidence. The asymmetry is the justification: a wrong
  _retraction_ costs one bounded, local, visible equivalence; a wrong _assertion_ is unbounded and contagious
  on every read. Permanence in the splitting direction is cheap; permanence in the merging direction is the
  defect. Re-assertion of a withdrawn pair is a distinct governance act with its own evidence requirements
  and is deliberately **not** built — it is refused visibly rather than half-built silently.
- Three mode-specific refusals, each with a NAMED discriminant compared by **equality** (never substring —
  these texts discuss each other's concepts): `not-linked`, `already-retracted`, `retracted-pair`. All three
  run **after** the whole governance ladder, so the pair's state is never an oracle for a caller who has not
  cleared authz and ratify.
- **Two of those three are mandatory; one is a judgement call, and the distinction was originally recorded
  with a FALSE justification — corrected here.** The claim was that `linked:true` from this door means "this
  act changed the stored relation". It does not: re-asserting an already-asserted pair returns `{linked:true}`
  and publishes a fresh byte-identical generation (measured, three times running). The rule the door _does_
  keep is narrower — **`linked:true` is never returned when the relation the caller asked for does not hold
  afterwards.** That makes `retracted-pair` mandatory (a re-link there is a no-op the read fold ignores, so
  reporting success would claim an equivalence no reader observes) and `not-linked` mandatory (it would
  record the withdrawal of an assertion nobody made, and pre-emptively latch the pair). `already-retracted`
  is NOT derivable from it: it is a deliberate ASYMMETRY with the assert path's idempotent success, taken
  because a retraction is a corrective act and confirming a no-op invites an operator to believe they
  withdrew a pair they mistyped. Recorded, not resolved — aligning the two paths either way is a behaviour
  change to a governed door and is not smuggled in under a comment.
- `LinkOut` gains `retracted?: boolean` (ABSENT on an assertion, so every existing consumer is byte-
  unchanged). `linked` means _the act settled and changed the relation_; `retracted` names which act. The CLI
  renders a withdrawal with its own verb (`retracted: a ≢ b`), never the `linked: a ≡ b` line.
- Teeth: `packages/knowledge/test/sameas-retraction.test.ts` (the rebuild-per-read witness, the chain split,
  append-only, the either-endpoint fail-closed reading, gate-fold blindness, and PROP-SAMEAS-1 re-checked
  over projections that carry retractions) · `packages/adapter-io/test/governed-link-retract.test.ts` (gate
  symmetry as a table over both modes, the `T0` and two-hop legs, the pair-state vocabulary, precedence, and
  the retract-mode twin of the SCN-GL-15/16/17 disclosure property) ·
  `packages/e2e-blackbox/test/s25-sameas-retraction.blackbox.test.ts` (the split, the append, and CLI≡MCP
  refusal parity, driven through the real CLI subprocess and the real MCP stdio server).
