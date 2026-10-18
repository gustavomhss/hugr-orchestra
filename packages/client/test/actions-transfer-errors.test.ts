import { expect, test } from "bun:test"
import { ClientError } from "../src/generated/client-error"
import { makeActionsTransfer } from "../src/actions-transfer"
import { actionsFixture, binding, failure, location, operationID, target, within } from "./actions-transfer-fixture"

test("bounded Actions error keeps kind, outcome, retry-after and resource identity", async () => {
  const data = {
    _tag: "ActionsError",
    kind: "outcome_unknown",
    message: "Reconcile before resubmitting",
    bindingID: binding.id,
    operationID,
    provider: "gitlab",
    resourceID: "file/42",
    retryAfter: 17,
    outcome: { state: "outcome_unknown", nativeID: "42" },
    disposition: "unknown",
  } as const
  await using fixture = actionsFixture(() => Response.json(data, { status: 409, headers: { "retry-after": "29" } }))
  const error = await failure(fixture.client.upload({ binding, operationID, filename: "file.zip", body: new Blob() }))
  expect(error).toBeInstanceOf(ClientError)
  expect(error.reason).toBe("UnexpectedStatus")
  expect(error.status).toBe(409)
  expect(error.kind).toBe("outcome_unknown")
  expect(error.data).toEqual(data)
  expect(error.outcome).toEqual(data.outcome)
  expect(error.retryAfter).toBe(17)
  expect(error.message).toBe(data.message)
  expect(error.truncated).toBe(false)
  expect(fixture.requests).toHaveLength(1)
})

test("provider auth and server auth failures stay distinct", async () => {
  await using fixture = actionsFixture((request) =>
    Response.json(
      request.headers.has("x-server-auth")
        ? { _tag: "UnauthorizedError", message: "Server auth required" }
        : { kind: "not_authenticated", message: "Provider sign-in missing", provider: "gitlab" },
      { status: 401 },
    ),
  )
  const provider = await failure(fixture.client.download({ binding, target }))
  const server = await failure(
    fixture.client.download({ binding, target }, { headers: { "x-server-auth": "missing" } }),
  )
  expect(provider.kind).toBe("not_authenticated")
  expect(provider.status).toBe(401)
  expect(server.kind).toBeUndefined()
  expect(server.status).toBe(401)
  expect(server.reason).toBe("MalformedResponse")
})

test("rate-limit retry-after header survives missing domain retryAfter", async () => {
  await using fixture = actionsFixture(
    () =>
      new Response(JSON.stringify({ kind: "rate_limited", message: "Slow down" }), {
        status: 429,
        headers: { "content-type": "application/problem+json; charset=utf-8", "retry-after": "23" },
      }),
  )
  const error = await failure(fixture.client.download({ binding, target }))
  expect(error.kind).toBe("rate_limited")
  expect(error.retryAfter).toBe(23)
  expect(error.status).toBe(429)
})

test.each([
  "{bad-json",
  "null",
  "[]",
  "{}",
  JSON.stringify({ kind: "invented_kind", message: "no" }),
  JSON.stringify({ kind: "transfer_failed", message: 3 }),
  JSON.stringify({ kind: "transfer_failed", message: "no", retryAfter: "1" }),
  JSON.stringify({ kind: "transfer_failed", message: "no", bindingID: "wrong" }),
])("invalid error body is typed and bounded: %j", async (body) => {
  await using fixture = actionsFixture(
    () => new Response(body, { status: 502, headers: { "content-type": "application/json" } }),
  )
  const error = await failure(fixture.client.download({ binding, target }))
  expect(error.reason).toBe("MalformedResponse")
  expect(error.status).toBe(502)
  expect(error.data).toBeUndefined()
  expect(error.truncated).toBe(false)
})

