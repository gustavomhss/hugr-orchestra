# How to write a project-memory rule

Add one standing, always-injected rule to a member's `project` memory. Because project memory rides in
**every** context that member runs, a bad rule taxes every turn forever — this guide is the bar a rule must
clear before it earns its slot.

## Prerequisites

- A **real** `task` or `pr` lesson to promote (see [reference: templates](../reference/atlas-memory.md#templates-every-write-fills-one--no-free-prose)). Rules are _promoted_ from lived experience, never invented up front.
- The member's current injected `project` memory and its remaining token budget (`≤ ~500 tok` total; orchestrator `≤ ~800`).
- Write access to that member's Memory (you MUST NOT write another member's — [MEM-1](../reference/atlas-memory.md#invariants)).

## Steps

1. **Start from a real lesson.** Open the `task`/`pr` entry whose `lesson` / `knowledgeDelta` keeps
   recurring. If it happened once and is unlikely to recur, stop — it stays consultable, not injected.

2. **Write the `rule` as ONE imperative line.** Phrase it as `always X` / `never Y`. No narrative, no
   hedging, no "be careful." If it needs two sentences, it is two rules or it is not a rule.

3. **Make it specific and testable-in-spirit.** A reader must be able to tell whether they violated it.
   Name the concrete surface (a header, a path, a command), not a vibe.

4. **Give it a `scope`.** A path glob, a tool, or a phase — so it surfaces _only_ when it is role-relevant
   and stays silent otherwise. A rule with no scope injects on every unrelated turn; that is bloat.

5. **Attach `grounding` if you can (optional).** A `path@subtreeHash`, PR, or commit that proves the rule.
   Grounding earns the rule its place and lets CI flag it if the code moves out from under it.

6. **Check the usefulness bar: actionable AND non-obvious.** If a competent member would already do it
   without being told, it is not worth a token. Reject the obvious. _(This is a **Memory** project rule under a
   hard per-member token cap, where a slot spent is a slot denied — not a Knowledge fact. Knowledge admission
   does the opposite: obviousness is scored, never gated, per
   [ADR-0012](../adr/ADR-0012-obviousness-is-scored-never-gated.md). The bar differs because the constraint
   differs — Memory is capped and rival, the Atlas is not.)_

7. **Dedupe and fit the cap.** Confirm no existing entry already says it. Confirm the addition keeps the
   member's total injected `project` memory `≤` cap ([MEM-3](../reference/atlas-memory.md#invariants)). If
   over, the write is rejected — archive a stale, low-`hits` entry first.

8. **Write it against the template.** Fill `{ rule, scope, grounding?, hits: 0 }` exactly; a write that
   omits a required field or exceeds cap is rejected fail-closed
   ([MEM-5](../reference/atlas-memory.md#invariants)).

## A good rule (accepted)

```
{
  rule:      "never log the Authorization header",
  scope:     "src/http/**",
  grounding: "src/http/log.ts@a1b9f3",
  hits:      0,
}
```

Why it passes: one imperative line; a concrete, checkable surface (the `Authorization` header); scoped to
where it applies (`src/http/**`), so it stays silent elsewhere; grounded to the file that proves it;
non-obvious enough that a member could get it wrong.

## A bad rule (rejected)

```
{
  rule:  "be careful with auth stuff and try to write secure code",
  scope: "**",
}
```

Why it fails: vague and untestable ("be careful", "secure") — you cannot tell if you violated it (fails
step 3); no real scope (`**` injects on every turn — step 4); obvious (any member already aims for this —
step 6); missing `hits` and grounding (fails the template — step 8). It taxes every context and prevents
nothing.

## Verify

- **Scoped surfacing.** The rule appears in the injected header only when current work matches its `scope`,
  and is absent otherwise.
- **Under budget.** After the write, the member's total injected `project` memory is still `≤` cap.
- **Earns its place.** `hits` increments when the rule actually prevents a mistake; a rule whose `hits`
  stay flat will **decay out of the injected set and be archived** — never deleted
  ([MEM-7](../reference/atlas-memory.md#invariants)) — which is the system telling you it wasn't worth a
  token. That is a feature, not a failure.
