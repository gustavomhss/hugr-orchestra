import { expect, test } from "bun:test"
import { Effect, Layer, type Scope } from "effect"
import { Project } from "@orchestra/core/project"
import { SessionSchema } from "@orchestra/core/session"
import { TaskGovernance } from "@orchestra/core/tool/task-governance"
import { AllowedDomains } from "@orchestra/core/tool/websearch"
import { ToolSafety } from "@orchestra/core/tool-safety"
import { Research } from "@orchestra/schema/research"
import { ResearchDispatchV2 } from "../src/v2/governance/research"
import { ResearchInquiry } from "../src/v2/tools/inquiry"
import { admit, child, governanceLayer, researchLayer, session, worktree } from "./fixture/v2-governance"

const run = <A, E, R>(layer: (directory: string) => Layer.Layer<R, unknown>, body: (directory: string) => Effect.Effect<A, E, R | Scope.Scope>) =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const directory = yield* worktree
        return yield* body(directory).pipe(Effect.provide(layer(directory)))
      }),
    ),
  )

const refusal = <R>(effect: Effect.Effect<unknown, { readonly message: string }, R>) =>
  Effect.flip(effect).pipe(Effect.map((error) => error.message))

const tool = (sessionID: SessionSchema.ID, callID: string, name = "websearch", args: Record<string, unknown> = {}) =>
  Effect.gen(function* () {
    const safety = yield* ToolSafety.Service
    return yield* safety.run(
      { tool: name, args, sessionID, callID, assistantMessageID: "msg_research", directory: "/", projectID: Project.ID.global },
      AllowedDomains,
      () => Effect.void,
    )
  })

test("a Task to the research seat binds its dispatch: the call, the effort tier and the allowed domains", () =>
  run(governanceLayer, (directory) =>
    Effect.gen(function* () {
      const admitted = yield* admit({
        directory,
        caller: "maestro",
        target: "jimmy",
        extra: { effort: "focused", allowedDomains: ["docs.python.org"] },
      })
      expect(admitted.permissions?.filter((rule) => rule.action === ResearchDispatchV2.PERMISSION)).toEqual([
        { action: ResearchDispatchV2.PERMISSION, resource: "call:call_governance_fixture", effect: "deny" },
        { action: ResearchDispatchV2.PERMISSION, resource: "tier:focused", effect: "deny" },
        { action: ResearchDispatchV2.PERMISSION, resource: "domain:docs.python.org", effect: "deny" },
      ])
      // Without effort the dispatch is quick and web search is unrestricted.
      expect(ResearchDispatchV2.read((yield* admit({ directory, caller: "maestro", target: "jimmy" })).permissions ?? []))
        .toEqual({ callID: "call_governance_fixture", tier: "quick", domains: undefined })
      // Other teammates ignore the research fields and carry no dispatch.
      expect(yield* admit({ directory, caller: "maestro", target: "general", extra: { effort: "deep" } })).toEqual({})
    }),
  ))

test("rebinding a resumed research child replaces the previous dispatch", () => {
  const first = ResearchDispatchV2.bind([{ action: "read", resource: "*", effect: "allow" }], {
    callID: "call_a",
    effort: "deep",
    allowedDomains: ["a.example"],
  })
  expect(ResearchDispatchV2.read(ResearchDispatchV2.bind(first, { callID: "call_b" }))).toEqual({
    callID: "call_b",
    tier: "quick",
    domains: undefined,
  })
  expect(ResearchDispatchV2.bind(first, { callID: "call_b" })[0]).toEqual({ action: "read", resource: "*", effect: "allow" })
})

test("the research seat never takes a provider turn without its dispatch allowance", () =>
  run(governanceLayer, (directory) =>
    Effect.gen(function* () {
      const governance = yield* TaskGovernance.Service
      expect(yield* refusal(governance.beforeTurn(yield* child(directory, { bound: false }))))
        .toStartWith("Research denied: binding_missing:")
    }),
  ))

