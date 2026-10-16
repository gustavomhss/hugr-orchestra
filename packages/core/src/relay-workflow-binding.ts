export * as RelayWorkflowBinding from "./relay-workflow-binding"

import { createHash } from "node:crypto"
import { isDeepStrictEqual } from "node:util"
import { Effect, Option, Schema } from "effect"
import { RelayArm } from "@orchestra/schema/relay-arm"
import { ProjectID } from "@orchestra/schema/project-id"
import { AuthoringStore } from "@orchestra/relay/authoring/store"
import { AuthoringGraph } from "@orchestra/relay/authoring/graph"
import { RelaySprint } from "@orchestra/schema/relay-sprint"
import { AtlasKnowledge } from "@orchestra/schema/atlas-knowledge"

export class Held extends Schema.TaggedErrorClass<Held>()("RelayWorkflow.Held", {
  reason: Schema.String,
}) {
  override get message() {
    return `Tool safety HOLD: ${this.reason}`
  }
}

// A read-only trusted port: the host supplies the selected project's store, never a model-supplied project label.
// Server's RelayDocuments.use can supply this port without a Core -> Server dependency.
export interface PublicationPort {
  readonly projectID: ProjectID
  readonly use: <A, E>(
    read: (store: Pick<AuthoringStore.Interface, "get" | "version">) => Effect.Effect<A, E>,
  ) => Effect.Effect<A, E | Held>
  readonly skills: AuthoringGraph.SkillResolver
  readonly knowledge?: (reference: AtlasKnowledge.Reference, authorSessionID: string) => Effect.Effect<AtlasKnowledge.Anchor, Held>
}

