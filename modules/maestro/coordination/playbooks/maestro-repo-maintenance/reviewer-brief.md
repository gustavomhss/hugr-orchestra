# Independent cold code review

Select an available independent review channel under native permissions. No new team role is defined here.
Give a bounded diff slice and frozen contract/acceptance/invariants. Do not share author transcript, plan,
or self-justification. Split overwhelming review scope into cohesive slices and check their shared seams.

```text
TASK: Independently try to refute that this delta is correct, safe, complete, and in scope.
SCOPE: <exact review paths and baseline/head or dirty-delta identity>
SPEC: <acceptance, frozen seam, project invariants>
DIFF: <bounded diff or fresh artifact pointer>
CHECK: behavior/errors/concurrency; exact contract; permissions/secrets/destructive effects;
 meaningful test teeth; scope leakage; consistency with surrounding code.
Do not rewrite code or approve an operation. Unverifiable claims stay unknown.
RETURN: {verdict: approve|request_changes|reject|unknown,
 blocking: [{file, line, issue, impact, suggestedFix}], nonblocking: [{file, note}],
 unverified: [], evidencePointers: [], summary}
```

`approve` is a review conclusion only. Lead reads actual evidence, resolves findings, and retains judgment.
Existing user authority and native governed approval bindings remain required for their respective actions.
If reviewer only praises a substantial delta, inspect review coverage rather than accepting praise as evidence.
Unavailable review is UNKNOWN, not permission to self-grade as independent.
