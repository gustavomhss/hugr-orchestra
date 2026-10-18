import { type Accessor, createMemo, onCleanup } from "solid-js"
import { createStore } from "solid-js/store"
import type { McpEntry } from "./mcp-model"

export type McpEditSnapshot = { config: Record<string, McpEntry>; entries: Record<string, McpEntry> | null }

export function createMcpEditState(
  read: Accessor<"loading" | "error" | "ready">,
  load: () => Promise<McpEditSnapshot>,
) {
  const [state, setState] = createStore({
    status: "loading" as "loading" | "error" | "ready",
    snapshot: undefined as McpEditSnapshot | undefined,
  })
  const lifetime = { generation: 0, disposed: false }
  onCleanup(() => {
    lifetime.disposed = true
    lifetime.generation++
  })
  const retry = async () => {
    const generation = ++lifetime.generation
    setState({ status: "loading", snapshot: undefined })
    const result = await load().then(
      (snapshot) => ({ snapshot }),
      () => undefined,
    )
    if (lifetime.disposed || generation !== lifetime.generation) return
    setState(result ? { status: "ready", snapshot: result.snapshot } : { status: "error" })
  }
  const status = () => (state.status === "ready" ? read() : state.status)
  // A fresh successful read is admission to this editor lifetime; background cache refreshes
  // cannot reinitialize a draft once admitted.
  const ready = createMemo((loaded: boolean) => loaded || status() === "ready", false)
  void retry()
  return { state, status, ready, retry }
}
