import { afterEach, expect, test } from "bun:test"
import { Capability } from "@orchestra/schema/capability"
import { SessionID } from "@orchestra/schema/session-id"
import { createRoot } from "solid-js"
import type { Part, ToolState } from "@/v2-wire"
import { createArtifactsApi } from "./artifacts-api"
import { artifactChips, createArtifactsModel, orderArtifacts, previewKind, verificationNote } from "./artifacts-model"

const cleanup = new Set<() => void>()
afterEach(() => { cleanup.forEach((dispose) => dispose()); cleanup.clear() })

// happydom replaces Response, but Bun.serve requires Bun's native wire response.
const Response = (await Bun.fetch("data:application/json,{}")).constructor as typeof global.Response
const json = (value: unknown, status = 200) => Response.json(value, { status })
const session = (index: number) => SessionID.make(`ses_${String(index).padStart(26, "0")}`)
const ref = (index: number, revision = 0) =>
  ({ id: Capability.ArtifactID.make(`cart_${String(index).padStart(26, "0")}`), revision })
const artifact = (index: number, input: { time?: number; pinned?: boolean; mime?: string;
  verification?: Capability.Verification } = {}) => ({ artifact: ref(index), mime: input.mime ?? "image/png",
  kind: "file", hash: "a".repeat(64), bytes: 10, verification: input.verification ?? "verified",
  timeCreated: input.time ?? index, pinned: input.pinned ?? false })
const receipt = (key: string, reused: boolean, data: unknown) => ({ requestID: `request ${key}`, reused, data })

function fixture(handler: (request: Request, body: unknown) => Response | Promise<Response>) {
  const requests: { method: string; url: URL; key: string | null; body: unknown }[] = []
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
    const key = request.headers.get("idempotency-key")
    const body = request.method === "GET" || request.method === "DELETE" ? undefined : await request.json()
    requests.push({ method: request.method, url: new URL(request.url), key: key === null ? null : decodeURIComponent(key), body })
    return handler(request, body)
  } })
  cleanup.add(() => server.stop(true))
  const api = createArtifactsApi({ server: { url: server.url.href }, directory: "/work/project", sessionID: session(1) })
  const keys = ["key-1", "key-2", "key-3", "key-4"]
  const model = createRoot((dispose) => {
    cleanup.add(dispose)
    return createArtifactsModel(api, () => keys.shift() ?? "spent")
  })
  return { api, model, requests, server }
}

test("pages with the advancing cursor and keeps pinned artifacts first, newest first", async () => {
  const f = fixture((request) => new URL(request.url).searchParams.has("after")
    ? json({ items: [artifact(3, { time: 0, pinned: true })], coverage: "live" })
    : json({ items: [artifact(1, { time: 1 }), artifact(2, { time: 3 })], coverage: "live", after: `${ref(2).id}:0` }))
  expect(f.model.visible()).toBe(false)
  await f.model.load()
  expect(f.model.visible()).toBe(true)
  await f.model.load(true)
  expect(f.model.state.artifacts.map((row) => row.artifact.id)).toEqual([ref(3).id, ref(2).id, ref(1).id])
  expect(f.requests.map((row) => row.url.searchParams.get("after"))).toEqual([null, `${ref(2).id}:0`])
  expect(f.requests.every((row) => row.url.searchParams.get("location[directory]") === "/work/project")).toBe(true)
  await f.model.load(true)
  expect(f.requests).toHaveLength(2)
  expect(f.model.state.status).toBe("ready")
})

test("a page that repeats its cursor is refused instead of looping", async () => {
  const f = fixture(() => json({ items: [artifact(1)], coverage: "live", after: `${ref(1).id}:0` }))
  await f.model.load()
  await f.model.load(true)
  expect(f.model.state.status).toBe("error")
  expect(f.model.state.failure).toBe("invalid")
})

