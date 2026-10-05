// @atlas/tools — test/fault-vocabulary.test.ts   (the class-(a) validator + the self-tag channel)
//
// A 70-mutant sweep of `packages/tools/src` (comment- and string-aware, run against `packages/tools/test`)
// left 22 survivors; after the two T0 write-door properties were closed, EVERY remaining survivor was in
// `src/fault.ts` — the module that decides which of the three fault CLASSES an operator is shown. The
// classifier had tests for the paths the three shipped incidents took (`error-attribution.test.ts`) and
// nothing for the rest of its published surface, so most of its branches could be inverted in silence.
//
// This file states those branches as properties. TWO reach-levels, kept apart on purpose:
//
//   §1 THROUGH THE DOOR — behaviour observable via `handle`, i.e. reachable by a real caller.
//   §2 THROUGH THE PUBLISHED EXPORT — `malformedArgsReason` / `missingRequiredReason` are exported from the
//      barrel and take an ARBITRARY `ToolSchema`, so their type lattice is public API even though the five
//      frozen tool schemas only ever declare `string` / `object` / `boolean`. Reported honestly as such:
//      the `number` / `integer` / `array` legs are UNREACHABLE through the five schemas, so a mutant there
//      is equivalent-in-the-product and non-equivalent-in-the-API. The assertions live at the level where
//      the behaviour is actually promised.
//
// Reasons are asserted by EXACT EQUALITY of the whole minted string wherever this module mints it (it is a
// message an operator reads and acts on, and the discriminant alone would not catch a message that names
// the wrong argument or the wrong kind), and by DISCRIMINANT equality where a door minted it.

import { describe, expect, it } from "vitest"
import type { ToolSchema } from "@atlas/contracts"
import { faultOf, malformedArgsReason, missingRequiredReason } from "../src/fault.js"
import { createHandler } from "../src/handler.js"
import type { ToolLeg } from "../src/handler.js"
import type { Tool, ToolData } from "../src/types.js"

const okLeg: ToolLeg = () => ({ emitted: true }) as ToolData
const rejectedOf = (tool: Tool, args: unknown, leg: ToolLeg = okLeg): string | undefined =>
  createHandler({ [tool]: leg }).handle(tool, args).rejected

/** A schema built for §2 — the validator takes ANY `ToolSchema`, and the five frozen ones do not exercise
 *  its whole type lattice. `additionalProperties:false` IS enforced now (see fault.ts), so every §2 case
 *  below passes only properties this helper declares — the closed set is exercised in §1, on a real door. */
const schemaOf = (props: Record<string, { type: string }>, required: string[] = []): ToolSchema => ({
  name: "probe",
  description: "a synthetic schema — §2 exercises the published validator, not a shipped tool",
  inputSchema: { type: "object", properties: props, required, additionalProperties: false },
})

// ── §1 — through the door ────────────────────────────────────────────────────────────────────────

