# Archie native Atlas and Relay work — execution plan

Baseline: `792ed6cc7c03f64bb2b75e1d1f4f751e32732ce5`, tree `9e5f62678508237ff944c651545503cc2ea01263`.
Lead worktree: `archie-atlas`; source branch: `archie-atlas`.

## Owner intent

- Atlas is a direct, native, living component of Archie.
- Archie chooses assignment versus progressive WP and the knowledge anchored to that work.
- Maestro owns stakeholder decisions and communication, not knowledge selection or specialized execution.
- Demonstrate progressive reveal, live obligations and independent routing with two real workers.
- Use configured Luna access; retain native provider/tool identity and original failure evidence.

## Wave decision

### Final parallel wave (owner instruction: CI only on final bundle)

- Atlas author: existing isolated `archie-atlas-survey`; owns new Orchestra AtlasKnowledge service, atlas_context anchor action and their tests. Existing native access changes retained.
- Schema/graph author: isolated `atlas-relay-schema`; owns atlas-knowledge.ts, relay-sprint.ts, relay-arm.ts, relay graph projection/compiler and focused tests.
- Binding/current-step author: isolated `atlas-relay-binding`; owns Core relay-workflow-binding.ts and relay-workflow-currentstep.ts plus focused tests.
- Live author: isolated `atlas-relay-live`; prepares actual Luna/native Atlas→Relay two-worker validation harness outside production code. No overlapping implementation.
- Lead: integrates explicit paths into `archie-atlas`, wires Orchestra workflow-host.ts/plan-revision.ts and dependency nodes, reviews and final CI. No source commit/push/PR authorized.
- All consumers use frozen knowledge contract below; no intermediate CI runs. Package typechecks permitted. Final tests include real negative controls. No shared checkout writes.

Hybrid, with one bounded source author first. Native access changes are independent of the lead's schema/Relay investigation, but knowledge materialization depends on the existing exact Atlas unit acquisition API. Do not dispatch a second source author until that contract is frozen.

| Work | Owner | Paths | Dependency |
| --- | --- | --- | --- |
| UI source integration | Existing Maestro session | Existing 13 UI paths | Already merged and tree-equal to qualified95a726 |
| Native Atlas access | Bounded author, isolated survey worktree | Native seat/profile/owner/context tools and focused conformance tests | Existing AtlasDiscovery.catalog/unit signatures preserved |
| Knowledge anchoring and current-step materialization | Lead until contract freeze | Schema/Atlas selection records/Relay binding/current-step domain | Exact native access and current source receipt contracts |
| Cold review | Separate cold-context reviewer | Diff and original tests only | Measured scoped baseline and detecting mutations |
| Live validation | Lead/owned isolated runtime | Fresh isolated project/DB/model traces | Source checks and reviewed candidate |

## Frozen native-access contract

1. Add `archie` to the existing closed native memory owners; preserve backend/Jimmy behavior and backend-only legacy aliases.
2. Require real executing member identity, `native: true`, matching stable role ID and declared seat capability. A display label, custom agent or model argument cannot choose an owner.
3. Enable Archie's native memory capability and direct verified Atlas context. Context catalog/unit reads use the existing verification door, not Maestro model mediation.
4. Exact catalog/unit parameters, source identities, receipts, coverage, stale-source refusal and project placement remain unchanged. Do not weaken complete/fresh acquisition or map a hold to empty success.
5. Permit direct context reads for supported native memory owners through the seat profile. Do not grant unrelated tools, authorizations, dispatch or backend toolkit powers.
6. Remove contradictory upstream prompt/skill prohibitions on native Atlas use. Distinguish native memory observations from shared Knowledge adoption/authority.
7. Preserve own-owner serving isolation, scanner refusal, exact retry reconciliation, degraded header behavior and native per-call safety.

## Frozen knowledge contract

Canonical minimal wire/storage schema: `packages/schema/src/atlas-knowledge.ts` in lead worktree. No separate event log or database: the actual anchor is retained on the normal completed `atlas_context` tool part.

