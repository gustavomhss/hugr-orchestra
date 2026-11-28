import { expect } from "bun:test"
import { join } from "node:path"
import { Effect } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { Omni } from "@orchestra/core/omni"
import { AppProcess } from "@orchestra/core/process"
import { expectSpawn } from "@orchestra/core/test/fixture/omni-expect"
import { tmpdir } from "@orchestra/core/test/fixture/tmpdir"
import { testEffect } from "@orchestra/core/test/lib/effect"

const it = testEffect(LayerNode.compile(AppProcess.node))

it.live(
  "duplicate default file hosts are refused without closing the first host (existing API)",
  () =>
    Effect.gen(function* () {
      const tmp = yield* Effect.acquireRelease(
        Effect.promise(() => tmpdir()),
        (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
      )
      const app = yield* AppProcess.Service
      expectSpawn(import.meta.path)
      const before = Omni.snapshot().spawns
      const result = yield* app.run(
        ChildProcess.make(process.execPath, [join(import.meta.dir, "fixture", "embedded-default.ts")], {
          env: {
            ...process.env,
            ORCHESTRA_DB: join(tmp.path, "default.sqlite"),
            ORCHESTRA_TEST_HOME: tmp.path,
            XDG_DATA_HOME: join(tmp.path, "data"),
            XDG_CONFIG_HOME: join(tmp.path, "config"),
            XDG_CACHE_HOME: join(tmp.path, "cache"),
            XDG_STATE_HOME: join(tmp.path, "state"),
          },
        }),
        { timeout: "10 seconds" },
      )
      expect(Omni.snapshot().spawns).toBeGreaterThan(before)
      expect(result.exitCode).toBe(0)
      const line = result.stdout
        .toString()
        .split("\n")
        .find((line) => line.startsWith("embedded custody result: "))
      if (!line) throw new Error("Missing embedded custody result")
      const report = JSON.parse(line.slice("embedded custody result: ".length))
      expect(report.defaultFileOpened).toBe(true)
      expect(report.firstSurvivedRejectedScope).toBe(true)
      expect(report.duplicateRejected).toBe(true)
      expect(report.tag).toBe("Orchestra.StoreInUseError")
    }),
  15000,
)
