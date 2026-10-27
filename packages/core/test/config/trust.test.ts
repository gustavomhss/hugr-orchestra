import path from "path"
import fs from "fs/promises"
import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { ConfigTrust } from "@orchestra/core/config/trust"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { FSUtil } from "@orchestra/core/fs-util"
import { Global } from "@orchestra/core/global"
import { tmpdir } from "../fixture/tmpdir"
import { testEffect } from "../lib/effect"

const it = testEffect(Layer.empty)

// A user's global config folder and a project folder, both under one temporary root.
function layout(root: string) {
  const globalDirectory = path.join(root, "global")
  return {
    root,
    globalDirectory,
    project: path.join(root, "work", "app"),
    file: path.join(globalDirectory, "orchestra.json"),
  }
}

const trustedInFile = (file: string) =>
  Effect.promise(async () => JSON.parse(await fs.readFile(file, "utf8")).trusted_projects)

describe("ConfigTrust", () => {
  it.live("approve stores the project's real path in the global config, and list reads it back", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) => {
        const input = layout(tmp.path)
        return Effect.gen(function* () {
          yield* Effect.promise(() => fs.mkdir(input.project, { recursive: true }))
          // The project's own config claims to trust itself: that entry must never count.
          yield* Effect.promise(() =>
            fs.writeFile(
              path.join(input.project, "orchestra.json"),
              JSON.stringify({ trusted_projects: [input.project] }),
            ),
          )
          const projectConfig = yield* Effect.promise(() =>
            fs.readFile(path.join(input.project, "orchestra.json"), "utf8"),
          )

          yield* ConfigTrust.approve(input.project)

          const real = yield* Effect.promise(() => fs.realpath(input.project))
          expect(yield* ConfigTrust.list()).toEqual([real])
          expect(yield* trustedInFile(input.file)).toEqual([real])
          expect(yield* Effect.promise(() => fs.readFile(path.join(input.project, "orchestra.json"), "utf8"))).toBe(
            projectConfig,
          )
        }).pipe(
          Effect.provide(
            AppNodeBuilder.build(LayerNode.group([FSUtil.node, Global.node]), [
              [Global.node, Global.layerWith({ config: input.globalDirectory })],
            ]),
          ),
        )
      }),
    ),
  )

  it.live("approving a folder that is already trusted, or sits inside a trusted folder, writes nothing", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) => {
        const input = layout(tmp.path)
        return Effect.gen(function* () {
          yield* Effect.promise(() => fs.mkdir(path.join(input.globalDirectory), { recursive: true }))
          yield* Effect.promise(() => fs.mkdir(input.project, { recursive: true }))
          const parent = path.join(input.root, "work")
          yield* ConfigTrust.approve(parent)
          const before = yield* Effect.promise(() => fs.readFile(input.file, "utf8"))

          yield* ConfigTrust.approve(parent)
          yield* ConfigTrust.approve(input.project)

          expect(yield* Effect.promise(() => fs.readFile(input.file, "utf8"))).toBe(before)
          expect(yield* ConfigTrust.list()).toEqual([yield* Effect.promise(() => fs.realpath(parent))])
        }).pipe(
          Effect.provide(
            AppNodeBuilder.build(LayerNode.group([FSUtil.node, Global.node]), [
              [Global.node, Global.layerWith({ config: input.globalDirectory })],
            ]),
          ),
        )
      }),
    ),
  )

  it.live("approve refuses a missing folder, a file, a relative path and the filesystem root", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) => {
        const input = layout(tmp.path)
        return Effect.gen(function* () {
          yield* Effect.promise(() => fs.mkdir(input.globalDirectory, { recursive: true }))
          yield* Effect.promise(() => fs.mkdir(input.project, { recursive: true }))
          const file = path.join(input.project, "notes.txt")
          yield* Effect.promise(() => fs.writeFile(file, "x"))

          const missing = yield* ConfigTrust.approve(path.join(input.root, "gone")).pipe(Effect.flip)
          const notDirectory = yield* ConfigTrust.approve(file).pipe(Effect.flip)
          const relative = yield* ConfigTrust.approve("work/app").pipe(Effect.flip)
          const root = yield* ConfigTrust.approve(path.parse(input.root).root).pipe(Effect.flip)

          expect([missing, notDirectory, relative, root].map((error) => error._tag)).toEqual([
            "ConfigTrust.DirectoryError",
            "ConfigTrust.DirectoryError",
            "ConfigTrust.DirectoryError",
            "ConfigTrust.DirectoryError",
          ])
          expect(yield* ConfigTrust.list()).toEqual([])
        }).pipe(
          Effect.provide(
            AppNodeBuilder.build(LayerNode.group([FSUtil.node, Global.node]), [
              [Global.node, Global.layerWith({ config: input.globalDirectory })],
            ]),
          ),
        )
      }),
    ),
  )

  it.live("revoke removes the folder's own entry and leaves a folder trusted only through its parent", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) => {
        const input = layout(tmp.path)
        return Effect.gen(function* () {
          yield* Effect.promise(() => fs.mkdir(input.globalDirectory, { recursive: true }))
          yield* Effect.promise(() => fs.mkdir(input.project, { recursive: true }))
          yield* ConfigTrust.approve(input.project)
          yield* ConfigTrust.revoke(input.project)
          expect(yield* ConfigTrust.list()).toEqual([])
          expect(yield* trustedInFile(input.file)).toEqual([])

          const parent = path.join(input.root, "work")
          yield* ConfigTrust.approve(parent)
          yield* ConfigTrust.revoke(input.project)
          expect(yield* ConfigTrust.list()).toEqual([yield* Effect.promise(() => fs.realpath(parent))])
        }).pipe(
          Effect.provide(
            AppNodeBuilder.build(LayerNode.group([FSUtil.node, Global.node]), [
              [Global.node, Global.layerWith({ config: input.globalDirectory })],
            ]),
          ),
        )
      }),
    ),
  )
})