describe("class (a) THROUGH THE DOOR — the envelope and the declared types the five schemas use", () => {
  it("a non-object envelope is named by its ACTUAL kind, for each kind", () => {
    // `kindOf` is the difference between "it received string" and a message that lies about what arrived.
    expect(rejectedOf("atlas-query", "src")).toBe(
      "malformed-args: 'atlas-query' takes a JSON object of arguments; it received string",
    )
    expect(rejectedOf("atlas-query", 42)).toBe(
      "malformed-args: 'atlas-query' takes a JSON object of arguments; it received number",
    )
    expect(rejectedOf("atlas-query", null)).toBe(
      "malformed-args: 'atlas-query' takes a JSON object of arguments; it received null",
    )
    expect(rejectedOf("atlas-query", ["src"])).toBe(
      "malformed-args: 'atlas-query' takes a JSON object of arguments; it received an array",
    )
    expect(rejectedOf("atlas-query", undefined)).toBe(
      "malformed-args: 'atlas-query' takes a JSON object of arguments; it received undefined",
    )
  })

  it("a declared `string` argument of the wrong type is refused before the leg runs", () => {
    let ran = 0
    const counting: ToolLeg = () => {
      ran += 1
      return { emitted: true } as ToolData
    }
    expect(rejectedOf("atlas-query", { scope: 42 }, counting)).toBe(
      "malformed-args: 'atlas-query' argument 'scope' must be string; it received number",
    )
    expect(ran).toBe(0) // decided by the DOOR — the leg never saw it
  })

  it("a declared `object` argument (atlas-emit `node`) rejects a NON-object, and admits an object", () => {
    // The `object` leg of `satisfies` is three conjuncts; each one matters and none was asserted.
    expect(rejectedOf("atlas-emit", { node: "a claim", at: "deadbeef" })).toBe(
      "malformed-args: 'atlas-emit' argument 'node' must be object; it received string",
    )
    expect(rejectedOf("atlas-emit", { node: null, at: "deadbeef" })).toBe(
      "malformed-args: 'atlas-emit' argument 'node' must be object; it received null",
    )
    expect(rejectedOf("atlas-emit", { node: ["a claim"], at: "deadbeef" })).toBe(
      "malformed-args: 'atlas-emit' argument 'node' must be object; it received an array",
    )
    // CONTROL: a real object argument passes the validator and reaches the leg.
    expect(rejectedOf("atlas-emit", { node: { claim: "x" }, at: "deadbeef" })).toBeUndefined()
  })

  it("a declared `boolean` argument (atlas-reconcile `options.acceptReground`) rejects a non-boolean", () => {
    // NESTED, and that placement is the fix rather than an accident of this test: `acceptReground` used to be
    // declared at the TOP level while the wired leg read `args.options.acceptReground` — so the published
    // knob did nothing and the working one was undeclared. The schema now names the shape the CLI marshaller
    // has always produced (`{mergeBase, options:{acceptReground}}`), and the validator descends into it.
    expect(rejectedOf("atlas-reconcile", { mergeBase: "abc", options: { acceptReground: "yes" } })).toBe(
      "malformed-args: 'atlas-reconcile' argument 'options.acceptReground' must be boolean; it received string",
    )
    expect(rejectedOf("atlas-reconcile", { mergeBase: "abc", options: { acceptReground: true } })).toBeUndefined()
    // …and the dead TOP-LEVEL spelling is refused rather than accepted-and-dropped.
    expect(rejectedOf("atlas-reconcile", { mergeBase: "abc", acceptReground: true })).toBe(
      "malformed-args: 'atlas-reconcile' does not accept 'acceptReground' — it declares only 'mergeBase', " +
        "'options' (the published schema is a CLOSED set, additionalProperties: false)",
    )
  })

  it("`additionalProperties:false` is ENFORCED, and names every undeclared key at once, sorted", () => {
    // It was declared by every governance schema and enforced by none: `{scope:'src',bogusKey:1}` was
    // accepted and routed (measured over real MCP stdio). Sorted + all-at-once so the message does not
    // depend on JSON key order, which belongs to the wire and not to the caller.
    expect(rejectedOf("atlas-query", { scope: "src", zed: 1, alpha: 2 })).toBe(
      "malformed-args: 'atlas-query' does not accept 'alpha', 'zed' — it declares only 'by', 'scope' " +
        "(the published schema is a CLOSED set, additionalProperties: false)",
    )
    // CONTROL: every declared argument still passes, at both levels.
    expect(rejectedOf("atlas-query", { scope: "src", by: "dependency" })).toBeUndefined()
    expect(rejectedOf("atlas-reconcile", { mergeBase: "abc", options: {} })).toBeUndefined()
  })

  it("the CLOSED set is closed AT DEPTH — an undeclared key inside `options` is named by its full path", () => {
    expect(rejectedOf("atlas-reconcile", { mergeBase: "abc", options: { acceptRegound: true } })).toBe(
      "malformed-args: 'atlas-reconcile' does not accept 'options.acceptRegound' under 'options' — " +
        "it declares only 'acceptReground' (the published schema is a CLOSED set, additionalProperties: false)",
    )
  })

  it("a declared `enum` is enforced — `atlas-query --by` has exactly three modes on BOTH transports", () => {
    // Without this the MCP door accepted `by:'graph'` and silently served `by:'scope'`, while the CLI
    // marshaller refused the same string outright — a transport divergence on a published argument.
    expect(rejectedOf("atlas-query", { scope: "src", by: "graph" })).toBe(
      "malformed-args: 'atlas-query' argument 'by' must be one of 'scope' | 'dependency' | 'trigger'; it received 'graph'",
    )
    for (const by of ["scope", "dependency", "trigger"]) {
      expect(rejectedOf("atlas-query", { scope: "src", by })).toBeUndefined()
    }
  })

  it("TOTALITY: a leg wired under an OFF-SURFACE tool token still returns a verdict, never a throw", () => {
    // The off-surface fallback schema declares NO `properties`. Reading the declared types out of it is the
    // one place the validator can be handed a hole, and it is reached the moment a composition root binds a
    // leg under a token that is not one of the five. `as Tool` is the point of the case: the cast is what a
    // JS caller over MCP does for free.
    //
    // It also declares no CLOSED SET, deliberately (handler.ts `SCHEMA_OFF_SURFACE`): now that the door
    // enforces `additionalProperties:false`, a fallback that claimed one would refuse every argument of a
    // wired leg on the authority of a schema nobody authored for that tool. `{anything: 1}` reaching the leg
    // is the assertion that says so.
    const handler = createHandler({ ["atlas-delete" as Tool]: okLeg })

    let threw = false
    let out
    try {
      out = handler.handle("atlas-delete" as Tool, { anything: 1 })
    } catch {
      threw = true
    }

    expect(threw).toBe(false) // TOOLS-2 — total
    expect(out?.ok).toBe(true) // the leg IS wired, so it runs; the missing `properties` is not an error
    expect(out?.guidance.invariant).not.toBe("")
  })
})

