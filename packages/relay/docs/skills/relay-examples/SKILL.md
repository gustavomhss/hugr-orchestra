---
name: relay-examples
description: Use when running Relay offline demonstrations or the fleet-chain example and checking what their scripted gate and trace evidence establishes.
---

# Relay examples and offline demonstrations

Audience: agents. Status: current.

## Trigger

Use when reproducing the checklist feedback loop without a model or checking demonstration claims.

## Read first

- [Fleet example](../../../examples/fleet-chain/run_example.py) and [example reference](../../../examples/fleet-chain/README.md).
- [Arithmetic demo](../../../demo/relay_demo.sh), [checklist demo](../../../demo/compliance_demo.sh).
- [Completion regression](../../../tests/test_example_completion.py), [regression coverage](../../../tests/test_relay.py), [arm hook](../../../bin/relay-arm-hook.sh), [benchmark hook](../../../benchmark/relay_hook.sh).
- [Integration](../relay-integration/SKILL.md) and [telemetry](../relay-telemetry/SKILL.md).

## Ownership

- Scripts create disposable subjects and simulate an agent responding to gate feedback.
- Gate runs real checks; demonstrations do not exercise model judgment, adversarial isolation, or general efficacy.
- Agent running the demonstration owns environment hygiene and evidence interpretation.

## Contracts

- Fleet example builds four gates: API headings, named tests plus pytest, typed-wrapper annotations, and final flag.
- Scripted reaction extracts four exact tracer flags from hook feedback; it does not use an LLM.
- Fleet uses the real arm hook and a temporary arms/work/checks/corpus tree, deleted in `finally`.
- Fleet success requires `state=complete`, all four tracer contents matching after `read().strip()`, and usable `bin/relay verify <ledger> --sprint <sprint> --json` with exit `0`, `result=PASS`, `chain_intact=true`, terminal `last_event=sprint-complete`, and `oracle_recheck.status=ok`.
- Counter is diagnostic only; escalation also sets it past end. Empty hook stdout is a silent stop, not completion. Nonzero hook exit, malformed/non-block response, or blank/nonstring reason fails the example with diagnostics; unusable audit output also fails.
- `tests/test_example_completion.py` exercises a real last-gate `false` control with all flags, past-end counter and intact escalating ledger: the example must return FAIL. Its disposable plan uses retry budget `1` to bound that negative control; `build_arm` remains budget `8`.
- Audit acceptance does not rerun controls or revalidate current artifacts. The example's flags are its own additional content checks, not proof of general artifact quality.
- Both shell demos use the benchmark `Stop` hook and a scripted runner in a disposable `mktemp` directory.
- Arithmetic demo uses legacy `dod` pytest checks; it illustrates feedback, not named-control verification.
- Checklist demo uses named deterministic controls plus a semantic stub and shows an in-place verdict edit
  rejected by the chain verifier. Stub privacy verdict is not a real compliance assessment.
- Shell demo banners and exit status are presentation, not strict end-to-end assertions; they do not use `set -e`.
- Plain chain is not a cryptographic signature or unforgeable trace; keyed HMAC needs a key kept outside agent reach.
- Demonstration checks prove their narrow behavior, not legal compliance or that an agent cannot ever stop unfinished.

## Procedure

1. From Relay root, confirm `bash`, `jq`, `python3`, `shasum`, and pytest on PATH; provide `openssl` for keyed mode.
2. Remove ambient Relay overrides and API keys from the experiment environment; choose `RELAY_JUDGE_BACKEND=stub`.
   Do not let another run's token, key, judge, or corpus redirect the example.
3. Run the desired script:

   ```sh
   python3 examples/fleet-chain/run_example.py
   bash demo/relay_demo.sh
   bash demo/compliance_demo.sh
   ```

4. Inspect feedback, named failures, flags, state, terminal event, audit exit/result, and sprint recheck, not only the final banner.
5. Use integration's explicit-sprint verification when adapting an example into a retained real run.

## Checks

Run these fleet regression checks from Relay root:

```sh
python3 -m pytest tests/test_example_completion.py tests/test_relay.py::test_fleet_chain_example -q
```

Fleet run must show repaired conventions, `4/4` flags, `state=complete`, and audit PASS
ending in `sprint-complete` with sprint recheck `ok`. The completion suite includes the
real-hook final-gate escalation negative control, hook/audit transport faults, missing
flags/sprint, nonterminal or failed/corrupt records, active state, and sandbox cleanup.
Its controlled transport fixtures do not replace the real clean and escalation runs.
Synthetic fixtures record every declared deterministic control and prove real audit PASS before mutation; no control executes in those fixtures, and PASS is not semantic-quality evidence.
Checklist demo should show initial failing controls, repair, intact ledger, then `TAMPERED` after its deliberate edit.
Artifact disappearance after exit is expected because scripts clean temporary state.

## Cold review

Mandatory: reviewer must differ from author and use a fresh isolated context without author-session history.
Freeze baseline commit, exact diff path, artifact paths and content hashes; reviewer inspects example/demo source and hook consumers.
Exercise this skill's scripted-runner/gate integration with named checks:
- Run Procedure's fleet example and both shell-demo commands, plus Checks' fleet regression command.
- Inspect four exact flags, fail/repair feedback, deliberate tamper rejection, complete versus parked state,
  terminal audit/recheck, transport-failure handling and real last-gate escalation rejection. Keep the
  retry-`1` test override distinct from production example budget `8`; final banners and exit 0 alone do not establish completion.
- Preserve legacy DoD/stub/plain-chain limits; source success predicates do not establish model efficacy.
Write `APPROVE`, `FIX-FIRST`, or `REJECT` to a review evidence file, citing filepaths, exact commands/exits,
observed results, and residual limits. Missing validation evidence blocks `APPROVE`.
Fix findings, freeze revised diff/artifacts, and obtain independent re-review before Done.
This documented duty is not automatic enforcement and does not guarantee error-free results.
Commit or PR requires explicit authorization.

## Failure handling

Missing tools or failing generated tests: repair PATH/dependencies, then rerun in a fresh temporary environment.
Unexpected stop or FAIL: inspect hook stderr/exit and state, then audit result, terminal event and sprint recheck; empty stdout also represents escalation or plan/binding defects.
Key-mode mismatch: select an explicit experiment key/mode; never mutate another run's key or evidence.
Need durable evidence: adapt under integration rules; temporary demo output does not retain its complete subject.

## Done

Independent `APPROVE` evidence and validation for the frozen revision are required.
Observed behavior is reported as a deterministic scripted smoke demonstration with its actual controls.
No claim of model efficacy, adversarial isolation, legal compliance, or unconditional completion exceeds that evidence.
