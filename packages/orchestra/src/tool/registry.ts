import { LayerNode } from "@orchestra/core/effect/layer-node"
import { filesystem, httpClient } from "@orchestra/core/effect/app-node-platform"
import { Ripgrep } from "@orchestra/core/ripgrep"
import { Session } from "@/session/session"
import { QuestionTool } from "./question"
import { ShellTool } from "./shell"
import { ShellPrompt } from "./shell/prompt"
import { roster } from "@/maestro/roster"
import { EditTool } from "./edit"
import { GlobTool } from "./glob"
import { GrepTool } from "./grep"
import { ReadTool } from "./read"
import { ContextRecallTool } from "./context-recall"
import { ContextCompactTool } from "./context-compact"
import { SessionContinuity } from "@/continuity/service"
import { AtlasMemoryEmitTool, AtlasMemoryRecallTool } from "./atlas-memory"
import { Archive } from "@/continuity/archive"
import { TaskTool } from "@/tool/task"
import { MaestroPresentApprovalTool, MaestroRecordApprovalTool } from "./maestro-approval"
import { MaestroRecordAdmissionTool } from "./maestro-admission"
import { MaestroCatalogContextTool, MaestroRecordPlanRevisionTool } from "./maestro-plan"
import { MaestroRecordContextTool } from "./maestro-context"
import { MaestroRequestReviewTool } from "./maestro-review"
import { MaestroRecordReviewTool, MaestroRecordValidationTool } from "./maestro-validation"
import { MaestroGrantAuthorizationTool } from "./maestro-authorization"
import { MaestroArsenalTools } from "./maestro-arsenal"
import { MaestroArsenal } from "@orchestra/core/tool/maestro-arsenal"
import { ArsenalObservations } from "@/maestro/arsenal-observations"
import { ToolSafety } from "@orchestra/core/tool-safety"
import { ArsenalBindings } from "@/maestro/arsenal-bindings"
import { AppProcess } from "@orchestra/core/process"
import { Global } from "@orchestra/core/global"
import { Database } from "@orchestra/core/database/database"
import { TodoWriteTool } from "./todo"
import { WebFetchTool } from "./webfetch"
import { WriteTool } from "./write"
import { InvalidTool } from "./invalid"
import { SkillTool } from "./skill"
import * as Tool from "./tool"
import { Config } from "@/config/config"
import { type ToolContext as PluginToolContext, type ToolDefinition } from "@orchestra/plugin"
import type { JSONSchema7, JSONSchema7Definition } from "@ai-sdk/provider"
import { Schema } from "effect"
import z from "zod"
import { Plugin } from "../plugin"
import { Provider } from "@/provider/provider"

import { WebSearchTool } from "./websearch"
import { LspTool } from "./lsp"
import * as Truncate from "./truncate"
import { ApplyPatchTool } from "./apply_patch"
import { Glob } from "@orchestra/core/util/glob"
import { PluginSdkRuntime } from "@orchestra/core/plugin/sdk-runtime"
import path from "path"
import { pathToFileURL } from "url"
import { Effect, Layer, Context } from "effect"
import { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner"
import { CrossSpawnSpawner } from "@orchestra/core/cross-spawn-spawner"
import { Format } from "../format"
import { InstanceState } from "@/effect/instance-state"
import { InstanceStore } from "@/project/instance-store"
import { EffectBridge } from "@/effect/bridge"
import { Question } from "../question"
import { Todo } from "../session/todo"
import { LSP } from "@/lsp/lsp"
import { Instruction } from "../session/instruction"
import { FSUtil } from "@orchestra/core/fs-util"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Git } from "@/git"
import { Agent } from "../agent/agent"
import { Skill } from "../skill"
import { Permission } from "@/permission"
import { BackgroundJob } from "@/background/job"
import { BackgroundProcess } from "@/background/process"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { ProviderV2 } from "@orchestra/core/provider"
import { ModelV2 } from "@orchestra/core/model"
import { MCP } from "@/mcp"
import { PermissionV1 } from "@orchestra/core/v1/permission"
import { LocationServiceMap } from "@orchestra/core/location-services"
import { McpCatalog } from "@/mcp/catalog"

