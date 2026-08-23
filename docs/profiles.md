# Profiles

Relay is the engine; the Protocol Enforcer state machine is a frozen reference whose **profiles** are
the corpus this engine runs (`docs/relay-v2.md`). A profile is a YAML file describing macros,
sub-states and the criteria each gate demands. `bin/relay-profile.py` compiles one into a sprint.

```sh
relay-profile.py profiles/planning.yaml -o profiles/planning.sprint.json
relay-profile.py profiles/planning.yaml -o profiles/planning.sprint.json --check   # is it stale?
```

---

## 1. What compilation changes, and what it does not

The state machine is **not re-authored**. Macro order, sub-state order and the criteria are read from
the profile and never restated — which is why a compiled sprint is regenerated rather than
maintained. Exactly one thing changes:

| | how a checklist gate passes |
|---|---|
| **Protocol Enforcer** | a key with the criterion's **name is present** in the evidence the executor submitted. Running the mechanical check is the executor's job, on its honour. |
| **Relay** | a **command exits zero** — run by the gate, recorded with its own verdict, oracle sha and origin on a hash-chained ledger. |

That difference is not theoretical. A real Protocol Enforcer session was measured advancing its
FRAMED gate on evidence whose values read `upstream_bound: "no"`, `inputs_classified: "I did not run
plan-check"`, and the literal string `"FAIL"` for seven criteria. Presence cannot reject *wrong*.

---

## 2. `criteria_map` — where the commands live

A criterion is a name. A control is a command. The mapping between them lives **in the profile**, not
in the compiler:

```yaml
criteria_map:
  default: "docs/edd/tools/plan-check --phase {macro} --criterion {criterion}"
  per_criterion:
    readback_emitted: "test -s plan/{macro}/readback.md"
  per_sub:
    dispatch.hostile_read:
      - id: hostile-read-approved
        assert: "the cold reviewer returned APPROVE"
        cmd: 'test "$(jq -r .verdict plan/verdict.json)" = APPROVE'
```

`{macro}`, `{sub}` and `{criterion}` are substituted. `per_criterion` beats `default`. `per_sub`
attaches controls to a sub-state that has no criteria at all — a fact the protocol states in prose
that no compiler can derive from machine-readable fields.

It lives in the profile for two reasons. Profile and mapping are then **one artifact that cannot fork
from itself**; and a `default` becomes an authoring choice on the record rather than something the
compiler invented.

### The clause that keeps a migration honest

**A criterion with no command compiles to nothing.** Not to a placeholder, not to `true`, not to a
`TODO`. The sub-state then has no control, and `relay-spec.py lint` reports it as `ungated`.

A silently-passing placeholder is worse than an admitted hole, because it reads as coverage. The
pressure while authoring a few hundred criteria is precisely to produce one, which is why the
compiler does not offer the option and the lint ships before it.

Every unmapped criterion is listed by name in the coverage report, so the gap is a work list rather
than a footnote.

---

## 3. Type mapping

| PE `type` | Relay `kind` |
|---|---|
| `execute` | `execute` |
| `checklist` | `gate` |
| `review` | `review` |
| `inject` | `inject` (carries `file` through verbatim) |
| `human_approval` | `human` |

An unmapped type is refused rather than defaulted. See `docs/authoring-sprints.md` §1.2 for what each
kind does at run time.

Sub-state ids become work package ids, so a **collision between two macros is refused** — retry
state, keep-best and drift detection all key on that id, so two states sharing one would share a
budget. `--qualify-ids` emits `<macro>.<sub>` instead.

`max_iterations` becomes `retry_budget`, and this is a **real semantic difference, not a smoothing**:
Protocol Enforcer applies the cap per macro, Relay applies it per work package, so a four-sub-state
macro gets a larger total budget here.

---

## 4. Coverage, counted by source

```
  16 sub-states -> work packages, 53 controls

  default:         52 controls
  per-criterion:   0 controls
  hand-mapped:     1 controls
  ungated:         11 sub-states (intake, bearings, terms, carve, size, waits, order,
                                  forecast, policy, packets, tripwires)
```

