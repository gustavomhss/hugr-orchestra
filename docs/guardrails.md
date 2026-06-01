# Org guardrail policy bundles

## 1. What this is, and why it's a separate layer

The Relay arm hook (`bin/relay-arm-hook.sh`) + the gate core (`lib/relay-gate.sh`) are the
**enforcement** mechanism: they evaluate each Work Package's `checklist` of named controls and
append every verdict to the tamper-evident ledger (SPEC §4.1, §7). What they deliberately do *not*
decide is **which** controls every WP must carry. That is **policy** — and policy belongs to the
org, not to the agent that authored the sprint.

A **policy bundle** is a small JSON file: a list of checklist controls. `bin/relay-policy.py apply`
merges one or more bundles into a sprint by **prepending** their controls to *every* work package's
checklist. The result is a plain `sprint.json`, consumed **unchanged** by `bin/relay-arm-hook.sh` /
`bin/relay-gate` — there is no new runtime, no new schema, nothing for the gate to learn. The policy
layer is pure pre-processing on top of the mechanism that already enforces and audits.

The payoff: an org-mandated Definition of Done ("no debug prints", "no test was loosened", "coverage
≥ floor") is enforced on **every** WP, not just the ones the sprint author remembered to add it to —
and each injected control is **stamped** with the bundle it came from, so an auditor reading the
ledger can tell an org-mandated control from a WP-specific one.

---

## 2. A bundle is exactly a list of controls

A bundle is a JSON list (or `{ "controls": [ ... ] }`) of controls in the **exact** shape the gate
consumes (SPEC §4.1):

```jsonc
[
  { "id": "ORG-NO-DEBUG-PRINTS",
    "assert": "no leftover debug print statements in tracked source",
    "cmd": "git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 1; ! git grep -nE 'console\\.log\\(|print\\(|dbg!\\(' -- ':(exclude)*test*' | grep -q ." },

  { "id": "ORG-PRIVACY-NOTICE",
    "assert": "privacy notice wording is adequate",
    "judge": "Is the user-facing privacy notice adequate?", "blocking": false }
]
```

- A control with **`cmd`** is **deterministic**: the command is the oracle. It runs `cd`'d into the
  WP's workdir; **exit 0 = pass**, non-zero = fail. This is the auditable, regulator-acceptable kind —
  prefer it. The idiom `! <detector> | grep -q .` means *"fail if the detector finds anything"*.
  - **Trust boundary — a bundle is privileged input.** A `cmd` string is **executed verbatim by the
    gate via `eval`** on the gate host; it is *not* sandboxed by this tool. A bundle is therefore
    equivalent to shell access on the gate host: only load bundles from a **trusted source** (an org
    admin), never an arbitrary path supplied by the sprint author. `apply` validates shape (a `cmd`
    must be a single string), but it does **not** and cannot make an arbitrary `cmd` safe — do not
    rely on any "inertness" guarantee. Write `cmd`s with no interpolated untrusted input.
- A control with only **`judge`** is **semantic**: an LLM evaluates the criterion. It is **advisory**
  (never silently blocks) unless it sets `"blocking": true`, and is always logged as a judge verdict
  (never as deterministic). See SPEC §4.1 — `relay verify` counts only deterministic controls toward
  PASS.

Every control **must** carry a `cmd` or a `judge`; `apply` rejects a bundle with a control that has
neither (a control the gate cannot evaluate is not a control).

---

## 3. Using it

```sh
# List the bundles that ship under policies/, with their control counts.
bin/relay-policy.py list

# Prepend one or more bundles to every WP of a sprint, writing a merged sprint.
bin/relay-policy.py apply \
    --bundle policies/no-debug-prints.json \
    --bundle policies/no-loosened-tests.json \
    --sprint sprint.json -o sprint.guarded.json

# The merged sprint is an ordinary sprint — hand it to the arm hook / gate as usual.
bin/relay-gate eval --sprint sprint.guarded.json --workdir . --state .relay-state
```

### Merge semantics

- **Prepend to every WP.** The union of the named bundles' controls is placed at the **front** of
  each WP's `checklist`, ahead of any WP-specific controls. A WP with no checklist gets one.
- **Dedupe by `id`, org wins.** If a WP already has a control with the same `id` as an org control,
  the org control replaces it. Across multiple `--bundle`s, the **first** bundle to claim an `id`
  wins (later duplicates are dropped).
- **Stamp `policy`.** Every injected control gains a `policy` field = the bundle's filename stem, so
  the ledger/audit can distinguish org-mandated controls from WP-specific ones.

---

## 4. The starter bundles

| Bundle | Control | Catches |
|---|---|---|
| `no-debug-prints.json` | `ORG-NO-DEBUG-PRINTS` | leftover `console.log(` / `print(` / `dbg!(` in tracked source (test/spec/markdown excluded) |
| `no-loosened-tests.json` | `ORG-NO-LOOSENED-TESTS` | a test disabled/loosened: `.skip(` / `.only(` / `xfail` / `@pytest.mark.skip` / `# type: ignore` / `@unittest.skip` |
| `coverage-floor.json` | `ORG-COVERAGE-FLOOR` | test coverage below the org floor |

All three are deterministic (`cmd`) checks that run against the WP's workdir.

**`coverage-floor` is parametric.** The threshold lives at the front of the `cmd` as
`RELAY_COV_MIN=80` — edit that number to set your floor. The control runs `pytest --cov` and asserts
the reported total is ≥ the floor; it **fails closed** when coverage tooling (`pytest-cov`) is absent
or the run errors, because insufficient evidence of coverage is not a pass. Adapt the command to your
project's coverage runner if it isn't `pytest`.

All three **fail closed** when their precondition is absent. The two `git grep` controls guard with
`git rev-parse --is-inside-work-tree || exit 1`, so a non-git (or git-less) workdir is a **FAIL**, not
a silent pass — a control that scanned nothing must never land on the ledger as `pass`.

These are starting points — copy one, change the `id`/`assert`/`cmd`, and you have your own org
bundle. Keep `cmd`s POSIX-sh and free of interpolated untrusted input, and make every detector
**fail closed** when its tooling/precondition is missing. Remember a `cmd` is run verbatim under the
gate's `eval` (see §2) — a bundle is trusted, privileged input.
