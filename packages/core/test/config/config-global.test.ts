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
          })

          const entries = yield* config.entries()
          expect(Config.latest(entries, "model")).toBe("anthropic/claude-opus")
          expect(Config.latest(entries, "shell")).toBe("/bin/zsh")
          expect(Config.latest(entries, "agents")?.maestro?.engine).toBe("claude-code")
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

  it.live("keeps disabled providers as exact provider.use denials that the next entries read enforces", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) => {
        const globalDirectory = path.join(tmp.path, "global")
        const file = path.join(globalDirectory, "orchestra.json")
        return Effect.gen(function* () {
          yield* Effect.promise(async () => {
            await fs.mkdir(globalDirectory, { recursive: true })
            await fs.writeFile(
              file,
              JSON.stringify({
                experimental: {
                  policies: [
                    { action: "provider.use", effect: "allow", resource: "anthropic" },
                    { action: "provider.use", effect: "deny", resource: "mistral" },
                  ],
                },
              }),
            )
          })
          const config = yield* Config.Service
          const policy = yield* Policy.Service
          expect((yield* Config.readGlobal()).disabledProviders).toEqual(["mistral"])

          yield* Config.updateGlobal({ disabledProviders: ["openai"] })
          yield* config.entries()

          expect((yield* Config.readGlobal()).disabledProviders).toEqual(["openai"])

          yield* Config.updateGlobal({ agents: { maestro: { engine: "claude-code" } } })
          expect((yield* Config.readGlobal()).agents).toEqual({ maestro: { engine: "claude-code" } })

          // The rule list is written whole and read back in the user's order, since a later match wins.
          const rules = [
            { action: "*", resource: "*", effect: "allow" },
            { action: "read", resource: "*.env", effect: "deny" },
            { action: "bash", resource: "*", effect: "ask" },
          ] as const
          yield* Config.updateGlobal({ permissions: rules })
          expect((yield* Config.readGlobal()).permissions).toEqual([...rules])
          yield* Config.updateGlobal({ permissions: [rules[2]] })
          expect((yield* Config.readGlobal()).permissions).toEqual([rules[2]])
          expect(Config.latest(yield* config.entries(), "permissions")).toEqual([rules[2]])
          expect(yield* policy.evaluate("provider.use", "openai", "allow")).toBe("deny")
          expect(yield* policy.evaluate("provider.use", "mistral", "allow")).toBe("allow")
          expect(yield* Effect.promise(() => fs.readFile(file, "utf8"))).toContain("anthropic")
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

  it.live("serves saved permissions from a global file that still holds legacy keys", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) => {
        const globalDirectory = path.join(tmp.path, "global")
        return Effect.gen(function* () {
          yield* Effect.promise(async () => {
            await fs.mkdir(globalDirectory, { recursive: true })
            await fs.writeFile(
              path.join(globalDirectory, "orchestra.json"),
              JSON.stringify({ disabled_providers: ["mistral"], permission: { edit: "ask" } }),
            )
          })
          const config = yield* Config.Service
          const rule = { action: "read", resource: "*.env", effect: "deny" } as const
          yield* Config.updateGlobal({ permissions: [rule] })
          expect((yield* Config.readGlobal()).permissions).toEqual([rule])
          // The legacy rules migrate first, so the saved rule, matching later, wins.
          expect(Config.latest(yield* config.entries(), "permissions")).toEqual([
            { action: "edit", resource: "*", effect: "ask" },
            rule,
          ])
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

  it.live("reuses the decoded global settings until a file changes or updateGlobal writes", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) => {
        const globalDirectory = path.join(tmp.path, "global")
        const file = path.join(globalDirectory, "orchestra.json")
        return Effect.gen(function* () {
          yield* Effect.promise(async () => {
            await fs.mkdir(globalDirectory, { recursive: true })
            await fs.writeFile(file, `{"model":"a/one"}`)
          })
          expect((yield* Config.readGlobal()).model).toBe("a/one")

          // Same size, inode and mtime: the cached value is served, which proves the file was not decoded again.
          yield* Effect.promise(async () => {
            const before = await fs.stat(file)
            await fs.writeFile(file, `{"model":"b/two"}`)
            await fs.utimes(file, before.atime, new Date(Math.floor(before.mtimeMs)))
          })
          expect((yield* Config.readGlobal()).model).toBe("a/one")

          // A served value is a copy: editing it does not poison the cache.
          const first = yield* Config.readGlobal()
          first.trustedProjects.push("/mutated")
          expect((yield* Config.readGlobal()).trustedProjects).toEqual([])

          // An external edit that changes the size is seen on the next read.
          yield* Effect.promise(() => fs.writeFile(file, `{"model":"c/three"}`))
          expect((yield* Config.readGlobal()).model).toBe("c/three")

          // A new higher-priority file is seen, and so is its removal.
          const jsonc = path.join(globalDirectory, "orchestra.jsonc")
          yield* Effect.promise(() => fs.writeFile(jsonc, `{"model":"d/four"}`))
          expect((yield* Config.readGlobal()).model).toBe("d/four")
          yield* Effect.promise(() => fs.rm(jsonc))
          expect((yield* Config.readGlobal()).model).toBe("c/three")

          // updateGlobal drops the entry, so its own write is read back at once.
          yield* Config.updateGlobal({ model: "e/five" })
          expect((yield* Config.readGlobal()).model).toBe("e/five")
        }).pipe(
          Effect.provide(
            AppNodeBuilder.build(LayerNode.group([FSUtil.node, Global.node]), [
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
