import { expect, test } from "bun:test"
import { EventEmitter } from "node:events"
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import type { IpcMainInvokeEvent, MessageBoxOptions } from "electron"
import { Effect, Schema } from "effect"
import { ActivityActionLedger } from "@orchestra/core/activity-action-ledger"
import { Database } from "@orchestra/core/database/database"
import { expectSpawn } from "@orchestra/core/test/fixture/omni-expect"
import { ActivityArm } from "@orchestra/schema/activity-arm"
import { ActivityPrivateChannel } from "@orchestra/schema/activity-private-channel"
import { registerActivityArmIpc } from "./activity-arm-ipc"
import { startOwnedServe } from "./owned-serve"

type ArmHandler = (
  event: IpcMainInvokeEvent, url: string, input: ActivityArm.Request,
) => Promise<ActivityArm.Receipt | undefined>

test("the owned source CLI persists only an explicit native arm of the exact current selection", async () => {
  expectSpawn(import.meta.path)
  const root = await mkdtemp(join(tmpdir(), "activity-arm-cli-"))
  const home = join(root, "home")
  const temporary = join(root, "tmp")
  const database = join(root, "activity.sqlite")
  const source = join(root, "fixture-copy")
  await Promise.all([mkdir(home), mkdir(temporary), writeFile(source, "fixture payload")])
  const record = (label: string) => Effect.runPromise(Effect.gen(function* () {
    const ledger = yield* ActivityActionLedger.make
    const identity = yield* Effect.promise(() => stat(source, { bigint: true }))
    return yield* ledger.record({
      targetID: "fixture-copy", kind: "object", label, owner: "fixture owner",
      identity: `${identity.dev}:${identity.ino}`, members: [], dirty: false, eligible: ["arm"],
    })
  }).pipe(Effect.provide(Database.layerFromPath(database)), Effect.scoped))
  const target = await record(source)
  const entry = fileURLToPath(new URL("../../../cli/src/index.ts", import.meta.url))
  const inherited = [
    "PATH", "SYSTEMROOT", "SYSTEMDRIVE", "WINDIR", "COMSPEC", "PATHEXT",
    "HUGR_OMNI_ADDON", "HUGR_OMNI_SUPERVISOR", "ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER",
  ]
  const owned = await startOwnedServe({
    command: [process.execPath, entry],
    privateActivityApproval: true,
    cwd: root,
    env: {
      ...Object.fromEntries(Object.entries(process.env).filter(([key]) => inherited.includes(key.toUpperCase()))),
      HOME: home,
      USERPROFILE: home,
      APPDATA: join(home, "config"),
      LOCALAPPDATA: join(home, "data"),
      XDG_CONFIG_HOME: join(home, "config"),
      XDG_DATA_HOME: join(home, "data"),
      XDG_CACHE_HOME: join(home, "cache"),
      XDG_STATE_HOME: join(home, "state"),
      TEMP: temporary,
      TMP: temporary,
      TMPDIR: temporary,
      ORCHESTRA_TEST_HOME: home,
      ORCHESTRA_DB: database,
      ORCHESTRA_CONFIG_DIR: join(home, "orchestra-config"),
      ORCHESTRA_DISABLE_MODELS_FETCH: "1",
      ORCHESTRA_EXPERIMENTAL_DISABLE_FILEWATCHER: "true",
      ORCHESTRA_INHERIT_CREDENTIALS: "0",
    },
    logger: { log() {}, error() {} },
    write() {},
  })
  try {
    await owned.health.wait
    expect(await owned.probeActivityApproval()).toBe(true)
    const authorization = `Basic ${Buffer.from(`${owned.username}:${owned.password}`).toString("base64")}`
    const fetchPlan = async () => {
      const result = await fetch(new URL("/api/activity/plan", owned.url), { headers: { authorization } })
      expect(result.status).toBe(200)
      return Schema.decodeUnknownSync(ActivityArm.PlanSnapshot)(await result.json())
    }
    const binding = { targetID: target.targetID, generation: target.generation }
    const request = { targets: [binding] }
    const plan = await fetchPlan()
    expect(plan.ready).toEqual([{ ...binding, label: source, owner: "fixture owner" }])
    expect(plan.approvals).toEqual([])
    const unsigned = await fetch(new URL(ActivityPrivateChannel.previewPath, owned.url), {
      method: "POST", headers: { authorization, "content-type": "application/json" }, body: JSON.stringify(request),
    })
    expect(unsigned.status).toBe(403)

    const prompt = { response: 0, options: undefined as MessageBoxOptions | undefined }
    const frame = { url: "oc://renderer/" }
    const sender = Object.assign(new EventEmitter(), { id: 1, mainFrame: frame, isDestroyed: () => false })
    const window = { webContents: sender, isDestroyed: () => false }
    const handlers = new Map<string, ArmHandler>()
    registerActivityArmIpc({
      ipcMain: { handle: (name: string, handler: ArmHandler) => handlers.set(name, handler) },
      BrowserWindow: { fromWebContents: () => window },
      dialog: { showMessageBox: (_parent: unknown, options: MessageBoxOptions) => {
        prompt.options = options
        return Promise.resolve({ response: prompt.response })
      } },
      getOwned: () => owned,
    } as unknown as Parameters<typeof registerActivityArmIpc>[0])
    const handler = handlers.get("activity-arm-quarantine")
    if (!handler) throw new Error("Desktop arm handler missing")
    const event = { sender, senderFrame: frame } as unknown as IpcMainInvokeEvent
    expect(await handler(event, "http://127.0.0.1:1", request)).toBeUndefined()
    expect(prompt.options).toBeUndefined()
    expect(await handler(event, owned.url, request)).toBeUndefined()
    expect(prompt.options?.defaultId).toBe(0)
    expect(prompt.options?.detail).toContain(JSON.stringify(source))
    expect(prompt.options?.detail).toContain(JSON.stringify(target.generation))
    expect((await fetchPlan()).approvals).toEqual([])
    prompt.response = 1
    const receipt = await handler(event, owned.url, request)
    if (!receipt) throw new Error("native confirmation did not record a receipt")
    expect(receipt).toMatchObject({ action: "arm-quarantine", targets: plan.ready })
    expect((await fetchPlan()).approvals).toEqual([{ receipt, changed: false }])
    expect((await fetchPlan()).ready).toEqual([])
    expect(await handler(event, owned.url, request)).toBeUndefined()
    expect(await Bun.file(source).text()).toBe("fixture payload")
    await record("changed source label")
    expect((await fetchPlan()).approvals).toEqual([{ receipt, changed: true }])
  } finally {
    await owned.listener.stop()
    await rm(root, { recursive: true, force: true })
  }
}, 135_000)
