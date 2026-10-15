import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { RelayAuthoring } from "@orchestra/schema/relay-authoring"
import { RelaySprint } from "@orchestra/schema/relay-sprint"
import { AuthoringGraph } from "../src/authoring/graph"

const globalReference = "a".repeat(64)
const currentReference = "b".repeat(64)
const futureReference = "c".repeat(64)
const invalidSelection = "Knowledge must be a JSON list of at most 8 unique Atlas references"

function sprint(): RelaySprint.Sprint {
  return {
    brief: "Atlas selection",
    gen: 0,
    retry_budget: 3,
    macros: [],
    work_packages: [
      { id: "current", title: "Current", kind: "execute", instructions: "First step", checklist: [] },
      { id: "future", title: "Future", kind: "review", instructions: "Next step", checklist: [] },
    ],
  }
}

function graph() {
  return Effect.runSync(AuthoringGraph.project("Atlas selection", sprint()))
}

function parameters(document: ReturnType<typeof graph>, id: string, patch: Record<string, unknown>) {
  return {
    ...document,
    nodes: document.nodes.map((node) =>
      node.id === id ? { ...node, parameters: { ...node.parameters, ...patch } } : node,
    ),
  }
}

function result<A>(effect: Effect.Effect<A, AuthoringGraph.Refusal>) {
  return Effect.runSync(
    Effect.match(effect, {
      onFailure: (error) => ({ failure: { status: error.status, code: error.code, message: error.message } }),
      onSuccess: (output) => ({ output }),
    }),
  )
}

