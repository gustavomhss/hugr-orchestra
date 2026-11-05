import { expect, test, vi } from "bun:test"
import { setImmediate } from "node:timers"
import { createComponent, createEffect, createSignal } from "solid-js"
import { render } from "./lean-dom.test-helper"
import { solidDom } from "./solid-dom"

const { PlatformProvider }: typeof import("@/context/platform") = await import(solidDom("@/context/platform", import.meta.dir))
const { ServerConnection }: typeof import("@/context/server") = await import(solidDom("@/context/server", import.meta.dir))
const { useServerHealth }: typeof import("@/utils/server-health") = await import(solidDom("@/utils/server-health", import.meta.dir))
const { markStreamActivity, clearStreamActivity }: typeof import("@/utils/server-stream-liveness") = await import(
  solidDom("@/utils/server-stream-liveness", import.meta.dir)
)

// Let the generated client and the hook finish their promise continuations without advancing the fake clock.
const settle = () => new Promise<void>((resolve) => setImmediate(resolve))
const up = () => new Response(JSON.stringify({ healthy: true, version: "test" }), {
  headers: { "content-type": "application/json" },
})
const miss = () => new Response("bad request", { status: 400 })

function mount(url: string) {
  const server: import("@/context/server").ServerConnection.Http = { type: "http", http: { url } }
  const key = ServerConnection.key(server)
  const requests: { input: string | URL | Request; resolve: (response: Response) => void }[] = []
  const fetch = ((input: string | URL | Request) => new Promise<Response>((resolve) => {
    requests.push({ input, resolve })
  })) as typeof globalThis.fetch
  const [enabled, setEnabled] = createSignal(true)
  const host = document.createElement("div")
  document.body.append(host)
  let closed = false
  let status: ReturnType<typeof useServerHealth> | undefined
  const observed: (boolean | undefined)[] = []
  const dispose = render(() => createComponent(PlatformProvider, {
    value: { platform: "web", fetch, openExternal() {}, async restart() {}, async notify() {} },
    get children() {
      return createComponent(() => {
        status = useServerHealth(() => [server], enabled)
        createEffect(() => observed.push(status?.[key]?.healthy))
        return null
      }, {})
    },
  }), host)
  return {
    requests,
    observed,
    setEnabled,
    health: () => status?.[key],
    close() {
      if (closed) return
      closed = true
      dispose()
      host.remove()
    },
  }
}

test("one pending failed round across an interval counts as one miss", async () => {
  const url = "http://running-guard.health.test"
  vi.useFakeTimers()
  let view: ReturnType<typeof mount> | undefined
  try {
    view = mount(url)
    await settle()
    expect(view.requests).toHaveLength(1)
    view.requests[0].resolve(up())
    await settle()
    expect(view.health()).toEqual({ healthy: true, version: "test" })

    vi.advanceTimersByTime(10_000)
    await settle()
    expect(view.requests).toHaveLength(2)
    vi.advanceTimersByTime(10_000)
    await settle()
    expect(view.requests).toHaveLength(2)
    view.requests[1].resolve(miss())
    await settle()
    // In-flight cache deduplication alone cannot prove the guard: without it, both refreshes
    // consume this same failure and the second continuation prematurely demotes the status.
    expect(view.health()).toEqual({ healthy: true, version: "test" })
    vi.advanceTimersByTime(1_999)
    await settle()
    expect(view.requests).toHaveLength(2)
    vi.advanceTimersByTime(1)
    await settle()
    expect(view.requests).toHaveLength(3)
    view.requests[2].resolve(up())
    await settle()
    expect(view.health()?.healthy).toBe(true)
  } finally {
    view?.close()
    clearStreamActivity(url)
    vi.useRealTimers()
  }
})

test("a first miss keeps health until confirmation at 2000ms, then a second miss marks down", async () => {
  const url = "http://confirmation.health.test"
  vi.useFakeTimers()
  let view: ReturnType<typeof mount> | undefined
  try {
    view = mount(url)
    await settle()
    expect(view.requests).toHaveLength(1)
    view.requests[0].resolve(up())
    await settle()
    expect(view.health()?.healthy).toBe(true)
    vi.advanceTimersByTime(10_000)
    await settle()
    expect(view.requests).toHaveLength(2)
    view.requests[1].resolve(miss())
    await settle()
    expect(view.health()?.healthy).toBe(true)
    vi.advanceTimersByTime(1_999)
    await settle()
    expect(view.requests).toHaveLength(2)
    expect(view.health()?.healthy).toBe(true)
    vi.advanceTimersByTime(1)
    await settle()
    expect(view.requests).toHaveLength(3)
    view.requests[2].resolve(miss())
    await settle()
    expect(view.health()?.healthy).toBe(false)
  } finally {
    view?.close()
    clearStreamActivity(url)
    vi.useRealTimers()
  }
})

for (const mode of ["dispose", "disable"] as const) {
  test(`${mode} cancels pending confirmation and ignores a later in-flight result`, async () => {
    const url = `http://${mode}-confirmation.health.test`
    const pendingUrl = `http://${mode}-pending.health.test`
    vi.useFakeTimers()
    let view: ReturnType<typeof mount> | undefined
    let pending: ReturnType<typeof mount> | undefined
    try {
      view = mount(url)
      await settle()
      expect(view.requests).toHaveLength(1)
      view.requests[0].resolve(up())
      await settle()
      expect(view.health()?.healthy).toBe(true)
      vi.advanceTimersByTime(10_000)
      await settle()
      expect(view.requests).toHaveLength(2)
      view.requests[1].resolve(miss())
      await settle()
      expect(view.health()?.healthy).toBe(true)
      if (mode === "dispose") view.close()
      if (mode === "disable") view.setEnabled(false)
      const afterCleanup = view.health()
      if (mode === "disable") expect(afterCleanup).toBeUndefined()
      const observations = view.observed.slice()
      vi.advanceTimersByTime(2_001)
      await settle()
      expect(view.requests).toHaveLength(2)
      expect(view.health()).toEqual(afterCleanup)
      expect(view.observed).toEqual(observations)

      pending = mount(pendingUrl)
      await settle()
      expect(pending.requests).toHaveLength(1)
      if (mode === "dispose") pending.close()
      if (mode === "disable") pending.setEnabled(false)
      const pendingObservations = pending.observed.slice()
      pending.requests[0].resolve(up())
      await settle()
      expect(pending.health()).toBeUndefined()
      expect(pending.observed).toEqual(pendingObservations)
    } finally {
      view?.close()
      pending?.close()
      clearStreamActivity(url)
      clearStreamActivity(pendingUrl)
      vi.useRealTimers()
    }
  })
}

test("real stream activity suppresses a poll and clearing it resumes fetching", async () => {
  const url = "http://stream-active.health.test"
  vi.useFakeTimers()
  let view: ReturnType<typeof mount> | undefined
  try {
    view = mount(url)
    await settle()
    expect(view.requests).toHaveLength(1)
    view.requests[0].resolve(up())
    await settle()
    expect(view.health()?.healthy).toBe(true)
    markStreamActivity(url)
    vi.advanceTimersByTime(10_000)
    await settle()
    expect(view.requests).toHaveLength(1)
    expect(view.health()?.healthy).toBe(true)
    clearStreamActivity(url)
    vi.advanceTimersByTime(10_000)
    await settle()
    expect(view.requests).toHaveLength(2)
    view.requests[1].resolve(up())
    await settle()
    expect(view.health()?.healthy).toBe(true)
  } finally {
    view?.close()
    clearStreamActivity(url)
    vi.useRealTimers()
  }
})
