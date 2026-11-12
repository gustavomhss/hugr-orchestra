import { createStore } from "solid-js/store"
import { createSimpleContext } from "./helper"
import { batch, createComputed, createEffect, createMemo, onCleanup, untrack } from "solid-js"
import { makeModelExecutionQuery, type ModelExecutionState } from "@orchestra/client"
import { useSync } from "./sync"
import { useEvent } from "./event"
import path from "path"
import { useTuiPaths } from "./runtime"
import { useArgs } from "./args"
import { useSDK } from "./sdk"
import { RGBA } from "@opentui/core"
import { readJson, writeJsonAtomic } from "../util/persistence"
import { useTheme } from "./theme"
import { useToast } from "../ui/toast"
import { useRoute } from "./route"
import { usePermission } from "./permission"
import { agentKey } from "../util/agent"
import type { ModelExecution } from "@orchestra/schema/model-execution"

export function modelExecutionReason(reason?: ModelExecution.Reason) {
  if (!reason) return "This model is unavailable for this session. Choose an available model or try again."
  return {
    "model-missing": "Model is no longer available",
    "model-disabled": "Model is disabled",
    "connection-unavailable": "Connect this provider to use the model",
    "model-denied": "Model is not allowed for this session",
    "unsupported-api": "Model is not supported by this engine",
    "invalid-options": "Model settings are invalid",
    "variant-unavailable": "Selected variant is unavailable",
    "host-unregistered": "Selected engine is not installed",
    "host-unavailable": "Selected engine is unavailable",
    "host-model-unsupported": "Model is not supported by this engine",
    "host-options-unsupported": "Selected settings are not supported by this engine",
  }[reason]
}

export type LocalTheme = {
  secondary: RGBA
  accent: RGBA
  success: RGBA
  warning: RGBA
  primary: RGBA
  error: RGBA
  info: RGBA
}

export function parseModel(model: string) {
  const [providerID, ...rest] = model.split("/")
  return {
    providerID: providerID,
    modelID: rest.join("/"),
  }
}

