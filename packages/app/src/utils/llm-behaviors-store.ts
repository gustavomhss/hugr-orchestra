import { createRoot, createSignal } from "solid-js"
import { createStore } from "solid-js/store"
import type { Platform } from "@/context/platform"
import { pathKey } from "./path-key"
import { Persist, persisted } from "./persist"
import type { ServerScope } from "./server-scope"
import {
  behaviorProfileDirectory,
  behaviorSystem,
  defaultBehaviorState,
  sanitizeBehaviorState,
  type LlmBehavior,
} from "./llm-behaviors"

// How long a send waits for a profile still loading from desktop storage before going without it.
export const BEHAVIOR_LOAD_TIMEOUT = 1_000

// The Plugins page and every composer read one store per profile (server + repository), so a
// change on the page reaches the next message without a reload. Stores live for the app session.
const profiles = new Map<string, ReturnType<typeof open>>()

export function llmBehaviors(platform: Platform, scope: ServerScope, directory: string) {
  const key = `${scope}\0${pathKey(directory)}`
  const existing = profiles.get(key)
  if (existing) return existing
  const next = createRoot(() => open(platform, scope, directory))
  profiles.set(key, next)
  return next
}

// Behaviors never delay or fail a send. The message carries exactly what the Plugins page shows:
// a storage error or a load slower than the timeout leaves the defaults, where nothing is enabled.
export async function resolveBehaviorSystem(input: {
  platform: Platform
  scope: ServerScope
  projects: readonly { worktree: string; sandboxes?: readonly string[] }[]
  directory: string
  timeout?: number
}) {
  const store = llmBehaviors(input.platform, input.scope, behaviorProfileDirectory(input.projects, input.directory))
  const timer = { id: undefined as ReturnType<typeof setTimeout> | undefined }
  await Promise.race([
    store.loaded,
    new Promise<void>((resolve) => {
      timer.id = setTimeout(resolve, input.timeout ?? BEHAVIOR_LOAD_TIMEOUT)
    }),
  ])
  clearTimeout(timer.id)
  return store.system()
}

function open(platform: Platform, scope: ServerScope, directory: string) {
  const [state, setState, init] = persisted(
    { ...Persist.serverWorkspace(scope, directory, "orchestra-llm-behaviors"), migrate: sanitizeBehaviorState },
    createStore(defaultBehaviorState()),
    tolerant(platform),
  )
  const [loading, setLoading] = createSignal(init instanceof Promise)
  const loaded = Promise.resolve(init).then(() => void setLoading(false))
  return {
    loading,
    loaded,
    behaviors: () => state.behaviors,
    update: (next: LlmBehavior[]) => setState("behaviors", next),
    system: () => behaviorSystem(state.behaviors),
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
