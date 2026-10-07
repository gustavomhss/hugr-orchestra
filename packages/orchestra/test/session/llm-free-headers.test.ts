import { expect } from "bun:test"
import path from "node:path"
import { Effect, Stream } from "effect"
import { CrossSpawnSpawner } from "@orchestra/core/cross-spawn-spawner"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { InstallationVersion } from "@orchestra/core/installation/version"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { SessionV1 } from "@orchestra/core/v1/session"
import { Agent } from "@/agent/agent"
import { Provider } from "@/provider/provider"
import { LLM } from "@/session/llm"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { MessageID, SessionID } from "@/session/schema"
import { provideTmpdirInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const cases = [
  { name: "free", providerID: "opencode-test", modelID: "free-test", cost: { input: 0, output: 0 }, free: true },
  {
    name: "configured paid tier",
    providerID: "opencode-test",
    modelID: "free-test",
    cost: { input: 0, output: 0, context_over_200k: { input: 1, output: 2 } },
    free: false,
  },
  {
    name: "catalog paid tier",
    providerID: "opencode",
    modelID: "claude-sonnet-4",
    cost: { input: 0, output: 0 },
    free: false,
  },
  {
    name: "catalog paid tier only",
    providerID: "opencode",
    modelID: "claude-sonnet-4",
    cost: { input: 0, output: 0, context_over_200k: { input: 0, output: 0 } },
    free: false,
  },
]

cases.forEach((item) =>
  [false, true].forEach((native) => {
    const it = testEffect(
      AppNodeBuilder.build(LayerNode.group([LLM.node, Provider.node, CrossSpawnSpawner.node]), [
        [RuntimeFlags.node, RuntimeFlags.layer({ experimentalNativeLlm: native })],
      ]),
    )

    it.live(`keeps ${item.name} header eligibility after overrides (${native ? "native" : "ai-sdk"})`, () =>
      Effect.gen(function* () {
        const captured: Array<Headers> = []
        const server = yield* Effect.acquireRelease(
          Effect.sync(() =>
            Bun.serve({
              port: 0,
              fetch: (request) => {
                captured.push(request.headers)
                return new Response(
                  'data: {"id":"test","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
                  {
                    headers: { "Content-Type": "text/event-stream" },
                  },
                )
              },
            }),
          ),
          (server) => Effect.promise(() => server.stop(true)),
        )
        yield* provideTmpdirInstance(
          (directory) =>
            Effect.gen(function* () {
              yield* Effect.promise(() =>
                Bun.write(
                  path.join(directory, "header-plugin.ts"),
                  `
export default async () => ({
  "chat.headers": async (_, output) => {
    output.headers["uSeR-aGeNt"] = "orchestra/plugin"
    output.headers["x-plugin"] = "kept"
  },
})
`,
                ),
              )
              const provider = yield* Provider.Service
              const llm = yield* LLM.Service
              const resolved = yield* provider.getModel(
                ProviderV2.ID.make(item.providerID),
                ModelV2.ID.make(item.modelID),
              )
              if (item.name.startsWith("catalog paid tier"))
                expect(resolved.cost.tiers?.some((tier) => tier.input > 0)).toBe(true)
              if (item.name === "catalog paid tier only") expect(resolved.cost.experimentalOver200K?.input).toBe(0)
              if (item.name === "configured paid tier") expect(resolved.cost.experimentalOver200K?.input).toBe(1)
              const sessionID = SessionID.make("session-free-headers")
              const agent = {
                name: "test",
                mode: "primary",
                options: {},
                permission: [{ permission: "*", pattern: "*", action: "allow" }],
              } satisfies Agent.Info
              const user = {
                id: MessageID.make("msg_free-headers"),
                sessionID,
                role: "user",
                time: { created: Date.now() },
                agent: agent.name,
                model: { providerID: resolved.providerID, modelID: resolved.id },
              } satisfies SessionV1.User
              yield* llm
                .stream({
                  user,
                  sessionID,
                  parentSessionID: SessionID.make("session-parent"),
                  model: resolved,
                  agent,
                  system: [],
                  messages: [{ role: "user", content: "Hello" }],
                  tools: {},
                })
                .pipe(Stream.runDrain)
              expect(captured).toHaveLength(1)
              expect(captured[0].get("user-agent")?.startsWith(`opencode/${InstallationVersion}`)).toBe(item.free)
              expect(captured[0].get("user-agent")?.includes("orchestra/")).toBe(!item.free)
              if (native) expect(captured[0].get("user-agent")).not.toContain("ai-sdk/")
              expect(captured[0].get("x-parent-session-id")).toBe("session-parent")
              expect(captured[0].get("x-custom")).toBe("kept")
              expect(captured[0].get("x-plugin")).toBe("kept")
              expect(captured[0].get("x-provider")).toBe("kept")
              expect(captured[0].get("authorization")).toBe("Bearer test-key")
            }),
          {
            config: {
              plugin: ["./header-plugin.ts"],
              enabled_providers: [item.providerID],
              provider: {
                [item.providerID]: {
                  name: "Orchestra Test",
                  npm: "@ai-sdk/openai-compatible",
                  models: {
                    [item.modelID]: {
                      name: "Free Test",
                      cost: item.cost,
                      provider: { npm: "@ai-sdk/openai-compatible", api: `${server.url.origin}/v1` },
                      limit: { context: 1000, output: 100 },
                      headers: {
                        "User-Agent": "orchestra/config",
                        "user-agent": "orchestra/lowercase",
                        "x-custom": "kept",
                      },
                    },
                  },
                  options: {
                    apiKey: "test-key",
                    baseURL: `${server.url.origin}/v1`,
                    headers: { "USER-AGENT": "orchestra/provider", "x-provider": "kept" },
                  },
                },
              },
            },
          },
        )
      }),
    )
  }),
)
