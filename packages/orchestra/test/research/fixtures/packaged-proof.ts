// Whole native registry/corpus proof executed by the packaged-runtime CI test in Bun and Node.
import path from "node:path"
import { Effect, Schema } from "effect"
import { AppNodeBuilderV1 } from "@/effect/app-node-builder-v1"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { FSUtil } from "@orchestra/core/fs-util"
import { SessionProjector } from "@orchestra/core/session/projector"
import { Research } from "@orchestra/schema/research"
import { Agent } from "@/agent/agent"
import { InstanceStore } from "@/project/instance-store"
import { Session } from "@/session/session"
import { ToolRegistry } from "@/tool/registry"
import { Tool } from "@/tool/tool"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { MessageID, PartID } from "@/session/schema"
import { LogicalTask } from "@/maestro/logical-task"
import { ResearchExecution } from "@/research/allowance"
import { Seats } from "@/maestro/seats"
import { DiscoveryResult } from "@/maestro/discovery-result"
import { Database } from "@orchestra/core/database/database"
import { ResearchRecords } from "@orchestra/core/research/records"

const directory = process.argv[2]
if (!directory) throw new Error("Missing isolated packaged proof root")
const layer = AppNodeBuilderV1.build(LayerNode.group([Agent.node, InstanceStore.node, Session.node, SessionProjector.node,
  ToolRegistry.node, ResearchExecution.node, ResearchRecords.node, Database.node, FSUtil.node]))
const result = await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
  const instances = yield* InstanceStore.Service
  return yield* instances.provide({ directory }, Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const sessions = yield* Session.Service
    const agents = yield* Agent.Service
    const registry = yield* ToolRegistry.Service
    const execution = yield* ResearchExecution.Service
    const agent = yield* agents.get("jimmy")
    const parent = yield* sessions.create({ agent: "maestro", title: "Packaged native authority" })
    const child = yield* sessions.create({ agent: "jimmy", parentID: parent.id })
    const logical = yield* LogicalTask.ensure({ memberID: "jimmy", executionSessionID: child.id, authoritySessionID: parent.id, projectID: child.projectID, source: "host" })
    const assistant = { id: MessageID.ascending(), sessionID: child.id, parentID: MessageID.ascending(), role: "assistant" as const,
      agent: "jimmy", mode: "jimmy", path: { cwd: child.directory, root: child.directory }, cost: 0,
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test"), time: { created: Date.now() } }
    yield* sessions.updateMessage(assistant)
    const tools = yield* registry.tools({ agent, providerID: assistant.providerID, modelID: assistant.modelID })
    const invoke = (name: string, input: Record<string, unknown>) => Effect.gen(function* () {
      const tool = tools.find((entry) => entry.id === name)
      if (!tool) throw new Error(`Missing packaged native tool: ${name}`)
      const part = { id: PartID.ascending(), messageID: assistant.id, sessionID: child.id, type: "tool" as const, tool: name, callID: PartID.ascending(),
        state: { status: "running" as const, input, time: { start: Date.now() } } }
      yield* sessions.updatePart(part)
      const context: Tool.Context = { sessionID: child.id, messageID: assistant.id, callID: part.callID, agent: agent.name, agentID: "jimmy",
        permission: agent.permission, abort: AbortSignal.any([]), messages: [], metadata: () => Effect.void, ask: () => Effect.void }
      return yield* execution.enter(child.id, "packaged-proof", tool.execute(input, context))
    })
    yield* fs.writeFileString(path.join(directory, "evidence.txt"), "Version 1 only.\nDisabled rejects operation.\n")
    const read = yield* invoke("read", { filePath: "evidence.txt" })
    const source = Schema.decodeUnknownSync(Research.SourceReceipt)(read.metadata.researchSource)
    const finding = Schema.decodeUnknownSync(Research.MutationReceipt)(Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(
      (yield* invoke("research_record", { action: "finding", proposition: "Only version 1 is supported", nature: "extraction",
        evidence: [{ source: source.ref, locator: { kind: "quote", exact: "Version 1 only." } }],
        contrary: [{ source: source.ref, locator: { kind: "quote", exact: "Disabled rejects operation." } }], conditions: ["version 1"] })).output))
    const document = Schema.decodeUnknownSync(Research.MutationReceipt)(Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(
      (yield* invoke("research_record", { action: "document", title: "Conditional answer", genre: "answer", content: "Version 1 only; disabled rejects operation.\n", sourceRefs: [source.ref], findingRefs: [finding.ref] })).output))
    if (!document.document) throw new Error("Packaged native document receipt missing")
    const page = yield* invoke("research_view", { action: "document", ref: document.document.ref })
    const card: Research.Card = { answer: "Version 1 only; disabled rejects operation.", profile: "understand", depth: "quick", sufficiency: "answered",
      findingRefs: [finding.ref], evidenceRefs: [{ source: source.ref, locator: { kind: "quote", exact: "Version 1 only." } }],
      documentRefs: [document.document.ref], coverage: { examined: ["evidence.txt"], excluded: ["runtime"], failures: [] }, limitations: ["Supplied static source"], nextActions: [] }
    const report = yield* DiscoveryResult.assemble({ info: { ...assistant, finish: "stop" }, parts: [{ id: PartID.ascending(), messageID: assistant.id,
      sessionID: child.id, type: "text", text: `\u0060\u0060\u0060jimmy-result\n${JSON.stringify(card)}\n\u0060\u0060\u0060` }] }, [])
    return { runtime: typeof Bun === "undefined" ? "node" : "bun", sourceAvailable: yield* fs.existsSafe(Seats.skillSource("jimmy")),
      skillNames: agent.options.nativeSkills, taskId: logical.taskId, source, document: document.document, page: page.output, report }
  }))
}).pipe(Effect.provide(layer))))
console.log(`PACKAGED_RESEARCH=${JSON.stringify(result)}`)