export const acquire = Effect.fn("RelayWorkflowBinding.acquire")(function* (input: {
  readonly port: PublicationPort
  readonly projectID: ProjectID
  readonly documentID: string
  readonly parameters: Readonly<Record<string, string>>
  readonly writePaths: readonly string[]
  readonly authorSessionID?: string
}) {
  if (input.port.projectID !== input.projectID)
    return yield* new Held({ reason: "WORKFLOW_PUBLICATION_PROJECT_MISMATCH" })
  return yield* input.port.use((store) => Effect.gen(function* () {
    const live = yield* store.get(input.documentID)
    if (live.id !== input.documentID)
      return yield* new Held({ reason: "WORKFLOW_PUBLICATION_DOCUMENT_MISMATCH" })
    if (!live.active || !live.activeVersionId || live.isArchived)
      return yield* new Held({ reason: "WORKFLOW_PUBLICATION_UNPUBLISHED" })
    const version = yield* store.version(live.id, live.activeVersionId)
    if (version.workflowId !== live.id || version.id !== live.id || version.versionId !== live.activeVersionId)
      return yield* new Held({ reason: "WORKFLOW_PUBLICATION_VERSION_MISMATCH" })
    yield* AuthoringStore.runnable(version).pipe(
      Effect.mapError(() => new Held({ reason: "WORKFLOW_TOOLING_NOT_RUNNABLE" })),
    )
    const compiled = yield* AuthoringGraph.compile(version, input.port.skills).pipe(
      // The compiler can reject the union before the defensive binding-level cap below.
      Effect.mapError((error) => error.message === "A workflow may select at most 8 distinct Atlas references"
        ? new Held({ reason: "WORKFLOW_KNOWLEDGE_REFERENCE_LIMIT" }) : error),
    )
    const sprint = Schema.decodeUnknownOption(RelaySprint.Sprint)(compiled.sprint)
    if (Option.isNone(sprint) || !compiled.sprint.work_packages.length ||
      compiled.sprint.work_packages.some((wp) => wp.kind === "human"))
      return yield* new Held({ reason: "WORKFLOW_TOOLING_NOT_RUNNABLE" })
    if (compiled.bindings.some((skill) => digest(Buffer.from(skill.content, "utf8")) !== skill.sha256))
      return yield* new Held({ reason: "WORKFLOW_SKILL_DIGEST_MISMATCH" })
    const references = knowledgeReferences(sprint.value)
    if (references.length > AtlasKnowledge.MAX_UNITS)
      return yield* new Held({ reason: "WORKFLOW_KNOWLEDGE_REFERENCE_LIMIT" })
    const resolver = input.port.knowledge
    const author = input.authorSessionID
    if (references.length && !author)
      return yield* new Held({ reason: "WORKFLOW_KNOWLEDGE_AUTHOR_MISSING" })
    if (references.length && !resolver)
      return yield* new Held({ reason: "WORKFLOW_KNOWLEDGE_RESOLVER_MISSING" })
    const resolved = resolver && author && references.length
      ? yield* Effect.forEach(references, (reference) => resolver(reference, author).pipe(Effect.flatMap((value) => {
        const decoded = Schema.decodeUnknownOption(AtlasKnowledge.Anchor)(value, { onExcessProperty: "error" })
        if (Option.isNone(decoded)) return Effect.fail(new Held({ reason: "WORKFLOW_KNOWLEDGE_INVALID" }))
        return decoded.value.reference === reference ? Effect.succeed(decoded.value)
          : Effect.fail(new Held({ reason: "WORKFLOW_KNOWLEDGE_REFERENCE_MISMATCH" }))
      }))) : undefined
    const knowledge = validateKnowledge({ sprint: sprint.value, knowledge: resolved,
      projectID: input.projectID, authorSessionID: author })
    if (knowledge instanceof Held) return yield* knowledge
    const bytes = Buffer.from(JSON.stringify(compiled.sprint), "utf8")
    const after = yield* store.get(live.id)
    if (!after.active || after.activeVersionId !== live.activeVersionId ||
      AuthoringStore.checksum(after) !== AuthoringStore.checksum(live))
      return yield* new Held({ reason: "WORKFLOW_PUBLICATION_DRIFT" })
    const definition = Schema.decodeUnknownSync(RelayArm.WorkflowDefinition)({
      publication: {
        projectID: input.projectID,
        documentID: live.id,
        activeVersionID: live.activeVersionId,
        immutableVersionBodyChecksum: AuthoringStore.checksum(version),
        livePublicationChecksum: AuthoringStore.checksum(live),
      },
      materialization: { schemaIdentifier: "RelaySprint.Sprint", digest: digest(bytes), byteLength: bytes.length },
      resolvedSkills: compiled.bindings,
      parameters: input.parameters,
      writePaths: input.writePaths,
      ...(knowledge.length ? { knowledge } : {}),
    })
    return { definition, sprint: compiled.sprint, bytes }
  })).pipe(Effect.mapError((error) => error instanceof Held
    ? error : new Held({ reason: "WORKFLOW_PUBLICATION_ACQUISITION" })))
})

export const revalidate = Effect.fn("RelayWorkflowBinding.revalidate")(function* (
  port: PublicationPort,
  expected: RelayArm.WorkflowDefinition,
) {
  const author = expected.knowledge?.[0]?.authorSessionID
  if (expected.knowledge?.some((anchor) => anchor.authorSessionID !== author))
    return yield* new Held({ reason: "WORKFLOW_KNOWLEDGE_AUTHOR_MISMATCH" })
  const current = yield* acquire({ port, projectID: expected.publication.projectID,
    documentID: expected.publication.documentID, parameters: expected.parameters, writePaths: expected.writePaths,
    authorSessionID: author })
  if (!isDeepStrictEqual(current.definition.publication, expected.publication))
    return yield* new Held({ reason: "WORKFLOW_PUBLICATION_DRIFT" })
  if (!isDeepStrictEqual(current.definition.resolvedSkills, expected.resolvedSkills))
    return yield* new Held({ reason: "WORKFLOW_SKILL_DRIFT" })
  if (!isDeepStrictEqual(current.definition.materialization, expected.materialization))
    return yield* new Held({ reason: "WORKFLOW_MATERIALIZATION_DRIFT" })
  if (!isDeepStrictEqual(current.definition.knowledge, expected.knowledge))
    return yield* new Held({ reason: "WORKFLOW_KNOWLEDGE_DRIFT" })
  return current
})

export function knowledgeReferences(sprint: RelaySprint.Sprint) {
  return [...new Set([...(sprint.knowledge ?? []), ...sprint.work_packages.flatMap((wp) => wp.knowledge ?? [])])]
}

