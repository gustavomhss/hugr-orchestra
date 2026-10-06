# Relay runtime concepts

Audience: agents. Status: current.

Use this vocabulary when authoring plans or reading state. Load
[relay-gate-core](skills/relay-gate-core/SKILL.md) for evaluation
changes and [relay-audit](skills/relay-audit/SKILL.md) for evidence.

## Terms

| Term | Runtime meaning |
|---|---|
| Sprint | `brief`, `retry_budget`, and ordered `work_packages` in `sprint.json` |
| Work Package (WP) | Stable `id`, instructions, and current gate controls |
| Definition of Done (DoD) | Acceptance criteria; use named `checklist` controls for shipped arm evaluation |
| Runner | Agent doing the work; the hook resumes the same runner through block responses |
| Map | Brief and ordered WP titles supplied by the arm author at dispatch |
| Arm | Token-keyed plan, metadata, state, and ledger for one runner |
| Gate | Evaluation of current controls plus applicable deterministic regression checks |
| Keep-best | Re-execution of earlier deterministic controls; no file freeze or rollback |
| Macro | Named WP scope; author seeds opening protocol and entered marker, hook injects protocol on later unmarked entry |
| Position | Arm's current WP ID, optionally qualified by macro; distinct from run status |
| Ledger | Hash-chained JSONL entries carrying verdicts, control oracle hashes, and events |

## Choose the runtime surface

| Surface | State and delivery |
|---|---|
| `bin/relay-arm-hook.sh` | `SubagentStop`; transcript token binding; named `position`, `state`, and ID-keyed retries; next instructions in block reason; ARM `.run.lock` contention exits `3` |
| `bin/relay-gate` | Explicit `eval`/`check`; integer `counter` and index-keyed retries; JSON outcomes; caller delivers instructions; `check` can override named position/base ref |
| `benchmark/relay_hook.sh` | Plain `Stop`, single-runner measurement path; inspect separately before reuse |

These surfaces share [checklist evaluation and chain append](../lib/relay-gate.sh),
not every lifecycle feature. Typed `dod` catalog entries are design reference,
not a runtime dispatcher. A WP `model` field does not switch the active runner;
judge model selection uses `RELAY_JUDGE_MODEL`.

## Arm stop transitions

```text
author seeds first-state prompt and base ref
runner works → stop → resolve transcript token, arm, and position
  current checks + regression checks pass
    next WP → append evidence + advance-reveal, publish position/base, block with next instructions
    last WP → append evidence + sprint-complete, state=complete, empty stdout
  checks fail, budget available → record failure, same position, increment retry, block with failing IDs
  budget spent → append escalation, state=awaiting-human, empty stdout
```

Binding refusal or plan defects can also permit the stop without completion.
Inspect stderr, `state`, and the audit. Position identifies work; `counter` is
only a compatibility mirror in the arm hook and reaches the end on escalation.
Release requires a non-whitespace reason and a successful `human-release` append before clearing retry/round/repeat/blocked-claim
state using the resolved full WP ID plus legacy index retry and `reg_retry`, then
rechecks that same gate. It does not authenticate a human or waive controls.
Mandatory evidence/transition failures abort before corresponding state publication.
Some ARM ancillary appends and archives remain best-effort. Ordering is not atomicity or rollback.

## Controls and evidence

- A nonempty `cmd` is evaluated in the declared workdir; nonzero exit blocks.
- A `judge` item is non-independent and advisory by default. `blocking: true`
  makes a returned failure block; malformed output or nonzero judge exit also
  records an unavailable `fail` and blocks only when declared blocking. This does
  not turn judgment into deterministic proof. Supply relevant `context`, or
  `diff: true` with a recorded base ref.
- Arm keep-best reruns earlier `cmd` controls with a recorded pass. CLI keep-best
  reruns every earlier deterministic checklist command and earlier `dod[].cmd`.
  Compact JSONL transports each full control; decoded tabs and interior/trailing LF
  survive execution and oracle hashing. Each command is one Bash program judged
  by its final exit status. CLI/benchmark DoD uses the same whole-program transport;
  benchmark regression remains earlier DoD only, and ARM ignores legacy DoD.
- `execute` is the default arm kind; `gate` adds no special evaluator. `review`
  adds a cold-read reminder on reveal, not independent-review enforcement.
  `inject` reads a declared file or inline text, records its hash, and still
  evaluates any checklist. Payload delivery occurs only on successful nonterminal
  advance; failures and final completion can record a hash without delivering
  bytes. See [arm contract](per-agent-arms.md).
- [Compaction](compaction.md) shortens repeated feedback and emits checkpoint
  hints. The harness owns actual context compaction.
- Plain SHA-256 detects edits unless a writer recomputes the chain. HMAC mode
  uses `RELAY_LEDGER_KEY`; its protection depends on secret isolation. Neither
  mode alone excludes a valid-prefix truncation.

Audit with [relay verify](../bin/relay), including the sprint for oracle recheck.
Terminal escalation, missing deterministic controls, invalid control records,
drift, or an unfinished trace cannot produce an auditable pass. Sprint comparison
also rejects added/unrecorded, changed, or removed named controls; legacy missing
oracles are `unverified`, and supplied/discovered invalid sprints are `invalid`.
No supplied/discovered sprint leaves a recorded-only `not-run` comparison.
Audit does not rerun checks or validate current artifacts. Gate acceptance measures
authored checks; held-out benchmark grading is a separate evaluation.

Next: [task setup](getting-started.md), [CLI integration](sdk.md),
[documentation routes](README.md).
