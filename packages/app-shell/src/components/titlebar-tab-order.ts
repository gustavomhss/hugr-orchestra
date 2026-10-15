import { pathKey } from "@/utils/path-key"
import { startTransition } from "solid-js"

export function closeProfileTab<T>(input: {
  tabs: { store: readonly T[]; closeTab: (index: number) => void; select: (tab: T) => void }
  visible?: readonly T[]
  current?: T
  tab: T
  home: () => void
}) {
  const index = input.tabs.store.indexOf(input.tab)
  if (index === -1) return
  const visibleIndex = input.visible?.indexOf(input.tab) ?? -1
  const next = input.visible?.[visibleIndex + 1] ?? input.visible?.[visibleIndex - 1]
  // Join native close's transition so its global successor never becomes the final route.
  return startTransition(() => {
    input.tabs.closeTab(index)
    if (!input.visible || input.current !== input.tab) return
    if (next) return input.tabs.select(next)
    input.home()
  })
}

export function tabMatchesProfile(
  tab: { server: string; directory?: string; rootDirectory?: string },
  profile?: { server: string; directory?: string },
) {
  if (!profile) return true
  if (tab.server !== profile.server) return false
  if (!profile.directory) return true
  const directory = tab.rootDirectory ?? tab.directory
  return !!directory && pathKey(directory) === pathKey(profile.directory)
}

export function adjacentTabKey(order: string[], current: string | undefined, offset: -1 | 1) {
  if (!current || order.length === 0) return
  const index = order.indexOf(current)
  if (index === -1) return
  return order[(index + offset + order.length) % order.length]
}

export function mergeVisibleTabOrder(all: string[], current: string[], next: string[]) {
  const visible = new Set(current)
  const reordered = next.values()
  return all.map((key) => (visible.has(key) ? (reordered.next().value ?? key) : key))
}
