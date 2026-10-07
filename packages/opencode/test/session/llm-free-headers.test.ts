import { expect } from "bun:test"
import path from "node:path"
import { Effect, Stream } from "effect"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { InstallationVersion } from "@opencode-ai/core/installation/version"
import { ModelV2 } from "@opencode-ai/core/model"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { Agent } from "@/agent/agent"
import { Provider } from "@/provider/provider"
import { LLM } from "@/session/llm"
import { MessageID, SessionID } from "@/session/schema"
import { provideTmpdirInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(AppNodeBuilder.build(LayerNode.group([LLM.node, Provider.node, CrossSpawnSpawner.node])))

it.live("keeps the free OpenCode user agent after model and plugin header overrides", () =>
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
          const resolved = yield* provider.getModel(ProviderV2.ID.make("opencode-test"), ModelV2.ID.make("free-test"))
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
          expect(captured[0].get("user-agent")?.startsWith(`opencode/${InstallationVersion}`)).toBe(true)
          expect(captured[0].get("user-agent")).not.toContain("orchestra/")
          expect(captured[0].get("x-parent-session-id")).toBe("session-parent")
          expect(captured[0].get("x-custom")).toBe("kept")
          expect(captured[0].get("x-plugin")).toBe("kept")
          expect(captured[0].get("authorization")).toBe("Bearer test-key")
        }),
      {
        config: {
          plugin: ["./header-plugin.ts"],
          enabled_providers: ["opencode-test"],
          provider: {
            "opencode-test": {
              name: "OpenCode Test",
              npm: "@ai-sdk/openai-compatible",
              models: {
                "free-test": {
                  name: "Free Test",
                  cost: { input: 0, output: 0 },
                  limit: { context: 1000, output: 100 },
                  headers: {
                    "User-Agent": "orchestra/config",
                    "user-agent": "orchestra/lowercase",
                    "x-custom": "kept",
                  },
                },
              },
              options: { apiKey: "test-key", baseURL: `${server.url.origin}/v1` },
            },
          },
        },
      },
    )
  }),
)
