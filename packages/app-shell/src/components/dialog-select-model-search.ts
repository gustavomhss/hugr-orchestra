export const normalizeModelSearch = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ")

export const compactModelSearch = (value: string) => normalizeModelSearch(value).replaceAll(" ", "")

export const matchesModelSearch = (query: string, values: string[]) => {
  const search = normalizeModelSearch(query)
  if (!search) return true

  const compactSearch = compactModelSearch(query)
  return values.some(
    (value) => normalizeModelSearch(value).includes(search) || compactModelSearch(value).includes(compactSearch),
  )
}

export function createModelSelectorNavigation<T>(
  groups: () => ReadonlyArray<{ items: readonly T[] }>,
  key: (item: T) => string,
  ...actions: string[]
) {
  const items = () => groups().flatMap((group) => group.items)
  const keys = () => [...items().map(key), ...actions]
  return {
    keys,
    find: (active: string) => items().find((item) => key(item) === active),
    next: (active: string, delta: number) => {
      const options = keys()
      const index = options.indexOf(active)
      if (index === -1) return delta > 0 ? options[0] : options[options.length - 1]
      return options[(index + delta + options.length) % options.length]
    },
  }
}