describe("the SELF-TAG channel — an error that declares its own class is believed", () => {
  const tagged =
    (kind: string): ToolLeg =>
    () => {
      // A deliberately-constructed `Error` (which the inference would otherwise file as `refused`) carrying
      // the structural tag. Structural by design: `instanceof` breaks across duplicate module instances.
      throw Object.assign(new Error("the door said so"), { atlasFault: kind })
    }

  it("`internal-fault` self-tag wins over the inference (which would have said `refused`)", () => {
    const v = createHandler({ "atlas-query": tagged("internal-fault") }).handle("atlas-query", { scope: "src" })

    expect(faultOf(v)).toBe("internal-fault")
    // …and an internal fault does NOT borrow the tool's caller-facing guidance.
    expect(v.guidance.invariant).toContain("TOOLS-2")
    expect(v.guidance.next).not.toBe(
      "re-ground stale packs before trusting; scope must be a path string", // atlas-query's own guidance
    )
  })

  it("a `refused` self-tag on a NON-Error thrown value keeps it a refusal (not an internal fault)", () => {
    // Untagged, a thrown non-`Error` is internal ("a code path nobody wrote"). The tag is the override, and
    // it is the only thing separating these two cases.
    const bare: ToolLeg = () => {
      throw { atlasFault: "refused", message: "plain object refusal" }
    }
    const untagged: ToolLeg = () => {
      throw { message: "plain object, no tag" }
    }

    expect(faultOf(createHandler({ "atlas-query": bare }).handle("atlas-query", { scope: "src" }))).toBe("refused")
    expect(faultOf(createHandler({ "atlas-query": untagged }).handle("atlas-query", { scope: "src" }))).toBe(
      "internal-fault",
    )
  })
})

// ── §2 — through the published export ────────────────────────────────────────────────────────────

