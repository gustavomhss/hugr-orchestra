# FAQ & Design Rationale

Answers derived exclusively from the canonical Relay SPEC. Where empirical findings are cited,
they refer to the eight controlled A/B runs described in SPEC §10.

---

## Architecture

### Why doesn't Relay use reflection?

Because it was measured to provide zero benefit and caused an observable regression.

Eight controlled runs tested forcing extra "reflect and improve" passes on outputs that were
already correct. Results: zero functional gain, and in one case a refactor pass introduced an
undefined-variable bug — a correct solution regressed to broken. The conclusion in SPEC §10 is
unambiguous: **blanket reflection is negative expected value when a verifier already exists.**

Relay uses that verifier (the Gate) to enforce delivery; it does not second-guess a WP that has
already passed. The keep-best invariant makes this concrete: once a WP is accepted it is locked,
and no subsequent step can ship a worse version of it.

---

### Why one continuous Runner instead of isolated stations?

The coupled nature of work inside a sprint makes a shared context strictly better than serialized
handoffs.

When WPs are coupled — the common case inside one codebase — WP3 needs to see the live code and
decisions from WP2 directly, not a summary written after the fact. An isolated-stations design
(fresh agent per WP, explicit handoff contract) requires serializing that working memory into an
artifact. That artifact is either lossy or expensive to produce, and it creates a new class of
failure: the handoff itself.

A single continuous Runner holds full working memory across all WPs at no extra cost. The
trade-off is context growth over a long sprint; SPEC §7 explicitly names compaction as the
mitigation. The isolated-stations design is appropriate only when WPs are genuinely independent.

---

### Why gated advancement instead of trusting the Runner's "I'm done"?

Because "stopped" is not the same as "done."

Agents stop prematurely. A premature stop without a gate silently skips a deliverable. The Gate
exists precisely to distinguish "the Runner paused" from "the WP is actually complete." Relay
advances the WP index only on a Gate pass; a stop that fails the Gate bounces back to the same
WP with the specific gap identified. No deliverable can be skipped. SPEC §7: "stopped ≠ done;
advance only on a Gate pass."

---

### Does the Gate interrupt the Runner's reasoning?

No.

The Relay hook is a `SubagentStop` hook. It fires only after the Runner has already stopped —
after its reasoning turn has fully concluded. There is no mechanism by which the Gate can cut a
thought in progress. What the Gate adds is **latency at the exit boundary**: the check runs
between one turn ending and the next beginning.

On a Gate failure the hook returns `decision:block`, which injects the gap description and
causes the Runner to start a new turn. This is an *extension* of the work, not an interruption
of it. SPEC §7: "the Gate adds latency at the exit and on failure *extends* work with a new turn
— it never cuts a thought."

---

## Failure modes & edge cases

### What happens if a WP never passes its Gate?

The `retry_budget` field (default 3 in the reference schema) caps how many consecutive Gate
failures are allowed on a single WP. When that budget is exhausted:

1. The sprint **escalates** — execution is surfaced to a human for intervention.
2. The chain **stops without skipping** the failing WP.
3. The last WP that did pass remains locked under keep-best; the sprint state is consistent up to
   that point.

A WP is never silently promoted past a failing Gate regardless of how many retries were spent.
See SPEC §5 for the exact loop pseudocode.

---

### Does context grow unbounded on long sprints?

Yes, and this is an acknowledged cost, not a hidden one.

Because the Runner is a single continuous agent, its context accumulates across every WP in the
sprint. On a long sprint this can become expensive and can degrade model quality at the tail.
SPEC §7 names this explicitly as the cost of the single-context design and names **compaction**
as the mitigation. There is no magic: choose WP granularity and sprint length to keep total
context within a workable range, and apply compaction as needed.

---

## Troubleshooting

### The hook is not firing at all.

Check three things in order:

1. **Hook registration.** The Relay hook must be registered as a `SubagentStop` hook in
   `settings.json` (or `settings.local.json`). Verify the entry is present and the path to the
   hook script is correct.
2. **Hot-reload caveat.** Removing the hook from the settings file does **not** hot-reload
   mid-session — the existing session continues with the hooks active at session start. However,
   edits to the **script body** are read fresh on each fire. If you added the hook after the
   session started, start a new session.
3. **Runner vs. top-level session.** `SubagentStop` fires for sub-agent stops, not for the
   top-level session. Confirm the Runner was spawned as a sub-agent by the orchestrator.

---

### The wrong WP is being relayed (counter is off).

The Relay hook tracks the current WP index keyed by `agent_id`, which is stable per Runner for
the life of a session (SPEC §9). A counter mismatch typically has one of these causes:

- The same `sprint.json` was reused with a different Runner whose `agent_id` collided with a
  stale counter from a previous run. Clear persisted counters between sprint runs.
- `sprint.json` was edited mid-sprint in a way that renumbered the WP array. The hook reads
  `sprint.json` fresh on each fire, so index `i` now points at a different WP than it did before
  the edit. Avoid reordering WPs in a live sprint.

---

### The sprint is stuck in an infinite loop.

Two guards exist (SPEC §5 and §9):

1. **`retry_budget`** — the per-WP retry counter. Once exhausted the chain escalates and stops.
   Verify the budget is set to a finite positive integer in `sprint.json`.
2. **`stop_hook_active`** — the payload field that flips to `true` after a `decision:block` on
   the current stop. This is available as a secondary loop guard in the hook script; check that
   your hook respects it rather than issuing a second block unconditionally.

If both guards are in place and the sprint is still looping, the most likely cause is a Gate
check that is structurally unsatisfiable (e.g., a `grep` pointing at the wrong path, or a `shell`
command that always exits non-zero due to an environment issue). Verify each DoD check in
isolation before running the full sprint.

---

## Positioning

### How is Relay different from a generic workflow or pipeline tool?

Three differences are structural, not superficial:

1. **One continuous agent, not per-stage agents.** A generic pipeline spawns a fresh executor
   per stage. Relay uses one Runner whose working memory spans the entire sprint. Later WPs build
   on earlier ones without any serialization artifact.
2. **Stop-interception, not task scheduling.** Relay's mechanism is intercepting the Runner's
   natural stop signal (`SubagentStop`) and deciding whether to let it land. A pipeline tool
   hands off control between steps; Relay never hands off — it redirects.
3. **DoD gates as first-class primitives.** Relay's Gate evaluates an explicit, authored
   Definition of Done at every WP boundary. A generic pipeline may have no concept of a WP-level
   acceptance criterion; work completes when the stage function returns. Relay refuses to advance
   until the criterion is provably met.

The result: Relay is not a workflow engine that happens to call an LLM at each node. It is a
delivery enforcer built around how a single LLM agent actually works — stopping, being
redirected, and continuing in the same context.
