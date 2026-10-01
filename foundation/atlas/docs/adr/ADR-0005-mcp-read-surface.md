# ADR-0005 — the advertised MCP surface is `GOVERNANCE_SURFACE ∪ READ_SURFACE`

- **Status:** Proposed (2026-07-25) — DEFINE seat (owner) ratifies
- **Owner-directed:** yes — _"Lembre-se que tem que ter via mcp tool e via cli"_ (2026-07-25). The
  requirement that every authoring door exist on both transports is the owner's, not the lead's.
- **Spec author:** lead, grounded against `packages/mcp-server/src/server.ts` @ `3496d6f`.
- **Introduces:** `INV-MCP-3`, `INV-MCP-4` (reference/atlas-authoring.md#entry-mcp-3, #entry-mcp-4).
- **Does NOT amend:** INV-TOOLS-1 / ADR-0003. `GOVERNANCE_SURFACE` stays 5; `WRITE_PATHS` stays 2.
  **[SUPERSEDED COUNT 2026-09-03, ADR-0006 Decision 2]** This ADR's "stays 5 / stays 2" counts were written
  at the five-leg/AD-0003 moment; ADR-0006 Decision 2 (owner-ratified) replaced the fixed counts with the
  DERIVED + BUDGETED surface property, and CAMPAIGN-11 (WP-11.W8) added the governed `atlas-memory-emit`
  door. The property this ADR protects — `READ_SURFACE` carries zero write authority, grows neither
  governed set — is unchanged; the specific numbers below are the then-current reading, now six and three.
- **[RECONCILED 2026-08-24, owner-decided, WP-10.A5.TOOLS]** This ADR's original text (below) claimed
  `atlas-diff` was "wired, tested, and reachable from the CLI" alongside `doctor`/`node`. **That claim is
  FALSE against the shipped tree** — `packages/tools/src/diff.ts` is a declared reference model with ZERO
  production callers (`reference-model-guard.mjs`'s ledger; its own header states "no `atlas diff` CLI
  command"). `READ_SURFACE` as SHIPPED is the **SIX genuinely invocable** read doors —
  `atlas-anchors`/`atlas-slots`/`atlas-draft`/`atlas-check`/`atlas-doctor`/`atlas-node` — never seven.
  `atlas-diff` stays a reference model until it is genuinely wired to a transport, in its own later WP; it is
  NOT a `READ_SURFACE` member today. The paragraphs below are left as originally written (an ADR narrates
  the decision as reasoned at the time) with inline `[CORRECTED]` notes at the specific false claims — see
  §Context point 1, §Decision, §Rejected (b), §Consequences.

## Context

`advertisedTools` maps **exactly `GOVERNANCE_SURFACE`** — the five governance tools — and nothing else.
The server's own comment states the surface is _"EXACTLY the `GOVERNANCE_SURFACE` tools, no more, no less
(TOOLS-1)."_

Three consequences, all verified against the code:

1. **The already-built read doors are CLI-only.** `atlas doctor` (four sub-legs) and `atlas node` are wired,
   tested, and reachable from the CLI — and completely absent over MCP. An agent seat cannot inspect the
   archive, explain a drift, or read a node. **[CORRECTED 2026-08-24]** This point originally also named
   `atlas-diff` as "wired, tested, and reachable from the CLI" — FALSE against the shipped tree: `diff.ts`
   is a declared zero-caller reference model (no `atlas diff` CLI command ever existed). `atlas-diff` is
   removed from this point and from `READ_SURFACE` (§Decision).
2. **The authoring surface would inherit the same asymmetry.** `anchors`/`slots`/`draft`/`check`
   (ADR-0004) are planners; if the advertised set may only contain governance tools, an agent gets none of
   them and the owner's both-transports requirement cannot be met.
3. **The framing conflates two different sets.** TOOLS-1 governs the _write_ surface and the _governance_
   surface. It says nothing about what a transport may advertise. The literal claim "the MCP surface is
   exactly the five governance tools" is a **stronger** statement than any ratified invariant requires — and
   it is the one blocking the requirement.

## Decision

The MCP server advertises the **union of two disjoint sets**:

```
advertised = GOVERNANCE_SURFACE  ∪  READ_SURFACE

GOVERNANCE_SURFACE = { atlas-init, atlas-query, atlas-emit, atlas-reconcile, atlas-link }   // 5, unchanged
WRITE_PATHS        = { atlas-emit, atlas-link }                                             // 2, unchanged
READ_SURFACE       = { atlas-anchors, atlas-slots, atlas-draft, atlas-check,                // planners
                       atlas-doctor, atlas-node }                                           // already invocable
```

**[CORRECTED 2026-08-24]** The original text here also listed `atlas-diff` as a seventh `READ_SURFACE`
member ("already built"). Removed: `diff.ts` is a declared reference model with zero production callers —
ARCH-5 (advertised≡invocable, `layer-guard.mjs`) forbids an unwired door in an ADVERTISED surface. `diff`
re-joins `READ_SURFACE` only alongside real CLI/MCP wiring, in its own later WP.

Normatively (`INV-MCP-3`): every `READ_SURFACE` member carries **zero write authority**; membership must
not confer, imply, or route to a write; `GOVERNANCE_SURFACE` remains exactly five and `WRITE_PATHS`
exactly two.

And (`INV-MCP-4`): for identical input, every door produces a **byte-identical `Verdict`** over the CLI and
over MCP — extending the existing TOOLS-3 CLI≡MCP property to the new doors.

## Why this does not weaken TOOLS-1

TOOLS-1's guarantee, as re-stated in ADR-0003, is: _no ungoverned path mutates the store, and no write
silently succeeds-or-fails invisibly._ Nothing in this decision touches either half.

- `READ_SURFACE` members are planners (ADR-0004, AUTHOR-2) — they persist nothing, so there is no path for
  them to be ungoverned _on_.
- Write-freedom is a property of the **type**, not of reviewer vigilance: a planner returns a payload and
  never receives a store handle. This is the structural resolution of coupling **C2** in
  `design/authoring.md` §3.3 — FR-A4 (governance preserved) holds by construction, independent of what
  `READ_SURFACE` contains, so the set may grow later without re-litigating governance.
- The two sets are **disjoint** and both are single-sourced constants, so the spec-conformance guard can
  pin them independently: `GOVERNANCE_SURFACE` deep-equals its expected five, `WRITE_PATHS` its expected
  two, and `READ_SURFACE ∩ WRITE_PATHS == ∅` becomes a new mechanical check.

## Rejected alternatives

**(a) Grow `GOVERNANCE_SURFACE` to include the planners.** Rejected. It would make the governance count
meaningless — the count would then mix governed writes with read helpers, and every future convenience
door would look like a constitutional change. Disjoint sets keep the governed count exactly as load-bearing
as ADR-0003 made it.

**(b) Keep the authoring doors CLI-only.** Rejected — it directly contradicts the owner's directive, and it
would leave the agent seat (the primary consumer of a knowledge substrate) unable to author at all. It also
entrenches the existing `doctor`/`node` asymmetry rather than fixing it. **[CORRECTED 2026-08-24]** originally
also named `diff` here — removed; `diff` was never CLI-wired, so there was no CLI-only asymmetry to entrench
for that door specifically.

**(c) A second MCP server process for read tools.** Rejected as ceremony: two processes, two lifecycles,
two schema publishers, to express what one disjoint constant expresses.

**(d) Advertise them but mark them experimental / undocumented.** Rejected. A door an agent cannot discover
from the tool schema is not a door (the Usability risk in `design/authoring.md` §2.2).

## Consequences

- `server.ts`'s `advertisedTools` maps the union; its "no more, no less (TOOLS-1)" comment is corrected to
  state the union and cite this ADR. **This comment is exactly the class of stale claim the
  spec-conformance guard exists to catch** — it is updated in the same change, and the guard gains the
  `READ_SURFACE ∩ WRITE_PATHS == ∅` check.
- The already-invocable `doctor`/`node` legs join `READ_SURFACE` in the same campaign, closing a
  pre-existing transport asymmetry that predates this work. **[CORRECTED 2026-08-24]** `diff` does NOT join
  `READ_SURFACE` — it was never CLI/MCP-wired (a declared reference model, `diff.ts`), and ARCH-5
  (advertised≡invocable) forbids advertising an unwired door. It joins only once a later WP wires it.
- Every advertised tool continues to publish its `description` + `inputSchema` from `handler.schema(tool)`
  — the handler stays the single schema owner (TOOLS-3); no schema is hand-authored at the transport.
- `INV-MCP-4` parity goldens are required for each new door; the existing black-box harness already drives
  both transports, so this is an extension of a built capability, not a new one.
