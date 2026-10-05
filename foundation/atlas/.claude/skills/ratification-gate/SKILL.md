---
name: ratification-gate
description: >
  Decide whether a design invariant is RATIFIED or merely asserted — the 5-gate bar, the design-side analog
  of atom-gate. Given a candidate invariant (from the existing design or new), gate it grounded · testable
  (measurable ATAM scenario) · independent · justified (ADR + rejected alternatives) · tradeoff-resolved, and
  emit the Invariant-Register row that decomposition state S0 consumes. Invoke to ratify an invariant at the
  design freeze.
---

# /ratification-gate — ratified vs asserted (the design freeze)

> **Authority:** Ulwick / Outcome-Driven Innovation (the measurable outcome grammar) · Kazman, Klein, Clements,
> ATAM, CMU/SEI (quality-attribute scenarios + tradeoff points) · Suh, Axiomatic Design (independence) · Nygard
> (Architecture Decision Records). Nothing here is invented.

## Scope — the design-side gate (the analog of `atom-gate`, one layer up)

This decides, **per invariant, ratified vs merely asserted**, and it runs at the **design freeze — which IS
decomposition state S0**. Our case is **brownfield**: the design already exists (ad-hoc, in `spec/atlas.md` §4

- its §8 checks + §9 open questions), so ratification **recovers** it — each existing invariant either clears
  the 5 gates (→ _ratified_) or fails one (→ a `[NEEDS RECONCILIATION]` design defect routed to the DEFINE seat,
  which is exactly the freeze-gate backlog). Its output row conforms to **S0's input schema** (the S0 fields
  exactly, plus a delimited provenance block S0 ignores); its set-level exit **reuses S0's completeness
  predicates** — so the design-freeze and S0 are one freeze, not two.

Each check is tagged **GATE** (mechanical) or **REVIEW** (judgment) — the same split the method's guard uses.

## Writing a measurable invariant (the constructive side of gate 2)

An invariant must be _written_ measurably before it can be gated. One law, two composable forms:

- **ODI outcome grammar** (the intent, solution-agnostic): `[minimize|maximize] + [metric] + [object of
control] + [context]` — e.g. _"minimize the time to retrieve the grounded fact for the current task."_
- **ATAM scenario** (the testable form): `stimulus · environment · response-measure-with-a-number` — e.g.
  _"when an agent requests a grounded fact (stimulus) on the benchmark corpus (env), p95 retrieval < X ms."_

**The scenario's number IS the future golden's assertion.** An invariant with no number is not yet testable and
fails gate 2 — the single biggest fix an ad-hoc design needs. **Author the fact once:** the ODI outcome
statement is the invariant's **FR** (gate 1's grounding); the ATAM scenario only _adds the number_ (gate 2) —
never re-author the fact across the two forms.

## The 5 gates (ALL pass = ratified)

| #   | gate                  | means                                                                                                                                                  | by                                                                                      |
| --- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| 1   | **Grounded**          | traces to a named FR/need, not a preference                                                                                                            | GATE (cites an FR id) · REVIEW (it is a real need)                                      |
| 2   | **Testable**          | a measurable ATAM scenario (response-measure with a number)                                                                                            | GATE (a number is present) · REVIEW (it is the right measure)                           |
| 3   | **Independent**       | not coupled with a sibling — its cell in the `axiomatic-design` coupling matrix is on-diagonal, or the coupling is a _declared, ordered_ decoupling    | GATE (the matrix says so)                                                               |
| 4   | **Justified**         | an ADR (Nygard: context · decision · consequences · status, immutable + supersede), **extended (MADR/IBIS) to list the rejected alternatives and why** | GATE (an ADR with a non-empty alternatives field exists) · REVIEW (the reasoning holds) |
| 5   | **Tradeoff-resolved** | if it sits on an ATAM tradeoff point, the record names the **sacrificed attribute** + the **non-risk assumption** it rests on                          | REVIEW                                                                                  |

Clears all 5 = **ratified**. Missing gate 2 (no number) or gate 4 (no rejected alternative) = **asserted** — the
exact two gaps an ad-hoc design carries.

## Output — the ratified Invariant-Register row (S0's input fields + a provenance block)

```
### INV-<MODULE>-<n>
behavioural: true|false
exempt: <reason>               # its OWN line, present iff behavioural: false (S0's mechanical GATE scans for `exempt:`)
anchor: reference/<file>.md#<slug>
text: "<final normative clause, verbatim>"
clauses: [ "<atomic clause>", … ]
unwanted: [ "<violating event>", … ]
method-tag:                    # empty; S2 fills
# --- ratification provenance ---
fr: "<the FR/need it grounds>"
scenario: "<stimulus · env · response-with-number>"
independence: "on-diagonal | decoupled-after INV-x | COUPLED-with INV-y"
adr: ADR-<n>                   # with rejected alternatives
tradeoff: "<sacrificed attribute + non-risk assumption | none>"
status: ratified | [NEEDS RECONCILIATION]
```

## Set-level exit = S0's entry (the seam, not a new gate)

The register **freezes only when S0's completeness-criteria predicates hold** (reuse, don't re-invent) —
**verbatim**: every invariant dispositioned (behavioural or `exempt`) · **zero open question** · zero
`owner:TBD` · zero unresolved contradiction. (S0's freeze **also** runs the `completeness` skill's Gate-1
capture — a cold-review layer, **not** an S0 completeness-criteria predicate — as part of the same freeze.) The
`freeze/design-v1` tag IS S0's input. (Seam handoff: an **ordered decoupling** across modules
(`decoupled-after INV-x`) becomes an S4 **seam-freeze** — one slice produces, the other consumes. An
**un-orderable `COUPLED-with`** pair: **same-module** → co-locate in one WP; **cross-module** → **cannot**
co-locate (S4 forbids a multi-module WP) → freeze the shared mechanism upstream (a seam-freeze) or redesign to
decouple.)

## Relationship to the other protocols

`ratification-gate` is to the **design** what `atom-gate` is to **requirements**: the per-item quality bar. It
consumes the coupling verdict from [`axiomatic-design`](.claude/skills/axiomatic-design/SKILL.md) (gate 3), and
its "testable scenario with a number" is the head of the same trace the decomposition extends
(scenario-number → REQ → golden). Its output is [`../../docs/DECOMPOSITION-PROTOCOL.md`](../../docs/DECOMPOSITION-PROTOCOL.md) S0's input.

## Self-check (before an invariant is ratified)

- [ ] written measurably (ODI grammar → ATAM scenario **with a number**)?
- [ ] 5 gates all pass (grounded · testable · independent · ADR-with-rejected-alternatives · tradeoff-resolved)?
- [ ] the register row is complete and conforms to S0's schema?
- [ ] anything failing → a `[NEEDS RECONCILIATION]` design defect, never a fudge?
- [ ] set-level: S0's completeness predicates hold before the `freeze/design-v1`?