test("every provider turn of a research child is charged until its tier's allowance is spent", () =>
  run(governanceLayer, (directory) =>
    Effect.gen(function* () {
      const governance = yield* TaskGovernance.Service
      const info = yield* child(directory)
      yield* Effect.forEach(Array.from({ length: Research.Tiers.quick.providerCalls }), () => governance.beforeTurn(info), {
        discard: true,
      })
      expect(yield* refusal(governance.beforeTurn(info))).toStartWith("Research denied: budget_exhausted:")
    }),
  ))

test("a research child past its dispatch deadline still takes turns and runs tools: the deadline only warns", () =>
  run(researchLayer, (directory) =>
    Effect.gen(function* () {
      const governance = yield* TaskGovernance.Service
      const info = yield* child(directory, { started: Date.now() - (Research.Tiers.quick.deadlineSeconds + 1) * 1000 })
      yield* governance.beforeTurn(info)
      expect(yield* tool(info.id, "call_0")).toBeUndefined()
      yield* tool(info.id, "call_close", "inquiry", { action: "close" })
    }),
  ))

test("inquiry close runs past the tool allowance and inside the close reserve, where every other tool is refused", () =>
  run(researchLayer, (directory) =>
    Effect.gen(function* () {
      const governance = yield* TaskGovernance.Service
      const info = yield* child(directory)
      yield* governance.beforeTurn(info)
      yield* Effect.forEach(Array.from({ length: Research.Tiers.quick.toolCalls }, (_, index) => `call_${index}`), (callID) =>
        tool(info.id, callID), { discard: true })
      expect((yield* Effect.flip(tool(info.id, "call_over"))).detail).toStartWith("Research denied: budget_exhausted:")
      yield* tool(info.id, "call_close", "inquiry", { action: "close" })
      yield* Effect.forEach(
        Array.from({ length: Research.Tiers.quick.providerCalls - 1 - ResearchInquiry.CLOSE_RESERVE }),
        () => governance.beforeTurn(info),
        { discard: true },
      )
      expect((yield* Effect.flip(tool(info.id, "call_reserved", "inquiry", { action: "status" }))).detail)
        .toContain("only inquiry close remains")
      // A close the check refused is retried inside the reserve, whose turns stay for it.
      yield* tool(info.id, "call_retry", "inquiry", { action: "close" })
      yield* Effect.forEach(Array.from({ length: ResearchInquiry.CLOSE_RESERVE }), () => governance.beforeTurn(info), { discard: true })
      expect(yield* refusal(governance.beforeTurn(info))).toStartWith("Research denied: budget_exhausted:")
    }),
  ))

test("a research child's tool calls are charged and its web search sees only the dispatch's domains", () =>
  run(researchLayer, (directory) =>
    Effect.gen(function* () {
      const governance = yield* TaskGovernance.Service
      const restricted = yield* child(directory, { allowedDomains: ["docs.python.org"] })
      // The first provider turn binds the logical task the allowance is keyed by.
      yield* governance.beforeTurn(restricted)
      expect(yield* tool(restricted.id, "call_0")).toEqual(["docs.python.org"])
      const open = yield* child(directory)
      yield* governance.beforeTurn(open)
      expect(yield* tool(open.id, "call_0")).toBeUndefined()
      yield* Effect.forEach(Array.from({ length: Research.Tiers.quick.toolCalls - 1 }, (_, index) => `call_${index + 1}`), (callID) =>
        tool(open.id, callID), { discard: true })
      const denied = yield* Effect.flip(tool(open.id, "call_last"))
      expect(denied).toBeInstanceOf(ToolSafety.Denied)
      expect(denied.reason).toBe("research-dispatch")
      expect(denied.detail).toStartWith("Research denied: budget_exhausted:")
    }),
  ))

test("a research child with no dispatch runs no tool", () =>
  run(researchLayer, (directory) =>
    Effect.gen(function* () {
      const denied = yield* Effect.flip(tool((yield* child(directory, { bound: false })).id, "call_0"))
      expect(denied.detail).toStartWith("Research denied: binding_missing:")
    }),
  ))
