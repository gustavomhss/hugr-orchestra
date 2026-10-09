// Whole native registry/corpus proof executed as a Bun executable and a production-shaped Node bundle.
import path from "node:path"
import fs from "node:fs/promises"
import { Effect, Schema } from "effect"
import { AppNodeBuilderV1 } from "@/effect/app-node-builder-v1"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { FSUtil } from "@orchestra/core/fs-util"
import { SessionProjector } from "@orchestra/core/session/projector"
import { Research } from "@orchestra/schema/research"
import { Agent } from "@/agent/agent"
import { InstanceStore } from "@/project/instance-store"
import { Session } from "@/session/session"
import { Permission } from "@/permission"
import { Skill } from "@/skill"
import { ToolRegistry } from "@/tool/registry"
import type { Tool } from "@/tool/tool"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { MessageID, PartID } from "@/session/schema"
import { LogicalTask } from "@/maestro/logical-task"
import { ResearchExecution } from "@/research/allowance"
import { Seats } from "@/maestro/seats"
import { SeatSkillRoot } from "@/maestro/seat-skill-root"
import { SeatSkillContent } from "@/maestro/seat-skill-content"
import { DiscoveryResult } from "@/maestro/discovery-result"
import { Database } from "@orchestra/core/database/database"
import { ResearchRecords } from "@orchestra/core/research/records"