test("non-UTF8 and non-JSON failures never masquerade as successful bytes", async () => {
  await using fixture = actionsFixture(
    (request) =>
      new Response(Uint8Array.of(255, 254, 0, 10, 10), {
        status: 500,
        headers: { "content-type": request.headers.has("x-json") ? "application/json" : "application/octet-stream" },
      }),
  )
  expect((await failure(fixture.client.download({ binding, target }))).reason).toBe("UnexpectedStatus")
  expect((await failure(fixture.client.download({ binding, target }, { headers: { "x-json": "yes" } }))).reason).toBe(
    "MalformedResponse",
  )
})

test("oversized error capture cancels HTTP peer instead of parsing partial JSON", async () => {
  const canceled = Promise.withResolvers<void>()
  await using fixture = actionsFixture(
    () =>
      new Response(
        new ReadableStream<Uint8Array>({
          async pull(controller) {
            await Bun.sleep(20)
            controller.enqueue(new Uint8Array(8_192).fill(0x20))
          },
          cancel() {
            canceled.resolve()
          },
        }),
        { status: 502, headers: { "content-type": "application/json" } },
      ),
  )
  const error = await within(failure(fixture.client.download({ binding, target })))
  expect(error.reason).toBe("MalformedResponse")
  expect(error.truncated).toBe(true)
  expect(error.status).toBe(502)
  expect(error.data).toBeUndefined()
  await within(canceled.promise)
})

test("stalled error capture has finite deadline and closes HTTP peer", async () => {
  const canceled = Promise.withResolvers<void>()
  const done = Promise.withResolvers<void>()
  let started = false
  await using fixture = actionsFixture(
    () =>
      new Response(
        new ReadableStream<Uint8Array>({
          async pull(controller) {
            if (started) return done.promise
            started = true
            controller.enqueue(Uint8Array.of(0x7b))
          },
          cancel() {
            canceled.resolve()
            done.resolve()
          },
        }),
        { status: 502, headers: { "content-type": "application/json" } },
      ),
  )
  try {
    const error = await within(failure(fixture.client.download({ binding, target })), 8_000)
    expect(error.reason).toBe("Transport")
    expect(error.status).toBe(502)
    expect(error.cause).toEqual(new Error("Actions error response read timed out"))
    await within(canceled.promise)
  } finally {
    done.resolve()
  }
}, 15_000)

test("redirect cannot send configured auth to different origin", async () => {
  await using sink = actionsFixture(() => new Response("sink"))
  await (await fetch(sink.server.url)).body?.cancel()
  expect(sink.requests).toHaveLength(1)
  await using fixture = actionsFixture(
    () =>
      new Response(null, {
        status: 302,
        headers: { location: sink.server.url.href },
      }),
  )
  const error = await failure(fixture.client.download({ binding, target }))
  expect(error.reason).toBe("UnexpectedStatus")
  expect(error.status).toBe(302)
  expect(fixture.calls[0].redirect).toBe("manual")
  expect(sink.requests).toHaveLength(1)
  expect(fixture.requests[0].headers.get("authorization")).toBe("Bearer fixture-auth")
})

test.each([
  { target: { ...target, kind: "other" } },
  { target: { ...target, id: "" } },
  { target: { ...target, id: 42 } },
  { target: { ...target, attempt: 0 } },
  { target: { ...target, attempt: 1.5 } },
  { target: { ...target, attempt: "3" } },
  { target: { ...target, path: null } },
  { target: { ...target, runID: 42 } },
  { target: { ...target, url: "https://elsewhere.invalid" } },
  { target: null },
  { binding: { ...binding, revision: 0 } },
  { binding: { ...binding, revision: Number.NaN } },
  { binding: { ...binding, id: "https://elsewhere.invalid" } },
  { binding: null },
  { location: { ...location, workspace: 42 } },
  { location: { ...location, server: "https://elsewhere.invalid" } },
  { url: "https://elsewhere.invalid" },
])("rejects invalid identity/target before network: %j", async (change) => {
  await using fixture = actionsFixture(() => new Response(null, { status: 204 }))
  const error = await failure(
    Reflect.apply(fixture.client.download, undefined, [{ binding, target, location, ...change }]),
  )
  expect(error.kind).toBe("invalid_input")
  expect(fixture.calls).toHaveLength(0)
  expect(fixture.requests).toHaveLength(0)
})