Each source is counted on its own line so a hand-written control is never passed off as derived from
the profile. **[MEASURED]** those are `planning.yaml`'s real numbers, and they match what the
original port experiment measured with entirely different code — which is what makes the figure a
measurement rather than a remembered one.

The eleven ungated states are every `execute` in the profile. Under Protocol Enforcer they also
advance on nothing, so this is an honest port of the current strength rather than a new hole — but
the claim v2 makes is that a state is *earned*, and authoring those eleven controls is the migration's
real work.

---

## 5. `--check` — the compiled artifact must not drift

A profile and its compiled sprint are two committed files, so they can fork. `--check` fails when the
sprint on disk differs from a fresh compile — the same discipline `bin/gen-doc-index.py --check`
already enforces.

It runs **from the test suite**, not from CI: this repo has no CI checks configured, and a check
nobody runs is a comment.


---

## 6. Shipped profiles

Migrated profiles live in `profiles/`, each next to its compiled `*.sprint.json`.

| profile | macros | sub-states | controls | ungated |
|---|---|---|---|---|
| `tdd_feature` | 2 | 5 | 7 | 0 |
| `planning` | 4 | 16 | 56 | 0 |
| `wp-execute` | 6 | 13 | 25 | 0 |
| `spec-decompose` | 5 | 15 | 36 | 0 |
| `research-v2` | 3 | 12 | 16 | 0 |
| `design` | 6 | 23 | 46 | 0 |

`tests/test_shipped_profiles.py` holds three properties for every file in that directory: the sprint
is not stale (`--check`), the lint reports no errors, and every work package names a declared macro.
It runs from the test suite because this repo has no CI configured, and a check nobody runs is a
comment.

### What migrating one actually costs

`tdd_feature` is the smallest real profile and it still took two authored controls. Compilation gave
four controls from its `criteria_map` and left three states ungated — one an `inject`, which is
correctly exempt, and two that genuinely had no oracle:

- **`implement.write`** owes a *change*. Its macro's gate measures whether the suite is green, which
  is a different question: a state that produced nothing at all reads there as a stale-green suite,
  located at the gate rather than at the state that did nothing. Its control measures the state's own
  outcome, so "the agent did not work" is localized where it happened.
- **`review.self_review`** owes a review that engages with the change. The gate's `review_done` only
  asks whether the artifact is non-empty, which a one-word file satisfies. So: a deterministic control
  on substance (a word count is measurable) **paired with** a judge that grades the review against the
  computed diff. The judge is the addition §5 permits, never a substitute.

That is the shape of the work for every profile: the compiler is cheap, and deciding what each state
*owes* is not.

### Template profiles

`tdd_feature`'s commands carry `${test_cmd}`, `${src_path}` and friends, because the profile is a
template and the oracle for "the suite is green" is project-specific. Those are `relay-spec.py`'s
existing placeholders — bind them with `relay-spec.py instantiate`. The compiler leaves any brace it
does not own untouched, so the two stages compose.


---

## 7. `planning` — and what "ungated" turned out to mean

The port measured this profile at 53 controls with **11 ungated sub-states**, every `execute`. The
migrated version is 56 controls and **zero**, and the difference is not that eleven controls were
invented.

Under Protocol Enforcer all 52 criteria sit on the four `checklist` gates, and the eleven states that
actually produce the artifacts carry none. But the profile's own sub-state descriptions say exactly
which fields each state emits — *"classify every input by provenance, declare authority and the two
decision rights, bind upstream, answer the campaign question"* is a list of five criteria by another
name. So the migration **partitions the criteria over the states that own them**, read off those
descriptions rather than invented:

```
frame     intake 5 · bearings 4 · terms 6          -> framed
carve     carve 10 · size 1                        -> carved
sequence  waits 5 · order 4 · forecast 2           -> sequenced
dispatch  policy 2 · packets 10 · hostile_read 2 · tripwires 1  -> frozen
```

