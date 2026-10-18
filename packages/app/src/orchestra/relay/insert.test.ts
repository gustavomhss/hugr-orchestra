import { describe, expect, test } from "bun:test"
import { CONDITION, chain, type Flow, readChecklist, START, TRIGGER } from "./graph"
import { addAlternative, addNode, defaultAnchor, groupSelection } from "./insert"
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
    expect(node && readChecklist(node).controls).toEqual([{ id: "check_1", cmd: "" }])
  })

  test("without a selection a step is appended after the last step", () => {
    expect(defaultAnchor(flow(), [])).toEqual({ id: "b", port: 0 })
    expect(defaultAnchor(flow(), ["a"])).toEqual({ id: "a", port: 0 })
    expect(defaultAnchor({ ...flow(), kind: "hook" }, [])).toBeUndefined()
  })

  test("a dropped step lands where it was dropped, unconnected, inside the phase it was dropped on", () => {
    const added = addNode(
      flow(),
      { key: "execute", type: "relay.execute", name: "Dropped", at: { x: 300, y: 140 } },
      undefined,
    )
    expect(added.flow.edges).toHaveLength(2)
    expect(added.flow.phases[0].nodeIds).toContain(added.id)
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
