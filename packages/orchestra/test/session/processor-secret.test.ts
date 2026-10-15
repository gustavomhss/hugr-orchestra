import { SessionV1 } from "@orchestra/core/v1/session"
import { Database } from "@orchestra/core/database/database"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { EventV2Bridge } from "@/event-v2-bridge"
import { expect } from "bun:test"
import { tool } from "ai"
import { Cause, Deferred, Effect, Exit, Fiber, Layer, Stream } from "effect"
import path from "path"
import z from "zod"
import type { Agent } from "../../src/agent/agent"
import { Provider } from "@/provider/provider"

import { Session } from "@/session/session"
import { LLM } from "../../src/session/llm"
import { MessageV2 } from "../../src/session/message-v2"
import { SessionProcessor } from "../../src/session/processor"
import { MessageID, PartID, SessionID } from "../../src/session/schema"
import { SessionStatus } from "../../src/session/status"
import { SessionSummary } from "../../src/session/summary"
import { CrossSpawnSpawner } from "@orchestra/core/cross-spawn-spawner"
import { TestInstance, provideTmpdirInstance, provideTmpdirServer } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { raw, reply, TestLLMServer } from "../lib/llm-server"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { ProviderV2 } from "@orchestra/core/provider"
import { ModelV2 } from "@orchestra/core/model"
import { SessionProjector } from "@orchestra/core/session/projector"
import { LLMEvent } from "@orchestra/llm"
import { ToolSafety } from "@orchestra/core/tool-safety"


import { ref, env, providerCfg, agent, user, assistant, boot } from "./processor-fixture"
const it = testEffect(env)
it.live("processor stores sanitized denial for secret-bearing acquired Error before durable tool failure", () =>
  provideTmpdirServer(({ dir, llm }) => Effect.gen(function* () {
    const services = yield* boot()
    const secret = "gh"+"p_"+"Q".repeat(40)
    yield* llm.tool("lookup", { query: "weather" })
    const chat = yield* services.session.create({})
    const parent = yield* user(chat.id, "tool")
    const msg = yield* assistant(chat.id, parent.id, path.resolve(dir))
    const model = yield* services.provider.getModel(ref.providerID, ref.modelID)
    const handle = yield* services.processors.create({ assistantMessage: msg, sessionID: chat.id, model })
    yield* handle.process({
      user: parent, sessionID: chat.id, model, agent: agent(), system: [], messages: [{ role: "user", content: "tool" }],
      tools: { lookup: tool({ description: "Acquired error", inputSchema: z.object({ query: z.string() }),
        execute: async (): Promise<{ title: string; output: string; metadata: { source: string } }> => { throw new Error(secret) },
      }) },
    })
    const parts = yield* MessageV2.parts(msg.id)
    const call = parts.find((part) => part.type === "tool")
    expect(call?.state.status).toBe("error")
    if (call?.state.status !== "error") throw new Error("TOOL_ERROR_NOT_PERSISTED")
    expect(call.state.error).toBe(new ToolSafety.Denied({ reason: "recognized-secret-output" }).message)
    expect(JSON.stringify(parts)).not.toContain(secret)
    expect(yield* llm.calls).toBe(1)
  }), { config: (url) => providerCfg(url) }),
)