The partition is exact — every criterion of a phase is owned by precisely one state — and the
compiler asserts that at migration time rather than trusting the arithmetic.

Each gate then keeps **one** phase-level control, `plan-check --phase X`, instead of restating the
criteria its own states already carry. That is a different assertion, not a duplicate one: the
criteria say each field is right, the phase check says the phase hangs together. And it means a
failure localizes to `carve.size, sizing_claims_recorded` rather than to "CARVE is wrong".

### The tools came too

`tools/edd/plan-check` and `plan-graph` are copied in from the frozen reference repo. They are the
oracles: a profile whose controls point outside the repo would let `--check` and the lint pass while
the chain fails at run time. Both are stdlib-only and read nothing but `plan/*.json` and the repo
under test, so the copy is self-contained — the protocol documents they cite as authority stay where
they are.

`tools/edd/plan-criterion` is new: it exits 0 iff **one** named criterion is PASS. `plan-check` grades
a whole phase, and a Relay control is finer than that. `SKIP` counts as a failure there, because
`plan-check` skips a criterion when the inputs it needs are missing, and a control that cannot be
evaluated has not been satisfied — the same rule the gate applies to a judge whose diff cannot be
computed.

### The cost, stated

Every control shells a full `plan-check`, which re-reads and re-validates the entire plan. With
keep-best re-running earlier controls on every later fire, that is quadratic in the number of
controls: the port already measured 53 declared controls becoming **389 executions**, and this is
slower still per execution.

That is a deliberate trade and `plan-criterion` says so in its own docstring: the alternative is a
phase-level control whose failure tells you "FRAME is wrong" and nothing else, which is exactly the
localization the state machine exists to provide.

The obvious mitigation — caching a phase report between controls — is **not** built, and the reason
is worth keeping: a cache inside a verifier is a control that can pass on stale evidence, which is
the D1 failure class in a new costume. If one is ever added it must key on the *content* of the plan
directory, never on a timestamp.

### Run 1 — it runs, and the record is real

Against the frozen `plan/` the port used, driven by `relay-gate eval` with no agent and no model:

```
gate evaluations : 16          one per sub-state, in order, chain COMPLETE
control verdicts : 56 pass / 0 fail
chain integrity  : INTACT
relay verify     : PASS — deterministic controls verified, auditable
wall clock       : 381s
```

### Run 2 — the failure lands on the state, not the phase

The protocol is explicit: *"A FIXES-NEEDED verdict loops DISPATCH; it does not pass."* Copy the plan,
flip `verdict.json` from `APPROVE`, change nothing else:

```
advance    packets
gate-fail  hostile_read     hostile_read_approved
gate-fail  hostile_read     hostile_read_approved
gate-fail  hostile_read     hostile_read_approved
escalate   hostile_read     hostile_read_approved

RESULT: CONTROL FAIL — a real control did not pass: hostile_read_approved.
```

Thirteen states passed on their own merits and the chain never reaches `frozen`, so the plan is never
frozen. Note *where* it stopped: at the state that owns the criterion, naming the criterion. Under
the profile as written, `hostile_read_approved` sits on the `frozen` gate, so the same defect would
have surfaced one state later as "DISPATCH is wrong". That difference is the entire argument for
partitioning.


---

## 8. `wp-execute` — and why it is NOT partitioned

`planning` moves its criteria off the gates and onto the states that own them. `wp-execute` does not,
and the difference is not inconsistency.

Partitioning works for `planning` because `plan-check --phase X` exists: after the criteria move, each
gate still has a real, *distinct* control — the phase hangs together. `wp-execute` has no such
verifier. Move its criteria off the gates and the gates have nothing left, and the only way back is a
control that re-runs what its own states just ran, under a second id. That is duplication wearing a
localization costume.

So the criteria stay where the profile put them, and the migration adds a control to each of the
seven states that produce something and had none — measuring what **that state emitted**, which is a
different question from what its gate certifies:

| state | owes | its gate certifies |
|---|---|---|
| `green.implement` | the source changed | the suite is green |
| `red.write_failing_tests` | the test file changed | the tests were written first, and genuinely failed |
| `gate.cold_review` | a review of at least 40 words, plus a judge against the computed diff | the full suite and lints |

A state that produced nothing would otherwise surface at its gate as a *stale-green suite*, located
one state late. The rule is the same in both profiles — every state is earned — and the shape follows
from whether a phase-level oracle exists.

`wp-execute` also reuses the sub-state id `gate` in all six macros, so it needs `--qualify-ids`.


---

## 9. `spec-decompose` — and a second verifier

This profile builds four linked registries — invariants, requirements, spec clauses, scenarios, work
packages — and almost every one of its sixteen criteria is a **traceability** question: does each id
exist, does each item cite a source that exists, is every upstream item covered downstream. Those are
computable, and computing them is the whole difference between this and the presence-of-a-key gate it
replaces.

So it gets its own checker, `tools/spec/spec-check`, in the same shape as `plan-check`: `--phase`,
`--json`, a `[{criterion, status, evidence}]` report. And because a phase-level verifier now exists,
the criteria **partition** onto the state that produces them — `register` emits the invariants the
`invariants` gate grades — with each gate keeping one phase-level control. Same shape as `planning`,
for the same reason.

`tools/edd/plan-criterion` is generalized to `tools/criterion`: any checker with that interface gets
per-criterion Relay controls, so a protocol earns them by shipping a checker rather than a shim.

### What the checker will not judge

Whether an invariant is *well chosen*, whether a scenario is *meaningful*, whether a package is *the
right cut*. Those are judgment, and the protocol reserves them for the cold review — which every
macro carries, and which is graded by three controls: the verdict says APPROVE, the review is long
enough to have engaged, and a judge checks it against the computed diff. The first two are the
oracle; the judge is the addition.

### It discriminates, and there is a test that says so

A checker that only fails is useless and one that only passes is worse. `tests/test_spec_check.py`
holds one known-good spec, then breaks it **one field at a time** and asserts each criterion catches
its own mutation — sixteen mutations for sixteen criteria, plus a test that every declared criterion
has a mutation behind it. Coverage says the criterion ran; mutation says it would have noticed.

### Both runs

```
15 gate evaluations, chain COMPLETE, 36/36 controls, relay verify PASS — auditable
```

Then one field changed — `REQ-1` placed in two work packages, making the coverage a *covering*
instead of a *partition*:

```
advance    goldens.gate
gate-fail  work_packages.decompose      coverage_matrix_closed   (x3)
escalate   work_packages.decompose      coverage_matrix_closed

RESULT: CONTROL FAIL — coverage_matrix_closed.
```

Twelve states passed on their own merits and the chain never reached `work_packages.gate`. In the
profile as written that criterion sits on the gate, so the same defect would have surfaced two states
later.


---

## 10. `research-v2` — enforcing the profile's own rule

This profile's `analyze` macro carries its doctrine in its own description: *"cada achado provado por
comando real"* — every finding proven by a real command. Under Protocol Enforcer that was a sentence.
Here it is a control.

`tools/research/replay-evidence` **re-runs every finding's evidence command** and requires it to
still hold. A finding is `{claim, evidence_cmd, evidence_output}`, and it holds when the command
still exits 0 *and its output still matches what was recorded*.

The second half is the half that matters. A command that exits 0 while producing different output
means the claim was true when it was written and is not true now — which is precisely the state a
stale research report hides, and exactly what exit status alone cannot see:

```
FAIL core.py defines exactly two module-level functions — output drifted — recorded '2', now '3'
```

`evidence_output: ""` checks exit status only. That is legitimate, and the report names how many
findings were checked that way, so the weaker check cannot become the default by an omission nobody
notices.

`tools/research/cite-check` does the other half. *"Conclusions are clear"* is judgment and this does
not claim to measure it; what it measures is that **every conclusion cites a finding that exists**.
A conclusion citing nothing is not a conclusion, it is an assertion — and a citation must be an
explicit `[F-n]` or a verbatim span of the claim, because a paraphrase is where a conclusion drifts
from what its evidence supports.

