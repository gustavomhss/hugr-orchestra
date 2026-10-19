// Whole native registry/corpus proof executed as a Bun executable and a production-shaped Node bundle.
import path from "node:path"
import fs from "node:fs/promises"
import { createHash } from "node:crypto"
import { isDeepStrictEqual } from "node:util"
import { Effect, Layer, Schema } from "effect"
import { NativeSessionFixture } from "../../fixture/native-session"
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
import { ResearchArtifacts } from "@orchestra/core/research/artifacts"
import { ResearchLedger } from "@orchestra/core/research/ledger"
import { EventV2 } from "@orchestra/core/event"
import { SessionV1 } from "@orchestra/core/v1/session"
import { memoMap } from "@orchestra/core/effect/memo-map"
import { ResearchEvent } from "@orchestra/schema/research-event"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Provider } from "@/provider/provider"
import { SessionPrompt } from "@/session/prompt"
import { HttpApiApp } from "@/server/routes/instance/httpapi/server"
import { TestLLMServer } from "../../lib/llm-server"
import { testProviderConfig } from "../../lib/test-provider"
import { Orchestra } from "../../../../client/src/index"

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
const layer = NativeSessionFixture.legacy(LayerNode.group([
  Agent.node, InstanceStore.node, Session.node, SessionProjector.node, Permission.node, Skill.node,
  ToolRegistry.node, ResearchExecution.node, ResearchRecords.node, Database.node, FSUtil.node, EventV2Bridge.node,
  ResearchArtifacts.node, EventV2.node, Provider.node, SessionPrompt.node,
  LayerNode.make({ service: TestLLMServer, layer: TestLLMServer.layer, deps: [] }),
]))
const proof = Effect.gen(function* () {
  const remote = yield* TestLLMServer
  const fsys = yield* FSUtil.Service
  yield* fsys.writeFileString(path.join(directory, "orchestra.json"), JSON.stringify({
    ...testProviderConfig(remote.url), model: "test/test-model", small_model: "test/test-model", plugin: [], mcp: {},
    compaction: { auto: false },
  }))
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
    const companion = yield* invoke("read", { filePath: path.join(skillRoot, "jimmy-reference/calibration.md") })
    const companionText = Schema.decodeUnknownSync(Schema.Struct({ display: Schema.Struct({ type: Schema.Literal("file"), text: Schema.String, truncated: Schema.Literal(false) }) }))(companion.metadata).display.text
    yield* fsys.writeFileString(path.join(directory, "evidence.txt"), "Version 1 only.\nDisabled rejects operation.\n")
    const read = yield* invoke("read", { filePath: "evidence.txt" })
    const source = Schema.decodeUnknownSync(Research.SourceReceipt)(read.metadata.researchSource)
    if (!source.derivedFrom) throw new Error("Packaged native read omitted received-byte provenance")
    // Reopening after deletion proves retained bytes, rather than a second filesystem read.
    yield* fsys.remove(path.join(directory, "evidence.txt"))
    const received = Schema.decodeUnknownSync(Schema.fromJsonString(SourcePage))((yield* invoke("research_view", { action: "source", ref: source.derivedFrom })).output)
    const retained = Schema.decodeUnknownSync(Schema.fromJsonString(SourcePage))((yield* invoke("research_view", { action: "source", ref: source.ref })).output)
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
    // The card is the host's: the seat opens, claims, checks and closes its inquiry, and the ledger holds what close assembled.
    const opened = Schema.decodeUnknownSync(Opened)((yield* invoke("inquiry", { action: "open", question: "When is version 1 supported?",
      subquestions: ["Which condition enables version 1"], profile: "understand" })).metadata.inquiry)
    yield* invoke("inquiry", { action: "claim", subquestion: opened.subquestions[0], proposition: "Version 1 is supported when enabled",
      nature: "extraction", conditions: ["version 1", "enabled"], evidence: [{ source: source.ref, quote: "Version 1 only." }],
      contrary: [{ source: source.ref, quote: "Disabled rejects operation." }] })
    yield* invoke("inquiry", { action: "check" })
    yield* invoke("inquiry", { action: "close", sufficiency: "answered", answer: "Version 1 is supported when enabled; disabled rejects operation.",
      limitations: ["Supplied static source"] })
    const card = yield* ResearchLedger.closed(source.binding)
    if (!card) throw new Error("Packaged native inquiry close stored no card")
    yield* sessions.updatePart({ id: PartID.ascending(), messageID: assistant.id, sessionID: child.id, type: "text", text: "Inquiry closed." })
    yield* sessions.updateMessage({ ...assistant, finish: "stop", time: { ...assistant.time, completed: Date.now() } })
    const history = yield* sessions.messages({ sessionID: child.id })
    const message = history.find((entry) => entry.info.id === assistant.id)
    if (!message) throw new Error("Packaged final assistant message was not persisted")
    const report = yield* DiscoveryResult.assemble(message, history)
    const task = yield* taskProof(directory)
    return { runtime: typeof Bun === "undefined" ? "node" : "bun", sourceRoots, skillRoot, skillFiles, skills: loaded, companion: companionText,
      source, received, retained, finding: reopenedFinding, document: publication.document, page, card, report,
      calls: message.parts.flatMap((part) => part.type === "tool" ? [{ tool: part.tool, status: part.state.status }] : []), task }
  }))
})

