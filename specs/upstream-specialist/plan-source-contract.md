# Canonical upstream PlanSource contract — frozen v1

Coordination ACK, not execution approval. This contract supersedes the earlier statement that Relay owns upstream source-enum/provenance changes. Upstream integrates the attribution definition and source-version region; Relay integrates publication/Task binding and the existing PlanRevision reader/producer as explicit handoffs. No broad test run is required to consume this contract.

## Canonical DTO / existing brands

Schema namespace: `UpstreamAttribution`, file `packages/schema/src/upstream-attribution.ts`; identifier `Maestro.UpstreamAttribution.V1`.

```text
UpstreamAttribution.V1 = {
  schema: "maestro-upstream-attribution-v1",
  projectID: Project.ID,
  memberID: Agent.ID constrained to "walt",
  profile: "upstream",
  authorSessionID: SessionID,
  authorMessageID: SessionMessage.ID,
  parentSessionID: SessionID,
  parentMessageID: SessionMessage.ID,
  parentCallID: NonEmptyString,
  logicalTaskID: NonEmptyString
}
```

Exact brand sources:

- `Project.ID`: existing `ProjectID` from `packages/schema/src/project-id.ts`, reexported by `project.ts`.
- `Agent.ID`: existing `AgentV2.ID` brand in `packages/schema/src/agent.ts`; value must be `walt`.
- `SessionID`: existing `SessionID` schema in `session-id.ts` for both author and parent Sessions.
- `SessionMessage.ID`: existing `Session.Message.ID` brand in `session-message.ts` for both actual assistant messages.
- `parentCallID`: existing tool-call identity is an unbranded string. Require nonempty; never assume a provider-specific prefix or mint another call ID.
- `logicalTaskID`: existing `MaestroEvent.Task.Bound.taskId` is unbranded. Require nonempty, actual retained binding and the existing LogicalTask validation. Never substitute child `ses_...` ID or invent a new Task brand/ID.
- `profile`: no existing profile-ID brand; fixed literal `upstream`, observed against native registry. This does not add a registry or alias.

DTO is closed. It has no publication fields, approval fields, new provenance record ID, caller-supplied verification boolean or SourceEnum override. A schema match is structural only; host verifier must establish every referenced fact.

## Exact source/event version changes

1. Preserve `MaestroEvent.PlanRevision.Recorded` durable version **1**, revision `v1`, and `RecordedV2` durable version **2**, revision `v2`, byte/shape compatible. Their legacy Field source set remains `stakeholder | maestro | orientation`. Historical replay gets no synthesized attribution.
2. Add `MaestroEvent.PlanRevision.RecordedV3`, same durable type `maestro.plan_revision.recorded`, durable version **3**, revision literal **`v3`**. No new event type or independent provenance identity.
3. V3 fields retain existing `value: string`; source set becomes `stakeholder | maestro | orientation | upstream`. V3 top-level `upstreamAttribution` carries the canonical V1 DTO when any field uses `source: upstream`. Missing attribution is a named refusal, not an optional unchecked claim.
4. V3 may retain grounding when acquired through existing grounded path; absent grounding stays ungrounded/PENDING and cannot become governed GROUNDED evidence. V1/V2 grounding behavior remains unchanged.
5. Host-created revision body/hash includes the attribution and Relay's materialized publication/Task binding when present. No hash algorithm substitution; update existing hash payload/version handling deliberately.
6. Link W6 to the **actual persisted** `PlanRevision.id` using existing `Event.ID` (`packages/schema/src/event.ts`). Do not put the resulting revision ID inside its own hashed attribution body: it would create a circular content-derived identity. Existing prior revision references, when needed, remain external inputs checked by host.
7. Reader/publisher recognizes v3 explicitly and still reads v1/v2. No reader rewrites historical source tags or converts Maestro persistence calls into authorship.

## Host verification / producer boundary

The host observes attribution from actual stored native `walt` assistant, authority parent Session/message/tool call and retained LogicalTask binding in the same Project. Check native registry seat/profile and actual author role; no display-label lookup.

- Parent tool call must actually be the native Task dispatch producing that child/logical Task, with the matching authority Session and parent assistant message.
- Author message must actually belong to the author execution Session and be emitted by native `walt`; missing/error/interrupted/unparsed/conflicting/blocked proposal evidence cannot qualify successful adoption.
- DTO denotes the observed upstream **proposal**. It does not assert original authorship of every reused referenced file. Byte acquisition/materialization and original source citations remain separately checked.
- Caller may select existing evidence references through an owned host API, but cannot submit authoritative attribution fields or merely set `source: upstream`. Host persistence supplies/validates the DTO and revision body.
- Verification failures use named refusal codes: `UPSTREAM_ATTRIBUTION_MISSING`, `UPSTREAM_ATTRIBUTION_PROJECT_MISMATCH`, `UPSTREAM_ATTRIBUTION_REGISTRY_MISMATCH`, `UPSTREAM_ATTRIBUTION_PARENT_MISMATCH`, `UPSTREAM_ATTRIBUTION_AUTHOR_MISMATCH`, `UPSTREAM_ATTRIBUTION_TASK_MISMATCH`, `UPSTREAM_ATTRIBUTION_PROPOSAL_UNAVAILABLE`. No minted IDs, empty success or silent relabeling.

## Publication binding remains separate

Relay-owned binding separately carries Project/document/active Version, immutable Version-body checksum, live publication checksum, actual native materialization digest/byte length and the existing PlanRevision reference. All must participate in approved revision/Task hash payload and host revalidation. `gen`, publication, path/card/done and this DTO grant no authority.

## Exact write claims

Upstream sole integrator:

- NEW `packages/schema/src/upstream-attribution.ts` and focused attribution-schema evidence.
- `packages/schema/src/maestro-event.ts` **only PlanRevision FieldV3 / RecordedV3 source-and-attribution region** (existing region starts at PlanRevision line 186 in candidate), plus strictly needed imports. V1/V2 definitions remain untouched.
- Attribution verifier contract/implementation handoff and its focused native-evidence checks. No Relay evaluator, Task lifecycle or approval ownership transfer.

Relay sole integrator:

- Remaining Plan/Task publication/materialization binding region in `maestro-event.ts`, `relay-arm.ts`, Core Relay/workflow and existing Orchestra PlanRevision/Task/Arsenal/Session settlement files already claimed.
- `plan-revision.ts` v3 reader/publisher/hash integration **consumes** upstream's canonical schema/verifier; coordinate exact handoff rather than redeclaring DTO or expanding source enum independently.
- Generation after both schema regions are reconciled against reviewed `relay-next` `937cf2b1de027df090f81fa9ef6d9c71bf859a5d`. Never edit generated Client/SDK outputs manually.

Shared `maestro-event.ts` has one final file integrator: Relay receives upstream's exact source-region patch. Upstream does not concurrently mutate Relay's binding regions; Relay must not alter attribution/source definitions. Source-contract ACK allows this nominal split, not unverified schema landing or permission waiver.