### The runs

```
12 gate evaluations, chain COMPLETE, 16/16 controls, relay verify PASS — auditable
```

Then a third function was added to the code the report describes — the report itself untouched:

```
gate-fail  analyze.checklist   findings_documented   (x5)
escalate   analyze.checklist   findings_documented
```

The report still said two. Nothing about it changed, and the gate still caught it, because the
control does not read the report — it re-runs the evidence.

### One thing the source profile was missing

`report.inject` declared no payload at all. The lint calls that an error and it is: a state that
injects nothing delivers nothing, and the agent is then judged against context it was never handed.
The migrated profile gives it one rather than leaving it to fail at run time.


---

## 11. `design` — the last one, and the softest

23 sub-states, 31 criteria, and criteria named `three_doors`, `obituary`, `no_flinching`. Nothing in
the profile says what any state produces: unlike `planning` and `spec-decompose`, this one carries no
sub-state descriptions at all, so the profile alone could not say who owns which criterion.

The protocol could. `docs/edd/design-protocol.md` has a **state-contracts table** naming exactly what
each state freezes, so the partition here is read from the protocol rather than inferred from the
profile — the same rule as everywhere else, applied to a different source because the usual one was
silent. Guessing it from the criterion names would have been the mistake the `genesis-dependency`
lineage already taught.

Better still, the protocol names its own verify hooks and says who runs them: *"Verify hooks (run by
the harness, not claimed by the agent): `clean-hands-lint` over the question log; `intake-reconcile`
over the map (100% provenance, quote-is-substring-of-utterance, unique ids, valid kinds, last two
rounds recorded)"*, and at the end *"`design-reconcile` — no entry left ASSUMED/open, all trace
fields present, ids unique, manifest complete"*. `tools/design/design-check` is those hooks.

### The split is the protocol's, and it says so out loud

> *"The lint is a floor, not a ceiling: pattern checks catch overt leading, stacked questions,
> hypotheticals, and solution verbs; subtle steering is caught downstream — by the MIRROR (the owner
> corrects a distorted image) and by cold review. **Claiming more for the lint than it does would be
> exactly the false comfort this method exists to kill.**"*

So the checker computes what is computable and stops. The three questions it cannot answer — are
these doors genuinely different *approaches*; would each scene actually fail; is that obituary soft —
are the protocol's own `review` states, graded by a verdict plus a judge against the diff.

### The one control worth naming on its own

**quote-is-substring-of-utterance.** Every fact in the intent map quotes the owner, and that quote
must appear *literally* in a stored utterance. It is the anti-fabrication control of the entire
protocol, and it is exact.

Two more that are worth the same attention:

- **`kill_criteria_sealed_before_probes`** compares timestamps. A kill criterion written *after* its
  probe ran is a result narrated into a threshold, and the ordering is the only thing that can tell
  the difference.
- **`skeleton_walks_end_to_end`** checks that each vertebra consumes what the previous one produced.
  A skeleton that assumes a step nobody wrote fails structurally rather than on someone noticing.

### The runs

```
23 gate evaluations, chain COMPLETE, 46/46 controls, relay verify PASS — auditable
```

Then **one quote** was changed — a plausible paraphrase of what the owner said, attributed to them,
nothing else touched:

```
advance    intake.unbroken_story
gate-fail  intake.deep_vein     provenance_complete   (x5)
escalate   intake.deep_vein     provenance_complete

FAIL provenance_complete — quote not in the cited utterance: ['M-1']
```

A design document that reads perfectly, with one sentence its owner never said, stops at the second
state and names the entry.

`tests/test_design_check.py` breaks the known-good design one field at a time: **31 mutations for 31
criteria**, plus a test that every declared criterion has one behind it.


---

## 12. `tdd_feature` — the first live agent run, and the two defects it found