test("pin retry reuses the original key and reports the reused receipt", async () => {
  const replies = [json({ _tag: "UnknownError", message: "lost" }, 500)]
  const f = fixture((request, body) => {
    if (request.method === "GET") return json({ items: [artifact(1, { time: 1 }), artifact(2, { time: 2 })], coverage: "live" })
    return replies.shift() ?? json(receipt(String(request.headers.get("idempotency-key")), true,
      { artifact: ref(1), pinned: (body as { pinned: boolean }).pinned }))
  })
  await f.model.load()
  await f.model.pin(ref(1), true)
  expect(f.model.state.outcomes).toEqual([{ targetSessionID: undefined, failure: "request" }])
  expect(f.model.state.retryable).toBe(true)
  expect(f.model.state.artifacts[0].artifact).toEqual(ref(2))
  await f.model.retry()
  const writes = f.requests.filter((row) => row.method === "PUT")
  expect(writes.map((row) => row.key)).toEqual(["key-1", "key-1"])
  expect(writes.map((row) => row.body)).toEqual([{ pinned: true }, { pinned: true }])
  expect(f.model.state.action).toBe("pin")
  expect(f.model.state.outcomes[0].receipt?.reused).toBe(true)
  expect(f.model.state.retryable).toBe(false)
  expect(f.model.state.artifacts.map((row) => [row.artifact.id, row.pinned])).toEqual([[ref(1).id, true], [ref(2).id, false]])
  await f.model.retry()
  expect(f.requests.filter((row) => row.method === "PUT")).toHaveLength(2)
})

test("a receipt for another artifact never changes the list", async () => {
  const f = fixture((request) => request.method === "GET"
    ? json({ items: [artifact(1)], coverage: "live" })
    : json(receipt("key-1", false, { artifact: ref(9), pinned: true })))
  await f.model.load()
  await f.model.pin(ref(1), true)
  expect(f.model.state.outcomes[0].failure).toBe("unknown")
  expect(f.model.state.artifacts[0].pinned).toBe(false)
})

test("removing a pinned reference reports the conflict and keeps the row; an unpinned one leaves this session", async () => {
  const f = fixture((request) => {
    if (request.method === "GET") return json({ items: [artifact(1, { pinned: true }), artifact(2)], coverage: "live" })
    if (new URL(request.url).pathname.includes(ref(1).id))
      return json({ _tag: "ConflictError", message: "reference_pinned" }, 409)
    return json(receipt("key-2", false, { artifact: ref(2), removed: true }))
  })
  await f.model.load()
  await f.model.remove(ref(1))
  expect(f.model.state.outcomes).toEqual([{ targetSessionID: undefined, failure: "conflict" }])
  expect(f.model.state.retryable).toBe(false)
  expect(f.model.state.artifacts).toHaveLength(2)
  await f.model.retry()
  expect(f.requests.filter((row) => row.method === "DELETE")).toHaveLength(1)
  await f.model.select(ref(2))
  await f.model.remove(ref(2))
  expect(f.model.state.outcomes[0].receipt?.data).toEqual({ artifact: ref(2), removed: true })
  expect(f.model.state.artifacts.map((row) => row.artifact)).toEqual([ref(1)])
  expect(f.model.state.selected).toBeUndefined()
  expect(f.model.selection()).toBeUndefined()
})

test("share sends one request per target and retries only the failed one with its own key", async () => {
  const failed = new Set([session(3)])
  const f = fixture((request, body) => {
    if (request.method === "GET") return json({ items: [artifact(1)], coverage: "live" })
    const target = (body as { targetSessionID: SessionID }).targetSessionID
    if (failed.delete(target)) return json({ _tag: "UnknownError", message: "lost" }, 500)
    return json(receipt(String(request.headers.get("idempotency-key")), target === session(3),
      { artifact: ref(1), targetSessionID: target }))
  })
  await f.model.load()
  await f.model.share(ref(1), [session(2), session(3), session(2)])
  expect(f.model.state.outcomes.map((row) => [row.targetSessionID, row.receipt?.reused, row.failure]))
    .toEqual([[session(2), false, undefined], [session(3), undefined, "request"]])
  expect(f.model.state.retryable).toBe(true)
  await f.model.retry()
  expect(f.requests.filter((row) => row.method === "POST").map((row) => [row.key, row.body])).toEqual([
    ["key-1", { targetSessionID: session(2) }],
    ["key-2", { targetSessionID: session(3) }],
    ["key-2", { targetSessionID: session(3) }],
  ])
  expect(f.model.state.outcomes.map((row) => [row.targetSessionID, row.receipt?.reused]))
    .toEqual([[session(2), false], [session(3), true]])
  expect(f.model.state.retryable).toBe(false)
})

