import { expect, test } from "bun:test"
import { createRoot, createSignal } from "solid-js"
import { createGroupedVirtualizer } from "@/components/grouped-virtualizer"

const group = (category: string, count: number) => ({
  category,
  items: Array.from({ length: count }, (_, index) => `${category}:${index}`),
})

test("mounts a bounded window of a group with hundreds of items", () => {
  createRoot((dispose) => {
    const rows = createGroupedVirtualizer({
      groups: () => [group("free", 1), group("router", 400)],
      key: (item) => item,
      scrollElement: () => undefined,
      header: 28,
      item: 28,
      viewport: 220,
    })

    expect(rows.total()).toBe(28 * 403)
    expect(rows.groups()).toEqual(["free", "router"])
    expect(rows.items("free")).toEqual(["free:0"])
    expect(rows.items("router").length).toBeGreaterThan(0)
    expect(rows.items("router").length).toBeLessThan(20)
    expect(rows.items("router")[0]).toBe("router:0")
    dispose()
  })
})

test("lays out group boxes with gaps, end padding and offsets relative to each group", () => {
  createRoot((dispose) => {
    const [groups, setGroups] = createSignal([group("a", 2), group("b", 1)])
    const rows = createGroupedVirtualizer({
      groups,
      key: (item) => item,
      scrollElement: () => undefined,
      header: 36,
      item: 32,
      gap: 12,
      paddingEnd: 12,
      viewport: 320,
    })

    expect(rows.group("a")).toMatchObject({ start: 0, size: 36 + 64 })
    expect(rows.group("b")).toMatchObject({ start: 100 + 12, size: 36 + 32 })
    expect(rows.row("a:1")?.start).toBe(36 + 32)
    expect(rows.row("b:0")?.start).toBe(112 + 36)
    expect(rows.total()).toBe(112 + 68 + 12)

    setGroups([group("b", 1)])
    expect(rows.groups()).toEqual(["b"])
    expect(rows.group("b")).toMatchObject({ start: 0, size: 68 })
    expect(rows.group("a")).toBeUndefined()
    dispose()
  })
})

test("keeps group header keys apart from item keys", () => {
  createRoot((dispose) => {
    const rows = createGroupedVirtualizer({
      groups: () => [{ category: "x", items: ["x"] }],
      key: (item) => item,
      scrollElement: () => undefined,
      header: 28,
      item: 28,
      viewport: 220,
    })

    expect(rows.items("x")).toEqual(["x"])
    expect(rows.row("x")?.item).toBe("x")
    dispose()
  })
})