Every profile above was driven by a harness: the sprint was real, the gate was real, the artifacts
were written to satisfy it. `tdd_feature` is the first one driven by a **real Claude subagent** given
the task and nothing else — `add a token-bucket rate limiter to the gateway`, in a small git repo
with an existing `src/gateway.py` and one passing test. The agent chose what to write. Two defects
turned up in the first four minutes, and neither was reachable from a test in this repo.

### Defect 1 — the profile could not see files git does not track yet

The agent did the ordinary TDD thing: it put its eleven new tests in a **new file**,
`tests/test_rate_limit.py`. The gate answered:

```
gate-fail  implement.checklist   failing: ["tests_written"]
```

`tests_written` was `git diff --name-only ${base_ref} -- ${test_path} | grep -q .`, and `git diff`
against a base ref shows **tracked files only**. This is the V5 lesson — the one that produced
`relay_compute_diff`'s `--no-index` append — never applied to the compiled per-criterion controls.
Worse, it was inconsistent *within one profile*: `write-produced-a-change`, hand-mapped on the state
above, had carried the untracked fallback all along, and `wp-execute` carried it on both of its
equivalents. The same profile answered the same question two different ways depending on which
control asked it, and the stricter answer was the wrong one.

The fix is the form the other three already used. `tests/test_shipped_profiles.py` now asserts it
over **every** control in **every** shipped profile that diffs against a base ref: a change that
exists only as an untracked file must still count as a change.

### Defect 2 — the judge had never actually run

`review-engages-with-the-diff` is the campaign's only blocking discursive control, and every agent
run before this one stubbed it (`RELAY_JUDGE_STUB=pass`). Pointing it at a live model — through a
local Messages-API-compatible gateway, via the new `RELAY_JUDGE_BASE_URL` — surfaced three failures
in a row, and **every one produced a FAIL that a reader could not distinguish from a judgment about
the artifact**:

| what happened | what the ledger said |
|---|---|
| the endpoint streamed by default, so the body parsed as no verdict | `fail` |
| a reasoning model spent the whole 512-token budget thinking and returned an **empty** content list with `stop_reason: max_tokens` | `fail` |
| asked to end with `VERDICT: PASS`, the same model emitted the line sometimes and not others for the **same** artifact and criterion | `fail`, then `pass`, then `fail` |

The third is the one worth staring at: the control's verdict was moving with the model's mood rather
than with the artifact. The fix is not a firmer prompt. The verdict now comes from a **forced tool
call** (`tool_choice`), `max_tokens` defaults to 8192 (a cap, not a spend), `stream: false` is
explicit — and a judge that never answered is tagged **`(no-verdict)`**, so the chain records *the
check could not run* rather than *the check disagreed*. That is the same admission
`judge:unavailable(no-diff)` already makes on the other side of the gate.

The backend tag now carries the **model**: `judge:llm:claude-mistral-medium(non-independent)`.
`judge:llm` on a ledger says an LLM said so; which LLM is the first thing a reader asks, and the
ledger is the only place that can still answer a year later.

### It discriminates — measured on two independent live models

The same criterion, the same diff, two artifacts: the agent's actual 760-word review of the change,
and a 84-word review of generic praise that would fit any change at all.

```
claude-gemini-3-flash    generic-review.md   fail      REVIEW.md   pass
claude-mistral-medium    generic-review.md   fail      REVIEW.md   pass
```

### The run

```
5 gate evaluations, chain COMPLETE, 6/6 deterministic controls, 1 advisory (live judge)
relay verify PASS — auditable
```

Ledger: `docs/fixtures/tdd-feature-live.ledger.jsonl`. The chain from before the fix —
`tests_written` failing on a repo that had just gained eleven tests — is kept beside it as
`tdd-feature-untracked-defect.ledger.jsonl`.

### One thing this run does not prove

The loop was driven by the gate CLI, not by the `SubagentStop` hook: a real agent produced the
artifacts and the real gate judged them, but nothing **blocked** the agent from stopping. Hook-side
enforcement is proven separately and is profile-independent — see the V12 walking skeleton and the
fan-out ledgers in the same directory.


