# FINDING — a review verdict the executor writes is self-graded evidence

**Measured 2026-08-24, on the agent-driven `research-v2` run** (52 sources, 41 findings, 8
conclusions, 199 minutes). Status: **confirmed, partially fixed** — `research-v2` is fixed, nine
other review controls across three profiles still carry the defect.

## The doctrine clause it violates

`docs/enforcement-model.md` §4:

> The agent's claims may **never** advance the chain.

And the sentence the whole Relay migration was built on (`docs/relay-vs-mcp`, and
[[relay-vs-mcp-evidence]]): the MCP state machine's checklist gate advanced when a key with the
criterion's name was **present** in the evidence the executor submitted, and a real session was
measured advancing a gate on evidence whose values read `FAIL`. Relay's answer was that a gate
passes when a **command exits zero, run by the gate itself**.

## The defect

Eleven shipped review controls are of this shape:

```json
{"id": "synthesis-review-verdict",
 "cmd": "test \"$(jq -r .verdict ${research_dir}/review-synthesis.json)\" = APPROVE"}
```

The command *is* run by the gate and it *does* exit zero or one. But the file it reads is written by
the executor. The gate is grading the executor's own claim about itself, with a `jq` in between.
That is presence-gating with extra steps: it is the MCP defect, re-introduced in a costume that
satisfies the letter of the rule Relay replaced it with.

## What it cost, measured

The executor knows the gate will demand `APPROVE`. So it pre-satisfies the control *before* firing
the gate — it spawns a reviewer, gets `FIXES-NEEDED`, revises, spawns another, and repeats until one
approves. On the measured run, `synthesis.cold_review`:

| | |
|---|---|
| reviewer clones spawned | **21** |
| rounds that changed the artifact | **21 of 21** — none spun in place |
| `conclusions.json` growth | **11,365 → 35,664 chars (3.1×)** |
| the one round that SHRANK it (35,664 → 33,261) | the round that returned **APPROVE** |
| tokens | **11.16M** |
| wall clock | **~2h of the run's 199 min** |
| **rows on the ledger** | **3 checklist-items, all `pass`, one gate fire** |

It is a justification **ratchet**, not an oscillation: each reviewer demands more justification, the
artifact grows, and the next reviewer has more surface to attack.

**The last row is the serious one.** An auditor reading that ledger sees a cold review that passed
clean on the first fire. Twenty-one reviewers, eleven million tokens and two hours are invisible,
because the loop ran on the executor's side of the gate. `retry_budget: 5` does not bound it either —
that budget counts gate re-fires, and the gate never re-fired.

## The fix

Move the reviewer from the executor's side of the gate to the gate's side. A `judge` control is run
by the gate, votes are tallied inside `benchmark/judge.py` (`RELAY_JUDGE_VOTES`), and the verdict
lands on the ledger with its own oracle sha and a `(votes:n/m)` tag. The executor cannot re-run it
and cannot manufacture its input.

Three consequences, all of them the point:

- **the loop is bounded** — a failing gate-side judge is a gate fire, so `retry_budget` finally
  applies to review rounds;
- **every round is on the ledger** — one row per fire per control, instead of one row for
  twenty-one rounds;
- **fan-out is fixed-N in one round** — `RELAY_JUDGE_VOTES=3` is three independent reviewers with a
  majority verdict, not an unbounded search for one that says yes.

What is deliberately KEPT is the executor's written review. The `*-is-substantive` control and the
`*-engages-with-the-diff` judge stay: the executor must still think in writing, and that writing is
still graded against the diff. What is removed is only the executor's power to declare the outcome.

## Status

| profile | control | status |
|---|---|---|
| `research-v2` | `evidence-review-verdict` | **removed**, replaced by `evidence-withstands-cold-review` (gate-side, blocking) |
| `research-v2` | `synthesis-review-verdict` | **removed**, replaced by `conclusions-withstand-cold-review` (gate-side, blocking) |
| `design` | `distinctness-verdict`, `dress_rehearsal-verdict`, `no_flinching-verdict` | open |
| `spec-decompose` | `invariants-`, `requirements-`, `spec-`, `goldens-`, `work_packages-review-verdict` | open |
| `planning` | `hostile_read_approved` | open — same shape, different name |

`tdd_feature` and `wp-execute` were already clean: their review states ship no verdict control at
all, only `*-is-substantive` and `*-engages-with-the-diff`.

## Still not fixed by this

The **artifact hash is not recorded per gate fire.** The ratchet above was only reconstructable
because the dead reviewer clones' transcripts happened to still be on disk. A judge control records
its `scope` (the raw path list) but not a digest of what was at those paths when it graded, so two
fires of the same control over a file that tripled in size are indistinguishable on the chain.
Bounding the loop makes the growth cheaper; recording the digest is what would make it **visible**.
