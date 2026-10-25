export * as ServerContentTicket from "./capability-content-ticket"

import { randomBytes } from "node:crypto"
import type { CapabilityOperatorContract } from "@orchestra/core/capability/operator/contract"
import type { Capability } from "@orchestra/schema/capability"
import type { SessionID } from "@orchestra/schema/session-id"
import { Context, Layer } from "effect"

export type Claim = Readonly<{
  authority: CapabilityOperatorContract.Authority
  sessionID: SessionID
  ref: Readonly<{ id: Capability.ArtifactID; revision: number }>
}>

type Interface = Readonly<{
  mint: (claim: Claim) => Readonly<{ url: string; expiresAt: number }>
  /** The minted claim, or undefined for any expired or unknown ticket. */
  verify: (ticket: string) => Claim | undefined
}>

export class Service extends Context.Service<Service, Interface>()("@orchestra/ServerContentTicket") {}

export const layerWith = (options: Readonly<{ ttlMillis: number }>) => Layer.sync(Service, () => make(options.ttlMillis))

export const layer = layerWith({ ttlMillis: 5 * 60_000 })

function make(ttlMillis: number) {
  // An opaque random token held in process memory: the router rejects path parameters over 100 characters, so the
  // claim cannot travel in the URL. A restart invalidates every outstanding ticket. The read still runs under the
  // minting authority, so Core rejects it once that authority is revoked or expired.
  const issued = new Map<string, Claim & Readonly<{ expiresAt: number }>>()
  return Service.of({
    mint: (claim) => {
      const now = Date.now()
      issued.forEach((entry, token) => {
        if (now >= entry.expiresAt) issued.delete(token)
      })
      const token = randomBytes(32).toString("base64url")
      const expiresAt = now + ttlMillis
      issued.set(token, { ...claim, expiresAt })
      return { url: `/api/capability/content/${token}`, expiresAt }
    },
    verify: (ticket) => {
      const entry = issued.get(ticket)
      if (entry === undefined) return undefined
      if (Date.now() < entry.expiresAt) return { authority: entry.authority, sessionID: entry.sessionID, ref: entry.ref }
      issued.delete(ticket)
      return undefined
    },
  })
}
