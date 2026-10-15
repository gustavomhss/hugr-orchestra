import { LayerNode } from "@orchestra/core/effect/layer-node"
import { llmClient } from "@orchestra/core/effect/app-node-platform"
import { PermissionV1 } from "@orchestra/core/v1/permission"
import { Provider } from "@/provider/provider"
import { SessionV1 } from "@orchestra/core/v1/session"
import { serviceUse } from "@orchestra/core/effect/service-use"
import { Context, Effect, Layer, Stream, Option } from "effect"
import { streamText, wrapLanguageModel, Output, jsonSchema, type JSONSchema7, type ModelMessage, type Tool } from "ai"
import type { LLMEvent } from "@orchestra/llm"
import { LLMClient } from "@orchestra/llm/route"
import type { LLMClientService } from "@orchestra/llm/route"
import { GitLabWorkflowLanguageModel } from "gitlab-ai-provider"
import { ProviderTransform } from "@/provider/transform"
import { Config } from "@/config/config"
import type { Agent } from "@/agent/agent"
import type { MessageV2 } from "./message-v2"
import { Plugin } from "@/plugin"
import { Permission } from "@/permission"
import { EventV2Bridge } from "@/event-v2-bridge"
import { EventV2 } from "@orchestra/core/event"
import { Wildcard } from "@/util/wildcard"
import { SessionID } from "@/session/schema"
import { Auth } from "@/auth"
import { EffectBridge } from "@/effect/bridge"
import { RuntimeFlags } from "@/effect/runtime-flags"
import * as OtelTracer from "@effect/opentelemetry/Tracer"
import { LLMAISDK } from "./llm/ai-sdk"
import { LLMNativeRuntime } from "./llm/native-runtime"
import { LLMRequestPrep } from "./llm/request"
import { LLMContextBudget } from "./llm/context-budget"
import { PromptGuard } from "./prompt-guard"
import { LLMPrepared } from "./llm/prepared"

export const OUTPUT_TOKEN_MAX = ProviderTransform.OUTPUT_TOKEN_MAX

export type StreamInput = {
  user: SessionV1.User
  sessionID: string
  parentSessionID?: string
  model: Provider.Model
  agent: Agent.Info
  permission?: PermissionV1.Ruleset
  system: string[]
  messages: ModelMessage[]
  small?: boolean
  tools: Record<string, Tool>
  retries?: number
  toolChoice?: "auto" | "required" | "none"
  responseSchema?: JSONSchema7
  /** Internal marker: this parent request contains applied working memory. */
  contextMemory?: boolean
  /** Internal request isolation; agent names do not confer maintenance privileges. */
  purpose?: "context-maintenance"
  /** Opaque service-owned result of real one-shot preparation. Never a serialized request flag. */
  prepared?: LLMPrepared.Plan
  preflightParams?: Effect.Success<ReturnType<typeof LLMRequestPrep.prepare>>["params"]
}

export type StreamRequest = StreamInput & {
  abort: AbortSignal
}

export interface Interface {
  readonly stream: (input: StreamInput) => Stream.Stream<LLMEvent, unknown>
  readonly preflight?: (input: StreamInput) => Effect.Effect<LLMPrepared.Plan, unknown>
  readonly receipt?: (plan: LLMPrepared.Plan) => StreamInput | undefined
}

type PlanData = { input: StreamInput; language: Effect.Success<ReturnType<Provider.Interface["getLanguage"]>>;
  cfg: Effect.Success<ReturnType<Config.Interface["get"]>>; item: Provider.Info; info: Effect.Success<ReturnType<Auth.Interface["get"]>>;
  prepared: Effect.Success<ReturnType<typeof LLMRequestPrep.prepare>>; isWorkflow: boolean; outputReserve: number }

export class Service extends Context.Service<Service, Interface>()("@orchestra/LLM") {}

export const use = serviceUse(Service)

const live: Layer.Layer<
  Service,
  never,
  | Auth.Service
  | Config.Service
  | Provider.Service
  | Plugin.Service
  | Permission.Service
  | EventV2Bridge.Service
  | LLMClientService
  | RuntimeFlags.Service
