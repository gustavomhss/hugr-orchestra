export * as RelayWorkflowBinding from "./relay-workflow-binding"

import { createHash } from "node:crypto"
import { isDeepStrictEqual } from "node:util"
import { Effect, Option, Result, Schema } from "effect"
import { RelayArm } from "@orchestra/schema/relay-arm"
import { ProjectID } from "@orchestra/schema/project-id"
import { AuthoringStore } from "@orchestra/relay/authoring/store"
import { AuthoringGraph } from "@orchestra/relay/authoring/graph"
import { AuthoringHook } from "@orchestra/relay/authoring/hook"
import type { RelayAuthoring } from "@orchestra/schema/relay-authoring"
import { RelaySprint } from "@orchestra/schema/relay-sprint"
import { AtlasKnowledge } from "@orchestra/schema/atlas-knowledge"

export class Held extends Schema.TaggedErrorClass<Held>()("RelayWorkflow.Held", {
  reason: Schema.String,
  /** Words for the model after the reason, such as the approved and the supplied values that differ. */
  detail: Schema.optional(Schema.String),
}) {
  override get message() {
    return this.detail === undefined ? `Tool safety HOLD: ${this.reason}` : `Tool safety HOLD: ${this.reason}. ${this.detail}`
  }
}

// A read-only trusted port: the host supplies the selected project's store, never a model-supplied project label.
// Server's RelayDocuments.use can supply this port without a Core -> Server dependency.
export interface PublicationPort {
  readonly projectID: ProjectID
  readonly use: <A, E>(
    read: (store: Pick<AuthoringStore.Interface, "get" | "version" | "documents">) => Effect.Effect<A, E>,
  ) => Effect.Effect<A, E | Held>
  readonly skills: AuthoringGraph.SkillResolver
  readonly knowledge?: (reference: AtlasKnowledge.Reference, authorSessionID: string) => Effect.Effect<AtlasKnowledge.Anchor, Held>
  /** Host-check controls every workflow plan must end on; materialization appends them to the last work package. */
  readonly acceptance?: readonly RelaySprint.Control[]
}

