import { Capability } from "@orchestra/schema/capability"
import { Research } from "@orchestra/schema/research"
import { SessionID } from "@orchestra/schema/session-id"
import { PositiveInt, optional } from "@orchestra/schema/schema"
import { Context, Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, HttpApiMiddleware, OpenApi } from "effect/unstable/httpapi"
import { ConflictError, InvalidRequestError, ServiceUnavailableError } from "../errors"

export class ResearchArtifactNotFoundError extends Schema.TaggedErrorClass<ResearchArtifactNotFoundError>()(
  "ResearchArtifactNotFoundError", { message: Schema.String }, { httpApiStatus: 404 },
) {}

export const makeResearchArtifactGroup = <I extends HttpApiMiddleware.AnyId, S>(middleware: Context.Key<I, S>) =>
  HttpApiGroup.make("server.research")
    .add(HttpApiEndpoint.get("research.artifact", "/api/session/:sessionID/research/:artifactID", {
      params: Schema.Struct({ sessionID: SessionID, artifactID: Capability.ArtifactID }),
      query: Schema.Struct({ revision: Schema.NumberFromString.pipe(Schema.decodeTo(PositiveInt)), cursor: optional(Schema.String) }),
      success: Research.ArtifactPage,
      error: [ResearchArtifactNotFoundError, ConflictError, InvalidRequestError, ServiceUnavailableError],
    }).annotateMerge(OpenApi.annotations({
      identifier: "v2.research.artifact", summary: "Read an admitted research artifact revision",
      description: "Return exact retained source/document text in bounded immutable pages. Session and admitted scope determine access; arbitrary filesystem paths are not accepted.",
    })))
    .middleware(middleware)
