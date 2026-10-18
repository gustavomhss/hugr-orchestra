import { expect, test } from "bun:test"
import { Actions } from "../../schema/src/actions"
import { makeActionsTransfer } from "../src/actions-transfer"
import { actionsFixture, binding, digest, failure, location, operationID, within } from "./actions-transfer-fixture"

test("upload streams raw chunks and durable metadata before EOF", async () => {
  const first = Promise.withResolvers<void>()
  const tail = Promise.withResolvers<void>()
  const received = Promise.withResolvers<Awaited<ReturnType<typeof digest>>>()
  const chunk = Uint8Array.from({ length: 65_536 }, (_, index) => index % 256)
  chunk.set([0x50, 0x4b, 3, 4, 255, 254, 0, 10, 10, 13, 10])
  const expected = new Bun.CryptoHasher("sha256")
  Array.from({ length: 16 }).forEach(() => expected.update(chunk))
  let sent = 0
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (sent === 1) await tail.promise
      if (sent === 16) return controller.close()
      sent++
      controller.enqueue(chunk)
    },
    cancel() {
      tail.resolve()
    },
  })
  await using fixture = actionsFixture(async (request) => {
    const reader = request.body!.getReader()
    const head = await reader.read()
    first.resolve()
    const rest = new ReadableStream<Uint8Array>({
      start(controller) {
        if (head.value) controller.enqueue(head.value)
      },
      async pull(controller) {
        const next = await reader.read()
        if (next.done) {
          reader.releaseLock()
          return controller.close()
        }
        controller.enqueue(next.value)
      },
    })
    received.resolve(await digest(rest))
    return new Response(Uint8Array.of(0, 255, 10, 10), {
      status: 201,
      headers: { "content-type": "application/octet-stream", "x-operation-id": operationID },
    })
  })
  try {
    const uploading = fixture.client.upload(
      { binding, operationID, filename: "release é.zip", body, location },
      {
        headers: { authorization: "Bearer override-auth", "content-type": "multipart/form-data; boundary=wrong" },
      },
    )
    await within(first.promise)
    expect(sent).toBeLessThan(16)
    tail.resolve()
    const response = await within(uploading)
    expect(response.status).toBe(201)
    expect(response.bodyUsed).toBe(false)
    expect(response.headers.get("x-operation-id")).toBe(operationID)
    expect(await digest(response.body)).toMatchObject({
      bytes: 4,
      hash: new Bun.CryptoHasher("sha256").update(Uint8Array.of(0, 255, 10, 10)).digest("hex"),
    })
    expect(await received.promise).toMatchObject({ bytes: 1_048_576, hash: expected.digest("hex") })
    expect(fixture.calls[0].body).toBe(body)
    expect(fixture.calls[0]).toHaveProperty("duplex", "half")
    expect(fixture.requests[0].method).toBe("POST")
    expect(fixture.requests[0].url.pathname).toBe("/api/actions/transfer/ab_fixture/upload")
    expect([...fixture.requests[0].url.searchParams]).toEqual([
      ["revision", "7"],
      ["operationID", "aop_fixture"],
      ["filename", "release é.zip"],
      ["location[directory]", location.directory],
      ["location[workspace]", location.workspace],
    ])
    expect(fixture.requests[0].headers.get("content-type")).toBe("application/octet-stream")
    expect(fixture.requests[0].headers.get("authorization")).toBe("Bearer override-auth")
    expect(fixture.requests[0].headers.get("x-configured")).toBe("kept")
  } finally {
    tail.resolve()
  }
})

test("Blob upload preserves bytes without multipart framing", async () => {
  const received = Promise.withResolvers<Awaited<ReturnType<typeof digest>>>()
  await using fixture = actionsFixture(async (request) => {
    received.resolve(await digest(request.body))
    return new Response(null, { status: 204 })
  })
  const bytes = Uint8Array.of(0, 255, 128, 10, 10, 13, 10, 0x50, 0x4b)
  const body = new Blob([bytes], { type: "application/zip" })
  const response = await fixture.client.upload({ binding, operationID, filename: ".env", body })
  expect(response.status).toBe(204)
  expect(response).toBe(fixture.responses[0])
  expect((await digest(response.body)).bytes).toBe(0)
  expect(fixture.calls[0].body).toBe(body)
  expect(fixture.calls[0]).not.toHaveProperty("duplex")
  expect(fixture.requests[0].headers.get("content-type")).toBe("application/octet-stream")
  expect(await received.promise).toMatchObject({
    bytes: bytes.byteLength,
    hash: new Bun.CryptoHasher("sha256").update(bytes).digest("hex"),
  })
})

test("AbortSignal cancels uploading request without replay", async () => {
  const first = Promise.withResolvers<void>()
  const tail = Promise.withResolvers<void>()
  let sent = false
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (sent) await tail.promise
      sent = true
      controller.enqueue(new Uint8Array(65_536))
    },
    cancel() {
      tail.resolve()
    },
  })
  await using fixture = actionsFixture(async (request) => {
    const reader = request.body!.getReader()
    await reader.read()
    first.resolve()
    await reader.cancel()
    await tail.promise
    return new Response(null, { status: 204 })
  })
  const controller = new AbortController()
  try {
    const uploading = fixture.client.upload(
      { binding, operationID, filename: "cancel.zip", body },
      { signal: controller.signal },
    )
    await within(first.promise)
    controller.abort()
    const error = await failure(uploading)
    expect(error.reason).toBe("Transport")
    expect(fixture.calls[0].signal?.aborted).toBe(true)
    expect(fixture.requests).toHaveLength(1)
  } finally {
    tail.resolve()
  }
})

