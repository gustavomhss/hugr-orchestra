# FINDING — executor-written review verdicts are self-graded evidence

Audience: agents. Status: historical.

Read this as the **2026-08-24 finding snapshot**, followed by residuals checked against source at
`684456d571e8deb5f435d39e789e1b1258453d85`. Use [relay-research](../.opencode/skills/relay-research/SKILL.md)
and [relay-profiles](../.opencode/skills/relay-profiles/SKILL.md) for current operating instructions.

## Preserve the historical defect

The original account described an agent-driven `research-v2` run with 52 sources, 41 findings,
8 conclusions, and 199 minutes. Its review controls included this shape:

```json
{"id": "synthesis-review-verdict",
 "cmd": "test \"$(jq -r .verdict ${research_dir}/review-synthesis.json)\" = APPROVE"}
```

The gate ran a real command, but the command read an executor-writable claim. Exit-status grading
did not make the asserted reviewer outcome independent. Compare the stated rule in
[`enforcement-model.md` §4](enforcement-model.md):

> The agent's claims may **never** advance the chain.

Treat that sentence as doctrine, not proof that every current control implements it. Read
[`relay-profile.py`](../bin/relay-profile.py) and [`relay-gate.sh`](../lib/relay-gate.sh) for the actual
translation and grading. Earlier references to `docs/relay-vs-mcp` and `[[relay-vs-mcp-evidence]]`
named external migration material; they are not bundled source references for this finding.

The historical account reported these off-gate synthesis-review costs:

| Snapshot observation | Recorded account |
|---|---|
| Reviewer clones | 21 |
| Rounds changing the artifact | 21 of 21 |
| `conclusions.json` growth | 11,365 → 35,664 characters |
| Approval round | The round shrinking 35,664 → 33,261 characters |
| Tokens | 11.16M |
| Wall clock | About two hours of the 199-minute run |
| Gate-visible synthesis review | Three passing checklist items in one fire |

Read the [agent-driven historical ledger](fixtures/research-v2-agent-driven-PASS.ledger.jsonl) for
the old `evidence-review-verdict` and `synthesis-review-verdict` rows. The clone/token/growth account
was reconstructed from reviewer transcripts; those costs are not reconstructable from the ledger
alone and are not re-measured here. Read the [escalated ledger](fixtures/research-v2-live-escalated.ledger.jsonl)
as another dated failure record, not evidence of the replacement controls converging.

The account called this a justification **ratchet**: revisions grew the artifact rather than cycling
without change. Local reviewer respawns happened before the gate fired, so gate retry accounting did
not meter them. Preserve that distinction when discussing the cost or the stopping-rule defect.

## Inspect the implemented replacement

Read [`profiles/research-v2.yaml`](../profiles/research-v2.yaml) `criteria_map.per_sub` and its
[compiled sprint](../profiles/research-v2.sprint.json). The former executor-written APPROVE controls
are replaced by blocking `evidence-withstands-cold-review` and `conclusions-withstand-cold-review`
judges. The executor still owes substantive written reviews and review-engagement judges.

Read [`lib/relay-gate.sh`](../lib/relay-gate.sh) `relay_run_checklist`: the gate computes a scoped diff,
invokes [`benchmark/judge.py`](../benchmark/judge.py), and passes verdict/backend/oracle/origin/scope
to its caller's ledger function. A recorded failing blocking judge enters the consumer's normal
failure path. Read [`bin/relay-gate`](../bin/relay-gate) for CLI retry accounting; do not call an
arbitrary local judge invocation a charged gate fire.

Use `RELAY_JUDGE_VOTES` to request repeated API/CLI calls. Majority wins and ties fail; one call is
the default. Multi-call ballots record `(votes:n/m)` with backend/model information. Treat these as
samples, not authenticated independent reviewer identities. Inspect error/no-verdict/truncation tags:
the suffix-only no-verdict abort check does not cover every combined no-verdict/truncation tag.

