import { describe, expect, test } from "bun:test"
import { CONDITION, chain, type Flow, readChecklist, START, TRIGGER } from "./graph"
import { addAlternative, addNode, defaultAnchor, freePhaseName, groupBlock, groupSelection, ungroup } from "./insert"
import { hookPresets } from "./presets"

const flow = (): Flow => ({
  kind: "workflow",
  nodes: [
    { id: "start", name: "Start", type: START, x: 96, y: 132, parameters: {} },
    { id: "a", name: "A", type: "relay.execute", x: 240, y: 132, parameters: {} },
    { id: "b", name: "B", type: "relay.gate", x: 376, y: 132, parameters: {} },
  ],
  edges: [
    { from: "start", to: "a", port: 0 },
    { from: "a", to: "b", port: 0 },
  ],
  phases: [{ id: "p", name: "P", description: "", nodeIds: ["a", "b"] }],
})

describe("adding steps", () => {
  test("a step goes after its anchor, pushes the rest of the row right and joins the phase", () => {
    const added = addNode(
      flow(),
      { key: "gate", type: "relay.gate", name: "New gate", anchor: { id: "a", port: 0 } },
      undefined,
    )
    const node = added.flow.nodes.find((item) => item.id === added.id)
    expect(chain(added.flow).map((item) => item.id)).toEqual(["start", "a", "gate", "b"])
    expect([node?.x, node?.y]).toEqual([376, 132])
    expect(added.flow.nodes.find((item) => item.id === "b")?.x).toBe(512)
    expect(added.flow.phases[0].nodeIds).toContain(added.id)
    // A new gate starts with one empty check so the issue list asks for its command.
    expect(node && readChecklist(node).controls).toEqual([{ id: "gate_check_1", cmd: "" }])
  })

  test("a step joins a phase only between two of its steps, so the phase stays one stretch", () => {
    const step = { key: "execute", type: "relay.execute", name: "New" }
    const phases = (anchor: string) =>
      addNode(flow(), { ...step, anchor: { id: anchor, port: 0 } }, undefined).flow.phases[0].nodeIds
    // After the phase's last step, and before its first, the new step is outside the phase.
    expect(phases("b")).toEqual(["a", "b"])
    expect(phases("start")).toEqual(["a", "b"])
    expect(phases("a")).toEqual(["a", "b", "execute"])
  })

  test("a gate's first check is named after its step and is free across the whole flow", () => {
    const gate = { key: "gate", type: "relay.gate", name: "New gate" }
    const first = addNode(flow(), { ...gate, anchor: { id: "b", port: 0 } }, undefined)
    const second = addNode(first.flow, { ...gate, anchor: { id: first.id, port: 0 } }, undefined)
    const checks = (value: Flow, id: string) => {
      const node = value.nodes.find((item) => item.id === id)
      return node ? readChecklist(node).controls.map((control) => control.id) : []
    }
    expect([first.id, second.id]).toEqual(["gate", "gate_2"])
    expect(checks(second.flow, first.id)).toEqual(["gate_check_1"])
    expect(checks(second.flow, second.id)).toEqual(["gate_2_check_1"])
    // A check somewhere else that already took the name pushes the number up.
    const taken = {
      ...flow(),
      nodes: flow().nodes.map((node) =>
        node.id === "a" ? { ...node, parameters: { checklist: '[{"id":"gate_check_1","cmd":"true"}]' } } : node,
      ),
    }
    expect(checks(addNode(taken, gate, undefined).flow, "gate")).toEqual(["gate_check_2"])
  })

  test("without a selection a step is appended after the last step", () => {
    expect(defaultAnchor(flow(), [])).toEqual({ id: "b", port: 0 })
    expect(defaultAnchor(flow(), ["a"])).toEqual({ id: "a", port: 0 })
  })

  test("a dropped step lands where it was dropped, unconnected and outside every phase", () => {
    const added = addNode(
      flow(),
      { key: "execute", type: "relay.execute", name: "Dropped", at: { x: 300, y: 140 } },
      undefined,
    )
    expect(added.flow.edges).toHaveLength(2)
    expect(added.flow.phases[0].nodeIds).toEqual(["a", "b"])
  })

  test("a trigger takes its operation and timing; phases group only steps", () => {
    const hook: Flow = { kind: "hook", nodes: [], edges: [], phases: [] }
    const added = addNode(
      hook,
      {
        key: "trigger:command:after",
        type: TRIGGER,
        name: "After shell command",
        operation: "command",
        timing: "after",
      },
      undefined,
    )
    expect(added.flow.nodes[0].parameters).toMatchObject({ operation: "command", timing: "after" })
    expect(groupSelection(flow(), ["start"], "New")).toBeUndefined()
    expect(groupSelection(flow(), ["start", "a"], "New")?.flow.phases.map((phase) => phase.nodeIds)).toEqual([
      ["b"],
      ["a"],
    ])
  })
})

