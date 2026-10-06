import { Location } from "@opencode-ai/core/location"
import { Relay } from "@opencode-ai/core/relay"
import { SkillV2 } from "@opencode-ai/core/skill"
import { RelayInvalidError } from "@opencode-ai/protocol/groups/relay-document"
import { AuthoringGraph } from "@opencode-ai/relay/authoring/graph"
import { AuthoringHook } from "@opencode-ai/relay/authoring/hook"
import { Effect, Layer, Struct } from "effect"
import { HttpApiBuilder, HttpApiSchema } from "effect/unstable/httpapi"
import { Api } from "../api"
import { response } from "../location"
import { Principal } from "../principal"
import { RelayDocuments } from "../relay-documents"

export const RelayDocumentHandler = HttpApiBuilder.group(Api, "server.relay.document", (handlers) =>
  Effect.gen(function* () {
    const documents = yield* RelayDocuments.Service
    return handlers
      .handle("relay.document.list", () =>
        RelayDocuments.respond(
          documents.use((store) =>
            Effect.gen(function* () {
              const scopes = yield* store.scopes()
              return yield* Effect.forEach(yield* store.documents(), (document) =>
                RelayDocuments.view(store, document, scopes),
              )
            }),
          ),
        ),
      )
      .handle("relay.document.create", (ctx) =>
        RelayDocuments.respond(
          Effect.gen(function* () {
            const skills = RelayDocuments.skills(yield* SkillV2.Service)
            return yield* documents.use((store) =>
              RelayDocuments.save({ store, skills, fields: ctx.payload }).pipe(
                Effect.flatMap((saved) => RelayDocuments.view(store, saved)),
              ),
            )
          }),
        ),
      )
      .handle("relay.document.get", (ctx) =>
        RelayDocuments.respond(
          documents.use((store) =>
            store.get(ctx.params.documentID).pipe(Effect.flatMap((document) => RelayDocuments.view(store, document))),
          ),
        ),
      )
      .handle("relay.document.update", (ctx) =>
        RelayDocuments.respond(
          Effect.gen(function* () {
            const payload = ctx.payload
            const guarded = payload.versionId !== undefined || payload.expectedChecksum !== undefined
            // Python saves unguarded when neither guard is sent; here a save must name what it replaces or force it.
            if (!payload.force && !guarded)
              return yield* RelayDocuments.refusal(
                "Send the versionId or expectedChecksum of the document you edited, or force the save",
                400,
                "invalid-request",
              )
            const skills = RelayDocuments.skills(yield* SkillV2.Service)
            return yield* documents.use((store) =>
              RelayDocuments.save({
                store,
                skills,
                fields: Struct.omit(payload, ["versionId", "expectedChecksum", "force"]),
                id: ctx.params.documentID,
                expectedVersion: payload.force ? undefined : payload.versionId,
                expectedChecksum: payload.force ? undefined : payload.expectedChecksum,
              }).pipe(Effect.flatMap((saved) => RelayDocuments.view(store, saved))),
            )
          }),
        ),
      )
      .handle("relay.document.remove", (ctx) =>
        RelayDocuments.refusals(documents.use((store) => store.remove(ctx.params.documentID))).pipe(
          Effect.as(HttpApiSchema.NoContent.make()),
        ),
      )
      .handle("relay.document.versions", (ctx) =>
        RelayDocuments.respond(documents.use((store) => store.versions(ctx.params.documentID))),
      )
      .handle("relay.document.version", (ctx) =>
        RelayDocuments.respond(documents.use((store) => store.version(ctx.params.documentID, ctx.params.versionID))),
      )
      .handle("relay.document.sprint", (ctx) =>
        RelayDocuments.respond(
          Effect.gen(function* () {
            const skills = RelayDocuments.skills(yield* SkillV2.Service)
            const compiled = yield* documents.use((store) =>
              store
                .get(ctx.params.documentID)
                .pipe(Effect.flatMap((document) => AuthoringGraph.compile(document, skills))),
            )
            return {
              sprint: compiled.sprint,
              skillBindings: compiled.bindings.map((binding) => Struct.omit(binding, ["content"])),
            }
          }),
        ),
      )
      .handle("relay.document.export", (ctx) =>
        RelayDocuments.respond(
          Effect.gen(function* () {
            const skills = RelayDocuments.skills(yield* SkillV2.Service)
            return yield* documents.use((store) =>
              store
                .get(ctx.params.documentID)
                .pipe(Effect.flatMap((document) => RelayDocuments.compile(document, skills))),
            )
          }),
        ),
      )
      .handle("relay.document.check", (ctx) =>
        RelayDocuments.respond(
          Effect.gen(function* () {
            const relay = yield* Relay.Service
            const location = yield* Location.Service
            const skills = RelayDocuments.skills(yield* SkillV2.Service)
            const document = yield* documents.use((store) => store.get(ctx.params.documentID))
            if (AuthoringHook.isHook(document))
              return yield* RelayDocuments.refusal("A hook has no steps to check", 400, "invalid-request")
            const compiled = yield* AuthoringGraph.compile(document, skills)
            return yield* relay
              .check({
                sprint: compiled.sprint,
                workdir: location.directory,
                position: ctx.payload.position,
                counter: ctx.payload.counter,
                baseRef: ctx.payload.baseRef,
                params: ctx.payload.params ?? {},
              })
              .pipe(
                Effect.mapError(
                  (error) =>
                    new RelayInvalidError({
                      code: error._tag === "GateCheck.Busy" ? "busy" : "invalid-plan",
                      message: error._tag === "GateCheck.Busy" ? "Another check holds this state" : error.message,
                    }),
                ),
              )
          }),
        ),
      )
      .handle("relay.document.nodeTypes", () =>
        response(Effect.succeed({ workflow: AuthoringGraph.nodeTypes(), hook: AuthoringHook.nodeTypes() })),
      )
      .handle("relay.scope.list", () => RelayDocuments.respond(documents.use((store) => store.scopes())))
      .handle("relay.scope.create", (ctx) =>
        RelayDocuments.respond(documents.use((store) => store.saveScope(ctx.payload))),
      )
      .handle("relay.scope.update", (ctx) =>
        RelayDocuments.respond(documents.use((store) => store.saveScope(ctx.payload, ctx.params.scopeID))),
      )
      .handle("relay.scope.remove", (ctx) =>
        RelayDocuments.refusals(documents.use((store) => store.removeScope(ctx.params.scopeID))).pipe(
          Effect.as(HttpApiSchema.NoContent.make()),
        ),
      )
  }),
).pipe(Layer.provide(RelayDocuments.layer))

