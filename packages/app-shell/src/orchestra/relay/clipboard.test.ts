import { describe, expect, test } from "bun:test"
import { copySteps, duplicateSteps, pasteSteps } from "./clipboard"
import { chain, type Flow, readChecklist, START, TRIGGER, writeChecklist } from "./graph"

const flow = (): Flow => ({
  kind: "workflow",
  nodes: [
    { id: "start", name: "Start", type: START, x: 96, y: 132, parameters: {} },
    {
      id: "a",
      name: "Write code",
      type: "relay.execute",
      x: 240,
      y: 132,
      parameters: { instructions: "Do it", checklist: writeChecklist([{ id: "a_check_1", cmd: "true" }]) },
    },
    {
      id: "b",
      name: "Check",
      type: "relay.gate",
      x: 376,
      y: 132,
      parameters: { checklist: writeChecklist([{ id: "b_check_1", cmd: "true" }]) },
    },
  ],
  edges: [
    { from: "start", to: "a", port: 0 },
    { from: "a", to: "b", port: 0 },
  ],
  phases: [{ id: "p", name: "P", description: "", nodeIds: ["a", "b"] }],
})

const checks = (value: Flow, id: string) => {
  const node = value.nodes.find((item) => item.id === id)
  return node ? readChecklist(node).controls.map((control) => control.id) : []
}

describe("duplicate, copy and paste", () => {
  test("a duplicate comes right after the original with its own id, name and check ids, inside the phase", () => {
    const copied = duplicateSteps(flow(), ["a"])
    expect(copied?.ids).toEqual(["a_2"])
    expect(chain(copied!.flow).map((node) => node.id)).toEqual(["start", "a", "a_2", "b"])
    expect(copied!.flow.nodes.find((node) => node.id === "a_2")?.name).toBe("Write code 2")
    expect(copied!.flow.nodes.find((node) => node.id === "a_2")?.parameters.instructions).toBe("Do it")
    // The original keeps its check; the copy's is named after the copy and free in the whole workflow.
    expect(checks(copied!.flow, "a")).toEqual(["a_check_1"])
    expect(checks(copied!.flow, "a_2")).toEqual(["a_2_check_1"])
    expect(copied!.flow.phases[0].nodeIds).toEqual(["a", "b", "a_2"])
    // The rest of the row moves over to make room.
    expect(copied!.flow.nodes.find((node) => node.id === "b")?.x).toBe(512)
  })

  test("several steps paste as a chain in the order they run, whatever order they were selected in", () => {
    const text = copySteps(flow(), ["b", "a"])
    const pasted = text ? pasteSteps(flow(), text, { id: "b", port: 0 }) : undefined
    expect(pasted?.ids).toEqual(["a_2", "b_2"])
    expect(chain(pasted!.flow).map((node) => node.id)).toEqual(["start", "a", "b", "a_2", "b_2"])
    expect([...checks(pasted!.flow, "a_2"), ...checks(pasted!.flow, "b_2")]).toEqual(["a_2_check_1", "b_2_check_1"])
  })

  test("a second paste does not reuse names, ids or check ids", () => {
    const text = copySteps(flow(), ["a"])!
    const first = pasteSteps(flow(), text, { id: "a", port: 0 })!
    const second = pasteSteps(first.flow, text, { id: "a", port: 0 })!
    expect(second.ids).toEqual(["a_3"])
    expect(second.flow.nodes.map((node) => node.name)).toContain("Write code 3")
    expect(checks(second.flow, "a_3")).toEqual(["a_3_check_1"])
  })

  test("Start is never copied, and text that is not copied steps pastes nothing", () => {
    expect(copySteps(flow(), ["start"])).toBeUndefined()
    expect(pasteSteps(flow(), "just some words", { id: "a", port: 0 })).toBeUndefined()
    expect(pasteSteps(flow(), "{}", { id: "a", port: 0 })).toBeUndefined()
    const unknown = JSON.stringify({
      kind: "orchestra.relay.steps",
      steps: [{ id: "x", name: "X", type: "relay.rm-rf", parameters: {} }],
    })
    expect(pasteSteps(flow(), unknown, { id: "a", port: 0 })).toBeUndefined()
  })

  test("a hook has no steps to copy", () => {
    const hook: Flow = {
      kind: "hook",
      nodes: [{ id: "t", name: "T", type: TRIGGER, x: 0, y: 0, parameters: {} }],
      edges: [],
      phases: [],
    }
    expect(copySteps(hook, ["t"])).toBeUndefined()
  })
})
