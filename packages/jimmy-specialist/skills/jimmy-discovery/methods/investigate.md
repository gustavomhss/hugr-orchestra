# Investigate competing explanations

Read for profile `investigate`: regression, environment divergence or incorrect behavior. A recent change, suspicious line or plausible path is not a cause. Use [locate](locate.md) for a location-only request and [understand](understand.md) when only mechanism is required.

## Inputs and questions

Use the reported symptom, expected behavior and its source, affected and contrasting cases, revision/build/config/time window, and actual observations. Separate reported facts from captured observations. Ask: what is the first evidenced divergence, which conditions differ, and which smallest observation would distinguish the remaining explanations?

## Common procedure

1. Establish the precise failure and baseline. Check whether the expectation applies to this version/scenario; a refuted premise may answer the question without a fix.
2. Reconstruct only the relevant journey. Maintain a small set of materially different explanations, each with expected observations and potential disproof. Include a competing cause outside the initially blamed component when plausible.
3. Compare affected/contrasting cases for identity, input, timing, selection, config and environment. Confounded contrasts do not isolate one variable. Follow the earliest witnessed divergence rather than whichever log is loudest.
4. Choose the next read or observation by its power to separate explanations. Preserve supporting and contrary evidence using [corpus](../references/corpus.md). Do not conceal a rejected approach or relabel static possibility as observation.
5. Explain why sustained evidence supports one bounded mechanism and weakens rivals. If evidence remains observational or incomplete, state the alternative still possible and exact discriminator.

## Regression

Read current behavior before history. Use exposed specialized history reads for relevant patch/range, parents, renames and recorded rationale. Distinguish authors' stated intent from inferred intent. A path-filtered history or blame line is a lead, not complete causal history.

Connect the patch to a changed invariant and its predicted symptom. Check changes in tests, generation inputs, dependencies and configuration that could produce the same symptom. First failing time is not necessarily first bad revision; missing history and deployment lag matter. Executable bisection requires a qualified executor/recipe, not a shell workaround.

## Environment divergence

Compare declared, resolved, installed, built, deployed and loaded identities using [version/config/build](../references/version-config-build.md). Inspect configuration precedence and import/export conditions, not just `NODE_ENV` or lockfiles. The smallest useful discriminator may be a loaded-module identity plus effective config, rather than another repository search.

## Competing behavior causes

For duplicate effects, cancellation or race reports, read only relevant [retry](../references/retry-idempotency.md), [lifecycle](../references/lifecycle.md) and [transaction](../references/data-transactions.md) guides. Distinguish attempts, commits, publications, deliveries and acknowledgments. Trace correlation does not alone establish a counterfactual cause.

## Capabilities, failure and closure

Use permitted source/observational acquisition, configured semantic reads and fixed history operations. If a finite scratch recipe is actually exposed, qualified and permitted, use its pinned inputs/resources and preserve returned effects. Otherwise specify a probe for Maestro's qualified executor: exact inputs/environment, rival outcomes, positive/negative controls, confounders and stop criteria. Do not edit product, delegate or run arbitrary commands.

Return denied/held operations verbatim; continue only independent allowed work. Use [explanation](../../jimmy-research/writing/explanation.md), preserving the live rival and missing observation in the summary. Stop at a sustained bounded cause, refuted expectation, essential unavailable discriminator or effort bound; follow [closure](../references/closure.md).
