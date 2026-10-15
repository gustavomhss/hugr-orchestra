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
  // Desktop windows read the preference over IPC; browser storage answers synchronously.
  const [state, setState, , ready] =
    input.platform.platform === "desktop" && input.platform.windowID
      ? persisted(Persist.window("orchestra-navigation.v1"), createStore({ collapsed: false }), input.platform)
      : ([
          ...makePersisted(createStore({ collapsed: false }), {
            name: "orchestra-navigation.v1",
            storage: input.storage ?? windowNavigationStorage,
          }),
          () => true,
        ] as const)

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
