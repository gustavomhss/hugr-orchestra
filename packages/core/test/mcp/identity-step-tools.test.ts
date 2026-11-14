import { expect } from "bun:test"
import { Effect, Layer } from "effect"
import { narrowStepTools } from "../../src/session/runner/step-tools"
import { testEffect } from "../lib/effect"
import { graph, identity, leaf, workspace } from "./identity-fixture"

const it = testEffect(Layer.empty)

it.live("workflow MCP allowlist refuses a denied opaque ID without reconstructing a sanitized alias", () =>
  Effect.sync(() => {
    const allowed = "mcp_" + "A".repeat(43)
    const denied = "mcp_" + "B".repeat(43)
    const step = narrowStepTools({ mcp: ["allowed"] }, { allowed: [allowed], denied: [denied] })
    expect(step.refuses(denied, {})).toBe(true)
    expect(step.refuses(allowed, {})).toBe(false)
    expect(step.hidden).toContainEqual({ action: denied, resource: "*", effect: "deny" })
    expect(step.advertises(denied)).toBe(false)
    expect(step.advertises(allowed)).toBe(true)
  }),
)

it.live("workflow MCP allowlist closes a new-ID race between inventory and materialization", () =>
  Effect.sync(() => {
    const initial = "mcp_" + "A".repeat(43)
    const arrivedLater = "mcp_" + "B".repeat(43)
    const step = narrowStepTools({ mcp: ["allowed"], bash: [] }, { allowed: [initial] })
    expect(step.refuses(arrivedLater, {})).toBe(true)
    expect(step.advertises(arrivedLater)).toBe(false)
    expect(step.advertises("bash")).toBe(false)
    expect(step.advertises("read")).toBe(true)
    expect(narrowStepTools(undefined, {}).refuses(arrivedLater, {})).toBe(false)
  }),
)

it.live(
  "real registrations arriving after the workflow snapshot remain hidden/refused until a new inventory, without overriding agent deny",
  () =>
    Effect.gen(function* () {
      const f = yield* workspace
      const h = yield* identity(f)
      const g = yield* graph(f, { documents: () => [], replacements: [[h.McpIdentity.node, h.layer]] })
      const authority = { kind: "provided" as const, name: "allowed", key: "same" }
      const first = yield* g.tools.registerMcp(authority, "first", () => leaf("FIRST"))
      const step = narrowStepTools({ mcp: ["allowed"] }, { allowed: [first] })
      const late = yield* g.tools.registerMcp(authority, "late", () => leaf("LATE"))
      expect(step.refuses(late, {})).toBe(true)
      const materialized = yield* g.registry.materialize(step.hidden)
      expect(materialized.definitions.filter((tool) => step.advertises(tool.name)).map((tool) => tool.name)).toEqual([
        first,
      ])
      expect(narrowStepTools({ mcp: ["allowed"] }, { allowed: [first, late] }).refuses(late, {})).toBe(false)
      const denied = yield* g.registry.materialize([{ action: first, resource: "*", effect: "deny" }, ...step.hidden])
      expect(denied.definitions.filter((tool) => step.advertises(tool.name))).toEqual([])
    }),
)
