import fs from "fs/promises"
import path from "path"
import { describe, expect } from "bun:test"
import { Effect, Layer, Schema } from "effect"
import { Config } from "@orchestra/core/config"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { Location } from "@orchestra/core/location"
import { LSP } from "@orchestra/core/lsp"
import { AbsolutePath } from "@orchestra/core/schema"
import { location } from "./fixture/location"
import { expectSpawn } from "./fixture/omni-expect"
import { tmpdir } from "./fixture/tmpdir"
import { it } from "./lib/effect"

const server = path.join(import.meta.dir, "fixture", "lsp-stdio-server.js")

const layer = (directory: string) =>
  AppNodeBuilder.build(LSP.node, [
    [
      Location.node,
      Layer.succeed(Location.Service, Location.Service.of(location({ directory: AbsolutePath.make(directory) }))),
    ],
    [
      Config.node,
      Layer.succeed(
        Config.Service,
        Config.Service.of({
          entries: () =>
            Effect.succeed([
              new Config.Document({
                type: "document",
                info: Schema.decodeUnknownSync(Config.Info)({
                  lsp: { stdio: { command: [process.execPath, server], extensions: [".stdio"] } },
                }),
              }),
            ]),
        }),
      ),
    ],
  ])

describe("LSP over stdio", () => {
  it.live("connects a configured language server and reports it connected", () =>
    Effect.acquireUseRelease(
      Effect.promise(() => tmpdir()),
      (tmp) =>
        Effect.gen(function* () {
          expectSpawn(import.meta.path)
          const lsp = yield* LSP.Service
          const file = path.join(tmp.path, "sample.stdio")
          yield* Effect.promise(() => fs.writeFile(file, "sample\n"))
          yield* lsp.touchFile(file)
          expect(yield* lsp.status()).toEqual([{ id: "stdio", name: "stdio", root: "", status: "connected" }])
        }).pipe(Effect.provide(layer(tmp.path))),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ),
  )
})
