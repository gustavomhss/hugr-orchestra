import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { PermissionV1 } from "@opencode-ai/core/v1/permission"
import { Config } from "@/config/config"
import { serviceUse } from "@opencode-ai/core/effect/service-use"
import { Provider } from "@/provider/provider"

import { generateObject, streamObject, type ModelMessage } from "ai"
import { Truncate } from "@/tool/truncate"
import { Auth } from "../auth"
import { ProviderTransform } from "@/provider/transform"

import PROMPT_GENERATE from "./generate.txt"
import { AgentPrompt } from "@opencode-ai/core/agent/prompt"
import { Permission } from "@/permission"
import { mergeDeep, values } from "remeda"
import { Global } from "@opencode-ai/core/global"
import path from "path"
import { Plugin } from "@/plugin"
import { Skill } from "../skill"
import { Effect, Context, Layer, Schema } from "effect"
import { InstanceState } from "@/effect/instance-state"
import * as Option from "effect/Option"
import * as OtelTracer from "@effect/opentelemetry/Tracer"
import { AbsolutePath, type DeepMutable } from "@opencode-ai/core/schema"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ModelV2 } from "@opencode-ai/core/model"
import { LocationServiceMap, locationServiceMapLayer } from "@opencode-ai/core/location-services"
import { Reference } from "@opencode-ai/core/reference"
import { Location } from "@opencode-ai/core/location"
import { PluginV2 } from "@opencode-ai/core/plugin"
import { roster, nativeProfiles, envRead, publishRules } from "@/maestro/roster"

export const Info = Schema.Struct({
  id: Schema.optional(Schema.String),
  name: Schema.String,
  description: Schema.optional(Schema.String),
  mode: Schema.Literals(["subagent", "primary", "all"]),
  native: Schema.optional(Schema.Boolean),
  hidden: Schema.optional(Schema.Boolean),
  topP: Schema.optional(Schema.Finite),
  temperature: Schema.optional(Schema.Finite),
  color: Schema.optional(Schema.String),
  permission: PermissionV1.Ruleset,
  model: Schema.optional(
    Schema.Struct({
      modelID: ModelV2.ID,
      providerID: ProviderV2.ID,
    }),
  ),
  variant: Schema.optional(Schema.String),
  prompt: Schema.optional(Schema.String),
  options: Schema.Record(Schema.String, Schema.Unknown),
  steps: Schema.optional(Schema.Finite),
}).annotate({ identifier: "Agent" })
export type Info = DeepMutable<Schema.Schema.Type<typeof Info>>

// What each roster native profile lets a teammate do, as the task tool lists it.
const nativeAccess = {
  execution: "Edits files and runs shell commands.",
  review: "Read-only: reads and searches files; cannot edit or run commands.",
} satisfies Record<keyof typeof nativeProfiles, string>

const GeneratedAgent = Schema.Struct({
  identifier: Schema.String,
  whenToUse: Schema.String,
  systemPrompt: Schema.String,
})

export interface Interface {
  readonly get: (agent: string) => Effect.Effect<Info>
  readonly list: () => Effect.Effect<Info[]>
  readonly defaultInfo: () => Effect.Effect<Info>
  readonly defaultAgent: () => Effect.Effect<string>
  readonly generate: (input: {
    description: string
    model?: { providerID: ProviderV2.ID; modelID: ModelV2.ID }
  }) => Effect.Effect<
    {
      identifier: string
      whenToUse: string
      systemPrompt: string
    },
    Provider.DefaultModelError
  >
}

type State = Omit<Interface, "generate">

export class Service extends Context.Service<Service, Interface>()("@opencode/Agent") {}

