import fs from "fs/promises"
import path from "path"
import { describe, expect } from "bun:test"
import { Effect, Layer, Schema } from "effect"
import { Config } from "@orchestra/core/config"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { FileMutation } from "@orchestra/core/file-mutation"
import { Location } from "@orchestra/core/location"
import { LocationMutation } from "@orchestra/core/location-mutation"
import { AbsolutePath } from "@orchestra/core/schema"
import { location } from "./fixture/location"
import { tmpdir } from "./fixture/tmpdir"
import { it } from "./lib/effect"

// A formatter outside the workspace that strips a BOM and upper-cases the file in place, so a formatted write is
// visible in the bytes on disk.
const upper = {
  command: [
    process.execPath,
    "-e",
    "const fs = require('fs'); const file = process.argv.at(-1); fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(/^\\uFEFF/, '').toUpperCase())",
    "$FILE",
  ],
  extensions: [".up"],
}

function provide(directory: string) {
  return Effect.provide(
    AppNodeBuilder.build(LayerNode.group([LocationMutation.node, FileMutation.node]), [
      [Location.node, Layer.succeed(Location.Service, Location.Service.of(location({ directory: AbsolutePath.make(directory) })))],
      [
        Config.node,
        Layer.succeed(
          Config.Service,
          Config.Service.of({
            entries: () =>
              Effect.succeed([
                new Config.Document({ type: "document", info: Schema.decodeUnknownSync(Config.Info)({ formatter: { upper } }) }),
              ]),
          }),
        ),
      ],
    ]),
  )
}

function withTmp<A, E, R>(f: (directory: string) => Effect.Effect<A, E, R>) {
  return Effect.acquireRelease(
    Effect.promise(() => tmpdir()),
    (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
  ).pipe(Effect.flatMap((tmp) => f(tmp.path)))
}

describe("FileMutation format on write", () => {
  it.live("runs the configured formatter on a written file", () =>
    withTmp((directory) =>
      Effect.gen(function* () {
        const mutation = yield* LocationMutation.Service
        const files = yield* FileMutation.Service
        yield* files.write({ target: yield* mutation.resolve({ path: "note.up" }), content: "hello" })
        expect(yield* Effect.promise(() => fs.readFile(path.join(directory, "note.up"), "utf8"))).toBe("HELLO")
      }).pipe(provide(directory)),
    ),
  )

  it.live("formats created and conditionally written files", () =>
    withTmp((directory) =>
      Effect.gen(function* () {
        const mutation = yield* LocationMutation.Service
        const files = yield* FileMutation.Service
        const target = yield* mutation.resolve({ path: "new.up" })
        yield* files.create({ target, content: "created" })
        expect(yield* Effect.promise(() => fs.readFile(path.join(directory, "new.up"), "utf8"))).toBe("CREATED")
        yield* files.writeIfUnchanged({
          target,
          content: "edited",
          expected: new TextEncoder().encode("CREATED"),
        })
        expect(yield* Effect.promise(() => fs.readFile(path.join(directory, "new.up"), "utf8"))).toBe("EDITED")
      }).pipe(provide(directory)),
    ),
  )

  it.live("keeps the BOM a formatter dropped", () =>
    withTmp((directory) =>
      Effect.gen(function* () {
        const mutation = yield* LocationMutation.Service
        const files = yield* FileMutation.Service
        yield* files.writeTextPreservingBom({
          target: yield* mutation.resolve({ path: "bom.up" }),
          content: "﻿hello",
        })
        expect(yield* Effect.promise(() => fs.readFile(path.join(directory, "bom.up"), "utf8"))).toBe("﻿HELLO")
      }).pipe(provide(directory)),
    ),
  )

  it.live("leaves files without a matching formatter untouched", () =>
    withTmp((directory) =>
      Effect.gen(function* () {
        const mutation = yield* LocationMutation.Service
        const files = yield* FileMutation.Service
        yield* files.write({ target: yield* mutation.resolve({ path: "note.txt" }), content: "hello" })
        expect(yield* Effect.promise(() => fs.readFile(path.join(directory, "note.txt"), "utf8"))).toBe("hello")
      }).pipe(provide(directory)),
    ),
  )
})
