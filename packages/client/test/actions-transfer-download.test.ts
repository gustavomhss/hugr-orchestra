import { expect, test } from "bun:test"
import { Actions } from "../../schema/src/actions"
import {
  actionsFixture,
  actionsSocketFixture,
  binding,
  digest,
  failure,
  location,
  target,
  within,
} from "./actions-transfer-fixture"

test("download preserves query identity and large raw bytes", async () => {
  const tail = Promise.withResolvers<void>()
  const chunk = Uint8Array.from({ length: 65_536 }, (_, index) => index % 256)
  chunk.set([0x50, 0x4b, 3, 4, 0xff, 0xfe, 0, 10, 10, 13, 10, 0x80])
  const expected = new Bun.CryptoHasher("sha256")
  Array.from({ length: 64 }).forEach(() => expected.update(chunk))
  let sent = 0
  await using fixture = actionsFixture(
    () =>
      new Response(
        new ReadableStream<Uint8Array>({
          async pull(controller) {
            if (sent === 1) await tail.promise
            if (sent === 64) return controller.close()
            sent++
            controller.enqueue(chunk)
          },
          cancel() {
            tail.resolve()
          },
        }),
        {
          headers: {
            "content-type": "application/zip",
            "content-length": String(64 * chunk.byteLength),
            "content-disposition": "attachment; filename*=UTF-8''archive%20%C3%A9.zip",
            "content-digest": "sha-256=:fixture-digest:",
            "accept-ranges": "bytes",
          },
        },
      ),
  )
  try {
    const signal = new AbortController().signal
    const response = await within(
      fixture.client.download(
        { binding, target, location },
        {
          signal,
          headers: { "x-override": "new", "x-request": "added", range: "bytes=0-" },
        },
      ),
    )
    expect(response).toBeInstanceOf(Response)
    expect(response.bodyUsed).toBe(false)
    expect(response.body?.locked).toBe(false)
    expect(response.headers.get("content-type")).toBe("application/zip")
    expect(response.headers.get("content-disposition")).toBe("attachment; filename*=UTF-8''archive%20%C3%A9.zip")
    expect(response.headers.get("content-digest")).toBe("sha-256=:fixture-digest:")
    expect(response.headers.get("accept-ranges")).toBe("bytes")
    expect(fixture.calls[0].signal?.aborted).toBe(false)
    expect(fixture.requests[0].method).toBe("GET")
    expect(fixture.requests[0].url.pathname).toBe("/api/actions/transfer/ab_fixture")
    expect([...fixture.requests[0].url.searchParams]).toEqual([
      ["revision", "7"],
      ["kind", "artifact"],
      ["id", "42/#?&=é"],
      ["runID", "run/9"],
      ["attempt", "3"],
      ["path", "reports/archive #1.zip"],
      ["location[directory]", location.directory],
      ["location[workspace]", location.workspace],
    ])
    expect(fixture.requests[0].headers.get("authorization")).toBe("Bearer fixture-auth")
    expect(fixture.requests[0].headers.get("x-configured")).toBe("kept")
    expect(fixture.requests[0].headers.get("x-override")).toBe("new")
    expect(fixture.requests[0].headers.get("x-request")).toBe("added")
    expect(fixture.requests[0].headers.get("range")).toBe("bytes=0-")
    tail.resolve()
    const actual = await digest(response.body)
    expect(actual.bytes).toBe(4_194_304)
    expect(actual.hash).toBe(expected.digest("hex"))
    expect(actual.chunks).toBeGreaterThan(1)
    expect(response).toBe(fixture.responses[0])
  } finally {
    tail.resolve()
  }
})

test("all frozen target kinds work and optional query fields stay absent", async () => {
  await using fixture = actionsFixture(
    () =>
      new Response(Uint8Array.of(0, 255), {
        status: 206,
        headers: { "content-range": "bytes 1-2/9" },
      }),
  )
  for (const kind of ["jobLog", "runLog", "artifact", "secureFile"] as const) {
    const response = await fixture.client.download({
      binding: { ...binding, id: Actions.BindingID.make("ab_part/#?&") },
      target: { kind, id: "native-id" },
    })
    expect(response.status).toBe(206)
    expect(response.headers.get("content-range")).toBe("bytes 1-2/9")
    expect(response.headers.get("content-length")).toBe("2")
    expect(await digest(response.body)).toMatchObject({
      bytes: 2,
      hash: new Bun.CryptoHasher("sha256").update(Uint8Array.of(0, 255)).digest("hex"),
    })
    expect(fixture.requests.at(-1)?.url.pathname).toBe("/api/actions/transfer/ab_part%2F%23%3F%26")
    expect([...fixture.requests.at(-1)!.url.searchParams]).toEqual([
      ["revision", "7"],
      ["kind", kind],
      ["id", "native-id"],
    ])
  }
})

test("consumer cancellation plus AbortSignal closes download at HTTP peer", async () => {
  const canceled = Promise.withResolvers<void>()
  await using fixture = actionsFixture(
    () =>
      new Response(
        new ReadableStream<Uint8Array>({
          async pull(controller) {
            await Bun.sleep(20)
            controller.enqueue(new Uint8Array(65_536))
          },
          cancel() {
            canceled.resolve()
          },
        }),
      ),
  )
  const controller = new AbortController()
  const response = await fixture.client.download({ binding, target }, { signal: controller.signal })
  const reader = response.body!.getReader()
  expect((await reader.read()).done).toBe(false)
  await reader.cancel()
  controller.abort()
  await within(canceled.promise)
  reader.releaseLock()
})

test("AbortSignal interrupts active and pre-aborted downloads", async () => {
  const canceled = Promise.withResolvers<void>()
  await using fixture = actionsFixture(
    () =>
      new Response(
        new ReadableStream<Uint8Array>({
          async pull(controller) {
            await Bun.sleep(20)
            controller.enqueue(new Uint8Array(65_536))
          },
          cancel() {
            canceled.resolve()
          },
        }),
      ),
  )
  const controller = new AbortController()
  const response = await fixture.client.download({ binding, target }, { signal: controller.signal })
  const reader = response.body!.getReader()
  await reader.read()
  controller.abort()
  await expect(reader.read()).rejects.toThrow()
  await within(canceled.promise)
  reader.releaseLock()
  const error = await failure(fixture.client.download({ binding, target }, { signal: controller.signal }))
  expect(error.reason).toBe("Transport")
  expect(error.cause).toBeDefined()
  expect(fixture.requests).toHaveLength(1)
})

test("partial download failure stays visible on intact response stream", async () => {
  const fail = Promise.withResolvers<void>()
  await using fixture = actionsSocketFixture((socket) => {
    socket.write("HTTP/1.1 200 OK\r\nContent-Type: application/zip\r\nContent-Length: 20\r\nConnection: close\r\n\r\n")
    socket.write(Uint8Array.of(0x50, 0x4b, 0, 255, 10, 10))
    void fail.promise.then(() => socket.end())
  })
  try {
    const response = await within(fixture.client.download({ binding, target }))
    const reader = response.body!.getReader()
    expect((await reader.read()).value).toEqual(Uint8Array.of(0x50, 0x4b, 0, 255, 10, 10))
    fail.resolve()
    await expect(reader.read()).rejects.toThrow()
    reader.releaseLock()
  } finally {
    fail.resolve()
  }
})
