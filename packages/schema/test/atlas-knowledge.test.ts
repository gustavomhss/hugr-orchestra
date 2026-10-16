import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import { AtlasKnowledge } from "../src/atlas-knowledge"
import { ProjectID } from "../src/project-id"
import { RelayArm } from "../src/relay-arm"
import { RelaySprint } from "../src/relay-sprint"
import { SessionID } from "../src/session-id"
import { SessionMessage } from "../src/session-message"

const reference = "a".repeat(64)
const unit = {
  unit: "schema-exact-unit",
  name: "Schema",
  sourceIdentity: "b".repeat(64),
  sourceRevision: "source-revision",
  contentHash: "c".repeat(64),
  receiptHash: "d".repeat(64),
  bodyHash: "e".repeat(64),
  content: "Verified Atlas bytes\n",
} satisfies AtlasKnowledge.Unit
const anchor = {
  reference,
  projectID: ProjectID.make("project-atlas"),
  authorSessionID: SessionID.make("ses_archie"),
  assistantMessageID: SessionMessage.ID.make("msg_anchor"),
  callID: "anchor-call",
  memberID: "archie",
  target: { kind: "work-package", id: "current" },
  units: [unit],
} satisfies AtlasKnowledge.Anchor
const definition = {
  publication: {
    projectID: anchor.projectID,
    documentID: "document",
    activeVersionID: "version",
    immutableVersionBodyChecksum: reference,
    livePublicationChecksum: reference,
  },
  materialization: { schemaIdentifier: "RelaySprint.Sprint", digest: reference, byteLength: 1 },
  resolvedSkills: [],
  parameters: {},
  writePaths: [],
} satisfies RelayArm.WorkflowDefinition

describe("Atlas knowledge contracts", () => {
  test("canonical anchor preserves host invocation, target and exact source packet", () => {
    expect(Schema.encodeSync(AtlasKnowledge.Anchor)(Schema.decodeUnknownSync(AtlasKnowledge.Anchor)(anchor))).toEqual(
      anchor,
    )
    expect(Schema.decodeUnknownSync(AtlasKnowledge.Target)({ kind: "assignment", id: "proposal" })).toEqual({
      kind: "assignment",
      id: "proposal",
    })
  })

  test("new anchor records reject excess properties at each boundary", () => {
    ;[
      { ...anchor, approved: true },
      { ...anchor, target: { ...anchor.target, taskID: "task" } },
      { ...anchor, units: [{ ...unit, verified: true }] },
    ].forEach((input) => expect(() => Schema.decodeUnknownSync(AtlasKnowledge.Anchor)(input)).toThrow())
  })

  test.each([
    "", "A".repeat(64), "g".repeat(64), "a".repeat(63), "a".repeat(65), null, {},
    ...["\n", "\r", "\u2028", "\u2029"].map((suffix) => reference + suffix),
  ])(
    "invalid reference %j rejected",
    (input) => expect(() => Schema.decodeUnknownSync(AtlasKnowledge.Reference)(input)).toThrow(),
  )

  test("anchor unit bounds, owner, target and source digests stay closed", () => {
    expect(
      Schema.decodeUnknownSync(AtlasKnowledge.Anchor)({
        ...anchor,
        units: Array.from({ length: 8 }, (_, index) => ({ ...unit, unit: `unit-${index}` })),
      }).units,
    ).toHaveLength(8)
    ;[
      { ...anchor, units: [] },
      { ...anchor, units: Array.from({ length: 9 }, (_, index) => ({ ...unit, unit: `unit-${index}` })) },
      { ...anchor, memberID: "maestro" },
      { ...anchor, target: { kind: "task", id: "current" } },
      { ...anchor, target: { kind: "work-package", id: "" } },
      { ...anchor, target: { kind: "assignment", id: "x".repeat(257) } },
      { ...anchor, units: [{ ...unit, bodyHash: "invalid" }] },
    ].forEach((input) => expect(() => Schema.decodeUnknownSync(AtlasKnowledge.Anchor)(input)).toThrow())
  })

  test("Relay references decode at global and work-package scope without dropping unknown legacy fields", () => {
    const input = {
      knowledge: [reference],
      extra: "legacy",
      work_packages: [{ id: "current", knowledge: [reference], model: "legacy-model" }],
    }
    expect(Schema.decodeUnknownSync(RelaySprint.Sprint)(input)).toEqual(input)
    const eight = Array.from({ length: 8 }, (_, index) => index.toString(16).repeat(64))
    expect(
      Schema.decodeUnknownSync(RelaySprint.Sprint)({
        knowledge: eight,
        work_packages: [{ id: "current", knowledge: eight }],
      }),
    ).toEqual({ knowledge: eight, work_packages: [{ id: "current", knowledge: eight }] })
    ;[
      [reference, reference],
      Array.from({ length: 9 }, (_, index) => index.toString(16).repeat(64)),
      ["invalid"],
      null,
      JSON.stringify([reference]),
    ].forEach((knowledge) => {
      expect(() => Schema.decodeUnknownSync(RelaySprint.Sprint)({ knowledge, work_packages: [] })).toThrow()
      expect(() => Schema.decodeUnknownSync(RelaySprint.WorkPackage)({ id: "current", knowledge })).toThrow()
    })
  })

  test("optional fields omit undefined on encoding and preserve absent legacy shapes", () => {
    const legacy = { work_packages: [{ id: "current" }] }
    expect(Schema.encodeSync(RelaySprint.Sprint)(Schema.decodeUnknownSync(RelaySprint.Sprint)(legacy))).toEqual(legacy)
    expect(
      Schema.encodeSync(RelaySprint.Sprint)({
        knowledge: undefined,
        work_packages: [{ id: "current", knowledge: undefined }],
      }),
    ).toEqual(legacy)
    expect(Schema.encodeSync(RelayArm.WorkflowDefinition)({ ...definition, knowledge: undefined })).toEqual(definition)
    expect(Schema.decodeUnknownSync(RelayArm.WorkflowDefinition)(definition)).toEqual(definition)
    const selected = { ...definition, knowledge: [anchor] }
    expect(
      Schema.encodeSync(RelayArm.WorkflowDefinition)(Schema.decodeUnknownSync(RelayArm.WorkflowDefinition)(selected)),
    ).toEqual(selected)
  })
})
