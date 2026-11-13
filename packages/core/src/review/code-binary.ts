export * as ReviewCodeBinary from "./code-binary"

import { Context, Layer } from "effect"
import { CrossSpawnSpawner } from "../cross-spawn-spawner"
import { makeGlobalNode } from "../effect/app-node"
import { httpClient } from "../effect/app-node-platform"
import { FSUtil } from "../fs-util"
import { RipgrepBinary } from "../ripgrep/binary"
import { EffectFlock } from "../util/effect-flock"

export class Service extends Context.Service<Service, RipgrepBinary.Interface>()("@orchestra/ReviewCodeBinary") {}

export function make(options: Partial<RipgrepBinary.Options> = {}): ReturnType<typeof RipgrepBinary.make> {
  return RipgrepBinary.make({ ...options, download: false })
}

export const node = makeGlobalNode({
  service: Service,
  layer: Layer.effect(Service, make()),
  deps: [FSUtil.node, httpClient, CrossSpawnSpawner.node, EffectFlock.node],
})
