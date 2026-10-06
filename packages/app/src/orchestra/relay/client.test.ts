import { describe, expect, test } from "bun:test"
import { createRelayClient, decodeDocument, decodeRun, documentKind, RelayError, relayUnsupported } from "./client"

type Call = { url: URL; init: RequestInit }

function server(respond: (call: Call) => Response) {
  const calls: Call[] = []
  const client = createRelayClient({
    server: { url: "http://127.0.0.1:4096", username: "opencode", password: "secret" },
    directory: "/repo/a b",
    fetch: async (url, init) => {
      const call = { url, init }
      calls.push(call)
      return respond(call)
    },
  })
  return { client, calls }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })

describe("requests", () => {
  test("scope every call to the profile's location and send the server's credentials", async () => {
    const api = server(() => json([]))
    expect(await api.client.runs("wp-execute")).toEqual([])
    const call = api.calls[0]
    expect(call.url.pathname).toBe("/api/relay/run")
    expect(call.url.searchParams.get("location[directory]")).toBe("/repo/a b")
    expect(call.url.searchParams.get("document")).toBe("wp-execute")
    expect(new Headers(call.init.headers).get("authorization")).toBe(`Basic ${btoa("opencode:secret")}`)
  })

  test("a save sends the document back with its version guard", async () => {
    const stored = {
      id: "d",
      name: "Doc",
      nodes: [],
      connections: {},
      versionId: "v1",
      versionCounter: 1,
      checksum: "c1",
      meta: { relay: { kind: "workflow", sprint: { keep: true } } },
      extra: 1,
    }
    const api = server((call) => json({ ...JSON.parse(String(call.init.body)), versionId: "v2", versionCounter: 2 }))
    const saved = await api.client.save(decodeDocument(stored)[0], { name: "Renamed" })
    const body = JSON.parse(String(api.calls[0].init.body))
    expect(api.calls[0].init.method).toBe("PATCH")
    expect(body).toMatchObject({
      name: "Renamed",
      versionId: "v1",
      expectedChecksum: "c1",
      extra: 1,
      meta: { relay: { sprint: { keep: true } } },
    })
    expect([saved.versionId, saved.versionCounter, saved.name]).toEqual(["v2", 2, "Renamed"])
  })

  test("a server without Relay routes reads as unsupported; other failures keep their message", async () => {
    const missing = server(() => json({ message: "Not found" }, 404))
    const failure = await missing.client.documents().catch((error: unknown) => error)
    expect(relayUnsupported(failure)).toBe(true)
    const shell = server(
      () => new Response("<!doctype html>", { status: 200, headers: { "content-type": "text/html" } }),
    )
    expect(relayUnsupported(await shell.client.documents().catch((error: unknown) => error))).toBe(true)
    const conflict = server(() => json({ message: "Stale version", code: "conflict" }, 409))
    const error = await conflict.client.release("1042", "fixed").catch((cause: unknown) => cause)
    expect(error).toBeInstanceOf(RelayError)
    expect(relayUnsupported(error)).toBe(false)
    expect(error instanceof RelayError && [error.status, error.message, error.code]).toEqual([
      409,
      "Stale version",
      "conflict",
    ])
  })

  test("location-scoped answers are unwrapped", async () => {
    const api = server(() =>
      json({ location: { directory: "/repo" }, data: [{ id: "d", name: "Doc", nodes: [], connections: {} }] }),
    )
    expect((await api.client.documents()).map((item) => item.id)).toEqual(["d"])
  })
})

describe("decoding", () => {
  test("the published counter comes from the active version, or from the draft when they are the same", () => {
    const base = { id: "d", name: "Doc", nodes: [], connections: {}, versionCounter: 4 }
    expect(
      decodeDocument({ ...base, versionId: "v4", activeVersionId: "v3", activeVersion: { versionCounter: 3 } })[0]
        .publishedCounter,
    ).toBe(3)
    expect(decodeDocument({ ...base, versionId: "v4", activeVersionId: "v4" })[0].publishedCounter).toBe(4)
    expect(decodeDocument({ ...base, versionId: "v4", activeVersionId: "v3" })[0].publishedCounter).toBeUndefined()
    expect(decodeDocument({ ...base, versionId: "v4", activeVersionId: null })[0].activeVersionId).toBeNull()
    expect(decodeDocument({ name: "no id" })).toEqual([])
  })

  test("the kind comes from the metadata, then from the node types", () => {
    const hook = decodeDocument({
      id: "h",
      name: "H",
      nodes: [{ id: "t", name: "T", type: "relay.hookEventTrigger", position: [0, 0] }],
      connections: {},
    })[0]
    expect(documentKind(hook)).toBe("hook")
    expect(documentKind({ ...hook, meta: { relay: { kind: "workflow" } } })).toBe("workflow")
  })

  test("runs keep only what the server reported", () => {
    const [run] = decodeRun({
      runID: "1",
      documentID: "d",
      status: "awaiting-human",
      steps: [
        {
          wp: "a",
          status: "escalate",
          attempts: 4,
          checks: [
            { id: "x", verdict: "fail" },
            { id: "y", verdict: "maybe" },
          ],
        },
      ],
    })
    expect(run.status).toBe("parked")
    expect(run.steps[0]).toMatchObject({
      wp: "a",
      status: "escalated",
      attempts: 4,
      checks: [{ id: "x", verdict: "fail", output: undefined }],
    })
    expect([run.label, run.baseRef, run.startedAt]).toEqual([undefined, undefined, undefined])
    expect(decodeRun({ runID: "1", documentID: "d", status: "unknown" })).toEqual([])
  })
})
