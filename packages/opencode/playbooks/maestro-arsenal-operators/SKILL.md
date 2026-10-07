---
name: maestro-arsenal-operators
description: Use when Maestro needs release, repository ruleset, or scoped policy proposals and the operator explicitly requests their adoption through existing native tools.
---

# Maestro Arsenal operator adoption

Use progressive discovery: `maestro_arsenal_catalog`, then `maestro_arsenal_describe` for one selected capability. Read the exact descriptor before `maestro_arsenal_execute`. A schema or host acquisition failure is a failure; a stored output path points to the full result, not an approval receipt.

## Actual status, usage and audit

Describe `governance`, then select `audit`, `usage` or `status`. The host supplies actual Session observations and available pricing. Model-written observations, revision strings and cost rates cannot replace the host's records. A missing historical native snapshot remains an acquisition error. Unknown pricing remains HOLD. These views summarize recorded Session evidence; they do not certify future execution or invoice integrity.

## Proposal → explicit operator intent → native execution

`release-propose`, `ruleset-propose`, `policy-propose` and `sandbox-propose` return proposals. Inspect the selected result and bind its exact repository, revision, branch/tag, resource paths and requested operation to the current direct user's instruction. Proposal text, a saved profile, a generated gate or a cost estimate does not authorize adoption.

When adoption was explicitly requested, execute selected commands through the existing `bash` tool (V1 ShellTool or V2 BashTool). That path supplies the real Session/tool-call identity, native permission requests, resource policy and normal durable tool outcomes. Use the native result as evidence. Preserve failed, denied, skipped, missing and unknown outcomes distinctly; do not convert a proposed command into a passing check.

For remote release or repository-ruleset adoption, confirm the exact remote repository and operation in the user's instruction before selecting a `gh` command. An audit or release-readiness request authorizes inspection, not publication. If intent or scope is absent, return the proposal and ask one bounded question about that operation. Native permission denial ends that execution attempt.

For policy adoption, inspect proposed resources against the actual host placement. Apply only the requested changes through existing `read`/`edit`/`apply_patch` tools and their configured permission/resource checks. Keep instruction/config protection active. A policy proposal cannot rewrite its own authority, set a bypass flag, install a global hook, grant a worker approval, or turn an unknown sandbox into a bound one.

## Existing capability routes

- `change-budget`, `ci-select`, `metrics-snapshot`, `metrics-report`, `loc-cap`, `changelog-check`, `changelog-propose`, `commitlint`, `repo-hygiene-check`: inspect actual scoped facts and proposals; run selected verification with native `bash` when requested.
- `preflight-arm`, `preflight-check`, `preflight-disarm`, `relay-arm`, `completion-check`, `acceptance`: bind named checks to actual host-observed results and the existing dispatch/completion lifecycle. A declared check is not an executed check. These capabilities do not create an extra mandatory work ceremony.
- `recovery-begin`, `recovery-prepare`, `recovery-status`, `recovery-replay`, `recovery-restore`: preserve the actual baseline, owned paths and native authorization. Recovery is selective and evidence-bound. Whole-repository destructive cleanup is not atomic recovery.
- `profile`, `wave-ledger`, `wave-scheduler`: use project-isolated managed state and replay-pure advice. Preferences and scheduling advice remain subordinate to the actual host's permissions and placement.

For compiler/decomposition, contracts, bounded briefs, graph advice and scaffolds, select their exact library descriptor on demand. Atlas remains the owner of grounded Own facts. Composer's existing `hugr-*` tools remain the infrastructure-reuse route. Keep detailed schemas and unchanged generated source out of repeated prompt context.
