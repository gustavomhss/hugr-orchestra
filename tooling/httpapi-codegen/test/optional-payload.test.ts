import { describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { Effect, FileSystem, Layer, Path, Schema } from "effect"
import { Etag, FetchHttpClient, HttpClient, HttpPlatform, HttpRouter } from "effect/unstable/http"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { compile, emitEffect, emitEffectImported } from "../src"
import { Api, Cursor, DefaultApi, Query, RequiredQuery } from "./optional-payload.fixture"

type ClientError = { readonly _tag: "ClientError"; readonly cause: unknown }
type Client = {
  readonly probe: {
    readonly list: (input?: typeof Query.Type) => Effect.Effect<typeof Query.Type, ClientError>
    readonly required: (input: typeof RequiredQuery.Type) => Effect.Effect<typeof RequiredQuery.Type, ClientError>
  }
}

const outputs = {
  inline: emitEffect(compile(Api)),
  imported: emitEffectImported(compile(DefaultApi), { module: "../optional-payload.fixture", api: "DefaultApi" }),
}

describe.each(["inline", "imported"] as const)("%s Effect optional payloads", (kind) => {
  test("omitted input and explicit undefined omit strict keys and leave defaults to schema", async () => {
    await withClient(kind, (client, requests, dispatched) =>
      Effect.gen(function* () {
        expect(yield* client.probe.list()).toEqual({})
        expect(yield* client.probe.list({})).toEqual({})
        expect(yield* client.probe.list({ after: undefined, limit: undefined })).toEqual({})
        const after = Cursor.make("cursor/next?&=✓")
        expect(yield* client.probe.list({ after, limit: 7 })).toEqual({ after, limit: 7 })
        expect(requests).toEqual([{}, {}, {}, { after, limit: 7 }])
        expect(dispatched).toHaveLength(4)
      }),
    )
  })

  test("preserves false, zero, null, empty strings, and ordinary unusual keys", async () => {
    await withClient(kind, (client, requests, dispatched) =>
      Effect.gen(function* () {
        const input = { limit: 0, enabled: false, nullable: null, text: "", "": "", "x-query": "value" }
        expect(yield* client.probe.list(input)).toEqual(input)
        expect(requests).toHaveLength(1)
        expect(dispatched).toHaveLength(1)
        expect(requests[0]).toEqual(input)
        expect(yield* client.probe.list({ "": undefined, "x-query": undefined })).toEqual({})
        expect(requests).toEqual([input, {}])
      }),
    )
  })

  test("keeps required-key validation before fetch with optional keys omitted", async () => {
    await withClient(kind, (client, requests, dispatched) =>
      Effect.gen(function* () {
        const required = Cursor.make("required-cursor")
        expect(yield* client.probe.required({ required })).toEqual({ required })
        expect(yield* client.probe.required({ required, after: undefined })).toEqual({ required })
        expect(requests).toHaveLength(2)
        expect(dispatched).toHaveLength(2)
        requests.forEach((payload) => expect(payload).toEqual({ required }))

        // @ts-expect-error Exercise runtime validation of an absent required field.
        const missing = yield* client.probe.required({}).pipe(Effect.flip)
        // @ts-expect-error Required fields must still reject explicit undefined.
        const undefinedValue = yield* client.probe.required({ required: undefined }).pipe(Effect.flip)
        ;[missing, undefinedValue].forEach((error) => {
          expect(error._tag).toBe("ClientError")
          expect(Schema.isSchemaError(error.cause)).toBe(true)
        })
        expect(requests).toHaveLength(2)
        expect(dispatched).toHaveLength(2)
      }),
    )
  })
})

async function withClient<E>(
  kind: keyof typeof outputs,
  run: (client: Client, requests: Array<unknown>, dispatched: Array<string>) => Effect.Effect<void, E>,
) {
  const directory = await mkdtemp(join(fileURLToPath(new URL(".", import.meta.url)), ".optional-payload-"))
  const requests: Array<unknown> = []
  const dispatched: Array<string> = []
  const router = HttpRouter.toWebHandler(
    HttpApiBuilder.layer(DefaultApi).pipe(
      Layer.provide(
        HttpApiBuilder.group(DefaultApi, "probe", (handlers) =>
          handlers
            .handle("list", ({ payload }) => Effect.succeed(payload))
            .handle("required", ({ payload }) => Effect.succeed(payload)),
        ),
      ),
      Layer.provide(
        Layer.mergeAll(Path.layer, Etag.layerWeak, HttpPlatform.layer).pipe(
          Layer.provideMerge(FileSystem.layerNoop({})),
        ),
      ),
    ),
    { disableLogger: true },
  )
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      requests.push(await request.clone().json())
      return router.handler(request)
    },
  })
  await Promise.all(outputs[kind].files.map((file) => Bun.write(join(directory, file.path), file.content)))
    .then(async () => {
      const generated: {
        make: (options: { baseUrl: URL }) => Effect.Effect<Client, never, HttpClient.HttpClient>
      } = await import(join(directory, "client.ts"))
      await Effect.runPromise(
        Effect.gen(function* () {
          const transport = yield* HttpClient.HttpClient
          const client = yield* generated.make({ baseUrl: server.url }).pipe(
            Effect.provideService(
              HttpClient.HttpClient,
              HttpClient.mapRequest(transport, (request) => {
                dispatched.push(request.url)
                return request
              }),
            ),
          )
          yield* run(client, requests, dispatched)
        }).pipe(Effect.provide(FetchHttpClient.layer)),
      )
    })
    .finally(async () => {
      server.stop(true)
      await router.dispose()
      await rm(directory, { recursive: true, force: true })
    })
}
