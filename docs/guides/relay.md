# Workflows and Relay

## Workflows

A procedure you write once and Maestro follows step by step: what to do, in which order, and which checks must pass before the next step opens. You build it in the Workflows screen; [Relay](#relay) runs it.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../images/readme/workflow-canvas-dark.png">
  <img src="../images/readme/workflow-canvas-light.png" alt="The Workflows canvas with the Launch a feature end to end template: Workflow start with 3 retries per step, then phases Discover, Specify, a one-step slicing phase, Build, Polish and Ship, each holding steps such as The feature request, Write the spec, Challenge the spec, Spec gate, Write failing tests, Make them pass, Final review and Ship gate, each with its number of checks.">
</picture>

### Building

One editor, two views of the same document: List and Canvas. The picture shows the "Launch a feature end to end" template.

| Part | What it holds |
| --- | --- |
| Start | The goal and the retry budget: failed checks a step may have before the run stops for you (3 by default) |
| Phase | A group of steps; becomes one sprint when the workflow runs; can carry its own instructions |
| Step: provide context | Hands the seat a text or a file; Publish stays blocked until it has one |
| Step: task | Work |
| Step: review | An independent look |
| Step: gate | Checks only |
| Check | A command that must exit 0, or a question for a judge model |

- Changes save as you go, into a draft. Only a published version can run, and a run is bound to the version it started with.
- "Test now" runs one check for up to 60 seconds and shows up to 32 KiB of output.
- Stored in the project's `authoring.sqlite3`. Nine templates ship with the app.

### Running

- Maestro runs a workflow only when you ask. It finds it by id or name through `maestro_workflows`.
- The start follows the governed rules: a plan revision, a cold review of that plan, your approval (`approve` or `aprovo`), then one dispatch.
- One seat works through the whole run in one child session you can open and watch.
- Limits: linear only (no branches), no steps that wait for a human, the app does not start a run on its own.

*Example:* ask Maestro to fix the double charge with the bug-fix workflow. The seat gets the reproduce step and nothing else; repair opens only after a test shows the second charge.

## Relay

The runtime under workflows. It decides whether a step is done by running checks, not by reading the seat's report, and writes every decision to a ledger you can verify.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../images/readme/relay-dark.png">
  <img src="../images/readme/relay-light.png" alt="Relay: the current step (reproduce, repair, explain) is injected into the turn with tools narrowed; when the turn ends, settle runs the step's cmd and judge checks with the environment stripped and a 15-minute limit; exit 0 reveals the next step or completes the sprint; a non-zero result sends the seat back to the same step; a failure after the retry budget is spent parks the run awaiting a human, whose release with who and why returns to settle. Every outcome is a JSONL ledger line with gen, seq, prev, mac and h, and relay verify exits 0, 1 or 2 with reasons such as TAMPERED, TRUNCATED, SPRINT-DIVERGED, ORACLE-CHANGED and ESCALATED.">
</picture>

### Settling each turn

A run is bound to a session. Each turn, the runner injects the current step into the prompt and narrows the seat's tools to what the step allows. The seat never sees steps ahead. When the turn ends, Relay runs the step's checks:

| Outcome | Ledger event | What happens |
| --- | --- | --- |
| Pass | `advance-reveal`, `sprint-complete` | Next step revealed, or sprint complete |
| Fail | `gate-fail`, `gate-fail-repeat` (same failure unchanged) | The seat works the same step again with the end of each failing command check's output, at most 4 KiB per check, with run parameter values of 8 or more characters redacted. A failed code review is held for Maestro instead. |
| Budget spent | escalated | Each gate has a retry budget, 3 by default. The next failure after it is spent parks the run as awaiting a human. A release names who and why (natively `owner: <reason>`) and resumes the same gate. Maestro can release from the chat. |

| Check | Behavior |
| --- | --- |
| `cmd` | Runs a command with a stripped environment; passes on exit 0; killed after 15 minutes |
| `judge` | Asks a model. The built-in judge is a stub that does not evaluate the criterion; set `relay.judge.backend: "api"` for real judging |
| Host checks | Package verification and cold review, run by the host rather than a command |

### The ledger

- One JSONL line per outcome under the app's data directory (`relay/<project>/`).
- Each line carries a generation, a sequence number, the hash of the previous line and an HMAC-SHA256 over its content (32-byte key).
- `relay verify` replays the file: exit 0 when clean, 1 or 2 with named reasons.

| Reason | Meaning |
| --- | --- |
| `TAMPERED` | A line was changed |
| `TRUNCATED` | The file was cut |
| `SPRINT-DIVERGED` | The run's sprint does not match its record |
| `ORACLE-CHANGED`, `ORACLE-DRIFT` | A check changed under a run |
| `CONTROL-FAIL` | A control check failed |
| `ESCALATED` | The run was parked for a human |

What it proves: checked progression and attributable evidence. A step was passed only by its checks, in order, and a human release names a person and a reason. It does not prove an agent cannot lie in its prose.

### Walk-through: the double charge

The bug-fix profile has three steps.

1. **Reproduce.** The seat writes `test/pay.test.ts`, which clicks Pay twice. The check requires the new test to fail; it does, two charges.
2. **Repair.** A 300 ms debounce on the button first. The check sends two requests in parallel and still fails, so the seat stays on repair with that output. Then an idempotency key checked by the server; the test passes.
3. **Explain.** The seat writes cause and fix for the pull request.

The ledger holds every outcome in order, including the failed repair, so a reviewer sees that the first fix did not work and why.

| Profiles | State |
| --- | --- |
| Bug fix, feature launch, safe refactor, test-driven feature, work-package execution | Run |
| Design, planning, research, spec decomposition | Exist; refused (HTTP 409) until they can run |
