import { RagStudio } from "@orchestra/schema/rag-studio"
import { Location } from "@orchestra/schema/location"
import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema, OpenApi } from "effect/unstable/httpapi"
import { InvalidRequestError, ServiceUnavailableError } from "../errors"
import { LocationQuery, locationQueryOpenApi } from "./location"

const sourceParams = Schema.Struct({ sourceId: Schema.String })
const revisionParams = Schema.Struct({ revisionId: Schema.String })
const questionParams = Schema.Struct({ questionId: Schema.String })
// Rag Studio over the requested Location. Embedding stays off until a model is named. Project source is refused as Atlas.
export const RagStudioGroup = HttpApiGroup.make("server.ragStudio")
  .add(
    HttpApiEndpoint.get("ragStudio.sources", "/api/rag-studio/sources", {
      query: LocationQuery,
      success: Location.response(Schema.Array(RagStudio.Source)),
      error: ServiceUnavailableError,
    }).annotateMerge(locationQueryOpenApi),
  )
  .add(
    HttpApiEndpoint.get("ragStudio.source", "/api/rag-studio/sources/:sourceId", {
      params: sourceParams,
      query: LocationQuery,
      success: Location.response(RagStudio.SourceDetail),
      error: InvalidRequestError,
    }).annotateMerge(locationQueryOpenApi),
  )
  .add(
    HttpApiEndpoint.post("ragStudio.admit", "/api/rag-studio/sources", {
      query: LocationQuery,
      payload: RagStudio.PathInput,
      success: Location.response(RagStudio.AdmitResult),
      error: ServiceUnavailableError,
    }).annotateMerge(locationQueryOpenApi),
  )
  .add(
    HttpApiEndpoint.delete("ragStudio.remove", "/api/rag-studio/sources/:sourceId", {
      params: sourceParams,
      query: LocationQuery,
      success: HttpApiSchema.NoContent,
      error: InvalidRequestError,
    }).annotateMerge(locationQueryOpenApi),
  )
  .add(
    HttpApiEndpoint.post("ragStudio.parse", "/api/rag-studio/sources/:sourceId/parse", {
      params: sourceParams,
      query: LocationQuery,
      success: Location.response(RagStudio.Source),
      error: InvalidRequestError,
    }).annotateMerge(locationQueryOpenApi),
  )
  .add(
    HttpApiEndpoint.get("ragStudio.pipeline", "/api/rag-studio/pipeline", {
      query: LocationQuery,
      success: Location.response(RagStudio.Pipeline),
      error: ServiceUnavailableError,
    }).annotateMerge(locationQueryOpenApi),
  )
  .add(
    HttpApiEndpoint.patch("ragStudio.pipelineUpdate", "/api/rag-studio/pipeline", {
      query: LocationQuery,
      payload: RagStudio.PipelineUpdate,
      success: Location.response(RagStudio.Pipeline),
      error: InvalidRequestError,
    }).annotateMerge(locationQueryOpenApi),
  )
  .add(
    HttpApiEndpoint.post("ragStudio.revision", "/api/rag-studio/revisions", {
      query: LocationQuery,
      success: Location.response(RagStudio.Revision),
      error: ServiceUnavailableError,
    }).annotateMerge(locationQueryOpenApi),
  )
  .add(
    HttpApiEndpoint.get("ragStudio.revisionRead", "/api/rag-studio/revisions/:revisionId", {
      params: revisionParams,
      query: LocationQuery,
      success: Location.response(RagStudio.Revision),
      error: InvalidRequestError,
    }).annotateMerge(locationQueryOpenApi),
  )
  .add(
    HttpApiEndpoint.post("ragStudio.search", "/api/rag-studio/search", {
      query: LocationQuery,
      payload: RagStudio.SearchInput,
      success: Location.response(Schema.Array(RagStudio.Chunk)),
      error: InvalidRequestError,
    }).annotateMerge(locationQueryOpenApi),
  )
  .add(
    HttpApiEndpoint.post("ragStudio.ask", "/api/rag-studio/ask", {
      query: LocationQuery,
      payload: RagStudio.AskInput,
      success: Location.response(RagStudio.QuestionResult),
      error: InvalidRequestError,
    }).annotateMerge(locationQueryOpenApi),
  )
  .add(
    HttpApiEndpoint.post("ragStudio.question", "/api/rag-studio/questions", {
      query: LocationQuery,
      payload: RagStudio.QuestionInput,
      success: Location.response(RagStudio.IdResult),
      error: InvalidRequestError,
    }).annotateMerge(locationQueryOpenApi),
  )
  .add(
    HttpApiEndpoint.post("ragStudio.retrieval", "/api/rag-studio/questions/:questionId/retrieval", {
      params: questionParams,
      query: LocationQuery,
      payload: RagStudio.ProofInput,
      success: Location.response(RagStudio.BoolResult),
      error: InvalidRequestError,
    }).annotateMerge(locationQueryOpenApi),
  )
  .add(
    HttpApiEndpoint.post("ragStudio.citation", "/api/rag-studio/questions/:questionId/citation", {
      params: questionParams,
      query: LocationQuery,
      payload: RagStudio.CitationInput,
      success: Location.response(RagStudio.BoolResult),
      error: InvalidRequestError,
    }).annotateMerge(locationQueryOpenApi),
  )
  .add(
    HttpApiEndpoint.post("ragStudio.compare", "/api/rag-studio/compare", {
      query: LocationQuery,
      payload: RagStudio.CompareInput,
      success: Location.response(RagStudio.CompareResult),
      error: InvalidRequestError,
    }).annotateMerge(locationQueryOpenApi),
  )
  .add(
    HttpApiEndpoint.post("ragStudio.embedding", "/api/rag-studio/embedding", {
      query: LocationQuery,
      success: Location.response(Schema.Struct({ refused: Schema.Literal("embedding_off") })),
      error: ServiceUnavailableError,
    }).annotateMerge(locationQueryOpenApi),
  )
  .add(
    HttpApiEndpoint.post("ragStudio.pass", "/api/rag-studio/passes", {
      query: LocationQuery,
      payload: RagStudio.PassInput,
      success: Location.response(RagStudio.PassResult),
      error: InvalidRequestError,
    }).annotateMerge(locationQueryOpenApi),
  )
  .add(
    HttpApiEndpoint.post("ragStudio.passes", "/api/rag-studio/passes/batch", {
      query: LocationQuery,
      payload: RagStudio.PassesInput,
      success: Location.response(Schema.Struct({ refused: Schema.Literal("one_pass") })),
      error: InvalidRequestError,
    }).annotateMerge(locationQueryOpenApi),
  )
  .annotateMerge(OpenApi.annotations({ title: "rag-studio", description: "Rag Studio routes." }))