export const use = serviceUse(Service)

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const config = yield* Config.Service
    const auth = yield* Auth.Service
    const plugin = yield* Plugin.Service
    const skill = yield* Skill.Service
    const provider = yield* Provider.Service
    const locations = yield* LocationServiceMap.Service
    const global = yield* Global.Service

    const state = yield* InstanceState.make<State>(
      Effect.fn("Agent.state")(function* (ctx) {
        const cfg = yield* config.get()
        const skillDirs = yield* skill.dirs()
        const referenceDirs = Object.keys(cfg.references ?? cfg.reference ?? {}).length
          ? yield* Effect.gen(function* () {
              yield* (yield* PluginV2.Service).wait(PluginV2.ID.make("core/config-reference"))
              return (yield* (yield* Reference.Service).list()).map((reference) => reference.path)
            }).pipe(Effect.provide(locations.get(Location.Ref.make({ directory: AbsolutePath.make(ctx.directory) }))))
          : []
        const whitelistedDirs = [
          Truncate.GLOB,
          path.join(Global.Path.tmp, "*"),
          ...skillDirs.map((dir) => path.join(dir, "*")),
          ...referenceDirs.map((dir) => path.join(dir, "*")),
        ]
        const readonlyExternalDirectory = {
          "*": "ask",
          ...Object.fromEntries(whitelistedDirs.map((dir) => [dir, "allow"])),
        } satisfies Record<string, "allow" | "ask" | "deny">

        const defaults = Permission.fromConfig({
          "*": "allow",
          doom_loop: "ask",
          external_directory: {
            "*": "ask",
            ...Object.fromEntries(whitelistedDirs.map((dir) => [dir, "allow"])),
          },
          question: "deny",
          read: envRead("ask"),
        })

        // Maestro and general ask before publishing, and user config can allow it. Their skill list leaves out the
        // built-in skill for configuring opencode and the skills in the global Claude and agents directories, which
        // are written for other tools. Location rules affect only that list (see Skill.available).
        const team = Permission.fromConfig({
          bash: publishRules("ask"),
          skill: {
            [Skill.CUSTOMIZE_OPENCODE_SKILL_NAME]: "deny",
            [path.join(global.home, ".claude", "skills", "*")]: "deny",
            [path.join(global.home, ".agents", "skills", "*")]: "deny",
          },
        })

        const user = Permission.fromConfig(cfg.permission ?? {})

        const agents: Record<string, Info> = {
          maestro: {
            id: "maestro",
            name: "maestro",
            description: "High-agency development orchestrator. Uses governed approval only when explicitly requested.",
            prompt: AgentPrompt.maestro,
            options: {},
            permission: Permission.merge(defaults, Permission.fromConfig({ question: "allow" }), team, user),
            mode: "primary",
            native: true,
          },
          general: {
            id: "general",
            name: "general",
            description:
              "General-purpose work from a full brief: research, analysis or multi-step changes no seat covers. Edits files and runs shell commands; cannot ask the owner questions or start teammates. Returns the outcome, what changed, how it was checked and what is left.",
            prompt: AgentPrompt.general,
            permission: Permission.merge(
              defaults,
              // Playbooks are Maestro's procedures: general's skill list leaves them out, but a brief can still name one.
              Permission.fromConfig({ todowrite: "deny", skill: { [path.join(Skill.PLAYBOOKS_DIR, "*")]: "deny" } }),
              team,
              user,
            ),
            options: {},
            mode: "subagent",
            native: true,
          },
          explore: {
            id: "explore",
            name: "explore",
            permission: Permission.merge(
              defaults,
              Permission.fromConfig({
                "*": "deny",
                grep: "allow",
                glob: "allow",
                list: "allow",
                // Explore only reads, so it never publishes.
                bash: { "*": "allow", ...publishRules("deny") },
                webfetch: "allow",
                websearch: "allow",
                read: envRead("ask"),
                external_directory: readonlyExternalDirectory,
              }),
              user,
            ),
            description:
              'Read-only codebase exploration: finds files and code and explains how they work. Reads and searches files and the web, and runs read-only shell commands; cannot edit. Say how thorough to be: "quick", "medium" or "very thorough". Returns findings with file and line references.',
            prompt: AgentPrompt.explore,
            options: {},
            mode: "subagent",
            native: true,
          },
          compaction: {
            id: "compaction",
            name: "compaction",
            mode: "primary",
            native: true,
            hidden: true,
            prompt: AgentPrompt.compaction,
            permission: Permission.merge(
              defaults,
              Permission.fromConfig({
                "*": "deny",
              }),
              user,
            ),
            options: {},
          },
          title: {
            id: "title",
            name: "title",
            mode: "primary",
            options: {},
            native: true,
            hidden: true,
            temperature: 0.5,
            permission: Permission.merge(
              defaults,
              Permission.fromConfig({
                "*": "deny",
              }),
              user,
            ),
            prompt: AgentPrompt.title,
          },
          summary: {
            id: "summary",
            name: "summary",
            mode: "primary",
            options: {},
            native: true,
            hidden: true,
            permission: Permission.merge(
              defaults,
              Permission.fromConfig({
                "*": "deny",
              }),
              user,
            ),
            prompt: AgentPrompt.summary,
          },
          ...Object.fromEntries(
            roster
              .filter((member) => member.nativeProfile && member.prompt)
              .map((member) => [
                member.memberId,
                {
                  id: member.memberId,
                  name: member.displayName,
                  description: `${member.role.charAt(0).toUpperCase()}${member.role.slice(1)}. ${nativeAccess[member.nativeProfile!]} Returns ${member.returnCard}.`,
                  prompt: member.prompt,
                  options: {},
                  permission: Permission.fromConfig(nativeProfiles[member.nativeProfile!]),
                  mode: "subagent" as const,
                  native: true,
                },
              ]),
          ),
        }

        for (const [key, value] of Object.entries(cfg.agent ?? {})) {
          if (roster.some((member) => member.memberId === key && member.nativeProfile)) {
            const item = agents[key]
            if (value.model) item.model = Provider.parseModel(value.model)
            item.variant = value.variant ?? item.variant
            item.temperature = value.temperature ?? item.temperature
            continue
          }
          if (value.disable) {
            delete agents[key]
            continue
          }
          let item = agents[key]
          if (!item)
            item = agents[key] = {
              id: key,
              name: key,
              mode: "all",
              permission: Permission.merge(defaults, user),
              options: {},
              native: false,
            }
          if (value.model) item.model = Provider.parseModel(value.model)
          item.variant = value.variant ?? item.variant
          item.prompt = value.prompt ?? item.prompt
          item.description = value.description ?? item.description
          item.temperature = value.temperature ?? item.temperature
          item.topP = value.top_p ?? item.topP
          item.mode = value.mode ?? item.mode
          item.color = value.color ?? item.color
          item.hidden = value.hidden ?? item.hidden
          item.name = value.name ?? item.name
          item.steps = value.steps ?? item.steps
          item.options = mergeDeep(item.options, value.options ?? {})
          item.permission = Permission.merge(item.permission, Permission.fromConfig(value.permission ?? {}))
        }

        // Ensure Truncate.GLOB is allowed unless explicitly configured
        for (const name in agents) {
          const agent = agents[name]
          if (roster.some((member) => member.memberId === name && member.nativeProfile)) continue
          const explicit = agent.permission.some((r) => {
            if (r.permission !== "external_directory") return false
            if (r.action !== "deny") return false
            return r.pattern === Truncate.GLOB
          })
          if (explicit) continue

          agents[name].permission = Permission.merge(
            agents[name].permission,
            Permission.fromConfig({ external_directory: { [Truncate.GLOB]: "allow" } }),
          )
        }

        const get = Effect.fnUntraced(function* (agent: string) {
          return agents[agent]
        })

        const list = Effect.fnUntraced(function* () {
          const cfg = yield* config.get()
          const defaultID = cfg.default_agent || "maestro"
          return values(agents).toSorted((a, b) => {
            if (a.id === defaultID) return -1
            if (b.id === defaultID) return 1
            return a.name.localeCompare(b.name)
          })
        })

        // Maestro is the default. Another primary agent becomes the default only when default_agent names it, so
        // disabling Maestro without naming a replacement fails instead of picking a configured agent.
        const defaultInfo = Effect.fnUntraced(function* () {
          const cfg = yield* config.get()
          const id = cfg.default_agent || "maestro"
          const agent = agents[id]
          if (!agent) throw new Error(`default agent "${id}" not found`)
          if (agent.mode === "subagent") throw new Error(`default agent "${id}" is a subagent`)
          if (agent.hidden === true) throw new Error(`default agent "${id}" is hidden`)
          return agent
        })

        const defaultAgent = Effect.fnUntraced(function* () {
          const agent = yield* defaultInfo()
          return agent.id ?? agent.name
        })

        return {
          get,
          list,
          defaultInfo,
          defaultAgent,
        } satisfies State
      }),
    )

    return Service.of({
      get: Effect.fn("Agent.get")(function* (agent: string) {
        return yield* InstanceState.useEffect(state, (s) => s.get(agent))
      }),
      list: Effect.fn("Agent.list")(function* () {
        return yield* InstanceState.useEffect(state, (s) => s.list())
      }),
      defaultInfo: Effect.fn("Agent.defaultInfo")(function* () {
        return yield* InstanceState.useEffect(state, (s) => s.defaultInfo())
      }),
      defaultAgent: Effect.fn("Agent.defaultAgent")(function* () {
        return yield* InstanceState.useEffect(state, (s) => s.defaultAgent())
      }),
      generate: Effect.fn("Agent.generate")(function* (input: {
        description: string
        model?: { providerID: ProviderV2.ID; modelID: ModelV2.ID }
      }) {
        const cfg = yield* config.get()
        const model = input.model ?? (yield* provider.defaultModel())
        const resolved = yield* provider.getModel(model.providerID, model.modelID)
        const language = yield* provider.getLanguage(resolved)
        const tracer = cfg.experimental?.openTelemetry
          ? Option.getOrUndefined(yield* Effect.serviceOption(OtelTracer.OtelTracer))
          : undefined

        const system = [PROMPT_GENERATE]
        yield* plugin.trigger("experimental.chat.system.transform", { model: resolved }, { system })
        const existing = yield* InstanceState.useEffect(state, (s) => s.list())

        // TODO: clean this up so provider specific logic doesnt bleed over
        const authInfo = yield* auth.get(model.providerID).pipe(Effect.orDie)
        const isOpenaiOauth = model.providerID === "openai" && authInfo?.type === "oauth"

        const params = {
          experimental_telemetry: {
            isEnabled: cfg.experimental?.openTelemetry,
            tracer,
            metadata: {
              userId: cfg.username ?? "unknown",
            },
          },
          temperature: 0.3,
          messages: [
            ...(isOpenaiOauth
              ? []
              : system.map(
                  (item): ModelMessage => ({
                    role: "system",
                    content: item,
                  }),
                )),
            {
              role: "user",
              content: `Create an agent configuration based on this request: "${input.description}".\n\nIMPORTANT: The following identifiers already exist and must NOT be used: ${existing.map((i) => i.name).join(", ")}\n  Return ONLY the JSON object, no other text, do not wrap in backticks`,
            },
          ],
          model: language,
          schema: Object.assign(
            Schema.toStandardSchemaV1(GeneratedAgent),
            Schema.toStandardJSONSchemaV1(GeneratedAgent),
          ),
        } satisfies Parameters<typeof generateObject>[0]

        if (isOpenaiOauth) {
          return yield* Effect.promise(async () => {
            const result = streamObject({
              ...params,
              providerOptions: ProviderTransform.providerOptions(resolved, {
                instructions: system.join("\n"),
                store: false,
              }),
              onError: () => {},
            })
            for await (const part of result.fullStream) {
              if (part.type === "error") throw part.error
            }
            return result.object
          })
        }

        return yield* Effect.promise(() => generateObject(params).then((r) => r.object))
      }),
    })
  }),
)

const locationServiceMapNode = LayerNode.make({
  service: LocationServiceMap.Service,
  layer: locationServiceMapLayer,
  deps: [],
})

export const node = LayerNode.make({
  service: Service,
  layer: layer,
  deps: [Config.node, Auth.node, Plugin.node, Skill.node, Provider.node, locationServiceMapNode, Global.node],
})

export * as Agent from "./agent"
