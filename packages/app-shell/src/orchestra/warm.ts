// Last result a chapter loaded, kept for the window so opening the chapter again paints it at once
// while the page asks the server for a fresh copy. Newest entries stay; the oldest are dropped.
export function createWarm<T>(limit: number) {
  const entries = new Map<string, T>()
  return {
    read: (key: string): T | undefined => entries.get(key),
    write(key: string, value: T) {
      entries.delete(key)
      entries.set(key, value)
      while (entries.size > limit) entries.delete(entries.keys().next().value!)
    },
  }
}