// Reconstruct schema-order fields: decoding preserves input property order, which must not choose the digest.
export function knowledgeReference(anchor: Omit<AtlasKnowledge.Anchor, "reference">) {
  return digest(Buffer.from(JSON.stringify({
    projectID: anchor.projectID,
    authorSessionID: anchor.authorSessionID,
    assistantMessageID: anchor.assistantMessageID,
    callID: anchor.callID,
    memberID: anchor.memberID,
    target: { kind: anchor.target.kind, id: anchor.target.id },
    units: anchor.units.map((unit) => ({
      unit: unit.unit, name: unit.name, sourceIdentity: unit.sourceIdentity, sourceRevision: unit.sourceRevision,
      contentHash: unit.contentHash, receiptHash: unit.receiptHash, bodyHash: unit.bodyHash, content: unit.content,
    })),
  }), "utf8"))
}

// Pure binding validation is shared by acquisition and the read-only arm view. Target is a proposed identity;
// only the trusted publication's explicit reference selection binds it, never an inferred durable Task/sprint ID.
export function validateKnowledge(input: {
  readonly sprint: RelaySprint.Sprint
  readonly knowledge?: readonly AtlasKnowledge.Anchor[]
  readonly projectID: ProjectID
  readonly authorSessionID?: string
}) {
  const references = knowledgeReferences(input.sprint)
  if (references.length > AtlasKnowledge.MAX_UNITS)
    return new Held({ reason: "WORKFLOW_KNOWLEDGE_REFERENCE_LIMIT" })
  if (references.length && !input.knowledge)
    return new Held({ reason: "WORKFLOW_KNOWLEDGE_BINDING_MISSING" })
  if (references.length && !input.authorSessionID)
    return new Held({ reason: "WORKFLOW_KNOWLEDGE_AUTHOR_MISSING" })
  const decoded = Schema.decodeUnknownOption(Schema.Array(AtlasKnowledge.Anchor))(
    input.knowledge ?? [], { onExcessProperty: "error" })
  if (Option.isNone(decoded)) return new Held({ reason: "WORKFLOW_KNOWLEDGE_INVALID" })
  const anchors = decoded.value
  if (anchors.length !== references.length || new Set(anchors.map((anchor) => anchor.reference)).size !== anchors.length)
    return new Held({ reason: "WORKFLOW_KNOWLEDGE_REFERENCE_MISMATCH" })
  const checked = anchors.map((anchor) => {
    if (anchor.projectID !== input.projectID)
      return new Held({ reason: "WORKFLOW_KNOWLEDGE_PROJECT_MISMATCH" })
    if (anchor.authorSessionID !== input.authorSessionID)
      return new Held({ reason: "WORKFLOW_KNOWLEDGE_AUTHOR_MISMATCH" })
    if (!references.includes(anchor.reference))
      return new Held({ reason: "WORKFLOW_KNOWLEDGE_REFERENCE_MISMATCH" })
    if (new Set(anchor.units.map((unit) => unit.unit)).size !== anchor.units.length)
      return new Held({ reason: "WORKFLOW_KNOWLEDGE_UNIT_DUPLICATE" })
    if (anchor.units.some((unit) => digest(Buffer.from(unit.content, "utf8")) !== unit.bodyHash))
      return new Held({ reason: "WORKFLOW_KNOWLEDGE_BODY_MISMATCH" })
    if (knowledgeReference(anchor) !== anchor.reference)
      return new Held({ reason: "WORKFLOW_KNOWLEDGE_DIGEST_MISMATCH" })
    return anchor
  })
  const held = checked.find((anchor) => anchor instanceof Held)
  if (held instanceof Held) return held
  if (anchors.reduce((total, anchor) => total + anchor.units.reduce(
    (bytes, unit) => bytes + Buffer.byteLength(unit.content, "utf8"), 0), 0) > AtlasKnowledge.MAX_BYTES)
    return new Held({ reason: "WORKFLOW_KNOWLEDGE_CONTENT_LIMIT" })
  return anchors
}

export function digest(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex")
}
