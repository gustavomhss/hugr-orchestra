export * as RelayWorkflowBinding from "./relay-workflow-binding"

import { createHash } from "node:crypto"
import { isDeepStrictEqual } from "node:util"
import { Effect, Option, Schema } from "effect"
import { RelayArm } from "@orchestra/schema/relay-arm"
import { ProjectID } from "@orchestra/schema/project-id"
import { AuthoringStore } from "@orchestra/relay/authoring/store"
import { AuthoringGraph } from "@orchestra/relay/authoring/graph"
import { RelaySprint } from "@orchestra/schema/relay-sprint"

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
}

export const acquire = Effect.fn("RelayWorkflowBinding.acquire")(function* (input: {
  readonly port: PublicationPort
  readonly projectID: ProjectID
  readonly documentID: string
  readonly parameters: Readonly<Record<string, string>>
  readonly writePaths: readonly string[]
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
    const compiled = yield* AuthoringGraph.compile(version, input.port.skills)
    const sprint = Schema.decodeUnknownOption(RelaySprint.Sprint)(compiled.sprint)
    if (Option.isNone(sprint) || !compiled.sprint.work_packages.length ||
      compiled.sprint.work_packages.some((wp) => wp.kind === "human"))
      return yield* new Held({ reason: "WORKFLOW_TOOLING_NOT_RUNNABLE" })
    if (compiled.bindings.some((skill) => digest(Buffer.from(skill.content, "utf8")) !== skill.sha256))
      return yield* new Held({ reason: "WORKFLOW_SKILL_DIGEST_MISMATCH" })
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
    })
    return { definition, sprint: compiled.sprint, bytes }
  })).pipe(Effect.mapError((error) => error instanceof Held
    ? error : new Held({ reason: "WORKFLOW_PUBLICATION_ACQUISITION" })))
})

export const revalidate = Effect.fn("RelayWorkflowBinding.revalidate")(function* (
  port: PublicationPort,
  expected: RelayArm.WorkflowDefinition,
) {
  const current = yield* acquire({ port, projectID: expected.publication.projectID,
    documentID: expected.publication.documentID, parameters: expected.parameters, writePaths: expected.writePaths })
  if (!isDeepStrictEqual(current.definition.publication, expected.publication))
    return yield* new Held({ reason: "WORKFLOW_PUBLICATION_DRIFT" })
  if (!isDeepStrictEqual(current.definition.resolvedSkills, expected.resolvedSkills))
    return yield* new Held({ reason: "WORKFLOW_SKILL_DRIFT" })
  if (!isDeepStrictEqual(current.definition.materialization, expected.materialization))
    return yield* new Held({ reason: "WORKFLOW_MATERIALIZATION_DRIFT" })
  return current
})

export function digest(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex")
}
