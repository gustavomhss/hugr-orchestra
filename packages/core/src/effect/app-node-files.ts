import { Effect, FileSystem, Layer, Path } from "effect"
import { makeGlobalNode } from "./app-node"

export const filesystem = makeGlobalNode({
  service: FileSystem.FileSystem,
  layer: Layer.unwrap(Effect.promise(async () => {
    const { layer } = await import("@effect/platform-node/NodeFileSystem")
    return layer
  })),
  deps: [],
})

export const path = makeGlobalNode({
  service: Path.Path,
  layer: Layer.unwrap(Effect.promise(async () => {
    const { layer } = await import("@effect/platform-node/NodePath")
    return layer
  })),
  deps: [],
})
