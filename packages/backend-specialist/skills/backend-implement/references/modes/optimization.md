# Prescribed optimization mode

## Applicability

The packet names the bottleneck and the chosen change, and supplies a comparable baseline, workload and metric with its threshold.

## Non-trigger

- "Make it faster" with no chosen change: return a `packet` blocker naming the missing choice and baseline.
- Profiling or measuring to pick an algorithm. That is investigation and belongs to its owner.

## Inputs

- The shared packet fields.
- The selected optimization, the comparable baseline and workload, the metric and threshold, the environment, and the correctness constraints.

## Steps

1. Implement the chosen technique.
2. Run the supplied correctness checks.
3. Run the supplied measurement with the same workload and environment.

## Tools and outputs

- The existing benchmark runner and only the prescribed metrics.
- Output: the implementation, comparable measurements and the stated threshold outcome.

## Limits and checks

- Local layout and allocation details consistent with the chosen technique are yours.
- A missing or unmatched baseline leaves the improvement unverified. Never report an estimated speedup.
- An index or schema change also needs the [migration](migration.md) transition facts and checks.
- If the owner needs to choose a different approach, return a `packet` blocker; do not switch techniques yourself.
