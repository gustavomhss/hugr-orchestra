import { expect, test } from "bun:test"
import { Readable } from "node:stream"
import { Effect } from "effect"
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
