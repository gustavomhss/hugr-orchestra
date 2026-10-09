import { describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { Effect, Schema, Stream } from "effect"
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/unstable/http"
import { HttpApi, HttpApiEndpoint, HttpApiGroup, HttpApiMiddleware, HttpApiSchema } from "effect/unstable/httpapi"
import { format } from "prettier"
import { compile, emitEffect, emitEffectImported } from "../src"

export const Api = HttpApi.make("default-headers").add(
  HttpApiGroup.make("probe")
    .add(HttpApiEndpoint.get("read", "/read", { success: Schema.String }))
    .add(
      HttpApiEndpoint.get("override", "/override", {
        headers: {
          aUtHoRiZaTiOn: Schema.optional(Schema.String),
          "X-Factory": Schema.optional(Schema.String),
          "x-orchestra-location": Schema.optional(Schema.String),
        },
        success: Schema.String,
      }),
    )
    .add(
      HttpApiEndpoint.post("json", "/json", {
        payload: Schema.Struct({ message: Schema.String }),
        success: Schema.String,
      }),
    )
    .add(
      HttpApiEndpoint.post("upload", "/upload", {
        payload: Schema.Struct({ message: Schema.String }),
        success: Schema.String,
      }),
    )
    .add(
      HttpApiEndpoint.get("events", "/events", {
        headers: { authorization: Schema.optional(Schema.String) },
        success: HttpApiSchema.StreamSse({ data: Schema.Struct({ type: Schema.String }) }),
      }),
    ),
)

const outputs = {
  portable: emitEffect(compile(Api)),
  imported: emitEffectImported(compile(Api), { module: "../default-headers.test", api: "Api" }),
}

describe.each(["portable", "imported"] as const)("%s Effect factory headers", (kind) => {
  test("captures defaults, honors request casing, and isolates concurrent clients", async () => {
    await withClient(kind, async (make, server, requests) => {
      const headers = { Authorization: "Bearer host", "X-Factory": "original" }
      const construction = make({ baseUrl: server.url, headers })
      headers.Authorization = "Bearer changed before execution"
      headers["X-Factory"] = "changed"

      await Effect.runPromise(
        Effect.gen(function* () {
          const first = yield* construction
          const replay = yield* construction
          const second = yield* make({ baseUrl: server.url, headers: { authorization: "Bearer second" } })
          const baseline = yield* make({ baseUrl: server.url })
          const empty = yield* make({ baseUrl: server.url, headers: {} })
          yield* first.probe.read()
          yield* first.probe.override()
          yield* first.probe.override({ aUtHoRiZaTiOn: "Bearer request", "X-Factory": "request" })
          headers.Authorization = "Bearer changed after execution"
          yield* Effect.all([replay.probe.read(), second.probe.read(), baseline.probe.read(), empty.probe.read()], {
            concurrency: "unbounded",
          })
          yield* first.probe.read()
        }).pipe(Effect.provide(FetchHttpClient.layer)),
      )

      expect(requests.slice(0, 3).map((request) => request.headers.get("authorization"))).toEqual([
        "Bearer host",
        "Bearer host",
        "Bearer request",
      ])
      expect(requests.slice(0, 3).map((request) => request.headers.get("x-factory"))).toEqual([
        "original",
        "original",
        "request",
      ])
      expect(
        requests
          .slice(3, 7)
          .map((request) => request.headers.get("authorization"))
          .sort(),
      ).toEqual(["Bearer host", "Bearer second", null, null].sort())
      expect(requests[7].headers.get("authorization")).toBe("Bearer host")
      expect(requests[7].headers.get("x-factory")).toBe("original")
      expect(requests).toHaveLength(8)
    })
  })

  test("keeps encoded content type, FormData boundary, and location headers", async () => {
    await withClient(kind, async (make, server, requests) => {
      await Effect.runPromise(
        Effect.gen(function* () {
          const transport = yield* HttpClient.HttpClient
          const client = yield* make({
            baseUrl: server.url,
            headers: { Authorization: "Bearer host", "x-orchestra-location": "factory-location" },
          }).pipe(
            Effect.provideService(
              HttpClient.HttpClient,
              HttpClient.mapRequest(transport, (request) => {
                const located = HttpClientRequest.setHeader(request, "x-orchestra-location", "request-location")
                if (!request.url.endsWith("/upload")) return located
                const form = new FormData()
                form.set("message", "multipart body")
                return HttpClientRequest.bodyFormData(located, form)
              }),
            ),
          )
          yield* client.probe.json({ message: "json body" })
          yield* client.probe.upload({ message: "replaced by FormData transport" })
          const contentType = yield* make({
            baseUrl: server.url,
            headers: { "Content-Type": "application/factory-default" },
          })
          yield* contentType.probe.json({ message: "encoded content type wins" })
        }).pipe(Effect.provide(FetchHttpClient.layer)),
      )

      expect(requests).toHaveLength(3)
      expect(requests[0].headers.get("content-type")).toBe("application/json")
      expect(requests[0].body).toBe('{"message":"json body"}')
      expect(requests[1].headers.get("content-type")).toMatch(/^multipart\/form-data; boundary=.+/)
      expect(requests[1].body).toContain('name="message"')
      expect(requests[1].body).toContain("multipart body")
      expect(requests.slice(0, 2).map((request) => request.headers.get("x-orchestra-location"))).toEqual([
        "request-location",
        "request-location",
      ])
      expect(requests.slice(0, 2).map((request) => request.headers.get("authorization"))).toEqual([
        "Bearer host",
        "Bearer host",
      ])
      expect(requests[2].headers.get("content-type")).toBe("application/json")
    })
  })

  test("sends defaults and per-request auth on SSE, preserving early cancellation", async () => {
    await withClient(kind, async (make, server, requests, cancellations) => {
      await Effect.runPromise(
        Effect.gen(function* () {
          const client = yield* make({ baseUrl: server.url, headers: { Authorization: "Bearer stream" } })
          expect(yield* client.probe.events().pipe(Stream.take(1), Stream.runCollect)).toEqual([{ type: "seen" }])
          expect(
            yield* client.probe
              .events({ authorization: "Bearer stream request" })
              .pipe(Stream.take(1), Stream.runCollect),
          ).toEqual([{ type: "seen" }])
        }).pipe(Effect.provide(FetchHttpClient.layer)),
      )
      expect(requests.map((request) => request.headers.get("authorization"))).toEqual([
        "Bearer stream",
        "Bearer stream request",
      ])
      await Promise.all(cancellations)
    })
  })

  test("rejects invalid names and CRLF values synchronously at construction", async () => {
    await withClient(kind, async (make) => {
      expect(() => make({ headers: { "bad header": "value" } })).toThrow()
      expect(() => make({ headers: { Authorization: "Bearer ok\r\nx-injected: true" } })).toThrow()
      expect(() => make({ headers: { Authorization: "Bearer ok\nx-injected: true" } })).toThrow()
    })
  })
})

test("import projections share factory options and retain middleware adapter rejection", () => {
  const contract = compile(Api)
  const variants = [
    outputs.portable,
    outputs.imported,
    emitEffectImported(contract, { module: "../default-headers.test", group: "ProbeGroup" }),
    emitEffectImported(contract, {
      module: "../default-headers.test",
      endpoints: Object.fromEntries(
        contract.groups[0].endpoints.map((item) => [`probe.${item.endpoint.name}`, item.endpoint.name]),
      ),
    }),
  ]
  const transpiler = new Bun.Transpiler({ loader: "ts" })
  variants.forEach((output) => {
    const client = output.files.find((file) => file.path === "client.ts")
    if (client === undefined) throw new Error("Missing generated client.ts")
    expect(client.content).toContain("readonly headers?: Readonly<Record<string, string>>")
    const imports = transpiler.scanImports(client.content).map((item) => item.path)
    expect(imports).toContain("effect/unstable/http")
    imports.forEach((path) => expect(path).not.toMatch(/^@orchestra\/(core|server)(\/|$)/))
  })
  class Required extends HttpApiMiddleware.Service<Required>()("RequiredHeadersAdapter", { requiredForClient: true }) {}
  expect(() => compile(Api.middleware(Required))).toThrow("Client middleware requires adapter: RequiredHeadersAdapter")
})

test("generated fixtures keep both factories and adapters covered by package typecheck", async () => {
  await Promise.all(
    Object.entries(outputs).flatMap(([kind, output]) =>
      output.files.map(async (file) => {
        expect(await Bun.file(new URL(`default-headers-${kind}/${file.path}`, import.meta.url)).text()).toBe(
          await format(file.content, { parser: "typescript", semi: false, printWidth: 120 }),
        )
      }),
    ),
  )
})

async function withClient(
  kind: keyof typeof outputs,
  run: (
    make: typeof import("./default-headers-portable/client").make,
    server: ReturnType<typeof Bun.serve>,
    requests: Array<{ headers: Headers; body: string }>,
    cancellations: Array<Promise<void>>,
  ) => Promise<void>,
) {
  const directory = await mkdtemp(join(fileURLToPath(new URL(".", import.meta.url)), ".default-headers-"))
  const requests: Array<{ headers: Headers; body: string }> = []
  const cancellations: Array<Promise<void>> = []
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      requests.push({ headers: new Headers(request.headers), body: await request.text() })
      if (new URL(request.url).pathname !== "/events") return Response.json("ok")
      const cancelled = Promise.withResolvers<void>()
      cancellations.push(cancelled.promise)
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('data: {"type":"seen"}\n\n'))
          },
          cancel() {
            cancelled.resolve()
          },
        }),
        { headers: { "content-type": "text/event-stream" } },
      )
    },
  })
  await Promise.all(outputs[kind].files.map((file) => Bun.write(join(directory, file.path), file.content)))
    .then(async () => {
      const generated: typeof import("./default-headers-portable/client") = await import(join(directory, "client.ts"))
      await run(generated.make, server, requests, cancellations)
    })
    .finally(async () => {
      server.stop(true)
      await rm(directory, { recursive: true, force: true })
    })
}
