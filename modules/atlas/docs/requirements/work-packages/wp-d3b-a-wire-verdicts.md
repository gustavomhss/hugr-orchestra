# Work Package — D3b-A: wire the fast-path verdicts instead of the gate-pinning constant

> ARCH-D3b implementation, item 1. The ARCH-9 clause forbids "a constant that pins the gate open"; the
> door still supplies `DOOR_RATIFY_CTX = { contested: false, lowRisk: true }` as a module constant.
> This WP derives both verdicts from observed state (commit-retry contention; the truth-gate result),
> preserving the common T2-advisory auto-accept as the OBSERVED outcome, not a hardcoded default.
> Owner ruling 2026-09-03: no invented threshold — `lowRisk` is the truth verdict + advisory class,
> `contested` is observed contention. (ADR-0010 §"Owner ruling").

### WP-D3B-A.WIRE-VERDICTS — derive the KNOW-18/ARCH-9 fast-path verdicts in the write door

epic: EPIC-D3B
id: WP-D3B-A.WIRE-VERDICTS
content_hash: <filled-at-freeze>
title: The write door computes `contested` from observed commit contention and `lowRisk` from the cleared
truth gate + the advisory class, instead of shipping the `{ contested: false, lowRisk: true }` constant
intent: >
`ratifyCtxFor(derivedTier, origin)` (adapter-io/src/governed-emit-route.ts) merges a module-level
`DOOR_RATIFY_CTX = { contested: false, lowRisk: true }`. ARCH-9 names this exact shape a violation: a
constant that pins the gate open does not satisfy the derivation clause. The verdicts have real sources
already observed by the door: the commit-retry loop detects contention (⇒ `contested`), and the truth
gate has already produced a HOLDS/UNGROUNDED result before `route` runs (⇒ `lowRisk`). Wire both
through the context so the common auto-accept is the OBSERVED conjunction (grounded ∧ cleared-truth ∧
T2 ∧ advisory ∧ ¬contended), not a hardcoded default.
source_reqs:

- source: ../requirements-authoring.md#REQ-AUTH-15a
- source: ../requirements-authoring.md#REQ-AUTH-15b
- source: ../requirements-authoring.md#REQ-AUTH-15c
  acceptance:
- source: ../goldens-authoring.md#SCN-AUTH-15a-1
- source: ../goldens-authoring.md#SCN-AUTH-15b-1
- source: ../goldens-authoring.md#SCN-AUTH-15c-1
  success_criteria: >
  A T2 advisory grounded fact auto-accepts as before, but an observer can now MUTATE the installed
  `DOOR_RATIFY_CTX` constant to garbage and see no change in the door's verdict — because the constant no
  longer exists. A contended write routes `full-ratify`; an ungrounded or predicate T2 never auto-accepts.
  exit_predicate: all acceptance SCNs green ∧ a `check` verdict still equals the live door's verdict over the
  same candidate (check/emit parity, PROP-MCP-4) ∧ all 11 gates green
