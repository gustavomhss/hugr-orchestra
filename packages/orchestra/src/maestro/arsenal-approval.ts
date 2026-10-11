export * as ArsenalApproval from "./arsenal-approval"

import { Effect, Layer, Schema } from "effect"
import { ToolSafety } from "@orchestra/core/tool-safety"
import { MaestroArsenal } from "@orchestra/core/tool/maestro-arsenal"
import { PermissionV1 } from "@orchestra/core/v1/permission"
import { Location } from "@orchestra/core/location"
import { LocationMutation } from "@orchestra/core/location-mutation"
import { PermissionV2 } from "@orchestra/core/permission"
import { AgentV2 } from "@orchestra/core/agent"
import { SessionStore } from "@orchestra/core/session/store"
import { SessionSchema } from "@orchestra/core/session/schema"
import { SessionMessage } from "@orchestra/core/session/message"
import { Patch } from "@orchestra/core/patch"
import { InstanceStore } from "@/project/instance-store"
import { Session } from "@/session/session"
import { SessionID } from "@/session/schema"
import { Permission } from "@/permission"

/** V1 wrappers capture their actual V1 permission queue and Instance placement. */
export const makeApprovalHost = Effect.gen(function* () {
  const sessions = yield* Session.Service
  const instances = yield* InstanceStore.Service
  const permission = yield* Permission.Service
  return {
    ask: (request: ToolSafety.Approval) => Effect.gen(function* () {
      const session = yield* sessions.get(SessionID.make(request.invocation.sessionID)).pipe(
        Effect.mapError(() => new ToolSafety.Denied({ reason: "approval-session-missing" })),
      )
      if (request.invocation.projectID !== session.projectID ||
        request.invocation.directory !== session.directory ||
        !request.invocation.callID || !request.resources.length)
        return yield* new ToolSafety.Denied({ reason: "approval-native-placement-mismatch" })
      return yield* instances.provide({ directory: session.directory }, permission.ask({
        permission: `arsenal-safety:${PermissionV1.ID.ascending()}`,
        sessionID: session.id,
        patterns: [...request.resources],
        always: [],
        metadata: {
          nativeSafety: true,
          action: request.action,
          callID: request.invocation.callID,
          projectID: session.projectID,
          ...(request.message === undefined ? {} : { message: request.message }),
        },
        ruleset: [{ permission: "*", pattern: "*", action: "ask" }],
      })).pipe(Effect.mapError(() => new ToolSafety.Denied({ reason: "approval-native-rejected" })))
    }),
  }
})

