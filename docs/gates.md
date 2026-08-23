# Gates & Definition of Done

## 1. What a Gate is and when it runs

A **Gate** is the evaluation of a Work Package's (WP) Definition of Done (DoD) at a stop
boundary. It runs inside the **Relay hook** (`SubagentStop`) each time the Runner halts,
after the Runner has finished reasoning and output for the current WP.

The Gate's position is deliberate: hooks fire only when the agent has already stopped. This
means the Gate adds **latency at the exit** — it never severs an in-progress thought
(SPEC §7, "Gate at the boundary, never mid-reasoning"). On failure, the Gate
*extends* work by injecting a `decision:block` with the precise gap; it does not interrupt
a turn.

A WP's verdict is the AND of every check in its DoD. All checks must pass; a single
failure holds the WP.

---

## 2. Check-type catalog

The catalog below is the complete Gate vocabulary (SPEC §4). No other check types exist.

### Mechanical checks — free, deterministic (prefer these)

| `type` | Required fields | Passes when |
|---|---|---|
| `file_exists` | `path` | the file exists on disk |
| `grep` | `path`, `pattern` (ERE) | pattern is found at least once in the file |
| `grep_absent` | `path`, `pattern` (ERE) | pattern is NOT found in the file |
| `min_count` | `path`, `pattern`, `min` | ≥ `min` non-overlapping matches of pattern in the file |
| `shell` | `cmd` | command exits 0 (run at repo root) |
| `test` | `cmd` | alias of `shell`, semantically signals a test-runner invocation; exits 0 |

### Semantic check — costs a model call

| `type` | Required fields | Optional fields | Passes when |
|---|---|---|---|
| `llm` | `criterion`, `rubric` | `model` | the judge model returns PASS under the rubric |

The Gate runs all mechanical checks first; `llm` checks run only if at least one is present.

---

### Concrete DoD-entry examples — one per type

**`file_exists`** — verify the module was created:
```json
{ "type": "file_exists", "path": "src/payments/refund.py" }
```

**`grep`** — verify the expected export is present:
```json
{ "type": "grep", "path": "src/payments/refund.py", "pattern": "^def refund\\(" }
```

**`grep_absent`** — verify no debug `print` statements were left in:
```json
{ "type": "grep_absent", "path": "src/payments/refund.py", "pattern": "print\\(" }
```

**`min_count`** — enforce a minimum number of test functions:
```json
{ "type": "min_count", "path": "tests/test_refund.py", "pattern": "def test_", "min": 6 }
```

**`shell`** — enforce zero lint violations:
```json
{ "type": "shell", "cmd": "ruff check src/payments/refund.py --quiet" }
```

**`test`** — run the relevant test suite:
```json
{ "type": "test", "cmd": "python -m pytest tests/test_refund.py -q" }
```

**`llm`** — verify that the changelog entry reads as a user-facing summary, not an
internal diff description (a criterion no script can evaluate reliably):
```json
{
  "type": "llm",
  "criterion": "The CHANGELOG entry for this release reads as a user-facing summary of impact, not an internal diff description.",
  "rubric": "Return PASS if the entry is written from the user's perspective and avoids internal implementation details (e.g. 'faster checkout flow' not 'replaced O(n²) loop in cart.py'). Return FAIL otherwise.",
  "model": "haiku"
}
```

---

## 3. Mechanical vs semantic tiers

### Prefer mechanical

Mechanical checks (`file_exists`, `grep`, `grep_absent`, `min_count`, `shell`, `test`) are
**free and deterministic**. They run first regardless of ordering in the DoD array. When
writing a DoD, exhaust the mechanical vocabulary before reaching for `llm`.

Push requirements into mechanical form wherever possible:
- "documentation is present" → `grep` for a section header
- "no regressions" → `test` against the existing suite
- "sufficient coverage" → `min_count` of test functions, or a `shell` coverage command

### When to use `llm`

Reserve `llm` for criteria that are **genuinely undecidable by a script**: tone, coherence,
user-facing readability, or whether an explanation is correct at the semantic level. If a
mechanical check could approximate the criterion, use the mechanical check.

### Cost guidance

| Scenario | Recommended |
|---|---|
| File existence, content, test pass | mechanical only |
| Coverage threshold, lint, formatting | `shell` / `test` |
| "Is this well-written?" / tone / user-facing correctness | `llm` with `"model": "haiku"` |
| Complex multi-dimensional rubric | `llm` with `"model": "sonnet"` |

Specifying `"model": "haiku"` on `llm` checks keeps costs low for routine semantic gates.
Omit `model` only when the rubric genuinely requires a stronger judge.

---

## 4. Verdict semantics

