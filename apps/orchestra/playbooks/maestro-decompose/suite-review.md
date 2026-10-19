# Cold acceptance coverage review

Use for substantial demand-to-suite judgment. Independent reviewer sees only verbatim demand and
named acceptance items (including judged items); no author's rationale, code, or partition plan.
Use available review channels under existing permissions; unavailable review remains UNKNOWN.

```text
TASK: Try to refute that these acceptance items cover this demand.
DEMAND: <verbatim request>
ITEMS: <id, behavior, oracle, judged/decision owner>
Find missing behavior, required negative/edge cases, failure recovery, vague criteria, and overreach.
Judge only demand versus items. Do not invent implementation or slices. Do not add speculative requirements.
RETURN: {verdict: covers|gaps_found|unknown,
 missing: [{requirement, demandRef, suggestedItem}],
 vague: [{item, reason}], overreach: [{item, reason}], unknowns: [], summary}
```

Lead resolves findings and retains acceptance judgment. Recheck changed items. For broad discovery,
two successive unchanged gap-free rounds can bound review; unresolved uncertainty must stay visible.
`covers` is a review conclusion, not a mechanical completeness proof, human approval, or authorization.
