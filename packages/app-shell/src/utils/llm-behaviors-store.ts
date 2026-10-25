import { createRoot, createSignal } from "solid-js"
import { createStore } from "solid-js/store"
import type { Platform } from "@/context/platform"
import { pathKey } from "./path-key"
import { Persist, persisted } from "./persist"
import type { ServerScope } from "./server-scope"
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
  const [state, setState, init] = persisted(
    { ...Persist.serverWorkspace(scope, directory, "orchestra-llm-behaviors"), migrate: sanitizeBehaviorState },
    createStore(defaultBehaviorState()),
    tolerant(platform),
  )
  const [loading, setLoading] = createSignal(init instanceof Promise)
  Promise.resolve(init).then(() => void setLoading(false))
  return {
    loading,
    behaviors: () => state.behaviors,
    update: (next: LlmBehavior[]) => setState("behaviors", next),
  }
}

// A desktop storage read that fails counts as "nothing saved": the profile keeps its defaults (nothing
// enabled) and no rejection escapes into the page or a send.
function tolerant(platform: Platform): Platform {
  const storage = platform.storage
  if (!storage) return platform
  return {
    ...platform,
    storage: (name) => {
      const store = storage(name)
      return {
        getItem: (key: string) =>
          Promise.resolve()
            .then(() => store.getItem(key))
            .catch(() => null),
        setItem: (key: string, value: string) => Promise.resolve(store.setItem(key, value)),
        removeItem: (key: string) => Promise.resolve(store.removeItem(key)).then(() => {}),
      }
    },
  }
}
