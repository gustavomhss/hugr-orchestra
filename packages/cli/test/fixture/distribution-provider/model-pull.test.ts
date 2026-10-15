import { expect, test } from "bun:test"
import { pullLimits, pullOllamaModel } from "./model-pull"
import type { PullReport } from "./model-pull"

function fixture(chunks: readonly string[], options: { status?: number; hold?: boolean; delay?: number; budget?: number } = {}) {
  const cancelled = Promise.withResolvers<void>()
  const observed = { cancelled: false, request: undefined as { route: string; method: string; body: unknown } | undefined }
  const reports: PullReport[] = []
  const owner = new AbortController()
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, idleTimeout: 0, async fetch(request) {
    observed.request = { route: new URL(request.url).pathname, method: request.method, body: await request.json() }
    return new Response(new ReadableStream<Uint8Array>({
      async start(controller) {
        for (const chunk of chunks) {
          await Bun.sleep(options.delay ?? 2)
          if (observed.cancelled) return
          controller.enqueue(new TextEncoder().encode(chunk))
        }
        if (!options.hold && !observed.cancelled) controller.close()
      },
      cancel() { observed.cancelled = true; cancelled.resolve() },
    }), { status: options.status ?? 200, headers: { "content-type": "application/x-ndjson" } })
  } })
  return { owner, reports, observed, cancelled: cancelled.promise,
    pull: () => pullOllamaModel(server.url.origin, "pinned-fixture", owner.signal, async (report) => { reports.push(report) }, options.budget ?? 2_000),
    stop: () => server.stop(true) }
}

test("actual POST streams fragmented progress and accepts only terminal success", async () => {
  const box = fixture(['{"sta', 'tus":"pulling manifest"}\n{"status":"downloading","completed":2}\n', '{"status":"success"}'])
  try {
    await box.pull()
    expect(box.observed.request).toEqual({ route: "/api/pull", method: "POST", body: { model: "pinned-fixture", stream: true } })
    expect(box.reports[0]).toMatchObject({ status: 200, success: true, truncated: false, budgetMs: 2_000 })
    expect(box.reports[0].progress.map((entry) => entry.record)).toEqual([
      { status: "pulling manifest" }, { status: "downloading", completed: 2 }, { status: "success" },
    ])
    expect(box.reports[0].progress.every((entry) => entry.elapsedMs >= 0 && entry.elapsedMs <= box.reports[0].elapsedMs)).toBe(true)
  } finally { await box.stop() }
})

test("HTTP and streamed errors retain actual body, status and prior progress", async () => {
  for (const status of [200, 500]) {
    const body = status === 200 ? '{"status":"pulling manifest"}\n{"error":"upstream download timeout"}\n' : 'upstream temporary HTTP 503'
    const box = fixture([body], { status })
    try {
      await expect(box.pull()).rejects.toThrow(status === 200 ? "OLLAMA_PULL_REMOTE_ERROR: upstream download timeout" : "OLLAMA_HTTP_FAILED: /api/pull status=500")
      expect(box.reports[0]).toMatchObject({ route: "/api/pull", status, body, success: false })
      expect(box.reports[0].progress.length).toBe(status === 200 ? 2 : 0)
      expect(box.reports[0].error).toContain(status === 200 ? "upstream download timeout" : body)
    } finally { await box.stop() }
  }
})

test("malformed records and EOF without success fail closed with evidence", async () => {
  for (const body of ['{broken}\n', '{"status":false}\n', '{"status":"pulling manifest"}\n', '', '{"status":"success"}\n{"error":"late-error"}\n']) {
    const box = fixture([body])
    try {
      await expect(box.pull()).rejects.toThrow()
      expect(box.reports[0]).toMatchObject({ body, success: false })
      expect(box.reports[0].error).toBeTruthy()
    } finally { await box.stop() }
  }
})

test("record and byte caps bound actual HTTP responses", async () => {
  for (const [body, error] of [
    ['{"status":"pulling"}\n'.repeat(pullLimits.records + 1), "OLLAMA_PULL_RECORD_CAP"],
    ["x".repeat(pullLimits.bytes + 1), "OLLAMA_PULL_BYTE_CAP"],
  ]) {
    const box = fixture([body])
    try {
      await expect(box.pull()).rejects.toThrow(error)
      expect(box.reports[0].body.length).toBeLessThanOrEqual(pullLimits.bytes)
      expect(box.reports[0].progress.length).toBeLessThanOrEqual(pullLimits.records)
      expect(box.reports[0].success).toBe(false)
    } finally { await box.stop() }
  }
})

test("progress cannot renew total deadline; owner cancellation closes HTTP body", async () => {
  for (const mode of ["deadline", "owner"]) {
    const box = fixture(Array(10).fill('{"status":"pulling"}\n'), { delay: 15, hold: true, budget: mode === "deadline" ? 70 : 2_000 })
    const timer = mode === "owner" ? setTimeout(() => box.owner.abort(new Error("owner-stop")), 40) : undefined
    try {
      await expect(box.pull()).rejects.toThrow(mode === "deadline" ? "OLLAMA_PULL_DEADLINE" : "owner-stop")
      await Promise.race([box.cancelled, Bun.sleep(500).then(() => { throw new Error("HTTP_BODY_NOT_CANCELLED") })])
      expect(box.reports[0].progress.length).toBeGreaterThan(0)
      expect(box.reports[0].elapsedMs).toBeLessThan(500)
      expect(box.reports[0].success).toBe(false)
    } finally { clearTimeout(timer); await box.stop() }
  }
})
