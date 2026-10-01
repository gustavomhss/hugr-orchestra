import { expect } from "bun:test"
import { Effect, Layer, Stream } from "effect"
import { LLMEvent } from "@opencode-ai/llm"
import type { SessionV1 } from "@opencode-ai/core/v1/session"
import type { JSONSchema7 } from "ai"
import { Provider } from "../../src/provider/provider"
import type { LLM } from "../../src/session/llm"
import { MessageID, PartID, SessionID } from "../../src/session/schema"
import { run, snapshot } from "../../src/continuity/fork"
import { catalogue } from "../../src/continuity/source"
import { jsonSchema } from "../../src/continuity/artifact"
import { responseSchema } from "../../src/continuity/output-schema"
import { ProviderTest } from "../fake/provider"
import { testEffect } from "../lib/effect"

const model = ProviderTest.model()
const it = testEffect(Layer.mock(Provider.Service, { getModel: () => Effect.succeed(model) }))
const parentID = SessionID.make("ses_schema_parent")
const history: SessionV1.WithParts[] = Array.from({ length: 10 }, (_, index) => {
  const id = MessageID.make(`msg_schema_${index}`)
  return {
    info: { id, sessionID: parentID, role: "user", agent: "parent-agent", model: { providerID: model.providerID, modelID: model.id },
      time: { created: index }, system: "parent-system", tools: { bash: true } },
    parts: [{ id: PartID.make(`prt_schema_${index}`), messageID: id, sessionID: parentID, type: "text", text: `turn-${index}` }],
  }
})

for (const npm of ["@ai-sdk/openai", "@ai-sdk/openai-compatible", "@ai-sdk/anthropic", "@ai-sdk/azure"]) {
  it.effect(`native schema field is bounded to OpenAI Responses: ${npm}`, () => Effect.gen(function* () {
    const provider = yield* Provider.Service
    const captured = snapshot(parentID, history)
    if (!captured) throw new Error("fixture requires compressible head")
    // W2 owns StreamInput's optional field; this local capture stays compatible
    // with the pre-W2 base without changing the bridge or casting its interface.
    const requests: (LLM.StreamInput & { responseSchema?: JSONSchema7 })[] = []
    const artifact = yield* run(captured, {
      provider: { ...provider, getModel: () => Effect.succeed({ ...model, api: { ...model.api, npm } }) },
      llm: { stream: (request) => {
        requests.push(request)
        return Stream.fromIterable([
          LLMEvent.textDelta({ id: "schema", text: JSON.stringify({ status: "ready", exact: [{ source: "S002", reason: "identifier" }],
            notes: [], reference_only: [], omissions: [], issues: [] }) }),
          LLMEvent.finish({ reason: "stop" }),
        ])
      } },
    })
    expect(requests).toHaveLength(1)
    expect(artifact?.exact).toEqual([{ source: "S002", reason: "identifier", value: "turn-0" }])
    const request = requests[0]
    const selected = responseSchema(catalogue({ parentID, head: captured.head, canRecall: captured.canRecall }))
    expect(Object.hasOwn(request, "responseSchema")).toBe(npm === "@ai-sdk/openai")
    expect(request.responseSchema).toEqual(npm === "@ai-sdk/openai" ? selected : undefined)
    expect(request.agent.prompt).toContain(JSON.stringify(jsonSchema))
    expect(request.agent.prompt).not.toContain(JSON.stringify(selected))
    expect(String(request.messages[0].content)).toContain(`"bodySchema":${JSON.stringify(jsonSchema)}`)
    expect(String(request.messages[0].content)).not.toContain(JSON.stringify(selected))
    expect(request.tools).toEqual({})
    expect(request.toolChoice).toBe("none")
    expect(request.system).toEqual([])
    expect(request.purpose).toBe("context-maintenance")
    expect(request.parentSessionID).toBe(parentID)
    expect(request.sessionID).not.toBe(parentID)
    expect(request.user.system).toBeUndefined()
    expect(request.user.tools).toBeUndefined()
    expect(request.agent.permission).toEqual([{ permission: "*", pattern: "*", action: "deny" }])
  }))
}