const directory = process.argv[2]
if (!directory) throw new Error("Missing isolated packaged proof root")
if (typeof Bun === "undefined") {
  const [major, minor] = process.versions.node.split(".").map(Number)
  if (major < 22 || (major === 22 && minor < 16)) throw new Error(`Node ${process.versions.node} is older than required 22.16`)
}
// The same stat API must see the extracted tree; only ENOENT proves missing authored source.
const skillRoot = SeatSkillRoot.roots.jimmy
if (!(await fs.stat(skillRoot)).isDirectory()) throw new Error("Packaged skill root is not a real directory")
const sourceRoots = await Promise.all(Object.values(Seats.all).filter((seat) => seat.skills.length > 0).map(async (seat) => {
  const source = Seats.skillSource(seat.id)
  const available = await fs.stat(source).then(() => true, (error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return false
    throw error
  })
  if (available) throw new Error(`Authored seat source is still available: ${source}`)
  return { id: seat.id, path: source, available }
}))
const skillFiles = await SeatSkillContent.read("jimmy", skillRoot, Seats.all.jimmy.skills)
const layer = AppNodeBuilderV1.build(LayerNode.group([
  Agent.node, InstanceStore.node, Session.node, SessionProjector.node, Permission.node, Skill.node,
  ToolRegistry.node, ResearchExecution.node, ResearchRecords.node, Database.node, FSUtil.node,
]))
const result = await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
  const instances = yield* InstanceStore.Service
  return yield* instances.provide({ directory }, Effect.gen(function* () {
    const fsys = yield* FSUtil.Service
    const sessions = yield* Session.Service
    const agents = yield* Agent.Service
    const permission = yield* Permission.Service
    const skills = yield* Skill.Service
    const registry = yield* ToolRegistry.Service
    const execution = yield* ResearchExecution.Service
    const agent = yield* agents.get("jimmy")
    const parent = yield* sessions.create({ agent: "maestro", title: "Packaged native authority" })
    const child = yield* sessions.create({ agent: "jimmy", parentID: parent.id })
    yield* LogicalTask.ensure({ memberID: "jimmy", executionSessionID: child.id, authoritySessionID: parent.id, projectID: child.projectID, source: "host" })
    const user = yield* sessions.updateMessage({ id: MessageID.ascending(), sessionID: child.id, role: "user", agent: "jimmy",
      model: { providerID: ProviderV2.ID.make("openai"), modelID: ModelV2.ID.make("gpt-test") }, time: { created: Date.now() } })
    const assistant = { id: MessageID.ascending(), sessionID: child.id, parentID: user.id, role: "assistant" as const,
      agent: "jimmy", mode: "subagent", path: { cwd: child.directory, root: child.directory }, cost: 0,
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      providerID: user.model.providerID, modelID: user.model.modelID, time: { created: Date.now() } }
    yield* sessions.updateMessage(assistant)
    const tools = yield* registry.tools({ agent, providerID: assistant.providerID, modelID: assistant.modelID })
    const invoke = (name: string, input: Record<string, unknown>) => Effect.gen(function* () {
      const tool = tools.find((entry) => entry.id === name)
      if (!tool) throw new Error(`Missing packaged native tool: ${name}`)
      const part = { id: PartID.ascending(), messageID: assistant.id, sessionID: child.id, type: "tool" as const, tool: name, callID: PartID.ascending(),
        state: { status: "running" as const, input, time: { start: Date.now() } } }
      yield* sessions.updatePart(part)
      const context: Tool.Context = { sessionID: child.id, messageID: assistant.id, callID: part.callID, agent: agent.name, agentID: "jimmy",
        permission: agent.permission, abort: AbortSignal.any([]), messages: yield* sessions.messages({ sessionID: child.id }),
        metadata: (update) => sessions.updatePart({ ...part, state: { ...part.state, ...update } }).pipe(Effect.asVoid),
        ask: (request) => permission.ask({ ...request, sessionID: child.id, tool: { messageID: assistant.id, callID: part.callID }, ruleset: agent.permission }).pipe(Effect.orDie) }
      const executed = yield* execution.enter(child.id, "packaged-proof", tool.execute(input, context))
      yield* sessions.updatePart({ ...part, state: { status: "completed", input, title: executed.title, output: executed.output,
        metadata: executed.metadata, time: { start: part.state.time.start, end: Date.now() } } })
      return executed
    })
    const loaded = yield* Effect.forEach(Seats.all.jimmy.skills, (name) => Effect.gen(function* () {
      const info = yield* skills.require(name, agent.id)
      const result = yield* invoke("skill", { name })
      if (result.metadata.name !== name || result.metadata.dir !== path.dirname(info.location) || !result.output.includes(info.content.trim()))
        throw new Error(`Native packaged skill load differs: ${name}`)
      return { name, location: info.location, content: info.content, output: result.output }
    }))
    const companion = yield* invoke("read", { filePath: path.join(skillRoot, "jimmy-discovery/methods/understand.md") })
    const companionText = Schema.decodeUnknownSync(Schema.Struct({ display: Schema.Struct({ type: Schema.Literal("file"), text: Schema.String, truncated: Schema.Literal(false) }) }))(companion.metadata).display.text
    yield* fsys.writeFileString(path.join(directory, "evidence.txt"), "Version 1 only.\nDisabled rejects operation.\n")
    const read = yield* invoke("read", { filePath: "evidence.txt" })
    const source = Schema.decodeUnknownSync(Research.SourceReceipt)(read.metadata.researchSource)
    if (!source.derivedFrom) throw new Error("Packaged native read omitted received-byte provenance")
    // Reopening after deletion proves retained bytes, rather than a second filesystem read.
    yield* fsys.remove(path.join(directory, "evidence.txt"))
    const received = Schema.decodeUnknownSync(Schema.fromJsonString(Research.ArtifactPage))((yield* invoke("research_view", { action: "source", ref: source.derivedFrom })).output)
    const retained = Schema.decodeUnknownSync(Schema.fromJsonString(Research.ArtifactPage))((yield* invoke("research_view", { action: "source", ref: source.ref })).output)
    const supported: Research.EvidenceRef = { source: source.ref, locator: { kind: "quote", exact: "Version 1 only." } }
    const disabled: Research.EvidenceRef = { source: source.ref, locator: { kind: "quote", exact: "Disabled rejects operation." } }
    const finding = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Struct({ receipt: Research.MutationReceipt, record: Research.FindingRecord })))(
      (yield* invoke("research_record", { action: "finding", proposition: "Version 1 is supported only when enabled", nature: "extraction",
        evidence: [supported], contrary: [disabled], conditions: ["version 1", "enabled"] })).output)
    const reopenedFinding = Schema.decodeUnknownSync(Schema.fromJsonString(Research.FindingRecord))(
      (yield* invoke("research_view", { action: "record", ref: finding.receipt.ref })).output)
    const publication = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Struct({ receipt: Research.MutationReceipt, document: Research.DocumentReceipt })))(
      (yield* invoke("research_record", { action: "document", document: {
        title: "Conditional answer", genre: "answer",
        body: "Version 1 is supported [source](research:supported); disabled rejects operation [exception](research:disabled).\n",
        findingRefs: [finding.receipt.ref], citations: { supported, disabled },
      } })).output)
    const page = Schema.decodeUnknownSync(Schema.fromJsonString(Research.ArtifactPage))(
      (yield* invoke("research_view", { action: "document", ref: publication.document.ref })).output)
    const card: Research.Card = { answer: "Version 1 only; disabled rejects operation.", profile: "understand", depth: "quick", sufficiency: "answered",
      findingRefs: [{ id: reopenedFinding.id, revision: reopenedFinding.revision }], evidenceRefs: [supported, disabled],
      documentRefs: [publication.document.ref], coverage: { examined: ["evidence.txt"], excluded: ["runtime"], failures: [] },
      limitations: ["Supplied static source"], nextActions: [] }
    yield* sessions.updatePart({ id: PartID.ascending(), messageID: assistant.id, sessionID: child.id, type: "text",
      text: `\u0060\u0060\u0060jimmy-result\n${JSON.stringify(card)}\n\u0060\u0060\u0060` })
    yield* sessions.updateMessage({ ...assistant, finish: "stop", time: { ...assistant.time, completed: Date.now() } })
    const history = yield* sessions.messages({ sessionID: child.id })
    const message = history.find((entry) => entry.info.id === assistant.id)
    if (!message) throw new Error("Packaged final assistant message was not persisted")
    const report = yield* DiscoveryResult.assemble(message, history)
    return { runtime: typeof Bun === "undefined" ? "node" : "bun", sourceRoots, skillRoot, skillFiles, skills: loaded, companion: companionText,
      source, received, retained, finding: reopenedFinding, document: publication.document, page, card, report,
      calls: message.parts.flatMap((part) => part.type === "tool" ? [{ tool: part.tool, status: part.state.status }] : []) }
  }))
}).pipe(Effect.provide(layer))))
console.log(`PACKAGED_RESEARCH=${JSON.stringify(result)}`)
