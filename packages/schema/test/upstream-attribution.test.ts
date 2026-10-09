import { describe, expect, test } from "bun:test"
import { Schema, SchemaAST } from "effect"
import { Agent } from "../src/agent"
import { Event } from "../src/event"
import { MaestroContext } from "../src/maestro-context"
import { MaestroEvent } from "../src/maestro-event"
import { Project } from "../src/project"
import { ProjectID } from "../src/project-id"
import { RelayArm } from "../src/relay-arm"
import { SessionID } from "../src/session-id"
import { SessionMessage } from "../src/session-message"
import { UpstreamAttribution } from "../src/upstream-attribution"

const attribution = {
  schema: "maestro-upstream-attribution-v1",
  projectID: "project-upstream",
  memberID: "walt",
  profile: "upstream",
  authorSessionID: "ses_upstream",
  authorMessageID: "msg_proposal",
  parentSessionID: "ses_authority",
  parentMessageID: "msg_dispatch",
  parentCallID: "provider-call:dispatch",
  logicalTaskID: "logical-task:proposal",
} as const satisfies typeof UpstreamAttribution.V1.Encoded

const grounding = {
  catalogVersion: "catalog-v1",
  snapshot: "snapshot-1",
  sourceRevision: "a".repeat(40),
  sourceIdentityHash: "b".repeat(64),
  units: ["schema"],
} satisfies typeof MaestroContext.Grounding.Type

const revisionV1 = {
  id: "revision-1",
  sessionID: "ses_authority",
  admissionMessageID: "msg_admission",
  methodVersion: "method-v1",
  revision: "v1",
  goal: { value: "Retain observed proposal", source: "stakeholder" },
  acceptance: [{ value: "Observed references", source: "orientation" }],
  scope: [{ value: "Schema contract", source: "maestro" }],
  constraints: [{ value: "Retain old revisions", source: "stakeholder" }],
  reviewRequirement: { value: "Review before adoption", source: "maestro" },
  contextRequirement: "PENDING",
  assumptions: [{ value: "Host validates references", source: "orientation" }],
  risks: [{ value: "Missing stored evidence", source: "maestro" }],
  status: "PROPOSED",
  revisionHash: "revision-hash",
  createdAt: 0,
} satisfies Event.Data<typeof MaestroEvent.PlanRevision.Recorded>

const revisionV2 = {
  ...revisionV1,
  revision: "v2",
  grounding,
} satisfies Event.Data<typeof MaestroEvent.PlanRevision.RecordedV2>

const revisionV3 = {
  ...revisionV1,
  revision: "v3",
} satisfies Event.Data<typeof MaestroEvent.PlanRevision.RecordedV3>

const upstream = { value: "", source: "upstream" } as const
const sourceSlots = [
  { slot: "goal", patch: { goal: upstream } },
  { slot: "reviewRequirement", patch: { reviewRequirement: upstream } },
  { slot: "acceptance", patch: { acceptance: [...revisionV1.acceptance, upstream] } },
  { slot: "scope", patch: { scope: [...revisionV1.scope, upstream] } },
  { slot: "constraints", patch: { constraints: [...revisionV1.constraints, upstream] } },
  { slot: "assumptions", patch: { assumptions: [...revisionV1.assumptions, upstream] } },
  { slot: "risks", patch: { risks: [...revisionV1.risks, upstream] } },
]

function envelope(data: unknown, version: number) {
  return {
    id: "evt_revision",
    type: "maestro.plan_revision.recorded",
    durable: { aggregateID: revisionV1.sessionID, seq: 1, version },
    data,
  }
}

