export * as ToolRegistry from "./registry"

import { ToolFailure, ToolOutput, type ToolCall, type ToolDefinition, type ToolResultValue } from "@orchestra/llm"
import { Cause, Context, DateTime, Effect, Exit, Layer, Option, Scope } from "effect"
import { SessionEvent } from "@orchestra/schema/session-event"
import { AgentV2 } from "../agent"
import { PermissionV2 } from "../permission"
import { SessionMessage } from "../session/message"
import { SessionSchema } from "../session/schema"
import { ToolOutputStore } from "../tool-output-store"
import { Wildcard } from "../util/wildcard"
import { ApplicationTools } from "./application-tools"
import { definition, permission, settle, validateName, type AnyTool, type RegistrationError } from "./tool"
import { Tools } from "./tools"
import { makeLocationNode } from "../effect/app-node"
import { ToolSafety } from "../tool-safety"
import { Location } from "../location"
import { EventV2 } from "../event"
import { ToolSafetyOutput } from "../tool-safety-output"

export type ExecuteInput = {
  readonly sessionID: SessionSchema.ID
  readonly agent: AgentV2.ID
  readonly assistantMessageID: SessionMessage.ID
  readonly call: ToolCall
}

export interface Interface {
  /** Host-only current effective registration token; synchronous metadata, never authorization. */
  readonly currentRegistrationIdentity: (name: string) => object | undefined
  readonly materialize: (
    permissions?: PermissionV2.Ruleset,
    options?: { readonly advertisedNames?: readonly string[] },
  ) => Effect.Effect<Materialization>
  /** Internal registration capability exposed publicly only through Tools.Service. */
  readonly register: (tools: Readonly<Record<string, AnyTool>>) => Effect.Effect<void, RegistrationError, Scope.Scope>
  /** Installed hooks on a Session event of this Location, over the profile its tool calls load. */
  readonly session: (
    input: Pick<ToolSafety.SessionEvent, "operation" | "sessionID" | "agent" | "text">,
  ) => Effect.Effect<void, ToolSafety.Denied>
}

export interface Materialization {
  readonly definitions: ReadonlyArray<ToolDefinition>
  /** Captured eligible metadata, including unadvertised tools; not execution authorization. */
  readonly definition: (name: string) => ToolDefinition | undefined
  /** Host-only captured registration token, including unadvertised eligible tools.
   * Metadata, not authorization or a current-liveness query. Callers must compare against
   * the authoritative current materialization and generations.
   */
  readonly registrationIdentity: (name: string) => object | undefined
  readonly settle: (input: ExecuteInput) => Effect.Effect<Settlement, ToolOutputStore.Error>
}

export interface Settlement {
  readonly result: ToolResultValue
  readonly output?: ToolOutput
  readonly outputPaths?: ReadonlyArray<string>
}

export class Service extends Context.Service<Service, Interface>()("@orchestra/v2/ToolRegistry") {}

const CapturedMaterialization = Context.Reference<Materialization | undefined>("@orchestra/ToolRegistry/CapturedMaterialization", {
  defaultValue: () => undefined,
})

/** Host-only issuing snapshot, available inside canonical settlement. Metadata is never an execution grant. */
export const captured = Effect.gen(function* () { return yield* CapturedMaterialization })

const NativeBinding = Context.Reference<{
  location: Location.Interface
  events: EventV2.Interface
} | undefined>("@orchestra/ToolRegistry/NativeSafetyBinding", { defaultValue: () => undefined })

