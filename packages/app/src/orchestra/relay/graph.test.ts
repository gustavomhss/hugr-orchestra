import { describe, expect, test } from "bun:test"
import {
  chain,
  CONDITION,
  connect,
  documentFields,
  type Flow,
  flowFromDocument,
  insertNode,
  issues,
  layoutWorkflow,
  readChecklist,
  removeNodes,
  START,
  TRIGGER,
  uniqueID,
  uniqueName,
  pathMatch,
  walkHook,
  wildcard,
} from "./graph"

const node = (id: string, type: string, parameters: Record<string, unknown> = {}) => ({
  id,
  name: id.toUpperCase(),
  type,
  position: [0, 0] as [number, number],
  parameters,
})
const edge = (target: string) => ({ node: target, type: "main", index: 0 }) as const
const link = (target: string) => ({ main: [[edge(target)]] })

const workflow = (): Flow =>
  flowFromDocument(
    {
      nodes: [
        node("start", START, { relayRetryBudget: 2 }),
        node("a", "relay.execute", { checklist: '[{"id":"one","cmd":"true"}]' }),
        node("g", "relay.gate", { checklist: "[]" }),
        node("b", "relay.execute"),
      ],
      connections: { START: link("A"), A: link("G"), G: link("B") },
      nodeGroups: [{ id: "p", name: "Phase", description: "", nodeIds: ["a", "g"] }],
    },
    "workflow",
  )

describe("documents and flows", () => {
  test("connections by name become edges by ID and round-trip back to names", () => {
    const flow = workflow()
    expect(flow.edges).toEqual([
      { from: "start", to: "a", port: 0 },
      { from: "a", to: "g", port: 0 },
      { from: "g", to: "b", port: 0 },
    ])
    const renamed = {
      ...flow,
      nodes: flow.nodes.map((item) => (item.id === "a" ? { ...item, name: "Renamed" } : item)),
    }
    const fields = documentFields(renamed)
    expect(fields.connections).toEqual({ START: link("Renamed"), Renamed: link("G"), G: link("B") })
    expect(fields.nodes.find((item) => item.id === "a")?.position).toEqual([0, 0])
    // Positions leave the canvas as whole numbers.
    const dragged = { ...flow, nodes: flow.nodes.map((item) => ({ ...item, x: item.x + 10.6, y: item.y - 0.4 })) }
    expect(documentFields(dragged).nodes.map((item) => item.position)).toEqual(flow.nodes.map(() => [11, 0]))
    expect("nodeGroups" in fields && fields.nodeGroups).toEqual([
      { id: "p", name: "Phase", description: "", nodeIds: ["a", "g"] },
    ])
  })

  test("hook outputs keep their port index, and hooks carry no phases", () => {
    const flow = flowFromDocument(
      {
        nodes: [node("t", TRIGGER), node("c", CONDITION), node("y", "relay.hookBlock"), node("n", "relay.hookAllow")],
        connections: {
          T: link("C"),
          C: { main: [[edge("Y")], [edge("N")]] },
        },
        nodeGroups: [{ id: "x", name: "x", description: "", nodeIds: ["c"] }],
      },
      "hook",
    )
    expect(flow.edges).toContainEqual({ from: "c", to: "n", port: 1 })
    expect(flow.phases).toEqual([])
    expect(documentFields(flow)).not.toHaveProperty("nodeGroups")
    expect(documentFields(flow).connections.C.main.map((channel) => channel.map((edge) => edge.node))).toEqual([
      ["Y"],
      ["N"],
    ])
  })

  test("the sequence follows edges from the start, not array order", () => {
    const flow = workflow()
    expect(chain({ ...flow, nodes: flow.nodes.toReversed() }).map((item) => item.id)).toEqual(["start", "a", "g", "b"])
  })
})

