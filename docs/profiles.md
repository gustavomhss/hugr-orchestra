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
