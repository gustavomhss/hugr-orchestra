import { createVirtualizer } from "@tanstack/solid-virtual"
import { createMemo, type Accessor } from "solid-js"

type Row<T> = { key: string; group: string; start: number; size: number; item?: T }
type Group<T> = { category: string; items: readonly T[] }

// Windows a grouped list (a header row followed by item rows per group) so pickers stay cheap with
// hundreds of entries. Row sizes are fixed, so group boxes are computed up front: every visible group
// keeps its own container, its header stays sticky inside it, and its items stay inside the group.
export function createGroupedVirtualizer<T>(input: {
  groups: Accessor<readonly Group<T>[]>
  key: (item: T) => string
  scrollElement: () => HTMLElement | null | undefined
  header: number
  item: number
  gap?: number
  paddingEnd?: number
  scrollPadding?: number
  viewport: number
}) {
  const layout = createMemo(() => {
    const placed = input.groups().reduce(
      (all, group, index) => {
        const start = all.end + (index === 0 ? 0 : (input.gap ?? 0))
        const size = input.header + group.items.length * input.item
        all.groups.set(group.category, { ...group, start, size })
        all.rows.push(
          // The header row also carries the gap above its group. NUL cannot appear in item keys.
          {
            key: `\u0000${group.category}`,
            group: group.category,
            start: all.end,
            size: start - all.end + input.header,
          },
          ...group.items.map((item, position) => ({
            key: input.key(item),
            group: group.category,
            start: start + input.header + position * input.item,
            size: input.item,
            item,
          })),
        )
        return { ...all, end: start + size }
      },
      { end: 0, rows: [] as Row<T>[], groups: new Map<string, Group<T> & { start: number; size: number }>() },
    )
    return { rows: placed.rows, groups: placed.groups, byKey: new Map(placed.rows.map((row) => [row.key, row])) }
  })

  const virtualizer = createVirtualizer<HTMLElement, HTMLElement>({
    get count() {
      return layout().rows.length
    },
    getScrollElement: () => input.scrollElement() ?? null,
    initialRect: { width: 0, height: input.viewport },
    estimateSize: (index) => layout().rows[index]?.size ?? input.item,
    overscan: 8,
    paddingEnd: input.paddingEnd,
    scrollPaddingStart: input.scrollPadding,
    scrollPaddingEnd: input.scrollPadding,
    get getItemKey() {
      const rows = layout().rows
      return (index: number) => rows[index]?.key ?? index
    },
  })

  // Visible item keys per visible group; a group stays mounted while its header or any item is in range.
  const visible = createMemo(() =>
    virtualizer.getVirtualItems().reduce((all, virtual) => {
      const row = layout().byKey.get(String(virtual.key))
      if (!row) return all
      return all.set(row.group, [...(all.get(row.group) ?? []), ...(row.item ? [row.key] : [])])
    }, new Map<string, string[]>()),
  )

  return {
    total: () => virtualizer.getTotalSize(),
    groups: createMemo(() => [...visible().keys()]),
    items: (group: string) => visible().get(group) ?? [],
    group: (group: string) => layout().groups.get(group),
    row: (key: string) => layout().byKey.get(key),
    scrollTo: (key: string, align: "auto" | "center") => {
      const index = layout().rows.findIndex((row) => row.key === key)
      if (index < 0) return
      virtualizer.scrollToIndex(index, { align })
    },
  }
}
