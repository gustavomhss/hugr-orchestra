import { describe, expect, test } from "bun:test"
import { createSdkForServer } from "@/utils/server"
import {
  createRelayClient,
  decisionTime,
  decodeDocument,
  documentKind,
  RelayError,
  relayUnsupported,
  type RelayDocumentView,
} from "./client"
import { createRunClient, decodeRun } from "./runs"

const directory = "/repo/a b"

function server(respond: (request: Request) => Response) {
  const requests: Request[] = []
  const fetcher = Object.assign(
    async (input: string | URL | Request, init?: RequestInit) => {
      const request = new Request(input, init)
      requests.push(request.clone())
      return respond(request)
    },
    { preconnect: globalThis.fetch.preconnect },
  )
  const http = { url: "http://127.0.0.1:4096", username: "opencode", password: "secret" }
  const client = createRelayClient({ sdk: createSdkForServer({ server: http, fetch: fetcher, directory }), directory })
  const runs = createRunClient({ server: http, directory, fetch: (url, init) => fetcher(url, init) })
  return { client, runs, requests }
}

const located = (data: unknown, status = 200) =>
  Response.json({ location: { directory }, data }, { status, headers: { "content-type": "application/json" } })
const refusal = (status: number, body: unknown) => Response.json(body, { status })

const view = (fields: Partial<RelayDocumentView> = {}): RelayDocumentView => ({
  id: "relay-wp-execute",
  name: "Relay · wp-execute",
  nodes: [],
  connections: {},
  tags: [],
  isArchived: false,
  active: false,
  activeVersionId: null,
  meta: { relay: { schema: 1, kind: "workflow", profile: "wp-execute" } },
  createdAt: "2026-10-06T12:00:00Z",
  updatedAt: "2026-10-06T12:30:00Z",
  versionId: "v4",
  versionCounter: 4,
  checksum: "c".repeat(64),
  activeVersion: null,
  runnable: true,
  ...fields,
})

