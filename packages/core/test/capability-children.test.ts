import { expect } from "bun:test"
import { AgentV2 } from "@orchestra/core/agent"
import { CapabilityVendorSchema } from "@orchestra/core/capability/catalog/schema"
import { CapabilityInvocation } from "@orchestra/core/capability/invocation"
import { CapabilityChildTable } from "@orchestra/core/capability/sql"
import { SessionEvent } from "@orchestra/core/session/event"
import { SessionMessage } from "@orchestra/core/session/message"
import { SessionStore } from "@orchestra/core/session/store"
import { SessionV2 } from "@orchestra/core/session"
import { Tool } from "@orchestra/core/tool/tool"
import { ToolSafety } from "@orchestra/core/tool-safety"
import { ToolOutputStore } from "@orchestra/core/tool-output-store"
import { Global } from "@orchestra/core/global"
import { FSUtil } from "@orchestra/core/fs-util"
import { RelayHookInstall } from "@orchestra/core/relay-hook-install"
import { Capability } from "@orchestra/schema/capability"
import { RelayHook } from "@orchestra/schema/relay-hook"
import { Cause, Deferred, Effect, Exit, Fiber, Ref, Schema } from "effect"
import { eq } from "drizzle-orm"
import { createHash } from "node:crypto"
import { join } from "node:path"
import { CapabilityChildrenFixture } from "./fixture/capability-children"
import { CapabilityPolicyFixture } from "./fixture/capability-policy"
import { testEffect } from "./lib/effect"

const it = testEffect(CapabilityChildrenFixture.layer)
const input = { text: "ok" }

it.live("root API stays direct; detached child settles canonical leaf with stable sibling IDs and bounded parent progress", () =>
  Effect.gen(function* () {
    const f = yield* CapabilityChildrenFixture.fixture
    const observations: unknown[] = []
    const hooks: string[] = []
    const decisions: string[] = []
    yield* f.registry.register({ hook: Tool.make({
      description: "Safety boundary identity", input: Schema.Struct({ text: Schema.String }), output: Schema.String,
      execute: (_, context) => Effect.gen(function* () {
        hooks.push((yield* ToolSafety.HookedCall) ?? "missing")
        yield* f.policy.assert(context, CapabilityPolicyFixture.input)
        return "hooked"
      }).pipe(Effect.mapError((error) => new Tool.Failure({ message: "Child denied", error }))),
    }) })
    const materialization = yield* f.registry.materialize(undefined, { advertisedNames: [] })
    const global = yield* Global.Service
    const fs = yield* FSUtil.Service
    yield* fs.ensureDir(global.data)
    const snapshot = {
      schema: "relay.hook.v1", name: "Child audit", binding: "host-required", installed: false,
      nodes: [
        { id: "event", name: "Tool", type: RelayHook.NodeType.trigger, position: [0, 0],
          parameters: { operation: "tool", timing: "before" } },
        { id: "record", name: "Record", type: RelayHook.NodeType.record, position: [0, 0],
          parameters: { message: "Child observed" } },
      ], connections: [{ from: "event", port: 0, to: "record" }],
    }
    const installed = yield* RelayHookInstall.install({ data: global.data, projectID: f.binding.owner.projectID,
      document: "child-audit", version: "v1", snapshot, principal: "user:test",
      sha256: createHash("sha256").update(JSON.stringify(snapshot)).digest("hex"),
    })
    const unsubscribe = yield* f.events.listen((event) => Effect.sync(() => {
      if (event.type === RelayHook.Decided.type) {
        const data = Schema.decodeUnknownSync(Schema.toType(RelayHook.Decided.data))(event.data)
        if (data.callID) decisions.push(data.callID)
      }
      if (event.type !== SessionEvent.Tool.Progress.type) return
      const data = Schema.decodeUnknownSync(Schema.toType(SessionEvent.Tool.Progress.data))(event.data)
      if (data.callID === f.context.toolCallID) observations.push(data.structured)
    }))
    yield* Effect.addFinalizer(() => unsubscribe)
    yield* f.run()
    yield* CapabilityInvocation.withContext(f.binding, Effect.gen(function* () {
      const root = yield* f.policy.binding(f.context)
      expect(root.lineage).toEqual([])
      expect(root.rootInvocation).toEqual(f.binding.invocation)
      expect(root.rootInvocation).toBe(root.invocation)
      const dispatcher = yield* f.children.dispatcher(f.context, materialization)
      const first = dispatcher.settle("leaf", input)
      const second = dispatcher.settle("leaf", { text: "second" })
      expect((yield* second).result).toEqual({ type: "text", value: "second" })
      expect((yield* first).result).toEqual({ type: "text", value: "ok" })
      expect((yield* dispatcher.settle("hook", input)).result).toEqual({ type: "text", value: "hooked" })
    }).pipe(Effect.provideService(ToolSafety.RuntimeProfile, ToolSafety.withHooks(undefined, [installed.install])),
      Effect.provideService(ToolSafety.HookedCall, f.context.toolCallID)))
    const rows = yield* f.rows()
    expect(rows.map((row) => row.ordinal).sort()).toEqual([1, 2, 3])
    rows.forEach((row) => {
      expect(row.id).toBe("child_" + createHash("sha256").update(JSON.stringify([
        f.context.sessionID, f.context.assistantMessageID, f.context.toolCallID, row.ordinal,
      ])).digest("hex"))
      expect(row.state).toBe("completed")
      expect(row.root_tool_name).toBe("service_call")
    })
    expect(rows.find((row) => row.ordinal === 1)?.request_hash)
      .toBe(CapabilityVendorSchema.hash({ name: "leaf", input: { text: "second" } }))
    expect(hooks).toEqual([CapabilityInvocation.childID(f.binding.invocation, 3)])
    expect(decisions).toEqual([1, 2, 3].map((ordinal) => CapabilityInvocation.childID(f.binding.invocation, ordinal)))
    expect(yield* Ref.get(f.effects)).toBe(3)
    expect((yield* Ref.get(f.seen)).map((context) => context.toolCallID)).toEqual([
      CapabilityInvocation.childID(f.binding.invocation, 1), CapabilityInvocation.childID(f.binding.invocation, 2),
    ])
    expect(observations).toHaveLength(6)
    expect(observations[0]).toEqual({ capabilityChild: {
      callID: rows.find((row) => row.ordinal === 1)?.id, parentCallID: f.context.toolCallID,
      ordinal: 1, toolName: "leaf", state: "running",
    } })
    expect(JSON.stringify(rows)).not.toContain('"text"')
    const sessions = yield* SessionStore.Service
    const stored = yield* sessions.message(f.context.assistantMessageID)
    if (!stored || stored.message.type !== "assistant") return yield* Effect.die("Missing assistant fixture")
    expect(stored.message.content.filter((part) => part.type === "tool").map((part) => part.id)).toEqual([f.context.toolCallID])
  }),
)

