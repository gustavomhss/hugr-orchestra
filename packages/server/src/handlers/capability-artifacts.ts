import { randomUUID } from "node:crypto"
import { CapabilityArtifactManagement } from "@orchestra/core/capability/artifact/management"
import { CapabilityArtifacts } from "@orchestra/core/capability/artifact/index"
import { Database } from "@orchestra/core/database/database"
import { Location } from "@orchestra/core/location"
import { ConflictError, ForbiddenError, InvalidRequestError, UnauthorizedError, UnknownError } from "@orchestra/protocol/errors"
import { Capability } from "@orchestra/schema/capability"
import { Cause, Context, Effect } from "effect"
import { HttpServerResponse } from "effect/unstable/http"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../api"
import { ServerContentTicket } from "../capability-content-ticket"
import { RequestAuthority, capabilityError } from "../middleware/capability-authorization"
import { ServerOperator } from "../operator"

export const CapabilityArtifactsHandler = HttpApiBuilder.group(Api, "server.capability.artifacts", (handlers) =>
  Effect.gen(function* () {
    const operators = yield* ServerOperator.Service
    const database = yield* Database.Service
    const tickets = yield* ServerContentTicket.Service
    // Built once per handler layer, never per request.
    const management = yield* CapabilityArtifactManagement.make({ operators }).pipe(
      Effect.provideService(Database.Service, database),
    )
    return handlers
      .handle("capability.artifact.list", ({ params, query }) => management.list(params.sessionID, {
        ...(query.after === undefined ? {} : { after: query.after }),
        ...(query.limit === undefined ? {} : { limit: query.limit }) }).pipe(artifactResponse))
      .handle("capability.artifact.get", ({ params }) =>
        management.get(params.sessionID, { id: params.artifactID, revision: params.revision }).pipe(artifactResponse))
      .handleRaw("capability.artifact.content", ({ params, headers }) =>
        management.content(params.sessionID, { id: params.artifactID, revision: params.revision }).pipe(
          Effect.map((content) => contentResponse(content.artifact, content.data, headers.range)), artifactResponse))
      .handle("capability.artifact.contentTicket", ({ params }) => Effect.gen(function* () {
        const ref = { id: params.artifactID, revision: params.revision }
        // The same Session, placement and artifact.read checks as `content`, without reading the blob.
        yield* management.get(params.sessionID, ref).pipe(artifactResponse)
        const authority = yield* RequestAuthority
        if (authority === undefined) return yield* new UnauthorizedError({ message: "Authentication required" })
        const location = yield* Location.Service
        return tickets.mint({ authority, sessionID: params.sessionID, ref,
          location: { directory: location.directory, ...(location.workspaceID ? { workspaceID: location.workspaceID } : {}) } })
      }))
      .handle("capability.artifact.share", ({ params, payload }) =>
        management.share(params.sessionID, { id: params.artifactID, revision: params.revision }, payload)
          .pipe(artifactResponse))
      .handle("capability.artifact.pin", ({ params, payload }) =>
        management.pin(params.sessionID, { id: params.artifactID, revision: params.revision }, payload)
          .pipe(artifactResponse))
      .handle("capability.artifact.removeReference", ({ params }) =>
        management.removeReference(params.sessionID, { id: params.artifactID, revision: params.revision })
          .pipe(artifactResponse))
  }),
)

