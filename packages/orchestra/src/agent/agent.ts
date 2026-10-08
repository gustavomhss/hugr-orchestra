import { LayerNode } from "@orchestra/core/effect/layer-node"
import { PermissionV1 } from "@orchestra/core/v1/permission"
import { Config } from "@/config/config"
import { serviceUse } from "@orchestra/core/effect/service-use"
import { Provider } from "@/provider/provider"

import { generateObject, streamObject, type ModelMessage } from "ai"
import { Truncate } from "@/tool/truncate"
import { Auth } from "../auth"
import { ProviderTransform } from "@/provider/transform"

import PROMPT_GENERATE from "./generate.txt"
import { AgentPrompt } from "@orchestra/core/agent/prompt"
import { Permission } from "@/permission"
import { mergeDeep, values } from "remeda"
import { Global } from "@orchestra/core/global"
import path from "path"
import { Plugin } from "@/plugin"
import { Skill } from "../skill"
import { Effect, Context, Layer, Schema } from "effect"
import { InstanceState } from "@/effect/instance-state"
import * as Option from "effect/Option"
import * as OtelTracer from "@effect/opentelemetry/Tracer"
import { AbsolutePath, type DeepMutable } from "@orchestra/core/schema"
import { ProviderV2 } from "@orchestra/core/provider"
import { ModelV2 } from "@orchestra/core/model"
import { LocationServiceMap, locationServiceMapLayer } from "@orchestra/core/location-services"
import { Reference } from "@orchestra/core/reference"
import { Location } from "@orchestra/core/location"
import { PluginV2 } from "@orchestra/core/plugin"
import {
  roster,
  nativeProfiles,
  envRead,
  publishRules,
  backendSkills,
  canonicalMemberId,
  LEGACY_BACKEND_ID,
  renderPrompt,
  type RosterMember,
} from "@/maestro/roster"
import { containsPath } from "@/project/instance-context"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { EventV2Bridge } from "@/event-v2-bridge"
import { NamedError } from "@orchestra/core/util/error"
import { SessionV1 } from "@orchestra/core/v1/session"

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
  /** Harness that runs this agent's turns; unset is Orchestra's own loop. */
  engine: Schema.optional(Schema.Literals(["orchestra", "claude-code"])),
}).annotate({ identifier: "Agent" })
export type Info = DeepMutable<Schema.Schema.Type<typeof Info>>