it.live("public claims, unissued frames, wrong parent identities and forged proof cannot manufacture children", () =>
  Effect.gen(function* () {
    const f = yield* CapabilityChildrenFixture.fixture
    const proof = CapabilityChildrenFixture.proof(f.binding.invocation)
    const context = { ...f.context, toolCallID: proof.callID }
    const absent = yield* f.policy.binding(context).pipe(Effect.flip)
    expect(absent.code).toBe("invocation_binding_missing")
    expect((yield* CapabilityInvocation.withChildContext(f.context, proof, f.policy.binding(context)).pipe(Effect.flip)).code)
      .toBe("invocation_binding_mismatch")
    const injected = { ...f.binding, lineage: [proof], rootInvocation: f.binding.invocation }
    yield* CapabilityInvocation.withContext(injected,
      Effect.gen(function* () {
        expect((yield* f.policy.binding(f.context)).lineage).toEqual([])
        expect((yield* f.policy.binding(context).pipe(Effect.flip)).code).toBe("invocation_binding_mismatch")
        yield* Effect.forEach([
          { ...proof, parentCallID: "wrong" }, { ...proof, callID: "forged" },
          { ...proof, ordinal: 0 }, { ...proof, ordinal: 65 }, { ...proof, ordinal: 1.5 },
          { ...proof, requestHash: "bad" }, { ...proof, toolName: "leaf\n" },
        ], (supplied) => Effect.gen(function* () {
          const error = yield* CapabilityInvocation.withChildContext(f.context, supplied, Effect.void).pipe(Effect.flip)
          expect(error.code).toBe("invocation_binding_mismatch")
        }))
        yield* Effect.forEach([
          { ...f.context, sessionID: SessionV2.ID.create() }, { ...f.context, agent: AgentV2.ID.make("other") },
          { ...f.context, assistantMessageID: SessionMessage.ID.create() }, { ...f.context, toolCallID: "wrong" },
        ], (parent) => Effect.gen(function* () {
          expect((yield* CapabilityInvocation.withChildContext(parent, proof, Effect.void).pipe(Effect.flip)).code)
            .toBe("invocation_binding_mismatch")
        }))
      }))
  }),
)

