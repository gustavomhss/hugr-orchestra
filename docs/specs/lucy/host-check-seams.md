# Host check facts: phase 3 seam trace

Evidence at `e2883a8e515ab3f4ec302e5a5ed66b20c4a53513`. This is not a runtime fix, a
waiver, or an interface decision. Lead freezes any boundary before implementation.

## Approved clauses

`docs/specs/lucy/design.md:307-308`: “**APPROVE**: no confirmed P0 or P1, and every lane the
profile and overlays require ran or is recorded as a `check-unavailable` the owner accepted.”
Lines 312–314: “A confirmed blocker from any lane blocks” and “When lucy cannot judge (a missing
toolchain, a held context), it returns `blocked` with the blocker, not an APPROVE with a caveat.”

`docs/specs/lucy/build-plan.md:397` (R2): “A project setting listing lanes the owner accepts as
unavailable, next to the tier pin §5.3 allows; the card then cites the `test:ci` checks the validation
recorded.” It describes the local-test guard and conditional acceptance; it is not an owner waiver.

## What the current host actually knows

- `packages/core/src/review-toolkit/analyze.ts:24-38` defines `Check` with `id`, `pack`, `version`,
  `lane`, `status: pass | fail | not-run | acquisition-error`, optional `reason` and `uri`, and
  `workspaceExecuted`. `:93-113` collects checks from selected packs and returns them with items,
  retained and debt. These are host analyzer results, not model-authored card checks.
- `analyze.ts:155-163,166-171` reports not-run for unknown, above-lane, dropped, not-built or absent
  packs; `:231-254` gives each repository gate its own `gate.id`, with `pack: repo` and its lane.
  The pack-level helper uses the pack identity; a check ID is therefore not automatically a lane
  ID. A scan failure with findings (`:212-215`) is not interchangeable with acquisition failure.
- `packages/core/src/review/settings.ts:5-6,20-37` says “review lanes or checks the owner accepts
  as unavailable”; `read` trims IDs and deduplicates, and `accepted(settings, check)` tests exact
  membership of `check.trim()`. That helper does not itself establish whether the caller passes a
  gate ID, pack ID, lane ID, required obligation, or which status qualifies for acceptance.
- `modules/maestro/coordination/src/v2/workflow/review-fanout.ts:48-53` types `Analysis.checks`
  as `ReadonlyArray<unknown>`. After entry, a newly routed pack causes a second analysis
  (`:273-276`). Host `notRun` coverage includes unrouted lens/pack cases (`:277-286`); it is not
  identical to the analyzer's per-check results or a list of all required obligations.
- Quick embeds checks and coverage in the finish prompt (`:291-310`); Standard embeds checks and
  coverage (`:513-534`). `finishTurn` and the `Result` (`:129-140,244-256`) return routing, reply,
  confirmed findings and counts, **not** analysis checks, required obligations or coverage as
  separate host facts. Prompt JSON is host-supplied context, but a model's card is untrusted output.
- `packages/core/src/review-toolkit/probe.ts:88-109,200-206,221-244` reports probe results dynamically
  after initial analysis, including `not-run` for the repository guard. Fanout adds a
  `check-unavailable` deviation for `bound.probeUnavailable` (`review-fanout.ts:404-428`); it does
  not follow that every individual dynamic probe result is represented as an analysis check.

## Current validation and durable replay reach

`modules/maestro/coordination/src/v2/governance/review-result.ts:52-110` allows card `checks: []`,
and permits `check-unavailable` plus optional `accepted` on an individual model-authored check;
the only card-level schema filter here forbids a verdict on a blocked card.
`workflow/review-card.ts:31-78` binds routing, scope, finding identity/evidence and verdict
conditions, but receives no host checks/settings and does not validate check completeness or
acceptance. A syntactically valid done/APPROVE with no findings and `checks: []` can pass that
standalone validator, irrespective of analyzer checks.

`test/lucy-review-card.test.ts:23-27,45-48`, **“accepts an empty APPROVE and does not promote
questions to findings”**, explicitly accepts that empty-check fixture; the **“blocked requires a
blocker and cannot have a verdict”** test at `:50-54` checks only its card-shaped case. Neither
supplies real analyzer checks as validator inputs.

For card-only PRs, `tools/review-pr.ts:121-145` writes `{candidate, method, routing, scope,
confirmed}` and validates against routing/scope/confirmed. `tools/review-pr-facts.ts:18-30` stores
those fields, not checks, required obligations, owner acceptance or entry-blocker state. A completed
retry needs trusted original check facts and their binding; it cannot recover them from the model's
card or infer an empty list. Whether any stored prompt or additional host metadata should supply
them is a lead decision, not an existing replay guarantee.

The entry path parses a model return into an eligible/blocked record; if absent or ineligible the
host selects a blocker and instructs the finish turn to return a blocked card
(`review-fanout.ts:222-227,259-270`). That selected host-path fact is not separately in `Result`
or PR facts. It differs from an invalid final model card and must not be inferred from a fabricated
APPROVE or merely from `confirmed: []`.

Governed `tools/review-records.ts:335-347` validates findings/verdict and compares submitted
**validation** checks exactly to `record.checks`; `:540-556` validates method/profile/stage.
Those checks are not shown to be the fan-out analyzer checks or dynamic probe obligations. This
recording gate must not be described as closing the standalone PR analyzer-check gap.

## Questions for the lead and smallest acceptance cases

1. What host-owned inputs identify lanes required by the final profile/overlays, including entry
   blockers and changes after initial analysis? Test a host-blocked entry against a model APPROVE
   and an invalid final card separately; neither may masquerade as successful completion.
2. What is the exact mapping from required lane to check/gate/pack and owner setting ID? Test one
   required unavailable obligation with no matching acceptance, a matching owner acceptance, and
   a different ID; preserve truthful `check-unavailable` evidence where applicable. Do not assume
   every `not-run` pack is required, or that `acquisition-error` is owner-waivable.
3. How are Quick and Standard checks/coverage carried independently of the model? Test an omitted,
   altered, duplicated or invented check on a would-be APPROVE, alongside a genuinely complete
   zero-required-check case; decide exact failure behavior before implementing it.
4. How are dynamically observed required probes and their unavailable outcomes bound after analysis?
   Test a repository-guarded probe against owner acceptance and an unrelated accepted ID; retain
   existing distinctions between a probe finding, not-run and acquisition failure.
5. Which trusted completed facts and settings are bound to a retry? Test a completed retry after
   artifact/settings changes, including missing facts; it must not silently invent clean checks or
   rerun provider work as recovery. Exact storage, schema and lifecycle remain unfrozen.

No tests, runtime, typecheck or CI were executed for this packet. Documentation describes the
current seam and does not close it; no new public API, ledger or schema is proposed here.