describe("the PUBLISHED validator over its whole type lattice (unreachable via the five schemas)", () => {
  const TYPED: readonly (readonly [string, unknown, unknown])[] = [
    // [declared type, a value that SATISFIES it, a value that does NOT]
    ["string", "src", 42],
    ["number", 42, "src"],
    ["integer", 42, 1.5],
    ["boolean", true, "true"],
    ["array", [1], { 0: 1 }],
    ["object", { a: 1 }, [1]],
  ]

  it.each(TYPED)("a declared `%s` accepts its own type and refuses another", (type, good, bad) => {
    const schema = schemaOf({ v: { type } })

    expect(malformedArgsReason("probe", schema, { v: good })).toBeUndefined()
    expect(malformedArgsReason("probe", schema, { v: bad })).toBe(
      `malformed-args: 'probe' argument 'v' must be ${type}; it received ${
        Array.isArray(bad) ? "an array" : bad === null ? "null" : typeof bad
      }`,
    )
  })

  it("`number` and `integer` are NOT the same predicate — a float satisfies one and not the other", () => {
    expect(malformedArgsReason("probe", schemaOf({ v: { type: "number" } }), { v: 1.5 })).toBeUndefined()
    expect(malformedArgsReason("probe", schemaOf({ v: { type: "integer" } }), { v: 1.5 })).toBe(
      "malformed-args: 'probe' argument 'v' must be integer; it received number",
    )
    // …and neither admits a non-finite number.
    expect(malformedArgsReason("probe", schemaOf({ v: { type: "number" } }), { v: Number.NaN })).toBe(
      "malformed-args: 'probe' argument 'v' must be number; it received number",
    )
  })

  it("a type the validator does not know is UNCHECKED — it never invents a constraint", () => {
    // The stated contract: "this validator narrows, it never invents a constraint the published schema does
    // not state." A mutant that flips the default to "reject" would refuse every argument of such a type.
    const schema = schemaOf({ v: { type: "geojson" } })

    expect(malformedArgsReason("probe", schema, { v: "anything" })).toBeUndefined()
    expect(malformedArgsReason("probe", schema, { v: { deeply: ["nested"] } })).toBeUndefined()
  })

  it("an ABSENT property is the leg's business — never a class-(a) refusal", () => {
    expect(malformedArgsReason("probe", schemaOf({ v: { type: "string" } }, ["v"]), {})).toBeUndefined()
  })

  it("`missingRequiredReason` is TOTAL over a non-object `args` (it is called on a throw path)", () => {
    // It runs where a leg ALREADY crashed. If it can itself throw on the value that crashed the leg, the
    // handler's fail-closed catch is what breaks — the one place totality must not be conditional.
    const schema = schemaOf({ a: { type: "string" }, b: { type: "string" } }, ["a", "b"])

    expect(missingRequiredReason("probe", schema, null)).toBe("malformed-args: 'probe' requires 'a', 'b'; not supplied")
    expect(missingRequiredReason("probe", schema, undefined)).toBe(
      "malformed-args: 'probe' requires 'a', 'b'; not supplied",
    )
    expect(missingRequiredReason("probe", schema, "not-an-object")).toBe(
      "malformed-args: 'probe' requires 'a', 'b'; not supplied",
    )
    expect(missingRequiredReason("probe", schema, { a: "x" })).toBe(
      "malformed-args: 'probe' requires 'b'; not supplied",
    )
    expect(missingRequiredReason("probe", schema, { a: "x", b: "y" })).toBeUndefined()
  })

  it("the envelope check is TOTAL for a schema that does not demand an object", () => {
    // `type` is absent ⇒ no envelope demand ⇒ a non-object `args` must be answered, not crashed on.
    const looseSchema: ToolSchema = {
      name: "probe",
      description: "no `type` on the envelope",
      inputSchema: { properties: { v: { type: "string" } } },
    }

    expect(malformedArgsReason("probe", looseSchema, undefined)).toBeUndefined()
    expect(malformedArgsReason("probe", looseSchema, "a bare string")).toBeUndefined()
    expect(malformedArgsReason("probe", looseSchema, { v: 42 })).toBe(
      "malformed-args: 'probe' argument 'v' must be string; it received number",
    )
  })
})