it.live("child proof requires exact running persisted row and preserves cloned immutable root lineage", () =>
  Effect.gen(function* () {
    const f = yield* CapabilityChildrenFixture.fixture
    const proof = CapabilityChildrenFixture.proof(f.binding.invocation)
    const context = { ...f.context, toolCallID: proof.callID }
    yield* CapabilityInvocation.withContext(f.binding, Effect.gen(function* () {
      const root = yield* f.policy.binding(f.context)
      const child = (effect: Effect.Effect<void, Capability.Failure>) =>
        CapabilityInvocation.withChildContext(f.context, proof, effect)
      expect((yield* child(f.policy.assert(context, CapabilityPolicyFixture.input)).pipe(Effect.flip)).code)
        .toBe("invocation_binding_mismatch")
      const row = yield* CapabilityChildrenFixture.admit(f, proof)
      yield* CapabilityInvocation.withChildContext(f.context, proof, Effect.gen(function* () {
        const binding = yield* f.policy.binding(context)
        proof.requestHash = "f".repeat(64)
        expect(binding.lineage[0]?.requestHash).toBe(row.request_hash)
        expect(Object.isFrozen(binding.lineage[0])).toBe(true)
        expect(Object.isFrozen(binding.lineage)).toBe(true)
        expect(binding.rootInvocation).toBe(root.rootInvocation)
        expect(binding.owner).toBe(root.owner)
        expect(binding.effectiveRules).toBe(root.effectiveRules)
        expect(binding.nativeDenyFloor).toBe(root.nativeDenyFloor)
        expect(binding.rootToolName).toBe("service_call")
        yield* f.policy.assert(context, CapabilityPolicyFixture.input)
        const mutations: Partial<typeof row>[] = [
          { session_id: (yield* CapabilityPolicyFixture.fixture()).context.sessionID },
          { agent_id: AgentV2.ID.make("other") }, { assistant_message_id: "other" }, { root_call_id: "other" },
          { root_tool_name: "other" }, { parent_call_id: "other" }, { ordinal: 2 }, { depth: 2 },
          { tool_name: "other" }, { request_hash: "0".repeat(64) }, { state: "completed" },
          { state: "failed" }, { state: "interrupted" },
        ]
        yield* Effect.forEach(mutations, (mutation) => Effect.gen(function* () {
          yield* f.database.db.update(CapabilityChildTable).set(mutation).where(eq(CapabilityChildTable.id, row.id)).run()
          expect((yield* f.policy.binding(context).pipe(Effect.flip)).code).toBe("invocation_binding_mismatch")
          yield* f.database.db.update(CapabilityChildTable).set(row).where(eq(CapabilityChildTable.id, row.id)).run()
        }))
        yield* f.database.db.delete(CapabilityChildTable).where(eq(CapabilityChildTable.id, row.id)).run()
        expect((yield* f.policy.binding(context).pipe(Effect.flip)).code).toBe("invocation_binding_mismatch")
      }))
    }))
  }),
)

it.live("child leaf authorization cannot inherit parent allow over child deny", () => Effect.gen(function* () {
  const f = yield* CapabilityChildrenFixture.fixture
  yield* CapabilityInvocation.withContext({ ...f.binding, effectiveRules: [
    { action: "service_call", resource: "*", effect: "allow" }, ...CapabilityPolicyFixture.deny,
  ] }, Effect.gen(function* () {
    const dispatcher = yield* f.children.dispatcher(f.context, f.materialization)
    expect((yield* dispatcher.settle("leaf", input)).result).toEqual({ type: "error", value: "Child denied" })
  }))
  expect(yield* Ref.get(f.effects)).toBe(0)
  expect((yield* f.rows()).map((row) => row.state)).toEqual(["failed"])
  const floor = yield* CapabilityChildrenFixture.fixture
  yield* CapabilityInvocation.withContext({ ...floor.binding, nativeDenyFloor: [
    ...CapabilityPolicyFixture.deny, ...CapabilityPolicyFixture.allow,
  ] }, Effect.gen(function* () {
    const dispatcher = yield* floor.children.dispatcher(floor.context, floor.materialization)
    expect((yield* dispatcher.settle("leaf", input)).result).toEqual({ type: "error", value: "Child denied" })
  }))
  expect(yield* Ref.get(floor.effects)).toBe(0)
  expect((yield* floor.rows()).map((row) => row.state)).toEqual(["failed"])
}))

