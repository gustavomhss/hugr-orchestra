# L1 luna-2 — promotion, verification and preserved reuse evidence

Model: `openai/gpt-6-luna`. Artifact handle: `L1-promotion-verification-reuse`.
Exact output title: `Session input base — promotion verification and preserved reuse`.
Layer: L1. Depends on frozen evidence only; parallel with all other L1 seats.
Embed `common.md`; no sibling output, oracle or tools.

## Inputs

- `packages/core/src/session/input.ts`: 318–391.
- `packages/core/src/session/runner/llm.ts`: 185–239, 616–642.
- L1 review amendment: `packages/core/src/session/runner/llm.ts`: 240–272, 427–429 at the SAME
  baseline/blob, supplied explicitly for PR-3 step-limit/request/provider-call boundary evidence.
- `packages/core/test/session-prompt.test.ts`: 145–165, 254–342, 344–404, 448–518, 541–586.
- Original scoped historical `reconciliation.json`, supplied with its actual digest; scope is one recovered
  staging/CAS artifact, not every response or documentation file.
- `script/atlas-genesis/checkpoint-replay-source.json` and
  `script/atlas-genesis/checkpoint-continuation-proof.json`, verbatim with pinned baseline/blob identities.
- Supplied policy: `bun run test:ci core test/session-prompt.test.ts` is a possible scoped command,
  NOT an executed result or proof of all runner/Atlas acceptance.
- Coordinator-supplied exact baseline/blob/range identities.

## Axioms and invariants

Inherit shared contract and GO-A1..7/GO-I1..8. Locate default-runner selection/publication boundaries,
preserving conditions. Do not generalize to hosted engines, provider internals or distributed recovery.
No sibling admission output is needed to inventory this owned evidence.
Preserve original Grok provenance. Separate test definitions, transport/recovery proofs, historical
candidate knowledge and present semantic acceptance; an anchor miss is not globally absent knowledge.

## Required headings and completeness criteria

- `## Evidence register` — PR-1: locate steer cutoff/eligibility/order and promotion/publication paths.
  PR-2: locate queue eligibility/order, number promoted and continuation reevaluation. PR-3: locate
  relevant pre-promotion checks, input allowance reset and request/history boundary evidence.
- `## Reuse and conflicts` — PR-4: separate selector behavior from runner conditions; expose unsupported
  guarantees, missing owned detail and internal mismatches rather than assume every input executes.
- `## Boundary handoff` — PR-5: identify selector→runner→visible-history joins requiring consolidated
  evidence; leave full flow composition to L3, not this base register.
- `## Coverage and gaps` — PR-6: trace each PR criterion, scope exclusions and unexecuted runtime observations.

Additional owned criteria in the SAME headings (not a second output): VR-1 maps supplied tests to actual
assertions rather than names; VR-2 attributes historical proof/audit identities and limited reach, including
the related schema-alias candidate; VR-3 assigns reusable test definition/preservation proof/related candidate
versus unsupported coverage and names missing runtime/semantic verification; VR-4 maps these to later
verification questions; VR-5 traces all VR criteria with exact evidence/gaps. Put VR-1/2 in Evidence register,
VR-3 in Reuse and conflicts, VR-4 in Boundary handoff and VR-5 in Coverage and gaps. Never certify detailed
acceptance of continuation `42087075694` from reported status or treat planned sites as completed requests.

## Success criteria

The base carries exact selection/continuation/allowance evidence with conditions, allowing later
component understanding without re-reading unrelated runner code.

## Quality standards

Apply QS-1..6/shared standards. No unconditional processing promise, speculative backpressure design
or conversion of observed control flow into an owner decision.

## DoD and stop

All PR-1..6 AND VR-1..5 supported or explicitly BLOCKED. Return only the L1 register/handoff; no final delivery
contract, integrated flow, operational procedure or implementation changes.
