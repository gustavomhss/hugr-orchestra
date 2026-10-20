import { createContext, useContext } from "solid-js"
import type { AtlasController } from "./atlas-controller"
import type { AtlasModel } from "./atlas-model"
import type { AtlasQueryPatch, AtlasRoute } from "./atlas-route"
import type { AtlasIconName } from "./kit/icons"

// What the chapter frame (atlas.tsx) hands every view, sheet and kit part.
export type AtlasContextValue = {
  route: () => AtlasRoute
  // Undefined until a snapshot is loaded, and while the store is empty or Atlas is unavailable.
  model: () => AtlasModel | undefined
  controller: AtlasController
  // Navigates to an app path (from atlasHref or withQuery).
  go: (href: string, replace?: boolean) => void
  // Changes query keys on the current route; "" or undefined removes a key.
  setQuery: (patch: AtlasQueryPatch, replace?: boolean) => void
  // Opens a fact: the inspector over the current view, or the fact page when the fact page is showing.
  open: (key: string) => void
  // Closes the inspector and returns focus to the row that opened it.
  close: () => void
  toast: (text: string, icon?: AtlasIconName) => void
  // The titlebar crumbs after "Atlas" for the current view.
  crumbs: (items: string[]) => void
  // The main area lays its view out as a full-height column (the mock's `flush`).
  setFlush: (on: boolean) => void
  // Opens the search palette, optionally with text already typed.
  palette: (prefix?: string) => void
  // Opens the keyboard shortcuts sheet.
  shortcuts: () => void
}

export const AtlasContext = createContext<AtlasContextValue>()

export function useAtlas() {
  const value = useContext(AtlasContext)
  if (!value) throw new Error("useAtlas must be used inside the Atlas chapter")
  return value
}