it.live("missing and completed persisted roots deny child admission before dispatch", () => Effect.gen(function* () {
  const f = yield* CapabilityChildrenFixture.fixture
  yield* CapabilityInvocation.withContext(f.binding, Effect.gen(function* () {
    const dispatcher = yield* f.children.dispatcher(f.context, f.materialization)
    yield* endRoot(f)
    expect(yield* dispatcher.settle("leaf", input).pipe(Effect.flip)).toMatchObject({ code: "invocation_binding_mismatch" })
  }))
  expect(yield* Ref.get(f.effects)).toBe(0)
  expect(yield* f.rows()).toEqual([])
  const missing = yield* CapabilityPolicyFixture.fixture({ part: false })
  expect((yield* CapabilityInvocation.withContext(missing.binding,
    f.children.dispatcher(missing.context, f.materialization)).pipe(Effect.flip)).code).toBe("invocation_binding_mismatch")
}))

it.live("unsupported names, detached invalid JSON and ambient SQL transaction reject before admission", () => Effect.gen(function* () {
  const f = yield* CapabilityChildrenFixture.fixture
  yield* CapabilityInvocation.withContext(f.binding, Effect.gen(function* () {
    const dispatcher = yield* f.children.dispatcher(f.context, f.materialization)
    expect(yield* dispatcher.settle("missing", input).pipe(Effect.flip)).toMatchObject({ code: "stale_descriptor" })
    const filtered = yield* f.registry.materialize([{ action: "leaf", resource: "*", effect: "deny" }])
    const restricted = yield* f.children.dispatcher(f.context, filtered)
    expect(yield* restricted.settle("leaf", input).pipe(Effect.flip)).toMatchObject({ code: "stale_descriptor" })
    expect(yield* dispatcher.settle("leaf\n", input).pipe(Effect.flip)).toMatchObject({ code: "unsupported_operation" })
    expect(yield* dispatcher.settle("leaf", { text: "x".repeat(262145) }).pipe(Effect.flip)).toMatchObject({ code: "unsupported_schema" })
    expect(yield* dispatcher.settle("leaf", { value: NaN }).pipe(Effect.flip)).toMatchObject({ code: "unsupported_schema" })
    expect(yield* f.database.db.transaction(() => dispatcher.settle("leaf", input)).pipe(Effect.flip))
      .toMatchObject({ code: "invocation_binding_mismatch" })
  }))
  expect(yield* f.rows()).toEqual([])
  expect(yield* Ref.get(f.effects)).toBe(0)
}))

it.live("same parent replay never redispatches; changed request conflicts; captured registration replacement stays stale", () =>
  Effect.gen(function* () {
    const f = yield* CapabilityChildrenFixture.fixture
    yield* CapabilityInvocation.withContext(f.binding, Effect.gen(function* () {
      const first = yield* f.children.dispatcher(f.context, f.materialization)
      yield* first.settle("leaf", input)
      const retry = yield* f.children.dispatcher(f.context, f.materialization)
      expect(yield* retry.settle("leaf", input).pipe(Effect.flip)).toMatchObject({ code: "outcome_unknown" })
      const conflict = yield* f.children.dispatcher(f.context, f.materialization)
      expect(yield* conflict.settle("leaf", { text: "different" }).pipe(Effect.flip))
        .toMatchObject({ code: "invocation_binding_mismatch" })
      yield* f.registry.register({ leaf: Tool.make({ description: "Replacement", input: Schema.Json, output: Schema.String,
        execute: () => f.target.pipe(Effect.as("replacement")),
      }) })
      expect((yield* first.settle("leaf", input)).result).toEqual({ type: "error", value: "Stale tool call: leaf" })
    }))
    expect(yield* Ref.get(f.effects)).toBe(1)
    expect((yield* f.rows()).map((row) => row.state).sort()).toEqual(["completed", "failed"])
  }),
)

it.live("every preexisting child lifecycle refuses replay and forged parent ordinal cannot steal admission", () => Effect.gen(function* () {
  const f = yield* CapabilityChildrenFixture.fixture
  const proof = CapabilityChildrenFixture.proof(f.binding.invocation)
  yield* CapabilityChildrenFixture.admit(f, proof)
  yield* CapabilityInvocation.withContext(f.binding, Effect.gen(function* () {
    yield* Effect.forEach(["running", "completed", "failed", "interrupted"] as const, (state) => Effect.gen(function* () {
      yield* f.database.db.update(CapabilityChildTable).set({ state }).where(eq(CapabilityChildTable.id, proof.callID)).run()
      const dispatcher = yield* f.children.dispatcher(f.context, f.materialization)
      expect(yield* dispatcher.settle("leaf", input).pipe(Effect.flip)).toMatchObject({ code: "outcome_unknown" })
      expect((yield* f.rows()).map((row) => row.state)).toEqual([state])
    }))
    yield* f.database.db.update(CapabilityChildTable).set({ id: "forged" }).where(eq(CapabilityChildTable.id, proof.callID)).run()
    const dispatcher = yield* f.children.dispatcher(f.context, f.materialization)
    expect(yield* dispatcher.settle("leaf", input).pipe(Effect.flip)).toMatchObject({ code: "invocation_binding_mismatch" })
  }))
  expect(yield* Ref.get(f.effects)).toBe(0)
}))