describe("Atlas knowledge graph", () => {
  test("no-selection legacy graph round-trip stays byte stable", () => {
    const document = graph()
    expect(document.nodes.every((node) => !Object.hasOwn(node.parameters, "knowledge"))).toBe(true)
    expect(document.nodes.every((node) => !Object.hasOwn(node.parameters, "relayKnowledge"))).toBe(true)
    const compiled = Effect.runSync(AuthoringGraph.compile(document))
    expect(JSON.stringify(compiled.sprint)).toBe(JSON.stringify(sprint()))
    expect(Object.hasOwn(compiled.sprint, "knowledge")).toBe(false)
    expect(compiled.sprint.work_packages.every((wp) => !Object.hasOwn(wp, "knowledge"))).toBe(true)
    expect(compiled.bindings).toEqual([])
    const projected = Effect.runSync(AuthoringGraph.project(document.name, compiled.sprint))
    expect(JSON.stringify(projected)).toBe(JSON.stringify(document))
  })

  test("global, current and future selections project and compile in their original scope and order", () => {
    const plan = {
      ...sprint(),
      knowledge: [globalReference],
      work_packages: sprint().work_packages.map((wp, index) => ({
        ...wp,
        knowledge: index === 0 ? [currentReference, globalReference] : [futureReference],
      })),
    }
    const document = Effect.runSync(AuthoringGraph.project("Atlas selection", plan))
    expect(document.nodes.map((node) => node.parameters)).toMatchObject([
      { relayKnowledge: JSON.stringify([globalReference], null, 2) },
      { knowledge: JSON.stringify([currentReference, globalReference], null, 2) },
      { knowledge: JSON.stringify([futureReference], null, 2) },
    ])
    const compiled = Effect.runSync(AuthoringGraph.compile(document))
    expect(JSON.stringify(compiled.sprint)).toBe(JSON.stringify(plan))
    expect(compiled.sprint.work_packages[0].knowledge).not.toContain(futureReference)
    expect(JSON.stringify(Effect.runSync(AuthoringGraph.project(document.name, compiled.sprint)))).toBe(
      JSON.stringify(document),
    )
  })

  test("new graph parameters select knowledge without retained metadata", () => {
    const document = graph()
    const edited = parameters(
      parameters(
        parameters(document, document.nodes[0].id, { relayKnowledge: JSON.stringify([globalReference]) }),
        "current",
        { knowledge: JSON.stringify([currentReference]) },
      ),
      "future",
      { knowledge: [futureReference] },
    )
    const compiled = Effect.runSync(AuthoringGraph.compile({ ...edited, meta: {} })).sprint
    expect(compiled.knowledge).toEqual([globalReference])
    expect(compiled.work_packages.map((wp) => wp.knowledge)).toEqual([[currentReference], [futureReference]])
  })

  test("omitted parameters preserve retained selections; explicit empty parameters clear them", () => {
    const document = graph()
    const retained = {
      ...document,
      meta: {
        relay: {
          ...document.meta.relay,
          sprint: {
            ...sprint(),
            knowledge: [globalReference],
            work_packages: sprint().work_packages.map((wp) => ({ ...wp, knowledge: [currentReference] })),
          },
        },
      },
    }
    const unchanged = Effect.runSync(AuthoringGraph.compile(retained)).sprint
    expect(unchanged.knowledge).toEqual([globalReference])
    expect(unchanged.work_packages.map((wp) => wp.knowledge)).toEqual([[currentReference], [currentReference]])
    const cleared = retained.nodes.reduce<ReturnType<typeof graph>>(
      (document, node) => parameters(document, node.id, { knowledge: "[]", relayKnowledge: "[]" }),
      retained,
    )
    expect(JSON.stringify(Effect.runSync(AuthoringGraph.compile(cleared)).sprint)).toBe(JSON.stringify(sprint()))
  })

  test("empty retained selections normalize to legacy compiled bytes", () => {
    const document = Effect.runSync(
      AuthoringGraph.project("Atlas selection", {
        ...sprint(),
        knowledge: [],
        work_packages: sprint().work_packages.map((wp) => ({ ...wp, knowledge: [] })),
      }),
    )
    const compiled = Effect.runSync(AuthoringGraph.compile(document)).sprint
    expect(JSON.stringify(compiled)).toBe(JSON.stringify(sprint()))
    expect(Object.hasOwn(compiled, "knowledge")).toBe(false)
    expect(compiled.work_packages.every((wp) => !Object.hasOwn(wp, "knowledge"))).toBe(true)
  })

  test.each([
    ["malformed JSON", "[", "Invalid JSON:"],
    ["trailing comma", '["' + globalReference + '",]', "Invalid JSON:"],
    ["invalid digest", '["not-a-digest"]', invalidSelection],
    ["uppercase digest", JSON.stringify(["A".repeat(64)]), invalidSelection],
    ...["\n", "\r", "\u2028", "\u2029"].map((suffix) => [
      `digest with trailing ${JSON.stringify(suffix)}`,
      JSON.stringify([globalReference + suffix]),
      invalidSelection,
    ]),
    ["object reference", JSON.stringify([{ reference: globalReference }]), invalidSelection],
    ["null", "null", invalidSelection],
    ["object", "{}", invalidSelection],
    ["duplicate references", JSON.stringify([globalReference, globalReference]), invalidSelection],
    [
      "oversize selection",
      JSON.stringify(Array.from({ length: 9 }, (_, index) => index.toString(16).repeat(64))),
      invalidSelection,
    ],
  ])("%s fails closed through validate and compile at both scopes", (_, selection, message) => {
    const document = graph()
    ;[
      parameters(document, document.nodes[0].id, { relayKnowledge: selection }),
      parameters(document, "current", { knowledge: selection }),
    ].forEach((edited) => {
      ;[result(AuthoringGraph.validate(edited)), result(AuthoringGraph.compile(edited))].forEach((outcome) => {
        expect(outcome).toMatchObject({
          failure: { status: 400, code: "invalid-request", message: expect.stringContaining(message) },
        })
      })
    })
  })

  test("malformed retained references cannot hide behind valid graph parameters", () => {
    const document = graph()
    ;[
      { ...sprint(), knowledge: ["bad"] },
      { ...sprint(), work_packages: [{ ...sprint().work_packages[0], knowledge: [globalReference, globalReference] }] },
    ].forEach((plan) => {
      expect(result(AuthoringGraph.project(document.name, plan))).toMatchObject({
        failure: { message: invalidSelection },
      })
      const retained = { ...document, meta: { relay: { sprint: plan } } }
      expect(result(AuthoringGraph.validate(retained))).toMatchObject({ failure: { message: invalidSelection } })
      expect(result(AuthoringGraph.compile(retained))).toMatchObject({ failure: { message: invalidSelection } })
    })
  })

  test("eight distinct workflow references accepted; ninth across separate steps refused", () => {
    const references = Array.from({ length: 9 }, (_, index) => index.toString(16).repeat(64))
    const document = graph()
    expect(
      result(AuthoringGraph.compile(parameters(document, "current", { knowledge: references.slice(0, 8) }))),
    ).toHaveProperty("output")
    const eight = parameters(
      parameters(document, document.nodes[0].id, { relayKnowledge: references.slice(0, 4) }),
      "current",
      {
        knowledge: references.slice(4, 8),
      },
    )
    expect(result(AuthoringGraph.compile(eight))).toHaveProperty("output")
    const nine = parameters(eight, "future", { knowledge: [references[8]] })
    const failure = { failure: { message: "A workflow may select at most 8 distinct Atlas references" } }
    expect(result(AuthoringGraph.validate(nine))).toMatchObject(failure)
    expect(result(AuthoringGraph.compile(nine))).toMatchObject(failure)
    expect(
      result(
        AuthoringGraph.project(document.name, {
          ...sprint(),
          knowledge: references.slice(0, 4),
          work_packages: [{ ...sprint().work_packages[0], knowledge: references.slice(4) }],
        }),
      ),
    ).toMatchObject(failure)
  })

  test("effective union uses retained IDs, parameter overrides and explicit clears", () => {
    const references = Array.from({ length: 9 }, (_, index) => index.toString(16).repeat(64))
    const document = graph()
    const retained = {
      ...document,
      // Canvas order and display names must not choose the entry or retained WP.
      nodes: [...document.nodes].reverse().map((node) =>
        node.id === "current" ? { ...node, name: "Renamed current" } : node,
      ),
      connections: {
        [document.nodes[0].name]: { main: [[{ node: "Renamed current", type: "main", index: 0 }]] },
        "Renamed current": { main: [[{ node: document.nodes[2].name, type: "main", index: 0 }]] },
      } satisfies ReturnType<typeof graph>["connections"],
      meta: {
        relay: {
          ...document.meta.relay,
          sprint: {
            ...sprint(),
            knowledge: references.slice(0, 4),
            work_packages: sprint().work_packages.map((wp, index) => ({
              ...wp,
              knowledge: index === 0 ? references.slice(4, 8) : [],
            })),
          },
        },
      },
    }
    const nine = parameters(retained, "future", { knowledge: [references[8]] })
    const failure = { failure: { message: "A workflow may select at most 8 distinct Atlas references" } }
    expect(result(AuthoringGraph.validate(nine))).toMatchObject(failure)
    expect(result(AuthoringGraph.compile(nine))).toMatchObject(failure)
    ;[
      parameters(nine, document.nodes[0].id, { relayKnowledge: "[]" }),
      parameters(nine, "current", { knowledge: [] }),
    ].forEach((cleared) => {
      expect(result(AuthoringGraph.validate(cleared))).toHaveProperty("output")
      const compiled = Effect.runSync(AuthoringGraph.compile(cleared)).sprint
      expect(compiled.work_packages[1].knowledge).toEqual([references[8]])
      expect(new Set([
        ...(compiled.knowledge ?? []),
        ...compiled.work_packages.flatMap((wp) => wp.knowledge ?? []),
      ]).size).toBe(5)
    })
    const replaced = parameters(nine, "current", { knowledge: [references[8]] })
    expect(result(AuthoringGraph.validate(replaced))).toHaveProperty("output")
    expect(Effect.runSync(AuthoringGraph.compile(replaced)).sprint.work_packages[0].knowledge).toEqual([references[8]])
  })

  test("node descriptors expose JSON selections on start and every step kind", () => {
    const descriptors = AuthoringGraph.nodeTypes()
    expect(descriptors.map((descriptor) => descriptor.type)).toEqual([
      RelayAuthoring.StartType,
      "relay.execute",
      "relay.gate",
      "relay.review",
      "relay.inject",
      "relay.human",
    ])
    descriptors.forEach((descriptor) => {
      expect(
        descriptor.parameters.filter(
          (parameter) =>
            parameter.name === (descriptor.type === RelayAuthoring.StartType ? "relayKnowledge" : "knowledge"),
        ),
      ).toEqual([
        {
          name: descriptor.type === RelayAuthoring.StartType ? "relayKnowledge" : "knowledge",
          label: "Atlas knowledge references",
          type: "json",
          default: "[]",
        },
      ])
    })
  })
})
