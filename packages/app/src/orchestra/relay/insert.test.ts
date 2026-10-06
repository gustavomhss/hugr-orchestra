import { describe, expect, test } from "bun:test"
import { type Flow, chain, readChecklist, START, TRIGGER } from "./graph"
import { addNode, defaultAnchor, groupSelection } from "./insert"
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

describe("hook presets", () => {
  test("a preset is offered only when the server lists every node and operation it needs", () => {
    const types = (operations: string[], extra: { type: string; outputs: string[] }[]) => [
      {
        type: TRIGGER,
        label: "",
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
      ...extra.map((item) => ({ ...item, label: "", maximum: undefined, parameters: [] })),
    ]
    const today = types(
      ["read", "edit", "write", "command"],
      [
        { type: "relay.hookCondition", outputs: ["Yes", "No"] },
        { type: "relay.hookBlock", outputs: [] },
        { type: "relay.hookApprove", outputs: ["main"] },
        { type: "relay.hookRemind", outputs: ["main"] },
        { type: "relay.hookVerify", outputs: ["main"] },
      ],
    )
    const offered = hookPresets(today)
    expect(offered.map((preset) => preset.id)).toEqual(["protect-generated", "ask-shell", "remind-first"])
    // Without an Allow node type, the No branch is left out instead of offering an action the server lacks.
    expect(offered[0].nodes.map((node) => node.id)).toEqual(["event", "match", "block"])
  })
})
