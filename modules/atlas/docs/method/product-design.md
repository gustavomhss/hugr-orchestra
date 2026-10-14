# Product Design — the ratification rubric (run once over the existing design)

> The **design-side** of the method program. **NOT a heavy method** — a **1-page rubric** run ONCE to turn the
> existing ad-hoc Atlas design into a **ratified Invariant Register** that decomposition state **S0** consumes.
> Brownfield: the design exists (`spec/atlas.md` §4 + §8 checks + §9 questions) — we **recover and ratify**, we
> don't expand. Two protocol-skills carry the rigor; the rest is templates below. Sibling of
> [`../DECOMPOSITION-PROTOCOL.md`](../DECOMPOSITION-PROTOCOL.md).

## The four phases (a table of contents, not gated contracts)

| phase         | does                                                                                                                                                           | instrument                                                                                                    |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Define**    | state the agent's job (job map) · mine pain from real agent traces · write measurable **outcome statements** (= the FRs) · rank by instrumentation, not survey | job map + PR/FAQ (below) · [`ratification-gate`](../../.claude/skills/ratification-gate/SKILL.md) §measurable |
| **Frame**     | the bet + the four risks + appetite + non-goals; **spike the riskiest feasibility bet first** (no-embeddings retrieval)                                        | PR/FAQ + four-risks (below)                                                                                   |
| **Structure** | map outcomes (FR) → mechanisms (DP); build the coupling matrix; draw boundaries at the decision-most-likely-to-change                                          | [`axiomatic-design`](../../.claude/skills/axiomatic-design/SKILL.md)                                          |
| **Ratify**    | run each invariant through the **5 gates**; ADR the non-obvious ones; emit the frozen Invariant Register                                                       | [`ratification-gate`](../../.claude/skills/ratification-gate/SKILL.md) → **S0**                               |

The one anti-arbitrariness rule across all four: **every design decision must cite an outcome statement (why it
exists), a job-map step (where it acts), or a risk it retires (what it de-risks). No citation → out.**

## Templates (inline — these don't need a skill)

**Job map** (the agent's loop, 8 steps; opportunity is _never_ in Execute):
`Define → Locate → Prepare → Confirm → Execute → Monitor → Modify → Conclude`. For the Atlas the pain
concentrates in **Locate / Confirm / Modify** (retrieval · staleness-check · edit-supersede). Write outcome
statements per step. _(Bettencourt & Ulwick, "The Customer-Centered Innovation Map," HBR 2008.)_

**PR/FAQ** (written to a skeptical future contributor + the owner; Bryar & Carr, _Working Backwards_):

- **PR**: heading · subheading (who + benefit) · summary · problem (from the user's POV) · solution (+ what they use today) · a quote.
- **Internal FAQ** (the pre-mortem): what do agents use today (raw reads / embeddings-RAG / MCP memory)? · why is ours better / cheaper / faster? · **what must be true?** · **top 3 reasons it fails?** · what new capability must we build?

**Four risks** (a completeness checklist over the definition; Cagan):
**Value** (agents rely on it over ad-hoc context) · **Usability** = agent-ergonomics (drivable from a tool schema

- one page of docs, low error rate) · **Feasibility** = the no-embeddings retrieval bet (spike it first) ·
  **Viability** = stewardship (coherent + within the owner's maintenance appetite as it grows).

**ADR** (Nygard, immutable + supersede):
`Title · Status (proposed/accepted/superseded) · Context · Decision · Consequences · **Alternatives rejected + why**`.
Never edit an accepted ADR — write a new one that supersedes it and link. An invariant with no rejected
alternative is an assertion (fails ratification gate 4).

## The seam

Output = the ratified Invariant Register (rows conform **byte-for-byte to S0's input schema**; the set freezes
only when **S0's completeness predicates** hold). Running this rubric over the existing design **is** the
S0/design-freeze — it closes the 4 freeze-gate cards (U2/KERNEL-10 · spec↔ref contradictions · 7× `owner:TBD` ·
the `behavioural` flag).

## Anti-overhead (dropped as ceremony for a software substrate)

ODI survey-scoring → **instrumentation**; Torres interviews → **trace-mining**; Lean-Canvas money blocks; the
Information-Axiom math; QFD 9/3/1 arithmetic; C-K formal operators; ceremonial 9-step ATAM → **half-day
self-review**; AD hierarchies > 3 levels. **Kept:** the measurable-outcome grammar, the coupling matrix, the
5-gate bar, and end-to-end traceability.
