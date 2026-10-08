import { describe, expect, test } from "bun:test"
import { Schema, SchemaAST } from "effect"
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

  test("completed requires verification and artifact evidence", () => {
    const input = {
      status: "completed",
      receipt: "receipt-1",
      summary: "Published",
      artifactRefs: [artifact],
      verification: "verified",
    } satisfies Capability.Completed
    expect(Schema.decodeUnknownSync(Capability.Result)(input)).toEqual(input)
    expect(() => Schema.decodeUnknownSync(Capability.Result)({ ...input, status: "success" })).toThrow()
    expect(() => Schema.decodeUnknownSync(Capability.Result)({ ...input, verification: undefined })).toThrow()
    expect(() => Schema.decodeUnknownSync(Capability.Result)({ ...input, artifactRefs: undefined })).toThrow()
    expect(() => Schema.decodeUnknownSync(Capability.Result)({ ...input, verification: "assumed" })).toThrow()
    expect(() => Schema.decodeUnknownSync(Capability.Result)({ ...input, receipt: "" })).toThrow()
    expect(() => Schema.decodeUnknownSync(Capability.Result)({ ...input, receipt: { id: "receipt-1" } })).toThrow()
  })

  test("submitted and pending stay distinct from completion", () => {
    const submitted = {
      status: "submitted",
      receipt: "receipt-2",
      summary: "Queued",
      jobRef: { id: Capability.JobID.create() },
    } satisfies Capability.Submitted
    const pending = {
      status: "pending",
      receipt: "receipt-3",
      summary: "Consent needed",
      userActionRef: "action-1",
    } satisfies Capability.Pending
    expect(Schema.decodeUnknownSync(Capability.Result)(submitted)).toEqual(submitted)
    expect(Schema.decodeUnknownSync(Capability.Result)(pending)).toEqual(pending)
    expect(() => Schema.decodeUnknownSync(Capability.Completed)(submitted)).toThrow()
    expect(() => Schema.decodeUnknownSync(Capability.Completed)(pending)).toThrow()
    expect(() => Schema.decodeUnknownSync(Capability.Result)({ ...submitted, jobRef: undefined })).toThrow()
    expect(() => Schema.decodeUnknownSync(Capability.Result)({ ...pending, userActionRef: "" })).toThrow()
    expect(() => Schema.decodeUnknownSync(Capability.Result)({ ...submitted, verification: "verified" })).toThrow()
  })

  test("partial and unknown retain known effects and reconciliation evidence", () => {
    const partial = {
      status: "partial",
      receipt: "receipt-4",
      summary: "Provider effect known, retention failed",
      completedEffects: ["provider accepted request"],
      unresolvedEffects: ["output not retained"],
      artifactRefs: [artifact],
    } satisfies Capability.Partial
    const unknown = {
      status: "unknown",
      receipt: "receipt-5",
      summary: "Submit response lost",
      reconciliationRef: "reconcile-1",
    } satisfies Capability.Unknown
    expect(Schema.encodeSync(Capability.Result)(Schema.decodeUnknownSync(Capability.Result)(partial))).toEqual(partial)
    expect(Schema.encodeSync(Capability.Result)(Schema.decodeUnknownSync(Capability.Result)(unknown))).toEqual(unknown)
    expect(() => Schema.decodeUnknownSync(Capability.Result)({ ...partial, unresolvedEffects: undefined })).toThrow()
    expect(() => Schema.decodeUnknownSync(Capability.Result)({ ...partial, completedEffects: undefined })).toThrow()
    expect(() => Schema.decodeUnknownSync(Capability.Result)({ ...partial, artifactRefs: undefined })).toThrow()
    expect(() => Schema.decodeUnknownSync(Capability.Result)({ ...unknown, reconciliationRef: "" })).toThrow()
  })

  test("optional fields serialize without undefined keys", () => {
    const unknown = Capability.Unknown.make({
      status: "unknown",
      receipt: "receipt-6",
      summary: "Uncertain",
      reconciliationRef: undefined,
    })
    expect(Schema.encodeSync(Capability.Result)(unknown)).toEqual({
      status: "unknown",
      receipt: "receipt-6",
      summary: "Uncertain",
    })
    expect(
      Schema.encodeSync(Capability.Failure)(
        Capability.Failure.make({
          code: "outcome_unknown",
          message: "Uncertain",
          detail: undefined,
        }),
      ),
    ).toEqual({ _tag: "Failure", code: "outcome_unknown", message: "Uncertain" })
    expect(
      Schema.encodeSync(Capability.Owner)(
        Capability.Owner.make({
          ...owner,
          location: { ...owner.location, workspaceID: undefined },
        }),
      ),
    ).toEqual(owner)
  })

  test("strict results reject secret fields at top level and inside refs", () => {
    const completed = Capability.Completed.make({
      status: "completed",
      receipt: "receipt-7",
      summary: "Published",
      artifactRefs: [artifact],
      verification: "observed",
    })
    expect(() => Schema.decodeUnknownSync(Capability.Result)({ ...completed, accessToken: "secret" })).toThrow()
    expect(() => Schema.encodeUnknownSync(Capability.Result)({ ...completed, accessToken: "secret" })).toThrow()
    expect(() =>
      Schema.decodeUnknownSync(Capability.Result)({
        ...completed,
        artifactRefs: [{ ...artifact, credentials: "secret" }],
      }),
    ).toThrow()
    expect(() =>
      Schema.decodeUnknownSync(Capability.Result)({
        status: "submitted",
        receipt: "receipt-8",
        summary: "Queued",
        jobRef: { id: Capability.JobID.create(), token: "secret" },
      }),
    ).toThrow()
  })

  test("failure uses closed codes and bounded JSON detail", () => {
    const failure = {
      _tag: "Failure",
      code: "authentication_revoked",
      message: "Access revoked",
      detail: { source: "example", status: 401, requestID: "request-1", observations: [true, null] },
    } satisfies Capability.Failure
    expect(Schema.decodeUnknownSync(Capability.Failure)(failure)).toEqual(failure)
    expect(Schema.encodeSync(Capability.Failure)(Schema.decodeUnknownSync(Capability.Failure)(failure))).toEqual(
      failure,
    )
    expect(() => Schema.decodeUnknownSync(Capability.Failure)({ ...failure, code: "provider_error" })).toThrow()
    expect(() => Schema.decodeUnknownSync(Capability.Failure)({ ...failure, _tag: "Error" })).toThrow()
    expect(() => Schema.decodeUnknownSync(Capability.Failure)({ ...failure, secret: "secret" })).toThrow()
    expect(Schema.decodeUnknownSync(Capability.FailureDetail)("a".repeat(4094))).toHaveLength(4094)
    expect(() => Schema.decodeUnknownSync(Capability.FailureDetail)("a".repeat(4095))).toThrow()
    expect(Schema.decodeUnknownSync(Capability.FailureDetail)("é".repeat(2047))).toHaveLength(2047)
    expect(() => Schema.decodeUnknownSync(Capability.FailureDetail)("é".repeat(2048))).toThrow()
    ;[{ value: undefined }, { value: NaN }, { value: Infinity }, { value: 1n }, { value: () => 1 }].forEach((detail) =>
      expect(() => Schema.decodeUnknownSync(Capability.Failure)({ ...failure, detail })).toThrow(),
    )
  })

  test("readiness, verification, error codes and job vocabularies match frozen contracts", () => {
    const sets: Array<{ schema: Schema.Codec<string>; values: string[] }> = [
      {
        schema: Capability.Readiness,
        values: [
          "disabled",
          "absent",
          "acquiring",
          "installed",
          "authentication-required",
          "ready",
          "failed",
          "unsupported",
        ],
      },
      { schema: Capability.Verification, values: ["acknowledged", "observed", "verified"] },
      {
        schema: Capability.ErrorCode,
        values: [
          "connection_unavailable",
          "authentication_required",
          "authentication_revoked",
          "target_denied",
          "ambiguous_target",
          "stale_descriptor",
          "unsupported_operation",
          "unsupported_schema",
          "acquisition_failed",
          "quota_exceeded",
          "outcome_unknown",
          "invocation_binding_missing",
          "invocation_binding_mismatch",
        ],
      },
      { schema: Capability.JobKind, values: ["provider", "local-process", "worker", "script"] },
      {
        schema: Capability.JobState,
        values: [
          "intent",
          "submitting",
          "submitted",
          "running",
          "completed",
          "failed",
          "cancel-requested",
          "cancelled",
          "unknown",
          "lost",
        ],
      },
    ]
    sets.forEach(({ schema, values }) => {
      values.forEach((value) => expect(Schema.decodeUnknownSync(schema)(value)).toBe(value))
      expect(() => Schema.decodeUnknownSync(schema)("unrecognized")).toThrow()
    })
  })

  test.each([
    { label: "ASCII", value: "a".repeat(4094), oversize: "a".repeat(4095) },
    { label: "quotes", value: '"'.repeat(2047), oversize: '"'.repeat(2048) },
    { label: "backslashes", value: "\\".repeat(2047), oversize: "\\".repeat(2048) },
    { label: "newlines", value: "\n".repeat(2047), oversize: "\n".repeat(2048) },
    { label: "control escapes", value: "\0".repeat(682) + "aa", oversize: "\0".repeat(682) + "aaa" },
    { label: "multibyte", value: "é".repeat(2047), oversize: "é".repeat(2048) },
    { label: "astral", value: "😀".repeat(1023) + "aa", oversize: "😀".repeat(1023) + "aaa" },
    { label: "object", value: { value: "a".repeat(4084) }, oversize: { value: "a".repeat(4085) } },
  ])("$label detail budget preserves JSON and rejects oversize in both directions", ({ value, oversize }) => {
    expect(new TextEncoder().encode(JSON.stringify(value)).byteLength).toBe(4096)
    expect(Schema.decodeUnknownSync(Capability.FailureDetail)(value)).toEqual(value)
    expect(Schema.encodeSync(Capability.FailureDetail)(value)).toEqual(value)
    expect(() => Schema.decodeUnknownSync(Capability.FailureDetail)(oversize)).toThrow(
      "Failure detail must not exceed 4096 UTF-8 JSON bytes",
    )
    expect(() => Schema.encodeSync(Capability.FailureDetail)(oversize)).toThrow(
      "Failure detail must not exceed 4096 UTF-8 JSON bytes",
    )
    const failure = { _tag: "Failure", code: "outcome_unknown", message: "Uncertain" } satisfies Capability.Failure
    expect(Schema.decodeUnknownSync(Capability.Failure)({ ...failure, detail: value })).toEqual({
      ...failure,
      detail: value,
    })
    expect(() => Schema.decodeUnknownSync(Capability.Failure)({ ...failure, detail: oversize })).toThrow()
    expect(() => Schema.encodeSync(Capability.Failure)({ ...failure, detail: oversize })).toThrow()
  })

  test("public identifiers remain stable and unique", () => {
    expect(SchemaAST.resolveIdentifier(Capability.FailureDetail.ast)).toBe("Capability.FailureDetail")
    expect(SchemaAST.resolveIdentifier(Capability.Failure.ast)).toBe("Capability.Failure")
    ids.forEach(({ schema, name }) => {
      expect(SchemaAST.resolveIdentifier(schema.ast)).toBe(`Capability.${name}`)
      expect(SchemaAST.resolve(schema.ast)?.brands).toEqual([`Capability.${name}`])
    })
    const schemas = [
      Capability.ConnectionRef,
      Capability.TargetRef,
      Capability.DescriptorRef,
      Capability.ArtifactRef,
      Capability.JobRef,
      Capability.InvocationRef,
      Capability.Owner,
      Capability.Readiness,
      Capability.Verification,
      Capability.Completed,
      Capability.Submitted,
      Capability.Pending,
      Capability.Partial,
      Capability.Unknown,
      Capability.Result,
      Capability.ErrorCode,
      Capability.FailureDetail,
      Capability.Failure,
      Capability.JobKind,
      Capability.JobState,
    ]
    const identifiers = [...ids.map((entry) => entry.schema), ...schemas].map((schema) =>
      SchemaAST.resolveIdentifier(schema.ast),
    )
    expect(
      identifiers.every((identifier) => typeof identifier === "string" && identifier.startsWith("Capability.")),
    ).toBe(true)
    expect(new Set(identifiers).size).toBe(identifiers.length)
  })
})
