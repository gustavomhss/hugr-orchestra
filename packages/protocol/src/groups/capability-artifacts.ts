import { Capability } from "@orchestra/schema/capability"
import { CapabilityArtifactManagement } from "@orchestra/schema/capability-artifact-management"
import { CapabilityManagement } from "@orchestra/schema/capability-management"
import { NonNegativeInt } from "@orchestra/schema/schema"
import { SessionID } from "@orchestra/schema/session-id"
import { Context, Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, HttpApiMiddleware, HttpApiSchema, OpenApi } from "effect/unstable/httpapi"
import { ConflictError, ForbiddenError, InvalidRequestError, UnknownError } from "../errors"
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
const ContentSuccess = [Bytes, Bytes.pipe(HttpApiSchema.status(206))]
const CONTENT_TICKET_PATH = /^\/api\/capability\/content\/[A-Za-z0-9_.-]+$/
export const ContentTicket = Schema.Struct({
  url: Schema.String.annotate({ description: "Relative path that serves the bytes without an Authorization header." }),
  expiresAt: NonNegativeInt.annotate({ description: "Expiry as Unix epoch milliseconds." }),
}).annotate({ identifier: "CapabilityArtifactContentTicket" })

// Authorization middleware skips credential checks here: `<video src>` cannot send headers, the handler verifies the ticket.
export function hasCapabilityContentTicketURL(url: URL) {
  return CONTENT_TICKET_PATH.test(url.pathname)
}

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
      success: ContentSuccess, error: [...errors, HttpApiSchema.Empty(416)],
    }).annotateMerge(OpenApi.annotations({
      summary: "Read artifact bytes",
      description: "Verified artifact bytes with attachment, sandbox and no-store headers. Supports one `bytes=` Range.",
    })),
    HttpApiEndpoint.post("capability.artifact.contentTicket", `${item}/content-ticket`, {
      params: ArtifactParams, query: LocationQuery, success: ContentTicket, error: errors,
    }).annotateMerge(OpenApi.annotations({
      summary: "Mint an artifact content ticket",
      description: "Short-lived URL for the same bytes as `content`, bound to this caller, revision and Location.",
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

// No Location or capability middleware: the ticket carries both and the handler re-checks them.
export const CapabilityContentGroup = HttpApiGroup.make("server.capability.content").add(
  HttpApiEndpoint.get("capability.content.read", "/api/capability/content/:ticket", {
    params: { ticket: Schema.String }, headers: ContentHeaders, success: ContentSuccess,
    error: [HttpApiSchema.Empty(401), HttpApiSchema.Empty(404), HttpApiSchema.Empty(416), ForbiddenError, ...errors],
  }).annotateMerge(OpenApi.annotations({
    summary: "Read artifact bytes by ticket",
    description: "Header-free read for media elements. Same bytes and headers as `content`; invalid tickets yield 401.",
  })),
)

export const makeCapabilityArtifactsGroup = <Id extends HttpApiMiddleware.AnyId, Service>(
  locationMiddleware: Context.Key<Id, Service>,
) => CapabilityArtifactsGroup.middleware(locationMiddleware).middleware(CapabilityAuthorization)
