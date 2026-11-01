// Last result a chapter loaded, kept for the window so opening the chapter again paints it at once
// while the page asks the server for a fresh copy. Newest entries stay; the oldest are dropped.
//
// `detach` keeps the cache apart from the store a chapter paints it into: Solid's `reconcile` and path writes
// change stored objects in place, so a value shared with the cache would be rewritten under it. A detached cache
// copies on write and on read (plain data only; `structuredClone` rejects functions and class instances).
export function createWarm<T>(limit: number, options?: { detach?: boolean }) {
  const entries = new Map<string, T>()
  const copy = (value: T) => (options?.detach ? structuredClone(value) : value)
  return {
    read(key: string): T | undefined {
      const held = entries.get(key)
      return held === undefined ? undefined : copy(held)
    },
    write(key: string, value: T) {
      entries.delete(key)
      entries.set(key, copy(value))
      while (entries.size > limit) entries.delete(entries.keys().next().value!)
    },
  }
}
