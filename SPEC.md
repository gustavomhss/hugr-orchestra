# HuGR Relay — Canonical Spec (single source of truth)

> Every other doc derives terminology, schema, and examples from THIS file. Do not invent
> alternative names, fields, or examples elsewhere — reference these.

## 1. One-line definition

Relay drives **one continuous sub-agent (the Runner)** through an ordered list of **Work
Packages (WPs)** by intercepting every stop with a **`SubagentStop` hook (the Relay hook)**,
checking the finished WP against its **Definition of Done (the Gate)**, and either relaying the
next WP into the same agent (pass) or handing the current one back with the gap (fail) —
**forward-only, never regressing** — until the sprint is delivered.

> **Implementation status (shipped reality vs. this spec).** This spec describes the **`SubagentStop`
> + per-runner `agent_id`** multi-runner mechanism. The **shipped** benchmark hook
> (`benchmark/relay_hook.sh`) is a plain **`Stop`** hook driving **one runner per run**: it drains and
> ignores `stdin`/`agent_id` and keys progress on a single flat-file counter. `SubagentStop` + stable
> `agent_id` were verified in clean-room probes (§9) but are **roadmap, not running.** Treat the
> `agent_id`-keyed pseudocode in §6 as the target design; the single-runner `Stop` path is what
> executes today. See `WHITEPAPER.md` §3.5 and `PRODUCT.md` §4.4.
>
> **Gate ≠ grader.** The Gate (DoD checks the runner is told to self-check with) and the benchmark
> **grader** are now **disjoint**: the grader scores a **held-out** suite (`<campaign>/holdout/`) the
> runner never sees, so an implementation that hard-codes the visible `checks/` inputs scores low.
> The held-out suite is stripped from the run dir by `run_arm.sh`.

## 2. Glossary (canonical terms — use verbatim)

| Term | Meaning |
|---|---|
| **Sprint** | The whole job: a brief + an ordered list of Work Packages. |
| **Work Package (WP)** | One self-contained unit of work with its own instructions and DoD. |
| **Definition of Done (DoD)** | The objective pass/fail criteria for a WP (a list of checks). |
| **Runner** | The single sub-agent that executes every WP, with continuous memory. |
| **Relay hook** | The `SubagentStop` hook that intercepts each stop and advances or holds. |
| **Gate** | The evaluation of a WP's DoD at a stop; decides pass (advance) or fail (retry). |
| **Keep-best** | Accepted WPs are locked; the chain never ships a worse version of them. |
| **Map** | The sprint goal + list of WP titles, given to the Runner up front for orientation. |
| **Retry budget** | Max gate failures allowed on one WP before the sprint escalates. |

## 3. Sprint definition schema (on disk: `sprint.json`)

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

Rules:
- WPs run in array order. A WP passes only when **every** DoD check passes.
- The Runner is spawned with `brief` + the list of WP **titles** (the Map). Each WP's
  `instructions` + `dod` are revealed by the Relay hook only when that WP is relayed.
- `sprint.json` is read fresh by the hook on every fire; editing it never requires touching the hook.

## 4. DoD check-type catalog (the Gate vocabulary)

Mechanical (free, deterministic — prefer these):

| `type` | Fields | Passes when |
|---|---|---|
| `file_exists` | `path` | the file exists |
| `grep` | `path`, `pattern` (ERE) | pattern is found in the file |
| `grep_absent` | `path`, `pattern` | pattern is NOT found |
| `min_count` | `path`, `pattern`, `min` | ≥ `min` matches of pattern in the file |
| `shell` | `cmd` | the command exits 0 (run at repo root) |
| `test` | `cmd` | alias of `shell`, semantically a test runner; exits 0 |

