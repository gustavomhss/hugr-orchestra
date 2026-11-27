import { Orchestra } from "@orchestra/client"
import type { ActivityMonitor } from "@orchestra/schema/activity-monitor"
import { WorktreeReading } from "../src/orchestra/chapters/activity/worktree-reading"

export function snapshot(
  snapshotRevision = "0",
  patch: Partial<ActivityMonitor.WorktreeSnapshot> = {},
): ActivityMonitor.WorktreeSnapshot {
  return {
    instanceID: "server-first",
    snapshotRevision,
    readAt: 1000,
    inventoryAt: 1000,
    source: "node.fs.lstat",
    coverage: "registered-git-worktrees",
    records: [row("a"), row("b")],
    ...patch,
  }
}

export function row(
  recordID: string,
  patch: Partial<ActivityMonitor.WorktreeRecord> = {},
): ActivityMonitor.WorktreeRecord {
  return {
    recordID,
    projectID: `project-${recordID}`,
    registrationID: `registration-${recordID}`,
    directory: `/registered/${recordID}`,
    owner: "",
    ...patch,
  }
}

export function bounded<A>(promise: Promise<A>) {
  const timeout = Promise.withResolvers<A>()
  const timer = setTimeout(() => timeout.reject(new Error("Worktree UI request barrier timed out")), 10_000)
  return Promise.race([promise, timeout.promise]).finally(() => clearTimeout(timer))
}

function request(url: string, init?: RequestInit) {
  const response = Promise.withResolvers<Response>()
  const state = { settled: false }
  return {
    url: new URL(url),
    method: init?.method ?? "GET",
    signal: init?.signal,
    response: response.promise,
    state,
    respond(value: unknown, status = 200) {
      state.settled = true
      response.resolve(new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } }))
    },
    fail(error: unknown) {
      state.settled = true
      response.reject(error)
    },
  }
}

// Deferred transport proves request admission/store behavior, not actual HTTP or DOM.
export function setup() {
  const clock = { now: 100 }
  const reports: unknown[] = []
  const calls: ReturnType<typeof request>[] = []
  const pending: ReturnType<typeof request>[] = []
  const waiting: ReturnType<typeof Promise.withResolvers<ReturnType<typeof request>>>[] = []
  const client = Orchestra.make({
    baseUrl: "http://activity-unit.test",
    fetch: Object.assign(
      (url: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        const call = request(String(url), init)
        calls.push(call)
        const waiter = waiting.shift()
        if (waiter) waiter.resolve(call)
        if (!waiter) pending.push(call)
        return call.response
      },
      { preconnect: fetch.preconnect },
    ),
  })
  const controller = WorktreeReading.make({
    api: client.activity,
    now: () => clock.now,
    report: (error) => reports.push(error),
  })
  return {
    controller,
    clock,
    reports,
    calls,
    next() {
      const call = pending.shift()
      if (call) return Promise.resolve(call)
      const waiter = Promise.withResolvers<ReturnType<typeof request>>()
      waiting.push(waiter)
      return bounded(waiter.promise)
    },
    dispose() {
      controller.dispose()
      calls
        .filter((call) => !call.state.settled)
        .forEach((call) => call.fail(new DOMException("Disposed", "AbortError")))
      waiting.splice(0).forEach((waiter) => waiter.reject(new Error("Disposed request barrier")))
    },
  }
}
