import { expect, test } from "bun:test"
import { Readable } from "node:stream"
import { ActivityPrivateChannel } from "@orchestra/schema/activity-private-channel"
import { Effect } from "effect"
import { ActivityPrivateChannelServer } from "../src/activity-private-channel"

test("Apply uses separately signed endpoints and never accepts a renderer-supplied source path", async () => {
  const secret = crypto.getRandomValues(new Uint8Array(32))
  const signer = await ActivityPrivateChannel.signer(secret)
  const binding = { approvalID: "arm-1", targetID: "object-1", generation: "2" }
  const snapshot = { available: true, eligible: [binding], results: [], partial: false }
  let reads = 0
  let confirms = 0
  const channel = await ActivityPrivateChannelServer.acquire(
    Readable.from([Buffer.from(ActivityPrivateChannel.frame(secret))]), new AbortController().signal,
    undefined, undefined, undefined, undefined,
    {
      state: () => Effect.sync(() => {
        reads++
        return snapshot
      }),
      preview: () => Effect.succeed({
        previewID: "apply-1", expiresAt: Date.now() + 60_000, action: "apply-quarantine" as const,
        approvalID: binding.approvalID, target: { targetID: binding.targetID, generation: binding.generation, label: "/owned/.turbo", owner: "fixture" },
        destination: "/owned/quarantine/item",
      }),
      confirm: () => Effect.sync(() => {
        confirms++
        return { previewID: "apply-1", ...binding, outcome: "Out" as const }
      }),
    },
  )
  secret.fill(0)
  const post = async (route: string, body: unknown, signedFor = route, origin?: string, fixedNonce?: string) => {
    const endpoint = (ActivityPrivateChannel.mount + route) as ActivityPrivateChannel.ArmPath
    const nonce = fixedNonce ?? ActivityPrivateChannel.applyNonce()
    const text = JSON.stringify(body)
    const headers = new Headers({
      [ActivityPrivateChannel.nonceHeader]: nonce,
      [ActivityPrivateChannel.macHeader]: signedFor
        ? await signer.signArm("arm-request", (ActivityPrivateChannel.mount + signedFor) as ActivityPrivateChannel.ArmPath, nonce, text)
        : "",
    })
    if (origin) headers.set("origin", origin)
    const result = await channel.handler(new Request("http://127.0.0.1" + endpoint, { method: "POST", headers, body: text }))
    if (result?.status !== 200) return { status: result?.status }
    const reply = await result.text()
    expect(result.headers.get("cache-control")).toBe("no-store")
    expect(await signer.verifyArm("arm-response", endpoint, nonce, result.headers.get(ActivityPrivateChannel.macHeader), reply)).toBe(true)
    return { status: 200, value: JSON.parse(reply) }
  }

  expect(await post("/apply-state", {}, "")).toEqual({ status: 403 })
  expect(await post("/apply-state", { source: "/tmp/other" })).toEqual({ status: 403 })
  expect(await post("/apply-state", {}, "/apply-state", "http://127.0.0.1")).toEqual({ status: 403 })
  expect(reads).toBe(0)
  expect(await post("/apply-state", {})).toEqual({ status: 200, value: snapshot })
  expect(reads).toBe(1)
  expect(await post("/apply-preview", { ...binding, destination: "/tmp/other" })).toEqual({ status: 403 })
  expect(await post("/apply-preview", binding)).toMatchObject({ status: 200, value: { action: "apply-quarantine", previewID: "apply-1" } })
  expect(await post("/apply-confirm", { previewID: "apply-1" }, "/apply-preview")).toEqual({ status: 403 })
  expect(confirms).toBe(0)
  expect(await post("/apply-confirm", { previewID: "apply-1" })).toEqual({
    status: 200, value: { ...binding, previewID: "apply-1", outcome: "Out" },
  })
  expect(confirms).toBe(1)
  const replay = ActivityPrivateChannel.applyNonce()
  expect(await post("/apply-confirm", { previewID: "apply-1" }, "/apply-confirm", undefined, replay)).toMatchObject({ status: 200 })
  expect(await post("/apply-confirm", { previewID: "apply-1" }, "/apply-confirm", undefined, replay)).toEqual({ status: 403 })
  expect(confirms).toBe(2)
  const expired = (Date.now() - 60_001).toString(16).padStart(12, "0") + ActivityPrivateChannel.nonce().slice(12)
  expect(await post("/apply-confirm", { previewID: "apply-1" }, "/apply-confirm", undefined, expired)).toEqual({ status: 403 })
  expect(confirms).toBe(2)
})