test.each([
  "",
  ".",
  "..",
  "../file",
  "a/b",
  "a\\b",
  "C:file",
  "x\r\ny",
  "x\0y",
  "x\u001fy",
  "x\u007fy",
  "x\u0085y",
  "\ud800",
])("upload rejects unsafe filename %j before HTTP", async (filename) => {
  await using fixture = actionsFixture(() => new Response(null, { status: 204 }))
  const error = await failure(fixture.client.upload({ binding, operationID, filename, body: new Blob() }))
  expect(error.kind).toBe("invalid_input")
  expect(fixture.requests).toHaveLength(0)
  expect(fixture.calls).toHaveLength(0)
})

test("upload rejects locked stream without collecting it", async () => {
  await using fixture = actionsFixture(() => new Response(null, { status: 204 }))
  const body = new ReadableStream<Uint8Array>()
  const reader = body.getReader()
  const error = await failure(fixture.client.upload({ binding, operationID, filename: "locked.zip", body }))
  expect(error.kind).toBe("invalid_input")
  expect(fixture.calls).toHaveLength(0)
  reader.releaseLock()
})

test("upload captures mutable input and request configuration before awaited capability probe", async () => {
  const original = Uint8Array.of(0x50, 0x4b, 0, 255, 10, 10, 128)
  const edited = Uint8Array.of(1, 2, 3, 4, 5)
  const received = Promise.withResolvers<Awaited<ReturnType<typeof digest>>>()
  await using fixture = actionsFixture(async (request) => {
    received.resolve(await digest(request.body))
    return new Response(null, { status: 204 })
  })
  await using sink = actionsFixture(() => new Response("sink"))
  await (await fetch(sink.server.url)).body?.cancel()
  expect(sink.requests).toHaveLength(1)
  const calls: RequestInit[] = []
  let editedFetchCalls = 0
  const configuration = {
    baseUrl: fixture.server.url.href,
    headers: new Headers({ authorization: "Bearer captured-auth", "x-configured": "captured" }),
    fetch: Object.assign(
      (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        calls.push(init ?? {})
        return fetch(input, init)
      },
      { preconnect: fetch.preconnect },
    ),
  }
  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(original)
      controller.close()
    },
  })
  const input = {
    binding: { ...binding },
    location: { ...location },
    operationID,
    filename: "captured.zip",
    body: source,
  }
  const signal = new AbortController().signal
  const requestOptions = { headers: new Headers({ "x-request": "captured" }), signal }
  const client = makeActionsTransfer(configuration)
  const uploading = client.upload(input, requestOptions)
  // The async constructor probe has yielded, but no configured fetch has started.
  expect(calls).toHaveLength(0)
  input.body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(edited)
      controller.close()
    },
  })
  input.filename = "edited.zip"
  input.operationID = Actions.OperationID.make("aop_edited")
  input.binding.id = Actions.BindingID.make("ab_edited")
  input.binding.revision = 99
  input.location.directory = "/edited"
  input.location.workspace = "edited-workspace"
  configuration.baseUrl = sink.server.url.href
  configuration.headers.set("authorization", "Bearer edited-auth")
  configuration.headers = new Headers({ "x-configured": "edited" })
  configuration.fetch = Object.assign(
    (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      editedFetchCalls++
      return fetch(input, init)
    },
    { preconnect: fetch.preconnect },
  )
  requestOptions.headers.set("x-request", "edited")
  requestOptions.headers = new Headers({ "x-request": "replaced" })
  requestOptions.signal = AbortSignal.abort()

  const response = await within(uploading)
  await response.body?.cancel()
  expect(await within(received.promise)).toMatchObject({
    bytes: original.byteLength,
    hash: new Bun.CryptoHasher("sha256").update(original).digest("hex"),
  })
  expect(calls).toHaveLength(1)
  expect(calls[0].body).toBe(source)
  expect(calls[0]).toHaveProperty("duplex", "half")
  expect(calls[0].signal?.aborted).toBe(false)
  expect(editedFetchCalls).toBe(0)
  expect(sink.requests).toHaveLength(1)
  expect(fixture.requests[0].url.pathname).toBe("/api/actions/transfer/ab_fixture/upload")
  expect([...fixture.requests[0].url.searchParams]).toEqual([
    ["revision", "7"],
    ["operationID", "aop_fixture"],
    ["filename", "captured.zip"],
    ["location[directory]", location.directory],
    ["location[workspace]", location.workspace],
  ])
  expect(fixture.requests[0].headers.get("authorization")).toBe("Bearer captured-auth")
  expect(fixture.requests[0].headers.get("x-configured")).toBe("captured")
  expect(fixture.requests[0].headers.get("x-request")).toBe("captured")
  expect(fixture.requests[0].headers.get("content-type")).toBe("application/octet-stream")
})
