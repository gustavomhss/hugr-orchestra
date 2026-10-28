import { describe, expect, test } from "bun:test"
import { CONDITION, type Flow, type FlowNode, TRIGGER } from "./graph"
import { readRule, writeRule } from "./rule"

const node = (id: string, type: string): FlowNode => ({ id, name: id, type, x: 0, y: 0, parameters: {} })

// A trigger, two cases (c1 and c2, or c3) and two actions: the shape the rule view edits.
const hook = (): Flow => ({
  kind: "hook",
  nodes: [
    node("t", TRIGGER),
    node("c1", CONDITION),
    node("c2", CONDITION),
    node("c3", CONDITION),
    node("warn", "relay.hookWarn"),
    node("block", "relay.hookBlock"),
  ],
  edges: [
    { from: "t", to: "c1", port: 0 },
    { from: "c1", to: "c2", port: 0 },
    { from: "c1", to: "c3", port: 1 },
    { from: "c2", to: "warn", port: 0 },
    { from: "c2", to: "c3", port: 1 },
    { from: "c3", to: "warn", port: 0 },
    { from: "warn", to: "block", port: 0 },
  ],
  phases: [],
})

describe("reading a hook as a rule", () => {
  test("reads the trigger, the cases and the actions in order", () => {
    expect(readRule(hook())).toEqual({ trigger: "t", cases: [["c1", "c2"], ["c3"]], actions: ["warn", "block"] })
  })

  test("an empty hook is an empty rule", () => {
    expect(readRule({ kind: "hook", nodes: [], edges: [], phases: [] })).toEqual({
      trigger: undefined,
      cases: [],
      actions: [],
    })
  })

  test("a trigger wired straight to its actions has no cases", () => {
    const flow: Flow = {
      kind: "hook",
      nodes: [node("t", TRIGGER), node("warn", "relay.hookWarn")],
      edges: [{ from: "t", to: "warn", port: 0 }],
      phases: [],
    }
    expect(readRule(flow)).toEqual({ trigger: "t", cases: [], actions: ["warn"] })
  })

  test("a hook drawn with other branches does not fit", () => {
    const base = hook()
    // Two triggers.
    expect(readRule({ ...base, nodes: [...base.nodes, node("t2", TRIGGER)] })).toBeUndefined()
    // A node no wire reaches.
    expect(readRule({ ...base, nodes: [...base.nodes, node("loose", "relay.hookWarn")] })).toBeUndefined()
    // A No branch that leads to an action instead of the next case.
    expect(readRule({ ...base, edges: [...base.edges, { from: "c3", to: "block", port: 1 }] })).toBeUndefined()
    // Nodes but no trigger.
    expect(readRule({ ...base, nodes: base.nodes.filter((item) => item.type !== TRIGGER) })).toBeUndefined()
  })
})

describe("writing a rule", () => {
  test("writing a rule back gives the same wires", () => {
    const flow = hook()
    const written = writeRule(flow, readRule(flow)!)
    const key = (edge: { from: string; to: string; port: number }) => `${edge.from}>${edge.to}:${edge.port}`
    expect(written.edges.map(key).toSorted()).toEqual(flow.edges.map(key).toSorted())
    expect(readRule(written)).toEqual(readRule(flow))
  })

  test("nothing follows Block, and nodes the rule drops leave the flow", () => {
    const flow = hook()
    const written = writeRule(flow, { trigger: "t", cases: [["c1"]], actions: ["block", "warn"] })
    expect(written.nodes.map((item) => item.id)).toEqual(["t", "c1", "warn", "block"])
    expect(written.edges.some((edge) => edge.from === "block")).toBe(false)
    expect(written.edges).toContainEqual({ from: "c1", to: "block", port: 0 })
  })

  test("lays the cases out in rows and the actions after the longest case", () => {
    const written = writeRule(hook(), readRule(hook())!)
    const at = (id: string) => {
      const item = written.nodes.find((entry) => entry.id === id)
      return [item?.x, item?.y]
    }
    expect(at("c3")).toEqual([320, 360])
    expect(at("warn")).toEqual([720, 200])
  })
})
