Audience: agents. Status: current.

# Sprint authoring reference

Use [SPEC.md](../SPEC.md) for fields and driver contracts. Use
[integration](skills/relay-integration/SKILL.md) to dispatch an arm,
[gate core](skills/relay-gate-core/SKILL.md) to change evaluation, and
[maintenance](skills/relay-maintenance/SKILL.md) to keep generated artifacts current.
Use [profiles](skills/relay-profiles/SKILL.md) and
[spec library](skills/relay-spec-library/SKILL.md) for compiler and renderer limits.
Run commands below from the repository root.

## 1. Select the driver before writing controls

| Target | Author controls in | Additional obligation |
|---|---|---|
| ARM hook | `checklist` | Supply opening text and initial base ref; use a unique token and one runner per arm. |
| CLI `eval` | `checklist` and optional `dod[].cmd` | Harness manages continuation, `<state>/base_ref`, outcome exits, and escalation disposition. |
| Benchmark | `dod[].cmd` and optional `checklist` | DoD, not checklist, is its earlier-WP regression surface. |

Use named checklist `cmd` controls for an ARM-compatible plan. Do not rely on a typed DoD catalog:
`file_exists`/`grep`/`min_count`/`llm` types have no evaluator. Implement those requirements through
commands or `judge` fields. Put any model choice in runner launch configuration or judge environment;
WP `model` and `output_contract` fields do not enforce anything.

## 2. Define identities, instructions, and order

- Assign unique, stable WP IDs and globally unique control IDs. Avoid sanitized-filename collisions.
  ARM retry filenames follow WP IDs; final control reports and regression acceptance follow control IDs.
  ARM current/migrated/next WP/macro identities and persisted coordinates retain raw CR/LF and tabs.
  Raw whole-ID/first-dot-suffix lookup precedes legacy trailing-LF fallback, which runs only on a miss.
- Order WPs by dependency. Each fire evaluates one flat WP; macro declarations do not change ordering.
- Give every working WP exact output paths, behavior, scope, and a meaningful deterministic acceptance
  command. Write instructions for the contract, not internal variable names or implementation style.
- Supply the brief, WP title Map, first instructions, first macro protocol, and first self-check in the
  opening prompt. Later ARM advancements supply instructions, new macro text, and self-check questions.
- Mark the first macro entered after supplying its protocol, so the next WP in that macro does not
  inject it again. A macro carries no independent retry or acceptance state.
- Treat self-checks as questions about work process. They do not produce verdicts; a runner's answer
  does not satisfy a missing command control.

