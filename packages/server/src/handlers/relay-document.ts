import { SkillV2 } from "@orchestra/core/skill"
import { RelayForbiddenError } from "@orchestra/protocol/groups/relay-document"
import { AuthoringGraph } from "@orchestra/relay/authoring/graph"
import { AuthoringHook } from "@orchestra/relay/authoring/hook"
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
      .handle("relay.document.check", () =>
        Effect.fail(
          new RelayForbiddenError({
            code: "maestro-execution-required",
            message: "Executable workflow checks are owned by Maestro.",
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