const registryLayer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const applications = yield* ApplicationTools.Service
    const resources = yield* ToolOutputStore.Service
    const safety = yield* ToolSafety.Service
    const native = yield* NativeBinding
    const capturedProfile = yield* ToolSafety.RuntimeProfile
    const profileLoader = yield* ToolSafety.RuntimeProfileLoader
    type Registration = { readonly identity: object; readonly tool: AnyTool }
    const local = new Map<string, Array<{ readonly token: object; readonly registration: Registration }>>()
    const fatalToolCause = (cause: Cause.Cause<ToolFailure>) => Effect.failCause(Cause.fromReasons<never>(
      cause.reasons.flatMap((reason) => reason._tag === "Fail"
        ? Cause.die(reason.error).reasons.map((next) => next.annotate(Context.makeUnsafe(new Map(reason.annotations)))) : [reason]),
    ))

    const settleWith = Effect.fn("ToolRegistry.settle")(function* (input: ExecuteInput, advertised?: object) {
      const registration =
        local.get(input.call.name)?.at(-1)?.registration ?? applications.entries().get(input.call.name)
      if (!registration)
        return {
          result: {
            type: "error" as const,
            value: advertised ? `Stale tool call: ${input.call.name}` : `Unknown tool: ${input.call.name}`,
          },
        }
      if (advertised && registration.identity !== advertised)
        return { result: { type: "error" as const, value: `Stale tool call: ${input.call.name}` } }
      const location = native?.location ?? Option.getOrUndefined(yield* Effect.serviceOption(Location.Service))
      const events = native?.events ?? Option.getOrUndefined(yield* Effect.serviceOption(EventV2.Service))
      const effectiveProfile = capturedProfile ?? (yield* ToolSafety.RuntimeProfile)
      const effectiveLoader = profileLoader ?? (yield* ToolSafety.RuntimeProfileLoader)
      if ((capturedProfile || profileLoader) && (!location || !events))
        return { result: { type: "error" as const, value: "Tool safety HOLD: native-placement-or-events-missing" } }
      const invocation = {
        tool: input.call.name,
        args: input.call.input,
        sessionID: input.sessionID,
        callID: input.call.id,
        assistantMessageID: input.assistantMessageID,
        agent: input.agent,
        directory: location?.directory,
        projectID: location?.project.id,
        projectDirectory: location?.project.directory === "/" ? location.directory : location?.project.directory,
      }
      return yield* safety.run(
        invocation,
        Effect.gen(function* () {
          const attempted = yield* settle(registration.tool, input.call, {
            sessionID: input.sessionID,
            agent: input.agent,
            assistantMessageID: input.assistantMessageID,
            toolCallID: input.call.id,
          }).pipe(Effect.exit)
          if (Exit.isFailure(attempted)) {
            // A declared tool failure may be projected; a mixed Cause must retain its defects/interruption.
            if (!attempted.cause.reasons.every((reason) => reason._tag === "Fail" && reason.error instanceof ToolFailure))
              return yield* fatalToolCause(attempted.cause)
            const reason = attempted.cause.reasons[0]
            if (!reason || reason._tag !== "Fail") return yield* fatalToolCause(attempted.cause)
            if (reason.error.error instanceof ToolSafety.Denied) return yield* reason.error.error
            yield* safety.inspect(reason.error)
            return { result: { type: "error" as const, value: reason.error.message } }
          }
          const output = attempted.value
          yield* safety.inspect(output)
          const bounded = yield* resources.bound({ sessionID: input.sessionID, toolCallID: input.call.id, output })
          const projected = bounded.outputPaths.length
            ? ToolSafetyOutput.nudge(bounded.output, bounded.outputPaths, yield* resources.limits())
            : bounded.output
          const result = ToolOutput.toResultValue(projected)
          if (result.type === "error")
            return bounded.outputPaths.length > 0 ? { result, outputPaths: bounded.outputPaths } : { result }
          return bounded.outputPaths.length > 0
            ? { result, output: projected, outputPaths: bounded.outputPaths }
            : { result, output: projected }
        }),
        (observation) => events ? Effect.gen(function* () {
          yield* events.publish(SessionEvent.Tool.Progress, {
            timestamp: yield* DateTime.now,
            sessionID: input.sessionID,
            assistantMessageID: input.assistantMessageID,
            callID: input.call.id,
            structured: { toolSafety: observation },
            content: [],
          }, { location })
        }) : Effect.void,
        (settlement) => settlement.result.type === "error" ? "failure" : ToolSafetyOutput.outcome(settlement.output),
      ).pipe(
        Effect.provideService(ToolSafety.RuntimeProfileLoader, effectiveLoader),
        Effect.provideService(ToolSafety.RuntimeProfile, effectiveProfile),
        Effect.catchTag("ToolSafety.Denied", (error) =>
          Effect.succeed({ result: { type: "error" as const, value: error.message } }),
        ),
      )
    })

    // The placement and profile a tool call of this Location gets, for a Session event.
    const session = Effect.fn("ToolRegistry.session")(function* (
      input: Pick<ToolSafety.SessionEvent, "operation" | "sessionID" | "agent" | "text">,
    ) {
      const location = native?.location ?? Option.getOrUndefined(yield* Effect.serviceOption(Location.Service))
      const events = native?.events ?? Option.getOrUndefined(yield* Effect.serviceOption(EventV2.Service))
      const effectiveProfile = capturedProfile ?? (yield* ToolSafety.RuntimeProfile)
      const effectiveLoader = profileLoader ?? (yield* ToolSafety.RuntimeProfileLoader)
      if (!effectiveProfile && !effectiveLoader) return
      if (!location || !events) return yield* new ToolSafety.Denied({ reason: "native-placement-or-events-missing" })
      yield* safety
        .session({
          ...input,
          directory: location.directory,
          projectID: location.project.id,
          projectDirectory: location.project.directory === "/" ? location.directory : location.project.directory,
        })
        .pipe(
          Effect.provideService(ToolSafety.RuntimeProfileLoader, effectiveLoader),
          Effect.provideService(ToolSafety.RuntimeProfile, effectiveProfile),
        )
    })

    return Service.of({
      session,
      currentRegistrationIdentity: (name) =>
        (local.get(name)?.at(-1)?.registration ?? applications.entries().get(name))?.identity,
      register: Effect.fn("ToolRegistry.register")(function* (tools) {
        const entries = Object.entries(tools)
        if (entries.length === 0) return
        yield* Effect.forEach(entries, ([name]) => validateName(name), { discard: true })
        yield* Effect.uninterruptible(
          Effect.gen(function* () {
            const token = {}
            for (const [name, tool] of entries)
              local.set(name, [...(local.get(name) ?? []), { token, registration: { identity: {}, tool } }])
            yield* Effect.addFinalizer(() =>
              Effect.sync(() => {
                for (const [name] of entries) {
                  const registrations = local.get(name)?.filter((registration) => registration.token !== token) ?? []
                  if (registrations.length > 0) local.set(name, registrations)
                  else local.delete(name)
                }
              }),
            )
          }),
        )
      }),
      materialize: Effect.fn("ToolRegistry.materialize")(function* (permissions = [], options) {
        const registrations = new Map(applications.entries())
        for (const [name, entries] of local) {
          const registration = entries.at(-1)?.registration
          if (registration) registrations.set(name, registration)
        }
        for (const [name, registration] of registrations)
          if (whollyDisabled(permission(registration.tool, name), permissions)) registrations.delete(name)
        const definitions = new Map(
          Array.from(registrations, ([name, registration]) => [name, definition(name, registration.tool)] as const),
        )
        const advertised = options?.advertisedNames === undefined ? undefined : new Set(options.advertisedNames)
        const materialization: Materialization = {
          definitions: Array.from(definitions.values()).filter((definition) =>
            advertised === undefined || advertised.has(definition.name),
          ),
          definition: (name) => definitions.get(name),
          registrationIdentity: (name) => registrations.get(name)?.identity,
          settle: (input) => Effect.gen(function* () {
            const registration = registrations.get(input.call.name)
            const settlement: Settlement = registration ? yield* settleWith(input, registration.identity)
              : { result: { type: "error", value: `Unknown tool: ${input.call.name}` } }
            if (settlement.result.type !== "error") return settlement
            // Failure text uses the same dynamic output budget and retention boundary as successful text.
            const bounded = yield* resources.bound({ sessionID: input.sessionID, toolCallID: input.call.id,
              output: { structured: {}, content: [{ type: "text", text: String(settlement.result.value) }] } })
            const paths = [...new Set([...(settlement.outputPaths ?? []), ...bounded.outputPaths])]
            return { result: { type: "error" as const, value: bounded.output.content
              .flatMap((part) => part.type === "text" ? [part.text] : []).join("") },
              ...(paths.length ? { outputPaths: paths } : {}) }
          }).pipe(Effect.provideService(CapturedMaterialization, materialization)),
        }
        return materialization
      }),
    })
  }),
)

