import { expect } from "bun:test"
import { CapabilityInvocation } from "@orchestra/core/capability/invocation"
import { ToolRegistry } from "@orchestra/core/tool/registry"
import { Tool } from "@orchestra/core/tool/tool"
import { Effect, Ref, Schema } from "effect"
import { CapabilityChildrenFixture } from "./fixture/capability-children"
import { CapabilityPolicyFixture } from "./fixture/capability-policy"
import { testEffect } from "./lib/effect"

const it = testEffect(CapabilityChildrenFixture.layer)

it.live("canonical parent and hidden child inherit the issuing materialization without leaking it outside settlement", () => Effect.gen(function* () {
  const f = yield* CapabilityChildrenFixture.fixture
  const seen = yield* Ref.make<readonly ToolRegistry.Materialization[]>([])
  expect(yield* ToolRegistry.captured).toBeUndefined()
  yield* f.registry.register({
    service_call: Tool.make({
      description: "Captured canonical dispatch fixture",
      input: Schema.Struct({ text: Schema.String }),
      output: Schema.String,
      execute: (input, context) => Effect.gen(function* () {
        const materialization = yield* ToolRegistry.captured
        if (!materialization) return yield* new Tool.Failure({ message: "Missing issuing materialization" })
        yield* Ref.update(seen, (values) => [...values, materialization])
        const dispatcher = yield* f.children.dispatcher(context, materialization)
        const settled = yield* dispatcher.settle("hidden_leaf", input)
        if (settled.result.type !== "text" || typeof settled.result.value !== "string")
          return yield* new Tool.Failure({ message: "Child did not return text" })
        return settled.result.value
      }).pipe(Effect.mapError((error) => error instanceof Tool.Failure ? error : new Tool.Failure({
        message: "Child settlement failed", error,
      }))),
    }),
    hidden_leaf: Tool.make({
      description: "Hidden canonical leaf fixture",
      input: Schema.Struct({ text: Schema.String }),
      output: Schema.String,
      execute: (input, context) => Effect.gen(function* () {
        const materialization = yield* ToolRegistry.captured
        if (!materialization) return yield* new Tool.Failure({ message: "Missing child materialization" })
        yield* Ref.update(seen, (values) => [...values, materialization])
        const permit = yield* f.policy.authorize(context, CapabilityPolicyFixture.input)
        yield* f.policy.commit(permit, () => f.target)
        return input.text
      }).pipe(Effect.mapError((error) => new Tool.Failure({ message: "Child denied", error }))),
    }),
  })
  const materialization = yield* f.registry.materialize(undefined, { advertisedNames: ["service_call"] })
  expect(materialization.definitions.map((tool) => tool.name)).toEqual(["service_call"])
  expect(materialization.definition("hidden_leaf")).toBeDefined()
  const settled = yield* CapabilityInvocation.withContext(f.binding, materialization.settle({
    sessionID: f.context.sessionID, agent: f.context.agent, assistantMessageID: f.context.assistantMessageID,
    call: { type: "tool-call", id: f.context.toolCallID, name: "service_call", input: { text: "canonical child" } },
  }))
  expect(settled.result).toEqual({ type: "text", value: "canonical child" })
  expect(yield* Ref.get(seen)).toEqual([materialization, materialization])
  expect(yield* Ref.get(f.effects)).toBe(1)
  expect((yield* f.rows()).map((row) => ({ tool: row.tool_name, parent: row.parent_call_id, state: row.state })))
    .toEqual([{ tool: "hidden_leaf", parent: f.context.toolCallID, state: "completed" }])
  expect(yield* ToolRegistry.captured).toBeUndefined()
}))
