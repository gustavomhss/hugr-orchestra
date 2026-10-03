import { describe, expect, test } from "bun:test"
import { createRoot, createSignal } from "solid-js"
import { createOrchestraNavigation } from "../src/orchestra/compact-navigation"

describe("window navigation presentation", () => {
  test("remembers an explicit choice without sharing it with another window", async () => {
    const windows = new Map<string, Map<string, string>>()
    const platform = (windowID: string) => ({
      platform: "desktop" as const,
      windowID,
      openExternal: () => {},
      restart: async () => {},
      notify: async () => {},
      storage: (name = "default") => {
        const values = windows.get(name) ?? new Map<string, string>()
        windows.set(name, values)
        return {
          getItem: (key: string) => values.get(key) ?? null,
          setItem: (key: string, value: string) => void values.set(key, value),
          removeItem: (key: string) => void values.delete(key),
        }
      },
    })
    await createRoot(async (dispose) => {
      const first = createOrchestraNavigation({ platform: platform("one"), constrained: () => false })
      await first.ready
      expect(first.compact()).toBe(false)
      first.toggle()
      expect(first.compact()).toBe(true)
      const restored = createOrchestraNavigation({ platform: platform("one"), constrained: () => false })
      const other = createOrchestraNavigation({ platform: platform("two"), constrained: () => false })
      await Promise.all([restored.ready, other.ready])
      expect(restored.compact()).toBe(true)
      expect(other.compact()).toBe(false)
      restored.toggle()
      expect(restored.compact()).toBe(false)
      dispose()
    })
  })

  test("a narrow window cannot overwrite the expanded preference", () => {
    createRoot((dispose) => {
      const [constrained, setConstrained] = createSignal(false)
      const values = new Map<string, string>()
      const nav = createOrchestraNavigation({
        platform: { platform: "web", openExternal: () => {}, restart: async () => {}, notify: async () => {} },
        constrained,
        storage: {
          getItem: (key) => values.get(key) ?? null,
          setItem: (key, value) => void values.set(key, value),
          removeItem: (key) => void values.delete(key),
        },
      })
      setConstrained(true)
      expect(nav.compact()).toBe(true)
      nav.toggle()
      expect(values.size).toBe(0)
      setConstrained(false)
      expect(nav.compact()).toBe(false)
      nav.toggle()
      setConstrained(true)
      setConstrained(false)
      expect(nav.compact()).toBe(true)
      dispose()
    })
  })
})
