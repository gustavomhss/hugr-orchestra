export * as ServerContentTicket from "./capability-content-ticket"

import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto"
import type { CapabilityOperatorContract } from "@orchestra/core/capability/operator/contract"
import { Capability } from "@orchestra/schema/capability"
import { NonNegativeInt } from "@orchestra/schema/schema"
import { SessionID } from "@orchestra/schema/session-id"
import { Context, Layer, Option, Schema } from "effect"

export type Claim = Readonly<{
  authority: CapabilityOperatorContract.Authority
  sessionID: SessionID
  ref: Readonly<{ id: Capability.ArtifactID; revision: number }>
}>

type Interface = Readonly<{
  mint: (claim: Claim & Readonly<{ location: Readonly<{ directory: string; workspaceID?: string }> }>) =>
    Readonly<{ url: string; expiresAt: number }>
  /** The signed claim, or undefined for any expired, tampered or unknown-authority ticket. */
  verify: (ticket: string) => Claim | undefined
}>

export class Service extends Context.Service<Service, Interface>()("@orchestra/ServerContentTicket") {}

export const layerWith = (options: Readonly<{ ttlMillis: number }>) => Layer.sync(Service, () => make(options.ttlMillis))

export const layer = layerWith({ ttlMillis: 5 * 60_000 })

// [authorityID, sessionID, artifactID, revision, locationDigest, expiresAt]. The Location is signed as a digest so
// the URL never carries a host path.
const Payload = Schema.UnknownFromJsonString.pipe(Schema.decodeTo(Schema.Tuple([Schema.String, SessionID,
  Capability.ArtifactID, NonNegativeInt, Schema.String, NonNegativeInt])))

function make(ttlMillis: number) {
  // Per-process key: a restart invalidates every outstanding ticket.
  const key = randomBytes(32)
  // A ticket names the minting authority by an opaque ID, so a read runs under exactly that authority and is
  // rejected by Core once it is revoked or expired. Weak references keep the registry from pinning authorities.
  const ids = new WeakMap<CapabilityOperatorContract.Authority, string>()
  const authorities = new Map<string, WeakRef<CapabilityOperatorContract.Authority>>()
  const sign = (payload: string) => createHmac("sha256", key).update(payload).digest()

  const authorityID = (authority: CapabilityOperatorContract.Authority) => {
    const known = ids.get(authority)
    if (known !== undefined) return known
    authorities.forEach((entry, id) => {
      if (entry.deref() === undefined) authorities.delete(id)
    })
    const id = randomUUID()
    ids.set(authority, id)
    authorities.set(id, new WeakRef(authority))
    return id
  }

  return Service.of({
    mint: (claim) => {
      const expiresAt = Date.now() + ttlMillis
      const location = createHash("sha256").update(JSON.stringify([claim.location.directory, claim.location.workspaceID ?? null]))
        .digest("base64url")
      const payload = Buffer.from(JSON.stringify([authorityID(claim.authority), claim.sessionID, claim.ref.id,
        claim.ref.revision, location, expiresAt])).toString("base64url")
      return { url: `/api/capability/content/${payload}.${sign(payload).toString("base64url")}`, expiresAt }
    },
    verify: (ticket) => {
      const parts = ticket.split(".")
      if (parts.length !== 2) return undefined
      const supplied = Buffer.from(parts[1], "base64url")
      const expected = sign(parts[0])
      if (supplied.byteLength !== expected.byteLength || !timingSafeEqual(supplied, expected)) return undefined
      const decoded = Schema.decodeUnknownOption(Payload)(Buffer.from(parts[0], "base64url").toString())
      if (Option.isNone(decoded) || Date.now() >= decoded.value[5]) return undefined
      const authority = authorities.get(decoded.value[0])?.deref()
      if (authority === undefined) return undefined
      return { authority, sessionID: decoded.value[1], ref: { id: decoded.value[2], revision: decoded.value[3] } }
    },
  })
}
