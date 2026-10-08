# Relay documentation routing

Audience: agents. Status: current.

## Operating skills

| Task | Load |
|---|---|
| Claim files and assign work | [relay-ownership](skills/relay-ownership/SKILL.md) |
| Change or recover a module | [relay-maintenance](skills/relay-maintenance/SKILL.md) |
| Determine downstream impact | [relay-blast-radius](skills/relay-blast-radius/SKILL.md) |
| Connect a harness | [relay-integration](skills/relay-integration/SKILL.md) |
| Locate module maintenance | [skills.json](skills.json): `modules[].skill` |
| Maintain this corpus | [relay-doc-tooling](skills/relay-doc-tooling/SKILL.md) |
| Inspect this wave's independent review record | [reviews/agent-skills.json](reviews/agent-skills.json) |

Catalog assigns in-scope executable sources to modules, lists tests and declares dependencies.
It is the ownership inventory; do not maintain another source-file inventory in prose.

## Current references

| Contract | Reference |
|---|---|
| Installed behavior | [SPEC.md](../SPEC.md) |
| Drivers and states | [architecture.md](architecture.md) |
| Sprint and control authoring | [authoring-sprints.md](authoring-sprints.md), [gates.md](gates.md) |
| Environment and registration | [configuration.md](configuration.md), [per-agent-arms.md](per-agent-arms.md) |
| Portable CLI and HTTP | [sdk.md](sdk.md), [daemon.md](daemon.md) |
| Workflow and hook authoring for Orchestra | [authoring-api.md](authoring-api.md) |
| Native production, Python tools, regression services and frozen oracles | [python-runtime-disposition.md](python-runtime-disposition.md) |
| Profile compilation | [profiles.md](profiles.md) |
| Corpus, telemetry, policy and templates | [trace-corpus.md](trace-corpus.md), [telemetry.md](telemetry.md), [guardrails.md](guardrails.md), [spec-library.md](spec-library.md) |
| Change procedure | [CONTRIBUTING.md](../CONTRIBUTING.md), [AGENTS.md](../AGENTS.md) |

## Evidence and historical records

[WHITEPAPER.md](../WHITEPAPER.md), [benchmark/RESULTS.md](../benchmark/RESULTS.md),
[control-plane.md](control-plane.md), [relay-v2.md](relay-v2.md), [roadmaps](roadmaps/), and
[self-graded review finding](FINDING-self-graded-review-verdicts.md) record decisions/measurements.
Respect status labels and evidence limits. A dated outcome does not prove current correctness.
Fixture prose under [fixtures/](fixtures/) and fixture ledgers under [test/fixtures/](../test/fixtures/) are frozen inputs, not operating instructions.

## Freshness contract

For behavior changes inspect the module skill and current references. Replace stale current claims;
retain historical evidence under explicit status. Run structural checks and regenerate [INDEX.md](INDEX.md).
Every skill requires independent cold review before completion. Automated checks do not decide prose quality.
