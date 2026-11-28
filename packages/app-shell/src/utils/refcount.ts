import { onCleanup } from "solid-js"

export function createRefCountMap<T>(
  create: (key: string) => T,
  remove?: (key: string) => void,
  identity: (key: string) => string = (key) => key,
) {
  const items = new Map<string, T>()
  const refCounts = new Map<string, number>()

  return (key: string) => {
    const id = identity(key)
    const lease = { acquired: false }
    onCleanup(() => {
      if (!lease.acquired) return
      lease.acquired = false
      refCounts.set(id, (refCounts.get(id) ?? 0) - 1)
      if (refCounts.get(id) === 0) {
        items.delete(id)
        refCounts.delete(id)
        remove?.(id)
      }
    })

    const cached = items.get(id)
    if (cached) {
      refCounts.set(id, (refCounts.get(id) ?? 0) + 1)
      lease.acquired = true
      return cached
    }
    const item = create(key)
    items.set(id, item)
    refCounts.set(id, 1)
    lease.acquired = true
    return item
  }
}