Semantic (costs a model call — use only for criteria a script can't decide):

| `type` | Fields | Passes when |
|---|---|---|
| `llm` | `criterion`, `rubric`, `model?` | the judge returns PASS under the rubric |

The Gate runs mechanical checks first; `llm` checks only if present. A WP's verdict = AND of all its checks.

### 4.1 Checklist gate (named controls — the compliance surface)

A WP may carry a `checklist` alongside (or instead of) `dod`: a list of **named controls**
(LGPD / guardrail / business-rule items), each logged individually. This is the auditable surface —
the gate doesn't just say "WP failed", it records *which control* failed and *how it was graded*.

```jsonc
"checklist": [
  { "id": "LGPD-1", "assert": "no raw email (PII) reaches the application logs",
    "cmd": "rm -f app.log; python3 service.py >/dev/null 2>&1; ! grep -q '@' app.log" },
  { "id": "PRIV-1", "assert": "privacy-notice wording is clear and adequate",
    "judge": "Is the user-facing privacy notice adequate?" }
]
```

- An item with **`cmd`** is **deterministic**: a real check is the oracle; it can block advancement
  and is logged `graded_by: deterministic`. This is the auditable, regulator-acceptable kind.
- An item with only **`judge`** is **semantic**: a real LLM call (`benchmark/judge.py`) evaluates the
  `judge` criterion against the item's `context` file(s) under an *independent-auditor* system prompt
  that **defaults to FAIL when the evidence is insufficient or uncertain** (a semantic gate that
  defaults to PASS is theatre). Backends auto-select: `stub` (deterministic, demos/CI) → `api`
  (Anthropic Messages API when `ANTHROPIC_API_KEY` is set; model via `RELAY_JUDGE_MODEL`). The verdict
  is **always logged `graded_by: judge:<backend>(non-independent)`** and is **advisory — it never
  silently blocks** unless the item explicitly sets `"blocking": true`, and even then it is logged as
  judge, never deterministic. A model's self-judgement is not an auditable control; surfacing it
  honestly (vs. pretending it's verified) is the whole point of `gate ≠ grader`. The `relay verify`
  CLI counts only deterministic controls toward PASS — judge items are reported, never counted.
- Every item's verdict (`pass` / `fail` / `advisory`) is appended to the ledger (§7) as a
  `checklist-item` entry, so the proof is per-control, not per-WP.

### 7. Verified-trace ledger (the proof)

Each gate event and each checklist-item verdict is appended to `.relay-state/ledger.jsonl` as a
**hash chain**: every line carries `prev` = the previous line's `h`, `seq` = its 0-based position,
and `h` = a MAC of the line without its own `h`. Any in-place edit, reorder, or middle-deletion
breaks the chain (or the `seq` run) at that point.

The MAC has two modes, and the guarantee differs — stated honestly, because "tamper-evident" is a
claim an auditor will test:

- **PLAIN** (default, `h = sha256(body)`): detects any in-place edit, reorder, or middle-deletion —
  the broken link shows. It is **not** unforgeable: a party with write access to the file can
  recompute every hash and rewrite the whole chain from genesis. Plain mode is integrity against
  *accident and lazy tampering*, not against a motivated producer. (So plain mode does **not** by
  itself let an auditor verify "without trusting the producer" — use keyed mode for that.)
- **KEYED** (`RELAY_LEDGER_KEY` set, `h = HMAC-SHA256(key, body)`): the MAC depends on a secret the
  producer does not hold, so it cannot edit, rewrite, append, or re-seal anything. **This** is the
  mode that yields a proof an auditor verifies offline without trusting the producer.

Tail-truncation (dropping trailing lines) leaves a valid prefix in *both* modes — only an
out-of-band anchor of the latest head rules it out. The verifier therefore also reports the entry
count and flags a trace that does not end in a terminal event (`sprint-complete` / `escalate`) as
possible truncation.

```
python3 benchmark/verify_ledger.py <run>/.relay-state/ledger.jsonl              # PLAIN  — exit 0 = intact, 1 = tampered
RELAY_LEDGER_KEY=… python3 benchmark/verify_ledger.py <run>/.relay-state/ledger.jsonl   # KEYED — same key the hook wrote with
```

In keyed mode this is what makes "the gate witnessed a real check pass" a *signed fact* rather than
a log we wrote.

The compliance-facing wrapper is **`bin/relay verify <run-dir>`** — it verifies the chain *and* reports
each named control's final verdict (and how it was graded) in one command, with `--json` for pipelines:

```
relay verify <run-dir>           # exit 0 = intact + all deterministic controls passed
                                 #      1 = chain TAMPERED (record untrustworthy — overrides green verdicts)
                                 #      2 = chain intact but a deterministic control FAILED
```

A TAMPERED chain forces a fail **even if every control reads green** — a "pass" sitting on a broken
chain is worthless. (A producer who re-seals the *entire* plain chain from genesis escapes this; that
is exactly what keyed mode, §7, exists to defeat.) Advisory (`judge`) controls are reported but never
affect the exit code.

## 5. The Relay loop (per stop)

```
on SubagentStop(payload):
    runner   = payload.agent_id
    i        = counter[runner]            # current WP index (persisted per agent_id)
    wp       = sprint.work_packages[i]
    verdict, gaps = run_gate(wp.dod, payload.last_assistant_message, payload.agent_transcript_path)

    if verdict == FAIL:
        retries[runner][i] += 1
        if retries[runner][i] > sprint.retry_budget:
            ESCALATE(wp, gaps)            # stop the chain, surface to human; keep last accepted WP
            allow_stop()
        else:
            block(reason = "WP <id> not done: " + gaps + " — fix and continue.")  # index unchanged
    else:  # PASS
        lock_best(wp)                     # keep-best: accepted, never regress
        if i + 1 < len(sprint.work_packages):
            counter[runner] = i + 1
            block(reason = "WP <id> accepted. Next — WP <next.id>: " + next.instructions)
        else:
            allow_stop()                  # sprint delivered
```

Loop-safety: bounded `retry_budget` per WP; `stop_hook_active` available as a secondary guard.

## 6. Worked example — the `slugify` sprint

`sprint.json`:

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

Run trace (note the fail → retry → pass on WP2):

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

## 7. Design decisions (canonical rationale)

- **Single continuous context (not isolated stations):** the Runner keeps full working memory,
  so WP3 builds on WP2's *live* code with no handoff to serialize. Right when WPs are coupled
  (the normal case in one codebase). Cost: context growth over long sprints → mitigate with compaction.
- **Gated advancement (not trusting):** "stopped" ≠ "done"; advance only on a Gate pass, so a
  premature stop bounces back instead of skipping a deliverable.
- **Forward-only / keep-best (anti-regression):** accepted WPs are locked; a later step can never
  ship a worse version. (Measured motivation: forced reflection/refactor passes regressed correct code.)
- **Gate at the boundary, never mid-reasoning:** hooks fire only when the Runner has stopped; the
  Gate adds latency at the exit and on failure *extends* work with a new turn — it never cuts a thought.
- **Map up front, detail progressively:** Runner sees the goal + WP titles up front (orientation),
  but each WP's details only when relayed (focus, no requirement to drop early).

## 8. What Relay is NOT

Not reflection (measured zero-gain/harmful on verifiable work). Not an isolated pipeline (one
Runner, continuous memory). Not a mid-reasoning interrupt (acts only at stop boundaries). Not a
replacement for tests (the Gate *uses* your verifier; Relay adds sequencing + enforcement).

## 9. Verified `SubagentStop` payload (Claude Code 2.1.x)

```json
{
  "session_id": "…", "transcript_path": "…/<session>.jsonl", "cwd": "…", "permission_mode": "…",
  "agent_id": "abf99b91daecefad2", "agent_type": "general-purpose", "effort": {"level": "high"},
  "hook_event_name": "SubagentStop", "stop_hook_active": false,
  "agent_transcript_path": "…/subagents/agent-<agent_id>.jsonl",
  "last_assistant_message": "…", "background_tasks": [], "session_crons": []
}
```

Verified properties: `decision:block` forces the Runner to continue; `agent_id` is stable per
Runner (the counter key); `stop_hook_active` flips true after a block (loop-guard);
`agent_transcript_path` exposes the Runner's full transcript to the Gate; settings-file hook
*removal* does not hot-reload mid-session, but the hook **script body** is read fresh each fire —
so Relay ships as a stable installed hook whose behavior is driven entirely by `sprint.json`.

## 10. Empirical grounding (why Relay is shaped this way)

Eight controlled A/B runs during design established: (1) frontier *and* cheap models implement
fully-specified single-prompt specs correctly first-pass — even 12 interacting business rules;
(2) forced reflection adds zero functional gain on verifiable work and once regressed correct
code to broken; (3) the real failure mode is *context*-scale (sprawling, long-horizon work), not
prompt-scale. Relay targets (3): reveal one WP at a time, refuse to leave until each is delivered.