describe("upstream attribution contract", () => {
  test("canonical V1 DTO decodes and round trips without adding fields", () => {
    const decoded: UpstreamAttribution.V1 = Schema.decodeUnknownSync(UpstreamAttribution.V1)(attribution)
    expect(decoded).toEqual(attribution)
    expect(Schema.encodeSync(UpstreamAttribution.V1)(decoded)).toEqual(attribution)
    expect(SchemaAST.resolveIdentifier(UpstreamAttribution.V1.ast)).toBe("Maestro.UpstreamAttribution.V1")
    expect(Object.keys(UpstreamAttribution.V1.fields).sort()).toEqual(
      [
        "schema",
        "projectID",
        "memberID",
        "profile",
        "authorSessionID",
        "authorMessageID",
        "parentSessionID",
        "parentMessageID",
        "parentCallID",
        "logicalTaskID",
      ].sort(),
    )
  })

  test("V1 reuses exact identity schemas and existing brands", () => {
    expect(Project.ID).toBe(ProjectID)
    expect(UpstreamAttribution.V1.fields.projectID).toBe(Project.ID)
    expect(UpstreamAttribution.V1.fields.memberID.schema).toBe(Agent.ID)
    expect(UpstreamAttribution.V1.fields.authorSessionID).toBe(SessionID)
    expect(UpstreamAttribution.V1.fields.parentSessionID).toBe(SessionID)
    expect(UpstreamAttribution.V1.fields.authorMessageID).toBe(SessionMessage.ID)
    expect(UpstreamAttribution.V1.fields.parentMessageID).toBe(SessionMessage.ID)
    expect(UpstreamAttribution.V1.fields.parentCallID).toBe(Schema.NonEmptyString)
    expect(UpstreamAttribution.V1.fields.logicalTaskID).toBe(Schema.NonEmptyString)
    expect(SchemaAST.resolve(UpstreamAttribution.V1.fields.projectID.ast)?.brands).toEqual(["Project.ID"])
    expect(SchemaAST.resolve(UpstreamAttribution.V1.fields.memberID.ast)?.brands).toEqual(["AgentV2.ID"])
    expect(SchemaAST.resolve(UpstreamAttribution.V1.fields.authorSessionID.ast)?.brands).toEqual(["SessionID"])
    expect(SchemaAST.resolve(UpstreamAttribution.V1.fields.parentSessionID.ast)?.brands).toEqual(["SessionID"])
    expect(SchemaAST.resolve(UpstreamAttribution.V1.fields.authorMessageID.ast)?.brands).toEqual(["Session.Message.ID"])
    expect(SchemaAST.resolve(UpstreamAttribution.V1.fields.parentMessageID.ast)?.brands).toEqual(["Session.Message.ID"])
  })

  test("V1 retains existing Project and loose Session ID syntax", () => {
    const input = {
      ...attribution,
      projectID: Project.ID.global,
      authorSessionID: "ses",
      parentSessionID: "session-legacy",
      authorMessageID: "msg_",
      parentCallID: "unprefixed-call",
      logicalTaskID: "unprefixed-task",
    }
    expect(Schema.decodeUnknownSync(UpstreamAttribution.V1)(input)).toEqual(input)
  })

  test.each(["verified", "approval", "publication", "provenanceID", "source"])(
    "V1 default decoder rejects excess key %s",
    (key) => {
      expect(() => Schema.decodeUnknownSync(UpstreamAttribution.V1)({ ...attribution, [key]: true })).toThrow()
    },
  )

  test.each([
    { key: "schema", value: "maestro-upstream-attribution-v2" },
    { key: "schema", value: "" },
    { key: "memberID", value: "backend" },
    { key: "memberID", value: "Walt" },
    { key: "memberID", value: "upstream" },
    { key: "profile", value: "walt" },
    { key: "profile", value: "" },
    { key: "authorSessionID", value: "msg_wrong-kind" },
    { key: "parentSessionID", value: "msg_wrong-kind" },
    { key: "authorMessageID", value: "ses_wrong-kind" },
    { key: "parentMessageID", value: "ses_wrong-kind" },
  ])("V1 rejects $key=$value", ({ key, value }) => {
    expect(() => Schema.decodeUnknownSync(UpstreamAttribution.V1)({ ...attribution, [key]: value })).toThrow()
  })

  test.each([
    "projectID",
    "memberID",
    "authorSessionID",
    "authorMessageID",
    "parentSessionID",
    "parentMessageID",
    "parentCallID",
    "logicalTaskID",
  ])("V1 rejects empty or absent %s", (key) => {
    expect(() => Schema.decodeUnknownSync(UpstreamAttribution.V1)({ ...attribution, [key]: "" })).toThrow()
    expect(() => Schema.decodeUnknownSync(UpstreamAttribution.V1)({ ...attribution, [key]: undefined })).toThrow()
  })
})

