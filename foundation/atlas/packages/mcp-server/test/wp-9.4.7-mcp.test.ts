// @atlas/mcp-server — test/wp-9.4.7-mcp.test.ts   (WP-9.4.7.MCP — MCP-1/2)
//
// RED→GREEN transcription of the pinned MCP-transport behaviour, exercised against a FAKE `WiredHandler`
// (`{ handle, schema }` + a stub `resolveNode` the transport never touches) — NEVER the real assembly. The
// mapping functions are pure + total, so we invoke them directly (deterministic; no stdio pipe):
//   • advertisedTools / listTools — GOVERNANCE_SURFACE ∪ READ_SURFACE, schemas read from handler.schema (TOOLS-1/3)
//   • verdictToResult / callTool  — Verdict → CallToolResult, incl. the fail-closed-visibility golden (MCP-2)
// Each golden NAMES the exact mutant that flips it (mutation-scoped teeth).

import { describe, it, expect } from "vitest"
import { GOVERNANCE_SURFACE } from "@atlas/tools"
import type { Tool, ToolData, Verdict } from "@atlas/tools"
import type { WiredHandler } from "@atlas/adapter-io"
import type { NodeKey, ToolSchema } from "@atlas/contracts"
import type { GroundedFact } from "@atlas/knowledge"
import { advertisedTools, callTool, listTools, verdictToResult } from "../src/server.js"

// ── the FAKE WiredHandler — canned schemas + a configurable verdict, never the real handler ──────────────

/** A distinctive canned schema per tool — the `inputSchema` bytes we assert pass through unaltered. */
const cannedSchema = (tool: Tool): ToolSchema => ({
  name: tool,
  description: `desc::${tool}`,
  inputSchema: { type: "object", properties: { [`arg_${tool}`]: { type: "string" } }, additionalProperties: false },
})

const GUIDANCE = { next: "do-the-next-thing", invariant: "the-governing-invariant" } as const

/** Build a fake handler whose `handle` returns the given verdict for every call. */
const fakeHandler = (verdict: Verdict<ToolData>): WiredHandler => ({
  handle: () => verdict,
  schema: (tool: Tool) => cannedSchema(tool),
  // stub — the MCP transport never routes resolveNode; present only to satisfy WiredHandler.
  resolveNode: (nodeAddr: NodeKey) => ({
    ok: false,
    rejected: `stub:${nodeAddr}`,
    guidance: GUIDANCE,
  }),
})

const OK_VERDICT: Verdict<ToolData> = {
  ok: true,
  data: { emitted: true, id: "cas-id-xyz" } as unknown as ToolData,
  guidance: GUIDANCE,
}

const REJECT_VERDICT: Verdict<ToolData> = {
  ok: false,
  rejected: "fail-closed: citation did not re-derive at source@sha",
  guidance: GUIDANCE,
}

// ── SCN-MCP-1: the advertised surface is EXACTLY the five GOVERNANCE_SURFACE tools ───────────────────────

describe("SCN-MCP-1 — ListTools advertises exactly the closed governance surface (TOOLS-1)", () => {
  it("advertises the GOVERNANCE_SURFACE tools by name, no more, no fewer", () => {
    // TEETH: a mutant in advertisedTools that appends an off-surface tool, or drops a real one,
    // makes this set-equality RED (the closed-surface golden). Length is DERIVED from the imported
    // constant, never re-transcribed (WP-11.W8 grew it from five to six — `atlas-memory-emit`).
    const names = advertisedTools(fakeHandler(OK_VERDICT)).map((t) => t.name)
    expect(names).toEqual([...GOVERNANCE_SURFACE])
    expect(names).toHaveLength(GOVERNANCE_SURFACE.length)
  })

  it("surfaces each tool inputSchema + description from handler.schema (byte-identical, TOOLS-3)", () => {
    // TEETH: a mutant that hand-authors a schema (ignores handler.schema(tool).inputSchema) or drops the
    // description flips this — the schema must be the handler's, unaltered.
    const tools = listTools(fakeHandler(OK_VERDICT)).tools
    for (const tool of GOVERNANCE_SURFACE) {
      const advertised = tools.find((t) => t.name === tool)
      expect(advertised).toBeDefined()
      expect(advertised?.inputSchema).toEqual(cannedSchema(tool).inputSchema)
      expect(advertised?.description).toBe(cannedSchema(tool).description)
    }
  })
})

// ── SCN-MCP-2: an ok:true verdict → a normal result, isError NOT set ─────────────────────────────────────

describe("SCN-MCP-2 — ok verdict maps to a normal result (MCP-2)", () => {
  it("renders data + guidance as text, with isError absent/false", () => {
    // TEETH: a mutant that sets isError:true on the ok branch of verdictToResult flips this.
    const result = verdictToResult(OK_VERDICT)
    expect(result.isError).toBeFalsy()
    const text = (result.content[0] as { text: string }).text
    expect(text).toContain('"emitted":true')
    expect(text).toContain(GUIDANCE.next)
  })

  it("callTool routes an on-surface call through handler.handle → ok result", () => {
    // TEETH: a mutant that never calls handler.handle (returns a canned result) drops the routed data,
    // flipping this.
    const result = callTool(fakeHandler(OK_VERDICT), "atlas-emit", { node: {}, at: "x@sha" })
    expect(result.isError).toBeFalsy()
    expect((result.content[0] as { text: string }).text).toContain('"emitted":true')
  })
})

// ── SCN-MCP-3: an ok:false (fail-closed) verdict → isError, reason VISIBLE ────────────────────────────────

describe("SCN-MCP-3 — rejected verdict maps to a VISIBLE isError (fail-closed visibility, MCP-2)", () => {
  it("sets isError:true AND carries the rejected reason + guidance in the content text", () => {
    // TEETH-A: a mutant that drops `isError:true` on the reject branch flips the isError assertion.
    // TEETH-B: a mutant that emits empty error content (e.g. content:[] or text:'') flips the
    //          reason-visible assertions — the known past bug (a fail-closed verdict rendered empty).
    const result = verdictToResult(REJECT_VERDICT)
    expect(result.isError).toBe(true)
    expect(result.content.length).toBeGreaterThan(0)
    const text = (result.content[0] as { text: string }).text
    expect(text.length).toBeGreaterThan(0)
    expect(text).toContain(REJECT_VERDICT.rejected!)
    expect(text).toContain(GUIDANCE.next)
    expect(text).toContain(GUIDANCE.invariant)
  })

  it("is TOTAL: an off-surface / malformed call name maps to a well-formed isError (never a throw)", () => {
    // TEETH: the handler is total, so callTool must not throw; a mutant wrapping handle in a re-throw
    // (or an empty error) flips this. The rejected reason stays visible.
    const result = callTool(fakeHandler(REJECT_VERDICT), "atlas-not-a-tool", undefined)
    expect(result.isError).toBe(true)
    expect((result.content[0] as { text: string }).text).toContain(REJECT_VERDICT.rejected!)
  })
})

// compile-time: the fake conforms to the frozen WiredHandler (differential-vs-oracle).
const _fakeConforms: WiredHandler = fakeHandler(OK_VERDICT)
void _fakeConforms
// unused-import guard for GroundedFact (kept to document the resolveNode stub's node shape).
type _NodeShape = GroundedFact
