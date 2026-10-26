export * as WorkflowRelayV2 from "./relay"

import { Buffer } from "node:buffer"
import path from "node:path"
import { Effect } from "effect"
import { AuthoringGraph } from "@orchestra/relay/authoring/graph"
import { AuthoringStore } from "@orchestra/relay/authoring/store"
import { Location } from "@orchestra/core/location"
import { LocationServiceMap } from "@orchestra/core/location-services"
import { Relay } from "@orchestra/core/relay"
import { RelayWorkflowBinding } from "@orchestra/core/relay-workflow-binding"
import { AbsolutePath } from "@orchestra/core/schema"
import type { ProjectID } from "@orchestra/schema/project-id"
import { WorkflowKnowledgeV2 } from "./knowledge"

/** The host checks every workflow Task requires on its plan's last step: users never author host checks. */
export const GLOBAL_ACCEPTANCE = ["package-verification", "cold-review"]

/** What the host attaches to every workflow plan as it materializes it, so the plan the owner approves carries them. */
export const ACCEPTANCE_CONTROLS = GLOBAL_ACCEPTANCE.map((name) => ({ id: name, host_check: name }))

/**
 * The Relay of a V2 placement: the Location's own Relay service, which carries the authoring store root and the
 * workflow step session (`currentStep`, `transition`, `audit`). A Location that cannot open holds.
 */
export const relay = Effect.fn("WorkflowRelayV2.relay")(function* (placement: { readonly directory: string }) {
  const locations = yield* LocationServiceMap.Service
  return yield* Relay.Service.use(Effect.succeed).pipe(
    Effect.provide(locations.get(Location.Ref.make({ directory: AbsolutePath.make(placement.directory) }))),
    Effect.mapError(() => new RelayWorkflowBinding.Held({ reason: "WORKFLOW_HOST_ACQUISITION" })),
  )
})

/**
 * The published authoring documents a workflow plan binds to, read through the placement's Relay store, with the
 * placement's skill catalog for the skills they name, the Atlas anchors they cite and the global acceptance checks.
 * The caller supplies the placement's Relay: a Location tool its own, the global workflow host the one `relay` opens.
 * A Relay whose data root names another project holds before any document is read.
 */
export const publication = Effect.fn("WorkflowRelayV2.publication")(function* (
  service: Relay.Interface,
  placement: { readonly projectID: ProjectID },
  services: WorkflowKnowledgeV2.Services,
) {
  if (path.basename(service.paths.root) !== placement.projectID)
    return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_PUBLICATION_PROJECT_MISMATCH" })
  return {
    projectID: placement.projectID,
    acceptance: ACCEPTANCE_CONTROLS,
    knowledge: (reference, authorSessionID) =>
      WorkflowKnowledgeV2.resolve(services, { projectID: placement.projectID, authorSessionID, reference }).pipe(
        Effect.mapError((error) => new RelayWorkflowBinding.Held({ reason: `WORKFLOW_KNOWLEDGE_${error.reason}` })),
      ),
    skills: (name) =>
      services.atlas.skills.list().pipe(
        Effect.flatMap((list) => {
          const skill = list.find((entry) => entry.name === name)
          if (!skill || !skill.content.trim() || skill.content.includes("\0") || Buffer.byteLength(skill.content) > 2 * 1024 * 1024)
            return Effect.fail(new AuthoringGraph.Refusal({ status: 404, code: "skill-unavailable", message: "Skill unavailable" }))
          return Effect.succeed({
            id: skill.name,
            content: skill.content,
            sha256: RelayWorkflowBinding.digest(Buffer.from(skill.content)),
          })
        }),
      ),
    use: <A, E>(read: (store: Pick<AuthoringStore.Interface, "get" | "version" | "documents">) => Effect.Effect<A, E>) =>
      Effect.scoped(
        Effect.gen(function* () {
          const store = yield* AuthoringStore.open(service.paths.root, placement.projectID)
          return yield* read({ get: store.get, version: store.version, documents: store.documents })
        }),
      ).pipe(
        // The store opens synchronously and dies on a bad database; that is an acquisition hold, not a crash.
        Effect.catchDefect(() => Effect.fail(new RelayWorkflowBinding.Held({ reason: "WORKFLOW_PUBLICATION_ACQUISITION" }))),
      ),
  } satisfies RelayWorkflowBinding.PublicationPort
})
