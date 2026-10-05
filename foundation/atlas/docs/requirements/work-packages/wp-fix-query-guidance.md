# Work Package — fix: dead `QUERY_GUIDANCE` constant (#180)

> A remediation WP, not a campaign epic slice: it authors no new REQ/SCN and carries no new obligation onto
> the tool surface. It removes one dead export and repoints the one test assertion that named it at the
> envelope the product actually ships, so `SCN-TOOLS-4-1` (already carried by `WP-7.26-b.TOOLS`) witnesses
> the real `handler.ts` guidance row instead of a hand-maintained duplicate no production path read.

### WP-fix-query-guidance — delete the dead `QUERY_GUIDANCE` export; re-point its test witness at the shipped path

id: WP-fix-query-guidance
content_hash: <filled-at-freeze>
title: delete `QUERY_GUIDANCE` (packages/tools/src/query.ts) — zero production callers, drifted from the
shipped `handler.ts` guidance row it claimed to co-locate with
intent: >
`QUERY_GUIDANCE` at `packages/tools/src/query.ts` was never read by `createQuery`/`createHandler` — the
shipped `atlas-query` envelope's `next`/`invariant` comes ONLY from the `GUIDANCE['atlas-query']` row in
`packages/tools/src/handler.ts`, verified against the BUILT binary (`atlas query <scope>` over a real
fixture repo). The constant's docstring claimed INV-TOOLS-4 co-location with that row; the two texts had
already drifted. Its one caller (`SCN-TOOLS-4-1` in `packages/tools/test/wp-7.26-b-tools.test.ts`) asserted
only that the dead constant was non-empty — a vacuous witness of the same shape #114/#116 already paid for.
This WP deletes the constant and re-points that assertion at `okResult.guidance` — the value `handler.handle`
actually returns — so the scenario now fails if the SHIPPED row is ever blanked. Human handle only.
source_reqs: # ptr+digest — pre-existing ids only, none authored here

- source: ../req-tls.md#REQ-TOOLS-4 # ptr+digest
  anchor: # value
  target: packages/tools/src/query.ts (the dead `QUERY_GUIDANCE` export, deleted) and
  packages/tools/test/wp-7.26-b-tools.test.ts (SCN-TOOLS-4-1's assertion, re-pointed at the shipped
  `GUIDANCE['atlas-query']` row already carried by handler.ts — handler.ts itself is unmodified).
  interface_contract: # ptr+digest
- source: ../../reference/atlas-tools.md#tools-4 # ptr+digest
  exclusions: # value
- handler.ts's `GUIDANCE` table is NOT modified — it is the correct, already-shipped text and stays
  byte-for-byte (verified against a real built-binary run, not read from source).
- `DOCTOR_GUIDANCE` (packages/tools/src/doctor.ts) is measured, found to have a real production caller
  (`packages/cli/src/doctor.ts` renders it on the CLI door) and is explicitly OUT of this WP's scope.
  action: # value (zero-decision recipe)
  Delete `QUERY_GUIDANCE` and its now-unused `Guidance` type import from query.ts; delete the import and the
  two `expect(QUERY_GUIDANCE…)` lines from wp-7.26-b-tools.test.ts; the pre-existing
  `expect(okResult.guidance.next/.invariant).not.toBe('')` assertions already exercise the shipped
  `atlas-query` handler row and now serve as SCN-TOOLS-4-1's sole query-side witness.
  action_surface: # value
  [ Read, Edit (packages/tools/src/query.ts, packages/tools/test/wp-7.26-b-tools.test.ts only) ]
  guardrails: # value
- edit only query.ts's dead export + its one test's assertions; handler.ts stays byte-identical
- do not invent a new REQ/SCN/INV id; cite only pre-existing ones
- the re-pointed assertion must go RED if `GUIDANCE['atlas-query']` in handler.ts is blanked (proven, not
  assumed — see verification below)
  repair_budget: # value
  N: 1 ; this is a delete + one test repoint, not an implementation
  acceptance: # ptr+digest = frozen golden, already carried by WP-7.26-b.TOOLS — # cited here to trace THIS fix's witness, not to newly satisfy it
- source: ../goldens-tls.md#SCN-TOOLS-4-1 # ptr+digest
  deps: [ WP-7.26-b.TOOLS ] parallel_group: —
  exit_predicate: # value
  QUERY_GUIDANCE has zero references in source, tests, or built dist/ ∧ SCN-TOOLS-4-1 passes against the
  shipped handler.ts row ∧ SCN-TOOLS-4-1 fails when that row is blanked (mechanically proven, then reverted
  byte-identical) ∧ tsc -b, full vitest, and all six named gates exit 0
  context_refs: # closed list
- source: ../../reference/atlas-tools.md#tools-4
- source: ../goldens-tls.md
  verification: # value — how exit_predicate was actually checked, not just declared
- mechanical deadness: `grep -rn QUERY_GUIDANCE` over source + tests + built `packages/*/dist` returns only
  prose comments explaining the deletion, zero identifier references
- red/green: `packages/tools/src/handler.ts`'s `GUIDANCE['atlas-query']` row was temporarily blanked to
  `{next:'', invariant:''}` (backed up first) — `SCN-TOOLS-4-1` failed
  (`expected '' not to be '' // Object.is equality` at the `okResult.guidance.next` assertion); the file
  was restored from the backup and `diff -q` confirmed byte-identical; the scenario passed again
- INV-TOOLS-4 delivery: the BUILT `atlas` CLI binary was run against a real fixture repo (`atlas query src`)
  — the rendered envelope's `next`/`invariant` lines matched `handler.ts`'s `GUIDANCE['atlas-query']` row
  byte-for-byte, confirming the guidance IS delivered on the shipped result envelope independent of the
  now-deleted constant
  owner: charlie (FORGE) # value
  outputs: # exec — empty at freeze
  provenance: # exec — empty at freeze
  trace_ref: # exec — empty at freeze
  rationale: # ptr
- source: ../invariant-register.md#INV-TOOLS-4
