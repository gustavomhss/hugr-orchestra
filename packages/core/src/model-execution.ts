export * as ModelExecution from "./model-execution"

import { Context, Effect, Layer, Schema } from "effect"
import { Reason, Decision, Input, Response, Entry, Selection } from "@orchestra/schema/model-execution"
import { AgentV2 } from "./agent"
import { Catalog } from "./catalog"
import { CommandV2 } from "./command"
import { makeLocationNode } from "./effect/app-node"
import { Location } from "./location"
import { Mcp } from "./mcp"
import { ModelV2 } from "./model"
import { ModelExecutionOptions } from "./model-execution-options"
import { ExecutionHost } from "./session/runner/execution-host"
import { SessionSchema } from "./session/schema"
import { SessionStore } from "./session/store"
import { SessionSubagentModels } from "./session/subagent-models"
import { SlashCommand } from "./slash-command"

export { Reason, Decision, Input, Response, Entry, Selection }

export class ContextError extends Schema.TaggedErrorClass<ContextError>()("ModelExecution.ContextError", {
  reason: Schema.Literals([
    "session-missing",
    "parent-missing",
    "location-mismatch",
    "agent-missing",
    "command-missing",
    "invalid-session-chain",
    "storage-unavailable",
  ]),
}) {
  override get message() {
    return "Model execution context is unavailable"
  }
}
export class ExecutionUnavailableError extends Schema.TaggedErrorClass<ExecutionUnavailableError>()(
  "ModelExecution.ExecutionUnavailableError",
  {
    sessionID: SessionSchema.ID,
    engine: Schema.String,
    reason: Schema.Union([
      Reason,
      Schema.Literals(["agent-missing", "session-missing", "invalid-session-chain", "storage-unavailable"]),
    ]),
    model: ModelV2.Ref.pipe(Schema.optional),
  },
) {
  override get message() {
    return "The selected execution host is unavailable for this model"
  }
}
export interface Interface {
  readonly describe: (input: Input) => Effect.Effect<Response, ContextError>
  readonly assertHost: (input: {
    readonly session: SessionSchema.Info
    readonly agent: AgentV2.Selection
    readonly engine: string
  }) => Effect.Effect<
    { readonly host: ExecutionHost.Interface; readonly ref?: ModelV2.Ref },
    ExecutionUnavailableError | SessionSubagentModels.ModelDeniedError
  >
}
export class Service extends Context.Service<Service, Interface>()("@orchestra/ModelExecution") {}

const key = (ref: Pick<ModelV2.Ref, "providerID" | "id">) => JSON.stringify([ref.providerID, ref.id])
const structural = (model: ModelV2.Info, ref: ModelV2.Ref) =>
  ModelExecutionOptions.selectVariant(model, ref.variant).pipe(
    Effect.tap((selected) => ModelExecutionOptions.options(selected.model, selected.variant)),
    Effect.tap((selected) => ModelExecutionOptions.validateBody(selected.model)),
    Effect.map((selected) => ({
      model: selected.model,
      ref: ModelV2.Ref.make({
        providerID: ref.providerID,
        id: ref.id,
        ...(selected.variant ? { variant: selected.variant.id } : {}),
      }),
    })),
  )
