import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import { Agent } from "../src/agent"
import { Capability } from "../src/capability"
import { Location } from "../src/location"
import { AbsolutePath } from "../src/schema"
import { Project } from "../src/project"
import { SessionID } from "../src/session-id"
import { SessionMessage } from "../src/session-message"

const ids: ReadonlyArray<{ schema: Schema.Codec<string> & { create: () => string }; prefix: string; name: string }> = [
  { schema: Capability.ConnectionID, prefix: "cconn_", name: "ConnectionID" },
  { schema: Capability.TargetID, prefix: "ctgt_", name: "TargetID" },
  { schema: Capability.DescriptorID, prefix: "cdesc_", name: "DescriptorID" },
  { schema: Capability.ArtifactID, prefix: "cart_", name: "ArtifactID" },
  { schema: Capability.JobID, prefix: "cjob_", name: "JobID" },
  { schema: Capability.ScheduleID, prefix: "csched_", name: "ScheduleID" },
  { schema: Capability.OccurrenceID, prefix: "cocc_", name: "OccurrenceID" },
  { schema: Capability.DeliveryID, prefix: "cdel_", name: "DeliveryID" },
  { schema: Capability.SecretBindingID, prefix: "csec_", name: "SecretBindingID" },
]

const connection = { id: Capability.ConnectionID.create(), provider: "example", generation: 0 }
const target = {
  id: Capability.TargetID.create(),
  connectionID: connection.id,
  generation: 0,
  environment: "sandbox",
}
const descriptor = {
  id: Capability.DescriptorID.create(),
  schemaHash: "aB01".repeat(16),
  catalogGeneration: 0,
  connectionID: connection.id,
  targetID: target.id,
}
const artifact = { id: Capability.ArtifactID.create(), revision: 0 }
const invocation = {
  sessionID: SessionID.create(),
  agentID: Agent.ID.make("backend"),
  assistantMessageID: SessionMessage.ID.create(),
  callID: "call-1",
}
const owner = {
  projectID: Project.ID.make("project"),
  location: { directory: AbsolutePath.make("/workspace") },
  sessionID: invocation.sessionID,
  agentID: invocation.agentID,
}

