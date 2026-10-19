import { expect } from "bun:test"
import { Effect, Fiber, Layer } from "effect"
import { ToolSafety } from "@orchestra/core/tool-safety"
import { Global } from "@orchestra/core/global"
import { ArsenalBindings } from "@/maestro/arsenal-bindings"
import { AppRuntime } from "@/effect/app-runtime"
import { InstanceStore } from "@/project/instance-store"
import { InstanceRef } from "@/effect/instance-ref"
import { Session } from "@/session/session"
import { Permission } from "@/permission"
import { Agent } from "@/agent/agent"
import { tmpdir } from "../fixture/fixture"
import { testEffect, pollWithTimeout } from "../lib/effect"
import { prepareArsenalSDK } from "./arsenal-fixture"

const it = testEffect(Layer.empty)

it.live("askBefore awaits actual native permission reply despite automatic allow; reject and unbound host HOLD", () =>
  Effect.promise(async () => {
    await using tmp = await tmpdir({ git: true, config: { agent: { maestro: { permission: { "*": "allow" } } } } })
    await prepareArsenalSDK(tmp.path, Global.Path.config)
    await AppRuntime.runPromise(Effect.scoped(Effect.gen(function* () {
      const instances = yield* InstanceStore.Service
      const instance = yield* instances.load({ directory: tmp.path })
      yield* Effect.gen(function* () {
        const sessions = yield* Session.Service
        const session = yield* sessions.create({ agent: "maestro" })
        const agents = yield* Agent.Service
        const actor = yield* agents.get("maestro")
        expect(Permission.evaluate("bash", "git push origin fixture", actor.permission).action).toBe("allow")
        const permissions = yield* Permission.Service
        const host = yield* ArsenalBindings.makeApprovalHost
        const safety = yield* ToolSafety.make
        const invocation = { tool: "bash", args: { command: "git push origin fixture" }, sessionID: session.id, callID: "explicit-intent", directory: tmp.path, projectID: session.projectID }
        const profile = { askBefore: ["push"] }
        const unbound = yield* safety.before(invocation).pipe(Effect.provideService(ToolSafety.RuntimeProfile, profile), Effect.result)
        expect(unbound).toMatchObject({ _tag: "Failure", failure: { reason: "ask-before-native-binding-missing" } })
        const effects: string[] = []
        const decisions = ["once", "reject"] as const
        yield* Effect.forEach(decisions, (reply) => Effect.gen(function* () {
          const pending = yield* safety.before(invocation).pipe(
            Effect.andThen(Effect.sync(() => effects.push(reply))),
            Effect.provideService(ToolSafety.RuntimeProfile, profile),
            Effect.provideService(ToolSafety.NativeHost, host),
            Effect.result,
            Effect.forkChild,
          )
          const asked = yield* pollWithTimeout(permissions.list().pipe(Effect.map((items) => items.find((item) => item.metadata.nativeSafety === true))), "Actual native safety request missing")
          expect(asked).toMatchObject({ sessionID: session.id, patterns: ["git push origin fixture"], metadata: { action: "push", callID: invocation.callID, projectID: session.projectID } })
          expect(effects).toEqual(reply === "once" ? [] : ["once"])
          yield* permissions.reply({ requestID: asked.id, reply })
          const result = yield* Fiber.join(pending)
          expect(result._tag).toBe(reply === "once" ? "Success" : "Failure")
          if (reply === "reject") expect(result).toMatchObject({ failure: { reason: "approval-native-rejected" } })
        }))
        expect(effects).toEqual(["once"])
        expect(yield* permissions.list()).toEqual([])
      }).pipe(Effect.provideService(InstanceRef, instance))
    })))
  }), 90000)
