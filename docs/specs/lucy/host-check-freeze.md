# Host-owned check evidence contract

Construction base: `e2883a8e515ab3f4ec302e5a5ed66b20c4a53513`.
This closes an enforcement gap; it does not waive required checks.

## Frozen runtime boundary

`workflow/review-checks.ts` exports namespace `ReviewChecksV2`:

```ts
export const Facts = Schema.Struct({
  checks: ReviewResultV2.Card.fields.checks,
  required: Schema.Array(Schema.NonEmptyString),
  blockers: ReviewResultV2.Card.fields.blockers,
})
export type Facts = typeof Facts.Type
export function collect(input: {
  readonly routing: ReviewRouting.Record
  readonly checks: ReadonlyArray<ReviewAnalyze.Check>
  readonly settings: ReviewSettings.Input | undefined
  readonly entryBlockers?: Facts["blockers"]
  readonly probes?: ReadonlyArray<ReviewProbe.Observed>
}): Facts
export function validate(card: ReviewResultV2.Card, facts: Facts): void
```

Identity is JSON of `[pack ?? "", lane ?? "", id]`. Canonical checks sort by
that identity (lexical code-unit order). Equivalent repeated host observations
deduplicate; conflicting repeated identities throw. Card omissions, inventions,
alterations and duplicates fail `checks-mismatch`; order alone is immaterial.
Retain id, lane, pack, version, reason and workspaceExecuted, but not analyzer uri
(the card schema has no uri). Do not recover host facts from model output.

Required packs are final-route packs with status `routed`, plus path-required
packs even if not run. Every actual check of a required pack is required. If a
required pack produced no check, synthesize its pack id/lane with version
`unknown`, `workspaceExecuted: false`, status `check-unavailable` and reason
`required pack produced no host check`. Non-required skipped fallback packs do
not become mandatory merely because they appear in coverage.

Analyzer `not-run` projects to `check-unavailable`. Only that status may carry
`accepted`, always an explicit host-derived boolean. Acceptance is exact membership
of the check id or lane in normalized owner settings; accepting a pack name does
not accept a differently named repository gate. Acquisition errors never become
accepted and always block when required. Unaccepted required unavailability adds
`{kind: "check-unavailable", reason, ref: identity}`; required acquisition errors
add `{kind: "acquisition-error", reason, ref: identity}`. Required fail checks
cannot support APPROVE, but do not manufacture P0/P1 findings or a FIX_FIRST card.
They remain recorded failures, distinct from unavailable checks.

Host-selected entry blockers survive verbatim. Host blockers require outcome
`blocked` and must each appear exactly once in the card; extra model blockers
are permitted. Failure is `checks-blocked`. Existing finding and verdict rules
remain independent, including no verdict on blocked cards.

## Fanout, dynamic probes and replay

Fanout Analysis.checks becomes `ReadonlyArray<ReviewAnalyze.Check>`. The ran
Result carries required `checkFacts: ReviewChecksV2.Facts`. Initial analysis is
available even for blocked entry. Eligible entry uses the latest full analysis
after route additions. Finish prompts carry canonical checkFacts checks/blockers;
the returned facts do not depend on what the model writes in its card.

Probe's per-review Ledger adds `observed: Observed[]`; `Observed` is
`{readonly candidate: string; readonly option: string; readonly result: Output}`.
The actual `settle` path appends one host result per settled attempt, including
refusals. Fanout BindInput adds `observeProbes?: (items: ReadonlyArray<Observed>) => void`.
The binding supplies the observer through probe Context; settle invokes it
synchronously after host result construction. No model supplies this collection.
Fanout collects observations per verifier and sorts by canonical identity.

Probe check id is `probe:${candidate}:${option}:${result.uri}`, lane is the
offered option, pack `review-probe`, version `review-v2`, workspaceExecuted is
false for not-run and true otherwise. Every actually attempted probe is required;
not-run projects/accepts as above using its full id or exact option. A failed
probe refutes a candidate rather than failing a repository gate: record fail but
do not forbid APPROVE on that basis alone. A scratch-copy refusal before a probe
could be called adds a required unavailable check for each offered built option,
id `probe:${candidate}:${option}:scratch-unavailable` and the actual host reason.

`ReviewCardV2.validate` requires checkFacts, runs its validation, and otherwise
preserves all existing refusals. PR facts persist checkFacts strictly alongside
routing/scope/confirmed; first response and completed retry both use these exact
immutable facts. Missing old facts fail closed, never rerun provider work.
Settings already participate in candidate identity. No receipt/Board/forge write,
private-store replacement, new cap, or retry recovery is authorized.

## Work ownership and verification

- G4: review-checks.ts and pure policy tests; no fanout or PR files.
- G1: probe host observation, fanout/binding, PR facts/request wiring; no policy file.
- G6: adversarial validator and registered PR/fanout/retry acceptance tests only.
- G3: independent Squawk analyzer/catalog slice on its verified primitive stack.
- Lead: contract, integration, remote surgical CI, mutation controls and small PRs.

No local tests/builds/typechecks/generators, benchmarks, restart, genesis, merge of
#1290 or per-slice epic. Acceptance must include omitted/altered/invented/duplicate
checks; exact id/lane acceptance and unrelated rejection; acquisition refusal;
host-blocked entry against fabricated APPROVE; probe observations; immutable
completed retry; legitimate zero-required checks. Existing security tests remain.
