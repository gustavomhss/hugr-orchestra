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
