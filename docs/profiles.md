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
