export * as ActivityPrivateChannel from "./activity-private-channel"

export const option = "activity-approval-stdin"
export const path = "/_orchestra-activity/v1/probe"
export const mount = "/_orchestra-activity/v1"
export const inspectArmPath = `${mount}/arm-inspect`
export const previewPath = `${mount}/arm-preview`
export const confirmPath = `${mount}/arm-confirm`
export const stopPreviewPath = `${mount}/stop-preview`
export const stopConfirmPath = `${mount}/stop-confirm`
export const emptyPreviewPath = `${mount}/empty-preview`
export const emptyConfirmPath = `${mount}/empty-confirm`
export const emptyStatePath = `${mount}/empty-state`
export const freezeStatePath = `${mount}/freeze-state`
export const freezePreviewPath = `${mount}/freeze-preview`
export const freezeConfirmPath = `${mount}/freeze-confirm`
export const maxBodyBytes = 96 * 1024
export const nonceHeader = "x-orchestra-activity-nonce"
export const macHeader = "x-orchestra-activity-mac"

const keyBytes = 32
const encoder = new TextEncoder()
const prefix = encoder.encode("ORCHESTRA-ACTIVITY-APPROVAL-V1\n")
const hex256 = /^[a-f0-9]{64}$/
export const frameBytes = prefix.length + keyBytes

export function frame(secret: Uint8Array) {
  if (secret.length !== keyBytes) throw new Error("Invalid activity channel key length")
  const encoded = new Uint8Array(frameBytes)
  encoded.set(prefix)
  encoded.set(secret, prefix.length)
  return encoded
}

export function keyFromFrame(input: Uint8Array) {
  if (input.length !== frameBytes || prefix.some((byte, index) => input[index] !== byte)) return undefined
  return input.slice(prefix.length)
}

export function nonce() {
  return hex(crypto.getRandomValues(new Uint8Array(keyBytes)))
}

type Direction = "probe-request" | "probe-response"
export type ArmDirection = "arm-request" | "arm-response"
export type ArmPath = typeof inspectArmPath | typeof previewPath | typeof confirmPath | typeof stopPreviewPath | typeof stopConfirmPath |
  typeof emptyPreviewPath | typeof emptyConfirmPath | typeof emptyStatePath |
  typeof freezeStatePath | typeof freezePreviewPath | typeof freezeConfirmPath

export async function signer(secret: Uint8Array) {
  if (secret.length !== keyBytes) throw new Error("Invalid activity channel key length")
  const key = await crypto.subtle.importKey("raw", new Uint8Array(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"])
  const message = (direction: Direction, nonce: string) => encoder.encode(JSON.stringify([path, direction, nonce]))
  const armMessage = (direction: ArmDirection, endpoint: ArmPath, nonce: string, body: string) =>
    encoder.encode(JSON.stringify([endpoint, direction, nonce, body]))
  return {
    async sign(direction: Direction, nonce: string) {
      if (!hex256.test(nonce)) throw new Error("Invalid activity channel nonce")
      return hex(new Uint8Array(await crypto.subtle.sign("HMAC", key, message(direction, nonce))))
    },
    async verify(direction: Direction, nonce: string | null, mac: string | null) {
      if (!nonce || !mac || !hex256.test(nonce) || !hex256.test(mac)) return false
      const bytes = Uint8Array.from({ length: keyBytes }, (_value, index) => Number.parseInt(mac.slice(index * 2, index * 2 + 2), 16))
      return crypto.subtle.verify("HMAC", key, new Uint8Array(bytes), message(direction, nonce))
    },
    async signArm(direction: ArmDirection, endpoint: ArmPath, nonce: string, body: string) {
      if (!hex256.test(nonce)) throw new Error("Invalid activity channel nonce")
      return hex(new Uint8Array(await crypto.subtle.sign("HMAC", key, armMessage(direction, endpoint, nonce, body))))
    },
    async verifyArm(direction: ArmDirection, endpoint: ArmPath, nonce: string | null, mac: string | null, body: string) {
      if (!nonce || !mac || !hex256.test(nonce) || !hex256.test(mac)) return false
      const bytes = Uint8Array.from({ length: keyBytes }, (_value, index) => Number.parseInt(mac.slice(index * 2, index * 2 + 2), 16))
      return crypto.subtle.verify("HMAC", key, new Uint8Array(bytes), armMessage(direction, endpoint, nonce, body))
    },
  }
}

function hex(data: Uint8Array) {
  return Array.from(data, (byte) => byte.toString(16).padStart(2, "0")).join("")
}
