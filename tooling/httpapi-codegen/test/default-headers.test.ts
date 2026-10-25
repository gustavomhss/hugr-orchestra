import { describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { Effect, Schema, Stream } from "effect"
import { FetchHttpClient, HttpClient, HttpClientError, HttpClientRequest } from "effect/unstable/http"
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
            headers: {
              Authorization: "Bearer host",
              "x-orchestra-location": "factory-location",
              "cOnTeNt-TyPe": "application/factory-default",
            },
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
          const explicit = yield* make({
            baseUrl: server.url,
            headers: { "Content-Type": "application/factory-default" },
          }).pipe(
            Effect.provideService(
              HttpClient.HttpClient,
              HttpClient.mapRequest(transport, (request) =>
                HttpClientRequest.setHeader(
                  HttpClientRequest.bodyFormData(request, new FormData()),
                  "content-type",
                  "application/request-explicit",
                ),
              ),
            ),
          )
          yield* explicit.probe.upload({ message: "explicit request MIME wins" })
        }).pipe(Effect.provide(FetchHttpClient.layer)),
      )

      expect(requests).toHaveLength(4)
      expect(requests[0].headers.get("content-type")).toBe("application/json")
      expect(requests[0].body).toBe('{"message":"json body"}')
      expect(requests[1].headers.get("content-type")).toMatch(/^multipart\/form-data; boundary=.+/)
      expect(requests[1].body).toContain('name="message"')
      expect(requests[1].body).toContain("multipart body")
      expect(requests[1].formMessage).toBe("multipart body")
      expect(requests.slice(0, 2).map((request) => request.headers.get("x-orchestra-location"))).toEqual([
        "request-location",
        "request-location",
      ])
      expect(requests.slice(0, 2).map((request) => request.headers.get("authorization"))).toEqual([
        "Bearer host",
        "Bearer host",
      ])
      expect(requests[2].headers.get("content-type")).toBe("application/json")
      expect(requests[3].headers.get("content-type")).toBe("application/request-explicit")
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

  test("rejects invalid header data without coercion, getter execution, or token-bearing errors", async () => {
    await withClient(kind, async (make) => {
      const sentinel = "AUTH_SENTINEL_d9c783"
      const accessed = { calls: 0 }
      const accessor = Object.defineProperty({}, "Authorization", {
        enumerable: true,
        get() {
          accessed.calls += 1
          throw new Error(sentinel)
        },
      })
      const invalid: ReadonlyArray<unknown> = [
        { [`bad header ${sentinel}`]: "value" },
        { Authorization: `Bearer ${sentinel}\r\nx-injected: true` },
        { Authorization: `Bearer ${sentinel}\nx-injected: true` },
        { Authorization: `\r\nBearer ${sentinel}\r\n` },
        { Authorization: 42 },
        { Authorization: undefined },
        { Authorization: `Bearer ${sentinel}\u0000` },
        { Authorization: `Bearer ${sentinel}\u0100` },
        accessor,
        null,
        ["Authorization", sentinel],
        Object.create({ Authorization: sentinel }),
      ]
      await Promise.all(
        invalid.map(async (headers) => {
          const error = await Effect.runPromise(
            Effect.try({ try: () => Reflect.apply(make, undefined, [{ headers }]), catch: (error) => error }).pipe(
              Effect.match({ onFailure: (error) => error, onSuccess: () => undefined }),
            ),
          )
          expect(error).toBeInstanceOf(TypeError)
          if (!(error instanceof TypeError)) throw new Error("Expected header validation TypeError")
          expect(error.message).toBe("Invalid client headers")
          expect(error.message).not.toContain(sentinel)
          expect(error.cause).toBeUndefined()
          expect(JSON.stringify(error)).not.toContain(sentinel)
        }),
      )
      expect(accessed.calls).toBe(0)
      expect(() => make({ headers: { "!#$%&'*+-.^_`|~AZaz09": "ok" } })).not.toThrow()
    })
  })

  test("auth failure JSON redacts request headers while retaining typed HTTP failure", async () => {
    await withClient(kind, async (make, server, requests) => {
      const token = "Bearer AUTH_FAILURE_SENTINEL_a2fc83"
      await Effect.runPromise(
        Effect.gen(function* () {
          const client = yield* make({ baseUrl: `${server.url}auth-failure`, headers: { Authorization: token } })
          const error = yield* client.probe.read().pipe(Effect.flip)
          expect(error._tag).toBe("ClientError")
          if (!HttpClientError.isHttpClientError(error.cause)) throw new Error("Expected typed HTTP failure")
          expect(error.cause.reason._tag).toBe("DecodeError")
          expect(error.cause.response?.status).toBe(401)
          // In-memory diagnostics retain the request; this assertion concerns JSON serialization only.
          expect(error.cause.request.headers.authorization).toBe(token)
          const serialized = JSON.stringify(error)
          expect(serialized).toContain("ClientError")
          expect(serialized).toContain("DecodeError")
          expect(serialized).toContain("authorization")
          expect(serialized).not.toContain(token)
        }).pipe(Effect.provide(FetchHttpClient.layer)),
      )
      expect(requests).toHaveLength(1)
      expect(requests[0].headers.get("authorization")).toBe(token)
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
    requests: Array<{ headers: Headers; body: string; formMessage?: FormDataEntryValue | null }>,
    cancellations: Array<Promise<void>>,
  ) => Promise<void>,
) {
  const directory = await mkdtemp(join(fileURLToPath(new URL(".", import.meta.url)), ".default-headers-"))
  const requests: Array<{ headers: Headers; body: string; formMessage?: FormDataEntryValue | null }> = []
  const cancellations: Array<Promise<void>> = []
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const formMessage = request.headers.get("content-type")?.startsWith("multipart/form-data;")
        ? (await request.clone().formData()).get("message")
        : undefined
      requests.push({ headers: new Headers(request.headers), body: await request.text(), formMessage })
      if (new URL(request.url).pathname.startsWith("/auth-failure/")) {
        return Response.json({ _tag: "Unauthorized" }, { status: 401 })
      }
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