**A WP passes only when ALL its checks pass (AND).**

On failure, Relay collects the specific gaps — the list of checks that did not pass —
and injects them verbatim into the `block` reason delivered back to the Runner:

```
WP <id> not done: <gap 1>; <gap 2> — fix and continue.
```

The Runner receives the gaps as its next instruction and resumes the **same WP** (the index
is not advanced). This makes every retry targeted: the Runner knows exactly what is missing,
not just that it failed.

On pass, the WP is locked via keep-best (see §5) and the Gate relays the next WP's
instructions into the same Runner.

### The self-check ships with the next state's instructions

A WP may declare `self_check`, a list of questions:

```json
{ "id": "wp2-carve", "instructions": "...",
  "self_check": ["Which requirement does each package close, and where is that recorded?",
                 "What did the packet ask for that you did not do?"] }
```

They are delivered on the **advance into that WP**, alongside its instructions — never after a
failure, where the Runner needs the gap rather than a questionnaire. Asked in advance, a self-check
is a forcing function: an agent that knows what it will be asked works toward it while it still can.
Asked only once the gate has failed, it is a remedy, and unaided self-correction is known to plateau
or hurt. What makes it work is that it is anchored to a check that runs whatever the Runner says.

A self-check is **text**. It produces no verdict and no ledger entry — a chain that recorded it as
one would be certifying the Runner's own account of its work. Write it to probe the *protocol's
steps* while the deterministic control measures the *outcome*; if both ask the same question, the
self-check is decoration.

The first WP's self-check is not the Gate's to deliver: the hook speaks only once the Runner has
stopped, so the first state's context — instructions, macro protocol, self-check — belongs in the
opening prompt the arm author writes.

### `diff: true` — the artifact is computed, not supplied

A `judge` item may set `diff: true`. The Gate then computes `git diff <base_ref>` **itself** and
hands the result to the judge, instead of grading whatever static paths the plan listed in `context`:

```json
{ "id": "described-what-changed",
  "judge": "Does the description match the diff? FAIL any claim the diff does not support.",
  "diff": true, "blocking": true }
```

- **`base_ref` is the workdir's HEAD when the state was entered**, captured by the advance out of the
  previous state and written onto the chain with it. The first state has no such moment, so its base
  ref goes in the arm's `meta.json` — the arm author's job, like its instructions.
- **Committed and uncommitted work are both covered**, and so are **untracked files** — a brand-new
  file is the most common shape of new work. Untracked content is appended as a `--no-index` diff
  rather than through `git add -N`, because the Gate must not write into the index of the workspace
  it is judging.
- **Narrowing with `paths` is legal but never free.** It is folded into the control's oracle and
  recorded as `scope` on the entry, so a narrowing introduced mid-run reads as ORACLE DRIFT. This
  matters because artifact selection is an *oracle* decision living in a *plan* field: narrowing it
  to omit the file where the problem lives makes the judge dutifully cross-check an incomplete
  artifact and pass — the scope-narrowing attack, moved out of the agent's prose and into the
  orchestrator's.
- **It fails closed.** No base ref, or not a git workdir, records `fail` with
  `graded_by: judge:unavailable` — an infrastructure failure, not a judgment. Note that it still only
  *blocks* if the item is `blocking`: an advisory control that cannot run is still only advisory,
  which is exactly why a discursive control is never allowed to stand alone.

---

## 5. Keep-best, retry budget, and escalation

### Keep-best (anti-regression)

Once a WP's Gate returns PASS, that WP is **locked**. The chain advances; no later WP,
refactor, or retry can ship a worse version of an already-accepted package. This property is
empirically motivated: measured reflection/refactor passes occasionally regressed correct
code (SPEC §7, §10, Finding 2).

### Retry budget

Each WP has a bounded retry budget (sprint-level field `retry_budget`). The per-WP retry
counter increments on every FAIL verdict for that WP.

```
retries[runner][wp.id] += 1      # on each FAIL
```

### Escalation — no skipping

When `retries[runner][wp.id] > retry_budget`, the chain **escalates and stops**. The
escalation surfaces the WP id and the outstanding gaps to the human, with the last accepted
WP preserved intact. The chain does **not** skip the failing WP and proceed to the next one
— a WP that cannot be delivered within budget is a signal for human intervention, not silent
advancement.

```
if retries[runner][i] > sprint.retry_budget:
    ESCALATE(wp, gaps)   # stop; surface to human; keep last accepted WP
    allow_stop()
```

### Every re-blocking path is bounded

