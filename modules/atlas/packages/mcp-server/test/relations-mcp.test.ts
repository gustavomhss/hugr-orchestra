// @atlas/mcp-server — test/relations-mcp.test.ts  (#99a — the `atlas-relations` MCP read tool)
//
// The grounded-relation read fold exposed over MCP. It is served DIRECTLY from an injected `RelationLeg`, NOT
// through `GOVERNANCE_SURFACE` (it is not a governed `Tool`), so:
//   • WITHOUT a leg, the advertised surface is byte-for-byte the closed five — the SCN-MCP-1 pin is untouched.
//   • WITH a leg, `atlas-relations` is advertised beside the five, carrying its DOCUMENTED input schema.
//   • a call routes through the SHARED verdict builder (`relationsVerdict`, @atlas/adapter-io) — the SAME body
//     the CLI drives — so the `Verdict` bytes are identical on both transports (SCHEMA + VERDICT parity).

import { describe, it, expect } from "vitest"
import { GOVERNANCE_SURFACE } from "@atlas/tools"
import type { Tool, ToolData, Verdict } from "@atlas/tools"
import type { RelationLeg, WiredHandler } from "@atlas/adapter-io"
import { relationsVerdict } from "@atlas/adapter-io"
import type { NodeKey, ToolSchema } from "@atlas/contracts"
import type { RelationEdge } from "@atlas/knowledge"
import {
  RELATIONS_INPUT_SCHEMA,
  RELATIONS_TOOL,
  advertisedReadTools,
  callTool,
  listTools,
  verdictToResult,
} from "../src/server.js"

const GUIDANCE = { next: "n", invariant: "i" } as const
const cannedSchema = (tool: Tool): ToolSchema => ({
  name: tool,
  description: `d::${tool}`,
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
})
const fakeHandler: WiredHandler = {
  handle: () => ({ ok: false, rejected: "off-surface", guidance: GUIDANCE }) as Verdict<ToolData>,
  schema: (tool: Tool) => cannedSchema(tool),
  resolveNode: (n: NodeKey) => ({ ok: false, rejected: `stub:${n}`, guidance: GUIDANCE }),
}

/** A fake read leg: A→B under `depends-on`, echoing the direction into the edge count so filtering is visible. */
const EDGE: RelationEdge = { nodeKey: "rel:xyz", relationKind: "depends-on", endpointA: "A", endpointB: "B" }
const fakeLeg: RelationLeg = (unit, direction) => (direction === "in" && unit !== "B" ? [] : [EDGE])

describe("#99a — the closed governance surface is untouched when no read leg is injected", () => {
  it("listTools with NO leg advertises EXACTLY the five GOVERNANCE_SURFACE tools (SCN-MCP-1 holds)", () => {
    const names = listTools(fakeHandler).tools.map((t) => t.name)
    expect(names).toEqual([...GOVERNANCE_SURFACE])
    expect(advertisedReadTools()).toEqual([])
  })
})

describe("#99a — `atlas-relations` is advertised with its documented schema when a leg is injected", () => {
  it("appends the relations tool AFTER the five governance tools, carrying RELATIONS_INPUT_SCHEMA", () => {
    const tools = listTools(fakeHandler, fakeLeg).tools
    expect(tools).toHaveLength(GOVERNANCE_SURFACE.length + 1)
    const rel = tools.find((t) => t.name === RELATIONS_TOOL)
    expect(rel).toBeDefined()
    expect(rel?.inputSchema).toEqual(RELATIONS_INPUT_SCHEMA)
    // the documented contract: unit required, direction an out|in|both enum
    expect(RELATIONS_INPUT_SCHEMA.required).toEqual(["unit"])
    expect(RELATIONS_INPUT_SCHEMA.properties.direction.enum).toEqual(["out", "in", "both"])
  })
})

describe("#99a — a call routes through the shared builder → SCHEMA + VERDICT parity with the CLI", () => {
  it("serves the edges from the injected leg, byte-identical to the CLI verdict builder", () => {
    const result = callTool(fakeHandler, RELATIONS_TOOL, { unit: "A", direction: "out" }, fakeLeg)
    expect(result.isError).toBeFalsy()
    const text = (result.content[0] as { text: string }).text
    // PARITY: the MCP result is the verdictToResult of the SAME verdict the CLI renders — one builder, one truth.
    const parity = verdictToResult(relationsVerdict(fakeLeg, "A", "out"))
    expect(text).toBe((parity.content[0] as { text: string }).text)
    expect(text).toContain('"relationKind":"depends-on"')
    expect(text).toContain('"endpointA":"A"')
  })

  it("an out-of-vocabulary direction maps to a VISIBLE isError (fail-closed, never a throw)", () => {
    const result = callTool(fakeHandler, RELATIONS_TOOL, { unit: "A", direction: "sideways" }, fakeLeg)
    expect(result.isError).toBe(true)
    expect((result.content[0] as { text: string }).text).toContain("unknown direction 'sideways'")
  })

  it("a call MISSING the required `unit` fails closed to isError — schema `required:[unit]` enforced, CLI/MCP symmetric", () => {
    // Before this gate, `{}` coerced `unit` to '' and returned ok:true with an empty list, while the CLI
    // rejected a missing unit at its parser arity floor — a real CLI-vs-MCP asymmetry (lucy R3 review).
    // teeth: a mutant that drops the `unit` check in `relationsVerdict` makes this return ok:true.
    const result = callTool(fakeHandler, RELATIONS_TOOL, {}, fakeLeg)
    expect(result.isError).toBe(true)
    expect((result.content[0] as { text: string }).text).toContain("missing unit")
  })

  it("with NO leg present the relations token falls through to the handler and fails closed", () => {
    // teeth: a mutant that serves relations without a composed leg would answer over nothing.
    const result = callTool(fakeHandler, RELATIONS_TOOL, { unit: "A" })
    expect(result.isError).toBe(true)
    expect((result.content[0] as { text: string }).text).toContain("off-surface")
  })
})
