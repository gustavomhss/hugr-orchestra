# HuGR Relay — agent entrypoint

Audience: agents. Status: current.

Relay evaluates ordered work-package checklists at agent stop boundaries or through
`bin/relay-gate`. Deterministic commands decide acceptance; a hash-chained ledger
records controls and outcomes. Acceptance covers what those commands check.

## Read before work

| Route | Use |
|---|---|
| [AGENTS.md](AGENTS.md) | Repository instructions and ownership workflow |
| [Documentation routes](docs/README.md) | Current references, status, and document inventory |
| [SPEC.md](SPEC.md) | Terminology, format, and design reference; confirm shipped behavior in source |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Agent change workflow and documentation checks |

## Select task skill

New operational guides live in `docs/skills/relay-*/SKILL.md`.

| Task | Skill |
|---|---|
| Claim paths and locate owners | [relay-ownership](docs/skills/relay-ownership/SKILL.md) |
| Change and verify repository artifacts | [relay-maintenance](docs/skills/relay-maintenance/SKILL.md) |
| Trace affected modules and checks | [relay-blast-radius](docs/skills/relay-blast-radius/SKILL.md) |
| Wire an agent harness or arm | [relay-integration](docs/skills/relay-integration/SKILL.md) |

## Select module skill

| Surface | Skills |
|---|---|
| Authoring service and API | [relay-authoring](docs/skills/relay-authoring/SKILL.md) |
| Gate evaluation and hooks | [relay-gate-core](docs/skills/relay-gate-core/SKILL.md), [relay-arm-hook](docs/skills/relay-arm-hook/SKILL.md), [relay-gate-cli](docs/skills/relay-gate-cli/SKILL.md) |
| Audit and run views | [relay-audit](docs/skills/relay-audit/SKILL.md), [relay-telemetry](docs/skills/relay-telemetry/SKILL.md) |
| Runtime coordination | [relay-daemon](docs/skills/relay-daemon/SKILL.md) |
| Plan authoring | [relay-profiles](docs/skills/relay-profiles/SKILL.md), [relay-autodecompose](docs/skills/relay-autodecompose/SKILL.md), [relay-spec-library](docs/skills/relay-spec-library/SKILL.md), [relay-policies](docs/skills/relay-policies/SKILL.md) |
| Work protocols | [relay-planning](docs/skills/relay-planning/SKILL.md), [relay-specification](docs/skills/relay-specification/SKILL.md), [relay-design](docs/skills/relay-design/SKILL.md), [relay-research](docs/skills/relay-research/SKILL.md) |
| Evidence and documentation | [relay-benchmark](docs/skills/relay-benchmark/SKILL.md), [relay-doc-tooling](docs/skills/relay-doc-tooling/SKILL.md), [relay-examples](docs/skills/relay-examples/SKILL.md) |

## Run or inspect

- Serve workflow and hook authoring for Orchestra: [authoring API](docs/authoring-api.md).
- Configure an arm: [getting-started](docs/getting-started.md),
  [per-agent arms](docs/per-agent-arms.md).
- Drive a non-hook harness: [gate CLI contract](docs/sdk.md).
- Draft controls from pytest: [auto-decompose](docs/auto-decompose.md).
- Diagnose a stop: [FAQ](docs/faq.md).
- Exercise scripted feedback: [fleet-chain example](examples/fleet-chain/README.md).

```sh
bin/relay problems /path/to/arm --json
bin/relay verify /path/to/arm --json
bin/relay cost /path/to/arm --json
```

`relay verify`: exit `0` = recorded-checklist audit accepted; `1` = broken integrity;
`2` = not an auditable pass. Require usable `--json` output and process exit `0`.
When plan comparison is required, also require `oracle_recheck.status == "ok"`.
Supply `--sprint /path/to/sprint.json` for a bare ledger. No discovered/supplied
sprint yields `not-run`, which can still accompany exit `0`; an explicitly supplied
or discovered unreadable/malformed sprint yields `invalid` and exit `2`.

The audit checks final recorded checklist verdicts, record validity, and terminal
completion. Sprint comparison detects added/unrecorded, changed, and removed named
controls; legacy records without oracle hashes yield `unverified` when compared.
It does not rerun checks, validate current artifacts, or compare every plan field.
Decoded `cmd` and `judge` strings retain trailing LF in runtime oracle hashing,
matching audit recomputation. See [SPEC §5](SPEC.md#5-judge-and-computed-artifact-contract)
and [§6](SPEC.md#6-ledger-and-audit-boundary).
Strict ledger decoding rejects duplicate keys at any depth, including escaped
equivalents, and requires one final root `h`. Writers reject supplied root `h`;
verification preserves original signed-body bytes.

`relay problems` derives history-based categories, returning `1` when problems
exist, `0` otherwise, and `2` for usage/missing ledger. `relay cost` reports recorded
usage with `total: null` when unmeasured. These two views load records directly;
they do not run chain verification or establish billing totals.

## Runtime boundaries

- Arm binding prefers `agent_transcript_path`. Ambiguous tokens or a different
  bound `agent_id` cause refusal with exit `0`, permitting the stop.
- Empty hook stdout can mean completion, escalation, refusal, or a plan defect.
  Inspect arm `state`, stderr, and `relay verify`; a stopped runner is not proof.
  ARM `.run.lock` serializes evaluation; contention exits `3` with stderr, no block.
- Mandatory ARM/CLI/benchmark evidence and transition appends fail fatally before
  corresponding counter/state/retry/release updates. Some ARM ancillary appends
  and archives remain best-effort; this ordering provides neither atomicity nor rollback.
- Keep-best transports full controls as compact JSONL and preserves decoded tabs,
  interior LF, and trailing LF. CLI/benchmark DoD executes each whole shell program;
  its final exit status decides acceptance. Files remain editable; Relay neither
  freezes artifacts nor rolls them back.
- Compaction hints and cold-read review reminders are advisory. Relay does not
  compact context or spawn an independent reviewer.
- The gate CLI uses an integer counter and implements only part of the arm-hook
  lifecycle. See [sdk.md](docs/sdk.md) before adapting a v2 plan.

Runtime authorities: [arm hook](bin/relay-arm-hook.sh), [gate CLI](bin/relay-gate),
[shared core](lib/relay-gate.sh), [audit CLI](bin/relay). Benchmark claims require
[recorded evidence](benchmark/RESULTS.md); scripted examples do not establish
live-model quality or fan-out reliability.
