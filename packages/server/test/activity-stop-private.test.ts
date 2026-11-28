import { expect, test } from "bun:test"
import { Readable } from "node:stream"
import path from "node:path"
import { Effect } from "effect"
import { ActivityMonitor } from "@orchestra/core/activity-monitor"
import { ActivityStopService } from "@orchestra/core/activity-stop-service"
import { Database } from "@orchestra/core/database/database"
import { Omni } from "@orchestra/core/omni"
import { expectSpawn } from "@orchestra/core/test/fixture/omni-expect"
import { tmpdir } from "@orchestra/core/test/fixture/tmpdir"
import { ActivityPrivateChannel } from "@orchestra/schema/activity-private-channel"
import { ActivityStop } from "@orchestra/schema/activity-stop"
import { ActivityPrivateChannelServer } from "../src/activity-private-channel"

test.skipIf(process.platform !== "win32")("the private stop consumes one approval for the registered Omni child", async () => {
  expectSpawn(import.meta.path)
  await using directory = await tmpdir()
  await Effect.runPromise(Effect.gen(function* () {
    const database = yield* Database.Service
    const binding = yield* Effect.promise(Omni.load)
    const child = binding.spawn(process.execPath, ["-e", "process.stdin.resume()"], { stdin: "pipe" })
    const untouched = binding.spawn(process.execPath, ["-e", "process.stdin.resume()"], { stdin: "pipe" })
    Omni.count("spawns", 2)
    yield* Effect.addFinalizer(() => Effect.promise(() => Promise.allSettled([
      child.stop({ graceMs: 0 }), untouched.stop({ graceMs: 0 }),
    ])).pipe(Effect.asVoid))
    const recordID = ActivityMonitor.observe(child, "fixture process", "fixture session")
    const otherID = ActivityMonitor.observe(untouched, "untouched process", "fixture session")
    const stop = ActivityStopService.make(database)
    const secret = crypto.getRandomValues(new Uint8Array(32))
    const signer = yield* Effect.promise(() => ActivityPrivateChannel.signer(secret))
    const channel = yield* Effect.promise(() => ActivityPrivateChannelServer.acquire(
      Readable.from([Buffer.from(ActivityPrivateChannel.frame(secret))]), new AbortController().signal, undefined, stop,
    ))
    secret.fill(0)
    const post = async (endpoint: ActivityPrivateChannel.ArmPath, input: unknown, signed = true, origin?: string) => {
      const body = JSON.stringify(input)
      const nonce = ActivityPrivateChannel.nonce()
      const headers = {
        ...(origin ? { origin } : {}),
        [ActivityPrivateChannel.nonceHeader]: nonce,
        [ActivityPrivateChannel.macHeader]: signed ? await signer.signArm("arm-request", endpoint, nonce, body) : "",
      }
      const response = await channel.handler(new Request("http://127.0.0.1" + endpoint, { method: "POST", headers, body }))
      if (!response) throw new Error("private channel did not handle the request")
      if (response.status !== 200) return { status: response.status }
      const text = await response.text()
      expect(await signer.verifyArm("arm-response", endpoint, nonce, response.headers.get(ActivityPrivateChannel.macHeader), text)).toBe(true)
      return { status: response.status, value: JSON.parse(text) as unknown }
    }
    yield* Effect.promise(async () => {
      expect((await post(ActivityPrivateChannel.stopPreviewPath, { recordID }, false)).status).toBe(403)
      expect((await post(ActivityPrivateChannel.stopPreviewPath, { recordID }, true, "http://127.0.0.1")).status).toBe(403)
      expect((await post(ActivityPrivateChannel.stopPreviewPath, { pid: child.pid })).status).toBe(403)
      const preview = ActivityStop.decodePreview((await post(ActivityPrivateChannel.stopPreviewPath, { recordID })).value)
      expect(preview._tag).toBe("Some")
      if (preview._tag !== "Some") throw new Error("fixture did not get a stop preview")
      expect(preview.value.treeID).toBe(child.treeId)
      expect(preview.value.target.targetID).toBe(recordID)
      expect(preview.value.members).toHaveLength(1)
      const request = { previewID: preview.value.previewID }
      expect((await post(ActivityPrivateChannel.stopConfirmPath, request, false)).status).toBe(403)
      const receipt = ActivityStop.decodeReceipt((await post(ActivityPrivateChannel.stopConfirmPath, request)).value)
      expect(receipt._tag).toBe("Some")
      if (receipt._tag === "Some") expect(receipt.value.outcomes.map((outcome) => outcome.member)).toEqual([...preview.value.members])
      await child.wait()
      expect(await ActivityMonitor.control(otherID)).toBeDefined()
      expect((await post(ActivityPrivateChannel.stopConfirmPath, request)).status).toBe(409)
    })
  }).pipe(Effect.provide(Database.layerFromPath(path.join(directory.path, "activity.sqlite"))), Effect.scoped))
}, 30_000)
