// @atlas/mcp-server — test/error-attribution-mcp.test.ts  (WP-F2F5 over the MCP transport)
//
// A fix at the handler is not a fix at the transport, so the three error classes are pinned HERE too, over
// the REAL `createHandler` (never a canned-verdict fake — a fake would pin the mapping and nothing else).
//
// MCP is the AGENT door, and the attribution is what an agent has to branch on: retry with different
// arguments (class a), stop and report a governance refusal (class b), or file a defect (class c). Reading
// that out of a prose paragraph is exactly what this repo's `reasonOf` discipline exists to stop, so the
// mapping ships a machine `fault` field ALONGSIDE the unchanged `rejected`/`guidance`.

import { describe, expect, it } from "vitest"
import { createHandler, INTERNAL_GUIDANCE } from "@atlas/tools"
import type { ToolData, ToolLeg } from "@atlas/tools"
import type { WiredHandler } from "@atlas/adapter-io"
import { callTool, verdictToResult } from "../src/server.js"

/** THE DISCRIMINANT — everything before the first `:` (the `reasonOf` rule, ADR-0007). */
const reasonOf = (rejected: string | undefined): string => (rejected ?? "").split(":")[0]!

/** The JSON body an `isError` MCP result carries. */
interface ErrorBody {
  fault?: string
  rejected?: string
  guidance?: { next?: string; invariant?: string }
}
const bodyOf = (r: { content: Array<{ text?: string }> }): ErrorBody =>
  JSON.parse(r.content[0]?.text ?? "{}") as ErrorBody

const throwing =
  (e: unknown): ToolLeg =>
  () => {
    throw e
  }

/** I3 as `read-provenance.ts` ships it — a named subclass whose message LEADS with the discriminant. */
class UntrustedStoreErrorDouble extends Error {
  constructor() {
    super("untrusted-store: the durable Atlas store under `.atlas/` is TRACKED BY GIT, so it arrived by COMMIT")
    this.name = "UntrustedStoreError"
  }
}

const over = (e: unknown): WiredHandler => createHandler({ "atlas-query": throwing(e) })

describe("WP-F2F5 over MCP — a refusal and a defect of ours are different things to an agent", () => {
  it("I3: the untrusted-store read refusal arrives NAMED, not as the caller's malformed input", () => {
    // This is the instance `adapter-io/src/read-provenance.ts` recorded as MCP-ONLY: the CLI door refuses
    // earlier with its own prose, so the mislabel was reachable only through this transport.
    const res = callTool(over(new UntrustedStoreErrorDouble()), "atlas-query", { scope: "src" })
    expect(res.isError).toBe(true)
    const body = bodyOf(res as { content: Array<{ text?: string }> })
    expect(reasonOf(body.rejected)).toBe("untrusted-store")
    expect(body.fault).toBe("refused")
  })

  it("I1: an internal crash is labelled `internal-fault` and carries the internal guidance", () => {
    const crash = new TypeError("Cannot read properties of undefined (reading 'contentHash')")
    const res = callTool(over(crash), "atlas-query", { scope: "src" })
    const body = bodyOf(res as { content: Array<{ text?: string }> })
    expect(body.fault).toBe("internal-fault")
    expect(reasonOf(body.rejected)).toBe("internal-fault")
    // The agent is told, on the guidance channel it already reads, NOT to go and change its arguments.
    expect(body.guidance?.invariant).toBe(INTERNAL_GUIDANCE.invariant)
  })

  it("I2: a deliberate refusal keeps its own reason and is classed `refused`", () => {
    const noAxes = "atlas query --by dependency|trigger needs the composition-root axes"
    const body = bodyOf(
      callTool(over(new Error(noAxes)), "atlas-query", { scope: "src" }) as { content: Array<{ text?: string }> },
    )
    expect(body.rejected).toBe(noAxes) // verbatim — no prefix of ours
    expect(body.fault).toBe("refused")
  })

  it("class (a): a schema-violating argument is `malformed-args`, and the leg is never reached", () => {
    let calls = 0
    const leg: ToolLeg = () => {
      calls += 1
      return {} as ToolData
    }
    const body = bodyOf(
      callTool(createHandler({ "atlas-query": leg }), "atlas-query", { scope: 42 }) as {
        content: Array<{ text?: string }>
      },
    )
    expect(body.fault).toBe("malformed-args")
    expect(calls).toBe(0)
  })

  it("the three classes are three DISTINCT values on one field — not three paragraphs to parse", () => {
    const kinds = [new TypeError("boom"), new UntrustedStoreErrorDouble()].map(
      (e) => bodyOf(callTool(over(e), "atlas-query", { scope: "src" }) as { content: Array<{ text?: string }> }).fault,
    )
    const malformed = bodyOf(
      callTool(over(new Error("never reached")), "atlas-query", null) as { content: Array<{ text?: string }> },
    ).fault
    expect([...kinds, malformed]).toEqual(["internal-fault", "refused", "malformed-args"])
  })

  it("an OK verdict is byte-unchanged — `fault` rides the error envelope only (back-compat)", () => {
    const ok = { ok: true, data: { emitted: true }, guidance: { next: "n", invariant: "i" } } as const
    const text = (verdictToResult(ok as never).content[0] as { text: string }).text
    expect(text).toBe(JSON.stringify({ data: ok.data, guidance: ok.guidance }))
  })
})