Use the concrete JSON plan in [SPEC §2](../SPEC.md#2-sprint-authoring-contract) as the field-shape
reference. Distinguish authoring requirements from runtime validation: scripts can advance an empty
checklist. Missing/null `checklist` and `[]` are valid empty control lists; any nonarray, including
`{}`, `false`, and `""`, is fatal before item execution. Lint is not a complete JSON schema validator.

## 3. Write controls that measure the stated contract

```json
[
  {"id": "artifact-valid", "assert": "result.json has the required status",
   "cmd": "python3 -c 'import json; d=json.load(open(\"result.json\")); assert isinstance(d, dict) and d.get(\"status\") == \"ready\"'"},
  {"id": "summary-grounded", "judge": "Does SUMMARY.md accurately describe the delivered result? Fail unsupported claims.",
   "context": ["SUMMARY.md", "result.json"], "blocking": true}
]
```

The JSON above is a `checklist` value, not a complete sprint. `cmd` wins if an item also has `judge`.
The shell command blocks on any nonzero final status. The semantic item blocks on `fail` with
`blocking=true`, including unavailable judge-response/transport failures, and remains non-independent
in the ledger. An invalid advisory response records `fail` but does not block. Choose a real judge
backend before using it for semantic assessment; default stub checks marker strings, not meaning.

Author deterministic controls against success and failure cases. Require evidence before asserting
absence: `python3 -c 'from pathlib import Path; assert "forbidden-value" not in Path("artifact.log").read_text()'`
fails on missing/unreadable input as well as forbidden content. If using a search tool, distinguish
errors from a genuine nonmatch rather than negating every nonzero exit. Prefer parsing structured
data and invoking existing contract checkers over counting function names or matching prose. A
presence check proves presence, not adequacy.

All checklist items run in array order, even after an ordinary failure. Commands run in the configured
workdir via `eval`, suppress diagnostics, and have no core timeout. Make commands repeatable, add
project-specific timeouts where necessary, and supply a diagnostic self-check separately. Do not
claim commands are free or read-only; they consume resources and may change their subject.

Multiline shell programs are supported in current checklist, ARM/CLI checklist regression, and
CLI/benchmark current/earlier DoD. Compact JSONL transport plus shared `relay_json_string` decoding
preserves tabs and all LF, including trailing LF. Commands execute whole and use final shell status;
`false\ntrue\n` passes. Use explicit shell control flow when earlier failures must affect that status.
External scripts remain useful for readable controls, but a single physical line is not required.

Current checklist IDs, resolved assertions, commands, judge criteria, and joined judge scope retain exact
decoded strings for ledger/oracle use. NUL and nonstring values are rejected by the shared decoder;
required IDs must be nonempty. Invalid ID/assertion aborts before execution; invalid command,
missing/invalid criterion, or invalid scope is a named failing control. Empty/null commands may
fall back to a valid judge. Optional DoD may be absent/null/empty; declared DoD commands must be
nonempty NUL-free strings. Malformed DoD declarations do not silently pass.
Source authors using `relay_json_string` must select a valid Bash output identifier outside reserved
`__relay_json_string_*`; that prefix is rejected without assigning the caller's variable.

New oracle records hash the complete decoded command or criterion-plus-scope, matching audit even
with trailing LF. False drift from old LF stripping/regression fragmentation is historical evidence;
preserve those ledgers rather than editing a plan or resealing evidence to make comparison pass.

For diff-based semantic review, supply the description as `context` as well as `diff=true`:

```json
{"id": "change-described", "judge": "Does REVIEW.md describe the computed diff accurately? Fail unsupported claims or omissions.",
 "context": ["REVIEW.md"], "diff": true, "blocking": true}
```

Do not assume the hook sends the runner's final message to the judge. Record initial ARM
`meta.base_ref` before work, or set CLI `<state>/base_ref` in the driving harness. Omit `paths` to
inspect all tracked changes and nonignored untracked additions; narrow only when the requirement
calls for it. Narrowing is part of the oracle hash. `context`, `diff`, and `blocking` are not, so an
unchanged oracle hash does not establish that the entire judging configuration stayed unchanged.

To check a named WP independently of an index cursor, use CLI `check`:

```bash
bash bin/relay-gate check --sprint runs/sprint.json --workdir . --state runs/state \
  --position build.write-summary --base-ref HEAD
```

`--position` matches the exact WP ID first, then the suffix after the first dot, bypassing stale or
past-end counters. Unknown position returns exit `2` with `unknown-position` error JSON. `--base-ref`
overrides the state file; explicit `--base-ref ""` disables fallback and makes diff unavailable,
failing a blocking diff control. These flags are check-only; `eval` rejects them. Check runs only the
selected checklist, without DoD, regression, retries, advancement, or ledger verdicts. It still runs
commands/judges and creates/locks state; `HEAD` here is an explicit ref, not a reconstructed entry ref.
CLI `wp`, `macro`, and `next` preserve exact decoded strings in emitted outcomes/applicable ledger
fields. Eval validates current nonempty NUL-free ID, optional NUL-free macro, and the next nonempty
NUL-free ID before controls, ledger writes, or counter/retry updates. It does not prevalidate future
macros or the whole plan. Check validates only its selected ID/macro; malformed future identity does
not block that narrower check. Directory creation and locking still precede validation.
ARM preserves current/migrated/next ID/macro and raw position too, but validates next ID/macro inside
advancement after current/regression commands and before buffered passing evidence is flushed.
Do not describe that as pre-command validation. Missing/raw-empty position still uses counter
migration; legacy empty-plan completion remains supported.

## 4. Kinds and retry limits

| Kind | Authoring constraint |
|---|---|
| `execute` / absent | Supply real deterministic controls. |
| `gate` | Declare a checkpoint; ARM still evaluates the same checklist. |
| `review` | Supply frozen artifacts and arrange reviewer separation in orchestration if required. ARM adds a cold-read reminder only. |
| `inject` | Supply a workdir-relative `file` or inline `text`; file wins. Its checklist still gates. Extracted text is delivered only on successful nonterminal advancement, not on failing or terminal rounds. |
| `human` | Compiler/lint vocabulary only. Do not dispatch it to ARM expecting an approval gate. |

Injection entries contain a label and digest, not payload bytes. File SHA-256 covers original bytes,
but `$(cat ...)` strips trailing LF from delivered text. Inline `$(jq -r ...)` strips trailing LF
before hashing and delivery. Neither the event nor the wrapped block text is lossless file transport.

Default `retry_budget=3` allows three failure re-blocks before the next failing evaluation escalates.
Budget `0` escalates on first failure. ARM uses a separate counter for regression-only failures;
identical round collapse does not create an earlier no-progress cutoff. An honored `RELAY-BLOCKED:`
claim matching that WP's last stored honored hash is the early-escalation exception; a new honored
claim replaces the hash, so A/B/A does not match on the final A. Persistent transcript text can match
without a new message. Budget applies per WP, not per macro.

Set `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP=0` before a hook-driven session if an uncapped chain is required.
Relay's cap check is a warning using `len(work_packages)+1`; it neither raises the harness cap nor
proves a chain will finish. The warning comparison runs only for a nonzero cap; `0` suppresses it.
Check the persisted state and ledger after runner exit.

Judge JSON adds boolean `available`; answered pass/fail and stub results are available, while
transport/no-verdict ballots are unavailable failures. Core validation permits that extra field but
does not enforce it or require reason. Calibration is stricter: process `0`, one pass/fail object,
NUL-free backend string, string reason, and literal true availability are required for a graded
measurement. Invalid results are excluded from confusion-matrix/agreement counts; all-invalid input
means unavailable agreement, not perfect rejection. Display tags/model aliases are not classifier
state. See [gates](gates.md#3-semantic-judge-behavior) for public three-tuple and import-guard boundaries.

Mandatory checklist/regression and disposition record failures are fatal. Completion/advance records
precede their corresponding published state/counter, and failure records precede retry updates.
ARM records release before consuming/resetting/reactivating; a failed release append keeps it pending.
This ordering does not roll back command effects, make ledger/state publication atomic, or guarantee
archival. A record may append before a later state write fails. Preserve the resulting prefix and
diagnostics; see [SPEC §6](../SPEC.md#6-ledger-and-audit-boundary) for driver-specific ordering and
remaining ancillary/best-effort paths.

## 5. Templates and profile compilation

The shipped spec catalog uses `${name}` parameters. Instantiation rejects placeholders used in the
original template that have neither a supplied value nor a metadata default. Unused extra parameters
are accepted. Substitution visits string leaves once and does not recursively expand placeholders
inside supplied values. Render validation requires each WP to have a nonempty named `cmd`/`judge`
checklist; it does not validate command meaning.

Within `cmd`, parameter values are split/rejoined as shell words with `shlex`, with whole-value
quoting as fallback for unparseable input. Use reviewed shell-word positions rather than prequoting
placeholders. This is not safe composition into embedded Python or an already quoted shell snippet,
nor validation of Python identifiers or application semantics. Prefer an external script with
explicit arguments; inspect every rendered command. See the
[spec-library skill](skills/relay-spec-library/SKILL.md) for the composition boundary.

```bash
python3 bin/relay-spec.py list
python3 bin/relay-spec.py show pytest-green
mkdir -p runs
python3 bin/relay-spec.py instantiate pytest-green \
  --param tests=tests/test_arm_binding.py -o runs/sprint.json
python3 bin/relay-spec.py lint runs/sprint.json --json
```

Lint returns `1` for errors, `0` for warnings-only or no findings. It checks known trivial commands,
missing deterministic controls in working states, cross-WP duplicate control IDs, known kinds,
missing injection payloads, some macro references, repeated self-check wording, and default-cap risk.
`--allow-ungated` downgrades only the ungated finding. It does not prove control quality, inspect
injected file existence, or catch every duplicate/schema defect. It accepts `human` despite ARM's
runtime refusal.

Compile YAML profiles with PyYAML and the repository's compiler:

```bash
python3 bin/relay-profile.py profiles/wp-execute.yaml --qualify-ids \
  -o runs/wp-execute.sprint.json
python3 bin/relay-profile.py profiles/wp-execute.yaml --qualify-ids \
  -o runs/wp-execute.sprint.json --check
python3 bin/relay-spec.py lint runs/wp-execute.sprint.json --json
```

Compiler preserves enabled macro/sub-state order, protocol text, and descriptions. It maps
`checklist` to `gate` and `human_approval` to unsupported runtime kind `human`. Controls come from
`criteria_map.per_criterion`, otherwise `criteria_map.default`, plus `criteria_map.per_sub` additions.
Unmapped criteria are reported and compile to no control; no passing placeholder is invented.
`--qualify-ids` qualifies WP IDs, not checklist IDs. Duplicate WP IDs fail compilation; inspect lint
for cross-WP control collisions. The maximum pipeline `max_iterations` becomes a per-WP Relay budget,
which differs from a per-macro budget. `--check` compares freshly rendered JSON with
newline-normalized `Path.read_text()` text; CRLF can compare equal to LF. Other formatting and key
ordering still matter. It is not a raw-byte comparison or a runtime-suitability check.

The command-template compiler replaces bare `{macro}` and `{sub}`, plus `{criterion}` in
criteria-command mappings, while preserving `${macro}`/`${sub}`/`${criterion}` for later binding.
The reserved-name collision is historical; those dollar-prefixed names no longer require renaming.
Descriptions/instructions, judge text, context, and paths do not pass through this command expander.
See the [profiles skill](skills/relay-profiles/SKILL.md) for exact placeholder-stage rules.

## 6. Amend a live plan explicitly

Retain stable IDs, bump `gen`, and change the plan between evaluations. ARM position follows identity;
CLI/benchmark integer position can silently re-aim under insertion/reorder. New work behind an ARM
cursor is not automatically reached, and newly inserted earlier controls are not accepted regressions.

```bash
python3 bin/relay-spec.py amend-check runs/before.json runs/after.json \
  --cursor wp2 --json
```

The offline comparator reports removed/disarmed controls, deterministic-to-judge downgrades, and
some moves behind the supplied cursor. A nonblank `--signed-by` reason can permit detected loosening;
it is attribution text, not a cryptographic signature or hook-enforced approval. The tool does not
rank command strength or write the amendment into an ARM ledger. Changed/removed recorded oracles
remain audit concerns. See [gates](gates.md) for verdict and audit limits.
Ledger evidence must also be duplicate-key-free at every nesting depth, including escaped-equivalent
keys, with exactly one final root digest `h`. Append bodies cannot supply top-level `h`; nested
`data.h` is ordinary data. Preserve original historical bytes rather than reformatting or resealing them.
