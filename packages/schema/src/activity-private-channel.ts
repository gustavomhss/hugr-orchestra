export * as ActivityPrivateChannel from "./activity-private-channel"

export const option = "activity-approval-stdin"
export const path = "/_orchestra-activity/v1/probe"
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

export async function signer(secret: Uint8Array) {
  if (secret.length !== keyBytes) throw new Error("Invalid activity channel key length")
  const key = await crypto.subtle.importKey("raw", new Uint8Array(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"])
  const message = (direction: Direction, nonce: string) => encoder.encode(JSON.stringify([path, direction, nonce]))
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
  }
}

function hex(data: Uint8Array) {
  return Array.from(data, (byte) => byte.toString(16).padStart(2, "0")).join("")
}