describe("authoring routes through the generated client", () => {
  test("every call is scoped to the profile's location and carries the server's credentials", async () => {
    const api = server(() => located([view()]))
    const [document] = await api.client.documents()
    const request = api.requests[0]
    const url = new URL(request.url)
    expect([request.method, url.pathname]).toEqual(["GET", "/api/relay/document"])
    expect(url.searchParams.get("location[directory]")).toBe(directory)
    expect(request.headers.get("authorization")).toBe(`Basic ${btoa("opencode:secret")}`)
    expect([document.description, document.nodeGroups, document.publishedCounter]).toEqual(["", [], undefined])
    expect(document.updated).toBe(Date.parse("2026-10-06T12:30:00Z"))
  })

  test("a save sends the edited fields and the version guard, nothing else", async () => {
    const api = server((request) => located(view({ versionId: "v5", versionCounter: 5, name: "Renamed" })))
    const loaded = decodeDocument(view())
    const saved = await api.client.save(loaded, { name: "Renamed", nodes: [], connections: {} })
    const request = api.requests[0]
    expect([request.method, new URL(request.url).pathname]).toEqual(["PATCH", "/api/relay/document/relay-wp-execute"])
    expect(await request.json()).toEqual({
      name: "Renamed",
      nodes: [],
      connections: {},
      versionId: "v4",
      expectedChecksum: "c".repeat(64),
    })
    expect([saved.versionId, saved.versionCounter, saved.name]).toEqual(["v5", 5, "Renamed"])
  })

  test("publish names the loaded version; install leaves the version to the server", async () => {
    const published = view({ activeVersionId: "v4", activeVersion: { ...view(), workflowId: "relay-wp-execute" } })
    const api = server((request) =>
      new URL(request.url).pathname.endsWith("/publish")
        ? located(published)
        : located({ installID: "inst-1", document: "hook-1", version: "v2", enabled: true }),
    )
    expect((await api.client.publish(decodeDocument(view()))).publishedCounter).toBe(4)
    expect(await api.requests[0].json()).toEqual({ versionId: "v4", expectedChecksum: "c".repeat(64) })
    const install = await api.client.install("hook-1")
    expect(install.version).toBe("v2")
    expect([api.requests[1].method, new URL(api.requests[1].url).pathname]).toEqual(["POST", "/api/relay/hook"])
    expect(await api.requests[1].json()).toEqual({ document: "hook-1" })
  })

  test("refusals keep their tag, code and message; only a route the server lacks reads as unsupported", async () => {
    const missing = server(() => new Response("Not Found", { status: 404, headers: { "content-type": "text/plain" } }))
    expect(relayUnsupported(await missing.client.documents().catch((error: unknown) => error))).toBe(true)
    // The web app's page, both the bare type the SDK rejects and one with a charset that reaches the body.
    for (const type of ["text/html", "text/html; charset=utf-8"]) {
      const page = server(() => new Response("<!doctype html>", { headers: { "content-type": type } }))
      const error = await page.client.documents().catch((cause: unknown) => cause)
      expect(error instanceof RelayError && error.status).toBe(0)
      expect(relayUnsupported(error)).toBe(true)
    }
    const unknown = server(() =>
      refusal(404, { _tag: "RelayNotFoundError", code: "document-missing", message: "No document gone." }),
    )
    const error = await unknown.client.document("gone").catch((cause: unknown) => cause)
    expect(error).toBeInstanceOf(RelayError)
    expect(relayUnsupported(error)).toBe(false)
    expect(error instanceof RelayError && [error.status, error.tag, error.code, error.message]).toEqual([
      404,
      "RelayNotFoundError",
      "document-missing",
      "No document gone.",
    ])
    const stale = server(() =>
      refusal(409, { _tag: "RelayConflictError", code: "version-conflict", message: "The workflow changed." }),
    )
    const conflict = await stale.client.save(decodeDocument(view()), {}).catch((cause: unknown) => cause)
    expect(conflict instanceof RelayError && [conflict.status, conflict.code]).toEqual([409, "version-conflict"])
  })

  test("decisions are ledger lines, timed in epoch seconds", async () => {
    const line = {
      ts: 1_791_300_000,
      event: "hook-decision",
      decision: "d1",
      install: "inst-1",
      version: "v2",
      node: "block",
      action: "block",
      trigger: "edit.before",
      tool: "edit",
      session: "ses_1",
      call: "call_1",
      subject: "src/generated/client.ts",
      outcome: "blocked",
      seq: 7,
    }
    const api = server(() => located([line]))
    const [decision] = await api.client.decisions("inst-1")
    expect(new URL(api.requests[0].url).pathname).toBe("/api/relay/hook/inst-1/decisions")
    expect([decision.decision, decision.node, decision.session, decision.seq]).toEqual(["d1", "block", "ses_1", 7])
    expect(decisionTime(decision)).toBe(1_791_300_000_000)
  })
})

describe("documents", () => {
  test("the kind comes from the metadata, then from the node types", () => {
    const hook = decodeDocument(
      view({
        meta: {},
        nodes: [{ id: "t", name: "T", type: "relay.hookEventTrigger", position: [0, 0], parameters: {} }],
      }),
    )
    expect(documentKind(hook)).toBe("hook")
    expect(documentKind({ ...hook, meta: { relay: { kind: "workflow" } } })).toBe("workflow")
  })
})

describe("runs (no routes yet)", () => {
  test("a server without the run routes reads as unsupported", async () => {
    const api = server(() => new Response("Not Found", { status: 404 }))
    expect(relayUnsupported(await api.runs.runs().catch((error: unknown) => error))).toBe(true)
    expect(new URL(api.requests[0].url).pathname).toBe("/api/relay/run")
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
    expect(run.steps[0]).toMatchObject({ status: "escalated", attempts: 4, checks: [{ id: "x", verdict: "fail" }] })
    expect([run.label, run.baseRef, run.startedAt]).toEqual([undefined, undefined, undefined])
    expect(decodeRun({ runID: "1", documentID: "d", status: "unknown" })).toEqual([])
  })
})