describe("PlanRevision attribution versions", () => {
  test("V1 and V2 preserve historical shape and never synthesize attribution", () => {
    const historical = [
      { schema: MaestroEvent.PlanRevision.Recorded, input: revisionV1, version: 1 },
      { schema: MaestroEvent.PlanRevision.RecordedV2, input: revisionV2, version: 2 },
    ]
    historical.forEach(({ schema, input, version }) => {
      const decoded = Schema.decodeUnknownSync(schema.data)(input)
      expect(decoded).toEqual(input)
      expect(Schema.encodeSync(schema.data)(decoded)).toEqual(input)
      expect(decoded).not.toHaveProperty("upstreamAttribution")
      expect(Schema.decodeUnknownSync(schema)(envelope(input, version)).data).toEqual(input)
      expect(schema.data.fields.goal.fields.source.literals).toEqual(["stakeholder", "maestro", "orientation"])
      sourceSlots.forEach(({ patch }) => {
        expect(() => Schema.decodeUnknownSync(schema.data)({ ...input, ...patch })).toThrow()
        expect(() => Schema.decodeUnknownSync(schema)(envelope({ ...input, ...patch }, version))).toThrow()
      })
      expect(Schema.decodeUnknownSync(schema.data)({ ...input, upstreamAttribution: attribution })).toEqual(input)
    })
    expect(Schema.decodeUnknownSync(MaestroEvent.PlanRevision.Recorded.data)(revisionV1)).not.toHaveProperty("grounding")
    expect(() => Schema.decodeUnknownSync(MaestroEvent.PlanRevision.RecordedV2.data)(revisionV3)).toThrow()
    expect(() =>
      Schema.decodeUnknownSync(MaestroEvent.PlanRevision.RecordedV2.data)({ ...revisionV1, revision: "v2" }),
    ).toThrow()
  })

  test("V3 embeds exact checked data schema and retains event type and durable versions", () => {
    const current = MaestroEvent.PlanRevision.RecordedV3
    expect(current.fields.data).toBe(current.data)
    expect(current.type).toBe("maestro.plan_revision.recorded")
    expect(current.durable).toEqual({ version: 3, aggregate: "sessionID" })
    expect(MaestroEvent.PlanRevision.Recorded.durable).toEqual({ version: 1, aggregate: "sessionID" })
    expect(MaestroEvent.PlanRevision.RecordedV2.durable).toEqual({ version: 2, aggregate: "sessionID" })
    expect(SchemaAST.resolveIdentifier(current.ast)).toBe(current.type)
    expect(current.data.fields.revision.literal).toBe("v3")
    expect(current.data.fields.goal.fields.source.literals).toEqual(["stakeholder", "maestro", "orientation", "upstream"])
    expect(current.data.fields.sessionID).toBe(MaestroEvent.PlanRevision.Recorded.data.fields.sessionID)
    expect(current.data.fields.contextRequirement).toBe(MaestroEvent.PlanRevision.Recorded.data.fields.contextRequirement)
    expect(current.data.fields.status).toBe(MaestroEvent.PlanRevision.Recorded.data.fields.status)
    const definitions = Event.inventory(MaestroEvent.PlanRevision.Recorded, MaestroEvent.PlanRevision.RecordedV2, current)
    expect(Event.latest(definitions).get(current.type)).toBe(current)
    expect(Event.durable(definitions).get("maestro.plan_revision.recorded.1")).toBe(MaestroEvent.PlanRevision.Recorded)
    expect(Event.durable(definitions).get("maestro.plan_revision.recorded.2")).toBe(MaestroEvent.PlanRevision.RecordedV2)
    expect(Event.durable(definitions).get("maestro.plan_revision.recorded.3")).toBe(current)
    expect(() => Schema.decodeUnknownSync(current.data)(revisionV1)).toThrow()
    expect(() => Schema.decodeUnknownSync(current.data)(revisionV2)).toThrow()
    expect(() => Schema.decodeUnknownSync(current)({ ...envelope(revisionV3, 3), type: "maestro.task.bound" })).toThrow()
  })

  test.each(sourceSlots)("requires upstream attribution for $slot in V3 data and envelope", ({ patch }) => {
    const input = { ...revisionV3, ...patch }
    expect(() => Schema.decodeUnknownSync(MaestroEvent.PlanRevision.RecordedV3.data)(input)).toThrow(
      "UPSTREAM_ATTRIBUTION_MISSING",
    )
    expect(() => Schema.decodeUnknownSync(MaestroEvent.PlanRevision.RecordedV3)(envelope(input, 3))).toThrow(
      "UPSTREAM_ATTRIBUTION_MISSING",
    )
    expect(() =>
      Schema.decodeUnknownSync(MaestroEvent.PlanRevision.RecordedV3.data)({ ...input, upstreamAttribution: undefined }),
    ).toThrow("UPSTREAM_ATTRIBUTION_MISSING")
    expect(() =>
      Schema.decodeUnknownSync(MaestroEvent.PlanRevision.RecordedV3)(
        envelope({ ...input, upstreamAttribution: undefined, grounding }, 3),
      ),
    ).toThrow("UPSTREAM_ATTRIBUTION_MISSING")
    const attributed = { ...input, upstreamAttribution: attribution }
    expect(Schema.decodeUnknownSync(MaestroEvent.PlanRevision.RecordedV3.data)(attributed)).toEqual(attributed)
    expect(Schema.decodeUnknownSync(MaestroEvent.PlanRevision.RecordedV3)(envelope(attributed, 3)).data).toEqual(attributed)
  })

  test("V3 uses canonical attribution validation in data and envelope", () => {
    const input = { ...revisionV3, goal: upstream, upstreamAttribution: attribution }
    const decoded = Schema.decodeUnknownSync(MaestroEvent.PlanRevision.RecordedV3.data)(input)
    expect(Schema.encodeSync(MaestroEvent.PlanRevision.RecordedV3.data)(decoded)).toEqual(input)
    expect(decoded.upstreamAttribution).toEqual(Schema.decodeUnknownSync(UpstreamAttribution.V1)(attribution))
    const retained = { ...revisionV3, upstreamAttribution: attribution }
    expect(Schema.decodeUnknownSync(MaestroEvent.PlanRevision.RecordedV3.data)(retained)).toEqual(retained)
    expect(Schema.decodeUnknownSync(MaestroEvent.PlanRevision.RecordedV3)(envelope(retained, 3)).data).toEqual(retained)
    ;[
      null,
      { ...attribution, verified: true },
      { ...attribution, memberID: "backend" },
      { ...attribution, parentMessageID: "ses_wrong-kind" },
      { ...attribution, logicalTaskID: "" },
    ].forEach((upstreamAttribution) => {
      expect(() =>
        Schema.decodeUnknownSync(MaestroEvent.PlanRevision.RecordedV3.data)({ ...input, upstreamAttribution }),
      ).toThrow()
      expect(() =>
        Schema.decodeUnknownSync(MaestroEvent.PlanRevision.RecordedV3)(envelope({ ...input, upstreamAttribution }, 3)),
      ).toThrow()
    })
  })

  test("non-upstream V3 omits attribution and grounding through data and envelope round trips", () => {
    const decoded = Schema.decodeUnknownSync(MaestroEvent.PlanRevision.RecordedV3.data)(revisionV3)
    expect(decoded).toEqual(revisionV3)
    expect(decoded).not.toHaveProperty("upstreamAttribution")
    expect(decoded).not.toHaveProperty("grounding")
    expect(decoded.contextRequirement).toBe("PENDING")
    expect(Schema.encodeSync(MaestroEvent.PlanRevision.RecordedV3.data)(decoded)).toEqual(revisionV3)
    expect(
      Schema.encodeSync(MaestroEvent.PlanRevision.RecordedV3.data)({
        ...decoded,
        upstreamAttribution: undefined,
        grounding: undefined,
      }),
    ).toEqual(revisionV3)
    const event = Schema.decodeUnknownSync(MaestroEvent.PlanRevision.RecordedV3)(envelope(revisionV3, 3))
    expect(event.data).not.toHaveProperty("upstreamAttribution")
    expect(event.data).not.toHaveProperty("grounding")
    expect(Schema.encodeSync(MaestroEvent.PlanRevision.RecordedV3)(event)).toEqual(envelope(revisionV3, 3))
  })

  test("V3 retains acquired grounding but leaves attributed ungrounded revisions PENDING", () => {
    const attributed = { ...revisionV3, goal: upstream, upstreamAttribution: attribution }
    const ungrounded = Schema.decodeUnknownSync(MaestroEvent.PlanRevision.RecordedV3.data)(attributed)
    expect(ungrounded).not.toHaveProperty("grounding")
    expect(ungrounded.contextRequirement).toBe("PENDING")
    expect(Schema.encodeSync(MaestroEvent.PlanRevision.RecordedV3.data)(ungrounded)).toEqual(attributed)
    ;[revisionV3, attributed].forEach((revision) => {
      const input = { ...revision, grounding }
      const decoded = Schema.decodeUnknownSync(MaestroEvent.PlanRevision.RecordedV3.data)(input)
      expect(decoded).toEqual(input)
      expect(decoded.grounding).toEqual(Schema.decodeUnknownSync(MaestroContext.Grounding)(grounding))
      expect(Schema.encodeSync(MaestroEvent.PlanRevision.RecordedV3.data)(decoded)).toEqual(input)
      expect(Schema.decodeUnknownSync(MaestroEvent.PlanRevision.RecordedV3)(envelope(input, 3)).data).toEqual(input)
      expect(() =>
        Schema.decodeUnknownSync(MaestroEvent.PlanRevision.RecordedV3.data)({
          ...input,
          grounding: { ...grounding, units: [] },
        }),
      ).toThrow()
    })
  })
})