export function webSearchEnabled(flags = { exa: false, parallel: false }) {
  return flags.exa || flags.parallel
}

type TaskDef = Tool.InferDef<typeof TaskTool>
type ReadDef = Tool.InferDef<typeof ReadTool>

type State = {
  custom: Tool.Def[]
  builtin: Tool.Def[]
  task: TaskDef
  read: ReadDef
}

export interface Interface {
  readonly ids: () => Effect.Effect<string[]>
  readonly all: () => Effect.Effect<Tool.Def[]>
  readonly named: () => Effect.Effect<{ task: TaskDef; read: ReadDef }>
  readonly tools: (model: {
    providerID: ProviderV2.ID
    modelID: ModelV2.ID
    agent: Agent.Info
    permission?: PermissionV1.Ruleset
    durableSafety?: boolean
  }) => Effect.Effect<Tool.Def[]>
}

export class Service extends Context.Service<Service, Interface>()("@orchestra/ToolRegistry") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const config = yield* Config.Service
    const plugin = yield* Plugin.Service
    const agents = yield* Agent.Service
    const truncate = yield* Truncate.Service
    const flags = yield* RuntimeFlags.Service
    const mcp = yield* MCP.Service
    const fs = yield* FSUtil.Service
    const observations = yield* ArsenalObservations.Service
    const runtime = yield* ArsenalBindings.make
    const safety = yield* ToolSafety.make
    const arsenal = yield* MaestroArsenalTools.make({
      beforeExecute: (context, name, args) => runtime.beforeExecute(context.sessionID, name, args),
      afterExecute: (context, name, args, result) => {
        if (!context.callID) return Effect.fail(new Error("Arsenal native call identity missing")).pipe(Effect.orDie)
        return runtime.afterExecute(
          { sessionID: context.sessionID, assistantMessageID: context.messageID, callID: context.callID },
          name,
          args,
          result,
        )
      },
      observeGovernance: (context, operation) =>
        Effect.gen(function* () {
          const instance = yield* InstanceState.context
          yield* context.ask({
            permission: "read",
            patterns: [`session:${context.sessionID}`],
            always: [],
            metadata: { operation },
          })
          return yield* observations.read({
            sessionID: context.sessionID,
            operation,
            placement: { directory: instance.directory, projectID: instance.project.id },
          })
        }),
    })

    const invalid = yield* InvalidTool
    const task = yield* TaskTool.pipe(runtime.construct)
    const maestroPresentApproval = yield* MaestroPresentApprovalTool
    const maestroRecordApproval = yield* MaestroRecordApprovalTool
    const maestroRecordAdmission = yield* MaestroRecordAdmissionTool
    const maestroRecordPlanRevision = yield* MaestroRecordPlanRevisionTool
    const maestroCatalogContext = yield* MaestroCatalogContextTool
    const maestroRecordContext = yield* MaestroRecordContextTool
    const maestroRequestReview = yield* MaestroRequestReviewTool
    const maestroRecordValidation = yield* MaestroRecordValidationTool
    const maestroRecordReview = yield* MaestroRecordReviewTool
    const maestroGrantAuthorization = yield* MaestroGrantAuthorizationTool
    const read = yield* ReadTool
    const recall = yield* ContextRecallTool
    const compact = yield* ContextCompactTool
    const atlasRecall = yield* AtlasMemoryRecallTool
    const atlasEmit = yield* AtlasMemoryEmitTool
    const question = yield* QuestionTool
    const todo = yield* TodoWriteTool
    const lsptool = yield* LspTool
    const webfetch = yield* WebFetchTool
    const websearch = yield* WebSearchTool
    const shell = yield* ShellTool
    const globtool = yield* GlobTool
    const writetool = yield* WriteTool
    const edit = yield* EditTool
    const greptool = yield* GrepTool
    const patchtool = yield* ApplyPatchTool
    const skilltool = yield* SkillTool
    const agent = yield* Agent.Service
    const codeMode = flags.experimentalCodeMode ? yield* Effect.promise(() => import("./code-mode")) : undefined
    const codeModeTool = codeMode ? yield* codeMode.CodeModeTool : undefined

    const state = yield* InstanceState.make<State>(
      Effect.fn("ToolRegistry.state")(function* (ctx) {
        const custom: Tool.Def[] = []

        function fromPlugin(id: string, def: ToolDefinition): Tool.Def {
          // Plugin tools still expose Zod args publicly; keep that compatibility
          // boxed at the registry boundary and give the LLM the original JSON Schema.
          // Normalize missing args to `{}` once — pre-1.14.49 the code was
          // `z.object(def.args)` and Zod silently tolerated undefined (#27451, #27630).
          const args = def.args ?? {}
          const entries = Object.entries(args)
          const allZod = entries.every((entry) => isZodType(entry[1]))
          const zodParams = allZod ? z.object(args) : undefined
          const jsonSchema = zodParams ? zodJsonSchema(zodParams) : legacyJsonSchema(entries)
          const parameters = zodParams
            ? Schema.declare<unknown>((u): u is unknown => zodParams.safeParse(u).success)
            : Schema.Unknown
          return {
            id,
            parameters,
            jsonSchema,
            description: def.description,
            execute: (args, toolCtx) =>
              Effect.gen(function* () {
                // Bridge the host's Effect-based `ask` into a Promise-returning
                // function for the plugin to make sure context persists
                const bridge = yield* EffectBridge.make()
                yield* ToolSafety.beforeInvocation({
                  tool: id,
                  args,
                  sessionID: toolCtx.sessionID,
                  callID: toolCtx.callID ?? "",
                  directory: ctx.directory,
                  projectID: ctx.project.id,
                  projectDirectory: ctx.worktree === "/" ? ctx.directory : ctx.worktree,
                })
                const pluginCtx: PluginToolContext = {
                  ...toolCtx,
                  // Callers that predate ids pass only `agent`, which is then also the key (as in the lookup below).
                  agentID: toolCtx.agentID ?? toolCtx.agent,
                  ask: (req) => bridge.promise(toolCtx.ask(req)),
                  directory: ctx.directory,
                  worktree: ctx.worktree,
                }
                const result = yield* safety.run(
                  {
                    tool: id,
                    args,
                    sessionID: toolCtx.sessionID,
                    callID: toolCtx.callID ?? "",
                    directory: ctx.directory,
                    projectID: ctx.project.id,
                    projectDirectory: ctx.worktree === "/" ? ctx.directory : ctx.worktree,
                  },
                  Effect.gen(function* () {
                    const raw = yield* Effect.promise(() => def.execute(args as any, pluginCtx))
                    yield* ToolSafety.inspect(raw)
                    return raw
                  }),
                  () => Effect.void,
                )
                yield* ToolSafety.inspect(result)
                const output = typeof result === "string" ? result : result.output
                const metadata = typeof result === "string" ? {} : (result.metadata ?? {})
                const attachments = typeof result === "string" ? undefined : result.attachments
                // Lookup by stable id (F1.10); `toolCtx.agent` is the display label.
                const info = yield* agent.get(toolCtx.agentID ?? toolCtx.agent)
                const out = yield* truncate.output(output, {}, info)
                return {
                  title: typeof result === "string" ? "" : (result.title ?? ""),
                  output: out.truncated ? out.content : output,
                  attachments,
                  metadata: {
                    ...metadata,
                    truncated: out.truncated,
                    ...(out.truncated && { outputPath: out.outputPath }),
                  },
                }
              }).pipe(
                Effect.orDie,
                Effect.withSpan("Tool.execute", {
                  attributes: {
                    "tool.name": id,
                    "session.id": toolCtx.sessionID,
                    "message.id": toolCtx.messageID,
                    ...(toolCtx.callID ? { "tool.call_id": toolCtx.callID } : {}),
                  },
                }),
              ),
          }
        }

        const dirs = yield* config.directories()
        const matches = dirs.flatMap((dir) =>
          Glob.scanSync("{tool,tools}/*.{js,ts}", { cwd: dir, absolute: true, dot: true, symlink: true }),
        )
        if (matches.length) yield* config.waitForDependencies()
        if (matches.length) yield* Effect.promise(() => PluginSdkRuntime.install())
        for (const match of matches) {
          const namespace = path.basename(match, path.extname(match))
          // `match` is an absolute filesystem path from `Glob.scanSync(..., { absolute: true })`.
          // Import it as `file://` so Node on Windows accepts the dynamic import.
          const mod = yield* Effect.promise(() => import(pathToFileURL(match).href))
          for (const [id, def] of Object.entries(mod)) {
            if (!isPluginTool(def)) continue
            custom.push(fromPlugin(id === "default" ? namespace : `${namespace}_${id}`, def))
          }
        }

        const plugins = yield* plugin.list()
        for (const p of plugins) {
          for (const [id, def] of Object.entries(p.tool ?? {})) {
            custom.push(fromPlugin(id, def))
          }
        }

        yield* config.get()
        const questionEnabled = ["app", "cli", "desktop"].includes(flags.client) || flags.enableQuestionTool
        yield* MaestroArsenalTools.prepare.pipe(Effect.provideService(FSUtil.Service, fs), Effect.orDie)

        const tool = yield* Effect.all({
          invalid: Tool.init(invalid),
          shell: Tool.init(shell),
          read: Tool.init(read),
          recall: Tool.init(recall),
          compact: Tool.init(compact),
          atlasRecall: Tool.init(atlasRecall),
          atlasEmit: Tool.init(atlasEmit),
          glob: Tool.init(globtool),
          grep: Tool.init(greptool),
          edit: Tool.init(edit),
          write: Tool.init(writetool),
          task: Tool.init(task),
          maestroPresentApproval: Tool.init(maestroPresentApproval),
          maestroRecordApproval: Tool.init(maestroRecordApproval),
          maestroRecordAdmission: Tool.init(maestroRecordAdmission),
          maestroRecordPlanRevision: Tool.init(maestroRecordPlanRevision),
          maestroCatalogContext: Tool.init(maestroCatalogContext),
          maestroRecordContext: Tool.init(maestroRecordContext),
          maestroRequestReview: Tool.init(maestroRequestReview),
          maestroRecordValidation: Tool.init(maestroRecordValidation),
          maestroRecordReview: Tool.init(maestroRecordReview),
          maestroGrantAuthorization: Tool.init(maestroGrantAuthorization),
          arsenalCatalog: Tool.init(arsenal[0]),
          arsenalDescribe: Tool.init(arsenal[1]),
          arsenalExecute: Tool.init(arsenal[2]),
          fetch: Tool.init(webfetch),
          todo: Tool.init(todo),
          search: Tool.init(websearch),
          skill: Tool.init(skilltool),
          patch: Tool.init(patchtool),
          question: Tool.init(question),
          lsp: Tool.init(lsptool),
          ...(codeModeTool ? { execute: Tool.init(codeModeTool) } : {}),
        })

        return {
          custom,
          builtin: [
            tool.invalid,
            ...(questionEnabled ? [tool.question] : []),
            tool.shell,
            tool.read,
            tool.recall,
            tool.compact,
            tool.atlasRecall,
            tool.atlasEmit,
            tool.glob,
            tool.grep,
            tool.edit,
            tool.write,
            tool.task,
            tool.maestroPresentApproval,
            tool.maestroRecordApproval,
            tool.maestroRecordAdmission,
            tool.maestroRecordPlanRevision,
            tool.maestroCatalogContext,
            tool.maestroRecordContext,
            tool.maestroRequestReview,
            tool.maestroRecordValidation,
            tool.maestroRecordReview,
            tool.maestroGrantAuthorization,
            tool.arsenalCatalog,
            tool.arsenalDescribe,
            tool.arsenalExecute,
            tool.fetch,
            tool.todo,
            tool.search,
            tool.skill,
            tool.patch,
            ...(tool.execute ? [tool.execute] : []),
            ...(flags.experimentalLspTool ? [tool.lsp] : []),
          ],
          task: tool.task,
          read: tool.read,
        }
      }),
    )

    const definitions = Effect.fn("ToolRegistry.definitions")(function* (durableSafety: boolean) {
      const s = yield* InstanceState.get(state)
      const instance = yield* InstanceState.context
      return [...s.builtin, ...s.custom].map((definition: Tool.Def) => ({
        ...definition,
        execute: (args: unknown, context: Tool.Context) => runtime.withSession(
          context.sessionID,
          runtime.run({
            tool: definition.id,
            args,
            sessionID: context.sessionID,
            assistantMessageID: context.messageID,
            agent: context.agentID ?? context.agent,
            callID: context.callID ?? "",
            directory: instance.directory,
            projectID: instance.project.id,
            projectDirectory: instance.worktree === "/" ? instance.directory : instance.worktree,
          }, definition.execute(args, context), durableSafety, () => context.abort.aborted),
        ).pipe(Effect.orDie),
      }))
    })

    const all: Interface["all"] = () => definitions(true)

    const ids: Interface["ids"] = Effect.fn("ToolRegistry.ids")(function* () {
      return (yield* all()).map((tool) => tool.id)
    })

    const describeTask = Effect.fn("ToolRegistry.describeTask")(function* (
      agent: Agent.Info,
      sessionPermission?: PermissionV1.Ruleset,
    ) {
      const items = (yield* agents.list()).filter((item) => item.mode !== "primary")
      const filtered = items.filter(
        (item) => Permission.evaluate("task", item.id ?? item.name, agent.permission).action !== "deny",
      )
      const list = filtered.toSorted((a, b) => (a.id ?? a.name).localeCompare(b.id ?? b.name))
      const description = list
        .map(
          (item) =>
            `- ${item.id ?? item.name}: ${item.description ?? "No description; start it only when the owner names it."}`,
        )
        .join("\n")
      const sections = ["Teammates you can start:", description]
      const allowed = allowedTaskModels(Permission.merge(agent.permission, sessionPermission ?? []))
      if (allowed.length > 0) {
        sections.push(
          [
            "Allowed subagent models in this session (picked in the Subagents panel; anything else will be denied):",
            ...allowed.map((pattern) => `- ${pattern}`),
            "Pass one as the task tool's `model` parameter.",
          ].join("\n"),
        )
      }
      return sections.join("\n")
    })

    const describeCodeMode = Effect.fn("ToolRegistry.describeCodeMode")(function* (input: {
      agent: Agent.Info
      permission?: PermissionV1.Ruleset
    }) {
      if (!codeMode) return
      const ruleset = Permission.merge(input.agent.permission, input.permission ?? [])
      const tools = Permission.visibleTools(yield* mcp.tools(), ruleset)
      if (Object.keys(tools).length === 0) return
      return codeMode.describeCatalog(tools, Object.keys(yield* mcp.clients()).map(McpCatalog.sanitize))
    })

    const tools: Interface["tools"] = Effect.fn("ToolRegistry.tools")(function* (input) {
      const filtered = (yield* definitions(input.durableSafety !== false)).filter((tool) => {
        if (
          Object.values(MaestroArsenal.names).some((name) => name === tool.id) &&
          (input.agent.id !== "maestro" || input.agent.native !== true)
        )
          return false
        if (
          ((tool.id === MaestroPresentApprovalTool.id ||
            tool.id === MaestroRecordApprovalTool.id ||
            tool.id === MaestroRecordAdmissionTool.id ||
            tool.id === MaestroRecordPlanRevisionTool.id ||
            tool.id === MaestroCatalogContextTool.id ||
            tool.id === MaestroRecordContextTool.id ||
            tool.id === MaestroRequestReviewTool.id ||
            tool.id === MaestroRecordValidationTool.id) &&
            input.agent.id !== "maestro") ||
          (tool.id === MaestroRecordReviewTool.id && input.agent.id !== "lucy") ||
          (tool.id === MaestroGrantAuthorizationTool.id && input.agent.id !== "maestro") ||
          // Bound to the backend seat's Memory owner: a configured agent that merely reuses the id gets neither.
          ((tool.id === AtlasMemoryRecallTool.id || tool.id === AtlasMemoryEmitTool.id) &&
            (input.agent.id !== "backend" || input.agent.native !== true))
        ) {
          return false
        }
        if (
          Permission.disabled([tool.id], input.agent.permission).has(tool.id) ||
          Permission.disabled([tool.id], Permission.merge(input.agent.permission, input.permission ?? [])).has(tool.id)
        ) {
          return false
        }
        if (tool.id === WebSearchTool.id) {
          return webSearchEnabled({ exa: flags.enableExa, parallel: flags.enableParallel })
        }

        const usePatch =
          input.modelID.includes("gpt-") && !input.modelID.includes("oss") && !input.modelID.includes("gpt-4")
        if (tool.id === ApplyPatchTool.id) return usePatch
        if (tool.id === EditTool.id || tool.id === WriteTool.id) return !usePatch

        return true
      })

      const codeModeDescription = filtered.some((tool) => tool.id === "execute")
        ? yield* describeCodeMode(input)
        : undefined
      const visible = filtered.filter((tool) => tool.id !== "execute" || codeModeDescription)

      return yield* Effect.forEach(
        visible,
        Effect.fnUntraced(function* (tool: Tool.Def) {
          const output = {
            description: tool.description,
            parameters: tool.parameters,
            jsonSchema: tool.jsonSchema,
          }
          yield* plugin.trigger("tool.definition", { toolID: tool.id }, output)
          const jsonSchema =
            output.parameters === tool.parameters || output.jsonSchema !== tool.jsonSchema
              ? output.jsonSchema
              : undefined
          const nativeShell =
            tool.id === ShellTool.id &&
            input.agent.native === true &&
            roster.some((member) => member.memberId === input.agent.id && member.nativeProfile)
          return {
            id: tool.id,
            description: [
              nativeShell ? ShellPrompt.nativeSeat(output.description) : output.description,
              tool.id === TaskTool.id ? yield* describeTask(input.agent, input.permission) : undefined,
              tool.id === "execute" ? codeModeDescription : undefined,
            ]
              .filter(Boolean)
              .join("\n"),
            parameters: output.parameters,
            jsonSchema,
            execute: tool.execute,
            formatValidationError: tool.formatValidationError,
          }
        }),
        { concurrency: "unbounded" },
      )
    })

    const named: Interface["named"] = Effect.fn("ToolRegistry.named")(function* () {
      const s = yield* InstanceState.get(state)
      return { task: s.task, read: s.read }
    })

    return Service.of({ ids, all, named, tools })
  }),
)