describe("issues", () => {
  test("flags loose steps, branches, empty gates and checks without a command or judge", () => {
    const flow = workflow()
    expect(issues(flow)).toEqual([{ code: "gate-empty", node: "g" }])
    const loose = { ...flow, edges: flow.edges.filter((edge) => edge.to !== "b") }
    expect(issues(loose)).toContainEqual({ code: "loose", node: "b" })
    const branched = { ...flow, edges: [...flow.edges, { from: "a", to: "b", port: 0 }] }
    expect(issues(branched)).toContainEqual({ code: "branches", node: "a" })
    const empty = {
      ...flow,
      nodes: flow.nodes.map((item) =>
        item.id === "a" ? { ...item, parameters: { checklist: '[{"id":"x"}]' } } : item,
      ),
    }
    expect(issues(empty)).toContainEqual({ code: "check-empty", node: "a" })
    expect(issues(flow, ["Server says no"])).toContainEqual({ code: "server", text: "Server says no" })
  })

  test("a hook needs one trigger, a Before event for Block, patterns, messages and a connected action", () => {
    const hook: Flow = {
      kind: "hook",
      nodes: [
        { id: "t", name: "T", type: TRIGGER, x: 0, y: 0, parameters: { operation: "edit", timing: "after" } },
        { id: "c", name: "C", type: CONDITION, x: 0, y: 0, parameters: { pattern: "" } },
        { id: "b", name: "B", type: "relay.hookBlock", x: 0, y: 0, parameters: { message: "Stop." } },
        { id: "r", name: "R", type: "relay.hookRemind", x: 0, y: 0, parameters: { message: "" } },
        { id: "a", name: "A", type: "relay.hookAllow", x: 0, y: 0, parameters: { message: "" } },
      ],
      edges: [
        { from: "t", to: "c", port: 0 },
        { from: "c", to: "b", port: 0 },
        { from: "c", to: "a", port: 1 },
      ],
      phases: [],
    }
    // Allow's note may be empty; every other action needs its message, as the server compiles the export.
    expect(issues(hook)).toEqual([
      { code: "pattern-empty", node: "c" },
      { code: "needs-before", node: "b" },
      { code: "message-empty", node: "r" },
      { code: "hook-loose", node: "r" },
    ])
    expect(issues({ ...hook, nodes: hook.nodes.filter((item) => item.type !== TRIGGER) })).toContainEqual({
      code: "no-trigger",
    })
  })

  test("an unreadable checklist is reported, not dropped", () => {
    expect(
      readChecklist({ id: "x", name: "x", type: "relay.execute", x: 0, y: 0, parameters: { checklist: "{oops" } }),
    ).toEqual({ controls: [], invalid: true })
    expect(
      readChecklist({
        id: "x",
        name: "x",
        type: "relay.execute",
        x: 0,
        y: 0,
        parameters: { checklist: [{ id: "a", cmd: "true" }] },
      }).controls,
    ).toHaveLength(1)
  })
})

describe("edits", () => {
  test("a workflow step keeps one input and one output when connected", () => {
    const flow = workflow()
    const next = connect(flow, "start", "g", 0)
    expect(next?.edges).toEqual([
      { from: "g", to: "b", port: 0 },
      { from: "start", to: "g", port: 0 },
    ])
    expect(connect(flow, "a", "start", 0)).toBeUndefined()
    expect(connect(flow, "a", "a", 0)).toBeUndefined()
  })

  test("deleting a step reconnects its neighbours and leaves its phase; the start stays", () => {
    const flow = removeNodes(workflow(), ["g", "start"])
    expect(flow.nodes.map((item) => item.id)).toEqual(["start", "a", "b"])
    expect(flow.edges).toContainEqual({ from: "a", to: "b", port: 0 })
    expect(flow.phases[0].nodeIds).toEqual(["a"])
  })

  test("inserting after a node rewires what followed it and joins the anchor's phase", () => {
    const added = { id: "n", name: "N", type: "relay.execute", x: 0, y: 0, parameters: {} }
    const flow = insertNode(workflow(), added, { id: "a", port: 0 })
    expect(chain(flow).map((item) => item.id)).toEqual(["start", "a", "n", "g", "b"])
    expect(flow.phases[0].nodeIds).toEqual(["a", "g", "n"])
  })

  test("new IDs and names never collide", () => {
    const flow = workflow()
    expect(uniqueID(flow, "a")).toBe("a_2")
    expect(uniqueID(flow, "p")).toBe("p_2")
    expect(uniqueID(flow, "new step!")).toBe("new_step_")
    expect(uniqueName(flow, "A")).toBe("A 2")
    expect(uniqueName(flow, "Fresh")).toBe("Fresh")
  })

  test("layout snakes phases two per row behind the start node", () => {
    const flow = layoutWorkflow(workflow())
    const at = (id: string) => flow.nodes.find((item) => item.id === id)
    expect([at("start")?.x, at("start")?.y]).toEqual([96, 132])
    expect([at("a")?.x, at("g")?.x, at("a")?.y]).toEqual([240, 376, 132])
    // The unphased step after the phase starts the second column of the first row.
    expect([at("b")?.x, at("b")?.y]).toEqual([200 + 272 + 96 + 40, 132])
  })
})

