import path from "path"
import fs from "fs/promises"
import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { Config } from "@orchestra/core/config"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { FSUtil } from "@orchestra/core/fs-util"
import { Global } from "@orchestra/core/global"
import { Location } from "@orchestra/core/location"
import { Policy } from "@orchestra/core/policy"
import { AbsolutePath } from "@orchestra/core/schema"
import { location } from "../fixture/location"
import { tmpdir } from "../fixture/tmpdir"
import { testEffect } from "../lib/effect"

const it = testEffect(Layer.empty)

describe("Config.updateGlobal", () => {
  it.live("writes global settings in place and serves them on the next entries read", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) => {
        const globalDirectory = path.join(tmp.path, "global")
        const file = path.join(globalDirectory, "orchestra.jsonc")
        return Effect.gen(function* () {
          yield* Effect.promise(async () => {
            await fs.mkdir(globalDirectory, { recursive: true })
            await fs.writeFile(file, `{\n  // kept\n  "shell": "/bin/zsh"\n}`)
          })
          const config = yield* Config.Service
          expect(Config.latest(yield* config.entries(), "model")).toBeUndefined()

          yield* Config.updateGlobal({
            model: "anthropic/claude-opus",
            agents: { maestro: { engine: "claude-code" } },
            providers: { openai: { disabled: true } },
          })

          const entries = yield* config.entries()
          expect(Config.latest(entries, "model")).toBe("anthropic/claude-opus")
          expect(Config.latest(entries, "shell")).toBe("/bin/zsh")
          expect(Config.latest(entries, "agents")?.maestro?.engine).toBe("claude-code")
          expect(Config.latest(entries, "providers")?.openai?.disabled).toBe(true)
          expect(yield* Effect.promise(() => fs.readFile(file, "utf8"))).toContain("// kept")
        }).pipe(
          Effect.provide(
            AppNodeBuilder.build(LayerNode.group([Config.node, Policy.node, FSUtil.node, Global.node]), [
              [
                Location.node,
                Layer.succeed(
                  Location.Service,
                  Location.Service.of(location({ directory: AbsolutePath.make(tmp.path) })),
                ),
              ],
              [Global.node, Global.layerWith({ config: globalDirectory })],
            ]),
          ),
        )
      }),
    ),
  )
})
