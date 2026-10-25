import { Orchestra } from "@orchestra/client"
import { CapabilityArtifactManagement } from "@orchestra/schema/capability-artifact-management"
import { CapabilityManagement } from "@orchestra/schema/capability-management"
import type { SessionID } from "@orchestra/schema/session-id"
import { Schema } from "effect"
import type { ServerConnection } from "@/context/server"
import { authTokenFromCredentials } from "@/utils/server"
import type { ArtifactRef, ArtifactsApi, ArtifactsOptions } from "./artifacts-model"

/** One Session's artifact transport on the selected host. Every call is scoped to that Session and Location. */
export function createArtifactsApi(input: { server: ServerConnection.HttpBase; directory: string; sessionID: SessionID;
  fetch?: typeof globalThis.fetch }): ArtifactsApi & { read: (ref: ArtifactRef, signal?: AbortSignal) => Promise<Blob> } {
  const location = Object.freeze({ directory: input.directory })
  const sessionID = input.sessionID
  const headers = input.server.password ? { Authorization: `Basic ${authTokenFromCredentials({
    username: input.server.username, password: input.server.password })}` } : undefined
  const client = Orchestra.make({ baseUrl: input.server.url, fetch: input.fetch, headers })
  const request = (options?: ArtifactsOptions) => ({ signal: options?.signal })
  const receipt = Schema.decodeUnknownSync(CapabilityManagement.Receipt, { onExcessProperty: "error" })
  const content = (ref: ArtifactRef) => {
    const url = new URL(`/api/capability/sessions/${encodeURIComponent(sessionID)}/artifacts/${encodeURIComponent(ref.id)}/${ref.revision}/content`,
      input.server.url)
    url.searchParams.set("location[directory]", input.directory)
    return url.href
  }
  return Object.freeze({
    list: (after, options) => client.artifacts.list({ sessionID, location, limit: 32, ...(after === undefined ? {} : { after }) },
      request(options)).then(Schema.decodeUnknownSync(CapabilityArtifactManagement.ArtifactPage, { onExcessProperty: "error" })),
    get: (ref, options) => client.artifacts.get({ sessionID, location, artifactID: ref.id, revision: String(ref.revision) },
      request(options)).then(Schema.decodeUnknownSync(CapabilityArtifactManagement.Artifact, { onExcessProperty: "error" })),
    share: (ref, targetSessionID, key, options) => client.artifacts.share({ sessionID, location, artifactID: ref.id,
      revision: String(ref.revision), targetSessionID, "idempotency-key": key }, request(options)).then(receipt),
    pin: (ref, pinned, key, options) => client.artifacts.pin({ sessionID, location, artifactID: ref.id,
      revision: String(ref.revision), pinned, "idempotency-key": key }, request(options)).then(receipt),
    remove: (ref, key, options) => client.artifacts.removeReference({ sessionID, location, artifactID: ref.id,
      revision: String(ref.revision), "idempotency-key": key }, request(options)).then(receipt),
    // The generated client has no binary endpoint; media elements stream this URL with their own range requests.
    content,
    // Capability routes read credentials only from the Authorization header, which a media element cannot send.
    read: (ref, signal) => (input.fetch ?? globalThis.fetch)(content(ref), { headers, signal }).then((response) => {
      if (!response.ok) throw response.status === 401 || response.status === 403 ? "authorization" : "request"
      return response.blob()
    }),
  } satisfies ArtifactsApi & { read: (ref: ArtifactRef, signal?: AbortSignal) => Promise<Blob> })
}
