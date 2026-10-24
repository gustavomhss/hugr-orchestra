import { expect, test } from "bun:test"
import { Effect, Layer } from "effect"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { Seats } from "../src/seats"
import { MaestroSeats } from "../src/v2/seats-service"

test("the Location's seat service lists every roster seat and nothing else", async () => {
  const seats = await Effect.runPromise(
    Effect.gen(function* () {
      return yield* MaestroSeats.Service
    }).pipe(
      Effect.provide(AppNodeBuilder.build(LayerNode.group([MaestroSeats.node])) as Layer.Layer<MaestroSeats.Service>),
    ),
  )
  expect(seats.ids).toEqual(Object.keys(Seats.all))
  expect(seats.ids).toContain("backend")
  expect(seats.has("lucy")).toBe(true)
  for (const id of ["maestro", "general", "explore", "unknown"]) expect(seats.has(id)).toBe(false)
})

test("a seat set answers only for its own ids", () => {
  const seats = MaestroSeats.make(["lucy"])
  expect(seats.ids).toEqual(["lucy"])
  expect(seats.has("lucy")).toBe(true)
  expect(seats.has("billy")).toBe(false)
  expect(MaestroSeats.make([]).has("lucy")).toBe(false)
})
