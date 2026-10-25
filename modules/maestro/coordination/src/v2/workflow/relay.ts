export * as WorkflowRelayV2 from "./relay"

import path from "node:path"
import { Effect } from "effect"
import { AuthoringStore } from "@orchestra/relay/authoring/store"
import { Location } from "@orchestra/core/location"
import { LocationServiceMap } from "@orchestra/core/location-services"
import { Relay } from "@orchestra/core/relay"
import { RelayWorkflowBinding } from "@orchestra/core/relay-workflow-binding"
import { AbsolutePath } from "@orchestra/core/schema"
import type { ProjectID } from "@orchestra/schema/project-id"

/**
 * The Relay of a V2 placement: the Location's own Relay service, which carries the authoring store root and the
 * workflow step session (`currentStep`, `transition`, `audit`). A Location that cannot open holds, as V1's host does.
 */
export const relay = Effect.fn("WorkflowRelayV2.relay")(function* (placement: { readonly directory: string }) {
  const locations = yield* LocationServiceMap.Service
  return yield* Relay.Service.use(Effect.succeed).pipe(
    Effect.provide(locations.get(Location.Ref.make({ directory: AbsolutePath.make(placement.directory) }))),
    Effect.mapError(() => new RelayWorkflowBinding.Held({ reason: "WORKFLOW_HOST_ACQUISITION" })),
  )
})

/**
 * The published authoring documents a workflow plan binds to, read through the placement's Relay store.
 * A Relay whose data root names another project holds before any document is read.
 */
export const publication = Effect.fn("WorkflowRelayV2.publication")(function* (placement: {
  readonly directory: string
  readonly projectID: ProjectID
}) {
  const service = yield* relay(placement)
  if (path.basename(service.paths.root) !== placement.projectID)
    return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_PUBLICATION_PROJECT_MISMATCH" })
  return {
    projectID: placement.projectID,
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
  } satisfies Pick<RelayWorkflowBinding.PublicationPort, "projectID" | "use">
})