- Extend native `atlas_context` with closed `{action:"anchor", target:{kind:"assignment"|"work-package",id}, units:[exact IDs]}`. Only real executing native Archie may anchor; supported native Atlas owners retain catalog/unit reads.
- Target is a proposed work identity, not a durable Task ID or authority. Runtime project, author Session, message and call identities come from the host, never arguments.
- Acquire each exact unit through the existing verified Atlas API. Require nonempty/unique selection, ≤8 units and ≤128KiB bodies; all sources must remain the same verified identity through acquisition. No stale/partial/unavailable result may mint an anchor.
- Return the canonical `Anchor` as `metadata.atlasContext.anchor` and output. `reference` is SHA256 of the canonical host-produced payload excluding reference. `bodyHash` hashes exactly the acquired plain skill content; `contentHash` remains Atlas's source receipt hash.
- `AtlasKnowledge.anchor({session,assistantMessageID,callID,target,units})` produces the anchor. Services are named yields; acquisition is effectful. Scope is current native planning Session. No Memory template abuse or shared Knowledge promotion.
- `AtlasKnowledge.resolve({projectID,authorSessionID,reference})` finds one completed native Archie anchor tool part in the actual author's Session, validates invocation/metadata/reference identity, reacquires exact unit sources, and refuses source/body/receipt drift. Selection remains Archie's; host resolution supplies verified bytes only.
- Add optional `knowledge: AtlasKnowledge.Reference[]` to `RelaySprint.Sprint` (global) and `WorkPackage` (local). Fields are real consumed context references, not ignored arbitrary metadata. Empty/absent selection means no anchors, preserving old plan shapes.
- Preserve/provide these fields in native graph projection/compilation: start parameter `relayKnowledge`, step parameter `knowledge`, both JSON reference arrays. Compile empty arrays by omitting the field so existing plans/hashes stay stable.
- Add optional `knowledge: AtlasKnowledge.Anchor[]` to `RelayArm.WorkflowDefinition`. Only selected references resolve. Existing field absence is preserved.
- Extend trusted `PublicationPort` with optional `knowledge(reference, authorSessionID)`. `acquire` accepts optional trusted `authorSessionID`; if references exist both binding and resolver are mandatory. Resolve ≤8 distinct anchor references and bound total content size, require matching project/author/reference and valid body/reference hashes.
- `recordPlanRevision` passes its actually observed upstream author Session to acquire. `WorkflowHost` resolver delegates to `AtlasKnowledge.resolve`. `revalidate` derives the bound author from the expected anchors, reacquires, and compares the complete resolved knowledge. Missing binding, foreign reference or drift is a named HOLD.
- `RelayWorkflowCurrentStep.read` exposes only global/current-step selected bodies, as labelled Atlas source data, alongside existing macro/instructions/self-check. Future-step-only bodies do not enter the active view. No additional provider/model loop or cursor writer.

Assignment anchors are attributable source packets attached to the proposed brief/work definition through the returned reference; they do not imply assignment dispatch or approval. WP anchors are resolved and bound before execution by the existing native workflow path. Existing workflow approval/provenance/settlement contracts remain intact. Regenerate the public Client surface if Relay Schema changes alter Protocol/HttpApi output; never edit generated files directly.

## Verification

- Local package `bun typecheck`; source/format/dependency checks appropriate to changed paths.
- Tests only through root `bun run test:ci`; snapshots of intended source only, no local test override.
- Native access controls: renamed Archie still binds Archie; fake/missing identity refused; exact Own bytes/receipt; changed source held; owner serving isolation; backend-only legacy access; actual scanner/retry behavior.
- Detecting mutation must fail a behavior assertion, not setup or preload.
- Runtime validation uses fresh receipts and actual Luna responses, no fabricated grants, tool calls, authorship or approvals. Same-WP continuation is Session/Task-owned and routes to the correct arm.
- Include a failed current control and a regression scenario in the bounded Relay proof; owner release must not waive checks.

## Repository discipline

Shared checkout has unrelated user work and is not edited. No reset/stash/clean, no broad staging. No source commit, push, PR or merge without the required explicit authorization. Test snapshot submission follows the repo's owner-approved `test:ci` workflow. Do not alter auth/config or stop the user's app/server. Stop only owned isolated processes.

Any inability to meet the actual native runtime/approval contract is a named blocker, not a substitute PASS. New owner decisions and contract changes are recorded here before delegation.
