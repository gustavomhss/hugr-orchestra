import { describe, expect, test } from "bun:test"
import { Context, Layer } from "effect"
import { makeGlobalNode, makeLocationNode } from "../src/effect/app-node"
import { Host } from "../src/host"
import { LocationServiceMap } from "../src/location-service-map"
import { ScheduledTask } from "../src/scheduled-task"
import { SessionV2 } from "../src/session"
import { SessionExecution } from "../src/session/execution"
import { ToolRegistry } from "../src/tool/registry"

class First extends Context.Service<First, { readonly value: number }>()("@test/host/First") {}
class Second extends Context.Service<Second, { readonly value: number }>()("@test/host/Second") {}
class Area extends Context.Service<Area, { readonly value: number }>()("@test/host/Area") {}

const first = makeGlobalNode({ service: First, layer: Layer.succeed(First, First.of({ value: 1 })), deps: [] })
const second = makeGlobalNode({ service: Second, layer: Layer.succeed(Second, Second.of({ value: 2 })), deps: [] })
const area = makeLocationNode({ service: Area, layer: Layer.succeed(Area, Area.of({ value: 3 })), deps: [] })
const replacement = makeGlobalNode({ service: First, layer: Layer.succeed(First, First.of({ value: 10 })), deps: [] })

describe("Host.merge", () => {
  test("an empty list contributes nothing", () => {
    const merged = Host.merge([])
    expect(merged.replacements).toEqual([])
    expect(merged.nodes).toEqual([])
    expect(merged.locationNodes).toEqual([])
    expect(merged.references).toBe(Layer.empty)
  })

  test("flattens every field in contribution order", () => {
    const merged = Host.merge([
      { id: "one", nodes: [second], replacements: [[first, replacement]], locationNodes: [area] },
      { id: "two", nodes: [first] },
    ])
    expect(merged.nodes.map((node) => node.name)).toEqual([second.name, first.name])
    expect(merged.replacements).toEqual([[first, replacement]])
    expect(merged.locationNodes).toEqual([area])
  })

  test("collects reference overrides into one layer", () => {
    const Reference = Context.Reference<number>("@test/host/Reference", { defaultValue: () => 0 })
    const one = Layer.succeed(Reference, 1)
    const two = Layer.succeed(Reference, 2)
    // Running a merged layer needs the root's Database, EventV2 and Location map; createRoutes supplies them.
    expect(Host.merge([{ id: "one", references: one }, { id: "two" }]).references).toBe(one)
    expect(Host.merge([{ id: "one", references: one }, { id: "two", references: two }]).references).not.toBe(one)
    expect(Host.merge([{ id: "one" }, { id: "two" }]).references).toBe(Layer.empty)
  })

  test("rejects a duplicate contribution id", () => {
    expect(() => Host.merge([{ id: "maestro" }, { id: "app-dock" }, { id: "maestro" }])).toThrow(
      "Host contribution id is not unique: maestro",
    )
  })

  test("rejects every reserved coordinator node as a replacement source or a node", () => {
    ;[SessionExecution.node, SessionV2.node, LocationServiceMap.node, ScheduledTask.node, ScheduledTask.daemonNode].forEach((node) =>
      expect(() => Host.merge([{ id: "rogue", replacements: [[node, first]] }])).toThrow(`Host contribution may not own ${node.name}`),
    )
    expect(() => Host.merge([{ id: "rogue", nodes: [{ ...first, name: SessionV2.node.name }] }])).toThrow(
      `Host contribution may not own ${SessionV2.node.name}`,
    )
  })

  test("rejects a global node two contributions both add", () => {
    expect(() => Host.merge([{ id: "one", nodes: [first] }, { id: "two", nodes: [first] }])).toThrow(
      `Host contribution node is not unique: ${first.name}`,
    )
  })

  test("rejects a duplicate Location node and one that shadows a built-in", () => {
    expect(() => Host.merge([{ id: "one", locationNodes: [area] }, { id: "two", locationNodes: [area] }])).toThrow(
      `Host contribution Location node is not unique: ${area.name}`,
    )
    expect(() => Host.merge([{ id: "one", locationNodes: [ToolRegistry.node] }])).toThrow(
      `Host contribution Location node is not unique: ${ToolRegistry.node.name}`,
    )
  })
})