it.live("interruption records interrupted and leaf defect stays defect with failed SQL fact", () => Effect.gen(function* () {
  const f = yield* CapabilityChildrenFixture.fixture
  const entered = yield* Deferred.make<void>()
  const defect = new Error("leaf defect sentinel")
  yield* f.registry.register({
    wait: Tool.make({ description: "Interruptible child", input: Schema.Json, output: Schema.String,
      execute: () => Deferred.succeed(entered, undefined).pipe(Effect.andThen(Effect.never)),
    }),
    defect: Tool.make({ description: "Defect child", input: Schema.Json, output: Schema.String,
      execute: () => Effect.die(defect),
    }),
  })
  const materialization = yield* f.registry.materialize()
  yield* CapabilityInvocation.withContext(f.binding, Effect.gen(function* () {
    const dispatcher = yield* f.children.dispatcher(f.context, materialization)
    const fiber = yield* dispatcher.settle("wait", {}).pipe(Effect.forkChild)
    yield* Deferred.await(entered)
    yield* Fiber.interrupt(fiber)
    const interrupted = yield* Fiber.await(fiber)
    expect(Exit.isFailure(interrupted) && Cause.hasInterrupts(interrupted.cause)).toBe(true)
    const failed = yield* dispatcher.settle("defect", {}).pipe(Effect.exit)
    expect(Exit.isFailure(failed)).toBe(true)
    if (Exit.isFailure(failed)) expect(failed.cause.reasons.some((reason) => reason._tag === "Die" && reason.defect === defect)).toBe(true)
  }))
  expect((yield* f.rows()).map((row) => row.state).sort()).toEqual(["failed", "interrupted"])
}).pipe(Effect.timeout("5 seconds")))

it.live("child approval waits use child identity and recheck completed root or current revoke before side effect", () =>
  Effect.gen(function* () {
    yield* Effect.forEach(["allow", "root", "revoke"] as const, (change) => Effect.gen(function* () {
      const f = yield* CapabilityChildrenFixture.fixture
      yield* CapabilityInvocation.withContext({ ...f.binding, effectiveRules: [] }, Effect.gen(function* () {
        const dispatcher = yield* f.children.dispatcher(f.context, f.materialization)
        const child = { ...f.context, toolCallID: CapabilityInvocation.childID(f.binding.invocation, 1) }
        const observation = yield* CapabilityPolicyFixture.observeAsked(child)
        const fiber = yield* dispatcher.settle("leaf", input).pipe(Effect.forkChild)
        const request = yield* Effect.raceFirst(Deferred.await(observation.first), Fiber.join(fiber).pipe(
          Effect.andThen(Effect.die("CHILD_BYPASSED_APPROVAL")),
        ))
        expect(request.source).toEqual({ type: "tool", messageID: child.assistantMessageID, callID: child.toolCallID })
        expect((yield* f.rows()).map((row) => row.state)).toEqual(["running"])
        expect(yield* Ref.get(f.effects)).toBe(0)
        if (change === "root") yield* endRoot(f)
        if (change === "revoke") yield* CapabilityPolicyFixture.setRules(CapabilityPolicyFixture.deny)
        yield* f.permissions.reply({ requestID: request.id, reply: "once" })
        expect((yield* Fiber.join(fiber)).result.type).toBe(change === "allow" ? "text" : "error")
        expect(yield* Ref.get(f.effects)).toBe(change === "allow" ? 1 : 0)
        expect((yield* f.rows()).map((row) => row.state)).toEqual([change === "allow" ? "completed" : "failed"])
        expect(yield* f.permissions.list()).toEqual([])
      }))
    }))
  }).pipe(Effect.timeout("10 seconds")),
)