describe("hook test walk", () => {
  const node = (id: string, name: string, type: string, parameters: Record<string, unknown> = {}) => ({
    id,
    name,
    type,
    x: 0,
    y: 0,
    parameters,
  })
  const hook: Flow = {
    kind: "hook",
    nodes: [
      node("t", "Before edit", TRIGGER, { operation: "edit", timing: "before" }),
      node("c", "Path matches", CONDITION, { field: "path", pattern: "src/generated/**" }),
      node("b", "Block", "relay.hookBlock", { message: "No." }),
      node("r", "Remind", "relay.hookRemind", { message: "Careful." }),
      node("a", "Allow", "relay.hookAllow", { message: "" }),
    ],
    edges: [
      { from: "t", to: "c", port: 0 },
      { from: "c", to: "b", port: 0 },
      { from: "c", to: "r", port: 1 },
      { from: "r", to: "a", port: 0 },
    ],
    phases: [],
  }
  const edit = (path: string) => ({ operation: "edit", timing: "before", path })

  test("a condition takes Yes or No; actions run in order and Block ends the branch", () => {
    expect(walkHook(hook, edit("src/generated/client.ts"))).toEqual({ path: ["t", "c", "b"], actions: [hook.nodes[2]] })
    expect(walkHook(hook, edit("src/session/recovery.ts")).actions.map((item) => item.name)).toEqual([
      "Remind",
      "Allow",
    ])
  })

  test("a condition on a field the event lacks takes No", () => {
    expect(walkHook(hook, { operation: "edit", timing: "before" }).path).toEqual(["t", "c", "r", "a"])
  })

  test("paths: * and ? stay in a segment, ** crosses them, classes, alternatives and negation", () => {
    expect(pathMatch("src/*.ts", "src/a.ts")).toBe(true)
    expect(pathMatch("src/*.ts", "src/a/b.ts")).toBe(false)
    expect(pathMatch("src/**", "src/a/b.ts")).toBe(true)
    expect(pathMatch("src/**/b.ts", "src/b.ts")).toBe(true)
    expect(pathMatch("src/?.ts", "src/ab.ts")).toBe(false)
    expect(pathMatch("src/[ab].ts", "src/b.ts")).toBe(true)
    expect(pathMatch("src/[!ab].ts", "src/b.ts")).toBe(false)
    expect(pathMatch("src/*.{ts,tsx}", "src/a.tsx")).toBe(true)
    expect(pathMatch("!src/**", "lib/a.ts")).toBe(true)
    expect(pathMatch("src/{a,b", "src/a")).toBe(false)
    expect(pathMatch("a.b", "axb")).toBe(false)
  })

  test("commands: * crosses everything, | is literal, and a trailing ' *' also matches the bare command", () => {
    expect(wildcard("git push *", "git push origin dev")).toBe(true)
    expect(wildcard("git push *", "git push")).toBe(true)
    expect(wildcard("rm -rf *", "rm -rf /tmp/x")).toBe(true)
    expect(wildcard("git push* | rm -rf *", "rm -rf build")).toBe(false)
    expect(wildcard("git push* | rm -rf *", "git push* | rm -rf now")).toBe(true)
    expect(wildcard("edit.before", "edit.before")).toBe(true)
    expect(wildcard("edit.before", "editxbefore")).toBe(false)
  })
})