export const RelayPublishHandler = HttpApiBuilder.group(Api, "server.relay.publish", (handlers) =>
  Effect.gen(function* () {
    const documents = yield* RelayDocuments.Service
    return handlers
      .handle("relay.publish.publish", (ctx) =>
        RelayDocuments.respond(
          Effect.gen(function* () {
            const skills = RelayDocuments.skills(yield* SkillV2.Service)
            return yield* documents.use((store) =>
              Effect.gen(function* () {
                // Python's publish: what does not compile is not published.
                yield* RelayDocuments.compile(yield* store.get(ctx.params.documentID), skills)
                const published = yield* store.publish(
                  ctx.params.documentID,
                  ctx.payload.versionId,
                  ctx.payload.expectedChecksum,
                  Principal.of(ctx.request),
                )
                return yield* RelayDocuments.view(store, published)
              }),
            )
          }),
        ),
      )
      .handle("relay.publish.unpublish", (ctx) =>
        RelayDocuments.respond(
          documents.use((store) =>
            store
              .unpublish(ctx.params.documentID, ctx.payload.expectedChecksum, Principal.of(ctx.request))
              .pipe(Effect.flatMap((document) => RelayDocuments.view(store, document))),
          ),
        ),
      )
  }),
).pipe(Layer.provide(RelayDocuments.layer))
