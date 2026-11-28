import { expect, test } from "bun:test"
import { ActivityPrivateChannel } from "../src/activity-private-channel"

test("the activity startup frame fixes the version and exact key length", () => {
  const secret = new Uint8Array(32).fill(42)
  const encoded = ActivityPrivateChannel.frame(secret)
  expect(encoded.length).toBe(ActivityPrivateChannel.frameBytes)
  expect(ActivityPrivateChannel.keyFromFrame(encoded)).toEqual(secret)
  expect(ActivityPrivateChannel.keyFromFrame(encoded.subarray(0, encoded.length - 1))).toBeUndefined()
  expect(ActivityPrivateChannel.keyFromFrame(new Uint8Array(encoded.length + 1))).toBeUndefined()
  encoded[0] = 0
  expect(ActivityPrivateChannel.keyFromFrame(encoded)).toBeUndefined()
})

test("probe signatures bind the secret, nonce and direction", async () => {
  const signer = await ActivityPrivateChannel.signer(new Uint8Array(32).fill(1))
  const wrong = await ActivityPrivateChannel.signer(new Uint8Array(32).fill(2))
  const nonce = ActivityPrivateChannel.nonce()
  const request = await signer.sign("probe-request", nonce)
  const reply = await signer.sign("probe-response", nonce)
  expect(await signer.verify("probe-request", nonce, request)).toBe(true)
  expect(await signer.verify("probe-response", nonce, reply)).toBe(true)
  expect(await signer.verify("probe-response", nonce, request)).toBe(false)
  expect(await signer.verify("probe-response", ActivityPrivateChannel.nonce(), reply)).toBe(false)
  expect(await wrong.verify("probe-response", nonce, reply)).toBe(false)
  expect(await signer.verify("probe-response", nonce, "invalid")).toBe(false)
})