A **regression-only** failure — the current WP's Gate passes, but an earlier accepted control has
backslid — is not a failure of the current WP, so it does not charge that WP's retry budget. It has
a budget of its own (`$ARM/reg_retry`), spent on the same `retry_budget`, and cleared by a clean
pass. Nothing may re-block without a bound: a Relay retry costs a model turn, so an unbounded path
spends indefinitely (docs/control-plane.md §8).

Note this is a *turn* budget, not a wall-clock backoff. The Gate fires only when the Runner has
stopped, so there is no timer to ration — sleeping would add latency and save no turns.

### A re-run is a verdict, and the oracle it ran under is on the chain

Keep-best re-executes earlier controls on every later fire. Those re-runs are recorded as
`regression-item` entries, each carrying the sha of the command that actually ran — not just the
failing ids, which is all that used to reach the chain. A re-run that *passed* left no trace at all,
and that omission is what made the following attack work.

**Why it matters.** A control's `id` and `assert` are what a reader sees; the `cmd` is what was
measured. Swap the `cmd` of a control that has ALREADY PASSED — leaving `id` and `assert`
byte-identical — and nothing is tampered with, so the hash chain stays INTACT. Before this, the
chain held exactly one oracle for that control, `relay verify` had nothing to compare against, and
it printed `RESULT: PASS — auditable` while the violation the control existed to catch sat on disk.

`relay verify` now reports **any** control graded under more than one oracle within a single run:

```
  ORACLE DRIFT — these controls were graded under more than one oracle in this run:
    C1         verdicts pass -> pass   oracle 4b710f6cc8f7 -> b5bea41b6c62
  The chain is intact — nothing was tampered with. The question was changed.

  RESULT: ORACLE DRIFT — not an auditable pass.
```

The older, narrower rule — a control that **failed** one check and passes a different one — survives
as a labelled subset and still reports as `ORACLE CHANGED`, because it supports the stronger claim:
that control was not repaired, its question was.

No exemption exists yet for a legitimate amendment, so amending a control mid-run reports as drift.
That is the correct failure direction while relay-v2 V11 is unbuilt: a false positive costs a human
one look, a false negative certifies a fabricated pass.

A `regression-item` is deliberately **not** a `checklist-item`. "The final verdict for this control"
keeps meaning *as graded at its own gate* — a re-run reports on kept work, not on a gate being
cleared — so `relay verify`'s control list, the corpus exporter and the dash are unchanged.

---

## 6. Example DoDs

### 6.1 — Implementation WP

```json
{
  "id": "wp1-impl",
  "title": "Implement refund endpoint",
  "dod": [
    { "type": "file_exists", "path": "src/payments/refund.py" },
    { "type": "grep", "path": "src/payments/refund.py", "pattern": "^def refund\\(" },
    { "type": "grep_absent", "path": "src/payments/refund.py", "pattern": "print\\(" },
    { "type": "shell", "cmd": "ruff check src/payments/refund.py --quiet" },
    { "type": "test", "cmd": "python -m pytest tests/test_refund_smoke.py -q" }
  ]
}
```

All mechanical. Verifies: file created, function exported, no debug noise, lint-clean, smoke
tests pass.

---

### 6.2 — Tests WP

```json
{
  "id": "wp2-tests",
  "title": "Unit tests for refund",
  "dod": [
    { "type": "file_exists", "path": "tests/test_refund.py" },
    { "type": "test", "cmd": "python -m pytest tests/test_refund.py -q" },
    { "type": "min_count", "path": "tests/test_refund.py", "pattern": "def test_", "min": 6 }
  ]
}
```

Enforces: test file present, full suite green, and at least six distinct test functions
(prevents a single parameterized stub from satisfying the DoD).

---

### 6.3 — Docs WP (mixed mechanical + semantic)

```json
{
  "id": "wp3-docs",
  "title": "User-facing CHANGELOG and README entry",
  "dod": [
    { "type": "grep", "path": "CHANGELOG.md", "pattern": "refund" },
    { "type": "grep", "path": "docs/payments.md", "pattern": "refund\\(" },
    {
      "type": "llm",
      "criterion": "The CHANGELOG entry for the refund feature reads as a user-facing summary of impact.",
      "rubric": "Return PASS if the entry is written from the user's perspective without internal implementation details. Return FAIL otherwise.",
      "model": "haiku"
    }
  ]
}
```

Mechanical checks confirm presence; the `llm` check enforces quality a grep cannot — used
only because tone is the explicit requirement.

---

## 7. See also

- [authoring-sprints.md](authoring-sprints.md) — how to write `sprint.json`, WP structure,
  the Map-up-front pattern, and per-WP model selection.
- [architecture.md](architecture.md) — Relay hook internals, the per-`agent_id` counter,
  keep-best storage, and the full `SubagentStop` payload reference.
