import { expect, test } from "bun:test"
import { createRoot, createSignal } from "solid-js"
import { createMcpEditState, type McpEditSnapshot } from "../src/orchestra/chapters/mcp-edit-state"
import { mcpDraft } from "../src/orchestra/chapters/mcp-model"

test("cold review: cached MCP readiness cannot initialize a dialog before its fresh raw/config reads succeed", async () => {
  const request = Promise.withResolvers<McpEditSnapshot>()
  const f = createRoot((dispose) => {
    const [read, setRead] = createSignal<"loading" | "error" | "ready">("ready")
    const editor = createMcpEditState(read, () => request.promise)
    return { editor, setRead, dispose }
  })
  try {
    expect(f.editor.ready()).toBe(false)
    request.resolve({ config: { docs: { type: "local", command: ["resolved"] } }, entries: { docs: { type: "local", command: ["fresh", "{env:TOKEN}"] } } })
    await request.promise
    await drain()
    expect(f.editor.ready()).toBe(true)
    expect(mcpDraft(f.editor.state.snapshot?.entries?.docs)?.endpoint).toBe("fresh {env:TOKEN}")
    f.setRead("error")
    expect(f.editor.ready()).toBe(true)
    expect(mcpDraft(f.editor.state.snapshot?.entries?.docs)?.endpoint).toBe("fresh {env:TOKEN}")
  } finally { f.dispose() }
})

test("cold review: failed fresh MCP reads retain loading/error gate and retry uses a new read", async () => {
  const first = Promise.withResolvers<McpEditSnapshot>()
  const second = Promise.withResolvers<McpEditSnapshot>()
  const calls: number[] = []
  const f = createRoot((dispose) => ({ dispose, editor: createMcpEditState(() => "ready", () => (calls.push(1) === 1 ? first : second).promise) }))
  try {
    expect(f.editor.ready()).toBe(false)
    first.reject(new Error("Read denied"))
    await first.promise.catch(() => undefined)
    await drain()
    expect(f.editor.state.status).toBe("error")
    expect(f.editor.ready()).toBe(false)
    const retry = f.editor.retry()
    expect(f.editor.state.status).toBe("loading")
    second.resolve({ config: {}, entries: {} })
    await retry
    expect(f.editor.ready()).toBe(true)
    expect(f.editor.state.snapshot?.entries).toEqual({})
    expect(calls).toHaveLength(2)
  } finally { f.dispose() }
})

async function drain() { for (let turn = 0; turn < 20; turn++) await Promise.resolve() }