export const acquire = Effect.fn("RelayWorkflowBinding.acquire")(function* (input: {
  readonly port: PublicationPort
  readonly projectID: ProjectID
  readonly documentID: string
  readonly parameters: Readonly<Record<string, string>>
  readonly writePaths: readonly string[]
  readonly authorSessionID?: string
  // A retained binding's publication: materialize that immutable version, not whatever is published now.
  readonly pinned?: RelayArm.WorkflowDefinition["publication"]
}) {
  if (input.port.projectID !== input.projectID)
    return yield* new Held({ reason: "WORKFLOW_PUBLICATION_PROJECT_MISMATCH" })
  return yield* input.port.use((store) => Effect.gen(function* () {
    const live = yield* store.get(input.documentID)
    if (live.id !== input.documentID)
      return yield* new Held({ reason: "WORKFLOW_PUBLICATION_DOCUMENT_MISMATCH" })
    if (!live.active || !live.activeVersionId || live.isArchived)
      return yield* new Held({ reason: "WORKFLOW_PUBLICATION_UNPUBLISHED" })
    const versionID = input.pinned?.activeVersionID ?? live.activeVersionId
    const version = yield* store.version(live.id, versionID)
    if (version.workflowId !== live.id || version.id !== live.id || version.versionId !== versionID)
      return yield* new Held({ reason: "WORKFLOW_PUBLICATION_VERSION_MISMATCH" })
    if (input.pinned && AuthoringStore.checksum(version) !== input.pinned.immutableVersionBodyChecksum)
      return yield* new Held({ reason: "WORKFLOW_PUBLICATION_DRIFT" })
    yield* AuthoringStore.runnable(version).pipe(
      Effect.mapError(() => new Held({ reason: "WORKFLOW_TOOLING_NOT_RUNNABLE" })),
    )
    const compiled = yield* AuthoringGraph.compile(version, input.port.skills).pipe(
      // The compiler can reject the union before the defensive binding-level cap below.
      Effect.mapError((error) => error.code === "knowledge-reference-limit"
        ? new Held({ reason: "WORKFLOW_KNOWLEDGE_REFERENCE_LIMIT" })
        : error.code === "control-empty"
          ? new Held({ reason: "WORKFLOW_CONTROL_EMPTY", detail: error.message })
          : error),
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
    // The required acceptance is part of the materialized bytes, so the plan revision the owner approves carries it.
    const materialized = attach(compiled.sprint, input.port.acceptance)
    const bytes = Buffer.from(JSON.stringify(materialized), "utf8")
    // Draft saves rewrite the document row but never a version, so only unpublishing, or for a new binding a
    // republish, during acquisition changes what is bound.
    const after = yield* store.get(live.id)
    if (!after.active || !after.activeVersionId || after.isArchived ||
      (!input.pinned && after.activeVersionId !== live.activeVersionId))
      return yield* new Held({ reason: "WORKFLOW_PUBLICATION_DRIFT" })
    const definition = Schema.decodeUnknownSync(RelayArm.WorkflowDefinition)({
      // The live checksum records the document row at binding time; a retained binding keeps it as recorded.
      publication: input.pinned ?? {
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
    return { definition, sprint: materialized, bytes }
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
  // A bound run keeps its immutable published version: draft saves and later publishes do not hold it, unpublishing does.
  const current = yield* acquire({ port, projectID: expected.publication.projectID,
    documentID: expected.publication.documentID, parameters: expected.parameters, writePaths: expected.writePaths,
    authorSessionID: author, pinned: expected.publication })
  if (!isDeepStrictEqual(current.definition.resolvedSkills, expected.resolvedSkills))
    return yield* new Held({ reason: "WORKFLOW_SKILL_DRIFT" })
  if (!isDeepStrictEqual(current.definition.materialization, expected.materialization))
    return yield* new Held({ reason: "WORKFLOW_MATERIALIZATION_DRIFT" })
  if (!isDeepStrictEqual(current.definition.knowledge, expected.knowledge))
    return yield* new Held({ reason: "WORKFLOW_KNOWLEDGE_DRIFT" })
  return current
})

/**
 * What acquisition admits before it binds anything: a profile whose tools exist, a sprint that compiles with its skills,
 * and no step kind the arm cannot run (`human` records `unknown-kind`). A refusal says why in words for the owner.
 */
export const admission = (
  document: RelayAuthoring.Document | RelayAuthoring.Version,
  skills: AuthoringGraph.SkillResolver,
) =>
  AuthoringStore.runnable(document).pipe(
    Effect.andThen(AuthoringGraph.compile(document, skills)),
    Effect.flatMap((compiled) => compiled.sprint.work_packages.some((wp) => wp.kind === "human")
      ? Effect.fail(new AuthoringGraph.Refusal({ status: 409, code: "step-unsupported",
        message: "Human approval steps cannot run yet. Remove them to run this workflow." }))
      : Effect.succeed(compiled.sprint)),
  )

/**
 * Every workflow in the project as Maestro may select it: a published one with its admitted sprint, or the reason it
 * cannot run. Hooks are not workflows and are left out.
 */
export const catalog = Effect.fn("RelayWorkflowBinding.catalog")(function* (port: PublicationPort) {
  return yield* port.use((store) => Effect.gen(function* () {
    const workflows = (yield* store.documents()).filter((document) => !AuthoringHook.isHook(document))
    return yield* Effect.forEach(workflows, (live) => Effect.gen(function* () {
      const published = live.active && live.activeVersionId && !live.isArchived ? live.activeVersionId : undefined
      const admitted = published
        ? yield* store.version(live.id, published).pipe(
          Effect.flatMap((version) => admission(version, port.skills)),
          Effect.map((sprint) => attach(sprint, port.acceptance)),
          Effect.result,
        )
        : undefined
      return {
        id: live.id,
        name: live.name,
        description: live.description ?? "",
        publishedVersionID: published,
        sprint: admitted && Result.isSuccess(admitted) ? admitted.success : undefined,
        reason: !admitted ? "It is not published." : Result.isFailure(admitted) ? admitted.failure.message : undefined,
      }
    }))
  }))
})

/**
 * The sprint with each required acceptance control appended to its last work package. A control is left out when that
 * step already runs its host check or the sprint already uses its id, so a plan that carries them stays byte-identical.
 */
export function attach(sprint: RelaySprint.Sprint, acceptance: readonly RelaySprint.Control[] = []): RelaySprint.Sprint {
  const last = sprint.work_packages.at(-1)
  const ids = new Set(sprint.work_packages.flatMap((wp) => wp.checklist ?? []).map((control) => control.id))
  const missing = acceptance.filter((control) => !ids.has(control.id) &&
    !last?.checklist?.some((existing) => existing.host_check === control.host_check))
  if (!last || !missing.length) return sprint
  return { ...sprint, work_packages: [...sprint.work_packages.slice(0, -1),
    { ...last, checklist: [...(last.checklist ?? []), ...missing] }] }
}

export function knowledgeReferences(sprint: RelaySprint.Sprint) {
  return [...new Set([...(sprint.knowledge ?? []), ...sprint.work_packages.flatMap((wp) => wp.knowledge ?? [])])]
}

export function knowledgeReference(anchor: Omit<AtlasKnowledge.Anchor, "reference">) {
  return digest(Buffer.from(AtlasKnowledge.canonical(anchor), "utf8"))
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