it.live("child permits retain exact frame and commit rejects root completion, revoke and settled child after leaf wait", () =>
  Effect.gen(function* () {
    yield* Effect.forEach(["allow", "root", "revoke", "child"] as const, (change) => Effect.gen(function* () {
      const f = yield* CapabilityChildrenFixture.fixture
      const authorized = yield* Deferred.make<void>()
      const release = yield* Deferred.make<void>()
      yield* f.registry.register({ commit: Tool.make({ description: "Wait before commit", input: Schema.Json, output: Schema.String,
        execute: (_, context) => Effect.gen(function* () {
          const permit = yield* f.policy.authorize(context, CapabilityPolicyFixture.input)
          expect(yield* f.policy.commit({ ...permit }, () => f.target).pipe(Effect.flip))
            .toMatchObject({ code: "invocation_binding_mismatch" })
          yield* Deferred.succeed(authorized, undefined)
          yield* Deferred.await(release)
          yield* f.policy.commit(permit, () => f.target)
          return "committed"
        }).pipe(Effect.mapError((error) => new Tool.Failure({ message: "Child denied", error }))),
      }) })
      const materialization = yield* f.registry.materialize()
      yield* CapabilityInvocation.withContext(f.binding, Effect.gen(function* () {
        const dispatcher = yield* f.children.dispatcher(f.context, materialization)
        const fiber = yield* dispatcher.settle("commit", {}).pipe(Effect.forkChild)
        yield* Deferred.await(authorized)
        if (change === "root") yield* endRoot(f)
        if (change === "revoke") yield* CapabilityPolicyFixture.setRules(CapabilityPolicyFixture.deny)
        if (change === "child") yield* f.database.db.update(CapabilityChildTable).set({ state: "completed" })
          .where(eq(CapabilityChildTable.id, CapabilityInvocation.childID(f.binding.invocation, 1))).run()
        yield* Deferred.succeed(release, undefined)
        const exit = yield* Fiber.await(fiber)
        if (change === "child") {
          expect(Exit.isFailure(exit)).toBe(true)
          if (Exit.isFailure(exit)) expect(exit.cause.reasons.some((reason) =>
            reason._tag === "Fail" && reason.error instanceof Capability.Failure && reason.error.code === "outcome_unknown"))
            .toBe(true)
          expect((yield* f.rows()).map((row) => row.state)).toEqual(["completed"])
        }
        if (change !== "child") {
          expect(Exit.isSuccess(exit)).toBe(true)
          if (Exit.isSuccess(exit)) expect(exit.value.result.type).toBe(change === "allow" ? "text" : "error")
          expect((yield* f.rows()).map((row) => row.state)).toEqual([change === "allow" ? "completed" : "failed"])
        }
      }))
      expect(yield* Ref.get(f.effects)).toBe(change === "allow" ? 1 : 0)
    }))
  }).pipe(Effect.timeout("10 seconds")),
)

it.live("nested canonical settlement retains original root, contiguous lineage and depth-eight bound", () => Effect.gen(function* () {
  yield* Effect.forEach([7, 8], (remaining) => Effect.gen(function* () {
    const f = yield* CapabilityChildrenFixture.fixture
    const depths: number[] = []
    yield* f.registry.register({ nest: Tool.make({
      description: "Nested trusted host", input: Schema.Struct({ remaining: Schema.Number }), output: Schema.String,
      execute: (input, context) => Effect.gen(function* () {
        const binding = yield* f.policy.binding(context)
        expect(binding.rootToolName).toBe("service_call")
        expect(binding.rootInvocation).toEqual(f.binding.invocation)
        depths.push(binding.lineage.length)
        yield* f.policy.assert(context, CapabilityPolicyFixture.input)
        if (input.remaining === 0) return "nested"
        const materialization = yield* f.registry.materialize()
        const dispatcher = yield* f.children.dispatcher(context, materialization)
        const settled = yield* dispatcher.settle("nest", { remaining: input.remaining - 1 })
        if (settled.result.type === "error") return yield* new Tool.Failure({ message: "Nested child failed" })
        return "nested"
      }).pipe(Effect.mapError((error) => error instanceof Tool.Failure ? error : new Tool.Failure({ message: "Nested denied", error }))),
    }) })
    const materialization = yield* f.registry.materialize()
    yield* CapabilityInvocation.withContext(f.binding, Effect.gen(function* () {
      const dispatcher = yield* f.children.dispatcher(f.context, materialization)
      expect((yield* dispatcher.settle("nest", { remaining })).result.type).toBe(remaining === 7 ? "text" : "error")
    }))
    expect(depths).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    const rows = (yield* f.rows()).sort((a, b) => a.depth - b.depth)
    expect(rows).toHaveLength(8)
    rows.forEach((row, index) => {
      expect(row.depth).toBe(index + 1)
      expect(row.parent_call_id).toBe(index === 0 ? f.context.toolCallID : rows[index - 1]?.id)
      expect(row.root_call_id).toBe(f.context.toolCallID)
      expect(row.root_tool_name).toBe("service_call")
      expect(row.state).toBe(remaining === 7 ? "completed" : "failed")
    })
  }))
}).pipe(Effect.timeout("10 seconds")), 15000)

