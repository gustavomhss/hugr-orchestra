import type { SessionV1 } from "@orchestra/core/v1/session"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import type { Provider } from "@/provider/provider"
import { MessageID, PartID, SessionID } from "@/session/schema"
import { Effect } from "effect"
import { decode } from "@/continuity/memory"
import type { Host, MemoryArtifact, MemorySnapshot } from "@/continuity/memory-types"

export const sessionID = SessionID.make("ses_memory_parent")
export const producerID = SessionID.make("ses_memory_producer")
export const memory = "Work: Keep deployment read-only until approval. Discovery: stale cache caused the fault; invalidate it to unblock verification. Deployment remains pending."
export const model: Provider.Model = {
  id: ModelV2.ID.make("gpt-5.6-test"), providerID: ProviderV2.ID.make("test"), name: "Memory test model",
  api: { id: "gpt-5.6-test", url: "https://example.invalid", npm: "@ai-sdk/openai" },
  capabilities: {
    toolcall: true, attachment: false, reasoning: false, temperature: true, interleaved: false,
    input: { text: true, image: false, audio: false, video: false, pdf: false },
    output: { text: true, image: false, audio: false, video: false, pdf: false },
  },
  cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
  limit: { context: 200_000, output: 20_000 }, status: "active", options: {}, headers: {}, release_date: "2026-01-01",
}

export function provider(selected = model): Provider.Interface {
  const unused = () => Effect.die(new Error("Unexpected provider method in isolated maintenance"))
  return {
    list: unused, getProvider: unused, getLanguage: unused, closest: unused, getSmallModel: unused,
    defaultModel: unused,
    getModel: (providerID, modelID) => providerID === model.providerID && modelID === model.id
      ? Effect.succeed(selected) : unused(),
  }
}

export function messages(roles: ("user" | "assistant")[] = Array.from({ length: 16 }, (_, index) => index % 2 ? "assistant" : "user")): SessionV1.WithParts[] {
  return roles.map((role, index) => {
    const id = MessageID.make(`msg_${index}`)
    return {
      info: role === "user" ? {
        role, id, sessionID, time: { created: index }, agent: "parent-agent",
        model: { providerID: model.providerID, modelID: model.id, variant: "parent-variant" },
      } : {
        role, id, sessionID, parentID: MessageID.make(`msg_${index - 1}`),
        time: { created: index, completed: index + 1 }, agent: "parent-agent", mode: "build",
        modelID: model.id, providerID: model.providerID, path: { cwd: "/test", root: "/test" }, cost: 0,
        finish: "stop", tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      },
      parts: [{ id: PartID.make(`prt_${index}`), messageID: id, sessionID, type: "text", text: `turn-${index}` }],
    }
  })
}

// Decoder/reader tests do not invoke the archive serializer. Fork tests use the
// real snapshot and transcript functions, never these fixed boundaries as a stub.
export function captured(): MemorySnapshot {
  const history = messages().slice(0, 10)
  // Every swap must shrink the context, so the covered head outweighs the memory scaffold.
  if (history[0].parts[0].type === "text") history[0].parts[0].text = `turn-0 ${"historical context ".repeat(1_000)}`
  return { sessionID, boundary: history[9].info.id, tailStart: history[2].info.id,
    head: history.slice(0, 2), tail: history.slice(2), canRecall: true }
}

export function host(history = messages()): Host {
  return { history, delegations: {}, member: false }
}

// A hypothesis is gist that cites any alias, so fixtures can carry scenario text verbatim.
export function finding(text = memory, src = ["u1"]) {
  return { op: "add", section: "findings", fields: { finding: text, why: "Scenario memory.", status: "hypothesis", check: "None." }, src }
}

export function artifact(): MemoryArtifact {
  const result = decode({ text: JSON.stringify({ ops: [finding()] }), snapshot: captured(), producerID, host: host(), budget: 20_000 })
  if (!("artifact" in result)) throw new Error(`Expected a validated memory fixture: ${JSON.stringify(result)}`)
  return result.artifact
}

export function context(value = artifact()) {
  return { sessionID, boundary: value.boundary, tailStart: value.tailStart, text: value.text, artifact: value }
}
