import { describe, expect, test } from "bun:test"
import {
  addPhase,
  addRequirement,
  chain,
  checkID,
  CONDITION,
  conditionFields,
  connect,
  documentFields,
  emptiedPhases,
  type Flow,
  flowFromDocument,
  insertNode,
  issues,
  layoutWorkflow,
  phaseChoices,
  readChecklist,
  RECORDED,
  removeNodes,
  setPhase,
  START,
  TRIGGER,
  uniqueID,
  uniqueName,
  conditionHolds,
  walkHook,
  wildcard,
} from "./graph"
import { hookDocument, hookPresets } from "./presets"

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
    const dragged = { ...flow, nodes: flow.nodes.map((item) => ({ ...item, x: item.x + 10.6, y: item.y + 0.4 })) }
    expect(documentFields(dragged).nodes.map((item) => item.position)).toEqual(flow.nodes.map(() => [11, 0]))
    expect("nodeGroups" in fields && fields.nodeGroups).toEqual([
      { id: "p", name: "Phase", description: "", nodeIds: ["a", "g"] },
    ])
  })

  test("a stored document without a main output still opens", () => {
    // Documents this app did not write can carry any output key, or an empty object.
    const stored = JSON.parse('{"START":{},"A":{"other":[]}}')
    const flow = flowFromDocument(
      { nodes: [node("start", START), node("a", "relay.execute")], connections: stored, nodeGroups: [] },
      "workflow",
    )
    expect(flow.edges).toEqual([])
    expect(flow.nodes).toHaveLength(2)
  })

  test("a step named __proto__ keeps its connection when the document is written", () => {
    const flow = workflow()
    const named = { ...flow, nodes: flow.nodes.map((item) => (item.id === "a" ? { ...item, name: "__proto__" } : item)) }
    const fields = documentFields(named)
    expect(Object.keys(fields.connections)).toEqual(["START", "__proto__", "G"])
    expect(fields.connections.START.main[0][0].node).toBe("__proto__")
    expect(JSON.parse(JSON.stringify(fields.connections)).G.main[0][0].node).toBe("B")
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

describe("hook rules", () => {
  const hookNode = (id: string, type: string, parameters: Record<string, unknown> = {}, y = 0) => ({
    id,
    name: id.toUpperCase(),
    type,
    x: 0,
    y,
    parameters,
  })
  const trigger = (operation: string, timing: string) => hookNode("t", TRIGGER, { operation, timing })
  const wired = (nodes: ReturnType<typeof hookNode>[], edges: [string, string, number?][]): Flow => ({
    kind: "hook",
    nodes,
    edges: edges.map(([from, to, port]) => ({ from, to, port: port ?? 0 })),
    phases: [],
  })
  const lone = (operation: string, timing: string, type: string, parameters: Record<string, unknown>) =>
    wired([trigger(operation, timing), hookNode("x", type, parameters)], [["t", "x"]])

  test("session start and stop only record: actions that could only be dropped there are flagged", () => {
    const enforcing = ["relay.hookBlock", "relay.hookApprove", "relay.hookRemind", "relay.hookRepair"]
    for (const operation of ["session-idle", "session-start"])
      for (const type of enforcing)
        expect(issues(lone(operation, "after", type, { message: "Stop." }))).toEqual([
          { code: "record-only", node: "x" },
        ])
    // A check, a record and an allow still show in Activity.
    expect(issues(lone("session-idle", "after", "relay.hookVerify", { message: "Fail.", check: "true" }))).toEqual([])
    expect(issues(lone("session-idle", "after", "relay.hookRecord", { message: "" }))).toEqual([])
    expect(issues(lone("session-start", "after", "relay.hookAllow", { message: "" }))).toEqual([])
    // A prompt is refused before it is admitted, so Block works there.
    expect(issues(lone("prompt", "before", "relay.hookBlock", { message: "No." }))).toEqual([])
  })

  test("a condition on a field the trigger's event does not carry is flagged", () => {
    const on = (operation: string, field: string) =>
      issues(
        wired(
          [
            trigger(operation, "before"),
            hookNode("c", CONDITION, { field, pattern: "x" }),
            hookNode("b", "relay.hookBlock", { message: "No." }),
          ],
          [
            ["t", "c"],
            ["c", "b"],
          ],
        ),
      )
    expect(on("command", "path")).toEqual([{ code: "field-unavailable", node: "c" }])
    expect(on("command", "command")).toEqual([])
    expect(on("edit", "command")).toEqual([{ code: "field-unavailable", node: "c" }])
    expect(on("edit", "path")).toEqual([])
    expect(on("prompt", "tool")).toEqual([{ code: "field-unavailable", node: "c" }])
    expect(on("tool", "path")).toEqual([])
    expect(conditionFields("session-idle")).toEqual(["event"])
    expect(conditionFields("something-new")).toEqual(["path", "tool", "command", "event"])
  })

  test("what follows Require repair never runs, unless another path reaches it", () => {
    const repair = hookNode("p", "relay.hookRepair", { message: "Fix it." })
    const remind = hookNode("r", "relay.hookRemind", { message: "Careful." })
    const straight = wired(
      [trigger("edit", "before"), repair, remind],
      [
        ["t", "p"],
        ["p", "r"],
      ],
    )
    expect(issues(straight)).toEqual([{ code: "never-runs", node: "r" }])
    const branch = wired(
      [trigger("edit", "before"), hookNode("c", CONDITION, { field: "path", pattern: "src/**" }), repair, remind],
      [
        ["t", "c"],
        ["c", "p"],
        ["p", "r"],
        ["c", "r", 1],
      ],
    )
    expect(issues(branch)).toEqual([])
  })

  test("a loop is flagged once, on its first node", () => {
    const remind = (id: string) => hookNode(id, "relay.hookRemind", { message: "Careful." })
    const looped = wired(
      [trigger("edit", "before"), remind("a"), remind("b")],
      [
        ["t", "a"],
        ["a", "b"],
        ["b", "a"],
      ],
    )
    expect(issues(looped)).toEqual([{ code: "cycle", node: "a" }])
    expect(issues({ ...looped, edges: looped.edges.slice(0, 2) })).toEqual([])
  })

  test("Record's note is optional; an empty one saves as text because the export needs it", () => {
    const flow = lone("edit", "after", "relay.hookRecord", { message: "" })
    expect(issues(flow)).toEqual([])
    const saved = (value: Flow) => documentFields(value).nodes.find((item) => item.id === "x")?.parameters.message
    expect(saved(flow)).toBe(RECORDED)
    expect(flow.nodes[1].parameters.message).toBe("")
    expect(saved(lone("edit", "after", "relay.hookRecord", { message: "Ran." }))).toBe("Ran.")
    // Allow's note is optional in the export already; every other action still needs its message.
    expect(saved(lone("edit", "after", "relay.hookAllow", { message: "" }))).toBe("")
    expect(issues(lone("edit", "after", "relay.hookRemind", { message: "" }))).toEqual([
      { code: "message-empty", node: "x" },
    ])
  })

  test("And also require chains on Yes; No still leads where No led", () => {
    const flow = wired(
      [
        trigger("edit", "before"),
        hookNode("c", CONDITION, { field: "path", pattern: "src/**" }, 200),
        hookNode("b", "relay.hookBlock", { message: "No." }, 100),
        hookNode("r", "relay.hookRemind", { message: "Careful." }, 300),
      ],
      [
        ["t", "c"],
        ["c", "b"],
        ["c", "r", 1],
      ],
    )
    const added = addRequirement(flow, "c", "If it matches")!
    const edges = added.flow.edges.map((item) => `${item.from}:${item.port}>${item.to}`)
    expect(edges).toEqual(["t:0>c", "c:1>r", `c:0>${added.id}`, `${added.id}:0>b`, `${added.id}:1>r`])
    const created = added.flow.nodes.find((item) => item.id === added.id)!
    expect(created.parameters).toEqual({ field: "tool", pattern: "" })
    expect(created.y).toBeGreaterThan(Math.max(...flow.nodes.map((item) => item.y)))
    expect(addRequirement(flow, "b", "x")).toBeUndefined()
  })

  test("Protect generated files stops edits and overwrites, and lets reads and other paths through", () => {
    const preset = hookPresets(undefined).find((item) => item.id === "protect-generated")!
    const fields = hookDocument("Protect", preset, (key) => key)
    const flow = flowFromDocument({ nodes: fields.nodes ?? [], connections: fields.connections ?? {} }, "hook")
    const blocked = (operation: string, path: string) =>
      walkHook(flow, { operation, timing: "before", path, tool: operation }).actions.map((item) => item.type)
    expect(blocked("edit", "src/generated/client.ts")).toEqual(["relay.hookBlock"])
    expect(blocked("write", "src/generated/client.ts")).toEqual(["relay.hookBlock"])
    expect(blocked("read", "src/generated/client.ts")).toEqual([])
    expect(blocked("edit", "src/app.ts")).toEqual([])
    expect(issues(flow)).toEqual([])
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

describe("step configuration", () => {
  type Group = { id: string; name: string; description: string; nodeIds: string[] }
  const linear = (checklists: Record<string, string> = {}, nodeGroups: Group[] = []): Flow =>
    flowFromDocument(
      {
        nodes: [
          node("start", START),
          ...["a", "b", "c", "d"].map((id) => node(id, "relay.execute", { checklist: checklists[id] ?? "[]" })),
        ],
        connections: { START: link("A"), A: link("B"), B: link("C"), C: link("D") },
        nodeGroups,
      },
      "workflow",
    )
  const retype = (flow: Flow, id: string, type: string, parameters: Record<string, unknown> = {}): Flow => ({
    ...flow,
    nodes: flow.nodes.map((item) => (item.id === id ? { ...item, type, parameters } : item)),
  })
  const check = (id: string) => `[{"id":"${id}","cmd":"true"}]`

  test("a plain chain of steps has no issues", () => {
    expect(issues(linear())).toEqual([])
  })

  test("a context step needs text or a file", () => {
    const flow = linear()
    expect(issues(retype(flow, "b", "relay.inject"))).toEqual([{ code: "inject-empty", node: "b" }])
    expect(issues(retype(flow, "b", "relay.inject", { text: "  ", file: " " }))).toEqual([
      { code: "inject-empty", node: "b" },
    ])
    expect(issues(retype(flow, "b", "relay.inject", { text: "Read the spec." }))).toEqual([])
    expect(issues(retype(flow, "b", "relay.inject", { file: "docs/brief.md" }))).toEqual([])
  })

  test("a step naming a skill the catalog lacks is flagged once the catalog has loaded", () => {
    const flow = retype(linear(), "b", "relay.execute", { skill: "gone" })
    expect(issues(flow)).toEqual([])
    expect(issues(flow, [], ["other"])).toEqual([{ code: "skill-missing", node: "b", params: { skill: "gone" } }])
    expect(issues(flow, [], ["gone", "other"])).toEqual([])
    expect(issues(retype(linear(), "b", "relay.execute", { skill: "" }), [], [])).toEqual([])
  })

  test("a human approval step in an existing document blocks publishing", () => {
    expect(issues(retype(linear(), "c", "relay.human"))).toEqual([{ code: "human-unsupported", node: "c" }])
  })

  test("a check ID used twice is flagged on the later step, naming the first", () => {
    const flow = linear({ a: check("x"), c: check("x") })
    expect(issues(flow)).toEqual([{ code: "check-duplicate", node: "c", params: { id: "x", other: "A" } }])
    const twice = linear({ b: `[{"id":"y","cmd":"true"},{"id":"y","cmd":"true"}]` })
    expect(issues(twice)).toEqual([{ code: "check-repeated", node: "b", params: { id: "y" } }])
    expect(issues(linear({ a: check("x"), c: check("z") }))).toEqual([])
  })

  test("new check IDs are <node>_check_<n> with n free anywhere in the workflow", () => {
    const flow = linear({ a: `[{"id":"a_check_1","cmd":"true"},{"id":"a_check_3","cmd":"true"}]`, c: check("b_check_1") })
    expect(checkID(flow, "a")).toBe("a_check_2")
    expect(checkID(flow, "b")).toBe("b_check_2")
    expect(checkID(flow, "d")).toBe("d_check_1")
  })

  test("a phase split by a step outside it is flagged on that step", () => {
    const group = (nodeIds: string[]): Group[] => [{ id: "p", name: "Plan", description: "", nodeIds }]
    expect(issues(linear({}, group(["a", "c"])))).toEqual([{ code: "phase-gap", node: "b", params: { phase: "Plan" } }])
    expect(issues(linear({}, group(["a", "b"])))).toEqual([])
    expect(issues(linear({}, group(["b", "c", "d"])))).toEqual([])
    expect(issues(linear({}, group(["c"])))).toEqual([])
  })

  test("an edit that leaves a phase with instructions and no steps is named; one without instructions is not", () => {
    const flow = linear({}, [
      { id: "p", name: "Plan", description: "Be careful.", nodeIds: ["a"] },
      { id: "q", name: "Build", description: " ", nodeIds: ["b", "c"] },
    ])
    const ids = (next: Flow) => emptiedPhases(flow, next).map((phase) => phase.id)
    expect(ids(setPhase(flow, "a", ""))).toEqual(["p"])
    expect(ids(removeNodes(flow, ["a"]))).toEqual(["p"])
    expect(ids(addPhase(flow, { id: "r", name: "New", description: "", nodeIds: ["a"] }))).toEqual(["p"])
    // Nothing is lost when the phase keeps a step, or when it had no instructions.
    expect(ids(setPhase(flow, "b", ""))).toEqual([])
    expect(ids(removeNodes(flow, ["b", "c"]))).toEqual([])
  })

  test("a step is only offered the phases it can join or leave without splitting one", () => {
    const wide = linear({}, [
      { id: "p1", name: "One", description: "", nodeIds: ["a", "b", "c"] },
      { id: "p2", name: "Two", description: "", nodeIds: [] },
    ])
    const ids = (flow: Flow, step: string) => phaseChoices(flow, step).phases.map((phase) => phase.id)
    // The middle of a phase cannot leave it, nor move to another phase.
    expect(ids(wide, "b")).toEqual(["p1"])
    expect(phaseChoices(wide, "b").none).toBe(false)
    // An end of a phase can leave, and the step after it can join.
    expect(ids(wide, "a")).toEqual(["p1", "p2"])
    expect(phaseChoices(wide, "a").none).toBe(true)
    expect(ids(wide, "d")).toEqual(["p1", "p2"])
    const apart = linear({}, [{ id: "p2", name: "Two", description: "", nodeIds: ["d"] }])
    // Step a would join Two across b and c.
    expect(ids(apart, "a")).toEqual([])
    expect(ids(apart, "c")).toEqual(["p2"])
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

  test("inserting at the edge of a phase leaves the new step outside it", () => {
    const added = { id: "n", name: "N", type: "relay.execute", x: 0, y: 0, parameters: {} }
    // After the phase's last step (b is outside) and before its first (the start is outside).
    expect(insertNode(workflow(), added, { id: "g", port: 0 }).phases[0].nodeIds).toEqual(["a", "g"])
    expect(insertNode(workflow(), added, { id: "start", port: 0 }).phases[0].nodeIds).toEqual(["a", "g"])
    expect(chain(insertNode(workflow(), added, { id: "g", port: 0 })).map((item) => item.id)).toEqual([
      "start",
      "a",
      "g",
      "n",
      "b",
    ])
  })

  test("new IDs and names never collide", () => {
    const flow = workflow()
    expect(uniqueID(flow, "a")).toBe("a_2")
    expect(uniqueID(flow, "p")).toBe("p_2")
    expect(uniqueID(flow, "new step!")).toBe("new_step_")
    // A name with no ASCII letters or digits falls back to a plain ID.
    expect(uniqueID(flow, "日本語")).toBe("step")
    expect(uniqueID(flow, "!!!")).toBe("step")
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

  test("Require repair ends the walk, as its denial ends the call at runtime", () => {
    const repaired: Flow = {
      ...hook,
      nodes: [...hook.nodes, node("p", "Repair", "relay.hookRepair", { message: "Fix it." })],
      edges: [
        { from: "t", to: "c", port: 0 },
        { from: "c", to: "p", port: 1 },
        { from: "p", to: "r", port: 0 },
      ],
    }
    expect(walkHook(repaired, edit("src/session/recovery.ts")).path).toEqual(["t", "c", "p"])
  })

  // The runtime matcher (HookGlob) is checked against Bun's in packages/relay/test/hook.test.ts; these rows pin the
  // cases where the old regex port of the Test disagreed with it, or threw.
  test("path conditions use the runtime glob", () => {
    const path = (pattern: string, value: string) => conditionHolds({ field: "path", pattern }, edit(value))
    expect(path("src/**", "src/a/b.ts")).toBe(true)
    expect(path("src/**/b.ts", "src/b.ts")).toBe(true)
    expect(path("src/*.ts", "src/a/b.ts")).toBe(false)
    expect(path("src/**.ts", "src/a/b.ts")).toBe(false)
    expect(path("src/[draft", "src/[draft")).toBe(false)
    expect(path("src/[z-a]", "src/b")).toBe(false)
    expect(path("[\\d]", "d")).toBe(true)
    expect(path("!src/**", "lib/a.ts")).toBe(true)
  })

  test("commands: * crosses everything, | is literal, and a trailing ' *' also matches the bare command", () => {
    expect(wildcard("git push *", "git push origin dev")).toBe(true)
    expect(wildcard("git push *", "git push")).toBe(true)
    expect(wildcard("rm -rf *", "rm -rf /tmp/x")).toBe(true)
    expect(wildcard("git push* | rm -rf *", "rm -rf build")).toBe(false)
    expect(wildcard("git push* | rm -rf *", "git push* | rm -rf now")).toBe(true)
    expect(wildcard("edit.before", "edit.before")).toBe(true)
    expect(wildcard("edit.before", "editxbefore")).toBe(false)
    expect(wildcard("cd app/src *", "cd app\\src && ls")).toBe(true)
  })

  // The engine's own matcher (@orchestra/schema HookMatch) is linear; a backtracking regex needs over a minute here.
  test("many stars against a long command stay linear", () => {
    const command = `${"ab".repeat(50_000)}d`
    const started = performance.now()
    expect(wildcard("*a*b*c*a*b*c*d", command)).toBe(false)
    const probe = { operation: "command", timing: "before", command }
    expect(conditionHolds({ field: "command", pattern: "*a*b*a*b*d" }, probe)).toBe(true)
    expect(performance.now() - started).toBeLessThan(2_000)
  })
})