it.live("nested authorization and commit reject missing or settled ancestor while current child still running", () =>
  Effect.gen(function* () {
    const f = yield* CapabilityChildrenFixture.fixture
    const parentProof = CapabilityChildrenFixture.proof(f.binding.invocation)
    const parent = { ...f.context, toolCallID: parentProof.callID }
    const childProof = CapabilityChildrenFixture.proof({ ...f.binding.invocation, callID: parentProof.callID })
    const child = { ...f.context, toolCallID: childProof.callID }
    const parentRow = yield* CapabilityChildrenFixture.admit(f, parentProof)
    yield* CapabilityChildrenFixture.admit(f, childProof, 2)
    yield* CapabilityInvocation.withContext(f.binding, CapabilityInvocation.withChildContext(f.context, parentProof,
      CapabilityInvocation.withChildContext(parent, childProof, Effect.gen(function* () {
        const permit = yield* f.policy.authorize(child, CapabilityPolicyFixture.input)
        yield* f.policy.commit(permit, () => f.target)
        yield* f.database.db.update(CapabilityChildTable).set({ state: "completed" })
          .where(eq(CapabilityChildTable.id, parentRow.id)).run()
        expect(yield* f.policy.authorize(child, CapabilityPolicyFixture.input).pipe(Effect.flip))
          .toMatchObject({ code: "invocation_binding_mismatch" })
        expect(yield* f.policy.commit(permit, () => f.target).pipe(Effect.flip))
          .toMatchObject({ code: "invocation_binding_mismatch" })
        yield* f.database.db.delete(CapabilityChildTable).where(eq(CapabilityChildTable.id, parentRow.id)).run()
        expect(yield* f.policy.binding(child).pipe(Effect.flip)).toMatchObject({ code: "invocation_binding_mismatch" })
      }))))
    expect(yield* Ref.get(f.effects)).toBe(1)
    expect((yield* f.rows()).map((row) => row.state)).toEqual(["running"])
  }),
)

it.live("dispatcher snapshots parent context and full input before admission wait; rejects same claims from new frame", () =>
  Effect.gen(function* () {
    const f = yield* CapabilityChildrenFixture.fixture
    const agents = yield* AgentV2.Service
    const locked = yield* Deferred.make<void>()
    const release = yield* Deferred.make<void>()
    const entered = yield* Deferred.make<void>()
    yield* f.registry.register({ snap: Tool.make({ description: "Detached input", input: Schema.Struct({ text: Schema.String }), output: Schema.String,
      execute: (input, context) => f.policy.assert(context, CapabilityPolicyFixture.input).pipe(Effect.as(input.text),
        Effect.mapError((error) => new Tool.Failure({ message: "Child denied", error }))),
    }) })
    const materialization = yield* f.registry.materialize()
    yield* CapabilityInvocation.withContext(f.binding, Effect.gen(function* () {
      const context = { ...f.context }
      const dispatcher = yield* f.children.dispatcher(context, materialization)
      context.toolCallID = "mutated-parent"
      const lock = yield* agents.withPermissions(f.context.agent, () => Effect.gen(function* () {
        yield* Deferred.succeed(locked, undefined)
        yield* Deferred.await(release)
      })).pipe(Effect.forkChild)
      yield* Deferred.await(locked)
      const value = { text: "detached" }
      // Signal the actual bounded snapshot read, not effect construction or a timing sleep.
      const request = { get text() {
        const text = value.text
        Deferred.doneUnsafe(entered, Effect.void)
        return text
      } }
      const fiber = yield* dispatcher.settle("snap", request).pipe(Effect.forkChild)
      yield* Deferred.await(entered)
      value.text = "mutated"
      yield* Deferred.succeed(release, undefined)
      yield* Fiber.join(lock)
      expect((yield* Fiber.join(fiber)).result).toEqual({ type: "text", value: "detached" })
      const row = (yield* f.rows())[0]
      expect(row?.parent_call_id).toBe(f.context.toolCallID)
      expect(row?.request_hash).toBe(CapabilityVendorSchema.hash({ name: "snap", input: { text: "detached" } }))
      expect(yield* CapabilityInvocation.withContext(f.binding, dispatcher.settle("snap", input)).pipe(Effect.flip))
        .toMatchObject({ code: "invocation_binding_mismatch" })
    }))
  }).pipe(Effect.timeout("5 seconds")),
)

