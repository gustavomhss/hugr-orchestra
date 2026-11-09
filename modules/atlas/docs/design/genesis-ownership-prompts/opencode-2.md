# L1 opencode-2 — verification and preserved reuse evidence

RETIRED SLOT after owner reduced mining to four agents. Preserve as historical criteria; NOT DISPATCHABLE.
Its VR-1..5 work is now owned by luna-2.

Model: `opencode/crouton-alpha-free`. Artifact handle: `L1-verification-reuse`.
Exact output title: `Session input base — verification and preserved reuse`.
Layer: L1. Depends on frozen evidence/receipts only; parallel with all other L1 seats.
Embed `common.md`; no sibling output, oracle or tools.

## Inputs

- `packages/core/test/session-prompt.test.ts`: 145–165, 254–342, 344–404, 448–518, 541–586.
- Coordinator-supplied original scoped `reconciliation.json` from `genesis-ownership-reuse-704sv42b`,
  with its actual digest and evidence identities. This audit covers one recovered staging/CAS artifact,
  not all historical responses or all documentation. Missing body/identity blocks the reuse criterion.
- Frozen original campaign metadata from `script/atlas-genesis/checkpoint-replay-source.json` and
  `script/atlas-genesis/checkpoint-continuation-proof.json`, supplied verbatim with exact Git blob IDs
  at the pinned baseline; these are explicit receipt inputs beyond the 11-file semantic source pack.
- Coordinator-supplied verification policy: `bun run test:ci core test/session-prompt.test.ts` is a
  possible scoped command, NOT an executed result or proof of all runner/Atlas acceptance.

## Axioms and invariants

Inherit shared contract and GO-A1..7/GO-I1..8. Reuse preserved evidence without relabelling Grok outputs
as new model work. Separate test definitions, transport/recovery proofs, historical candidate knowledge
and present semantic acceptance. Do not treat absence of exact anchors as absence of globally useful knowledge.

## Required headings and completeness criteria

- `## Evidence register` — VR-1: map supplied test definitions to admission/retry/promotion properties
  actually asserted, not just test names. VR-2: attribute historical audit/proof identities and their exact
  reach, including related schema-alias evidence and unresolved or unaudited scope.
- `## Reuse and conflicts` — VR-3: assign reuse as existing test definition, preservation/replay evidence,
  related candidate or unsupported scope; identify missing runtime/semantic verification. Never assert
  detailed acceptance of continuation `42087075694` from a reported success status.
- `## Boundary handoff` — VR-4: map evidence to later change/verification questions, retaining limitations;
  no new test plan, maintenance skill or repository-wide historical audit.
- `## Coverage and gaps` — VR-5: each VR criterion addressed or precisely BLOCKED; distinguish unrun
  tests, supplied successful receipts and unknown findings. Do not invent missing audit data.

## Success criteria

The next layer can reuse actual verification definitions and preservation findings while seeing exactly
which semantic/runtime guarantees remain unverified; no preserved work is silently discarded or overpromoted.

## Quality standards

Apply QS-1..6/shared standards. Evidence-led dispositions, honest scope, immutable provenance and no
zero-cost/complete-coverage claim from metadata or an anchor miss.

## DoD and stop

VR-1..5 supported or explicitly BLOCKED. Return only the L1 register/handoff. Do not run tests, unzip
artifacts, browse source, re-mine responses or close historical recovery obligations.
