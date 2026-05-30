# Getting Started

This guide walks you through installing Relay, authoring a sprint, and running it end-to-end.

---

## 1. Prerequisites

| Requirement | Version / note |
|---|---|
| **Claude Code** | 2.1.x — `SubagentStop` hook support required |
| **jq** | Any recent version; used by the Relay hook script |
| **A git repo** | The repository where the sprint's work will be executed |

Verify before continuing:

```sh
claude --version   # must be 2.1.x
jq --version
```

---

## 2. Install the Relay hook

The Relay hook is a `SubagentStop` hook wired into `.claude/settings.json`. Every time the
Runner stops, Claude Code fires this hook; the hook checks the Gate and either blocks
(advancing to the next Work Package or retrying the current one) or allows the stop (sprint
delivered).

### Minimal wiring

```json
{
  "hooks": {
    "SubagentStop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "/path/to/relay/hook.sh"
          }
        ]
      }
    ]
  }
}
```

The hook script reads `sprint.json` fresh on every fire. Editing the sprint definition never
requires touching the hook itself.

### Scope: project vs. global

- **Project scope** — place `.claude/settings.json` at the repo root. The hook fires only
  inside that repo. Recommended for per-sprint isolation.
- **Global scope** — place the settings file at `~/.claude/settings.json`. The hook fires in
  every Claude Code session.

See [configuration.md](configuration.md) for the full options reference, environment variables,
and multi-sprint routing.

---

## 3. Author your first sprint

A sprint lives in a single `sprint.json` file at the repo root (or at a path you configure).

The schema:

```json
{
  "brief": "string — the overall goal, given to the Runner at spawn",
  "retry_budget": 3,
  "work_packages": [
    {
      "id": "string — stable id, e.g. wp1-impl",
      "title": "string — short label, shown in the Map up front",
      "instructions": "string — full detail, revealed only when this WP is relayed",
      "model": "optional — 'haiku' | 'sonnet' | 'opus' override for this WP",
      "dod": [ { "type": "...", "...": "..." } ]
    }
  ]
}
```

Here is the canonical `slugify` example (used throughout this documentation):

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

**Key authoring points:**

- The `brief` + all WP `title` values form the **Map** — given to the Runner at spawn so it can
  orient globally before working locally.
- Each WP's `instructions` and `dod` are withheld from the Runner until the Relay hook relays
  that WP. The Runner sees one WP at a time.
- `dod` checks run in order; mechanical checks (`file_exists`, `grep`, `test`, etc.) run first
  and are free. An `llm` check costs a model call — use it only for criteria a script cannot decide.
- A WP passes only when **every** DoD check passes.

See [authoring-sprints.md](authoring-sprints.md) for the full DoD check-type catalog and
advanced patterns. See [gates.md](gates.md) for Gate evaluation semantics and the LLM judge.

---

## 4. Run it

Spawn the Runner using `claude -p` (non-interactive, sub-agent mode), passing the `brief` and
the **Map** (the list of WP titles) as the initial prompt. Instruct the Runner to start on `wp1-impl`.

```sh
claude -p "$(cat <<'EOF'
Build a slugify(text) utility for the blog package.

Work packages (in order):
  1. Implement slugify   [wp1-impl]
  2. Unit tests          [wp2-tests]
  3. README usage        [wp3-docs]

Start on wp1-impl now.
EOF
)"
```

**What happens next — you do nothing.** The Relay hook drives the rest:

1. The Runner works WP1 and stops.
2. The hook fires, runs the Gate for `wp1-impl`, and — if it passes — blocks the stop and
   injects WP2's instructions. The Runner resumes without leaving.
3. This repeats for every WP. When the last WP passes its Gate, the hook allows the stop.
   Sprint delivered.

The orchestrator never needs to re-enter the loop. The stop is the engine.

---

## 5. Watch the chain

The run trace below is from the `slugify` sprint. It shows the fail → retry → pass on WP2 —
the most important case to understand.

```
T0  orchestrator spawns Runner with brief + Map [Implement slugify, Unit tests, README usage]; "start wp1-impl"
T1  Runner writes blog/slug.py → STOPS
       Gate(wp1): file_exists ✓, smoke test ✓ → PASS → lock wp1 → relay wp2
T2  Runner writes tests/test_slug.py with 3 tests → STOPS
       Gate(wp2): pytest ✓, min_count(def test_) found 3 < 5 → FAIL (retry 1/3)
       block: "wp2-tests not done: need ≥5 test functions (found 3); add accents/empty/trailing cases."
T3  Runner adds 3 more tests (6 total) → STOPS
       Gate(wp2): pytest ✓, min_count 6 ≥ 5 ✓ → PASS → lock wp2 → relay wp3
T4  Runner adds README 'Slugify' section → STOPS
       Gate(wp3): grep 'slugify(' ✓ → PASS → list exhausted → allow stop
SPRINT DELIVERED — 3 WPs, 1 retry, 0 regressions.
```

**What each line means:**

| Line | What happened |
|---|---|
| `T0` | Orchestrator spawns the Runner with the `brief` + Map (WP titles only). Runner starts on `wp1-impl`. |
| `T1` | Runner produces `blog/slug.py` and stops. Gate checks `file_exists` and the smoke test — both pass. WP1 is locked (keep-best). Hook blocks the stop and injects WP2's instructions. |
| `T2` | Runner writes the test file but only includes 3 `def test_` functions. `min_count` check fails (need ≥ 5). This is retry 1 of 3. The hook blocks with the exact gap: which check failed and what the Runner needs to do. |
| `T3` | Runner adds 3 more tests (6 total). Both DoD checks pass. WP2 is locked. Hook relays WP3. |
| `T4` | Runner adds the README section. `grep` finds `slugify(`. WP3 passes. Package list is exhausted — hook allows the stop. |

Notable: the Runner never left its context between WPs. WP3 built directly on the live code
from WP1 and WP2 — no handoff, no serialization.

---

## 6. Next steps

- [authoring-sprints.md](authoring-sprints.md) — full DoD check-type catalog, `llm` judge usage,
  per-WP model overrides, and sprint decomposition patterns.
- [gates.md](gates.md) — Gate evaluation order, mechanical vs. semantic checks, retry budget
  semantics, and escalation behavior.
- [configuration.md](configuration.md) — hook installation options, `sprint.json` path
  configuration, environment variables, and multi-sprint setups.
