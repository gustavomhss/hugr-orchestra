# R2 — Historical Completed Scope: Policy Bundles

Audience: agents. Status: historical.

Current authority: [SPEC.md](../../SPEC.md). Procedures: [operational skills](../../.opencode/skills/).
This card records a completed local scope, not an active guard-authoring plan.

## Delivered scope

[bin/relay-policy.py](../../bin/relay-policy.py) implements `apply` and `list`.
Selected JSON bundle controls are prepended to each WP; first bundle wins duplicate IDs,
org-selected controls replace same-ID WP controls, and injected controls carry a policy stamp.
Validation requires control IDs and `cmd`/`judge` shape, including string command fields.
[lib/relay-gate.sh](../../lib/relay-gate.sh) carries policy origin into chained verdicts.

The [policies/](../../policies/) catalog includes `no-debug-prints`, `no-loosened-tests`
and `coverage-floor`. Original ownership: merger/catalog,
[tests/test_policy.py](../../tests/test_policy.py), guardrail docs.

## Bounded completion

Bundle application is explicit authoring, not an automatic org-wide policy or authenticated
admin boundary. Shape validation does not prove each command's scope or strength; the catalog's
scans/thresholds must be interpreted from their actual commands. Commands execute on the gate
host through `eval`; parameter quoting is not sandboxing arbitrary bundle commands. Provenance
text is not cryptographic actor authorization.

Test references record verification intent, not a current suite result or test count.
