---
name: maestro-orchestra-engines-relay
description: What Relay is, how workflows run under it, how each step is settled by checks, the ledger and its verify reasons, retry and release rules, and the claim limits.
internal: true
when: The owner asks about workflows, Relay, checks, why a step did not advance, a parked or escalated run, the ledger, or what Relay proves.
not-when: The question is how Maestro starts a governed run in general; open the governed playbook.
covers: [modules/relay]
---

# Workflows and Relay

Workflows are procedures written once; Relay runs them and decides each step is done by running its checks, not by
trusting the agent's report. Claim: checked progression and attributable evidence, bounded by the checks.

## Workflows

- Built in the Workflows screen: one document, two views (List, Canvas). Parts: Start (goal and retry budget, default 3),
  Phase (a group of steps, becomes one sprint), Step (provide context, task, review or gate), Check.
- A check is a command that must exit 0, or a question for a judge model.
- Edits save to a draft in the project's `authoring.sqlite3`. Only a published version runs; a run is bound to the version
  it started with. "Test now" runs one check for up to 60 seconds and shows up to 32 KiB (guide figures, not code-verified).
- Maestro runs a workflow only when asked, finding it by id or name through `maestro_workflows`. The start follows the
  governed rules: plan revision, cold review of the plan, owner approval (`approve` or `aprovo`), one dispatch.
- One seat works the whole run in one child session. Linear only; no steps that wait for a human; the app never starts a
  run on its own.

## Settling a turn

A run is bound to a session. Each turn the current step is injected and the seat's tools are narrowed to what the step
allows; the seat never sees later steps. When the turn ends, Relay runs the step's checks.

| Outcome | Ledger event | Effect |
|---|---|---|
| Pass | `advance-reveal`, `sprint-complete` | next step revealed, or the sprint completes |
| Fail | `gate-fail`, `gate-fail-repeat` | the seat redoes the same step with the tail of each failing command's output (at most 4 KiB per check) |
| Budget spent | escalated | the next failure parks the run awaiting a human |

A release names who and why and resumes the same gate; Maestro can release from the chat. A failed code review is held
for Maestro rather than sent back to the seat.

| Check | Behavior |
|---|---|
| `cmd` | runs with a stripped environment; passes on exit 0; killed after 15 minutes (`GATE_TIMEOUT`) |
| `judge` | the default backend is a stub that does not evaluate the criterion; `relay.judge.backend: "api"` turns on real judging |
| Host checks | package verification and cold review, run by the host |

## The ledger

One JSONL line per outcome under the app's data directory (`relay/<project>/`). Each line has a generation, a sequence,
the previous line's hash and an HMAC-SHA256. `relay verify <arm> --json` exits 0 clean, 1 broken integrity, 2 not an
auditable pass. Reasons: `TAMPERED`, `TRUNCATED`, `SPRINT-DIVERGED`, `ORACLE-CHANGED`, `ORACLE-DRIFT`, `CONTROL-FAIL`,
`ESCALATED`. `relay problems` and `relay cost` read records without verifying the chain.

It does not prove an agent cannot lie in its prose, rerun checks, or validate current artifacts. An unarmed agent is not
gated, and Relay neither freezes nor rolls back files.

## Profiles

Nine profile files in `modules/relay/profiles`. Five run (bug fix, feature launch, safe refactor,
test-driven feature, work-package execution) and four are refused with HTTP 409 until runnable (design, planning,
research, spec decomposition).

## `modules/relay`

Relay (`@orchestra/relay`): evaluates ordered work-package checklists at agent stop boundaries or through `bin/relay-gate`.
Orchestra core wraps it in `packages/core/src/relay*.ts`; the server exposes `relay-run`, `relay-document` and
`relay-hook` handlers. Source in `src/`: `arm` (evaluation, state, retries), `gate`, `hook`, `judge`, `ledger`, `audit`,
`authoring` (graph, lint, SQLite store). Binaries: `bin/relay` (audit CLI), `bin/relay-gate`, `bin/relay-arm-hook.sh`
(stop hook). The Python tools in `lib/` and `tests/` are a regression oracle.
Product brief: `modules/relay/PRODUCT.md`; contract: `modules/relay/SPEC.md`.