const Opened = Schema.Struct({ question: Research.RecordRef, subquestions: Schema.NonEmptyArray(Research.RecordRef) })

// research_view source pages also say where their line 1 sits in the original file (J5.3).
const SourcePage = Schema.Struct({ ...Research.ArtifactPage.fields, lines: Schema.Struct({ basis: Schema.Literals(["original", "retained"]), start: Schema.Int }) })

// Scripted localhost responses prove native mechanics, not real-model research quality.
const TaskMetadata = Schema.Struct({
  parentSessionId: Schema.String, sessionId: Schema.String,
  workResult: Schema.Struct({
    schema: Schema.Literal("discovery-work-result-v1"), taskId: Schema.String,
    card: Schema.Struct({ parsed: Schema.Literal(true), messageID: Schema.String }), outcome: Schema.Literal("done"),
    referencesChecked: Schema.Literal(true), terminal: Schema.Struct({ reason: Schema.Literal("ended") }),
    discovery: Research.CardV2, documents: Schema.Array(Research.DocumentReceipt), corpus: Research.Corpus,
  }),
})

const taskProof = Effect.fn("PackagedProof.task")(function* (directory: string) {
  const remote = yield* TestLLMServer
  const fsys = yield* FSUtil.Service
  const sessions = yield* Session.Service
  const prompt = yield* SessionPrompt.Service
  const provider = yield* Provider.Service
  const events = yield* EventV2.Service
  const model = yield* provider.getModel(ProviderV2.ID.make("test"), ModelV2.ID.make("test-model"))
  const parent = yield* sessions.create({ agent: "maestro", title: "Packaged native Task authority" })
  yield* fsys.writeFileString(path.join(directory, "task-evidence.txt"), "Version 1 only.\nDisabled rejects operation.\n")
  const body = "Résumé: Version 1 is supported [source](research:supported); disabled rejects operation [exception](research:disabled).\n"
  const state: { source?: Research.SourceReceipt; finding?: typeof Research.FindingRecord.Type; document?: Research.DocumentReceipt;
    page?: Research.ArtifactPage; opened?: boolean; returned?: boolean } = {}
  const unsubscribe = yield* events.listen((event) => Effect.gen(function* () {
    if (event.type === ResearchEvent.SourceAdmitted.type) {
      const admitted = Schema.decodeUnknownSync(ResearchEvent.SourceAdmitted.data)(event.data)
      if (admitted.binding.authoritySessionID !== parent.id || admitted.receipt.ref.representation !== "text" || state.source) return
      state.source = admitted.receipt
      yield* remote.tool("research_record", { action: "finding", proposition: "Version 1 is supported only when enabled", nature: "extraction",
        conditions: ["version 1", "enabled"],
        evidence: [{ source: state.source.ref, locator: { kind: "quote", exact: "Version 1 only." } }],
        contrary: [{ source: state.source.ref, locator: { kind: "quote", exact: "Disabled rejects operation." } }],
      })
      return
    }
    if (event.type === ResearchEvent.RecordCommitted.type) {
      const committed = Schema.decodeUnknownSync(ResearchEvent.RecordCommitted.data)(event.data)
      if (committed.binding.authoritySessionID !== parent.id || committed.record.kind !== "finding" || state.finding) return
      state.finding = committed.record
      yield* remote.tool("research_record", { action: "document", document: {
        title: "Native Task conditional answer", genre: "answer", body,
        findingRefs: [{ id: committed.record.id, revision: committed.record.revision }],
        citations: { supported: committed.record.evidence[0], disabled: committed.record.contrary[0] },
      } })
      return
    }
    if (event.type === ResearchEvent.DocumentPublished.type) {
      const published = Schema.decodeUnknownSync(ResearchEvent.DocumentPublished.data)(event.data)
      if (published.binding.authoritySessionID !== parent.id || state.document) return
      state.document = published.receipt
      yield* remote.tool("research_view", { action: "document", ref: published.receipt.ref })
      return
    }
    if (event.type !== SessionV1.Event.PartUpdated.type) return
    const part = Schema.decodeUnknownSync(SessionV1.Event.PartUpdated.data)(event.data).part
    if (part.type !== "tool" || part.state.status !== "completed") return
    if (part.tool === "research_view" && part.sessionID === state.source?.binding.executionSessionID && !state.page) {
      const page = Schema.decodeUnknownSync(Schema.fromJsonString(Research.ArtifactPage))(part.state.output)
      const document = Schema.decodeUnknownSync(Research.DocumentReceipt)(page.receipt)
      if (!state.finding || !state.source || !state.document || !isDeepStrictEqual(document, state.document) || page.text !== body)
        throw new Error("Native Task reopened document differs from admitted publication")
      state.page = page
      yield* remote.tool("inquiry", { action: "open", question: "When is version 1 supported?",
        subquestions: ["Which condition enables version 1"], profile: "understand" })
      return
    }
    // The open reply names the subquestion; claim, check and close follow, then the seat's last text.
    if (part.tool === "inquiry" && state.source && part.sessionID === state.source.binding.executionSessionID && !state.opened) {
      const opened = Schema.decodeUnknownSync(Schema.Struct({ inquiry: Opened }))(part.state.metadata).inquiry
      state.opened = true
      yield* remote.tool("inquiry", { action: "claim", subquestion: opened.subquestions[0], proposition: "Version 1 is supported when enabled",
        nature: "extraction", conditions: ["version 1", "enabled"], evidence: [{ source: state.source.ref, quote: "Version 1 only." }],
        contrary: [{ source: state.source.ref, quote: "Disabled rejects operation." }] })
      yield* remote.tool("inquiry", { action: "check" })
      yield* remote.tool("inquiry", { action: "close", sufficiency: "answered", answer: "Version 1 is supported when enabled; disabled rejects operation.",
        limitations: ["Scripted static-source mechanics only"] })
      yield* remote.text("Inquiry closed.")
      return
    }
    if (part.tool !== "task" || part.sessionID !== parent.id || state.returned) return
    Schema.decodeUnknownSync(TaskMetadata)(part.state.metadata)
    state.returned = true
    yield* remote.text("Native discovery returned with verified admitted references.")
  }))
  yield* Effect.addFinalizer(() => unsubscribe)
  yield* remote.tool("task", { description: "Inspect conditional behavior", prompt: "Read task-evidence.txt; retain both branches, publish qualified answer, close the inquiry.", subagent_type: "jimmy" })
  yield* remote.tool("read", { filePath: "task-evidence.txt" })
  const final = yield* prompt.prompt({ sessionID: parent.id, agent: "maestro", model: { providerID: model.providerID, modelID: model.id },
    parts: [{ type: "text", text: "Delegate conditional source research to jimmy and receive verified document references." }] }).pipe(
    Effect.timeoutOrElse({ duration: "25 seconds", orElse: () => Effect.gen(function* () {
      const children = yield* sessions.children(parent.id)
      const histories = yield* Effect.forEach([parent, ...children], (session) => sessions.messages({ sessionID: session.id }))
      return yield* Effect.die(new Error(`Packaged native Task deadline: ${JSON.stringify({ state, inputs: yield* remote.inputs, histories })}`))
    }) }),
  )
  const parentHistory = yield* sessions.messages({ sessionID: parent.id })
  const task = parentHistory.flatMap((message) => message.parts).find((part) => part.type === "tool" && part.tool === "task")
  const card = state.source ? yield* ResearchLedger.closed(state.source.binding) : undefined
  if (!task || task.type !== "tool" || task.state.status !== "completed" || !state.returned || !state.source || !state.finding || !state.document || !state.page || !card)
    throw new Error(`Packaged native Task omitted completed corpus/result: ${JSON.stringify({ state, parentHistory })}`)
  const metadata = Schema.decodeUnknownSync(TaskMetadata)(task.state.metadata)
  const child = yield* sessions.get(state.source.binding.executionSessionID)
  const childHistory = yield* sessions.messages({ sessionID: child.id })
  const sibling = yield* sessions.create({ agent: "jimmy", parentID: parent.id })
  const siblingTask = yield* LogicalTask.ensure({ memberID: "jimmy", executionSessionID: sibling.id, authoritySessionID: parent.id, projectID: sibling.projectID, source: "host" })
  // Reopening retained publication must not depend on the original file still existing.
  yield* fsys.remove(path.join(directory, "task-evidence.txt"))
  const requests: { url: string; directory: string | null; status: number }[] = []
  const handler = yield* Effect.acquireRelease(Effect.sync(() => HttpApiApp.webHandler()), (handler) => Effect.promise(() => handler.dispose()))
  const client = Orchestra.make({ baseUrl: "http://localhost", headers: { "x-orchestra-directory": directory },
    fetch: Object.assign(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init)
      const response = await handler.handler(request, HttpApiApp.context)
      requests.push({ url: request.url, directory: request.headers.get("x-orchestra-directory"), status: response.status })
      return response
    }, { preconnect: fetch.preconnect }),
  })
  const artifact = metadata.workResult.documents[0]
  if (!artifact) throw new Error("Parent Task result omitted admitted document")
  const fetched = yield* Effect.promise(() => client.research.artifact({ sessionID: child.id, artifactID: artifact.artifact.id, revision: artifact.artifact.revision }))
  const generated = Schema.decodeUnknownSync(Research.ArtifactPage)(fetched)
  const siblingError = yield* Effect.promise(() => client.research.artifact({ sessionID: sibling.id, artifactID: artifact.artifact.id, revision: artifact.artifact.revision }).then(
    () => { throw new Error("Sibling native placement unexpectedly read Task document") },
    (error: unknown) => Schema.decodeUnknownSync(Schema.Struct({ _tag: Schema.Literal("ResearchArtifactNotFoundError"), message: Schema.String }))(error),
  ))
  const providerRequests = (yield* remote.hits).map((hit) => {
    const request = Schema.decodeUnknownSync(Schema.Struct({ model: Schema.String, stream: Schema.Boolean,
      messages: Schema.Array(Schema.Struct({ role: Schema.String, content: Schema.Unknown })),
      tools: Schema.Array(Schema.Struct({ function: Schema.Struct({ name: Schema.String }) })),
    }))(hit.body)
    return { path: hit.url.pathname, model: request.model, stream: request.stream, tools: request.tools.map((tool) => tool.function.name),
      toolResponses: request.messages.flatMap((message) => message.role === "tool" && typeof message.content === "string" ? [message.content] : []) }
  })
  const childFinal = childHistory.find((message) => message.info.id === metadata.workResult.card.messageID)
  if (!childFinal) throw new Error("Parent Task result does not identify a persisted child final message")
  return { parentID: parent.id, childID: child.id, siblingID: sibling.id, childParentID: child.parentID, siblingTaskID: siblingTask.taskId, metadata,
    source: state.source, finding: state.finding, document: state.document, page: state.page, card,
    generated, generatedDigest: createHash("sha256").update(generated.text, "utf8").digest("hex"), siblingError, requests, providerURL: remote.url, providerRequests,
    pending: yield* remote.pending,
    childFinal: childFinal.parts.flatMap((part) => part.type === "text" ? [part.text] : []).join(""),
    parentFinal: final.parts.flatMap((part) => part.type === "text" ? [part.text] : []).join(""),
    calls: childHistory.flatMap((message) => message.parts).flatMap((part) => part.type === "tool" ? [{ tool: part.tool, status: part.state.status }] : []),
  }
})

const result = await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
  // Match the native handler's memoMap, including database/projector and event identity.
  const scope = yield* Effect.scope
  const services = yield* Layer.buildWithMemoMap(layer, memoMap, scope)
  return yield* proof.pipe(Effect.provide(services))
})))
// The marker line now carries several inquiry turns; wait for the pipe to take all of it before the runtime may exit.
await new Promise<void>((resolve, reject) =>
  process.stdout.write(`PACKAGED_RESEARCH=${JSON.stringify(result)}\n`, (error) => error ? reject(error) : resolve()))