Do not repeat the old claim that the executor cannot rerun the judge or manufacture its inputs.
`benchmark/judge.py` is directly callable; `relay-gate check` also runs the checklist without advancing,
charging retries, or recording verdicts. Artifacts, bindings, and context remain supplied inputs.
Recorded `eval` failures are metered; off-gate attempts are not comprehensively metered by this change.

## Record current residuals

| Source | Residual at the checked baseline |
|---|---|
| [`research-v2.yaml`](../profiles/research-v2.yaml) | The replacement evidence reviewer has only the `findings.json` diff; the replacement conclusion reviewer has only the `conclusions.json` diff. Neither declares upstream source snapshots or cited findings as `context`. Do not claim it inspected those files. |
| [`spec-decompose.yaml`](../profiles/spec-decompose.yaml) | `invariants-`, `requirements-`, `spec-`, `goldens-`, and `work_packages-review-verdict` still read executor-writable APPROVE files. Length and blocking engagement judges are additional controls, not verdict provenance authentication. |
| [`design.yaml`](../profiles/design.yaml) | `distinctness-verdict`, `dress_rehearsal-verdict`, and `no_flinching-verdict` still read executor-writable APPROVE files. [`design-check`](../tools/design/design-check) also consumes those verdicts in `doors_reviewed`, `scenes_reviewed`, and `anti_optimism_reviewed`. |
| [`planning.yaml`](../profiles/planning.yaml), [`plan-check`](../tools/edd/plan-check) | `hostile_read_approved` resolves verdict data and tests `APPROVE`; `_resolve_verdict` permits an inline manifest object as well as supported file refs. It does not authenticate a cold reviewer. |
| [`tdd_feature.yaml`](../profiles/tdd_feature.yaml), [`wp-execute.yaml`](../profiles/wp-execute.yaml) | The review states use presence/length and blocking judge controls rather than APPROVE-verdict commands. Do not describe that as guaranteed review independence. |
| [`relay-arm-hook.sh`](../bin/relay-arm-hook.sh) | `kind: review` adds a cold-read reminder; the engine does not spawn a fresh reviewer context. |
| [`relay-gate.sh`](../lib/relay-gate.sh) | Only literal judge verdict `fail` blocks when `blocking: true`; missing/malformed judge output can become `advisory`. Missing diff is separately recorded as `judge:unavailable(no-diff)`. |

Keep deterministic proxies distinct from semantic quality. A nonempty/long review, a stored hash,
or a command reading `APPROVE` does not prove the reviewer inspected supporting evidence. Gate-side
judges improve who emits the recorded verdict while retaining supplied-context and model limits.

## Interpret artifact hashes within their reach

Read `relay_artifact_sha` in [`relay-gate.sh`](../lib/relay-gate.sh). For nonempty declared `paths`, it
hashes path names plus current file-content digests, or an `absent` marker. The gate passes that
digest as `artifact` to the caller's ledger function; scope/oracle use raw template paths while the
artifact read uses expanded paths.

Treat this as scoped-artifact identity, not a transcript of local reviewer spawns, a digest of all
`context` files, or proof that an API prompt contained every artifact byte. Empty scope supplies no
artifact digest; whitespace-split paths and workdir prefixes limit supported path forms. Diff bytes
and source truth are separate questions. Preserve historical entries without retroactively adding fields.

## Verify before updating the finding

Run from the repository root:

```sh
python3 bin/relay-profile.py profiles/research-v2.yaml --qualify-ids -o profiles/research-v2.sprint.json --check
PYTHONDONTWRITEBYTECODE=1 python3 -m pytest -q -p no:cacheprovider tests/test_judge_context.py tests/test_judge_api.py tests/test_shipped_profiles.py
git diff --check
```

Use context marker/canary tests and fake-endpoint verdict/tie/error cases to verify wiring; do not
claim they establish real semantic convergence. Inspect source and actual supplied files before
closing a residual. Coordinate changes to mappings, judge inputs, metering, or reviewer isolation
with runtime owners and the linked skills; preserve this dated snapshot instead of rewriting history.
