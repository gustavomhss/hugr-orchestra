import { Atlas } from "@orchestra/core/atlas"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { Npm } from "@orchestra/core/npm"
import { AppProcess } from "@orchestra/core/process"
import { Context, Effect, Layer } from "effect"
import { InstanceState } from "@/effect/instance-state"

// The legacy instance routes' Atlas service: the shared surface (@orchestra/core/atlas) opened at the instance's store
// root on every call. The V2 server opens the same surface at its Location (packages/server/src/handlers/atlas.ts).

export const Unavailable = Atlas.Unavailable
export type Unavailable = Atlas.Unavailable
export type MineWithInput = Atlas.MineWithInput
export type Interface = Atlas.Interface

export class Service extends Context.Service<Service, Interface>()("@orchestra/AtlasSurface") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const dependencies = { npm: yield* Npm.Service, processes: yield* AppProcess.Service }
    const at = <A, E>(call: (atlas: Interface) => Effect.Effect<A, E>) =>
      Effect.flatMap(InstanceState.context, (ctx) =>
        call(Atlas.open(dependencies, Atlas.storeRoot(ctx.worktree, ctx.directory), ctx.project.id)),
      )
    return Service.of({
      snapshot: () => at((atlas) => atlas.snapshot()),
      reasoning: (id) => at((atlas) => atlas.reasoning(id)),
      own: (scope) => at((atlas) => atlas.own(scope)),
      health: () => at((atlas) => atlas.health()),
      promote: (input) => at((atlas) => atlas.promote(input)),
      draft: (input) => at((atlas) => atlas.draft(input)),
      emit: (input) => at((atlas) => atlas.emit(input)),
      link: (input) => at((atlas) => atlas.link(input)),
      verify: (input) => at((atlas) => atlas.verify(input)),
      review: () => at((atlas) => atlas.review()),
      hold: (input) => at((atlas) => atlas.hold(input)),
      release: (input) => at((atlas) => atlas.release(input)),
      propose: (input) => at((atlas) => atlas.propose(input)),
      decide: (input) => at((atlas) => atlas.decide(input)),
      answer: (input) => at((atlas) => atlas.answer(input)),
      memoryDecide: (input) => at((atlas) => atlas.memoryDecide(input)),
      territory: (input) => at((atlas) => atlas.territory(input)),
      install: () => at((atlas) => atlas.install()),
      index: () => at((atlas) => atlas.index()),
      mineSites: (ceiling) => at((atlas) => atlas.mineSites(ceiling)),
      mineWith: (input) => at((atlas) => atlas.mineWith(input)),
    })
  }),
)

export const node = LayerNode.make({ service: Service, layer, deps: [AppProcess.node, Npm.node] })

export * as AtlasSurface from "./atlas-surface"
