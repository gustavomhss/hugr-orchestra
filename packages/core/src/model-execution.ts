export * as ModelExecution from "./model-execution"

import { Context, Effect, Layer, Schema } from "effect"
import { AgentV2 } from "./agent"
import { Catalog } from "./catalog"
import { makeLocationNode } from "./effect/app-node"
import { Location } from "./location"
import { ModelV2 } from "./model"
import { ModelExecutionOptions } from "./model-execution-options"
import { ExecutionHost } from "./session/runner/execution-host"
import { SessionSchema } from "./session/schema"
import { SessionStore } from "./session/store"
import { SessionSubagentModels } from "./session/subagent-models"

export const Reason = Schema.Literals([
  "model-missing",
  "model-disabled",
  "connection-unavailable",
  "model-denied",
  "unsupported-api",
  "invalid-options",
  "variant-unavailable",
  "host-unregistered",
  "host-unavailable",
  "host-model-unsupported",
  "host-options-unsupported",
])
export type Reason = typeof Reason.Type
export type Decision =
  | { readonly status: "ready" }
  | { readonly status: "unsupported" | "unavailable"; readonly reason: Reason }
export type Input = {
  readonly context:
    | { readonly type: "session"; readonly sessionID: SessionSchema.ID; readonly agentID?: string }
    | { readonly type: "draft"; readonly agentID?: string; readonly parentID?: SessionSchema.ID }
  readonly model?: ModelV2.Ref
}
export interface Response {
  readonly models: ReadonlyArray<Decision & { readonly model: ModelV2.Info; readonly engine: string }>
  readonly selection?: Decision & { readonly ref: ModelV2.Ref; readonly engine: string }
}
export class ContextError extends Schema.TaggedErrorClass<ContextError>()("ModelExecution.ContextError", {
  reason: Schema.Literals([
    "session-missing",
    "parent-missing",
    "location-mismatch",
    "agent-missing",
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
    const store = yield* SessionStore.Service
    const policies = yield* SessionSubagentModels.Service
    const hosts = yield* ExecutionHost.Service
    const location = yield* Location.Service
    const belongs = (session: SessionSchema.Info) =>
      session.location.directory === location.directory && session.location.workspaceID === location.workspaceID
    return Service.of({
      describe: Effect.fn("ModelExecution.describe")(function* (input: Input) {
        const session = input.context.type === "session" ? yield* store.get(input.context.sessionID) : undefined
        if (input.context.type === "session" && !session) return yield* new ContextError({ reason: "session-missing" })
        const parentID = input.context.type === "draft" ? input.context.parentID : session?.parentID
        const parent = input.context.type === "draft" && parentID ? yield* store.get(parentID) : undefined
        if (input.context.type === "draft" && parentID && !parent)
          return yield* new ContextError({ reason: "parent-missing" })
        if ((session && !belongs(session)) || (parent && !belongs(parent)))
          return yield* new ContextError({ reason: "location-mismatch" })
        const agent = yield* agents.select(input.context.agentID ?? session?.agent)
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
            agent: agent.id,
            model: ref,
            parentID,
          })
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
          all.filter((model) => model.enabled || (input.model && key(model) === key(input.model))),
          (model) =>
            assess(
              input.model && key(input.model) === key(model)
                ? input.model
                : ModelV2.Ref.make({ providerID: model.providerID, id: model.id }),
              model,
            ).pipe(Effect.map((decision) => ({ model, ...decision }))),
        )
        const ref = input.model
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
  deps: [Catalog.node, AgentV2.node, SessionStore.node, SessionSubagentModels.node, ExecutionHost.node, Location.node],
})
