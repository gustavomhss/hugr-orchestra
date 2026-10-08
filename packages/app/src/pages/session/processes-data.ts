import { createStore } from "solid-js/store"
import type { SessionProcess } from "@orchestra/sdk/v2/client"

// Background processes a session's shell tool left running (O1(b)). The server owns them; this view polls the list
// and asks the server to stop one. Session removal stops them all on the server side.

export type ProcessStop = "pending" | "failed"

/** How often the panel asks for the list while it is on screen. */
export const PROCESS_POLL_MS = 2000
/** How many lines of each process's output the panel shows. */
export const PROCESS_TAIL_LINES = 12

/** The last `count` lines of `output`, without a trailing empty line. */
export function tailLines(output: string, count = PROCESS_TAIL_LINES) {
  const lines = output.replace(/\r\n/g, "\n").replace(/\n$/, "").split("\n")
  return lines.slice(-count).join("\n")
}

/** The processes of the tree other than its root, which the row already names. */
export function descendants(item: SessionProcess) {
  return item.processes.filter((node) => node.pid !== item.pid)
}

/** Oldest first, so a row never jumps when a newer process appears. */
export function sortProcesses(items: readonly SessionProcess[]) {
  return items.toSorted((a, b) => a.started - b.started || a.id.localeCompare(b.id))
}

/**
 * Stop asks the server to end one tree and keeps the outcome visible: pending while in flight, failed with retry on
 * rejection.
 */
export function createProcessStops(stop: (id: string) => Promise<unknown>) {
  const [stops, setStops] = createStore<Record<string, ProcessStop | undefined>>({})
  return {
    state: (id: string) => stops[id],
    stop: (id: string) => {
      if (stops[id] === "pending") return
      setStops(id, "pending")
      stop(id).then(
        () => setStops(id, undefined),
        () => setStops(id, "failed"),
      )
    },
  }
}
