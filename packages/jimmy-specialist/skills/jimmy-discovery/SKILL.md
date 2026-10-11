---
name: jimmy-discovery
description: "Locate effective implementation, registration, selection, origins or consumers; explain software journeys, state, lifecycle, contracts and change impact; investigate regressions, environment divergence and competing causes. Use for repository discovery and supplied operational evidence. Not for implementing changes, running arbitrary commands, approving reviews or publishing products. Use jimmy-research for external facts, field exploration, evidence reviews and solution evaluation."
---

# Discovery from question to evidence

Help frame the question within the assigned mission. Select the smallest useful method; an incomplete brief is valid. Product source is read-only. Recommendations do not grant architectural acceptance, security approval, scope expansion, delegation or implementation authority. Maestro owns those handoffs. Packaged instructions do not grant tools or permissions.

## Establish the question

Identify what the recipient needs to know or decide, the permitted source universe, relevant revision/version, scenario, available observations and effort limit. Resolve these from the brief and sources before asking Maestro. Ask only when an ambiguity materially changes the investigation: “selected in which runtime?”, “first failing build?”, or “which effect was duplicated?” Report material reframing without widening sources or effects.

Choose `locate`, `understand` or `investigate`, plus `quick`, `focused` or `deep`. Depth is independent of method: quick resolves one decisive seam; focused covers material alternatives; deep follows necessary dependencies and maintains recoverable analytical state. More tools or a long file do not justify deeper work.

## Read the applicable procedure explicitly

- For implementation, registration/selection, origin or consumers, read [locate](methods/locate.md).
- For a functional journey, state/lifecycle, contract or change impact, read [understand](methods/understand.md).
- For regression, environment divergence or incorrect behavior with competing causes, read [investigate](methods/investigate.md).
- When the question becomes evaluation or external research, read [jimmy-research](../jimmy-research/SKILL.md) and only its applicable method.

For every task, read [evidence](references/evidence.md), [acquisition and retrieval](references/reading-tools.md), [Atlas](references/atlas.md) and [closure](references/closure.md). For findings needing linkage, confrontation, revision or continuation, also read [corpus](references/corpus.md) and [record operations](references/record-tools.md). A one-source lookup needs retained evidence, not a full corpus or an invented lesson.

## Investigate proportionally

1. Start with the exact route, error, key, symbol or observed output. Use `glob` for paths, `grep` for text and `read` for bodies and surrounding conditions. A candidate is not an effective implementation.
2. Use configured LSP/compiler navigation for identity when available. Check readiness, supported operations, project/config and coverage. If unavailable, follow imports, exports, registrations and configuration statically; label the unresolved seam.
3. Follow only relations needed to answer the question. Preserve omitted branches so narrowing is reversible. An event, queue, generator or process seam requires its own witness; do not turn a name match into a call edge.
4. Retain applicable source captures and exact locators. Separate extraction, observation, inference and hypothesis. Confront the alternative or exception that could reverse the answer.
5. Stop when supported, premise-refuted, blocked by an indispensable observation, or at the effort bound. Return the smallest discriminating next step when incomplete.

## Conditional technical reading

Read these only when the mechanism requires them:

- Alias, provider, registration, generated code or runtime activation: [identity versus execution](references/identity.md).
- HTTP response, event or queue seam: [cross-boundary journeys](references/boundaries.md).
- Commit, projection, persistence or concurrent data effects: [transactions](references/data-transactions.md).
- Attempts, replay, delivery or duplicate effects: [retry and idempotency](references/retry-idempotency.md).
- Ownership, cancellation, teardown or durable pending work: [lifecycle](references/lifecycle.md).
- Revision, resolver, config precedence, build or deployment divergence: [version and environment](references/version-config-build.md).

## Write the answer, then close

Read [synthesis](../jimmy-research/writing/synthesis.md) before composition. Choose [answer](../jimmy-research/writing/answer.md) for a precise location or bounded fact, [map](../jimmy-research/writing/map.md) for connected surfaces, or [explanation](../jimmy-research/writing/explanation.md) for mechanism, cause or impact. Write normal prose in the recipient's language. Lead with the answer and decisive qualification, not the search history.

Publication here means a native research document, never product deployment or outward publication. Publish any promised document through `research_record` before the final card. Complete retrieval and warranted Memory operations first. Emit one closed `jimmy-result` as [closure](references/closure.md) specifies; make no tool call afterward. Do not claim your own work accepted or independently verified.
