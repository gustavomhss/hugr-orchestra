import { expect } from "bun:test"
import { Effect } from "effect"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { Global } from "@orchestra/core/global"
import { Config } from "@/config/config"
import { ConfigCacheTest } from "../fixture/config-cache"
import { tmpdir } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { rethrow } from "../lib/rejection"

const it = testEffect(LayerNode.compile(Config.node))

;[false, true].forEach((failDisposal) => it.live(
  `global config restores local/shared caches${failDisposal ? " despite instance disposal failure" : ""}`,
  () => Effect.gen(function* () {
    const config = yield* Config.Service
    return yield* Effect.promise(async () => {
      const { AppRuntime } = await import("@/effect/app-runtime")
      await using tmp = await tmpdir({ config: { snapshot: false } })
      const previous = Global.Path.config
      const local = () => Effect.runPromise(config.invalidate())
      await ConfigCacheTest.invalidate(local)
      const localBaseline = await Effect.runPromise(config.getGlobal())
      const sharedBaseline = await AppRuntime.runPromise(Config.use.getGlobal())
      const run = ConfigCacheTest.withDirectory(tmp.path, local, async () => {
        expect((await Effect.runPromise(config.getGlobal())).snapshot).toBe(false)
        expect((await AppRuntime.runPromise(Config.use.getGlobal())).snapshot).toBe(false)
      }, async () => {
        if (failDisposal) throw new Error("fixture disposal failure")
      })
      if (failDisposal) expect(await rethrow(run)).toThrow("fixture disposal failure")
      if (!failDisposal) await run
      expect(Global.Path.config).toBe(previous)
      expect(await Effect.runPromise(config.getGlobal())).toEqual(localBaseline)
      expect(await AppRuntime.runPromise(Config.use.getGlobal())).toEqual(sharedBaseline)
    })
  }),
  15000,
))
