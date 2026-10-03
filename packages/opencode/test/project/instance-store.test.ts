import { expect } from "bun:test"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Context, Deferred, Effect, Exit, Fiber, Layer, Option, Scope } from "effect"
import { InstanceBootstrap } from "@/project/bootstrap"
import { InstanceStore } from "@/project/instance-store"
import { tmpdirScoped } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(LayerNode.compile(CrossSpawnSpawner.node))

it.live("closing the store while an instance is booting does not hang", () =>
  Effect.gen(function* () {
    const directory = yield* tmpdirScoped()
    const booting = yield* Deferred.make<void>()
    const bootstrap = Layer.succeed(
      InstanceBootstrap.Service,
      InstanceBootstrap.Service.of({ run: Deferred.succeed(booting, undefined).pipe(Effect.andThen(Effect.never)) }),
    )
    const scope = yield* Scope.make()
    const context = yield* Layer.buildWithScope(
      LayerNode.compile(LayerNode.group([InstanceStore.node, CrossSpawnSpawner.node]), [
        [InstanceStore.bootstrapNode, bootstrap],
      ]),
      scope,
    )
    const loading = yield* Context.get(context, InstanceStore.Service)
      .load({ directory })
      .pipe(Effect.exit, Effect.forkDetach)
    yield* Deferred.await(booting)

    const closed = yield* Scope.close(scope, Exit.void).pipe(Effect.timeoutOption("5 seconds"))
    expect(Option.isSome(closed)).toBe(true)
    expect(Exit.isFailure(yield* Fiber.join(loading))).toBe(true)
  }),
)