export const CapabilityContentHandler = HttpApiBuilder.group(Api, "server.capability.content", (handlers) =>
  Effect.gen(function* () {
    const operators = yield* ServerOperator.Service
    const database = yield* Database.Service
    const tickets = yield* ServerContentTicket.Service
    const management = yield* CapabilityArtifactManagement.make({ operators }).pipe(
      Effect.provideService(Database.Service, database),
    )
    return handlers.handleRaw("capability.content.read", ({ params, headers }) => {
      const claim = tickets.verify(params.ticket)
      // Expired, tampered and mismatched tickets are indistinguishable: an empty 401.
      if (claim === undefined) return Effect.succeed(HttpServerResponse.empty({ status: 401 }))
      // Re-run the content read under the minting authority; Core rejects it once revoked or expired.
      return operators.withRequest(claim.authority, { requestID: randomUUID() },
        management.content(claim.sessionID, claim.ref)).pipe(
        Effect.map((content) => contentResponse(content.artifact, content.data, headers.range)),
        Effect.catchIf((error): error is Capability.Failure => error instanceof Capability.Failure,
          () => Effect.succeed(HttpServerResponse.empty({ status: 401 }))),
        // The minting authority could read it, so unavailable now means the artifact or its reference is gone.
        Effect.catchIf((error): error is CapabilityArtifacts.Failure =>
          error instanceof CapabilityArtifacts.Failure && error.code === "artifact_unavailable",
          () => Effect.succeed(HttpServerResponse.empty({ status: 404 }))),
        artifactResponse)
    })
  }),
)

/** Single `bytes=` ranges only; multi-range or malformed headers fall back to the full verified body (RFC 9110 14.2). */
export function contentResponse(artifact: Readonly<{ hash: string; mime: string }>, data: Uint8Array, range: string | undefined) {
  const size = data.byteLength
  const headers = {
    "content-disposition": "attachment",
    "x-content-type-options": "nosniff",
    "content-security-policy": "sandbox",
    "cache-control": "private, no-store",
    "accept-ranges": "bytes",
    etag: `"sha256-${artifact.hash}"`,
  }
  const slice = parseRange(range, size)
  if (slice === "unsatisfiable") {
    return HttpServerResponse.empty({ status: 416, headers: { ...headers, "content-range": `bytes */${size}` } })
  }
  if (!slice) return HttpServerResponse.uint8Array(data, { status: 200, contentType: artifact.mime, headers })
  return HttpServerResponse.uint8Array(data.subarray(slice.start, slice.end + 1), { status: 206, contentType: artifact.mime,
    headers: { ...headers, "content-range": `bytes ${slice.start}-${slice.end}/${size}` } })
}

function parseRange(range: string | undefined, size: number) {
  const match = range === undefined ? null : /^bytes=(\d*)-(\d*)(?![\s\S])/.exec(range)
  if (!match || (match[1] === "" && match[2] === "")) return undefined
  if (match[1] === "") {
    const suffix = Number(match[2])
    if (suffix === 0 || size === 0) return "unsatisfiable" as const
    return { start: Math.max(0, size - suffix), end: size - 1 }
  }
  const start = Number(match[1])
  const last = match[2] === "" ? Number.POSITIVE_INFINITY : Number(match[2])
  if (last < start) return undefined
  if (start >= size) return "unsatisfiable" as const
  return { start, end: Math.min(last, size - 1) }
}

/** Unavailable, foreign and denied collapse to one constant 403; no failure detail reaches the response. */
export function artifactResponse<A, R>(effect: Effect.Effect<A, CapabilityArtifacts.Error, R>) {
  return effect.pipe(Effect.catchCause((cause) => Effect.failCause(Cause.fromReasons(cause.reasons.flatMap((reason) => {
    if (reason._tag !== "Fail") return [reason]
    return Cause.fail(mapError(reason.error)).reasons.map((next) =>
      next.annotate(Context.makeUnsafe(new Map(reason.annotations))))
  })))))
}

function mapError(error: CapabilityArtifacts.Error) {
  if (error instanceof Capability.Failure) return capabilityError(error)
  if (!(error instanceof CapabilityArtifacts.Failure)) return new UnknownError({ message: "Artifact request failed" })
  if (error.code === "invalid_input") return new InvalidRequestError({ message: "Invalid artifact request" })
  if (error.code === "reference_pinned") return new ConflictError({ message: "Artifact reference is pinned" })
  if (["artifact_corrupt", "artifact_io_failed", "artifact_storage_failed"].includes(error.code)) {
    return new UnknownError({ message: "Artifact request failed" })
  }
  return new ForbiddenError({ message: "Request denied" })
}