// Model patterns the session allowlists for subagents: task rules whose
// pattern carries a "/" (provider/model scope), resolved with the same
// last-match-wins semantics the permission check enforces at call time.
export function allowedTaskModels(ruleset: PermissionV1.Ruleset): string[] {
  const candidates = new Set<string>()
  for (const rule of ruleset) {
    if (rule.permission !== "task" || !rule.pattern.includes("/")) continue
    candidates.add(rule.pattern)
  }
  return [...candidates]
    .filter((pattern) => Permission.evaluate("task", pattern, ruleset).action === "allow")
    .toSorted()
}

function isZodType(value: unknown): value is z.ZodType {
  return typeof value === "object" && value !== null && "_zod" in value
}

function isPluginTool(value: unknown): value is ToolDefinition {
  return typeof value === "object" && value !== null && "args" in value && "description" in value && "execute" in value
}

function isJsonSchemaDefinition(value: unknown): value is JSONSchema7Definition {
  return typeof value === "boolean" || (typeof value === "object" && value !== null && !Array.isArray(value))
}

function legacyJsonSchema(entries: [string, unknown][]): JSONSchema7 {
  const properties = Object.fromEntries(
    entries.filter((entry): entry is [string, JSONSchema7Definition] => isJsonSchemaDefinition(entry[1])),
  )
  return {
    type: "object",
    properties,
    required: Object.keys(properties),
  }
}