/** The Location registry and its native permission queue share this captured V2 owner. */
export const makeV2ApprovalHost = Effect.gen(function* () {
  const location = yield* Location.Service
  const sessions = yield* SessionStore.Service
  const permissions = yield* PermissionV2.Service
  const agents = yield* AgentV2.Service
  const mutation = yield* LocationMutation.Service
  return {
    ask: (request: ToolSafety.Approval) => Effect.gen(function* () {
      const sessionID = SessionSchema.ID.make(request.invocation.sessionID)
      const session = yield* sessions.get(sessionID)
      if (!session) return yield* new ToolSafety.Denied({ reason: "approval-session-missing" })
      if (session.projectID !== location.project.id ||
        session.location.directory !== location.directory ||
        session.location.workspaceID !== location.workspaceID ||
        request.invocation.directory !== location.directory ||
        request.invocation.projectID !== location.project.id || !request.resources.length)
        return yield* new ToolSafety.Denied({ reason: "approval-native-placement-mismatch" })
      // A hook's ask is `relay_hook` with the hook's own words for the card; askExplicit offers no "always".
      const hook = request.action === "relay_hook"
      const message = request.message === undefined ? {} : { message: request.message }
      // A Session event's hook (`prompt`) has no tool call to bind: the Session in this Location is the binding.
      if (hook && request.trigger !== undefined)
        return yield* permissions.askExplicit({
          sessionID,
          action: "relay_hook",
          resources: [...request.resources],
          metadata: { nativeSafety: true, action: request.action, trigger: request.trigger, projectID: location.project.id, ...message },
        }).pipe(Effect.mapError((error) => new ToolSafety.Denied({ reason: error instanceof PermissionV2.BlockedError ? "approval-native-policy-denied" : "approval-native-rejected" })))
      if (!request.invocation.callID)
        return yield* new ToolSafety.Denied({ reason: "approval-native-placement-mismatch" })
      if (!request.invocation.assistantMessageID || !request.invocation.agent)
        return yield* new ToolSafety.Denied({ reason: "approval-v2-invocation-identity-missing" })
      const record = yield* sessions.message(SessionMessage.ID.make(request.invocation.assistantMessageID))
      if (!record || record.sessionID !== sessionID || record.message.type !== "assistant" ||
        record.message.agent !== request.invocation.agent)
        return yield* new ToolSafety.Denied({ reason: "approval-v2-assistant-binding-mismatch" })
      const parts = record.message.content.filter((part) => part.type === "tool" && part.id === request.invocation.callID)
      if (parts.length !== 1 || parts[0].type !== "tool" || parts[0].name !== request.invocation.tool ||
        !["pending", "running"].includes(parts[0].state.status))
        return yield* new ToolSafety.Denied({ reason: "approval-v2-call-binding-mismatch" })
      const agent = yield* agents.get(AgentV2.ID.make(record.message.agent))
      if (!agent) return yield* new ToolSafety.Denied({ reason: "approval-native-agent-missing" })
      const file = Schema.decodeUnknownOption(Schema.Struct({ filePath: Schema.optional(Schema.String), patchText: Schema.optional(Schema.String) }))(request.invocation.args)
      const paths = request.invocation.tool === "apply_patch"
        ? yield* Effect.try({ try: () => Patch.parse(file._tag === "Some" ? file.value.patchText ?? "" : "").flatMap((hunk) => hunk.type === "update" && hunk.movePath ? [hunk.path, hunk.movePath] : [hunk.path]), catch: () => new ToolSafety.Denied({ reason: "approval-native-resources-invalid" }) })
        : ["read", "write", "edit", "multiedit"].includes(request.invocation.tool) && file._tag === "Some" && file.value.filePath
          ? [file.value.filePath] : []
      const resources = paths.length ? yield* Effect.forEach(paths, (path) => mutation.resolve({ path, kind: request.invocation.tool === "read" ? "directory" : "file" }).pipe(Effect.map((target) => target.resource), Effect.mapError(() => new ToolSafety.Denied({ reason: "approval-native-resources-invalid" })))) : request.resources
      const action = hook ? "relay_hook" : ["write", "edit", "multiedit", "apply_patch"].includes(request.invocation.tool) ? "edit" : ["bash", "shell"].includes(request.invocation.tool) ? "bash" : request.invocation.tool
      return yield* permissions.askExplicit({
        sessionID,
        agent: agent.id,
        action,
        resources,
        source: { type: "tool", messageID: record.message.id, callID: request.invocation.callID },
        metadata: { nativeSafety: true, action: request.action, callID: request.invocation.callID, projectID: location.project.id, ...message },
      }).pipe(Effect.mapError((error) => new ToolSafety.Denied({ reason: error instanceof PermissionV2.BlockedError ? "approval-native-policy-denied" : "approval-native-rejected" })))
    }),
  }
})

/** Location construction never hoists V1 Session/Instance/Permission ownership into the Core map. */
export const nativeSafetyNode = {
  ...MaestroArsenal.nativeSafetyNode,
  implementation: Layer.unwrap(Effect.gen(function* () {
    const host = yield* makeV2ApprovalHost
    const safety = yield* ToolSafety.make
    return Layer.succeed(ToolSafety.Service, ToolSafety.Service.of({
      ...safety,
      before: (input) => safety.before(MaestroArsenal.nativeInvocation(input)).pipe(
        Effect.provideService(ToolSafety.NativeHost, host),
      ),
      run: (input, effect, observe, outcome) => safety.run(
        MaestroArsenal.nativeInvocation(input), effect, observe, outcome,
      ).pipe(Effect.provideService(ToolSafety.NativeHost, host)),
      session: (input) => safety.session(input).pipe(Effect.provideService(ToolSafety.NativeHost, host)),
    }))
  })),
  dependencies: [...MaestroArsenal.nativeSafetyNode.dependencies, Location.node, SessionStore.node, PermissionV2.node, AgentV2.node, LocationMutation.node],
}

export const nativeRegistryReplacements = MaestroArsenal.nativeRegistryReplacements.map(([source, replacement]) =>
  [source, source.name === ToolSafety.node.name ? nativeSafetyNode : replacement] as const,
)