test("failed configured HTTP transport produces ClientError without retry", async () => {
  await using fixture = actionsFixture(() => new Response("alive"))
  await (await fixture.client.download({ binding, target })).body?.cancel()
  await fixture.server.stop(true)
  const error = await failure(fixture.client.download({ binding, target }))
  expect(error.reason).toBe("Transport")
  expect(error.cause).toBeDefined()
  expect(fixture.calls).toHaveLength(2)
})

test.each([
  { name: "invalid baseUrl", baseUrl: "not a URL" },
  { name: "configured newline header", headers: { "x-invalid": "first\nsecond" } },
  { name: "request newline header", requestOptions: { headers: { "x-invalid": "first\r\nsecond" } } },
  { name: "invalid signal", requestOptions: { signal: { aborted: false } } },
])("preparation failure stays typed Transport: $name", async (change) => {
  await using fixture = actionsFixture(() => new Response(null, { status: 204 }))
  let fetched = 0
  const client = makeActionsTransfer({
    baseUrl: change.baseUrl ?? fixture.server.url.href,
    headers: change.headers,
    fetch: Object.assign(
      (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        fetched++
        return fetch(input, init)
      },
      { preconnect: fetch.preconnect },
    ),
  })
  const download = await failure(
    Reflect.apply(client.download, undefined, [{ binding, target }, change.requestOptions]),
  )
  const upload = await failure(
    Reflect.apply(client.upload, undefined, [
      {
        binding,
        operationID,
        filename: "valid.zip",
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.close()
          },
        }),
      },
      change.requestOptions,
    ]),
  )
  for (const error of [download, upload]) {
    expect(error.reason).toBe("Transport")
    expect(error.cause).toBeInstanceOf(TypeError)
    expect(error.kind).toBeUndefined()
    expect(error.code).toBeUndefined()
  }
  expect(fetched).toBe(0)
  expect(fixture.requests).toHaveLength(0)
})

test("download captures mutable input and configuration before async fetch", async () => {
  await using fixture = actionsFixture(() => new Response(Uint8Array.of(0, 255)))
  const headers = new Headers({ authorization: "Bearer captured-download", "x-configured": "captured" })
  let fetched = 0
  const configuration = {
    baseUrl: fixture.server.url.href,
    headers,
    fetch: Object.assign(
      (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        fetched++
        return fetch(input, init)
      },
      { preconnect: fetch.preconnect },
    ),
  }
  const requestOptions = { headers: new Headers({ "x-request": "captured" }), signal: new AbortController().signal }
  const input = { binding: { ...binding }, target: { ...target, id: "captured-id" }, location: { ...location } }
  const client = makeActionsTransfer(configuration)
  const downloading = client.download(input, requestOptions)
  expect(fetched).toBe(0)
  input.binding.revision = 99
  input.target.id = "edited-id"
  input.location.directory = "/edited"
  headers.set("authorization", "Bearer edited-download")
  configuration.baseUrl = "not a URL"
  configuration.headers = new Headers({ "x-configured": "edited" })
  configuration.fetch = Object.assign(() => Promise.reject(new Error("edited fetch must not run")), {
    preconnect: fetch.preconnect,
  })
  requestOptions.headers.set("x-request", "edited")
  requestOptions.headers = new Headers({ "x-request": "replaced" })
  requestOptions.signal = AbortSignal.abort()
  const response = await within(downloading)
  expect(response.bodyUsed).toBe(false)
  await response.body?.cancel()
  expect(fetched).toBe(1)
  expect(fixture.requests[0].url.searchParams.get("revision")).toBe("7")
  expect(fixture.requests[0].url.searchParams.get("id")).toBe("captured-id")
  expect(fixture.requests[0].url.searchParams.get("location[directory]")).toBe(location.directory)
  expect(fixture.requests[0].headers.get("authorization")).toBe("Bearer captured-download")
  expect(fixture.requests[0].headers.get("x-configured")).toBe("captured")
  expect(fixture.requests[0].headers.get("x-request")).toBe("captured")
})