it.live("durable outcomes survive ended root; missing or replaced terminal row cannot return success or hide defect", () =>
  Effect.gen(function* () {
    yield* Effect.forEach(["root", "missing", "replacement", "defect"] as const, (change) => Effect.gen(function* () {
      const f = yield* CapabilityChildrenFixture.fixture
      const defect = new Error("terminal defect sentinel")
      yield* f.registry.register({ terminal: Tool.make({ description: "Outcome facts", input: Schema.Json, output: Schema.String,
        execute: (_, context) => Effect.gen(function* () {
          yield* f.policy.assert(context, CapabilityPolicyFixture.input)
          if (change === "root") yield* endRoot(f)
          if (change === "missing" || change === "defect") yield* f.database.db.delete(CapabilityChildTable)
            .where(eq(CapabilityChildTable.id, context.toolCallID)).run()
          if (change === "replacement") yield* f.database.db.update(CapabilityChildTable).set({ request_hash: "f".repeat(64) })
            .where(eq(CapabilityChildTable.id, context.toolCallID)).run()
          if (change === "defect") return yield* Effect.die(defect)
          return "acquired"
        }).pipe(Effect.mapError((error) => new Tool.Failure({ message: "Child denied", error }))),
      }) })
      const materialization = yield* f.registry.materialize()
      yield* CapabilityInvocation.withContext(f.binding, Effect.gen(function* () {
        const dispatcher = yield* f.children.dispatcher(f.context, materialization)
        const exit = yield* dispatcher.settle("terminal", {}).pipe(Effect.exit)
        expect(Exit.isSuccess(exit)).toBe(change === "root")
        if (Exit.isFailure(exit)) {
          expect(exit.cause.reasons.some((reason) => reason._tag === "Fail" && reason.error instanceof Capability.Failure &&
            reason.error.code === "outcome_unknown")).toBe(true)
          if (change === "defect") expect(exit.cause.reasons.some((reason) => reason._tag === "Die" && reason.defect === defect)).toBe(true)
        }
      }))
      expect((yield* f.rows()).map((row) => row.state)).toEqual(change === "root" ? ["completed"] :
        change === "replacement" ? ["running"] : [])
    }))
  }),
)

it.live("host child ordinal budget permits sixty-four executions and refuses sixty-fifth", () => Effect.gen(function* () {
  const f = yield* CapabilityChildrenFixture.fixture
  yield* CapabilityInvocation.withContext(f.binding, Effect.gen(function* () {
    const dispatcher = yield* f.children.dispatcher(f.context, f.materialization)
    yield* Effect.forEach(Array.from({ length: 64 }), () => dispatcher.settle("leaf", input))
    expect(yield* dispatcher.settle("leaf", input).pipe(Effect.flip)).toMatchObject({ code: "quota_exceeded" })
  }))
  expect(yield* Ref.get(f.effects)).toBe(64)
  expect((yield* f.rows()).map((row) => row.ordinal).sort((a, b) => a - b)).toEqual(Array.from({ length: 64 }, (_, i) => i + 1))
}).pipe(Effect.timeout("10 seconds")), 15000)

it.live("canonical output storage failure stays typed and records failed durable child", () => Effect.gen(function* () {
  const f = yield* CapabilityChildrenFixture.fixture
  const global = yield* Global.Service
  const fs = yield* FSUtil.Service
  yield* fs.ensureDir(global.data)
  yield* fs.writeFileString(join(global.data, ToolOutputStore.MANAGED_DIRECTORY), "not a directory")
  yield* f.registry.register({ overflow: Tool.make({
    description: "Real bounded storage failure", input: Schema.Json, output: Schema.String,
    execute: () => Effect.succeed("ordinary\n".repeat(10000)),
  }) })
  const materialization = yield* f.registry.materialize()
  yield* CapabilityInvocation.withContext(f.binding, Effect.gen(function* () {
    const dispatcher = yield* f.children.dispatcher(f.context, materialization)
    const failure = yield* dispatcher.settle("overflow", {}).pipe(Effect.flip)
    expect(failure).toBeInstanceOf(ToolOutputStore.StorageError)
  }))
  expect((yield* f.rows()).map((row) => row.state)).toEqual(["failed"])
}))

function endRoot(f: Effect.Success<typeof CapabilityChildrenFixture.fixture>) {
  return f.events.publish(SessionEvent.Tool.Success, {
    sessionID: f.context.sessionID, assistantMessageID: f.context.assistantMessageID, callID: f.context.toolCallID,
    timestamp: CapabilityPolicyFixture.timestamp, structured: {}, content: [], provider: { executed: false },
  })
}
