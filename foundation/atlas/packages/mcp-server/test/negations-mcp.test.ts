// @atlas/mcp-server — test/negations-mcp.test.ts  (#99b — the `atlas-negations` MCP read tool)
//
// The grounded-negation + abstention read fold exposed over MCP. Served DIRECTLY from an injected `NegationLeg`,
// NOT through `GOVERNANCE_SURFACE` (not a governed `Tool`), so:
//   • WITHOUT a leg, the advertised surface is byte-for-byte the closed five — the SCN-MCP-1 pin is untouched.
//   • WITH a leg, `atlas-negations` is advertised beside the five, carrying its DOCUMENTED input schema.
//   • a call routes through the SHARED verdict builder (`negationsVerdict`, @atlas/adapter-io) — the SAME body
//     the CLI drives — so the `Verdict` bytes are identical on both transports (SCHEMA + VERDICT parity).

import { describe, it, expect } from "vitest"
import { GOVERNANCE_SURFACE } from "@atlas/tools"
import type { Tool, ToolData, Verdict } from "@atlas/tools"
import type { NegationLeg, WiredHandler } from "@atlas/adapter-io"
import { negationsVerdict } from "@atlas/adapter-io"
import { asNodeKey } from "@atlas/kernel"
import type { NodeKey, ToolSchema } from "@atlas/contracts"
import {
  NEGATIONS_INPUT_SCHEMA,
  NEGATIONS_TOOL,
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

const X = "src/payments/charge.ts::charge"
/** A fake read leg: ONE grounded negative + ONE fired abstention under the scope, both always returned. */
const fakeLeg: NegationLeg = () => ({
  negations: [{ nodeKey: "neg:1", relationKind: "calls", target: X, scope: "src/payments", freshness: "FRESH" }],
  abstentions: [
    {
      kind: "abstained",
      id: asNodeKey("abs:1"),
      relationKind: "calls",
      target: "src/o.ts::p",
      scope: "src/orders",
      reason: "scope-open",
      witness: { underApproxSources: ["src/x.ts::dyn"] },
    },
  ],
})

describe("#99b — the closed governance surface is untouched when no read leg is injected", () => {
  it("listTools with NO leg advertises EXACTLY the five GOVERNANCE_SURFACE tools (SCN-MCP-1 holds)", () => {
    const names = listTools(fakeHandler).tools.map((t) => t.name)
    expect(names).toEqual([...GOVERNANCE_SURFACE])
    expect(advertisedReadTools()).toEqual([])
  })
})

describe("#99b — `atlas-negations` is advertised with its documented schema when a leg is injected", () => {
  it("appends the negations tool AFTER the five governance tools, carrying NEGATIONS_INPUT_SCHEMA", () => {
    const tools = listTools(fakeHandler, undefined, fakeLeg).tools
    expect(tools).toHaveLength(GOVERNANCE_SURFACE.length + 1)
    const neg = tools.find((t) => t.name === NEGATIONS_TOOL)
    expect(neg).toBeDefined()
    expect(neg?.inputSchema).toEqual(NEGATIONS_INPUT_SCHEMA)
    // the documented contract: scope required, abstained an optional boolean (#193 — no undocumented field)
    expect(NEGATIONS_INPUT_SCHEMA.required).toEqual(["scope"])
    expect(NEGATIONS_INPUT_SCHEMA.properties.abstained.type).toBe("boolean")
  })
})

describe("#99b — a call routes through the shared builder → SCHEMA + VERDICT parity with the CLI", () => {
  it("serves the negatives AND abstentions from the injected leg, byte-identical to the CLI verdict builder", () => {
    const result = callTool(fakeHandler, NEGATIONS_TOOL, { scope: "src" }, undefined, fakeLeg)
    expect(result.isError).toBeFalsy()
    const text = (result.content[0] as { text: string }).text
    // PARITY: the MCP result is the verdictToResult of the SAME verdict the CLI renders — one builder, one truth.
    const parity = verdictToResult(negationsVerdict(fakeLeg, "src", false))
    expect(text).toBe((parity.content[0] as { text: string }).text)
    // THE #202 CLOSE crosses stdio: the fired abstention is in the bytes an MCP client reads.
    expect(text).toContain('"reason":"scope-open"')
    expect(text).toContain('"target":"' + X + '"')
  })

  it("a call MISSING the required `scope` fails closed to isError — schema `required:[scope]` enforced, CLI/MCP symmetric", () => {
    // teeth: a mutant that drops the `scope` check in `negationsVerdict` makes this return ok:true.
    const result = callTool(fakeHandler, NEGATIONS_TOOL, {}, undefined, fakeLeg)
    expect(result.isError).toBe(true)
    expect((result.content[0] as { text: string }).text).toContain("missing scope")
  })

  it("with NO leg present the negations token falls through to the handler and fails closed", () => {
    // teeth: a mutant that serves negations without a composed leg would answer over nothing.
    const result = callTool(fakeHandler, NEGATIONS_TOOL, { scope: "src" })
    expect(result.isError).toBe(true)
    expect((result.content[0] as { text: string }).text).toContain("off-surface")
  })
})
