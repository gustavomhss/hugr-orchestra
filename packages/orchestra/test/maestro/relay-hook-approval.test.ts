import { expect } from "bun:test"
import { DateTime, Effect, Fiber, Layer } from "effect"
import { EventV2 } from "@orchestra/core/event"
import { Global } from "@orchestra/core/global"
import { LocationServiceMap } from "@orchestra/core/location-services"
import { ModelV2 } from "@orchestra/core/model"
import { PermissionV2 } from "@orchestra/core/permission"
import { ProviderV2 } from "@orchestra/core/provider"
import { SessionEvent } from "@orchestra/core/session/event"
import { SessionMessage } from "@orchestra/core/session/message"
import { SessionStore } from "@orchestra/core/session/store"
import { ToolSafety } from "@orchestra/core/tool-safety"
import { ArsenalApproval } from "@/maestro/arsenal-approval"
import { AppRuntime } from "@/effect/app-runtime"
import { InstanceRef } from "@/effect/instance-ref"
import { Permission } from "@/permission"
import { InstanceStore } from "@/project/instance-store"
import { Session } from "@/session/session"
import { tmpdir } from "../fixture/fixture"
import { pollWithTimeout, testEffect } from "../lib/effect"
import { prepareArsenalSDK } from "./arsenal-fixture"

// WP13: a Relay hook's Ask reaches the permission card as `relay_hook` with the hook's own words and no "always". A
// tool call's binds its assistant message and call; a Session event's (`prompt`) binds the Session in its Location.
const it = testEffect(Layer.empty)
const message = "Hook 'Releases' asks for approval: Releases need you."

it.live(
  "hook asks carry relay_hook and the hook's message, V2 and V1; a Session event's ask binds the Session",
  () =>
    Effect.promise(async () => {
      await using tmp = await tmpdir({ git: true, config: { agent: { maestro: { permission: { "*": "allow" } } } } })
      await prepareArsenalSDK(tmp.path, Global.Path.config)
      await AppRuntime.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const instances = yield* InstanceStore.Service
            const instance = yield* instances.load({ directory: tmp.path })
            const sessions = yield* Session.Service
            const session = yield* sessions
              .create({ agent: "maestro" })
              .pipe(Effect.provideService(InstanceRef, instance))
            const projected = yield* (yield* SessionStore.Service).get(session.id)
            if (!projected) throw new Error("Actual Session missing")
            const events = yield* EventV2.Service
            const assistantMessageID = SessionMessage.ID.make("msg_relay_hook")
            yield* events.publish(SessionEvent.Step.Started, {
              sessionID: session.id,
              assistantMessageID,
              agent: "maestro",
              model: ModelV2.Ref.make({ id: ModelV2.ID.make("fixture"), providerID: ProviderV2.ID.make("fixture") }),
              timestamp: yield* DateTime.now,
            })
            yield* events.publish(SessionEvent.Tool.Input.Started, {
              sessionID: session.id,
              assistantMessageID,
              callID: "hooked",
              name: "bash",
              timestamp: yield* DateTime.now,
            })
            yield* events.publish(SessionEvent.Tool.Called, {
              sessionID: session.id,
              assistantMessageID,
              callID: "hooked",
              tool: "bash",
              input: { command: "./release.sh" },
              provider: { executed: false },
              timestamp: yield* DateTime.now,
            })
            const placement = { sessionID: session.id, directory: tmp.path, projectID: session.projectID }
            const locations = yield* LocationServiceMap.Service
            yield* Effect.gen(function* () {
              const host = yield* ArsenalApproval.makeV2ApprovalHost
              const permissions = yield* PermissionV2.Service
              const asked = (find: (request: PermissionV2.Request) => boolean) =>
                pollWithTimeout(permissions.list().pipe(Effect.map((items) => items.find(find))), "Hook ask missing")

              const tool = yield* host
                .ask({
                  action: "relay_hook",
                  resources: ["./release.sh"],
                  message,
                  invocation: {
                    ...placement,
                    tool: "bash",
                    args: { command: "./release.sh" },
                    callID: "hooked",
                    assistantMessageID,
                    agent: "maestro",
                  },
                })
                .pipe(Effect.result, Effect.forkChild)
              const toolAsk = yield* asked((request) => request.source?.callID === "hooked")
              expect(toolAsk).toMatchObject({
                action: "relay_hook",
                resources: ["./release.sh"],
                source: { type: "tool", messageID: assistantMessageID, callID: "hooked" },
                metadata: { nativeSafety: true, action: "relay_hook", callID: "hooked", message },
              })
              expect(toolAsk.save).toBeUndefined()
              yield* permissions.reply({ requestID: toolAsk.id, reply: "once" })
              expect((yield* Fiber.join(tool))._tag).toBe("Success")

              const prompt = yield* host
                .ask({
                  action: "relay_hook",
                  resources: ["prompt"],
                  message,
                  trigger: "prompt.before",
                  invocation: { ...placement, tool: "", args: {}, callID: "" },
                })
                .pipe(Effect.result, Effect.forkChild)
              const promptAsk = yield* asked((request) => request.metadata?.trigger === "prompt.before")
              expect(promptAsk).toMatchObject({
                action: "relay_hook",
                resources: ["prompt"],
                metadata: { nativeSafety: true, action: "relay_hook", trigger: "prompt.before", message },
              })
              expect(promptAsk.source).toBeUndefined()
              yield* permissions.reply({ requestID: promptAsk.id, reply: "reject" })
              expect(yield* Fiber.join(prompt)).toMatchObject({
                _tag: "Failure",
                failure: { reason: "approval-native-rejected" },
              })
              expect(yield* permissions.list()).toEqual([])
            }).pipe(Effect.provide(locations.get(projected.location)))

            // V1: the same words on the card.
            yield* Effect.gen(function* () {
              const host = yield* ArsenalApproval.makeApprovalHost
              const permissions = yield* Permission.Service
              const pending = yield* host
                .ask({
                  action: "relay_hook",
                  resources: ["./release.sh"],
                  message,
                  invocation: { ...placement, tool: "bash", args: { command: "./release.sh" }, callID: "v1-hooked" },
                })
                .pipe(Effect.result, Effect.forkChild)
              const request = yield* pollWithTimeout(
                permissions
                  .list()
                  .pipe(Effect.map((items) => items.find((item) => item.metadata.callID === "v1-hooked"))),
                "V1 hook ask missing",
              )
              expect(request).toMatchObject({
                patterns: ["./release.sh"],
                always: [],
                metadata: { nativeSafety: true, action: "relay_hook", message },
              })
              yield* permissions.reply({ requestID: request.id, reply: "once" })
              expect((yield* Fiber.join(pending))._tag).toBe("Success")
            }).pipe(Effect.provideService(InstanceRef, instance))
          }),
        ),
      )
    }),
  90000,
)
