import { expect, test } from "bun:test"
import { Readable } from "node:stream"
import { Effect } from "effect"
import { ActivityArm } from "@orchestra/schema/activity-arm"
import { ActivityPrivateChannel } from "@orchestra/schema/activity-private-channel"
import { ActivityPrivateChannelServer } from "../src/activity-private-channel"

test("only the signed private inspection with an empty body can verify IN/OUT objects", async () => {
  const secret = crypto.getRandomValues(new Uint8Array(32))
  const signer = await ActivityPrivateChannel.signer(secret)
  const requestFrame = ActivityPrivateChannel.frame(secret)
  secret.fill(0)
  let inspected = 0
  const channel = await ActivityPrivateChannelServer.acquire(
    Readable.from([Buffer.from(requestFrame)]), new AbortController().signal, {
      inspect: () => Effect.sync(() => {
        inspected++
        return { ready: [], approvals: [], partial: false }
      }),
      preview: () => Effect.succeed(undefined),
      confirm: () => Effect.succeed(undefined),
    },
  )
  requestFrame.fill(0)
  const endpoint = ActivityPrivateChannel.inspectArmPath
  const nonce = ActivityPrivateChannel.nonce()
  const send = async (body: string, signed = true, origin?: string) => {
    const headers = new Headers({
      [ActivityPrivateChannel.nonceHeader]: nonce,
      [ActivityPrivateChannel.macHeader]: signed ? await signer.signArm("arm-request", endpoint, nonce, body) : "",
    })
    if (origin) headers.set("origin", origin)
    return channel.handler(new Request("http://127.0.0.1" + endpoint, { method: "POST", headers, body }))
  }
  expect((await send("{}", false))?.status).toBe(403)
  expect((await send('{"path":"/tmp"}'))?.status).toBe(403)
  expect((await send("{}", true, "http://127.0.0.1"))?.status).toBe(403)
  expect(inspected).toBe(0)

  const reply = await send("{}")
  if (!reply) throw new Error("Missing private reply")
  expect(reply.status).toBe(200)
  expect(reply.headers.get("cache-control")).toBe("no-store")
  const body = await reply.text()
  expect(JSON.parse(body)).toEqual({ ready: [], approvals: [], partial: false })
  expect(await signer.verifyArm("arm-response", endpoint, nonce, reply.headers.get(ActivityPrivateChannel.macHeader), body)).toBe(true)
  expect(inspected).toBe(1)
})

test("signed inspection keeps verified targets and whole receipts within the channel byte limit", async () => {
  const secret = crypto.getRandomValues(new Uint8Array(32))
  const signer = await ActivityPrivateChannel.signer(secret)
  const requestFrame = ActivityPrivateChannel.frame(secret)
  secret.fill(0)
  const target = (targetID: string) => ({ targetID, generation: "1", label: "驗".repeat(384), owner: "驗".repeat(384) })
  const ready = Array.from({ length: ActivityArm.maxTargets }, (_, index) => target(`ready-${index}`))
  const approvals = Array.from({ length: 20 }, (_, index) => ({
    receipt: {
      approvalID: `approval-${index}`, action: "arm-quarantine" as const, approvedAt: 1,
      targets: Array.from({ length: 4 }, (_, item) => target(`armed-${index}-${item}`)),
    },
    changed: false,
  }))
  const channel = await ActivityPrivateChannelServer.acquire(
    Readable.from([Buffer.from(requestFrame)]), new AbortController().signal, {
      inspect: () => Effect.succeed({ ready, approvals, partial: false }),
      preview: () => Effect.succeed(undefined),
      confirm: () => Effect.succeed(undefined),
    },
  )
  requestFrame.fill(0)
  const endpoint = ActivityPrivateChannel.inspectArmPath
  const nonce = ActivityPrivateChannel.nonce()
  const reply = await channel.handler(new Request("http://127.0.0.1" + endpoint, { method: "POST", headers: {
    [ActivityPrivateChannel.nonceHeader]: nonce,
    [ActivityPrivateChannel.macHeader]: await signer.signArm("arm-request", endpoint, nonce, "{}"),
  }, body: "{}" }))
  if (!reply) throw new Error("Missing private reply")
  expect(reply.status).toBe(200)
  const body = await reply.text()
  expect(Buffer.byteLength(body)).toBeLessThanOrEqual(ActivityPrivateChannel.maxBodyBytes)
  expect(await signer.verifyArm("arm-response", endpoint, nonce, reply.headers.get(ActivityPrivateChannel.macHeader), body)).toBe(true)
  const snapshot = JSON.parse(body) as ActivityArm.PlanSnapshot
  expect(snapshot.partial).toBe(true)
  expect(snapshot.ready).toEqual(ready)
  expect(snapshot.approvals.length).toBeGreaterThan(0)
  expect(snapshot.approvals.length).toBeLessThan(approvals.length)
  expect(snapshot.approvals).toEqual(approvals.slice(0, snapshot.approvals.length))
})