describe("capability contracts", () => {
  test.each([...ids])("$name validates generated IDs and exact wire syntax", ({ schema, prefix }) => {
    const value = schema.create()
    expect(value).toMatch(new RegExp(`^${prefix}[0-9A-Za-z]{26}$`))
    expect(Schema.decodeUnknownSync(schema)(value)).toBe(value)
    expect(schema.create()).not.toBe(value)
    ;[
      `wrong_${value.slice(prefix.length)}`,
      prefix.slice(0, -1) + value.slice(prefix.length),
      prefix + "a".repeat(25),
      prefix + "a".repeat(27),
      prefix + "a".repeat(25) + "-",
      value + "\n",
    ].forEach((invalid) => expect(() => Schema.decodeUnknownSync(schema)(invalid)).toThrow())
  })

  test("refs decode actual IDs and reject wrong ID kinds and invalid generations", () => {
    expect(Schema.decodeUnknownSync(Capability.ConnectionRef)(connection)).toEqual(connection)
    expect(Schema.decodeUnknownSync(Capability.TargetRef)(target)).toEqual(target)
    expect(Schema.decodeUnknownSync(Capability.DescriptorRef)(descriptor)).toEqual(descriptor)
    expect(Schema.decodeUnknownSync(Capability.ArtifactRef)(artifact)).toEqual(artifact)
    expect(Schema.decodeUnknownSync(Capability.JobRef)({ id: Capability.JobID.create() }).id).toStartWith("cjob_")
    expect(() => Schema.decodeUnknownSync(Capability.ConnectionRef)({ ...connection, id: target.id })).toThrow()
    expect(() => Schema.decodeUnknownSync(Capability.TargetRef)({ ...target, connectionID: target.id })).toThrow()
    expect(() =>
      Schema.decodeUnknownSync(Capability.DescriptorRef)({ ...descriptor, targetID: connection.id }),
    ).toThrow()
    expect(() => Schema.decodeUnknownSync(Capability.ArtifactRef)({ ...artifact, id: connection.id })).toThrow()
    expect(() => Schema.decodeUnknownSync(Capability.JobRef)({ id: artifact.id })).toThrow()
    ;[-1, 0.5, "0", NaN, Infinity].forEach((generation) => {
      expect(() => Schema.decodeUnknownSync(Capability.ConnectionRef)({ ...connection, generation })).toThrow()
      expect(() => Schema.decodeUnknownSync(Capability.TargetRef)({ ...target, generation })).toThrow()
      expect(() =>
        Schema.decodeUnknownSync(Capability.DescriptorRef)({ ...descriptor, catalogGeneration: generation }),
      ).toThrow()
      expect(() => Schema.decodeUnknownSync(Capability.ArtifactRef)({ ...artifact, revision: generation })).toThrow()
    })
    expect(() => Schema.decodeUnknownSync(Capability.ConnectionRef)({ ...connection, provider: "" })).toThrow()
    expect(() => Schema.decodeUnknownSync(Capability.TargetRef)({ ...target, environment: "" })).toThrow()
  })

  test("descriptor fingerprints require exactly SHA-256 hex", () => {
    ;["a".repeat(63), "a".repeat(65), "g".repeat(64), descriptor.schemaHash + "\n"].forEach((schemaHash) =>
      expect(() => Schema.decodeUnknownSync(Capability.DescriptorRef)({ ...descriptor, schemaHash })).toThrow(),
    )
  })

  test("invocation and owner reuse canonical identity schemas", () => {
    expect(Schema.decodeUnknownSync(Capability.InvocationRef)(invocation)).toEqual(invocation)
    expect(Schema.decodeUnknownSync(Capability.Owner)(owner)).toEqual(owner)
    expect(Capability.InvocationRef.fields.sessionID).toBe(SessionID)
    expect(Capability.InvocationRef.fields.agentID).toBe(Agent.ID)
    expect(Capability.InvocationRef.fields.assistantMessageID).toBe(SessionMessage.ID)
    expect(Capability.Owner.fields.projectID).toBe(Project.ID)
    expect(Capability.Owner.fields.location).toBe(Location.Ref)
    expect(() =>
      Schema.decodeUnknownSync(Capability.InvocationRef)({ ...invocation, sessionID: connection.id }),
    ).toThrow()
    expect(() =>
      Schema.decodeUnknownSync(Capability.InvocationRef)({ ...invocation, assistantMessageID: artifact.id }),
    ).toThrow()
    expect(() => Schema.decodeUnknownSync(Capability.InvocationRef)({ ...invocation, callID: "" })).toThrow()
    expect(() => Schema.decodeUnknownSync(Capability.Owner)({ ...owner, sessionID: target.id })).toThrow()
    expect(() => Schema.decodeUnknownSync(Capability.Owner)({ ...owner, location: {} })).toThrow()
  })

  test("strict refs reject unexpected secret fields including nested placement", () => {
    expect(() => Schema.decodeUnknownSync(Capability.ConnectionRef)({ ...connection, accessToken: "secret" })).toThrow()
    expect(() => Schema.decodeUnknownSync(Capability.TargetRef)({ ...target, credentials: {} })).toThrow()
    expect(() => Schema.decodeUnknownSync(Capability.DescriptorRef)({ ...descriptor, secret: "secret" })).toThrow()
    expect(() => Schema.decodeUnknownSync(Capability.ArtifactRef)({ ...artifact, signedURL: "secret" })).toThrow()
    expect(() =>
      Schema.decodeUnknownSync(Capability.JobRef)({ id: Capability.JobID.create(), token: "secret" }),
    ).toThrow()
    expect(() => Schema.decodeUnknownSync(Capability.InvocationRef)({ ...invocation, authority: "secret" })).toThrow()
    expect(() => Schema.decodeUnknownSync(Capability.Owner)({ ...owner, token: "secret" })).toThrow()
    expect(() =>
      Schema.decodeUnknownSync(Capability.Owner)({ ...owner, location: { ...owner.location, secret: "secret" } }),
    ).toThrow()
  })

  test("root export preserves canonical namespace identity", async () => {
    const root = await import("../src/index")
    expect(root.Capability).toBe(Capability)
  })
})
