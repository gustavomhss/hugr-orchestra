import { makePersisted, type SyncStorage } from "@solid-primitives/storage"
import { createMemo } from "solid-js"
import { createStore } from "solid-js/store"
import type { Platform } from "@/context/platform"
import { Persist, persisted } from "@/utils/persist"

export function createOrchestraNavigation(input: {
  platform: Platform
  constrained: () => boolean
  storage?: SyncStorage
}) {
  const [state, setState, , ready] = persistNavigation(
    input.platform,
    "orchestra-navigation.v1",
    { collapsed: false },
    input.storage,
  )

  return {
    ready,
    compact: createMemo(() => input.constrained() || state.collapsed === true),
    toggle: () => {
      // Responsive presentation must not change the window's explicit preference.
      if (input.constrained()) return
      setState({ collapsed: state.collapsed !== true })
    },
  }
}

// The Advanced group's open or closed preference. It has its own key so the rail's collapse state is untouched.
export function createAdvancedNavigation(platform: Platform) {
  const [state, setState] = persistNavigation(platform, "orchestra-navigation-advanced.v1", { open: false })
  return {
    open: () => state.open === true,
    toggle: () => setState({ open: state.open !== true }),
  }
}

function persistNavigation<T extends object>(platform: Platform, name: string, initial: T, storage?: SyncStorage) {
  // Desktop windows read the preference over IPC; browser storage answers synchronously.
  return platform.platform === "desktop" && platform.windowID
    ? persisted(Persist.window(name), createStore(initial), platform)
    : ([
        ...makePersisted(createStore(initial), {
          name,
          storage: storage ?? windowNavigationStorage,
        }),
        () => true,
      ] as const)
}

// Browser previews use the window session, while desktop uses the host's window store.
// Storage can be denied; navigation should remain usable in memory in that case.
const windowNavigationStorage: SyncStorage = {
  getItem: (key) => {
    try {
      return window.sessionStorage.getItem(key)
    } catch {
      return null
    }
  },
  setItem: (key, value) => {
    try {
      window.sessionStorage.setItem(key, value)
    } catch {}
  },
  removeItem: (key) => {
    try {
      window.sessionStorage.removeItem(key)
    } catch {}
  },
}
