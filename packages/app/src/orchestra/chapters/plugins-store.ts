import { createRoot } from "solid-js"
import { createStore } from "solid-js/store"
import type { Platform } from "@/context/platform"
import { pathKey } from "@/utils/path-key"
import { Persist, persisted } from "@/utils/persist"
import type { ServerScope } from "@/utils/server-scope"
import { behaviorSystem, defaultBehaviorState, sanitizeBehaviorState, type LlmBehavior } from "./plugins-data"

// The Plugins page and every composer read one store per profile (server + repository), so a
// change on the page reaches the next prompt without a reload. Stores live for the app session.
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
  const [state, setState, , ready] = persisted(
    { ...Persist.serverWorkspace(scope, directory, "orchestra-llm-behaviors"), migrate: sanitizeBehaviorState },
    createStore(defaultBehaviorState()),
    platform,
  )
  return {
    ready,
    behaviors: () => state.behaviors,
    update: (next: LlmBehavior[]) => setState("behaviors", next),
    system: () => behaviorSystem(state.behaviors),
    // Desktop storage loads asynchronously; senders wait for the saved profile before reading it.
    loaded: async () => {
      if (!ready()) await ready.promise
    },
  }
}