const layer = Layer.effect(
  Tools.Service,
  Service.use((registry) => Effect.succeed(Tools.Service.of({ register: registry.register }))),
).pipe(Layer.provideMerge(registryLayer))

const nativeLayer = Layer.unwrap(Effect.gen(function* () {
  const location = yield* Location.Service
  const events = yield* EventV2.Service
  return layer.pipe(Layer.provide(Layer.succeed(NativeBinding, { location, events })))
}))

function whollyDisabled(action: string, rules: PermissionV2.Ruleset) {
  const rule = rules.findLast((rule) => Wildcard.match(action, rule.action))
  return rule?.resource === "*" && rule.effect === "deny"
}

export const node = makeLocationNode({
  service: Service,
  layer,
  deps: [ApplicationTools.node, ToolOutputStore.node, ToolSafety.node],
})

/** Native host composition replacements: captures real Location/Event services while constructing the registry. */
export const nativeNode = makeLocationNode({
  service: Service, layer: nativeLayer,
  deps: [ApplicationTools.node, ToolOutputStore.node, ToolSafety.node, Location.node, EventV2.node],
})
export const nativeToolsNode = makeLocationNode({
  service: Tools.Service, layer: nativeLayer,
  deps: [ApplicationTools.node, ToolOutputStore.node, ToolSafety.node, Location.node, EventV2.node],
})

export const toolsNode = makeLocationNode({
  service: Tools.Service,
  layer,
  deps: [ApplicationTools.node, ToolOutputStore.node, ToolSafety.node],
})
