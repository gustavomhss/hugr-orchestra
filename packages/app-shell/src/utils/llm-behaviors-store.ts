import { createRoot, createSignal } from "solid-js"
import { createStore } from "solid-js/store"
import type { Platform } from "@/context/platform"
import { pathKey } from "./path-key"
import { Persist, persisted } from "./persist"
import type { ServerScope } from "./server-scope"
import { settleBehaviorRead } from "./behavior-read"
import {
  defaultBehaviorState,
  sanitizeBehaviorState,
  type LlmBehavior,
} from "./llm-behaviors"

// The Plugins page reads one store per profile (server + repository). Stores live for the app session.
const profiles = new Map<string, ReturnType<typeof open>>()

export function llmBehaviors(platform: Platform, scope: ServerScope, directory: string) {
  const key = `${scope}\0${pathKey(directory)}`
  const existing = profiles.get(key)
  if (existing) return existing
  const next = createRoot(() => open(platform, scope, directory))
  profiles.set(key, next)
  return next
}

function open(platform: Platform, scope: ServerScope, directory: string) {
  const [failed, setFailed] = createSignal(false)
  const [state, setState, init] = persisted(
    { ...Persist.serverWorkspace(scope, directory, "orchestra-llm-behaviors"), migrate: sanitizeBehaviorState },
    createStore(defaultBehaviorState()),
    reporting(platform, (error) => {
      console.error(error)
      setFailed(true)
    }),
  )
  const [loading, setLoading] = createSignal(init instanceof Promise)
  void Promise.resolve(init).then(
    () => setLoading(false),
    (error: unknown) => {
      console.error(error)
      setFailed(true)
      setLoading(false)
    },
  )
  return {
    loading,
    failed,
    behaviors: () => state.behaviors,
    update: (next: LlmBehavior[]) => setState("behaviors", next),
  }
}

// A missing store is not a failure. A failed read is reported and rethrown so it is not "nothing saved".
function reporting(platform: Platform, report: (error: unknown) => void): Platform {
  const storage = platform.storage
  if (!storage) return platform
  return {
    ...platform,
    storage: (name) => {
      const store = storage(name)
      return {
        getItem: (key: string) => {
          let value: string | null | undefined
          return settleBehaviorRead({
            read: Promise.resolve().then(() => store.getItem(key)),
            current: () => true,
            apply: (next) => {
              value = next
            },
            report,
          }).then((ok) => {
            if (!ok) throw new Error("behavior read failed")
            return value ?? null
          })
        },
        setItem: (key: string, value: string) => Promise.resolve(store.setItem(key, value)),
        removeItem: (key: string) => Promise.resolve(store.removeItem(key)).then(() => {}),
      }
    },
  }
}