// What each roster native profile lets a teammate do, as the task tool lists it.
const nativeAccess = {
  execution: "Edits files and runs shell commands.",
  backend: "Edits files and runs shell commands.",
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

export class Service extends Context.Service<Service, Interface>()("@orchestra/Agent") {}

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
    const flags = yield* RuntimeFlags.Service
    const events = yield* EventV2Bridge.Service

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
        // skills in the global Claude and agents directories, which are written for other tools. Location rules
        // affect only that list (see Skill.available).
        const team = Permission.fromConfig({
          bash: publishRules("ask"),
          skill: {
            [path.join(global.home, ".claude", "skills", "*")]: "deny",
            [path.join(global.home, ".agents", "skills", "*")]: "deny",
          },
        })

        const user = Permission.fromConfig(cfg.permission ?? {})
        // The backend specialist's profile grants external access to its packaged skill root; edit patterns are worktree-relative,
        // so the deny that keeps that root read-only is rendered here. Inside the project it is ordinary source.
        const backendReadOnly = containsPath(backendSkills.root, ctx)
          ? []
          : Permission.fromConfig({
              edit: { [path.join(path.relative(ctx.worktree, backendSkills.root), "*")]: "deny" },
            })

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
                  ...present(member, member.displayName),
                  options: {},
                  permission: Permission.merge(
                    Permission.fromConfig(nativeProfiles[member.nativeProfile!]),
                    member.nativeProfile === "backend" ? backendReadOnly : [],
                  ),
                  // The user talks only to Maestro, so every seat, the backend specialist included, works only as
                  // Maestro's teammate and never as a primary agent.
                  mode: "subagent" as const,
                  native: true,
                },
              ]),
          ),
        }

        // Config written before the backend seat's rename keys the seat by its former id. That key still configures the
        // seat, never a custom agent, and warns on the channel invalid labels use; when `agent.backend` is also set, it wins.
        const legacyBackend = cfg.agent?.[LEGACY_BACKEND_ID]
        const backendKey = legacyBackend && !cfg.agent?.backend ? LEGACY_BACKEND_ID : "backend"
        const agentConfig = Object.fromEntries(
          Object.entries(cfg.agent ?? {}).flatMap(([key, value]) => {
            if (key !== LEGACY_BACKEND_ID) return [[key, value] as const]
            return backendKey === LEGACY_BACKEND_ID ? [["backend", value] as const] : []
          }),
        )
        if (legacyBackend) {
          const message =
            backendKey === LEGACY_BACKEND_ID
              ? `Deprecated configuration agent.${LEGACY_BACKEND_ID}: rename it to agent.backend.`
              : `Deprecated configuration agent.${LEGACY_BACKEND_ID} is ignored: agent.backend is also set and takes precedence.`
          yield* Effect.logWarning("deprecated native seat configuration", { path: `agent.${LEGACY_BACKEND_ID}` })
          yield* events.publish(SessionV1.Event.Error, { error: new NamedError.Unknown({ message }).toObject() })
        }
        // Maestro's name is fixed: the app and other Sessions find and address the conductor by it. Team seats stay
        // renameable through their own `agent.<id>.name`.
        if (agentConfig.maestro?.name !== undefined) {
          const message = "Configuration agent.maestro.name is ignored: Maestro's name is fixed."
          yield* Effect.logWarning("fixed agent name", { path: "agent.maestro.name" })
          yield* events.publish(SessionV1.Event.Error, { error: new NamedError.Unknown({ message }).toObject() })
        }

        for (const [key, value] of Object.entries(agentConfig)) {
          // Native seats accept only model, variant, temperature and their display label (resolved below).
          if (roster.some((member) => member.memberId === key && member.nativeProfile)) {
            const item = agents[key]
            if (value.model) item.model = Provider.parseModel(value.model)
            item.variant = value.variant ?? item.variant
            item.temperature = value.temperature ?? item.temperature
            continue
          }
          // Every session runs on Maestro, so configuration may neither disable it nor take it out of primary mode.
          if (value.disable && key !== "maestro") {
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
          item.mode = key === "maestro" ? item.mode : (value.mode ?? item.mode)
          item.color = value.color ?? item.color
          item.hidden = value.hidden ?? item.hidden
          if (key !== "maestro") item.name = value.name ?? item.name
          item.steps = value.steps ?? item.steps
          // Maestro always runs on Orchestra's loop: it coordinates the other engines.
          if (key !== "maestro") item.engine = value.engine ?? item.engine
          item.options = mergeDeep(item.options, value.options ?? {})
          item.permission = Permission.merge(item.permission, Permission.fromConfig(value.permission ?? {}))
        }

        // A native seat's label is presentation only (F1.2): it never changes the seat's id, permissions, skills or
        // routing. Config `agent.<id>.name` sets it, HUGR_BACKEND_NAME overrides it for the backend seat (F1-D2), and an
        // invalid label keeps the default and surfaces a configuration error instead of failing startup (F1-D1).
        const overrides: Record<string, { path: string; value: string } | undefined> = {
          backend: flags.backendName === undefined ? undefined : { path: "HUGR_BACKEND_NAME", value: flags.backendName },
        }
        for (const member of roster.filter((member) => member.nativeProfile && member.prompt)) {
          const configured = agentConfig[member.memberId]?.name
          const key = member.memberId === "backend" ? backendKey : member.memberId
          const source =
            overrides[member.memberId] ??
            (configured === undefined ? undefined : { path: `agent.${key}.name`, value: configured })
          if (!source) continue
          const label = typeof source.value === "string" ? source.value.trim() : ""
          const problem = labelProblem(
            label,
            Object.values(agents).filter((agent) => agent.id !== member.memberId),
          )
          if (problem) {
            // Same channel as skill and plugin load failures: a Session error event the clients already render.
            const message = `Invalid configuration ${source.path}: label ${problem}. Using "${member.displayName}".`
            yield* Effect.logWarning("invalid native seat label", { path: source.path, problem })
            yield* events.publish(SessionV1.Event.Error, { error: new NamedError.Unknown({ message }).toObject() })
            continue
          }
          Object.assign(agents[member.memberId], present(member, label))
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

        // Stored sessions, messages and Task calls may name the backend seat by its former id.
        const get = Effect.fnUntraced(function* (agent: string) {
          return agents[canonicalMemberId(agent)]
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
              content: `Create an agent configuration based on this request: "${input.description}".\n\nIMPORTANT: The following identifiers already exist and must NOT be used: ${existing.map((i) => i.id ?? i.name).join(", ")}\n  Return ONLY the JSON object, no other text, do not wrap in backticks`,
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

// Renders a native seat's presentation from its label. The description is how the task tool lists the seat, so it
// gives the role, access and return and never the label.
function present(member: RosterMember, label: string) {
  const access = nativeAccess[member.nativeProfile!]
  return {
    name: label,
    description:
      member.memberId === "backend"
        ? `Backend implementation specialist. Use it to implement one complete backend work packet: the target behavior with its acceptance, the write paths, and the checks to run. ${access} Returns the change, check evidence and blockers. Not for investigation, diagnosis, design or review.`
        : `${member.role.charAt(0).toUpperCase()}${member.role.slice(1)}. ${access} Returns ${member.returnCard}.`,
    prompt: renderPrompt(member, label),
  }
}

const reservedLabels = new Set(["build", "plan", "general", "explore", "maestro", "title", "summary", "compaction"])

// F1.3 / F1-D1: a label must stay unambiguous against every id and label, because legacy `.name` paths still exist.
function labelProblem(label: string, others: Info[]) {
  if (!label) return "empty"
  if ([...label].length > 40) return "longer than 40 characters"
  if (/[\p{Cc}\p{Zl}\p{Zp}]/u.test(label)) return "contains a control character or line break"
  const folded = fold(label)
  if (reservedLabels.has(folded)) return "reserved agent id"
  if (others.some((agent) => fold(agent.name) === folded || (agent.id !== undefined && fold(agent.id) === folded)))
    return "already used by another agent"
}

function fold(value: string) {
  return value.normalize("NFC").toLowerCase()
}

const locationServiceMapNode = LayerNode.make({
  service: LocationServiceMap.Service,
  layer: locationServiceMapLayer,
  deps: [],
})

export const node = LayerNode.make({
  service: Service,
  layer: layer,
  deps: [
    Config.node,
    Auth.node,
    Plugin.node,
    Skill.node,
    Provider.node,
    locationServiceMapNode,
    Global.node,
    RuntimeFlags.node,
    EventV2Bridge.node,
  ],
})

export * as Agent from "./agent"
