# Understand mechanism, state and impact

Read for profile `understand`: functional journey, state/lifecycle, contracts or a specific change's impact. Do not expand a simple location into subsystem reconstruction; do not declare a regression cause without [investigation](investigate.md).

## Inputs and discriminators

Start from a scenario/input and observable result, relevant revision, contract/delta and permitted observations. Ask: where does ownership move, what becomes durable, what can repeat, and what exception changes the outcome? For impact, what exact field, invariant, timing or identity is proposed to change? A vague “everything affected” request first needs a concrete delta.

## Procedure

1. Locate the entry and effective selection. Follow forward from input and backward from the result to connect missing seams. Keep expected design separate from implemented behavior.
2. **Functional journey:** trace input decoding, domain operation, state change, external effect and response/result. At each edge retain the witness and relationship type. Read [boundaries](../references/boundaries.md) for HTTP, event and queue crossings; do not replace them with a synchronous call graph.
3. **State/lifecycle:** identify owner, legal transitions, creation/admission, active execution, terminal paths and cleanup. Note the durable versus process-local boundary, interruption and pending work. Read [lifecycle](../references/lifecycle.md), plus [transactions](../references/data-transactions.md) or [retry](../references/retry-idempotency.md) only when relevant.
4. **Contracts:** compare producer, serialization/schema, consumer validation and failure mapping. Read defaults, units, optionality and version conditions. An interface name or generated client type does not establish runtime validation or wire compatibility.
5. **Change impact:** start from the exact delta and follow consumers that rely on it: source callers, serializers, persisted data, projectors, configuration, generators and external clients. Explain the consequence and dependency for each surface. Check an alternate branch/version that could limit the impact. Separate necessary regeneration, potential behavioral risk and unknown runtime exposure.
6. Retain material findings, conditions, contraries and justified dependencies through [corpus](../references/corpus.md). Do not build a global graph or inventory unrelated modules.

## Capabilities and failures

Use permitted acquisition, configured semantic navigation, verified Own and exposed history/observational reads. Supplied traces can demonstrate witnessed activation for their scenario, not all executions. Mark unobserved bootstrap, missing consumer evidence and partial indexing explicitly. Static fallback can still explain a mechanism while leaving activation unknown.

Negative impact claims need the shared positive-control and coverage discipline. When a critical seam remains inaccessible, preserve the hold verbatim and specify the missing selector, consumer, artifact or trace. Do not run arbitrary commands or mutate the product to fill the gap.

## Output and closure

Write [explanation](../../jimmy-research/writing/explanation.md) for a journey/invariant and [map](../../jimmy-research/writing/map.md) for connected impact surfaces. A diagram helps only when edges have witnesses and relation types. Lead with the mechanism/consequence, then ownership and exceptions, then delimited impact or unresolved seams.

Stop when the scenario and material exception are explained or the exact change has a reasoned bounded impact map. Do not promise universal blast radius. If an indispensable observation is missing, return the useful static explanation and next discriminator with truthful [sufficiency](../references/closure.md).
