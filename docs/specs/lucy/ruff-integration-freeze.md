# Ruff catalog and confined analyzer seam

Depends on the curated primitive freeze, physical file boundary and atomic notice
delivery. The primitive integration head is `17207544cc94adc91003b3cdf9b8c050b80e2c5b`;
its first remote controls are pending, not accepted by this contract.

## Catalog

G4 owns new `review/catalog/ruff.ts`, minimal `entries.ts` composition, existing
Python language `.pyi` detection, `test/review/ruff-catalog.test.ts`, and a narrow
addition to `docs/guides/review.md`. Export a declarative `ruff` object with pack
and rules, importing only the backend pin, never the review adapter at runtime.

Pack: id/tool ruff, version 0.17.3 from the backend manifest; pinned licence class;
backend pinned; pin source `backend-toolkit/packs/ruff` with its exact target
integrities; languages python; detection `.py`/`.pyi`, no manifests/absent signals;
lane no-build, Standard/Deep, JSON/parser ruff, low cost, network none,
scratchWrites false, template ruff-curated-json, lens correctness-logic, probation.
Rules: exactly F821 and F823, logic.invariant, correctness-logic, P2/probation.
F821 triage requires actual project Python/builtins/dynamic binding and executable
reference context; py311 scanner defaults do not prove the deployment version.
F823 triage requires the called function's actual local-before-assignment trigger
and shadowing context. A warning alone confirms neither. Each triage cites the
captured tagged rule source in adjacent comments and stays within schema length.
No `tool:ruff` option or automatic finding confirmation is introduced.

## Actual analysis

G3 owns `review-toolkit/analyze.ts` only. The existing public `ReviewAnalyze.run`
input stays unchanged. Register a dedicated Ruff stdout path like the Squawk path,
not a fake static-argv adapter over a filesystem-effectful primitive.

Use the passed effective catalog and exact dropped native ids; Ruff's authored
two-rule set is closed, so native exclusion can be represented by `--select`.
Demoted rules still run and remain artifact-only. No rule/no input is named
not-run, not a clean native pass. Lookup is status-only and never installs.
Enumerate only regular `.py`/`.pyi` files in the actual scratch tree or intersect
the explicit host selection. Head missing files and symlinks refuse; a selected
new file absent on base is an empty base comparison, not a scan invocation.
An enumerated base with no Python input retains metadata `invoked: false`, while
head no input stays `not-run/no-input`. Preserve all physical refusals.

Run the primitive argv inside the existing sandbox with `write: []` and its actual
adapter environment. Preserve complete stdout bytes before `settle`, including
malformed/non-UTF-8 output; widening the internal context writer to string or
Uint8Array is allowed for this. Keep stderr/failure truth in the Check reason.
Use shared normalization/noise/debt/new-only retention; diagnostic `fail` is not
a repository gate verdict. No Ruff base cache is introduced across selections or
effective configurations. No rewrite, project Python, package install or network.

G6 owns new `test/review-toolkit/ruff-analyze.test.ts` only. Provision the actual
pin plus exact notice outside the review in CI, then drive `ReviewAnalyze.run`
with real Git/scratch/sandbox/omni: newly added F821/F823, benign, unchanged debt,
first Python file versus no-input base, hostile config/noqa/environment, scoped
selection and source preservation. Observe raw output for dropped F821 absent
while F823 still fires; demoted output must remain only in retained artifacts,
including when paged. Missing Linux jail must fail acquisition, not skip native
cases. Parser-only doubles do not prove this seam. No local tests or heavy checks.
