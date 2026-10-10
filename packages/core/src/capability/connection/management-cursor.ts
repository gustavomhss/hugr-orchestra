export * as CapabilityConnectionManagementCursor from "./management-cursor"

import { Capability } from "@orchestra/schema/capability"
import { CapabilityManagement } from "@orchestra/schema/capability-management"
import { Location } from "@orchestra/schema/location"
import { Project } from "@orchestra/schema/project"
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"
import { Effect, Option, Schema } from "effect"
import type { CapabilityOperatorContract } from "../operator/contract"
import { CapabilityOperatorScope } from "../operator/scope"

const Payload = Schema.Struct({
  lastscanID: Capability.TargetID, principal: Schema.NonEmptyString,
  scopeHash: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}(?![\s\S])/)),
  connectionID: Capability.ConnectionID,
  placement: Schema.Struct({ projectID: Project.ID, location: Location.Ref }),
  action: Schema.Literal("connection.targets"), expiry: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER })),
})
const aad = Buffer.from("CapabilityConnectionManagement.TargetCursor.v1")
const lifetime = 5 * 60 * 1000
const maxPlaintext = 1508 // 2048 base64url characters minus the nonce and authentication tag.
type Binding = Pick<CapabilityOperatorContract.Binding, "principal" | "scopeHash">
type Target = CapabilityOperatorContract.Target & { resource: { kind: "connection"; id: Capability.ConnectionID } }

/** Internal crypto boundary. A host clock enables expiry checks without five-minute test sleeps.
 * Management uses the real clock; its public Options contract does not expose this dependency. */
export function make(now = Date.now) {
  const key = randomBytes(32)
  const seal = (lastscanID: Capability.TargetID, binding: Binding, target: Target) => Effect.try({
    try: () => {
      const time = now()
      if (!Number.isSafeInteger(time) || time < 0 || time + lifetime > Number.MAX_SAFE_INTEGER) throw unavailable()
      const data = Buffer.from(JSON.stringify({ lastscanID, principal: binding.principal, scopeHash: binding.scopeHash,
        connectionID: target.resource.id, placement: target.placement, action: target.action, expiry: time + lifetime }))
      if (data.length > maxPlaintext) throw unavailable()
      const nonce = randomBytes(12)
      const cipher = createCipheriv("aes-256-gcm", key, nonce)
      cipher.setAAD(aad)
      const ciphertext = Buffer.concat([cipher.update(data), cipher.final()])
      return Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]).toString("base64url")
    },
    catch: () => unavailable(),
  })
  const open = (cursor: string, binding: Binding, target: Target) => Effect.gen(function* () {
    // Bound and canonicalize before allocating ciphertext or attempting authenticated decryption.
    if (Option.isNone(Schema.decodeUnknownOption(CapabilityManagement.TargetCursor)(cursor))) return yield* unavailable()
    const plaintext = yield* Effect.try({
      try: () => {
        const data = Buffer.from(cursor, "base64url")
        if (data.toString("base64url") !== cursor || data.length <= 28 || data.length > maxPlaintext + 28) throw unavailable()
        const decipher = createDecipheriv("aes-256-gcm", key, data.subarray(0, 12))
        decipher.setAAD(aad)
        decipher.setAuthTag(data.subarray(12, 28))
        return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString("utf8")
      },
      catch: () => unavailable(),
    })
    const json = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(plaintext)
    if (Option.isNone(json)) return yield* unavailable()
    const captured = CapabilityOperatorScope.capture(json.value, Schema.decodeUnknownSync(Schema.toType(Payload), { onExcessProperty: "error" }))
    if (!captured.ok) return yield* unavailable()
    const value = captured.value
    const time = now()
    if (!Number.isSafeInteger(time) || time < 0 || time >= value.expiry || value.expiry > time + lifetime ||
      value.principal !== binding.principal || value.scopeHash !== binding.scopeHash ||
      value.connectionID !== target.resource.id || value.action !== target.action ||
      CapabilityOperatorScope.placementKey(value.placement) !== CapabilityOperatorScope.placementKey(target.placement))
      return yield* unavailable()
    return value.lastscanID
  })
  return Object.freeze({ seal, open })
}

function unavailable() {
  return new Capability.Failure({ code: "connection_unavailable", message: "Capability connection is unavailable" })
}