> = Layer.effect(
  Service,
  Effect.gen(function* () {
    const auth = yield* Auth.Service
    const config = yield* Config.Service
    const provider = yield* Provider.Service
    const plugin = yield* Plugin.Service
    const perm = yield* Permission.Service
    const events = yield* EventV2Bridge.Service
    const llmClient = yield* LLMClient.Service
    const flags = yield* RuntimeFlags.Service

    const plans = new WeakMap<LLMPrepared.Plan, PlanData>()
    const preflight = Effect.fn("LLM.preflight")(function* (request: StreamInput) {
      const input = yield* Effect.try({ try: () => LLMPrepared.snapshot(request), catch: (cause) => cause })
      const outputReserve = ProviderTransform.maxOutputTokens(input.model, flags.outputTokenMax)
      yield* Effect.logInfo("stream", {
        providerID: input.model.providerID,
        modelID: input.model.id,
        "session.id": input.sessionID,
        small: (input.small ?? false).toString(),
        agent: input.agent.id ?? input.agent.name,
        mode: input.agent.mode,
      })

      const [language, cfg, item, info] = yield* Effect.all(
        [
          provider.getLanguage(input.model),
          config.get(),
          provider.getProvider(input.model.providerID),
          auth.get(input.model.providerID),
        ],
        { concurrency: "unbounded" },
      )

      const isWorkflow = language instanceof GitLabWorkflowLanguageModel
      const prepared = yield* LLMRequestPrep.prepare({
        ...input,
        provider: item,
        auth: info,
        plugin,
        flags,
        isWorkflow,
      })
      prepared.tools = yield* Effect.tryPromise(() => LLMPrepared.tools(prepared.tools))
      yield* Effect.try({ try: () => Object.assign(prepared, structuredClone({ model: prepared.model, system: prepared.system, messages: prepared.messages,
        params: prepared.params, messageTransformOptions: prepared.messageTransformOptions, headers: prepared.headers })), catch: (cause) => cause })
      yield* LLMContextBudget.check({ ...prepared, outputReserve }, input.responseSchema, isWorkflow ? prepared.system : undefined,
        cfg.continuity?.enabled !== false && input.purpose !== "context-maintenance")
      const plan = LLMPrepared.token()
      plans.set(plan, { input, language, cfg, item, info, prepared, isWorkflow, outputReserve })
      return plan
    })

    const receipt = (plan: LLMPrepared.Plan) => {
      const value = plans.get(plan)
      return value && LLMPrepared.snapshot({ ...value.input, model: value.prepared.model, messages: value.prepared.messages,
        system: value.prepared.system, tools: value.prepared.tools,
        agent: { ...value.input.agent, options: value.prepared.params.options }, preflightParams: value.prepared.params, prepared: plan })
    }

    const run = Effect.fn("LLM.run")(function* (request: StreamRequest) {
      const plan = request.prepared ?? (yield* preflight(request))
      const data = plans.get(plan)
      if (!data) return yield* Effect.fail(new Error("LLM prepared plan is unavailable for this service"))
      const input = { ...data.input, abort: request.abort }
      const language = data.language
      const cfg = data.cfg
      const item = data.item
      const info = data.info
      const prepared = { ...data.prepared, ...structuredClone({ model: data.prepared.model, system: data.prepared.system,
        messages: data.prepared.messages, params: data.prepared.params, headers: data.prepared.headers, messageTransformOptions: data.prepared.messageTransformOptions }) }
      if (request.preflightParams) {
        const size = data.prepared.messages.length
        if (JSON.stringify(request.messages.slice(0, size)) !== JSON.stringify(data.prepared.messages) ||
          JSON.stringify(request.preflightParams) !== JSON.stringify(data.prepared.params))
          return yield* Effect.fail(new Error("LLM prepared replay prefix changed"))
        prepared.messages = [...prepared.messages, ...structuredClone(request.messages.slice(size))]
        if (Object.keys(data.prepared.tools).some((name) => typeof request.tools[name]?.execute !== "function"))
          return yield* Effect.fail(new Error("LLM prepared replay tool executor missing"))
        prepared.tools = Object.fromEntries(Object.entries(data.prepared.tools).map(([name, tool]) => [name, { ...tool, execute: request.tools[name].execute }]))
      }
      const isWorkflow = data.isWorkflow
      const toolChoice = input.purpose === "context-maintenance" ? "none" : input.toolChoice
      // Defense in depth over the same captured payload. No hooks or mutable preparation are rerun.
      yield* LLMContextBudget.check({ ...prepared, outputReserve: data.outputReserve }, input.responseSchema, isWorkflow ? prepared.system : undefined,
        cfg.continuity?.enabled !== false && input.purpose !== "context-maintenance")

      // Wire up toolExecutor for DWS workflow models so that tool calls
      // from the workflow service are executed via Orchestra's tool system
      // and results sent back over the WebSocket.
      const bridge = yield* EffectBridge.make()
      if (language instanceof GitLabWorkflowLanguageModel) {
        const workflowModel = language as GitLabWorkflowLanguageModel & {
          sessionID?: string
          sessionPreapprovedTools?: string[]
          approvalHandler?: (approvalTools: { name: string; args: string }[]) => Promise<{ approved: boolean }>
        }
        workflowModel.sessionID = input.sessionID
        workflowModel.systemPrompt = prepared.system.join("\n")
        workflowModel.toolExecutor = async (toolName, argsJson, _requestID) => {
          const t = prepared.tools[toolName]
          if (!t || !t.execute) {
            return { result: "", error: `Unknown tool: ${toolName}` }
          }
          try {
            const result = await t.execute!(JSON.parse(argsJson), {
              toolCallId: _requestID,
              messages: input.messages,
              abortSignal: input.abort,
            })
            const output = typeof result === "string" ? result : (result?.output ?? JSON.stringify(result))
            return {
              result: output,
              metadata: typeof result === "object" ? result?.metadata : undefined,
              title: typeof result === "object" ? result?.title : undefined,
            }
          } catch (e: any) {
            return { result: "", error: e.message ?? String(e) }
          }
        }

        const ruleset = Permission.merge(input.agent.permission ?? [], input.permission ?? [])
        workflowModel.sessionPreapprovedTools = Object.keys(prepared.tools).filter((name) => {
          const match = ruleset.findLast((rule) => Wildcard.match(name, rule.permission))
          return !match || match.action !== "ask"
        })

        const approvedToolsForSession = new Set<string>()
        workflowModel.approvalHandler = bridge.bind(async (approvalTools) => {
          const uniqueNames = [...new Set(approvalTools.map((t: { name: string }) => t.name))] as string[]
          // Auto-approve tools that were already approved in this session
          // (prevents infinite approval loops for server-side MCP tools)
          if (uniqueNames.every((name) => approvedToolsForSession.has(name))) {
            return { approved: true }
          }

          const id = PermissionV1.ID.ascending()
          let unsub: EventV2.Unsubscribe | undefined
          try {
            unsub = await bridge.promise(
              events.listen((event) => {
                if (event.type !== Permission.Event.Replied.type) return Effect.void
                const data = event.data as EventV2.Data<typeof Permission.Event.Replied>
                if (data.requestID !== id) return Effect.void
                void data.reply
                return Effect.void
              }),
            )
            const toolPatterns = approvalTools.map((t: { name: string; args: string }) => {
              try {
                const parsed = JSON.parse(t.args) as Record<string, unknown>
                const title = (parsed?.title ?? parsed?.name ?? "") as string
                return title ? `${t.name}: ${title}` : t.name
              } catch {
                return t.name
              }
            })
            const uniquePatterns = [...new Set(toolPatterns)] as string[]
            await bridge.promise(
              perm.ask({
                id,
                sessionID: SessionID.make(input.sessionID),
                permission: "workflow_tool_approval",
                patterns: uniquePatterns,
                metadata: { tools: approvalTools },
                always: uniquePatterns,
                ruleset: [],
              }),
            )
            for (const name of uniqueNames) approvedToolsForSession.add(name)
            workflowModel.sessionPreapprovedTools = [...(workflowModel.sessionPreapprovedTools ?? []), ...uniqueNames]
            return { approved: true }
          } catch {
            return { approved: false }
          } finally {
            if (unsub) await bridge.promise(unsub)
          }
        })
      }

      const tracer = cfg.experimental?.openTelemetry
        ? Option.getOrUndefined(yield* Effect.serviceOption(OtelTracer.OtelTracer))
        : undefined
      const telemetryTracer = tracer
        ? new Proxy(tracer, {
            get(target, prop, receiver) {
              if (prop !== "startSpan") return Reflect.get(target, prop, receiver)
              return (...args: Parameters<typeof target.startSpan>) => {
                const span = target.startSpan(...args)
                span.setAttribute("session.id", input.sessionID)
                return span
              }
            },
          })
        : undefined

      // Runtime seam: native is an opt-in adapter over @orchestra/llm. It
      // either returns a ready LLMEvent stream or a concrete fallback reason.
      yield* PromptGuard.check(input.sessionID, input.small !== true)
      if (flags.experimentalNativeLlm) {
        const native = LLMNativeRuntime.stream({
          model: prepared.model,
          provider: item,
          auth: info,
          llmClient,
          messages: prepared.messages,
          tools: prepared.tools,
          toolChoice,
          responseSchema: input.responseSchema,
          temperature: prepared.params.temperature,
          topP: prepared.params.topP,
          topK: prepared.params.topK,
          maxOutputTokens: prepared.params.maxOutputTokens,
          providerOptions: prepared.params.options,
          headers: prepared.headers,
          abort: input.abort,
        })
        if (native.type === "supported") {
          yield* Effect.logInfo("llm runtime selected", {
            "llm.runtime": "native",
            "llm.provider": input.model.providerID,
            "llm.model": input.model.id,
          })
          return {
            type: "native" as const,
            stream: native.stream,
          }
        }
        yield* Effect.logInfo("llm runtime selected", {
          "llm.runtime": "ai-sdk",
          "llm.provider": input.model.providerID,
          "llm.model": input.model.id,
          "llm.native_unsupported_reason": native.reason,
        })
        yield* Effect.logInfo("native runtime unavailable; falling back to ai-sdk", {
          providerID: input.model.providerID,
          modelID: input.model.id,
          "session.id": input.sessionID,
          small: (input.small ?? false).toString(),
          agent: input.agent.id ?? input.agent.name,
          mode: input.agent.mode,
          reason: native.reason,
        })
      }

      yield* Effect.logInfo("llm runtime selected", {
        "llm.runtime": "ai-sdk",
        "llm.provider": input.model.providerID,
        "llm.model": input.model.id,
      })
      // Default runtime path: AI SDK owns provider execution and tool dispatch;
      // LLMAISDK.toLLMEvents below normalizes fullStream parts for the processor.
      return {
        type: "ai-sdk" as const,
        result: streamText({
          onError(error) {
            bridge.fork(
              Effect.logError("stream error", {
                providerID: input.model.providerID,
                modelID: input.model.id,
                "session.id": input.sessionID,
                small: (input.small ?? false).toString(),
                agent: input.agent.id ?? input.agent.name,
                mode: input.agent.mode,
                error,
              }),
            )
          },
          // Copilot returns the authoritative billed amount only in provider-specific response fields.
          includeRawChunks: input.model.providerID.includes("github-copilot"),
          async experimental_repairToolCall(failed) {
            const lower = failed.toolCall.toolName.toLowerCase()
            if (lower !== failed.toolCall.toolName && prepared.tools[lower]) {
              return {
                ...failed.toolCall,
                toolName: lower,
              }
            }
            return {
              ...failed.toolCall,
              input: JSON.stringify({
                tool: failed.toolCall.toolName,
                error: failed.error.message,
              }),
              toolName: "invalid",
            }
          },
          temperature: prepared.params.temperature,
          topP: prepared.params.topP,
          topK: prepared.params.topK,
          providerOptions: ProviderTransform.providerOptions(prepared.model, prepared.params.options),
          activeTools: Object.keys(prepared.tools).filter((x) => x !== "invalid"),
          tools: prepared.tools,
          toolChoice,
          output: input.responseSchema ? Output.object({ name: "response", schema: jsonSchema(input.responseSchema) }) : undefined,
          maxOutputTokens: prepared.params.maxOutputTokens,
          abortSignal: input.abort,
          headers: prepared.headers,
          maxRetries: input.retries ?? 0,
          messages: prepared.messages,
          model: wrapLanguageModel({
            model: language,
            middleware: [
              {
                specificationVersion: "v3" as const,
                async transformParams(args) {
                  if (args.type === "stream") {
                    // @ts-expect-error
                    args.params.prompt = ProviderTransform.message(
                      args.params.prompt,
                      prepared.model,
                      prepared.messageTransformOptions,
                    )
                  }
                  return args.params
                },
              },
            ],
          }),
          experimental_telemetry: {
            isEnabled: cfg.experimental?.openTelemetry,
            functionId: "session.llm",
            tracer: telemetryTracer,
            metadata: {
              userId: cfg.username ?? "unknown",
              sessionId: input.sessionID,
            },
          },
        }),
      }
    })

    const stream: Interface["stream"] = (input) =>
      Stream.scoped(
        Stream.unwrap(
          Effect.gen(function* () {
            const ctrl = yield* Effect.acquireRelease(
              Effect.sync(() => new AbortController()),
              (ctrl) => Effect.sync(() => ctrl.abort()),
            )

            const result = yield* run({ ...input, abort: ctrl.signal })

            if (result.type === "native") return result.stream

            // Adapter seam: both runtimes expose the same LLMEvent stream. Native
            // already returns one; AI SDK streams are converted here.
            const state = LLMAISDK.adapterState()
            return Stream.fromAsyncIterable(result.result.fullStream, (e) =>
              e instanceof Error ? e : new Error(String(e)),
            ).pipe(
              Stream.mapEffect((event) => LLMAISDK.toLLMEvents(state, event)),
              Stream.flatMap((events) => Stream.fromIterable(events)),
            )
          }),
        ),
      )

    return Service.of({ stream, preflight, receipt })
  }),
)

export const hasToolCalls = LLMRequestPrep.hasToolCalls

export const node = LayerNode.make({
  service: Service,
  layer: live,
  deps: [
    Auth.node,
    Config.node,
    Provider.node,
    Plugin.node,
    Permission.node,
    EventV2Bridge.node,
    llmClient,
    RuntimeFlags.node,
  ],
})

export * as LLM from "./llm"
