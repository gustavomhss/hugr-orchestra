// @atlas/tools — test/link-retract-schema.test.ts  (A-D3 / task #83 — the retraction MODE's PUBLISHED schema)
//
// The mode is selected by an argument, so the argument has to be part of the ONE published contract (TOOLS-3)
// rather than an undocumented field the door happens to read. A cold review found the mode had no unit
// coverage anywhere in `tools/test`; removing `retract` from `SCHEMAS` was caught only by the single e2e
// story. These cases pin the schema-level half from this package, where the constant lives.
//
// What is deliberately NOT re-asserted here: the door's behaviour. That belongs to
// `adapter-io/test/governed-link-retract.test.ts`. This file only pins that the mode is PUBLISHED, TYPED,
// and OPTIONAL — the three properties a transport depends on.

import { describe, it, expect } from "vitest"
import { createHandler, GOVERNANCE_SURFACE, WRITE_PATHS } from "../src/index.js"
import { FAULT_MALFORMED_ARGS } from "../src/fault.js"
import type { LinkOut, ToolData } from "../src/index.js"

const handler = createHandler({
  // A canned leg that ECHOES the mode it was handed, so the door's own argument validation is what is under
  // test — not a real link door, which this layer must not depend on (the DAG runs adapter-io → tools).
  "atlas-link": (args): ToolData => {
    const a = args as { a?: string; b?: string; retract?: unknown }
    return { linked: true, a: a.a ?? "", b: a.b ?? "", ...(a.retract === true ? { retracted: true } : {}) } as LinkOut
  },
})

const linkSchema = (): {
  properties?: Record<string, { type?: string }>
  required?: string[]
  additionalProperties?: boolean
} => handler.schema("atlas-link").inputSchema as never

describe("atlas-link — the retraction MODE is part of the ONE published schema (TOOLS-3)", () => {
  it("`retract` is DECLARED, and declared as a boolean", () => {
    // Kills the mutant that deletes/renames the property. Declaring the TYPE is load-bearing, not cosmetic:
    // the door type-checks every declared property that is present, so this line is what turns a non-boolean
    // `retract` into an attributed `malformed-args` instead of a silently-ignored assertion.
    expect(linkSchema().properties?.["retract"]?.type).toBe("boolean")
  })

  it("`retract` is OPTIONAL — the assert path never gained a required argument", () => {
    expect(linkSchema().required).toEqual(["a", "b"])
    expect(linkSchema().required).not.toContain("retract")
  })

  it("the DESCRIPTION says what the mode does, so an MCP agent is not left to infer it", () => {
    // An MCP client is an agent reading this string to decide whether it may call the door. "retract" alone
    // does not say that the act is governed identically, nor that it is an append. Anti-vacuity: assert on
    // the concepts, not on a substring that any prose would satisfy.
    const d = handler.schema("atlas-link").description.toLowerCase()
    expect(d).toContain("retract")
    expect(d).toMatch(/withdraw|retract/)
    expect(d).toContain("append")
  })
})

describe("atlas-link — the mode does not move the governance surface (INV-TOOLS-1 / ADR-0003)", () => {
  it("the retract MODE does not move GOVERNANCE_SURFACE/WRITE_PATHS (WP-11.W8 grew both for atlas-memory-emit, a real new door — not this mode)", () => {
    // The whole reason retraction is a MODE and not a sixth tool. Pinned here as well as in
    // `spec-conformance-guard` so the property is visible to a reader of this package, not only to CI.
    expect(GOVERNANCE_SURFACE).toEqual([
      "atlas-init",
      "atlas-query",
      "atlas-emit",
      "atlas-reconcile",
      "atlas-link",
      "atlas-memory-emit",
    ])
    expect(WRITE_PATHS).toEqual(["atlas-emit", "atlas-link", "atlas-memory-emit"])
    expect(GOVERNANCE_SURFACE).not.toContain("atlas-unlink")
  })
})

describe("atlas-link — a NON-boolean `retract` is the CALLER's malformed input, not a silent assertion", () => {
  it("a string `retract` is refused up front with the malformed-args discriminant", () => {
    // The dangerous failure mode is not the refusal — it is the ALTERNATIVE: silently ignoring the bad value
    // runs an ASSERTION the caller did not ask for. Kills a mutant that drops the declared type.
    const v = handler.handle("atlas-link", { a: "nkA", b: "nkB", retract: "yes" })
    expect(v.ok).toBe(false)
    expect((v.rejected ?? "").split(":")[0]).toBe(FAULT_MALFORMED_ARGS) // discriminant EQUALITY, not substring
    expect(v.data).toBeUndefined() // the leg never ran
  })

  it("ANTI-VACUITY: the two BOOLEAN values both reach the leg and select opposite acts", () => {
    // Without this the case above could pass on a door that refuses every `retract` whatsoever.
    const asserted = handler.handle("atlas-link", { a: "nkA", b: "nkB", retract: false })
    expect(asserted.ok).toBe(true)
    expect((asserted.data as LinkOut).retracted).toBeUndefined()

    const retracted = handler.handle("atlas-link", { a: "nkA", b: "nkB", retract: true })
    expect(retracted.ok).toBe(true)
    expect((retracted.data as LinkOut).retracted).toBe(true)
  })

  it("the mode is OMISSIBLE and defaults to the assert path", () => {
    const v = handler.handle("atlas-link", { a: "nkA", b: "nkB" })
    expect(v.ok).toBe(true)
    expect((v.data as LinkOut).retracted).toBeUndefined()
  })
})
