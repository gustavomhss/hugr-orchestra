import { expect } from "bun:test"
import path from "path"
import { Effect, Layer } from "effect"
import { HttpClient } from "effect/unstable/http"
import { ConfigV1 } from "@orchestra/core/v1/config/config"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { httpClient } from "@orchestra/core/effect/app-node-platform"
import { FSUtil } from "@orchestra/core/fs-util"
import { Global } from "@orchestra/core/global"
import { Npm } from "@orchestra/core/npm"
import { CrossSpawnSpawner } from "@orchestra/core/cross-spawn-spawner"
import { Config } from "@/config/config"
import { ConfigParse } from "@/config/parse"
import { Auth } from "@/auth"
import { Account } from "@/account/account"
import { Env } from "@/env"
import { AuthTest } from "../fake/auth"
import { AccountTest } from "../fake/account"
import { NpmTest } from "../fake/npm"
import { tmpdirScoped } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(
  LayerNode.compile(LayerNode.group([Config.node, FSUtil.node, Env.node, CrossSpawnSpawner.node]), [
    [Auth.node, AuthTest.empty],
    [Account.node, AccountTest.empty],
    [Npm.node, NpmTest.noop],
    [
      httpClient,
      Layer.succeed(
        HttpClient.HttpClient,
        HttpClient.make((request) => Effect.die(`unexpected http request: ${request.method} ${request.url}`)),
      ),
    ],
  ]),
)

for (const extension of ["json", "jsonc"]) {
  it.live(`lean global ${extension} true to false persists and reloads without losing settings`, () =>
    Effect.gen(function* () {
      const directory = yield* tmpdirScoped()
      const fs = yield* FSUtil.Service
      const config = yield* Config.Service
      const file = path.join(directory, `orchestra.${extension}`)
      const initial = {
        model: "test/model",
        username: "keep-user",
        watcher: { ignore: ["keep/**"] },
        compaction: { auto: false, prune: false },
        tool_output: { max_lines: 123, max_bytes: 4567, lean: { enabled: true } },
        unknown_setting: { nested: { keep: "unchanged", flag: false } },
      }
      const text = JSON.stringify(initial, null, 2)
      yield* fs.writeFileString(
        file,
        extension === "jsonc" ? text.replace("{", "{\n  // keep lean config comment") : text,
      )

      return yield* Effect.acquireUseRelease(
        Effect.sync(() => {
          const previous = Global.Path.config
          ;(Global.Path as { config: string }).config = directory
          return previous
        }),
        () => Effect.gen(function* () {
          yield* config.invalidate()
          expect((yield* config.getGlobal()).tool_output).toEqual(initial.tool_output)

          const patch = ConfigParse.schema(ConfigV1.Info, { tool_output: { lean: { enabled: false } } }, "test:lean")
          const disabled = yield* config.updateGlobal(patch)
          const expected = { ...initial.tool_output, lean: { enabled: false } }
          expect(disabled.changed).toBe(true)
          expect(disabled.info.tool_output).toEqual(expected)
          expect((yield* config.getGlobal()).tool_output).toEqual(expected)

          const written = yield* fs.readFileString(file)
          expect(ConfigParse.jsonc(written, file)).toEqual({ ...initial, tool_output: expected })
          if (extension === "jsonc") expect(written).toContain("// keep lean config comment")

          yield* config.invalidate()
          const reloaded = yield* config.getGlobal()
          expect(reloaded.tool_output).toEqual(expected)
          expect(reloaded.model).toBe(initial.model)
          expect(reloaded.username).toBe(initial.username)
          expect(reloaded.watcher).toEqual(initial.watcher)
          expect(reloaded.compaction).toEqual(initial.compaction)

          const repeated = yield* config.updateGlobal(patch)
          expect(repeated.changed).toBe(false)
          expect(repeated.info.tool_output).toEqual(expected)
          expect(yield* fs.readFileString(file)).toBe(written)

          yield* config.updateGlobal({ tool_output: { max_lines: 321 } })
          yield* config.updateGlobal({ username: "changed-user" })
          yield* config.invalidate()
          expect((yield* config.getGlobal()).tool_output).toEqual({ ...expected, max_lines: 321 })
          const final = yield* fs.readFileString(file)
          expect(ConfigParse.jsonc(final, file)).toEqual({
            ...initial,
            username: "changed-user",
            tool_output: { ...expected, max_lines: 321 },
          })
          if (extension === "jsonc") expect(final).toContain("// keep lean config comment")
        }),
        (previous) => Effect.gen(function* () {
          ;(Global.Path as { config: string }).config = previous
          yield* config.invalidate()
        }),
      )
    }),
  )
}
