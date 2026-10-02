# Relay Benchmark — Historical Decomposition Method

Audience: agents. Status: historical.

Current authority: [SPEC.md](../SPEC.md). Procedures: [operational skills](../.opencode/skills/).
This records the intended campaign-to-WP method. It is not a current authoring runbook or proof
that one canonical decomposer implements every step. Study scope: [DESIGN.md](DESIGN.md).

## 1. Intended invariants

The experiment sought uniform decomposition, frozen inputs and identical requirement ground
truth across M/R/D. Delivery and gating would vary, not the evaluated requirements. A repeatable
partition needs explicit graph, cohesion keys, ordering and cap constants; "a frozen LLM pass"
does not by itself make extraction or partitioning a pure deterministic function.

Campaign input was `C=(goal, requirements, substrate)`. Each requirement carried a binary
statement, verifier, weight (default 1) and dependencies. Extraction/review rejected checks
testing unstated behavior or rejecting valid alternatives. The proposed deterministic-verifier
share was at least 80%; subjective residue required rubrics and calibration.

## 2. Historical five-step proposal

1. Normalize atomic requirements and their strongest available verifiers.
2. Build an acyclic dependency graph; split genuinely cyclic modeled requirements.
3. Traverse topologically, ID tie-breaks; greedily partition while dependencies are in the same
   or earlier WP, cohesion key is constant, and requirement count is at most k.
4. Emit stable ID/title/instructions plus the selected requirement checks. Historical generated
   campaigns use `dod[].cmd`; production checklist authoring uses named `checklist` controls.
5. Assemble ordered sprint with declared retry budget and prior-check regression semantics.

These were experiment-authoring decisions made before execution. Agents must not read them as
permission to change frozen campaign fixtures or tailor decomposition per arm.

## 3. Actual implementations differ

| Implementation | Actual method |
|---|---|
| [generator/gen_campaign.py](generator/gen_campaign.py) | Seeded rule generation, ordered slices of k rules; monolithic sprint holds all rules |
| [generator/gen_campaign_v2.py](generator/gen_campaign_v2.py) | Seeded bespoke functions ordered by index, calls only to earlier functions, slices of k functions |
| [bin/relay-autodecompose.py](../bin/relay-autodecompose.py) | Existing pytest collection grouped by filename, optional cap splitting; drafts instructions/checklists, not a requirement DAG/cohesion solver |
| Committed billing campaigns | Frozen hand-authored requirements and decompositions; no general canonical partition implementation established here |

Generated order is dependency-compatible for its construction, but these slice-based generators
do not implement a general graph/cohesion algorithm. Auto-decomposition warns on partial
collection when nodeids exist; its output is not proof of complete collection or requirement
coverage. The runner, CLI and production arm also differ in what prior checks they re-run.

## 4. Corrected illustrative partition

The original micro-example assigned different `emit`/`audit` cohesion keys to one WP, contradicting
its own single-concern rule. Retained requirements, corrected partition for k=2:

| Requirement | Claim / illustrative verifier | Dependencies | Cohesion |
|---|---|---|---|
| R1 | Billable events persisted once; replay/counter property test | — | emit |
| R2 | Deduplicate `(tenant_id, request_id)`; retries yield one charge | R1 | dedup |
| R3 | Audit log rejects update/delete; mutation test | — | audit |
| R4 | Reconciliation drift at most 0.1%; staged/charged comparison | R1, R2 | reconcile |

One valid ID-tie-broken order is R1, R2, R3, R4, yielding separate emit, dedup, audit and
reconcile WPs because cohesion keys differ. Each later gate's regression set refers to already
accepted checks. This is an illustrative domain model, not campaign-01 fixture data or a result.

## 5. Input and oracle boundaries

Requirements, visible checks, holdout tests, initial skeleton and selected sprint files are
immutable experiment inputs. Candidate implementation changes belong in isolated run copies.
The [campaign records](campaigns/README.md) describe original skeletons, not reference solutions.
Generators recreate their output and external `/tmp` references; that behavior is not immutable
snapshot storage or enforced isolation.

Visible gates provide feedback. Final held-out grading is the efficacy oracle; visible grading
alone is smoke evidence. A gate pass is not a logical proof of all stated requirements when
tests skip, collection is partial, assertions are weak, or candidate/reference provenance is
unresolved. [RESULTS.md](RESULTS.md) keeps those source limits alongside observations.
