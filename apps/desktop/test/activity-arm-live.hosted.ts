import { expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { Effect, Schema } from "effect"
import { ActivityActionLedger } from "@orchestra/core/activity-action-ledger"
import { Database } from "@orchestra/core/database/database"
import { expectSpawn } from "@orchestra/core/test/fixture/omni-expect"
import { ActivityArm } from "@orchestra/schema/activity-arm"
import { ActivityPrivateChannel } from "@orchestra/schema/activity-private-channel"
import { startOwnedServe } from "../src/main/owned-serve"

test("the owned source CLI serves recorded Ready rows and refuses signed arm without a live verifier", async () => {
  expectSpawn(import.meta.path)
  const root = await mkdtemp(join(tmpdir(), "activity-arm-cli-"))
  const home = join(root, "home")
  const temporary = join(root, "tmp")
  const database = join(root, "activity.sqlite")
  const source = join(root, "fixture-copy")
  await Promise.all([mkdir(home), mkdir(temporary), writeFile(source, "fixture payload")])
  const target = await Effect.runPromise(Effect.gen(function* () {
    const ledger = yield* ActivityActionLedger.make
    const identity = yield* Effect.promise(() => stat(source, { bigint: true }))
    return yield* ledger.record({
      targetID: "fixture-copy", kind: "object", label: source, owner: "fixture owner",
      identity: `${identity.dev}:${identity.ino}`, members: [], dirty: false, eligible: ["arm"],
    })
  }).pipe(Effect.provide(Database.layerFromPath(database)), Effect.scoped))
  const entry = fileURLToPath(new URL("../../cli/src/index.ts", import.meta.url))
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

    const client = owned.openActivityArm()
    if (!client) throw new Error("Desktop signed arm client unavailable")
    expect(await client.preview(request)).toBeUndefined()
    expect(await client.confirm({ previewID: crypto.randomUUID() })).toBeUndefined()
    expect(await fetchPlan()).toEqual(plan)
    expect(await Bun.file(source).text()).toBe("fixture payload")
  } finally {
    await owned.listener.stop()
    await rm(root, { recursive: true, force: true })
  }
}, 135_000)