function zodJsonSchema(schema: z.ZodType): JSONSchema7 {
  const result = normalizeZodJsonSchema(z.toJSONSchema(schema, { io: "input", metadata: zodMetadataRegistry(schema) }))
  if (!isJsonSchemaObject(result)) throw new Error("plugin tool Zod schema produced a non-object JSON Schema")
  const { $defs, ...rest } = result
  return (
    $defs && isJsonSchemaObject($defs) ? { ...rest, definitions: $defs as JSONSchema7["definitions"] } : rest
  ) as JSONSchema7
}

function zodMetadataRegistry(schema: z.ZodType) {
  const registry = z.registry<Record<string, unknown>>()
  const seen = new WeakSet<object>()
  const collect = (value: unknown) => {
    if (typeof value !== "object" || value === null) return
    if (seen.has(value)) return
    seen.add(value)

    if (isZodType(value)) {
      const metadata = typeof value.meta === "function" ? value.meta() : undefined
      const description = typeof value.description === "string" ? value.description : undefined
      const merged = {
        ...(metadata && typeof metadata === "object" ? metadata : {}),
        ...(description ? { description } : {}),
      }
      if (Object.keys(merged).length) registry.add(value, merged)
      collect(value._zod.def)
      return
    }

    for (const item of Object.values(value)) collect(item)
  }
  collect(schema)
  return registry
}

function normalizeZodJsonSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => normalizeZodJsonSchema(item))
  if (typeof value !== "object" || value === null) return value
  return Object.fromEntries(
    Object.entries(value)
      .filter((entry) =>
        (entry[0] === "exclusiveMaximum" || entry[0] === "exclusiveMinimum") && typeof entry[1] === "boolean"
          ? false
          : true,
      )
      .map(([key, item]) => [key, normalizeZodJsonSchema(item)]),
  )
}

function isJsonSchemaObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export const node = LayerNode.make({
  service: Service,
  layer,
  deps: [
    filesystem,
    Config.node,
    Plugin.node,
    Question.node,
    Todo.node,
    Agent.node,
    Skill.node,
    Session.node,
    BackgroundJob.node,
    BackgroundProcess.node,
    Provider.node,
    LSP.node,
    Instruction.node,
    FSUtil.node,
    EventV2Bridge.node,
    Git.node,
    httpClient,
    CrossSpawnSpawner.node,
    Format.node,
    Truncate.node,
    RuntimeFlags.node,
    MCP.node,
    Database.node,
    Archive.node,
    SessionContinuity.node,
    ArsenalObservations.node,
    AppProcess.node,
    Global.node,
    InstanceStore.node,
    Permission.node,
    Ripgrep.node,
    // The Relay service of each Location, which holds the Arsenal completion arms (ArsenalBindings.make).
    LocationServiceMap.node,
  ],
})

export * as ToolRegistry from "./registry"