---

## 13. `wp-execute` — live, and the defect that made five profiles judge blind

Thirteen states, six macros, driven by a **real Claude subagent per state** on a real work package:
add exponential-backoff retry to an HTTP client. Each state got only its own instructions — bind the
scope, write the failing tests, implement, refactor-or-skip, verify, cold-review, seal — and the gate
decided whether it had earned the next one.

The protocol did what it is for. `bind.json` declared five scenarios with the exact test names the
RED state would have to write, and `tests_map_to_scenarios` checks the names actually appear. The
refactor state fired its triggers and found a real one — `retry()` defaulted `retryable=Exception`,
so any caller omitting it would replay a deterministic `TypeError` through the whole budget with
backoff sleeps between attempts — refactored it to a required keyword-only argument, and rejected the
other four triggers with reasons rather than waving them off. The cold reviewer, which wrote none of
it, mutation-probed the implementation three ways before approving, and its seal recorded
`assurance_level: "high-within-contract, low-outside-contract"` with four things the tests do **not**
cover named underneath.

```
13 gate evaluations, chain COMPLETE, 24/24 deterministic controls, 1 advisory (live judge)
relay verify PASS — auditable
```

### The defect: the judge was never handed the review

`review-engages-with-the-diff` asks *"does this review describe the change in the diff?"*. The
control declared `diff: true` and **no `context`** — so the judge received the diff and nothing else.
It was being asked about a review it had never seen.

The tell is not that it answered wrong. It is that the answer was **arbitrary**. With the review
withheld, on the same criterion:

```
wp-execute diff, no review    claude-mistral-medium  fail    claude-gemini-3-flash  fail
tdd_feature diff, no review   claude-mistral-medium  PASS  ← the run shipped in §12
```

The same blindness produced a pass in one run and a failure in another. A control whose verdict moves
with nothing is not a control, and the §12 fixture had to be regenerated: the advisory pass recorded
there was reached without the artifact.

With the review supplied, both models agree in both directions — the real 845-word review passes, and
the same models fail it when it is withheld.

**Five of the six shipped profiles had it**: `tdd_feature`, `wp-execute`, `spec-decompose`,
`research-v2` and `design`, ten judge controls in total. All ten now name their artifact.

### Two things had to change for that fix to be possible

A context path is written once in a profile and only the run knows where `${wp_dir}` points, so the
gate now **expands `${...}` in context paths** — by substitution, never through `eval`. A `cmd` goes
through the shell by construction, because it is a command. A path is data, and expanding it through
the shell would turn every profile that writes `${wp_dir}` into an execution site;
`tests/test_judge_context.py` fires a `$(touch …)` canary through a context path and asserts nothing
ran. An unset parameter is left verbatim rather than collapsing to an empty string, so a missing
parameter surfaces as a missing file instead of a path that quietly resolves to the workdir root.

The rule itself is now a test: **a judge control on a `review` state must declare `context`.** It runs
against every shipped profile, which is how the other four were found — the live run only exposed
the one it happened to walk through.


---

## 14. `spec-decompose` — live, and the third way a judge fails for the wrong reason

Fifteen states, five macros, a **real Claude subagent per state**, decomposing a frozen intent: an
offline license check for a desktop app, with five constraints the owner had already agreed to. The
agent never saw the invariants it would later have to satisfy — each state got its own instructions
and the artifacts the previous states had produced.

```
15 gate evaluations, chain COMPLETE, 31/31 deterministic controls, 5 advisory (live judge)
relay verify PASS — auditable
```

### What the protocol caught, which is the point of running it

The cold review is a separate agent that wrote none of the artifact, and **it went five rounds on the
spec before approving.** Not five rounds of polish — five rounds of finding something real:

| round | what the reviewer refused |
|---|---|
| 1 | `effective_time` returned "license expired" when the clock store was unreadable — a fifth cause smuggled into a closed four-variant enum, derived from no requirement |
| 2 | the repair saturated effective time to the maximum instant instead: **papered over**, because nothing observed that value, and a freshly issued license then also reads as expired — a remedy message that is actionable in form and false in substance |
| 3 | the bootstrap moved upstream into new requirements, but the remedy path still said a restored store is "initialised from the clock", which is the exact rollback the new requirement forbids |
| 4 | the store was still **app-writable**: edit it to epoch, set the clock back, restart. The two closed routes were delete and corrupt; the cheapest one was untouched, and an edge case still claimed the falsifier was unreachable |
| 5 | APPROVE — the store moved behind a privilege boundary, with the conceded threat model stated rather than overclaimed |

Round 2 is the one worth keeping. A reviewer that accepts a repair because a repair was made is
decoration; this one read the repair against the requirement it was supposed to discharge and said
so. Rounds 3 and 4 each found a defect the previous round's fix introduced.

The requirements phase behaved the same way: the reviewer found a stale cross-reference left by a
renumbering (`REQ-12` citing `REQ-7` for a signature rule) and an enumerated refusal cause that no
requirement could ever produce.

### The defect: a phase review was graded against every phase's diff

`requirements-review-engages-with-the-diff` failed. Ten consecutive judgments across two models, all
FAIL — and they were **right**. The criterion fails a review that *"omits a material part of the
diff"*, and by the second phase the cumulative diff already carried the invariants register, the
requirements register and the first review. The requirements review described the requirements. It
had "omitted" three artifacts it was never about.

`paths` — the scope that has been part of the judge's oracle since V3 — is the fix, and no profile
was using it. Each phase review now scopes its diff to the artifact it reviews. The rule is a test:
**a profile with more than one review state must scope every `diff: true` judge control**, which is
how `research-v2` and `design` were fixed without a live run of their own. A single-review profile is
exempt — there is nothing else in the diff for it to omit.

Two supporting changes. `paths` expands `${...}` like `context` does — and the oracle and the ledger
both record it **unexpanded**, because `${spec_dir}/x.json` is the same question in every run and
hashing `/tmp/run-4711/x.json` would make two identical runs read as oracle drift.

### The other silent failure: the artifact was being cut

The same run met a 24 000-character diff against a 16 000-character context cap. The judge was shown
two thirds of the change it was asked about and failed the review for claims the visible part did not
support. Third time the same shape: **a FAIL that came from transport, indistinguishable from a
judgment.**

A cut is now announced twice — inside the prompt, so the model can say the evidence is incomplete,
and in the backend tag, `judge:llm:<model>(truncated:<file>)`, so a verdict on a partial artifact can
never be read as a verdict on the artifact. The default cap is 120 000 characters: `max_tokens` and a
context cap are both ceilings, not spends, and a conservative one turned out to be the dangerous
choice.

### And one control that was crying wolf

`requirements_atomic` flagged any `and` or `;` anywhere in a requirement. On the agent's 18
requirements it fired four times and was **right twice** — it also flagged
*"(including expiry timestamp and customer identity)"* and *"no private signing key and no other
secret value"*, noun lists inside one obligation. A check wrong half the time teaches its reader to
override it.

It now flags a conjunction only where the conjunct after it opens a **second obligation** — carrying
its own modal, or starting with something other than a closed list of function words. Parenthetical
asides are stripped first. The same fix exposed that `\b(?:and|;)\b` could never match a semicolon —
`;` is not a word character — so every semicolon-joined pair of obligations had passed silently, and
the agent's register had one.

The limit is stated rather than hidden: swap the conjunction for a comma and two obligations pass.
Atomicity is not decidable from prose, which is why `requirements.cold_review` carries the predicate
as judgment and this catches the careless case, not the determined one.

### One thing this run did not do

The requirements register was amended by a **later** state — the spec phase added REQ-22 through
REQ-32 — after `requirements.gate` had already passed. Nothing on the chain notices: `SPRINT
DIVERGED` compares the ledger against the *sprint*, not against the artifacts a state was graded on.
An upstream verdict can therefore describe an artifact that no longer exists in that form. That is
recorded here, not fixed.
