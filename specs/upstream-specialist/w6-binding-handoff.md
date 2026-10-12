# W6 observed upstream publication binding

Current identity correction: active upstream ID `archie`, profile `upstream`, assets `packages/archie-specialist`, config `agent.archie.name`; see [NAMING-CORRECTION.md](NAMING-CORRECTION.md). Old member literals, source pins and ownership quotations below remain historical, not active aliases or changes to current writer authority.

Status: refined coordination contract for Relay's nominal W6 proposal, 2026-10-08. Not implemented approval, owner acceptance or a permission waiver. Relay lead remains sole integrator of W6 Task/Session/Arsenal completion/Relay service-schema. Upstream owns native registration, projection and authoring methods.

## Ownership / source pins

- Relay's peer reports reviewed `relay-next` checkpoint `b776e87fe5`. Do not consume pending author-branch V1 wire/atomic-transition `7cbe` or unmerged exporter.
- Relay solely integrates immediate V1 `prompt.before` parity in `arsenal-approval.ts`, Core ToolSafety Approval optional `messageID`, hook propagation and native queue tests. Upstream has no edits in those areas.
- Upstream's local `arsenal-bindings.ts` change is limited to the two-site native-upstream V2 flag; it changes no lower W6 resolver/approval/completion code. Upstream bootstrap also uses the existing Instance/Location/plugin ownership, not a Session layer.

## Typed binding content to incorporate into existing records

Names below define semantic fields for coordinated schema work, not a second workflow DSL or a claim of new installed APIs. Use existing branded ID/checksum schemas at implementation.

```text
publication: {
  projectID,
  documentID,
  activeVersionID,
  versionChecksum
}

upstreamProvenance: {
  authoritySessionID,
  executionSessionID,
  messageID,
  parentToolCallID,
  logicalTaskID,
  memberID: "walt"
}

materialization: {
  schemaIdentifier: "RelaySprint.Sprint",
  digest,
  byteLength
}
```

The host acquires/produces these facts. Model/caller fields, `upstream-result`, paths, `done`, structural validity and publication alone never mint them or approval. Preserve the actual selected upstream proposal and source references without asserting original authorship of a reused file solely because upstream selected it.

### Publication semantics

- `versionChecksum` hashes the immutable acquired `RelayAuthoring.Version` body using the existing AuthoringStore checksum algorithm. It is not the checksum of the mutable live Document/editor response.
- Live Document `active` and `activeVersionId` establish current publication. Immutable Version flags record save-time state and cannot establish current publication.
- Current draft may be newer than active publication. Draft save is not publication replacement or authority.
- Host selection/revalidation must use the actual active pointer and selected immutable Version; wrong document/version/project, unpublished/drifted definition, unknown acquisition or unsupported/non-runnable tooling holds before dispatch.
- Compilation resolves skill bindings separately. Freeze actual resolved skill content/digests used by materialization or reject drift; immutable graph Version alone does not freeze later catalog resolution.

### Provenance semantics

- Actual native `walt` assistant Session/message must be observed through stored host data. Match authority parent, actual parent Task call, child execution Session and retained logical Task; execution Session ID is not logical Task ID.
- Worker-provided author/identity fields remain rejected. A parser claim and path cannot substitute for acquired artifact bytes or actual parent placement.
- Source attribution denotes the observed upstream proposal. Original source owners/facts remain separately cited; adopting a proposal does not make Maestro or stakeholder its author.
- Existing `PlanRevision.source` accepts only `stakeholder | maestro | orientation`. Coordinated schema/host change must represent upstream with mandatory observed provenance, not arbitrary caller `source: "upstream"`. Do not relabel to fit current enum or promote unknown metadata.

### Materialization semantics

- `digest` is SHA-256 of exact host-acquired/copied native Sprint bytes, with `byteLength`; use existing `UpstreamProposal.inspect` for strict UTF-8/native schema decoding and byte identity.
- Do not conflate immutable Version checksum, live publication checksum and native-byte digest, or treat `gen` as schema version/approval.
- If graph compilation produces new native bytes, bind that actual materialization and its resolved inputs. Do not claim those bytes equal an original authored artifact without an explicit, checkable correspondence.
- Durable host record/adoption must retain the selected binding. Subsequent source, publication, skill or scope changes require the applicable new revision/validation/review/approval rather than inherited acceptance.

## Approval and execution boundary

Existing Plan/Task revision hashes must cover the materialized binding and applicable actual approved scope. Existing permission snapshots remain host facts; current task hashes do not yet include `writePaths` or publication by themselves. Do not say old intent shape already covers those fields.

Approval remains exact existing direct-owner/native lifecycle evidence. Caller proposals and peer coordination grant none. Host revalidates publication, runnable capabilities, current approved revision/context and actual scope before dispatch; uncertainty/blocked acquisition is HOLD, never empty PASS.

Authoring precedes execution arming. Existing arm/governed state must be inspected before authoring; no authoring Task consumes execution gates, ordinary Task enters active governed chain, synthetic disarm, fresh-Session escape or downgrade. No routine human approval at each step is introduced.

## Progressive pilot contract

One linear product WP, one existing native arm, same Session/logical Task. Product Tasks retain current identity/format/lifecycle and remain lightweight. Native sprint `work_packages` are progressive steps, not new product Tasks.

- Pure current-step view and re-delivery/resume do not evaluate, advance or consume retries.
- One guarded evaluation at existing safe provider/tool-settle boundary; durable assistant identity plus expected arm position/attempt reconcile retries and partial cursor/ledger/delivery outcomes.
- Reuse existing serialized runner continuation and history reload. No second evaluator/provider loop, provider retry recovery, durable drain ID or UI run.
- Historical proof is distinct from live invariant. Do not re-run invalidated historical baseline checks as persistent truth or reuse old PASS as current evidence.
- Worker local `done` cannot close global WP. Blockers/unknown evidence hold; complete chain/global acceptance/review evidence remains required.

## Required discriminating evidence

Actual native/host tests must reject: unpublished or changed active Version, wrong project/Version checksum, stale materialization/skill digest, mismatched parent/child/message/logical Task, caller-forged upstream source, out-of-approved scope, duplicate evaluation/wrong position, lost delivery/restart reconciliation, stop after failed/unknown transition. Valid unchanged retries must not repeat provider work or spend retry twice. All declared fields must be covered by the approval/adoption hash path, not merely displayed in a record.

No code in this handoff claims W6 closure. Relay lead should freeze exact schema/events/method names and acknowledgment before source integration, while retaining the above semantic obligations.
