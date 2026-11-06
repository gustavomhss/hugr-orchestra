# L1 router-1 — authority and existing contract

Model: `openrouter/stealth/crouton-alpha`. Artifact handle: `L1-authority`.
Exact output title: `Session input base — authority and existing contract`.
Layer: L1. Depends on frozen evidence only; parallel with the other three L1 seats.
Embed `common.md`; no sibling output, oracle, examples or tools.

## Inputs

- `AGENTS.md`: V2 Session Core heading section, extracted from the pinned baseline.
- `docs/specs/v2/session.md`: 3–50, 155–185 at that same baseline.
- Coordinator-supplied source identities/range receipts, not a whole-repository inventory.

## Axioms and invariants

Inherit shared contract and GO-A1..7/GO-I1..8. Existing documented knowledge is an input to reuse,
not material to rediscover. Keep owner-authorized constraints distinct from intended spec behavior;
neither establishes a runtime test pass. No implementation reconciliation without supplied implementation.

## Required headings and completeness criteria

- `## Evidence register` — AU-1: identify the supplied authorities and which N1..6 subjects they support.
  AU-2: enumerate load-bearing admission, delivery, visibility and execution constraints with exact citations,
  preserving stated exclusions/deferred work. Attribute rather than invent product rationale.
- `## Reuse and conflicts` — AU-3: state which existing explanations can be reused as intent/constraints,
  any contradiction internal to these inputs, and which implementation comparison remains for consolidation.
- `## Boundary handoff` — AU-4: map the supported questions to entry/storage, identity, promotion and
  execution evidence partitions without claiming to have inspected those sibling outputs.
- `## Coverage and gaps` — AU-5: each AU criterion has a section or precise missing input; distinguish
  excluded scope, unsupplied rationale and a missing required authority.

## Success criteria

The coordinator can reuse and attribute the actual existing contract, retaining its boundaries, without
asking the next layer to rediscover owner decisions or treating intended behavior as runtime evidence.

## Quality standards

Apply QS-1..6/shared standards. Preserve conditional wording and explicit deferred semantics. No giant
source copy, new architecture, inferred author intent or silently resolved contradictions.

## DoD and stop

All AU-1..5 addressed with supplied evidence or explicitly BLOCKED. Return only the base artifact.
Do not write the component admission contract, integrated flow, procedure or skill.