describe("phases", () => {
  const line = (ids: string[], phases: Flow["phases"] = []): Flow => {
    const order = ["start", ...ids]
    return {
      kind: "workflow",
      nodes: order.map((id, index) => ({
        id,
        name: id,
        type: id === "start" ? START : "relay.execute",
        x: 96 + index * 136,
        y: 132,
        parameters: {},
      })),
      edges: order.slice(1).map((to, index) => ({ from: order[index], to, port: 0 })),
      phases,
    }
  }
  const phase = (id: string, nodeIds: string[], name = id) => ({ id, name, description: "", nodeIds })

  test("only steps that sit next to each other can be grouped", () => {
    const steps = line(["a", "b", "c", "d"])
    expect(groupBlock(steps, ["b", "c"])).toBeUndefined()
    expect(groupBlock(steps, ["c", "b"])).toBeUndefined()
    expect(groupBlock(steps, ["a", "c"])).toBe("gap")
    expect(groupBlock(steps, ["start"])).toBe("none")
    expect(groupBlock(steps, [])).toBe("none")
    expect(groupSelection(steps, ["a", "d"], "Phase 1")).toBeUndefined()
    expect(groupSelection(steps, ["b", "c"], "Phase 1")?.flow.phases.map((item) => item.nodeIds)).toEqual([["b", "c"]])
  })

  test("grouping never cuts another phase in two", () => {
    const steps = line(["a", "b", "c", "d"], [phase("p", ["a", "b", "c"])])
    // The middle of a phase would leave a and c apart; either end of it is fine.
    expect(groupBlock(steps, ["b"])).toBe("split")
    expect(groupSelection(steps, ["b"], "Phase 2")).toBeUndefined()
    expect(groupBlock(steps, ["a", "c"])).toBe("gap")
    expect(groupBlock(steps, ["c", "d"])).toBeUndefined()
    expect(groupSelection(steps, ["c", "d"], "Phase 2")?.flow.phases.map((item) => item.nodeIds)).toEqual([
      ["a", "b"],
      ["c", "d"],
    ])
  })

  test("new phases take the first free number, and removing one keeps its steps", () => {
    const named = (n: number) => `Phase ${n}`
    const steps = line(["a", "b"], [phase("x", ["a"], "Phase 1"), phase("y", ["b"], "Phase 3")])
    expect(freePhaseName(steps, named)).toBe("Phase 2")
    expect(freePhaseName(line(["a"]), named)).toBe("Phase 1")
    const removed = ungroup(steps, "x")
    expect(removed.phases.map((item) => item.id)).toEqual(["y"])
    expect(removed.nodes).toEqual(steps.nodes)
  })
})

describe("hook nodes", () => {
  const hook = (): Flow => ({
    kind: "hook",
    nodes: [
      { id: "t", name: "T", type: TRIGGER, x: 120, y: 200, parameters: {} },
      { id: "m", name: "M", type: CONDITION, x: 320, y: 200, parameters: {} },
      { id: "b", name: "B", type: "relay.hookBlock", x: 520, y: 200, parameters: {} },
    ],
    edges: [
      { from: "t", to: "m", port: 0 },
      { from: "m", to: "b", port: 0 },
    ],
    phases: [],
  })
  const alone = (): Flow => ({ ...hook(), nodes: hook().nodes.slice(0, 1), edges: [] })

  test("the first node goes on the trigger; later ones on the right-most open output", () => {
    expect(defaultAnchor(alone(), [])).toEqual({ id: "t", port: 0 })
    // The condition's No output is the only one left open; Block has none.
    expect(defaultAnchor(hook(), [])).toEqual({ id: "m", port: 1 })
    expect(defaultAnchor(hook(), ["b"])).toEqual({ id: "m", port: 1 })
    expect(defaultAnchor(hook(), ["t"])).toEqual({ id: "t", port: 0 })
    expect(defaultAnchor({ kind: "hook", nodes: [], edges: [], phases: [] }, [])).toBeUndefined()
  })

  test("a node added to the trigger of an empty hook is wired to it", () => {
    const added = addNode(
      alone(),
      { key: "match", type: CONDITION, name: "Match", anchor: defaultAnchor(alone(), []) },
      undefined,
    )
    expect(added.flow.edges).toEqual([{ from: "t", to: "match", port: 0 }])
  })

  test("inserting between two nodes moves the rest of the branch over instead of landing on it", () => {
    const added = addNode(
      hook(),
      { key: "remind", type: "relay.hookRemind", name: "Remind", anchor: { id: "t", port: 0 } },
      undefined,
    )
    const x = (id: string) => added.flow.nodes.find((item) => item.id === id)?.x
    expect([x("t"), x("remind"), x("m"), x("b")]).toEqual([120, 320, 520, 720])
    expect(chain(added.flow).map((item) => item.id)).toEqual(["t", "remind", "m", "b"])
    expect(new Set(added.flow.nodes.map((item) => `${item.x},${item.y}`)).size).toBe(added.flow.nodes.length)
  })

  test("nothing moves when the next node already has room", () => {
    const wide = { ...hook(), nodes: hook().nodes.map((node) => (node.id === "m" ? { ...node, x: 560 } : node)) }
    const added = addNode(
      wide,
      { key: "remind", type: "relay.hookRemind", name: "Remind", anchor: { id: "t", port: 0 } },
      undefined,
    )
    expect(added.flow.nodes.find((item) => item.id === "m")?.x).toBe(560)
  })
})

