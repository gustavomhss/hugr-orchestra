# Authoring Sprints

A sprint is the single input Relay consumes: a `sprint.json` file that declares the goal,
the ordered list of Work Packages (WPs), and the Definition of Done (DoD) for each.
Getting the sprint right is the whole job — the Runner executes; the Gate enforces; the
sprint author controls what gets built and what "done" means.

---

## 1. The `sprint.json` schema

Reproduced from SPEC §3 with field-by-field commentary.

```json
{
  "brief": "string — the overall goal, given to the Runner at spawn",
  "retry_budget": 3,
  "macros": [
    { "id": "string — stable id, e.g. frame",
      "title": "string — short label",
      "instructions": "string — injected ONCE, when the chain first enters this macro" }
  ],
  "work_packages": [
    {
      "id": "string — stable id, e.g. wp1-impl",
      "macro": "optional — the id of the macro this WP belongs to",
      "title": "string — short label, shown in the Map up front",
      "instructions": "string — full detail, revealed only when this WP is relayed",
      "model": "optional — 'haiku' | 'sonnet' | 'opus' override for this WP",
      "self_check": ["optional — questions delivered WITH this WP's instructions; never a verdict"],
      "dod": [ { "type": "...", "...": "..." } ]
    }
  ]
}
```

### 1.1 Macros — the second coordinate

`macros` and `work_packages[].macro` are **optional**. A sprint that declares neither behaves exactly
as it did before, down to the ledger bytes: the `macro` field is written only when a WP declares one,
so historical hashes stay comparable.

When they are declared, the chain's position is two coordinates — `<macro>.<sub>` — and that is what
`$ARM/position` holds. This is what makes a failure localize to `frame.terms, control C7` instead of
to a work package and no further.

**A macro is a scope, not a loop.** It says which set of WPs is active; it does not run them. Each
fire still resolves exactly one WP. Its `instructions` are injected **once**, when the chain first
enters it — the natural home for "load protocol X, its MUST clauses bind" — and its sub-states do not
each pay for that context again.

A macro carries no retry state of its own. Retry, keep-best and the compliance criterion all key on a
**recorded verdict**, and only a WP has one; whether the enclosing macro is still open is irrelevant.

Resolution tries the whole position string as a WP id before splitting on the first dot, so an arm
that predates this notation keeps running, and a WP id that itself contains a dot stays unambiguous.

| Field | Required | Description |
|---|---|---|
| `brief` | yes | One or two sentences stating the sprint's overall goal. Seen by the Runner at spawn, before any WP is relayed. Sets the frame without spoiling details. |
| `retry_budget` | yes | Integer. Maximum Gate failures allowed on a single WP before Relay escalates (surfaces the gap to the human and halts the chain). Applies to every WP uniformly. |
| `work_packages` | yes | Ordered array. WPs execute in array order; every item must be present before the sprint runs. |
| `work_packages[].id` | yes | Stable, slug-style identifier (e.g. `wp1-impl`). Used in Gate feedback messages and escalation reports. Never change an id mid-sprint. |
| `work_packages[].title` | yes | Short label (≤ 6 words). Included in the Map given to the Runner at spawn. Should make the sprint's shape readable at a glance. |
| `work_packages[].instructions` | yes | Full working detail for this WP. Revealed by the Relay hook only when this WP is relayed — the Runner does not see them early. Be specific: file paths, function signatures, exact behavior expected. |
| `work_packages[].model` | no | Per-WP model override. When absent, the Runner keeps its current model. Valid values: `haiku`, `sonnet`, `opus`. See §4. |
| `work_packages[].dod` | yes | Array of Gate check objects. Every check must pass for the WP to be accepted. See §3 for authoring DoDs. |

---

## 2. Sizing and ordering Work Packages

**Each WP must be self-contained and single-responsibility.** One WP, one deliverable. If
you cannot write a DoD that mechanically verifies a WP in isolation, it is probably too broad.

**Size heuristics:**

| Too small | Good | Too large |
|---|---|---|
| "Add one import line" | "Implement the `parse_csv` function with error handling" | "Build the entire data pipeline" |
| Trivially passes gate | One focused artifact + verifiable | Multiple distinct artifacts; DoD sprawls |

**Ordering by dependency:** list WPs so that each one's inputs exist when it runs. The Runner
has continuous memory, so code written in WP1 is live in WP2 — no handoff needed. That
coupling is a feature, not a problem (SPEC §7: "Single continuous context").

Example dependency chain:

```
wp1-impl  →  wp2-tests  →  wp3-docs
(write fn)   (test fn)     (document fn)
```