test("a chip for an artifact beyond the loaded pages fetches it and exposes its preview", async () => {
  const f = fixture((request) => new URL(request.url).pathname.endsWith("/artifacts")
    ? json({ items: [artifact(1)], coverage: "live" })
    : json({ ...artifact(7, { mime: "application/pdf; charset=binary", verification: "observed" }), artifact: ref(7, 2) }))
  await f.model.load()
  await f.model.select(ref(7, 2))
  expect(f.requests.at(-1)?.url.pathname).toBe(`/api/capability/sessions/${session(1)}/artifacts/${ref(7).id}/2`)
  const selection = f.model.selection()
  expect(selection?.preview).toBe("pdf")
  expect(selection?.note).toBe("not-verified")
  expect(selection?.url).toBe(`${f.server.url.origin}/api/capability/sessions/${session(1)}/artifacts/${ref(7).id}/2/content`
    + "?location%5Bdirectory%5D=%2Fwork%2Fproject")
  await f.model.select(ref(1))
  expect(f.requests).toHaveLength(2)
  expect(f.model.selection()?.note).toBeUndefined()
})

test("ordering breaks ties by identity, independent of arrival order", () => {
  const rows = [artifact(1, { time: 5 }), artifact(2, { time: 5 }), artifact(3, { time: 9, pinned: true })]
  expect(orderArtifacts(rows).map((row) => row.artifact.id)).toEqual([ref(3).id, ref(2).id, ref(1).id])
  expect(orderArtifacts(rows.toReversed())).toEqual(orderArtifacts(rows))
})

test("preview kind follows the mime and falls back to download", () => {
  expect(["image/PNG", "image/svg+xml", "video/mp4", "application/pdf", "text/csv; charset=utf-8",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.oasis.opendocument.spreadsheet",
    "application/vnd.ms-excel", "image/tiff", "application/zip", ""].map(previewKind))
    .toEqual(["image", "image", "video", "pdf", "sheet", "sheet", "sheet", "download", "download", "download", "download"])
  expect(["verified", "observed", "acknowledged"].map((value) => verificationNote(value as Capability.Verification)))
    .toEqual([undefined, "not-verified", "not-verified"])
})

test("chips come from artifactRefs in a completed tool output, deduplicated, ignoring malformed refs", () => {
  const part = (state: ToolState): Part => ({ id: "prt_1", sessionID: "ses_1", messageID: "msg_1", type: "tool",
    callID: "call_1", tool: "artifact_create", state })
  const time = { start: 1, end: 2 }
  const output = JSON.stringify({ status: "completed", artifactRefs: [ref(1), ref(1)],
    delivery: { result: { artifactRefs: [ref(2, 3), { id: "nope", revision: 0 }, { ...ref(4), extra: true }] } } })
  expect(artifactChips(part({ status: "completed", input: {}, output, title: "", metadata: { artifactRefs: [ref(1), ref(5)] },
    time }))).toEqual([ref(1), ref(2, 3), ref(5)])
  expect(artifactChips(part({ status: "completed", input: {}, output: output.slice(0, 40), title: "", metadata: {}, time })))
    .toEqual([])
  expect(artifactChips(part({ status: "running", input: {}, time: { start: 1 } }))).toEqual([])
  expect(artifactChips(part({ status: "completed", input: {}, title: "", metadata: {}, time,
    output: JSON.stringify({ a: { b: { c: { d: { e: { artifactRefs: [ref(6)] } } } } } }) }))).toEqual([])
})
