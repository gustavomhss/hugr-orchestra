import { expect, test } from "bun:test"
import { open, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { Readable } from "node:stream"
import { Effect, Option } from "effect"
import { ActivityQuarantineCustody } from "@orchestra/core/activity-quarantine-custody"
import { Database } from "@orchestra/core/database/database"
import { Omni } from "@orchestra/core/omni"
import { tmpdir } from "@orchestra/core/test/fixture/tmpdir"
import { ActivityEmpty } from "@orchestra/schema/activity-empty"
import { ActivityPrivateChannel } from "@orchestra/schema/activity-private-channel"
import { ActivityPrivateChannelServer } from "../src/activity-private-channel"

test.skipIf(process.platform !== "win32")("signed empty disposes only the confirmed, reserved, persistent custody set", async () => {
  await using directory = await tmpdir()
  await Effect.runPromise(Effect.gen(function* () {
    const database = yield* Database.Service
    const native = yield* Effect.promise(Omni.quarantine)
    if (!native) throw new Error("missing native quarantine")
    const custody = ActivityQuarantineCustody.make(database)
    const setup = async (id: string) => {
      const originalPath = path.join(directory.path, id + "-original")
      const quarantinePath = path.join(directory.path, id + "-quarantined")
      await writeFile(originalPath, id)
      const identity = await native.quarantineInspect(originalPath)
      if (!identity) throw new Error("fixture has no identity")
      const target = { id, generation: "1", identity, label: id, owner: "fixture" }
      const receipt = await Effect.runPromise(custody.move(target, async (selected, transition) => {
        expect(selected).toMatchObject({ id, identity })
        expect(transition).toBe("apply")
        return { originalPath, quarantinePath, state: "armed", disposable: "file", release: async () => {} }
      }))
      expect(receipt).toBe("Verified")
      expect(await native.quarantineInspect(originalPath)).toBeNull()
      return { originalPath, quarantinePath, identity }
    }
    const secret = crypto.getRandomValues(new Uint8Array(32))
    const signer = yield* Effect.promise(() => ActivityPrivateChannel.signer(secret))
    const channel = yield* Effect.promise(() => ActivityPrivateChannelServer.acquire(
      Readable.from([Buffer.from(ActivityPrivateChannel.frame(secret))]),
      new AbortController().signal, undefined, undefined, custody,
    ))
    secret.fill(0)
    const post = async (endpoint: ActivityPrivateChannel.ArmPath, input: unknown, signed = true) => {
      const body = JSON.stringify(input)
      const nonce = ActivityPrivateChannel.nonce()
      const request = new Request("http://127.0.0.1" + endpoint, { method: "POST", body, headers: {
        [ActivityPrivateChannel.nonceHeader]: nonce,
        [ActivityPrivateChannel.macHeader]: signed ? await signer.signArm("arm-request", endpoint, nonce, body) : "",
      } })
      const response = await channel.handler(request)
      if (!response) throw new Error("private channel did not handle the request")
      if (response.status !== 200) return { status: response.status }
      const json = await response.text()
      expect(await signer.verifyArm("arm-response", endpoint, nonce, response.headers.get(ActivityPrivateChannel.macHeader), json)).toBe(true)
      return { status: response.status, value: JSON.parse(json) as unknown }
    }
    const preview = async () => {
      const parsed = ActivityEmpty.decodePreview((await post(ActivityPrivateChannel.emptyPreviewPath, {})).value)
      if (Option.isNone(parsed)) throw new Error("fixture did not get the custody preview")
      return parsed.value
    }
    const confirm = async (previewID: string) => post(ActivityPrivateChannel.emptyConfirmPath, { previewID })

    yield* Effect.promise(async () => {
      const first = await setup("a")
      const stale = await preview()
      const second = await setup("b")
      const foreign = path.join(directory.path, "foreign")
      await writeFile(foreign, "not registered")
      const view = ActivityEmpty.decodeSnapshot((await post(ActivityPrivateChannel.emptyStatePath, {})).value)
      expect(view).toMatchObject({ _tag: "Some", value: {
        canEmpty: true, partial: false,
        rows: [
          { targetID: "a", originalPath: first.originalPath, phase: "ready" },
          { targetID: "b", originalPath: second.originalPath, phase: "ready" },
        ],
      } })
      expect((await post(ActivityPrivateChannel.emptyStatePath, {}, false)).status).toBe(403)
      expect(await native.quarantineInspect(first.quarantinePath)).toBe(first.identity)
      expect((await post(ActivityPrivateChannel.emptyPreviewPath, { path: foreign })).status).toBe(403)
      expect((await post(ActivityPrivateChannel.emptyPreviewPath, {}, false)).status).toBe(403)
      expect((await confirm(stale.previewID)).status).toBe(409)
      expect(await native.quarantineInspect(first.quarantinePath)).toBe(first.identity)
      expect(await native.quarantineInspect(second.quarantinePath)).toBe(second.identity)

      const blocked = await preview()
      expect(blocked.targets.map((target) => target.originalPath)).toEqual([first.originalPath, second.originalPath])
      const held = await open(second.quarantinePath, "r")
      try {
        const outcome = ActivityEmpty.decodeReceipt((await confirm(blocked.previewID)).value)
        expect(outcome).toMatchObject({ _tag: "Some", value: { outcome: "Refused" } })
        expect(await native.quarantineInspect(first.quarantinePath)).toBe(first.identity)
      } finally {
        await held.close()
      }

      const ready = await preview()
      const outcome = ActivityEmpty.decodeReceipt((await confirm(ready.previewID)).value)
      expect(outcome).toMatchObject({ _tag: "Some", value: { outcome: "Verified",
        targets: [{ targetID: "a", generation: "1" }, { targetID: "b", generation: "1" }] } })
      expect(await native.quarantineInspect(first.quarantinePath)).toBeNull()
      expect(await native.quarantineInspect(second.quarantinePath)).toBeNull()
      expect(await readFile(foreign, "utf8")).toBe("not registered")
      expect((await confirm(ready.previewID)).status).toBe(409)
      expect(await Effect.runPromise(ActivityQuarantineCustody.make(database).preview())).toBeUndefined()
      expect(ActivityEmpty.decodeSnapshot((await post(ActivityPrivateChannel.emptyStatePath, {})).value))
        .toMatchObject({ _tag: "Some", value: { canEmpty: false, rows: [] } })
    })
  }).pipe(Effect.provide(Database.layerFromPath(path.join(directory.path, "activity.sqlite"))), Effect.scoped))
}, 30_000)

test.skipIf(process.platform !== "win32")("another custody instance cannot empty persisted rows or a mixed batch", async () => {
  await using directory = await tmpdir()
  const filename = path.join(directory.path, "activity.sqlite")
  await Effect.runPromise(Effect.gen(function* () {
    const owner = ActivityQuarantineCustody.make(yield* Database.Service)
    const native = yield* Effect.promise(Omni.quarantine)
    if (!native) throw new Error("missing native quarantine")
    const move = async (custody: ActivityQuarantineCustody.Interface, id: string) => {
      const originalPath = path.join(directory.path, id + "-original")
      const quarantinePath = path.join(directory.path, id + "-quarantined")
      await writeFile(originalPath, id)
      const identity = await native.quarantineInspect(originalPath)
      if (!identity) throw new Error("fixture has no identity")
      const result = await Effect.runPromise(custody.move(
        { id, generation: "1", identity, label: id, owner: "fixture" },
        async () => ({ originalPath, quarantinePath, state: "armed", disposable: "file", release: async () => {} }),
      ))
      expect(result).toBe("Verified")
      return quarantinePath
    }
    const first = yield* Effect.promise(() => move(owner, "first"))
    const preview = yield* owner.preview()
    if (!preview) throw new Error("original custody did not produce a preview")

    const second = yield* Effect.gen(function* () {
      const other = ActivityQuarantineCustody.make(yield* Database.Service)
      expect(yield* other.preview()).toBeUndefined()
      expect(yield* other.confirm({ previewID: preview.previewID })).toBeUndefined()
      const moved = yield* Effect.promise(() => move(other, "second"))
      expect(yield* other.preview()).toBeUndefined()
      return moved
    }).pipe(Effect.provide(Database.layerFromPath(filename)), Effect.scoped)

    expect(yield* owner.confirm({ previewID: preview.previewID })).toBeUndefined()
    expect(yield* owner.preview()).toBeUndefined()
    expect(yield* Effect.promise(() => readFile(first, "utf8"))).toBe("first")
    expect(yield* Effect.promise(() => readFile(second, "utf8"))).toBe("second")
  }).pipe(Effect.provide(Database.layerFromPath(filename)), Effect.scoped))
}, 30_000)
