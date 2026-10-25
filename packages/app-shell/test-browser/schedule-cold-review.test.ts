import { expect, test } from "bun:test"
import { createRoot } from "solid-js"
import { createStore } from "solid-js/store"
import { createServerScheduleSource } from "../src/orchestra/chapters/schedule-server"
import { Orchestra } from "@orchestra/client"
import type { ScheduleTask } from "../src/orchestra/chapters/schedule-model"
import { localInput } from "../src/orchestra/chapters/schedule-model"
import { scheduleEditorFields } from "../src/orchestra/chapters/schedule"

// `listed` is what the first list request answers: the Orchestra client sends it as soon as the source is created.
function fixture(tasks: ScheduleTask[] = [], listed: Record<string, unknown>[] = []) {
  const requests: { method: string; path: string; body: Record<string, unknown> | undefined }[] = []
  const reply = { list: { status: 200, data: { data: listed } as unknown }, creates: 0 }
  const changed = Promise.withResolvers<void>()
  const transport = Object.assign(async (input: string | URL | Request, init?: RequestInit) => {
    const request = new Request(input, init)
    const body = request.body ? await request.json() as Record<string, unknown> : undefined
    const path = new URL(request.url).pathname
    requests.push({ method: request.method, path, body })
    if (request.method === "GET") return Response.json(reply.list.data, { status: reply.list.status })
    if (request.method === "POST" && path === "/api/schedule") {
      reply.creates++
      if (reply.creates === 1) return Response.json({ data: body })
      changed.resolve()
      return Response.json({ message: "second migration failed" }, { status: 503 })
    }
    return Response.json({ data: body })
  }, { preconnect: fetch.preconnect })
  return createRoot((dispose) => {
    const [saved, setSaved] = createStore({ tasks })
    const orchestra = Orchestra.make({ baseUrl: "http://schedule.test", fetch: transport })
    const callbacks: (() => void)[] = []
    const state = { unsupported: 0 }
    const source = createServerScheduleSource({ directory: "/repo", store: { saved, setSaved, ready: () => true, key: "cold-review" }, onUnsupported: () => state.unsupported++ }, {
      language: { t: (key) => key }, api: () => orchestra.schedules, timezone: "America/New_York",
      poll: (refresh) => { callbacks.push(refresh); return () => {} },
    })
    return { source, state, callbacks, saved, reply, changed, requests, dispose }
  })
}

for (const status of [404, 405, 501, 200]) {
  test(`cold review: accepted schedule support never falls back after partial migration and later ${status}`, async () => {
    const task = { name: "Original", prompt: "Work", cadence: "daily" as const, next: Date.now() + 86_400_000, enabled: true, runs: 0, minute: 600 }
    const f = fixture([{ ...task, id: "one" }, { ...task, id: "two" }])
    try {
      await f.changed.promise
      await until(() => f.source.status() === "ready")
      expect(f.reply.creates).toBe(2)
      f.reply.list = { status, data: status === 200 ? { malformed: true } : { message: "temporarily missing" } }
      f.callbacks[0]!()
      await drain()
      expect(f.state.unsupported).toBe(0)
      expect(f.source.status()).toBe("error")
      expect(f.saved.tasks.map((task) => task.id)).toEqual(["one", "two"])
      expect(f.reply.creates).toBe(2)
    } finally { f.dispose() }
  })
}

test("a failed read keeps the tasks already loaded and refresh recovers", async () => {
  const f = fixture()
  const remote = { id: "remote", name: "Original", prompt: "Work", cadence: "daily", next: Date.now() + 86_400_000, timezone: "UTC", minute: 600, enabled: true, runs: 0 }
  try {
    f.reply.list = { status: 200, data: { data: [remote] } }
    await f.source.refresh?.()
    expect(f.source.status()).toBe("ready")
    f.reply.list = { status: 503, data: { message: "down" } }
    await f.source.refresh?.()
    expect(f.source.status()).toBe("error")
    expect(f.source.tasks().map((task) => task.id)).toEqual(["remote"])
    f.reply.list = { status: 200, data: { data: [remote] } }
    await f.source.refresh?.()
    expect(f.source.status()).toBe("ready")
  } finally { f.dispose() }
})

test("cold review: metadata-only schedule save omits timing fields and preserves the remote timezone contract", async () => {
  const next = Date.UTC(2031, 0, 15, 9, 30, 23, 456)
  const f = fixture([], [{ id: "remote", name: "Original", prompt: "Work", cadence: "daily", next, timezone: "Asia/Tokyo", minute: 1110, enabled: true, runs: 0 }])
  try {
    await until(() => f.source.status() === "ready")
    const form = new FormData()
    form.set("name", "Renamed")
    form.set("prompt", "Work")
    form.set("cadence", "daily")
    form.set("date", localInput(next))
    const fields = scheduleEditorFields(form, { next })
    expect(fields.next).toBe(next)
    await f.source.save("remote", fields, false)
    expect(f.requests.filter((request) => request.method === "PATCH").at(-1)?.body).toEqual({ name: "Renamed", prompt: "Work" })
    await f.source.save("remote", { name: "Retimed", prompt: "Work", cadence: "weekly", next: next + 60_000 }, false)
    expect(f.requests.filter((request) => request.method === "PATCH").at(-1)?.body).toEqual({ name: "Retimed", prompt: "Work", cadence: "weekly", next: next + 60_000, timezone: "America/New_York" })
  } finally { f.dispose() }
})

async function drain() { for (let turn = 0; turn < 40; turn++) await Promise.resolve() }
async function until(check: () => boolean) {
  for (let turn = 0; turn < 100 && !check(); turn++) await new Promise((resolve) => setTimeout(resolve, 0))
  expect(check()).toBe(true)
}
