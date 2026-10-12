# Assess transfer and feasibility

Read when evidence or a solution must fit concrete requirements and an actual environment. A general comparison without transfer uses [comparative](comparative.md); discovering unmet needs uses [opportunities](opportunities.md). This method recommends proof or use; it does not implement or approve a design.

## Inputs and discriminators

Use the goal, current baseline, decisive requirements, relevant versions/runtime/resources, permitted effects and available evidence. Ask: what mechanism is expected to satisfy which requirement, which source conditions differ from this environment, and which missing proof could change the feasibility conclusion?

## Procedure

1. Turn the request into a small set of concrete requirements and eliminate assumptions presented as facts. Include the current solution and no-change baseline where relevant. If a stakeholder preference determines the trade-off, identify it explicitly for Maestro.
2. Connect each requirement to a supported mechanism and its conditions. Retain requirement–finding relations in the corpus when material; document requirement wording in question/document content, not an invented record action.
3. Compare the source setting with the target: version/fork, workload, inputs, concurrency, data/transport boundary, operational resources and access. Load only relevant technical guides, such as [version/config/build](../../jimmy-discovery/references/version-config-build.md) or [transactions](../../jimmy-discovery/references/data-transactions.md).
4. Separate contract/source compatibility from demonstrated target behavior. A benchmark on another dataset/platform supplies a transfer hypothesis, not measured local feasibility. Read [study reading](../references/study-reading.md) for empirical claims.
5. Identify the smallest missing proof. Specify a bounded scratch probe: pinned candidate/input/environment, rival expected outcomes, decisive acceptance/discard criteria, positive control, resource/effect limits and confounders. Avoid building a generic prototype or measuring unrelated properties.
6. Conclude which requirements are supported, contradicted or still unknown and what follows under those conditions. Recommendation may be “keep the baseline until this proof exists”.

## Capabilities and failure

Use permitted source/context reads, native capture/records and supplied observations. Execute only an exposed qualified finite recipe within actual permission; otherwise send its specification to Maestro for a qualified executor. Do not edit product, install candidates, run arbitrary shell, delegate or claim architecture/security acceptance.

Missing environment facts block dependent transfer claims. Preserve verification holds/denials verbatim and state which requirement they affect. Continue independent supported requirements; do not hide a failed probe behind a fallback success narrative or convert proposed outcomes into observations.

## Writing and closure

Use genre `explanation` for a feasibility memo following [explanation writing](../writing/explanation.md), or `comparison` when alternatives are central. Lead with the conditional feasibility verdict, then the requirement-to-mechanism argument and missing proof. Keep proposal, execution receipt and interpreted result separate.

Stop when the applicable requirements support a bounded conclusion, a decisive requirement fails, essential proof is unavailable or effort ends. Close with exact next inputs/executor and discard conditions using [closure](../../jimmy-discovery/references/closure.md); a probe specification is useful output, not an experiment result.