WP2 can import and call the function WP1 wrote. WP3 can reference the API WP2 exercised.
Do not invert this order.

**Map up front, detail progressively (SPEC §7):** the Runner receives all WP `title` values
at spawn (the Map), so it can orient globally and avoid locally-good/globally-bad choices.
Detailed `instructions` are revealed one WP at a time. This means `title` values should
communicate intent ("Unit tests", "README usage"), not just sequencing ("Step 2", "Phase 3").

---

## 3. Writing good Definitions of Done

The DoD is what the Gate enforces. A WP is accepted if and only if every DoD check passes.
Write DoDs as if you are writing a contract: the Runner cannot appeal; the Gate does not
negotiate; "done" is either true or false.

**Principles:**

1. **Prefer mechanical checks.** `file_exists`, `grep`, `min_count`, `shell`, `test` are
   deterministic and free. Reserve `llm` checks for criteria that genuinely cannot be
   expressed mechanically (tone, coherence, design quality).

   A discursive control is an **addition**, never a substitute: pair it with a real oracle.

   ```json
   "checklist": [
     { "id": "suite-green",  "cmd": "pytest -q" },
     { "id": "knows-what-it-did", "diff": true, "blocking": true,
       "judge": "Does the description match the diff? FAIL any claim the diff does not support." }
   ]
   ```

   The first proves it works; the second proves the Runner knows what it did. See `docs/gates.md` §4
   for `diff`, `paths` and what happens when the diff cannot be computed.

2. **Be unambiguous.** The check either passes or fails with a clear reason the Runner can act
   on. Vague DoDs produce unhelpful gap messages and wasted retries.

3. **Make the DoD cover the WP, not less.** A DoD that passes trivially is not protecting you.
   If the WP says "add 5 tests", the DoD must count them.

4. **Each check should be independently meaningful.** Stacking redundant checks wastes Gate
   time; missing a necessary check skips enforcement.

For the full check-type catalog (`file_exists`, `grep`, `grep_absent`, `min_count`, `shell`,
`test`, `llm`) and their field definitions, see [gates.md](gates.md).

---

## 4. Per-WP model selection and `retry_budget`

### Model selection

The `model` field is an optional per-WP override. Use it when a WP's cost/difficulty profile
differs from the sprint default.

| Scenario | Suggested override |
|---|---|
| WP does mechanical work: rename, reformat, generate boilerplate | `haiku` — fast and cheap |
| WP implements non-trivial logic or makes architectural choices | `sonnet` (default) |
| WP requires deep reasoning, complex refactor, or multi-constraint design | `opus` |
| No override | Runner keeps its current model — the common case |

Do not set a model override "just in case." The default is usually right. Override only when
you have a clear cost or capability reason.

### `retry_budget` and escalation

`retry_budget` is a sprint-level integer that caps Gate failures per WP (SPEC §5):

- On each Gate failure, the Runner gets the precise gap injected and tries again on the same WP.
- After `retry_budget` failures on one WP, Relay **escalates**: the chain halts, the gap is
  surfaced to the human, and the last accepted WP is preserved (keep-best).

**Choosing a value:**

| Sprint type | Suggested budget |
|---|---|
| Well-specified, mechanical work | 2–3 |
| Exploratory or open-ended WPs | 3–5 |
| Fully automated pipeline (no human watching) | 3 (safe default) |

A budget of 0 means any single Gate failure escalates immediately — useful for strict
integration gates where a miss is a hard stop. A high budget (> 5) risks burning tokens on a
fundamentally broken WP; if the Runner cannot pass after 3 attempts, the instructions or DoD
usually need human revision.

---

## 5. Annotated example — the `slugify` sprint

From SPEC §6:

```json
{
  "brief": "Build a slugify(text) utility for the blog package.",
  "retry_budget": 3,
  "work_packages": [
    { "id": "wp1-impl", "title": "Implement slugify",
      "instructions": "Write slugify(text) in blog/slug.py: lowercase, strip accents, replace runs of non-alphanumeric chars with a single '-', and trim leading/trailing '-'.",
      "dod": [
        { "type": "file_exists", "path": "blog/slug.py" },
        { "type": "test", "cmd": "python -m pytest tests/test_slug_smoke.py -q" }
      ] },
    { "id": "wp2-tests", "title": "Unit tests",
      "instructions": "Add tests/test_slug.py covering accents, punctuation, multiple spaces, empty string, and leading/trailing separators.",
      "dod": [
        { "type": "test", "cmd": "python -m pytest tests/test_slug.py -q" },
        { "type": "min_count", "path": "tests/test_slug.py", "pattern": "def test_", "min": 5 }
      ] },
    { "id": "wp3-docs", "title": "README usage",
      "instructions": "Add a 'Slugify' section to blog/README.md with a runnable example.",
      "dod": [ { "type": "grep", "path": "blog/README.md", "pattern": "slugify\\(" } ] }
  ]
}
```

