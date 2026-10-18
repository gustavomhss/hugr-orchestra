import { describe, expect, test } from "bun:test"
import { Actions } from "@orchestra/schema/actions"
import { actionsError, createActionsAPI, decodeAction } from "./api"

const directory = "/repo/with space"
const bindingID = Actions.BindingID.make("ab_native")
const scope = { bindingID, revision: 7 }

function transport(respond: (request: Request) => Response | Promise<Response>) {
  const requests: Request[] = []
  const fetch = Object.assign(async (input: string | URL | Request, init?: RequestInit) => {
    const request = new Request(input, init)
    requests.push(request.clone())
    return respond(request)
  }, { preconnect: globalThis.fetch.preconnect })
  return {
    requests,
    api: createActionsAPI({ server: { type: "http", http: { url: "http://localhost:4096", username: "owner", password: "secret" } }, fetch, directory }),
  }
}

const located = (data: unknown) => Response.json({ location: { directory }, data })

describe("Actions native transport", () => {
  test("typed optional fields become valid native JSON while the captured input stays detached", () => {
    const input = { provider: "github", ref: "main", inputs: undefined }
    const decoded = decodeAction(Actions.DispatchCommand, { id: Actions.OperationID.make("aop_native"), input })
    input.ref = "edited-ref"
    expect(decoded.input.ref).toBe("main")
    expect(JSON.stringify(decoded)).toBe(JSON.stringify({ id: "aop_native", input: { provider: "github", ref: "main" } }))
  })

  test("native JSON fields reject non-JSON values and excess fields before serialization", () => {
    const command = { id: Actions.OperationID.make("aop_native"), input: { provider: "gitlab", ref: "main" } }
    expect(() => decodeAction(Actions.DispatchCommand, { ...command, input: { ...command.input, inputs: { invalid: Infinity } } })).toThrow("invalid_input")
    expect(() => decodeAction(Actions.DispatchCommand, { ...command, input: { ...command.input, inputs: { invalid: undefined } } })).toThrow("invalid_input")
    expect(() => decodeAction(Actions.DispatchCommand, { ...command, input: { ...command.input, extra: true } })).toThrow("invalid_input")
  })

  test("pending intent preferences remain isolated across WSL connections sharing one HTTP proxy", () => {
    const ubuntu = createActionsAPI({ server: { type: "sidecar", variant: "wsl", distro: "Ubuntu", http: { url: "http://localhost:4096" } }, directory })
    const debian = createActionsAPI({ server: { type: "sidecar", variant: "wsl", distro: "Debian", http: { url: "http://localhost:4096" } }, directory })
    expect(ubuntu.preferenceKey).not.toBe(debian.preferenceKey)
    const embedded = createActionsAPI({ server: { type: "http", http: { url: "http://owner:secret@localhost:4096/?token=private" } }, directory })
    expect(embedded.preferenceKey).not.toContain("secret")
    expect(embedded.preferenceKey).not.toContain("private")
  })

  test("does not fetch on construction; generated and raw routes share auth and exact native scope", async () => {
    const fixture = transport((request) => {
      const url = new URL(request.url)
      if (url.pathname === "/api/actions/binding") return located([])
      if (url.pathname.startsWith("/api/actions/resource")) return located({ items: [], capturedAt: 1 })
      if (url.pathname.endsWith("/info")) return located({ filename: "job.log", contentType: "text/plain", size: 4 })
      return new Response(new Uint8Array([0, 255, 10, 10]))
    })
    expect(fixture.requests).toEqual([])
    const signal = new AbortController().signal
    await fixture.api.bindings(signal)
    await fixture.api.artifacts(scope, { kind: "artifacts", runID: "101", cursor: "opaque+/=", limit: 30 }, signal)
    await fixture.api.transferInfo(scope, { kind: "jobLog", id: "202", runID: "101", attempt: 2 }, signal)
    const response = await fixture.api.transfer(scope, { kind: "jobLog", id: "202", runID: "101", attempt: 2 }, signal)
    const reader = response.body?.getReader()
    expect([...((await reader?.read())?.value ?? [])]).toEqual([0, 255, 10, 10])
    await reader?.cancel()
    reader?.releaseLock()
    expect(fixture.requests.map((request) => new URL(request.url).pathname)).toEqual([
      "/api/actions/binding", `/api/actions/resource/${bindingID}`, `/api/actions/transfer/${bindingID}/info`, `/api/actions/transfer/${bindingID}`,
    ])
    fixture.requests.forEach((request) => {
      expect(new URL(request.url).searchParams.get("location[directory]")).toBe(directory)
      expect(request.headers.get("authorization")).toBe(`Basic ${btoa("owner:secret")}`)
    })
    const artifact = new URL(fixture.requests[1].url)
    expect([artifact.searchParams.get("revision"), artifact.searchParams.get("kind"), artifact.searchParams.get("cursor")]).toEqual(["7", "artifacts", "opaque+/="])
    const transfer = new URL(fixture.requests[3].url)
    expect([transfer.searchParams.get("id"), transfer.searchParams.get("runID"), transfer.searchParams.get("attempt")]).toEqual(["202", "101", "2"])
    expect(fixture.requests[3].redirect).toBe("error")
  })

  test("bare missing route is unsupported; native refusal preserves kind and excludes secret message", async () => {
    const missing = transport(() => new Response("Not Found", { status: 404 }))
    const absent = await missing.api.bindings(new AbortController().signal).catch((error: unknown) => error)
    expect(actionsError(absent).kind).toBe("unsupported")
    const denied = transport(() => Response.json({ _tag: "ActionsError", kind: "rate_limited", message: "token=very-secret", retryAfter: 31 }, { status: 400 }))
    const error = await denied.api.bindings(new AbortController().signal).catch((error: unknown) => error)
    expect(actionsError(error)).toEqual({ kind: "rate_limited", message: "orchestra.actions.unavailable", retryAfter: 31 })
    expect(JSON.stringify(actionsError(error))).not.toContain("very-secret")
    const notFound = transport(() => Response.json({ _tag: "ActionsError", kind: "not_found", message: "missing native run" }, { status: 400 }))
    expect(actionsError(await notFound.api.run(scope, "101", new AbortController().signal).catch((error: unknown) => error)).kind).toBe("not_found")
    const signIn = transport(() => Response.json({ _tag: "UnauthorizedError", message: "server password=secret" }, { status: 401 }))
    expect(actionsError(await signIn.api.bindings(new AbortController().signal).catch((error: unknown) => error)))
      .toEqual({ kind: "server_auth", message: "orchestra.actions.serverAuthFailed" })
    const providerSignIn = transport(() => Response.json({ _tag: "ActionsError", kind: "not_authenticated", message: "secret credential" }, { status: 400 }))
    expect(actionsError(await providerSignIn.api.bindings(new AbortController().signal).catch((error: unknown) => error)))
      .toEqual({ kind: "not_authenticated", message: "orchestra.actions.providerSignInRequired" })
  })

  test("raw metadata must satisfy native schema and location; unknown output cannot become success", async () => {
    const wrongLocation = transport(() => Response.json({ location: { directory: "/other" }, data: { filename: "x", contentType: "text/plain" } }))
    expect(actionsError(await wrongLocation.api.transferInfo(scope, { kind: "jobLog", id: "202" }, new AbortController().signal)
      .catch((error: unknown) => error)).kind).toBe("binding_stale")
    const wrongShape = transport(() => located({ output: [] }))
    expect(actionsError(await wrongShape.api.artifacts(scope, { kind: "artifacts", runID: "101" }, new AbortController().signal)
      .catch((error: unknown) => error)).kind).toBe("invalid_response")
  })
})
