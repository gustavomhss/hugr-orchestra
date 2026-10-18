// @atlas/cli — test/memory-read-cli.test.ts  (WP-11.W8 — the four memory READ_SURFACE CLI doors)
//
// `memory-recall`/`memory-header`/`memory-awareness`/`memory-orientation` are intercepted before the
// handler (like `relations`/`anchors`), bound to `atlas-query` for CLI-2 authority classification only. This
// suite drives `main()` over FAKE injected legs (the leg's own behaviour is `memory-verdicts.ts`'s job, and
// `createMemoryRead`/`createAwarenessStore`/`createDurableOrientation`'s own suites) and asserts: the
// commands exist and classify READ, the dispatch reaches the injected leg with the RIGHT argument shape
// (recall's flag→query mapping is CLI-owned code, `cli-dispatch.ts`), and an uncomposed runtime fails closed.

import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Awareness, MemoryRecord, Orientation, TurnHeader } from "@atlas/memory"
import { main } from "../src/cli.js"
import { COMMANDS, COMMAND_LEG, authorityOf } from "../src/map.js"

let writes: string[]
beforeEach(() => {
  writes = []
  vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    writes.push(String(chunk))
    return true
  })
})

describe("WP-11.W8 — the four memory read commands classify READ off atlas-query, like anchors/relations", () => {
  it.each(["memory-recall", "memory-header", "memory-awareness", "memory-orientation"] as const)("%s", (cmd) => {
    expect(COMMANDS).toContain(cmd)
    expect(COMMAND_LEG[cmd]).toBe("atlas-query")
    expect(authorityOf(cmd)).toBe("read")
  })
})

describe("WP-11.W8 — memory-recall marshals --owner/--kind/--task-id/--pr-id into the query object", () => {
  it("passes ONLY the flags supplied, under their query field names (owner/kind/taskId/prId)", async () => {
    const seen: unknown[] = []
    const memoryRecall = (query: unknown): readonly MemoryRecord[] => {
      seen.push(query)
      return []
    }
    const code = await main(["memory-recall", "--owner", "dev@example.com", "--task-id", "t1"], { memoryRecall })
    expect(code).toBe(0)
    expect(seen).toEqual([{ owner: "dev@example.com", taskId: "t1" }])
  })

  it("an unqualified call passes an EMPTY query object", async () => {
    const seen: unknown[] = []
    const memoryRecall = (query: unknown): readonly MemoryRecord[] => {
      seen.push(query)
      return []
    }
    await main(["memory-recall"], { memoryRecall })
    expect(seen).toEqual([{}])
  })

  it("an uncomposed runtime fails closed exit 1", async () => {
    const code = await main(["memory-recall"], {})
    expect(code).toBe(1)
    expect(writes.join("")).toContain("atlas runtime is not composed yet")
  })
})

describe("WP-11.W8 — memory-header/memory-awareness/memory-orientation drive their own thunk leg", () => {
  it("memory-header calls the injected thunk and renders its next: line", async () => {
    const header: TurnHeader = { awareness: {} as Awareness, orientation: {} as Orientation, rules: [] }
    const code = await main(["memory-header"], { memoryHeader: () => header })
    expect(code).toBe(0)
    expect(writes.join("")).toContain("status: ok")
  })

  it("memory-awareness calls the injected thunk", async () => {
    const code = await main(["memory-awareness"], { memoryAwareness: () => ({}) as Awareness })
    expect(code).toBe(0)
  })

  it("memory-orientation calls the injected thunk", async () => {
    const code = await main(["memory-orientation"], { memoryOrientation: () => ({}) as Orientation })
    expect(code).toBe(0)
  })

  it("an uncomposed runtime fails closed exit 1 for each", async () => {
    expect(await main(["memory-header"], {})).toBe(1)
    expect(await main(["memory-awareness"], {})).toBe(1)
    expect(await main(["memory-orientation"], {})).toBe(1)
  })
})
