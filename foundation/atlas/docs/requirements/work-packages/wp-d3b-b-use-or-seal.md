# Work Package — D3b-B: growth by USE-OR-SEAL

> ARCH-D3b implementation, item 2. Owner ruling 2026-09-03: "who approves is the ORCHESTRATOR, approving
> only with evidence… both [use-and-success and human seal] coexist; neither is mandatory; human-in-the-loop
> kills the purpose." The design was fixed by the owner's follow-up: **a plain per-node usage COUNTER, no
> invented threshold** — at the fixed named constant the node rises implicitly; the SEAL is an alternative
> sufficient evidence, never a precondition. (ADR-0010 §"Owner ruling"; ENTRY-AUTH-16).

### WP-D3B-B.USE-OR-SEAL — serve-counted growth and the human seal

epic: EPIC-D3B
id: WP-D3B-B.USE-OR-SEAL
content_hash: <filled-at-freeze>
title: An advisory node rises when its served-counter hits the fixed USE_THRESHOLD — or when a human seal
endorses it — and NEVER by default
intent: >
Today `hits` is a rank field nobody writes: own-source.ts declares "no production writer: nothing records
a served pack anywhere durable. Every candidate is `hits: 0`". This WP turns `hits` into the USE path of
the owner's growth ruling: when an advisory node is SERVED in a pack the per-node counter increments; at
the fixed `USE_THRESHOLD` the node rises implicitly (no human, no gate). A human SEAL (a ratify token
endorsement) is an alternative sufficient evidence, independent of the counter. Neither is mandatory — a
node earning neither stays advisory and decays by non-use (KNOW-17). The threshold is a plain named
integer in one tunable place, per the owner's "just a counter, don't invent a regime".
source_reqs:

- source: ../requirements-authoring.md#REQ-AUTH-16a
- source: ../requirements-authoring.md#REQ-AUTH-16b
- source: ../requirements-authoring.md#REQ-AUTH-16c
- source: ../requirements-authoring.md#REQ-AUTH-16d
  acceptance:
- source: ../goldens-authoring.md#SCN-AUTH-16a-1
- source: ../goldens-authoring.md#SCN-AUTH-16b-1
- source: ../goldens-authoring.md#SCN-AUTH-16c-1
- source: ../goldens-authoring.md#SCN-AUTH-16d-1
  success_criteria: >
  Serve an advisory node 8 times (USE_THRESHOLD): after the 8th serve it is served at the raised class on
  the next pack, with nobody having touched it. Seal the same node with a ratify token while its counter is
  still below the threshold: it rises on the next read. Serve a third node 7 times and seal nothing: it
  stays advisory across the decay pass. An observer can mutate USE_THRESHOLD to any positive integer and
  see the count-respect visible in the served class — no hidden calibration.
  exit_predicate: all acceptance SCNs green ∧ the served/pack path actually writes the counter (a mutation
  that removes the logHit in the serve path turns the growth SCNs red) ∧ all 11 gates green