const invalidReason = (
  error: ModelExecutionOptions.ModelUnavailableError | ModelExecutionOptions.VariantUnavailableError,
): Reason =>
  error instanceof ModelExecutionOptions.VariantUnavailableError ? "variant-unavailable" : "invalid-options"

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const catalog = yield* Catalog.Service
    const agents = yield* AgentV2.Service
    const commands = yield* CommandV2.Service
    const mcp = yield* Mcp.Service
    const store = yield* SessionStore.Service
    const policies = yield* SessionSubagentModels.Service
    const hosts = yield* ExecutionHost.Service
    const location = yield* Location.Service
    const getSession = (sessionID: SessionSchema.ID) =>
      store.get(sessionID).pipe(
        Effect.catchDefect((cause) =>
          cause instanceof SessionSubagentModels.StorageError
            ? Effect.fail(new ContextError({ reason: "storage-unavailable" }))
            : Effect.die(cause),
        ),
      )
    const belongs = (session: SessionSchema.Info) =>
      session.location.directory === location.directory && session.location.workspaceID === location.workspaceID
    return Service.of({
      describe: Effect.fn("ModelExecution.describe")(function* (input: Input) {
        const session = input.context.type === "session" ? yield* getSession(input.context.sessionID) : undefined
        if (input.context.type === "session" && !session) return yield* new ContextError({ reason: "session-missing" })
        const parentID = input.context.type === "draft" ? input.context.parentID : session?.parentID
        const parent = input.context.type === "draft" && parentID ? yield* getSession(parentID) : undefined
        if (input.context.type === "draft" && parentID && !parent)
          return yield* new ContextError({ reason: "parent-missing" })
        if ((session && !belongs(session)) || (parent && !belongs(parent)))
          return yield* new ContextError({ reason: "location-mismatch" })
        const command = input.command === undefined ? undefined : yield* commands.get(input.command)
        if (input.command !== undefined && !command &&
          !(yield* SlashCommand.findPrompt(input.command, true).pipe(Effect.provideService(Mcp.Service, mcp))))
          return yield* new ContextError({ reason: "command-missing" })
        const target = command ? yield* SlashCommand.target(command).pipe(Effect.provideService(AgentV2.Service, agents)) : undefined
        const overrides = target?.subtask === false ? target : undefined
        const ref = overrides?.model ?? input.model
        const agent = yield* agents.select(overrides?.agent ?? input.context.agentID ?? session?.agent)
        if (!agent.info) return yield* new ContextError({ reason: "agent-missing" })
        const ceilings = yield* (
          session ? policies.forSession(session.id) : parentID ? policies.forChild(parentID) : Effect.succeed([])
        ).pipe(
          Effect.catch((error) =>
            Effect.fail(
              new ContextError({
                reason:
                  error instanceof SessionSubagentModels.NotFoundError
                    ? session
                      ? "session-missing"
                      : "parent-missing"
                    : error instanceof SessionSubagentModels.InvalidChainError
                      ? "invalid-session-chain"
                      : "storage-unavailable",
              }),
            ),
          ),
        )
        const all = [...new Map((yield* catalog.model.all()).map((model) => [key(model), model])).values()]
        const available = new Set((yield* catalog.model.available()).map(key))
        const assess = Effect.fn(function* (ref: ModelV2.Ref, model?: ModelV2.Info) {
          const selectedEngine = yield* ExecutionHost.engineForSelection(agents, store, {
            id: session?.id,
            agent: agent.id,
            model: ref,
            parentID,
          }).pipe(
            Effect.mapError((error) => new ContextError({
              reason: error instanceof SessionSubagentModels.InvalidChainError
                ? "invalid-session-chain"
                : "storage-unavailable",
            })),
          )
          const engine = selectedEngine ?? "orchestra"
          const unavailable = (reason: Reason) => ({ engine, status: "unavailable" as const, reason })
          if (!model) return unavailable("model-missing")
          if (!model.enabled) return unavailable("model-disabled")
          if (!SessionSubagentModels.permits(ceilings, ref)) return unavailable("model-denied")
          const provider = yield* catalog.provider.get(model.providerID)
          if (provider?.disabled) return unavailable("connection-unavailable")
          if (!selectedEngine && !available.has(key(model))) return unavailable("connection-unavailable")
          if (!selectedEngine && !ModelExecutionOptions.supported(model))
            return { engine, status: "unsupported" as const, reason: "unsupported-api" as const }
          const host = selectedEngine ? hosts.get(selectedEngine) : undefined
          if (selectedEngine && !host) return unavailable("host-unregistered")
          return yield* structural(model, ref).pipe(
            Effect.flatMap((selected) =>
              host
                ? host.describeModel(selected).pipe(Effect.map((decision) => ({ engine, ...decision })))
                : Effect.succeed({ engine, status: "ready" as const }),
            ),
            Effect.catch((error) => Effect.succeed(unavailable(invalidReason(error)))),
          )
        })
        const models = yield* Effect.forEach(
          all.filter((model) => model.enabled || (ref && key(model) === key(ref))),
          (model) =>
            assess(
              ref && key(ref) === key(model)
                ? ref
                : ModelV2.Ref.make({ providerID: model.providerID, id: model.id }),
              model,
            ).pipe(Effect.map((decision) => ({ model: publicModel(model), ...decision }))),
        )
        const selection = ref
          ? {
              ref,
              ...(yield* assess(
                ref,
                all.find((model) => key(model) === key(ref)),
              )),
            }
          : undefined
        return { models, ...(selection ? { selection } : {}) }
      }),
      assertHost: Effect.fn("ModelExecution.assertHost")(function* (input: Parameters<Interface["assertHost"]>[0]) {
        const unavailable = (reason: ExecutionUnavailableError["reason"]) =>
          new ExecutionUnavailableError({
            sessionID: input.session.id,
            engine: input.engine,
            reason,
            model: input.session.model ?? input.agent.info?.model,
          })
        if (!input.agent.info) return yield* unavailable("agent-missing")
        const host = hosts.get(input.engine)
        if (!host) return yield* unavailable("host-unregistered")
        const ref = input.session.model ?? input.agent.info.model
        yield* policies
          .assert(input.session.id, ref)
          .pipe(
            Effect.catch((error) =>
              Effect.fail(
                error instanceof SessionSubagentModels.ModelDeniedError
                  ? error
                  : unavailable(
                      error instanceof SessionSubagentModels.NotFoundError
                        ? "session-missing"
                        : error instanceof SessionSubagentModels.InvalidChainError
                          ? "invalid-session-chain"
                          : "storage-unavailable",
                    ),
              ),
            ),
          )
        const model = ref ? yield* catalog.model.get(ref.providerID, ref.id) : undefined
        if (model && (!model.enabled || (yield* catalog.provider.get(model.providerID))?.disabled))
          return yield* unavailable(model.enabled ? "connection-unavailable" : "model-disabled")
        const selected =
          model && ref
            ? yield* structural(model, ref).pipe(
                Effect.catch((error) => Effect.fail(unavailable(invalidReason(error)))),
              )
            : { model, ref }
        const decision = yield* host.describeModel(selected)
        if (decision.status !== "ready") return yield* unavailable(decision.reason)
        return { host, ...(selected.ref ? { ref: selected.ref } : {}) }
      }),
    })
  }),
)

export const node = makeLocationNode({
  service: Service,
  layer,
  deps: [
    Catalog.node,
    AgentV2.node,
    CommandV2.node,
    Mcp.node,
    SessionStore.node,
    SessionSubagentModels.node,
    ExecutionHost.node,
    Location.node,
  ],
})

// Catalog bodies, headers, and endpoint settings can contain provider credentials.
function publicModel(model: ModelV2.Info): ModelV2.Info {
  return {
    ...model,
    api: model.api.type === "native"
      ? { type: "native", id: model.api.id, settings: {} }
      : { type: "aisdk", id: model.api.id, package: model.api.package },
    request: {
      headers: {},
      body: {},
      ...(model.request.variant === undefined ? {} : { variant: model.request.variant }),
    },
    variants: model.variants.map((variant) => ({ id: variant.id, headers: {}, body: {} })),
  }
}
