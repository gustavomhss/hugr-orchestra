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