**WP-by-WP authoring choices:**

**`wp1-impl` — Implement slugify**
- `instructions` are fully specified: exact file path, exact function signature, exact
  transformation rules. Nothing for the Runner to infer.
- DoD uses two checks: `file_exists` ensures the file was created at all (catches a
  misplaced file), and `test` runs a pre-existing smoke test that verifies behavior. The
  smoke test is a separate pre-existing file — it was deliberately excluded from this WP's
  scope (smoke tests are assumed to exist; the full test suite is WP2's job).
- No `model` override — standard model appropriate for a focused implementation task.

**`wp2-tests` — Unit tests**
- `instructions` enumerate the exact cases to cover (accents, punctuation, multiple spaces,
  empty string, leading/trailing separators). This prevents the Runner from writing trivial
  tests and calling it done.
- DoD uses two checks: `test` verifies the suite is green, and `min_count` enforces the
  minimum number of test functions (`≥ 5`). The trace shows why this matters: on the first
  attempt the Runner wrote only 3 tests — `pytest` passed (no failures), but `min_count`
  caught the shortfall. The Gate's gap message told the Runner exactly what was missing;
  retry 1 fixed it.
- This is the canonical illustration of why mechanical counts beat prose DoDs.

**`wp3-docs` — README usage**
- The simplest WP: one `grep` check that verifies `slugify(` appears in the README.
- Intentionally minimal — the WP's scope is "add a usage section with a runnable example",
  and the grep is a lightweight proxy that is hard to satisfy without actually writing the
  section. A more precise DoD (e.g. also checking a code fence) would be fine but is not
  necessary given the WP's low risk.
- No `model` override; prose writing at this scale does not require a stronger model.

**Sprint-level choices:**
- `retry_budget: 3` is the safe default for a well-specified sprint with mechanical gates.
- Ordering is dependency-driven: implementation → tests (tests import the function) →
  docs (docs describe the API). Reversing any pair would break the Runner's ability to
  verify its own work.

---

## 6. Best practices and anti-patterns

### Work Packages

| Good | Anti-pattern |
|---|---|
| One WP per distinct deliverable | One WP for the entire feature |
| `instructions` give exact file paths and function signatures | `instructions` say "implement the feature as discussed" |
| `title` communicates intent: "Implement slugify" | `title` is sequential noise: "Step 2" |
| WPs ordered by dependency | WPs ordered by effort or arbitrary preference |
| Coupled WPs fine — same Runner, continuous memory | Artificial isolation when WPs share a codebase |

### Definitions of Done

| Good | Anti-pattern |
|---|---|
| `{"type":"test","cmd":"python -m pytest tests/test_slug.py -q"}` | `{"type":"llm","criterion":"tests look good"}` |
| `{"type":"min_count","path":"tests/test_slug.py","pattern":"def test_","min":5}` | `{"type":"grep","path":"tests/test_slug.py","pattern":"def test_"}` (passes with 1 test) |
| `{"type":"grep","path":"blog/README.md","pattern":"slugify\\("}` | DoD omitted — Gate has nothing to enforce |
| `{"type":"shell","cmd":"mypy blog/slug.py --strict"}` | `{"type":"llm","criterion":"code is type-safe"}` |
| Multiple focused checks that each catch a distinct failure mode | One broad `llm` check standing in for five mechanical checks |

**The "looks good" failure:** any DoD phrased as "the output looks correct", "the code is
clean", or "it seems right" is a `llm` check that cannot be mechanically verified. Use it
only when no script can decide the criterion. When a script can decide, it must.

**The empty DoD failure:** a WP with no `dod` array (or an empty one) trivially passes on the
Runner's first stop, regardless of what was produced. Every WP needs at least one check.

**The over-specified DoD:** a DoD that checks every internal implementation detail (specific
variable names, intermediate file contents) is fragile and punishes reasonable refactors.
Check the contract (outputs, exports, test results), not the implementation.

---

## 7. See also

- [gates.md](gates.md) — complete DoD check-type catalog with field definitions and examples
- [getting-started.md](getting-started.md) — install Relay, run your first sprint end-to-end
