# Benchmark Campaigns — Historical Input Records

Audience: agents. Status: historical.

Current authority: [SPEC.md](../../SPEC.md). Procedures: [operational skills](../../docs/skills/).
Evidence: [RESULTS.md](../RESULTS.md). These records describe frozen experiment inputs, not
current operational guides or reference solutions.

## Input ownership

The hand-authored billing campaigns are original, self-contained fixtures; no CoreLink or
other-project code, specification text or invariant IDs are campaign inputs. Their `repo/`
contains the **unimplemented starting skeleton**, expected to be red against requirement tests.
A pristine failure is task setup, not a Relay runtime regression. Agents edit candidate copies,
not committed inputs or held-out tests.

Requirements, visible checks, holdout suites, skeletons, metadata and selected sprint snapshots
are immutable for comparison. Raising difficulty creates a new experiment identity; it does
not retroactively turn a saturated pilot into positive evidence. "Frozen" is experiment discipline,
not a permission boundary enforced by the runner.

## Layout and scoring boundary

| Path | Meaning |
|---|---|
| `README.md` | Historical goal, shape, provenance and evidence limits |
| `meta.json` | Original size/type/cap and calibration snapshot; prose conclusions can be superseded |
| `repo/` | Starting implementation skeleton, not ground-truth reference code |
| `requirements.yaml` | Frozen statements, weights, dependencies and visible verifier mapping |
| `checks/` | Visible feedback/gates; visible grading alone is smoke evidence |
| `holdout/` | Final efficacy grading inputs, removed from the runner copy |
| `sprint.json` | R/D decomposition snapshot |
| `sprint_mono.json` | M whole-campaign WP, gate on, bounded aggregate repair |

[run_arm.sh](../run_arm.sh) copies a campaign to a fresh candidate directory, removes its
holdout, then grades final candidate state against campaign-source holdout. Same-user access is
not hardened blinding. [grader.py](../grader.py) skip/collection limits remain relevant even
with a held-out suite. The two billing pilots saturated; they remain pipeline/overhead records.

## Generated campaigns and historical isolation correction

The [generators](../generator/) create separate seeded inputs plus reference/lookup-hacker
implementations under external `/tmp` paths. The original claim "nothing reads or writes outside
relay" was false for that tooling. Those external scratch artifacts are generator-owned inputs,
not imported project code, but their paths and overwrite behavior are not immutable archive
storage or an enforced secrecy boundary. No generator execution is prescribed by this record.

Fresh authorship reduces obvious contamination; it does not prove that published inputs or
generators are unseen by every model. Naming `NN-domain` is a fixture convention, not evidence
that the planned size/type/model-ladder sweep was completed.
