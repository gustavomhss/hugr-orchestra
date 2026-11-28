import { expect, test } from "bun:test"
import { Orchestra } from "@orchestra/client"
import { GenerationOptions } from "@orchestra/schema/llm"
import { Model } from "@orchestra/schema/model"
import { Provider } from "@orchestra/schema/provider"
import { Effect, Schema } from "effect"
import { FetchHttpClient } from "effect/unstable/http"

const model = Schema.encodeSync(Model.Info)(Model.Info.make({
  ...Model.Info.empty(Provider.ID.make("anthropic"), Model.ID.make("wire-model")),
  variants: [
    { id: Model.VariantID.make("thinking"), headers: {}, body: {},
      generation: GenerationOptions.make({ temperature: 0, stop: ["stop"] }),
      providerOptions: { anthropic: { thinking: { type: "enabled", budgetTokens: 12000 }, disabled: false, zero: 0, empty: null } } },
    { id: Model.VariantID.make("plain"), headers: {}, body: {} },
  ],
}))

function serve() {
  return Bun.serve({ port: 0, fetch(request) {
    return Response.json({ location: { directory: "/wire-fixture", project: { id: "global", directory: "/wire-fixture" } },
      data: new URL(request.url).pathname.endsWith("/default") ? model : [model] })
  } })
}

test("Promise model list/default preserve canonical variant options over HTTP", async () => {
  const server = serve()
  try {
    const client = Orchestra.make({ baseUrl: server.url.origin })
    const list = await client.models.list()
    const fallback = await client.models.default()
    expect(list.data).toEqual([model])
    expect(fallback.data).toEqual(model)
    expect(list.data[0].variants[0].generation?.temperature).toBe(0)
    expect(list.data[0].variants[0].providerOptions?.anthropic).toMatchObject({ disabled: false, zero: 0, empty: null })
    expect(list.data[0].variants[1]).not.toHaveProperty("generation")
    expect(list.data[0].variants[1]).not.toHaveProperty("providerOptions")
  } finally {
    await server.stop(true)
  }
})

test("imported Effect model responses decode the canonical GenerationOptions class", async () => {
  const { Orchestra } = await import("@orchestra/client/effect")
  const server = serve()
  try {
    const result = await Effect.gen(function* () {
      const client = yield* Orchestra.make({ baseUrl: server.url.origin })
      return { list: yield* client.models.list(), fallback: yield* client.models.default() }
    }).pipe(Effect.provide(FetchHttpClient.layer), Effect.runPromise)
    const decoded = result.list.data[0]
    expect(decoded.variants[0].generation).toBeInstanceOf(GenerationOptions)
    expect(decoded.variants[0].generation?.temperature).toBe(0)
    expect(decoded.variants[0].generation?.stop).toEqual(["stop"])
    expect(decoded.variants[0].providerOptions?.anthropic).toEqual(model.variants[0].providerOptions?.anthropic)
    expect(JSON.parse(JSON.stringify(Schema.encodeSync(Model.Info)(decoded)))).toEqual(model)
    expect(result.fallback.data?.variants[0].generation).toBeInstanceOf(GenerationOptions)
    expect(decoded.variants[1]).not.toHaveProperty("generation")
  } finally {
    await server.stop(true)
  }
})
