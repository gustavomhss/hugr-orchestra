export const pullLimits = { bytes: 4 * 1024 * 1024, records: 20_000 }

// One total deadline covers headers, progress and terminal success. The owner
// adopts cancellation before fetch; every exit cancels/releases the response body.
export async function pullOllamaModel(endpoint: string, model: string, signal: AbortSignal, evidence: (report: PullReport) => Promise<void>, budgetMs = 600_000) {
  const report = { route: "/api/pull", model, stream: true, budgetMs, startedAt: Date.now(), elapsedMs: 0,
    status: undefined as number | undefined, body: "", bytes: 0, truncated: false, success: false,
    progress: [] as Array<{ elapsedMs: number; record: unknown }>, error: undefined as string | undefined }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error("OLLAMA_PULL_DEADLINE")), budgetMs)
  const state = { reader: undefined as ReadableStreamDefaultReader<Uint8Array> | undefined, pending: "" }
  const decoder = new TextDecoder("utf-8", { fatal: true })
  const record = (line: string) => {
    if (report.success) throw new Error("OLLAMA_PULL_RECORD_AFTER_SUCCESS")
    if (report.progress.length >= pullLimits.records) throw new Error("OLLAMA_PULL_RECORD_CAP")
    const value: unknown = JSON.parse(line)
    report.progress.push({ elapsedMs: Date.now() - report.startedAt, record: value })
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("OLLAMA_PULL_MALFORMED_RECORD")
    if ("error" in value) throw new Error(`OLLAMA_PULL_REMOTE_ERROR: ${String(value.error)}`)
    if (!("status" in value) || typeof value.status !== "string" || !value.status) throw new Error("OLLAMA_PULL_MALFORMED_RECORD")
    return value.status === "success"
  }
  return (async () => {
    const response = await fetch(endpoint + report.route, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model, stream: true }),
      signal: AbortSignal.any([signal, controller.signal]), redirect: "error",
    })
    report.status = response.status
    if (!response.body) throw new Error("OLLAMA_PULL_BODY_MISSING")
    state.reader = response.body.getReader()
    while (true) {
      const chunk = await state.reader.read()
      if (Date.now() - report.startedAt >= budgetMs) throw new Error("OLLAMA_PULL_DEADLINE")
      const remaining = pullLimits.bytes - report.bytes
      report.bytes += chunk.value?.byteLength ?? 0
      const text = chunk.done ? decoder.decode() : decoder.decode(chunk.value.subarray(0, remaining), { stream: true })
      report.body += text
      if (report.bytes > pullLimits.bytes) { report.truncated = true; throw new Error("OLLAMA_PULL_BYTE_CAP") }
      state.pending += text
      if (response.ok) {
        while (state.pending.includes("\n")) {
          const end = state.pending.indexOf("\n")
          const line = state.pending.slice(0, end)
          state.pending = state.pending.slice(end + 1)
          if (record(line)) report.success = true
        }
      }
      if (!chunk.done) continue
      if (!response.ok) throw new Error(`OLLAMA_HTTP_FAILED: /api/pull status=${response.status} body=${report.body.slice(0, 1024)}`)
      if (state.pending && record(state.pending)) report.success = true
      if (report.success) return
      throw new Error("OLLAMA_PULL_EOF_WITHOUT_SUCCESS")
    }
  })().catch((error: unknown) => {
    report.success = false
    report.error = error instanceof Error ? error.message : String(error)
    throw error
  }).finally(async () => {
    clearTimeout(timer)
    controller.abort()
    await state.reader?.cancel().catch(() => undefined)
    state.reader?.releaseLock()
    report.elapsedMs = Date.now() - report.startedAt
    await evidence(report)
  })
}

export type PullReport = {
  route: string; model: string; stream: boolean; budgetMs: number; startedAt: number; elapsedMs: number
  status?: number; body: string; bytes: number; truncated: boolean; success: boolean
  progress: Array<{ elapsedMs: number; record: unknown }>; error?: string
}