describe("PlanRevision workflow binding integration", () => {
  // Structural fixture only; publication references establish neither authorship nor approval.
  const workflowBinding = {
    publication: {
      projectID: attribution.projectID,
      documentID: "packet",
      activeVersionID: "version-1",
      immutableVersionBodyChecksum: "1".repeat(64),
      livePublicationChecksum: "2".repeat(64),
    },
    materialization: {
      schemaIdentifier: "RelaySprint.Sprint",
      digest: "3".repeat(64),
      byteLength: 128,
    },
    resolvedSkills: [
      { wp: "implement", skill: "implementation", mode: "combine", content: "Approved skill", sha256: "4".repeat(64) },
    ],
    parameters: { target: "src", mode: "product" },
    writePaths: ["src"],
  } as const satisfies typeof RelayArm.WorkflowDefinition.Encoded

  test("V3 canonical workflow binding round trips through data and full envelope", () => {
    const current = MaestroEvent.PlanRevision.RecordedV3
    const input = { ...revisionV3, goal: upstream, upstreamAttribution: attribution, workflowBinding }
    const decoded = Schema.decodeUnknownSync(current.data)(input)
    expect(decoded).toEqual(input)
    expect(Schema.encodeSync(current.data)(decoded)).toEqual(input)
    const event = Schema.decodeUnknownSync(current)(envelope(input, 3))
    expect(event).toEqual(envelope(input, 3))
    expect(Schema.encodeSync(current)(event)).toEqual(envelope(input, 3))
  })

  test("production Durable inventory registers the canonical V3 workflow event", async () => {
    const currentProductionEvent = await import("../src/event-manifest")
    expect(currentProductionEvent.Durable.get("maestro.plan_revision.recorded.3")).toBe(
      MaestroEvent.PlanRevision.RecordedV3,
    )
  })

  test("V3 encoding omits explicit undefined workflow binding from data and envelope", () => {
    const current = MaestroEvent.PlanRevision.RecordedV3
    const event = Schema.decodeUnknownSync(current)(envelope(revisionV3, 3))
    const data = { ...event.data, workflowBinding: undefined }
    const encodedData = Schema.encodeSync(current.data)(data)
    expect(encodedData).not.toHaveProperty("workflowBinding")
    expect(encodedData).toEqual(revisionV3)
    const encodedEvent = Schema.encodeSync(current)({ ...event, data })
    expect(encodedEvent.data).not.toHaveProperty("workflowBinding")
    expect(encodedEvent).toEqual(envelope(revisionV3, 3))
  })

  test("V3 workflow binding never replaces required upstream attribution in data or envelope", () => {
    const input = { ...revisionV3, goal: upstream, workflowBinding }
    expect(() => Schema.decodeUnknownSync(MaestroEvent.PlanRevision.RecordedV3.data)(input)).toThrow(
      "UPSTREAM_ATTRIBUTION_MISSING",
    )
    expect(() => Schema.decodeUnknownSync(MaestroEvent.PlanRevision.RecordedV3)(envelope(input, 3))).toThrow(
      "UPSTREAM_ATTRIBUTION_MISSING",
    )
  })

  test.each([
    {
      issue: "materialization schema identifier",
      patch: { materialization: { ...workflowBinding.materialization, schemaIdentifier: "RelayAuthoring.Document" } },
    },
    {
      issue: "materialization digest",
      patch: { materialization: { ...workflowBinding.materialization, digest: "g".repeat(64) } },
    },
    {
      issue: "immutable version body checksum",
      patch: { publication: { ...workflowBinding.publication, immutableVersionBodyChecksum: "A".repeat(64) } },
    },
    {
      issue: "noncanonical skill shape",
      patch: { resolvedSkills: [{ id: "implementation", content: "Approved skill", sha256: "4".repeat(64) }] },
    },
  ])("V3 rejects $issue in workflow binding data and envelope", ({ patch }) => {
    const input = {
      ...revisionV3,
      goal: upstream,
      upstreamAttribution: attribution,
      workflowBinding: { ...workflowBinding, ...patch },
    }
    expect(() => Schema.decodeUnknownSync(MaestroEvent.PlanRevision.RecordedV3.data)(input)).toThrow("workflowBinding")
    expect(() => Schema.decodeUnknownSync(MaestroEvent.PlanRevision.RecordedV3)(envelope(input, 3))).toThrow(
      "workflowBinding",
    )
  })

  test("legacy V1 and V2 replay never synthesizes workflow binding or attribution", () => {
    ;[
      { schema: MaestroEvent.PlanRevision.Recorded, input: revisionV1, version: 1 },
      { schema: MaestroEvent.PlanRevision.RecordedV2, input: revisionV2, version: 2 },
    ].forEach(({ schema, input, version }) => {
      const event = Schema.decodeUnknownSync(schema)(envelope(input, version))
      expect(event.data).not.toHaveProperty("workflowBinding")
      expect(event.data).not.toHaveProperty("upstreamAttribution")
      expect(Schema.encodeSync(schema)(event)).toEqual(envelope(input, version))
    })
  })
})
