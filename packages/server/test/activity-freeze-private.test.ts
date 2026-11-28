import { expect, test } from "bun:test"
import path from "node:path"
import { Readable } from "node:stream"
import { ActivityFreezeService } from "@orchestra/core/activity-freeze-service"
import { ActivityMonitor } from "@orchestra/core/activity-monitor"
import { Database } from "@orchestra/core/database/database"
import { Omni } from "@orchestra/core/omni"
import { expectSpawn } from "@orchestra/core/test/fixture/omni-expect"
import { tmpdir } from "@orchestra/core/test/fixture/tmpdir"
import { ActivityPrivateChannel } from "@orchestra/schema/activity-private-channel"
import { Effect } from "effect"
import { ActivityPrivateChannelServer } from "../src/activity-private-channel"

test.skipIf(process.platform !== "linux" || process.env.HUGR_OMNI_ISOLATION_CI !== "1")(
  "signed member confirmation freezes exactly one Linux child and resumes from its durable mark",
  async () => {
    expectSpawn(import.meta.path)
    await using directory = await tmpdir()
    await Effect.runPromise(Effect.gen(function* () {
      const database = yield* Database.Service
      const binding = yield* Effect.promise(Omni.load)
      const child = binding.spawn("/bin/cat", [], { cwd: "/tmp", stdin: "pipe", inheritEnv: false })
      yield* Effect.addFinalizer(() => Effect.promise(() => child.stop({ graceMs: 0 })).pipe(Effect.asVoid))
      const sibling = binding.spawn("/bin/cat", [], { cwd: "/tmp", stdin: "pipe", inheritEnv: false })
      yield* Effect.addFinalizer(() => Effect.promise(() => sibling.stop({ graceMs: 0 })).pipe(Effect.asVoid))
      Omni.count("spawns", 2)
      const recordID = ActivityMonitor.observe(child, "selected fixture", "fixture session")
      const otherID = ActivityMonitor.observe(sibling, "independent fixture", "fixture session")
      const secret = crypto.getRandomValues(new Uint8Array(32))
      const signer = yield* Effect.promise(() => ActivityPrivateChannel.signer(secret))
      const channelFor = (service: ActivityFreezeService.Interface) => ActivityPrivateChannelServer.acquire(
        Readable.from([Buffer.from(ActivityPrivateChannel.frame(secret))]), new AbortController().signal,
        undefined, undefined, undefined, service,
      )
      const channel = yield* Effect.promise(() => channelFor(ActivityFreezeService.make(database)))
      yield* Effect.addFinalizer(() => Effect.sync(() => { secret.fill(0) }))
      const post = async (
        route: Awaited<ReturnType<typeof channelFor>>,
        endpoint: ActivityPrivateChannel.ArmPath,
        input: unknown,
        signed = true,
      ) => {
        const body = JSON.stringify(input)
        const nonce = ActivityPrivateChannel.nonce()
        const headers = {
          [ActivityPrivateChannel.nonceHeader]: nonce,
          [ActivityPrivateChannel.macHeader]: signed ? await signer.signArm("arm-request", endpoint, nonce, body) : "",
        }
        const response = await route.handler(new Request("http://127.0.0.1" + endpoint, { method: "POST", headers, body }))
        if (!response) throw new Error("private channel did not respond")
        if (response.status !== 200) return { status: response.status }
        const json = await response.text()
        expect(await signer.verifyArm("arm-response", endpoint, nonce, response.headers.get(ActivityPrivateChannel.macHeader), json)).toBe(true)
        return { status: response.status, value: JSON.parse(json) }
      }
      yield* Effect.promise(async () => {
        const targetLines = child.lines()[Symbol.asyncIterator]()
        const otherLines = sibling.lines()[Symbol.asyncIterator]()
        const ready = targetLines.next()
        await child.write("ready\n")
        expect((await ready).value?.text).toBe("ready")

        const state = await post(channel, ActivityPrivateChannel.freezeStatePath, { recordID })
        expect(state).toMatchObject({ status: 200, value: { treeID: child.treeId, next: "suspend" } })
        expect(state.value.member).toMatch(new RegExp("^" + child.pid + ":[1-9][0-9]*$"))
        const member = state.value.member
        const [other] = await sibling.controlMembers()
        expect(other).toBeDefined()
        expect(other).not.toBe(member)
        expect(await sibling.freezeMember(member, "suspend")).toBe("unknown")

        const suspend = await post(channel, ActivityPrivateChannel.freezePreviewPath, { recordID, action: "suspend" })
        expect(suspend).toMatchObject({ status: 200, value: { treeID: child.treeId, member, action: "suspend" } })
        const stillRunning = targetLines.next()
        await child.write("before confirmation\n")
        expect((await stillRunning).value?.text).toBe("before confirmation")
        const request = { previewID: suspend.value.previewID }
        expect((await post(channel, ActivityPrivateChannel.freezeConfirmPath, request, false)).status).toBe(403)
        const suspended = await post(channel, ActivityPrivateChannel.freezeConfirmPath, request)
        expect(suspended).toMatchObject({ status: 200, value: { member, action: "suspend", phase: "suspended" } })
        expect((await post(channel, ActivityPrivateChannel.freezeConfirmPath, request)).status).toBe(409)

        const queued = targetLines.next().then((item) => item.value?.text)
        const independent = otherLines.next()
        await child.write("after resume\n")
        await sibling.write("independent\n")
        expect((await independent).value?.text).toBe("independent")
        expect(await Promise.race([queued, Bun.sleep(150).then(() => "still suspended")])).toBe("still suspended")

        const reopened = await channelFor(ActivityFreezeService.make(database))
        expect((await post(reopened, ActivityPrivateChannel.freezeStatePath, { recordID: otherID })).value.next).toBe("suspend")
        expect((await post(reopened, ActivityPrivateChannel.freezeStatePath, { recordID })).value.next).toBe("resume")
        const resume = await post(reopened, ActivityPrivateChannel.freezePreviewPath, { recordID, action: "resume" })
        expect(resume).toMatchObject({ status: 200, value: { treeID: child.treeId, member, action: "resume" } })
        expect(await Promise.race([queued, Bun.sleep(150).then(() => "still suspended")])).toBe("still suspended")
        const resumed = await post(reopened, ActivityPrivateChannel.freezeConfirmPath, { previewID: resume.value.previewID })
        expect(resumed).toMatchObject({ status: 200, value: { member, markID: suspended.value.markID, action: "resume", phase: "resumed" } })
        expect(await queued).toBe("after resume")

        process.kill(child.pid, "SIGSTOP")
        const deadline = Date.now() + 2_000
        while (!/^State:\s+T\b/m.test(await Bun.file(`/proc/${child.pid}/status`).text())) {
          if (Date.now() >= deadline) throw new Error("the fixture did not enter an external signal stop")
          await Bun.sleep(10)
        }
        const suspendAgain = await post(reopened, ActivityPrivateChannel.freezePreviewPath, { recordID, action: "suspend" })
        const second = await post(reopened, ActivityPrivateChannel.freezeConfirmPath, { previewID: suspendAgain.value.previewID })
        expect(second).toMatchObject({ status: 200, value: { phase: "suspended" } })
        expect(second.value.markID).not.toBe(suspended.value.markID)
        const externallyPaused = targetLines.next().then((item) => item.value?.text)
        await child.write("after external continue\n")
        const resumeAgain = await post(reopened, ActivityPrivateChannel.freezePreviewPath, { recordID, action: "resume" })
        expect(await post(reopened, ActivityPrivateChannel.freezeConfirmPath, { previewID: resumeAgain.value.previewID }))
          .toMatchObject({ status: 200, value: { phase: "resumed", markID: second.value.markID } })
        expect(await Promise.race([externallyPaused, Bun.sleep(150).then(() => "still stopped")])).toBe("still stopped")
        process.kill(child.pid, "SIGCONT")
        expect(await externallyPaused).toBe("after external continue")
      })
    }).pipe(Effect.provide(Database.layerFromPath(path.join(directory.path, "activity.sqlite"))), Effect.scoped))
  },
  30_000,
)