export function recentModels(
  model: { providerID: string; modelID: string },
  recent: { providerID: string; modelID: string }[],
) {
  const seen = new Set<string>()
  return [model, ...recent]
    .filter((item) => {
      const key = `${item.providerID}/${item.modelID}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 10)
    .map((item) => ({ providerID: item.providerID, modelID: item.modelID }))
}

export const { use: useLocal, provider: LocalProvider } = createSimpleContext({
  name: "Local",
  init: () => {
    const sync = useSync()
    const sdk = useSDK()
    const toast = useToast()
    const theme = useTheme().theme
    const route = useRoute()
    const paths = useTuiPaths()
    const args = useArgs()
    const event = useEvent()
    const permission = usePermission()

    function isModelValid(model: { providerID: string; modelID: string }) {
      const provider = sync.data.provider.find((item) => item.id === model.providerID)
      return !!provider?.models[model.modelID]
    }

    function createAgent() {
      const agents = createMemo(() => sync.data.agent.filter((agent) => agent.mode !== "subagent" && !agent.hidden))
      const visibleAgents = createMemo(() => sync.data.agent.filter((agent) => !agent.hidden))
      const [agentStore, setAgentStore] = createStore({
        current: undefined as string | undefined,
      })
      const colors = createMemo(() => [
        theme.secondary,
        theme.accent,
        theme.success,
        theme.warning,
        theme.primary,
        theme.error,
        theme.info,
      ])
      return {
        list() {
          return agents()
        },
        current() {
          return agents().find((x) => agentKey(x) === agentStore.current) ?? agents().at(0)
        },
        set(name: string) {
          if (!agents().some((x) => agentKey(x) === name))
            return toast.show({
              variant: "warning",
              message: `Agent not found: ${name}`,
              duration: 3000,
            })
          setAgentStore("current", name)
        },
        move(direction: 1 | -1) {
          batch(() => {
            const current = this.current()
            if (!current) return
            let next = agents().findIndex((x) => agentKey(x) === agentKey(current)) + direction
            if (next < 0) next = agents().length - 1
            if (next >= agents().length) next = 0
            const value = agents()[next]
            setAgentStore("current", agentKey(value))
          })
        },
        color(name: string) {
          const index = visibleAgents().findIndex((x) => agentKey(x) === name)
          if (index === -1) return colors()[0]
          const agent = visibleAgents()[index]

          if (agent?.color) {
            const color = agent.color
            if (color.startsWith("#")) return RGBA.fromHex(color)
            // already validated by config, just satisfying TS here
            return theme[color as keyof typeof theme] as RGBA
          }
          return colors()[index % colors().length]
        },
      }
    }

    const agent = createAgent()

    function createModel() {
      const [modelStore, setModelStore] = createStore<{
        ready: boolean
        model: Record<
          string,
          {
            providerID: string
            modelID: string
          }
        >
        recent: {
          providerID: string
          modelID: string
        }[]
        favorite: {
          providerID: string
          modelID: string
        }[]
        variant: Record<string, string | undefined>
        variantIntent: Record<string, string | null>
      }>({
        ready: false,
        model: {},
        recent: [],
        favorite: [],
        variant: {},
        variantIntent: {},
      })

      const filePath = path.join(paths.state, "model.json")
      const state = {
        pending: false,
      }

      function save() {
        if (!modelStore.ready) {
          state.pending = true
          return
        }
        state.pending = false
        void writeJsonAtomic(filePath, {
          recent: modelStore.recent,
          favorite: modelStore.favorite,
          variant: modelStore.variant,
          variantIntent: modelStore.variantIntent,
        })
      }

      readJson<unknown>(filePath)
        .then((x) => {
          if (!x || typeof x !== "object") return
          const value = x as Record<string, unknown>
          if (Array.isArray(value.recent)) setModelStore("recent", value.recent)
          if (Array.isArray(value.favorite)) setModelStore("favorite", value.favorite)
          if (typeof value.variant === "object" && value.variant !== null)
            setModelStore("variant", value.variant as Record<string, string | undefined>)
          if (typeof value.variantIntent === "object" && value.variantIntent !== null && !Array.isArray(value.variantIntent))
            setModelStore("variantIntent", { ...Object.fromEntries(Object.entries(value.variantIntent).flatMap(([key, entry]) =>
              typeof entry === "string" || entry === null ? [[key, entry] as const] : [])), ...modelStore.variantIntent })
        })
        .catch(() => {})
        .finally(() => {
          setModelStore("ready", true)
          if (state.pending) save()
        })

      const fallbackModel = createMemo(() => {
        if (args.model) {
          return parseModel(args.model)
        }

        if (sync.data.config.model) {
          return parseModel(sync.data.config.model)
        }

        for (const item of modelStore.recent) {
          return item
        }

        const provider = sync.data.provider[0]
        if (!provider) return undefined
        const defaultModel = sync.data.provider_default[provider.id]
        const firstModel = Object.values(provider.models)[0]
        const model = defaultModel ?? firstModel?.id
        if (!model) return undefined
        return {
          providerID: provider.id,
          modelID: model,
        }
      })

      const chosen = () => {
        const a = agent.current()
        return (a && modelStore.model[agentKey(a)]) ?? (args.model ? parseModel(args.model) : undefined)
      }
      const candidate = () => chosen() ?? agent.current()?.model ?? fallbackModel()
      const intent = () => {
        const keyModel = chosen() ?? candidate()
        const key = keyModel && `${keyModel.providerID}/${keyModel.modelID}`
        const variant = key && key in modelStore.variantIntent ? modelStore.variantIntent[key]
          : key ? modelStore.variant[key] : undefined
        return { model: chosen(), variant }
      }
      const [view, setView] = createStore<{ value: ModelExecutionState }>({ value: { status: "idle" } })
      const context = createMemo(() => JSON.stringify({ agents: sync.data.agent, config: sync.data.config,
        provider: sync.data.provider, providerDefault: sync.data.provider_default, providerNext: sync.data.provider_next,
        catalogRevision: sync.data.catalogRevision, semanticEpoch: sdk.modelExecutionEpoch() }))
      const owner = createMemo(() => {
        const model = candidate()
        const a = agent.current()
        const raw = intent()
        const variant = typeof raw.variant === "string" ? raw.variant : raw.variant === null ? undefined
          : model && a?.model?.providerID === model.providerID && a.model.modelID === model.modelID && a.variant !== undefined
            ? a.variant : undefined
        const sessionID = route.data.type === "session" ? route.data.sessionID : undefined
        const binding = sdk.binding()
        const request = { location: { directory: sdk.directory },
          context: sessionID ? { type: "session" as const, sessionID, agentID: a && agentKey(a) }
            : { type: "draft" as const, agentID: a && agentKey(a) },
          model: model ? { providerID: model.providerID, id: model.modelID, variant: variant ?? undefined } : undefined }
        return { key: JSON.stringify({ request, raw, context: context(), url: binding.url, directory: binding.directory,
          headers: [...new Headers(binding.headers).entries()] }), fetch: binding.fetch,
          epoch: sdk.connectionEpoch(), request }
      }, undefined, { equals: (a, b) => !!a && a.key === b.key && a.epoch === b.epoch && a.fetch === b.fetch })
      let readyOwner: ReturnType<typeof owner> | undefined
      createEffect(() => {
        if (!modelStore.ready || !sdk.binding().active) return
        const selected = chosen() ?? candidate()
        if (!selected) return
        const key = `${selected.providerID}/${selected.modelID}`
        if (key in modelStore.variantIntent || modelStore.variant[key] !== "default") return
        const canonical = view.value
        const assessed = canonical.status === "ready" && readyOwner === owner() ? canonical.response.data.models.find((entry) =>
          entry.model.providerID === selected.providerID && entry.model.id === selected.modelID)?.model : undefined
        const metadata = sync.data.provider.find((provider) => provider.id === selected.providerID)?.models[selected.modelID]
        if (!assessed && !metadata) return
        const named = assessed ? assessed.variants.some((variant) => variant.id === "default") : !!metadata?.variants && "default" in metadata.variants
        setModelStore("variantIntent", key, named ? "default" : null)
        save()
      })
      const lifetime = { disposed: false }
      const executionQuery = makeModelExecutionQuery({ execute: async (input, options) => {
        const captured = owner()
        if (!sdk.binding().active) throw new DOMException("", "AbortError")
        const response = await sdk.api.models.execution(input, options)
        if (owner() !== captured || !sdk.binding().active) throw new DOMException("", "AbortError")
        return response
      },
        changed: (value) => { readyOwner = value.status === "ready" ? owner() : undefined; setView("value", value) } })
      createComputed(() => {
        const captured = owner()
        const ready = modelStore.ready
        untrack(() => {
          if (!ready || !captured.request.model) { executionQuery.invalidate(); return }
          void executionQuery.load(captured, captured.request)
        })
      })
      onCleanup(() => { lifetime.disposed = true; executionQuery.dispose() })
      const execution = {
        context,
        read: () => lifetime.disposed ? executionQuery.read() : view.value,
        input: () => owner().request,
        allows(model: { providerID: string; modelID: string }) {
          const value = view.value
          if (lifetime.disposed || value.status !== "ready" || readyOwner !== owner()) return false
          const requested = owner().request.model
          const selection = value.response.data.selection
          if (requested?.providerID === model.providerID && requested.id === model.modelID &&
            (selection?.status !== "ready" || selection.ref.providerID !== requested.providerID ||
              selection.ref.id !== requested.id || selection.ref.variant !== requested.variant)) return false
          return value.response.data.models.some((entry) => entry.model.providerID === model.providerID && entry.model.id === model.modelID && entry.status === "ready")
        },
      }
      const known = new Map<string, { title: string; provider: string }>()
      createEffect(() => {
        const selected = candidate()
        if (!selected) return
        const provider = sync.data.provider.find((item) => item.id === selected.providerID)
        const model = provider?.models[selected.modelID]
        if (provider && model) known.set(JSON.stringify([provider.id, model.id]), { title: model.name ?? model.id, provider: provider.name })
      })
      const currentModel = createMemo(() => {
        const explicit = chosen()
        if (explicit) return explicit
        const value = view.value
        if (value.status !== "ready" || readyOwner !== owner()) return
        const selection = value.response.data.selection
        const requested = owner().request.model
        return selection?.status === "ready" && selection.ref.providerID === requested?.providerID &&
          selection.ref.id === requested?.id && selection.ref.variant === requested?.variant ? candidate() : undefined
      })

      return {
        intent,
        execution,
        known: (model: { providerID: string; modelID: string }) => known.get(JSON.stringify([model.providerID, model.modelID])),
        current: currentModel,
        get ready() {
          return modelStore.ready
        },
        recent() {
          return modelStore.recent
        },
        favorite() {
          return modelStore.favorite
        },
        parsed: createMemo(() => {
          const value = currentModel()
          if (!value) {
            return {
              provider: "Connect a provider",
              model: "No provider selected",
              reasoning: false,
            }
          }
          const provider = sync.data.provider.find((item) => item.id === value.providerID)
          const info = provider?.models[value.modelID]
          return {
            provider: provider?.name ?? value.providerID,
            model: info?.name ?? known.get(JSON.stringify([value.providerID, value.modelID]))?.title ?? value.modelID,
            reasoning: info?.capabilities?.reasoning ?? false,
          }
        }),
        cycle(direction: 1 | -1) {
          const current = currentModel()
          if (!current) return
          const recent = modelStore.recent
          const index = recent.findIndex((x) => x.providerID === current.providerID && x.modelID === current.modelID)
          if (index === -1) return
          let next = index + direction
          if (next < 0) next = recent.length - 1
          if (next >= recent.length) next = 0
          const val = recent[next]
          if (!val) return
          if (!execution.allows(val)) return
          const a = agent.current()
          if (!a) return
          setModelStore("model", agentKey(a), { ...val })
        },
        cycleFavorite(direction: 1 | -1) {
          const favorites = modelStore.favorite.filter((item) => isModelValid(item))
          if (!favorites.length) {
            toast.show({
              variant: "info",
              message: "Add a favorite model to use this shortcut",
              duration: 3000,
            })
            return
          }
          const current = currentModel()
          let index = -1
          if (current) {
            index = favorites.findIndex((x) => x.providerID === current.providerID && x.modelID === current.modelID)
          }
          if (index === -1) {
            index = direction === 1 ? 0 : favorites.length - 1
          } else {
            index += direction
            if (index < 0) index = favorites.length - 1
            if (index >= favorites.length) index = 0
          }
          const next = favorites[index]
          if (!next) return
          if (!execution.allows(next)) return
          const a = agent.current()
          if (!a) return
          setModelStore("model", agentKey(a), { ...next })
          setModelStore("recent", recentModels(next, modelStore.recent))
          save()
        },
        set(model: { providerID: string; modelID: string }, options?: { recent?: boolean }) {
          batch(() => {
            if (!isModelValid(model)) {
              toast.show({
                message: `Model ${model.providerID}/${model.modelID} is not valid`,
                variant: "warning",
                duration: 3000,
              })
              return
            }
            const a = agent.current()
            if (!a) return
            setModelStore("model", agentKey(a), model)
            if (options?.recent) {
              setModelStore("recent", recentModels(model, modelStore.recent))
              save()
            }
          })
        },
        toggleFavorite(model: { providerID: string; modelID: string }) {
          batch(() => {
            if (!isModelValid(model)) {
              toast.show({
                message: `Model ${model.providerID}/${model.modelID} is not valid`,
                variant: "warning",
                duration: 3000,
              })
              return
            }
            const exists = modelStore.favorite.some(
              (x) => x.providerID === model.providerID && x.modelID === model.modelID,
            )
            const next = exists
              ? modelStore.favorite.filter((x) => x.providerID !== model.providerID || x.modelID !== model.modelID)
              : [model, ...modelStore.favorite]
            setModelStore(
              "favorite",
              next.map((x) => ({ providerID: x.providerID, modelID: x.modelID })),
            )
            save()
          })
        },
        variant: {
          selected() {
            return intent().variant
          },
          current() {
            return owner().request.model?.variant
          },
          list() {
            const m = chosen() ?? candidate()
            if (!m) return []
            const provider = sync.data.provider.find((item) => item.id === m.providerID)
            const info = provider?.models[m.modelID]
            if (!info?.variants) return []
            return Object.keys(info.variants)
          },
          set(value: string | undefined) {
            const m = chosen() ?? candidate()
            if (!m) return
            const key = `${m.providerID}/${m.modelID}`
            setModelStore("variantIntent", key, value === undefined ? null : value)
            save()
          },
          cycle() {
            const variants = this.list()
            if (variants.length === 0) return
            const current = this.current()
            if (!current) {
              this.set(variants[0])
              return
            }
            const index = variants.indexOf(current)
            if (index === -1 || index === variants.length - 1) {
              this.set(undefined)
              return
            }
            this.set(variants[index + 1])
          },
        },
      }
    }

    const model = createModel()

    function createSession() {
      const [sessionStore, setSessionStore] = createStore<{
        ready: boolean
        pinned: string[]
      }>({
        ready: false,
        pinned: [],
      })

      const filePath = path.join(paths.state, "session.json")
      const state = {
        pending: false,
      }

      function save() {
        if (!sessionStore.ready) {
          state.pending = true
          return
        }
        state.pending = false
        void writeJsonAtomic(filePath, {
          pinned: sessionStore.pinned,
        })
      }

      readJson<unknown>(filePath)
        .then((x) => {
          if (!x || typeof x !== "object") return
          const pinned = (x as Record<string, unknown>).pinned
          if (Array.isArray(pinned))
            setSessionStore(
              "pinned",
              pinned.filter((item): item is string => typeof item === "string"),
            )
        })
        .catch(() => {})
        .finally(() => {
          setSessionStore("ready", true)
          if (state.pending) save()
        })

      const slots = createMemo(() => {
        const existing = new Set(sync.data.session.filter((x) => x.parentID === undefined).map((x) => x.id))
        return sessionStore.pinned.filter((id) => existing.has(id)).slice(0, 9)
      })

      function prune(sessionID: string) {
        batch(() => {
          if (sessionStore.pinned.includes(sessionID)) {
            setSessionStore(
              "pinned",
              sessionStore.pinned.filter((x) => x !== sessionID),
            )
          }
          save()
        })
      }

      event.on("session.next.deleted", (evt) => {
        prune(evt.data.sessionID)
      })

      return {
        get ready() {
          return sessionStore.ready
        },
        pinned() {
          return sessionStore.pinned
        },
        slots,
        isPinned(sessionID: string) {
          return sessionStore.pinned.includes(sessionID)
        },
        togglePin(sessionID: string) {
          batch(() => {
            const exists = sessionStore.pinned.includes(sessionID)
            const next = exists
              ? sessionStore.pinned.filter((x) => x !== sessionID)
              : [...sessionStore.pinned, sessionID]
            setSessionStore("pinned", next)
            save()
          })
        },
        quickSwitch(slot: number) {
          const target = slots()[slot - 1]
          if (!target) return
          if (route.data.type === "session" && route.data.sessionID === target) return
          route.navigate({ type: "session", sessionID: target })
        },
      }
    }

    const session = createSession()

    const mcp = {
      isEnabled(name: string) {
        const status = sync.data.mcp[name]
        return status?.status === "connected"
      },
      async toggle(name: string) {
        const status = sync.data.mcp[name]
        if (status?.status === "connected") {
          // Disable: disconnect the MCP
          await sdk.api.mcp.disconnect({ server: name })
        } else {
          // Enable/Retry: connect the MCP (handles disabled, failed, and other states)
          await sdk.api.mcp.connect({ server: name })
        }
      },
    }

    createEffect(() => {
      const value = agent.current()
      if (!value?.model) return
      if (isModelValid(value.model)) return
      toast.show({
        variant: "warning",
        message: `Agent ${value.name}'s configured model ${value.model.providerID}/${value.model.modelID} is not valid`,
        duration: 3000,
      })
    })

    const result = {
      model,
      agent,
      mcp,
      session,
      permission,
    }
    return result
  },
})
