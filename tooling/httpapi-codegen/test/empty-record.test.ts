import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { Effect, Option, Schema } from "effect"
import { FetchHttpClient, HttpClient } from "effect/unstable/http"
import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"
import { compile, emitEffect, emitEffectImported, emitPromise, GenerationError, type Output } from "../src"

const ClosedRecord = Schema.Record(Schema.String, Schema.Never).annotate({
  parseOptions: { onExcessProperty: "error" },
})

export const Api = HttpApi.make("empty-record").add(
  HttpApiGroup.make("probe")
    .add(HttpApiEndpoint.get("read", "/read", { query: ClosedRecord, success: Schema.String }))
    .add(
      HttpApiEndpoint.post("write", "/write", {
        query: ClosedRecord,
        payload: ClosedRecord,
        headers: Schema.Struct({ "idempotency-key": Schema.NonEmptyString }),
        success: Schema.String,
      }),
    ),
)

type Client<Result> = {
  readonly probe: {
    readonly read: () => Result
    readonly write: (input: { readonly "idempotency-key": string }) => Result
  }
}

test("ECR00 strict empty record semantics and flattened operation manifest", () => {
  const decode = Schema.decodeUnknownOption(ClosedRecord)
  expect(decode({})).toEqual(Option.some({}))
  for (const input of [null, undefined, "", "value", 0, false, [], [1], { extra: "value" }]) {
    expect(decode(input)).toEqual(Option.none())
  }

  const contract = compile(Api)
  const operations = contract.groups.flatMap((group) => group.endpoints.map((endpoint) => endpoint.operation))
  expect(operations.map(({ group, name, input, inputMode }) => ({ group, name, input, inputMode }))).toEqual([
    { group: "probe", name: "read", input: [], inputMode: "none" },
    {
      group: "probe",
      name: "write",
      input: [{ name: "idempotency-key", source: "headers" }],
      inputMode: "required",
    },
  ])
  expect(emitPromise(contract).operations).toEqual(operations)
  expect(emitEffect(contract).operations).toEqual(operations)
  expect(emitEffectImported(contract, { module: "../empty-record.test", api: "Api" }).operations).toEqual(operations)
})

test("ECR01 Promise client sends real requests and an empty JSON body", async () => {
  await withClient(emitPromise(compile(Api)), async (directory, baseUrl) => {
    const generated: {
      Orchestra: { make: (options: { baseUrl: string }) => Client<Promise<string>> }
    } = await import(join(directory, "index.ts"))
    const client = generated.Orchestra.make({ baseUrl: baseUrl.href })
    expect(await client.probe.read()).toBe("ok")
    expect(await client.probe.write({ "idempotency-key": "synthetic-key" })).toBe("ok")
  })
})

test.each([
  ["ECR02", "portable"],
  ["ECR03", "imported"],
] as const)("%s %s Effect client sends real requests and an empty JSON body", async (_id, kind) => {
  const contract = compile(Api)
  const output =
    kind === "portable"
      ? emitEffect(contract)
      : emitEffectImported(contract, { module: "../empty-record.test", api: "Api" })
  await withClient(output, async (directory, baseUrl) => {
    const generated: {
      make: (options: { baseUrl: URL }) => Effect.Effect<Client<Effect.Effect<string, unknown>>, never, HttpClient.HttpClient>
    } = await import(join(directory, "client.ts"))
    await Effect.runPromise(
      Effect.gen(function* () {
        const client = yield* generated.make({ baseUrl })
        expect(yield* client.probe.read()).toBe("ok")
        expect(yield* client.probe.write({ "idempotency-key": "synthetic-key" })).toBe("ok")
      }).pipe(Effect.provide(FetchHttpClient.layer)),
    )
  })
})

test.each(["query", "payload"] as const)("ECR04 %s rejects unsupported records without widening the guard", (source) => {
  const rejected = [
    Schema.String,
    Schema.Record(Schema.String, Schema.String),
    Schema.Record(Schema.Symbol, Schema.Never),
    Schema.StructWithRest(Schema.Struct({ value: Schema.Never }), [ClosedRecord]),
    Schema.StructWithRest(Schema.Struct({}), [ClosedRecord, Schema.Record(Schema.Symbol, Schema.Never)]),
  ]
  for (const schema of rejected) {
    const api = HttpApi.make("unsupported-record").add(
      HttpApiGroup.make("probe").add(
        HttpApiEndpoint.post("reject", "/reject", { [source]: schema, success: Schema.String }),
      ),
    )
    expect(() => compile(api)).toThrow(GenerationError)
    expect(() => compile(api)).toThrow(`Input schema must be a struct: probe.reject.${source}`)
  }

  for (const value of [Schema.String, Schema.Never]) {
    const contract = compile(
      HttpApi.make("literal-field").add(
        HttpApiGroup.make("probe").add(
          HttpApiEndpoint.post("literal", "/literal", { [source]: Schema.Struct({ value }), success: Schema.String }),
        ),
      ),
    )
    expect(contract.groups[0].endpoints[0].operation.input).toEqual([{ name: "value", source }])
    expect(contract.groups[0].endpoints[0].operation.inputMode).toBe("required")
  }

  const empty = compile(
    HttpApi.make("empty-struct-control").add(
      HttpApiGroup.make("probe").add(
        HttpApiEndpoint.post("empty", "/empty", {
          query: Schema.Struct({}),
          payload: Schema.Struct({}),
          success: Schema.String,
        }),
      ),
    ),
  )
  expect(empty.groups[0].endpoints[0].operation.input).toEqual([])
  expect(empty.groups[0].endpoints[0].operation.inputMode).toBe("none")
})

// Exercise generated encoders and real fetch transports, not the product's HTTP/domain implementation.
async function withClient(output: Output, run: (directory: string, baseUrl: URL) => Promise<void>) {
  // Keep Effect imports resolvable and the imported emitter's ../empty-record.test reference canonical.
  const directory = await mkdtemp(join(import.meta.dir, ".empty-record-"))
  try {
    const requests: Array<{ url: string; method: string; headers: Headers; body: unknown }> = []
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      async fetch(request) {
        requests.push({
          url: request.url,
          method: request.method,
          headers: new Headers(request.headers),
          body: request.method === "POST" ? await request.json() : await request.text(),
        })
        return Response.json("ok")
      },
    })
    try {
      await Promise.all(output.files.map((file) => Bun.write(join(directory, file.path), file.content)))
      await run(directory, server.url)
      expect(requests.map((request) => ({ url: request.url, method: request.method }))).toEqual([
        { url: new URL("/read", server.url).href, method: "GET" },
        { url: new URL("/write", server.url).href, method: "POST" },
      ])
      expect(requests.map((request) => new URL(request.url).pathname)).toEqual(["/read", "/write"])
      expect(requests.map((request) => new URL(request.url).search)).toEqual(["", ""])
      expect(requests[0].body).toBe("")
      expect(requests[0].headers.get("idempotency-key")).toBeNull()
      expect(requests[1].headers.get("idempotency-key")).toBe("synthetic-key")
      expect(requests[1].headers.get("content-type")).toBe("application/json")
      expect(requests[1].body).toStrictEqual({})
    } finally {
      await server.stop(true)
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}
