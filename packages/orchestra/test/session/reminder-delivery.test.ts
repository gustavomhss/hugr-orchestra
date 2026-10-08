import { expect } from "bun:test"
import { createOpenAI } from "@ai-sdk/openai"
import { Effect, Layer, Stream } from "effect"
import { FetchHttpClient } from "effect/unstable/http"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNodePlatform } from "@orchestra/core/effect/app-node-platform"
import type { SessionV1 } from "@orchestra/core/v1/session"
import { Auth } from "@/auth"
import { Config } from "@/config/config"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { Plugin } from "@/plugin"
import { Provider } from "@/provider/provider"
import { LLM } from "@/session/llm"
import { MessageV2 } from "@/session/message-v2"
import { MessageID, PartID, SessionID } from "@/session/schema"
import { ProviderTest } from "../fake/provider"
import { testEffect } from "../lib/effect"

const it = testEffect(Layer.empty)
const model = ProviderTest.model()
const sessionID = SessionID.make("ses_reminder_delivery")

for (const native of [false, true]) {
  it.instance(`hook reminders reach real provider requests as user history, native=${native}`, () => Effect.gen(function* () {
    const wire: { input: { role?: string; content?: { text?: string }[] }[]; instructions?: string }[] = []
    const capture: typeof fetch = Object.assign(async (_url: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      wire.push(await new Response(init?.body).json())
      return new Response([
        { type: "response.created", response: { id: "resp-reminder", created_at: 0, model: model.api.id } },
        { type: "response.completed", response: { id: "resp-reminder", output: [], incomplete_details: null,
          usage: { input_tokens: 1, output_tokens: 1 } } },
      ].map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""), {
        headers: { "Content-Type": "text/event-stream" },
      })
    }, { preconnect: () => { throw new Error("unexpected preconnect") } })
    const provider = ProviderTest.fake({ model,
      info: ProviderTest.info({ options: { apiKey: "test-only" } }, model),
      getLanguage: () => Effect.succeed(createOpenAI({ apiKey: "test-only", fetch: capture }).responses(model.api.id)),
    })
    const layer = AppNodeBuilder.build(LLM.node, [
      [Provider.node, provider.layer],
      [Auth.node, Layer.mock(Auth.Service, { get: () => Effect.succeed(undefined) })],
      [Config.node, Layer.mock(Config.Service, { get: () => Effect.succeed({}) })],
      [Plugin.node, Layer.succeed(Plugin.Service, Plugin.Service.of({
        trigger: (_name, _input, output) => Effect.succeed(output),
        list: () => Effect.succeed([]), init: () => Effect.void,
      }))],
      [RuntimeFlags.node, RuntimeFlags.layer({ experimentalNativeLlm: native })],
      [LayerNodePlatform.httpClient, FetchHttpClient.layer.pipe(Layer.provide(Layer.succeed(FetchHttpClient.Fetch, capture)))],
    ])
    const user: SessionV1.User = { id: MessageID.make("msg_bound"), sessionID, role: "user", agent: "test",
      model: { providerID: model.providerID, modelID: model.id }, time: { created: 0 },
      promptContext: { reminders: ["first note", "second note"] } }
    const history: SessionV1.WithParts[] = [{ info: user, parts: [{ type: "text", id: PartID.make("prt_bound"),
      messageID: user.id, sessionID, text: " original\r\ntext " }] }]
    const before = structuredClone(history)
    const messages = yield* MessageV2.toModelMessagesEffect(history, model)
    const request: LLM.StreamInput = { user, sessionID, model,
      agent: { name: "test", mode: "primary", options: {}, permission: [] },
      system: ["BASE_SYSTEM"], messages, tools: {} }
    const events = yield* LLM.Service.use((llm) => llm.stream(request).pipe(Stream.runCollect)).pipe(Effect.provide(layer))
    expect(events.some((event) => event.type === "finish")).toBe(true)
    expect(events.some((event) => event.type === "provider-error")).toBe(false)
    expect(wire).toHaveLength(1)
    expect(wire[0].input.filter((message) => message.role === "user")).toEqual([{ role: "user", content: [
      { type: "input_text", text: " original\r\ntext " },
      { type: "input_text", text: "Hook reminder:\nfirst note" },
      { type: "input_text", text: "Hook reminder:\nsecond note" },
    ] }])
    // A later provider turn reuses history; notes stay on that original user only.
    yield* LLM.Service.use((llm) => llm.stream({ ...request, messages: [...messages,
      { role: "assistant", content: "answer" }, { role: "user", content: "continue" },
    ] }).pipe(Stream.runDrain)).pipe(Effect.provide(layer))
    expect(wire).toHaveLength(2)
    expect(wire[1].input.filter((message) => message.role === "user")).toEqual([
      ...wire[0].input.filter((message) => message.role === "user"),
      { role: "user", content: [{ type: "input_text", text: "continue" }] },
    ])
    // Merely carrying User metadata cannot inject a note into a title/other request.
    yield* LLM.Service.use((llm) => llm.stream({ ...request,
      messages: [{ role: "user", content: "title only" }],
    }).pipe(Stream.runDrain)).pipe(Effect.provide(layer))
    expect(wire).toHaveLength(3)
    expect(JSON.stringify(wire[2])).not.toContain("note")
    for (const body of wire) {
      expect(JSON.stringify([body.instructions, ...body.input.filter((message) => message.role === "system")]))
        .not.toContain("note")
    }
    expect(history).toEqual(before)
  }))
}
