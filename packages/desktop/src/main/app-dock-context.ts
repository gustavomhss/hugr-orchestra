import type { BrowserWindow, WebContentsView } from "electron"
import type { AppDockEvent, AppDockIdentity, AppDockState } from "./app-dock"

export type AppDockRecord = {
  view: WebContentsView
  win: BrowserWindow
  storageKey: string
  generation: number
  state: () => AppDockState
  notify: (event: AppDockEvent) => void
  cleanups: (() => void)[]
}

export type AppDockRefTarget = {
  x: number
  y: number
  width: number
  height: number
  tag: string
  name: string
  href?: string
  url: string
}

// Shared state of one createAppDock closure, passed explicitly to the modules split out of it.
export type AppDockContext = Readonly<{
  tabs: Map<number, Map<string, AppDockRecord>>
  active: Map<number, string>
  tabByContents: Map<number, { senderID: number; tabID: string; generation: number }>
  refTargets: Map<string, Map<number, AppDockRefTarget>>
  refNamespaces: Map<string, number>
  blockedNavigationVersions: Map<string, number>
  isCurrent: (senderID: number, tabID: string, generation: number) => boolean
  nextRefNamespace: () => number
}>

export const identity = (tabID: string, tabGeneration: number): AppDockIdentity =>
  Object.freeze({ tabID, generation: tabGeneration })