describe("hook conditions", () => {
  test("another condition is tried on No and leads to the same Yes step", () => {
    const hook: Flow = {
      kind: "hook",
      nodes: [
        { id: "t", name: "Before shell command", type: TRIGGER, x: 120, y: 200, parameters: {} },
        {
          id: "push",
          name: "Push",
          type: CONDITION,
          x: 320,
          y: 200,
          parameters: { field: "command", pattern: "git push *" },
        },
        { id: "ask", name: "Ask", type: "relay.hookApprove", x: 540, y: 100, parameters: { message: "Approve?" } },
        { id: "allow", name: "Allow", type: "relay.hookAllow", x: 540, y: 300, parameters: { message: "" } },
      ],
      edges: [
        { from: "t", to: "push", port: 0 },
        { from: "push", to: "ask", port: 0 },
        { from: "push", to: "allow", port: 1 },
      ],
      phases: [],
    }
    const added = addAlternative(hook, "push")!
    const alternative = added.flow.nodes.find((item) => item.id === added.id)!
    expect([alternative.name, alternative.parameters]).toEqual(["Push 2", { field: "command", pattern: "" }])
    expect(added.flow.edges).toEqual([
      { from: "t", to: "push", port: 0 },
      { from: "push", to: "ask", port: 0 },
      { from: "push", to: added.id, port: 1 },
      { from: added.id, to: "ask", port: 0 },
      { from: added.id, to: "allow", port: 1 },
    ])
    expect(addAlternative(hook, "ask")).toBeUndefined()
  })
})

describe("hook presets", () => {
  const types = (operations: string[], extra: { type: string; outputs: string[] }[]) => [
    {
      type: TRIGGER,
      label: "",
      inputs: 0,
      outputs: ["main"],
      maximum: 1,
      parameters: [
        {
          name: "operation",
          label: "",
          type: "options",
          default: "edit",
          options: operations.map((value) => ({ value, label: value })),
        },
      ],
    },
    ...extra.map((item) => ({ ...item, label: "", inputs: 1, parameters: [] })),
  ]
  const actions = (verify: string[]) => [
    { type: "relay.hookCondition", outputs: ["Yes", "No"] },
    { type: "relay.hookBlock", outputs: [] },
    { type: "relay.hookApprove", outputs: ["main"] },
    { type: "relay.hookRemind", outputs: ["main"] },
    { type: "relay.hookRecord", outputs: ["main"] },
    { type: "relay.hookRepair", outputs: ["main"] },
    { type: "relay.hookVerify", outputs: verify },
  ]

  test("a preset is offered only when the server lists every node and operation it needs", () => {
    const offered = hookPresets(types(["read", "edit", "write", "command", "tool"], actions(["main"])))
    expect(offered.map((preset) => preset.id)).toEqual(["protect-generated", "ask-shell", "remind-edit"])
    // Write and apply_patch are operations of their own, so protecting generated files needs the any-tool trigger.
    const noTool = hookPresets(types(["read", "edit", "write", "command"], actions(["main"])))
    expect(noTool.map((preset) => preset.id)).toEqual(["ask-shell", "remind-edit"])
    // A preset never offers an action the server lacks.
    const noAsk = actions(["main"]).filter((item) => item.type !== "relay.hookApprove")
    expect(hookPresets(types(["edit", "command", "tool"], noAsk)).map((preset) => preset.id)).toEqual([
      "protect-generated",
      "remind-edit",
    ])
  })

  test("the session-stop check needs the session-idle trigger and Run gate, and only records", () => {
    const all = types(["edit", "command", "tool", "session-idle"], actions(["Pass", "Fail"]))
    expect(hookPresets(all).map((preset) => preset.id)).toEqual([
      "protect-generated",
      "ask-shell",
      "check-stop",
      "remind-edit",
    ])
    const check = hookPresets(all).find((preset) => preset.id === "check-stop")!
    expect(check.nodes[0].parameters).toEqual({ operation: "session-idle", timing: "after" })
    // The runtime drops what a hook decides at session stop, so the preset holds no action that could only be dropped.
    expect(check.nodes.map((node) => node.type)).toEqual([TRIGGER, "relay.hookVerify"])
  })

  test("no preset ends in an Allow branch: an unconnected No already lets the call through", () => {
    const every = hookPresets(undefined)
    expect(every).toHaveLength(4)
    expect(every.flatMap((preset) => preset.nodes).some((node) => node.type === "relay.hookAllow")).toBe(false)
  })

  test("the risky-commands preset uses two conditions, never a | inside one pattern", () => {
    const ask = hookPresets(undefined).find((preset) => preset.id === "ask-shell")!
    const patterns = ask.nodes.filter((node) => node.type === CONDITION).map((node) => node.parameters.pattern)
    expect(patterns).toEqual(["git push *", "rm -rf *"])
    expect(patterns.some((pattern) => String(pattern).includes("|"))).toBe(false)
  })
})
