import { Capability } from "@orchestra/schema/capability"
import { CapabilityArtifactManagement } from "@orchestra/schema/capability-artifact-management"
import { CapabilityManagement } from "@orchestra/schema/capability-management"
import { NonNegativeInt } from "@orchestra/schema/schema"
import { SessionID } from "@orchestra/schema/session-id"
import { Context, Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, HttpApiMiddleware, HttpApiSchema, OpenApi } from "effect/unstable/httpapi"
import { ConflictError, InvalidRequestError, UnknownError } from "../errors"
import { CapabilityAuthorization } from "../middleware/capability-authorization"
import { LocationQuery, locationQueryOpenApi } from "./location"

const SessionParams = { sessionID: SessionID }
const ArtifactParams = {
  sessionID: SessionID,
  artifactID: Capability.ArtifactID,
  // Canonical decimal only, matching ArtifactCursor: no sign, exponent, hex, padding or leading zeros.
  revision: Schema.String.check(Schema.isPattern(/^(0|[1-9][0-9]{0,15})(?![\s\S])/)).pipe(
    Schema.decodeTo(Schema.NumberFromString), Schema.decodeTo(NonNegativeInt)),
}
const ArtifactQuery = Schema.Struct({
  ...LocationQuery.fields,
  after: CapabilityArtifactManagement.ArtifactQuery.fields.after,
  limit: Schema.NumberFromString.pipe(
    Schema.decodeTo(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 32 }))),
    Schema.optionalKey,
  ).annotate({ description: "Maximum page size, 1..32. Defaults to 16." }),
})
const MutationHeaders = Schema.Struct({ "idempotency-key": Schema.NonEmptyString })
// Parsed by the Server: one `bytes=` range yields 206, anything else malformed yields the full body.
const ContentHeaders = Schema.Struct({ range: Schema.optionalKey(Schema.String) })
const path = "/api/capability/sessions/:sessionID/artifacts"
const item = `${path}/:artifactID/:revision`
// One mapper serves every endpoint; reads never produce 409 but share the declared set.
const errors = [InvalidRequestError, ConflictError, UnknownError]
const Bytes = Schema.Uint8Array.pipe(HttpApiSchema.asUint8Array())

export const CapabilityArtifactsGroup = HttpApiGroup.make("server.capability.artifacts")
  .add(
    HttpApiEndpoint.get("capability.artifact.list", path, {
      params: SessionParams, query: ArtifactQuery, success: CapabilityArtifactManagement.ArtifactPage, error: errors,
    }),
    HttpApiEndpoint.get("capability.artifact.get", item, {
      params: ArtifactParams, query: LocationQuery, success: CapabilityArtifactManagement.Artifact, error: errors,
    }),
    HttpApiEndpoint.get("capability.artifact.content", `${item}/content`, {
      params: ArtifactParams, query: LocationQuery, headers: ContentHeaders,
      success: [Bytes, Bytes.pipe(HttpApiSchema.status(206))], error: [...errors, HttpApiSchema.Empty(416)],
    }).annotateMerge(OpenApi.annotations({
      summary: "Read artifact bytes",
      description: "Verified artifact bytes with attachment, sandbox and no-store headers. Supports one `bytes=` Range.",
    })),
    HttpApiEndpoint.post("capability.artifact.share", `${item}/share`, {
      params: ArtifactParams, query: LocationQuery, headers: MutationHeaders,
      payload: CapabilityArtifactManagement.ShareInput, success: CapabilityManagement.Receipt, error: errors,
    }),
    HttpApiEndpoint.put("capability.artifact.pin", `${item}/pin`, {
      params: ArtifactParams, query: LocationQuery, headers: MutationHeaders,
      payload: CapabilityArtifactManagement.PinInput, success: CapabilityManagement.Receipt, error: errors,
    }),
    HttpApiEndpoint.delete("capability.artifact.removeReference", item, {
      params: ArtifactParams, query: LocationQuery, headers: MutationHeaders,
      success: CapabilityManagement.Receipt, error: errors,
    }),
  )
  .annotateEndpointsMerge(locationQueryOpenApi)

export const makeCapabilityArtifactsGroup = <Id extends HttpApiMiddleware.AnyId, Service>(
  locationMiddleware: Context.Key<Id, Service>,
) => CapabilityArtifactsGroup.middleware(locationMiddleware).middleware(CapabilityAuthorization)
