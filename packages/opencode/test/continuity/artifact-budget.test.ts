import { describe, expect, test } from "bun:test"
import type { SessionV1 } from "@opencode-ai/core/v1/session"
import { Effect, Stream } from "effect"
import type { LLMEvent } from "@opencode-ai/llm"
import type { LLM } from "@/session/llm"
import { Model } from "@opencode-ai/schema/model"
import { Provider } from "@opencode-ai/schema/provider"
import { decode, estimateCitation, estimateExact, estimateHostBase, jsonSchema, render } from "@/continuity/artifact"
import { MAX_ARTIFACT_TOKENS, request, snapshot } from "@/continuity/fork"
import { catalogue } from "@/continuity/source"
import { pricing } from "@/continuity/render"
import type { JsonValue, MaterializedArtifact, SourceCatalogue, SourceUnit } from "@/continuity/types"
import { MessageID, PartID, SessionID } from "@/session/schema"
import { Token } from "@/util/token"
import { body, envelope, note, parentID, prior, run, source } from "./artifact-fixture"
import { readExactFrames, readHostHeader, readerDescriptor, readRenderedSources, readSourceCatalogue } from "./fixtures"
import PROMPT from "@/continuity/prompt.txt"

function emptyProjection(): MaterializedArtifact {
  return { envelope, body: body({ exact: [] }), exact: [], sources: [], text: "" }
}

function fixtureCatalogue(units: SourceUnit[]): SourceCatalogue {
  return { parentID, units, previous: null, canRecall: true }
}

function user(index: number): SessionV1.WithParts {
  const id = MessageID.make(`msg_budget_${index}`)
  return { info: { id, sessionID: parentID, role: "user", agent: "worker", time: { created: index },
    model: { providerID: Provider.ID.make("provider"), modelID: Model.ID.make("model") } },
    parts: [{ id: PartID.make(`prt_budget_${index}`), messageID: id, sessionID: parentID,
      type: "text", text: "Keep full qualifiers.\r\n😀\u2028\u2029".repeat(200) }] }
}

function packet() {
  const head = user(0)
  head.parts.push({ id: PartID.make("prt_budget_tool"), messageID: head.info.id, sessionID: parentID,
    type: "tool", tool: "shell", callID: "call-budget", state: { status: "completed", input: {},
      output: '{"anchor":"Case_AbC/001","count":42}', title: "observed", metadata: {}, time: { start: 0, end: 1 } } })
  const captured = snapshot(parentID, [head, ...Array.from({ length: 8 }, (_, index) => user(index + 1))])
  if (!captured) throw new Error("Missing budget snapshot")
  const sources = catalogue({ parentID, head: captured.head, canRecall: true })
  return { captured, sources, prepared: request(captured, sources, envelope.producerID) }
}

describe("continuity producer budget feedback", () => {
  test("exact hint measures reusable closed frame, full payload, selector and provenance once", () => {
    for (const value of ["literal\r\n😀\u2028\u2029\u0000".repeat(500),
      { nested: ["漢字\u2028", false, null, 9007199254740991] }] satisfies JsonValue[]) {
      const unit = source({ id: "S001", kind: typeof value === "string" ? "text" : "json", value,
        actor: "actor/".repeat(100), scope: "scope/".repeat(100) })
      const result = run(body({ exact: [{ source: unit.id, reason: "identifier" }] }), fixtureCatalogue([unit]), 100000)
      if (!result.ok) throw new Error(result.reason)
      const frames = readExactFrames(result.artifact.text)
      expect(frames).toHaveLength(1)
      expect(frames[0].value).toEqual(value)
      expect(frames[0].provenance).toEqual(readerDescriptor(result.artifact.sources[0]))
      if (typeof value === "string") expect(Buffer.from(String(frames[0].value))).toEqual(Buffer.from(value))
      const frameLine = result.artifact.text.split("\n").find((line) => line.startsWith('{"frame":"continuity_exact_v4"'))!
      expect(frameLine.includes("\u2028")).toBe(false)
      expect(frameLine.includes("\u2029")).toBe(false)
      const selector = JSON.stringify(result.artifact.body.exact[0])
      const hint = estimateExact(unit)
      expect(hint!).toBeGreaterThanOrEqual(Token.estimate(frameLine + "\n") + 2)
      expect(hint!).toBeGreaterThan(Token.estimate(selector))
      expect(hint!).toBeGreaterThan(estimateExact({ ...unit, actor: null, scope: null })!)
      const actualAdded = Token.estimate(result.artifact.text) - estimateHostBase(envelope)
      expect(hint! - actualAdded).toBeGreaterThanOrEqual(0)
      expect(result.artifact.sources[0].digest).toBe(unit.digest)
      expect(result.artifact.text.split(unit.digest)).toHaveLength(1)
    }
  })

  test("exact hints match decoder eligibility; preview never relaxes full user constraints", () => {
    const missing = source()
    delete missing.value
    const inherited = Object.assign(Object.create({ value: "inherited" }), missing)
    for (const unit of [missing, inherited, source({ value: "" }), source({ value: " \r\n" }),
      source({ value: null }), source({ kind: "json", value: Infinity }),
      source({ kind: "json", value: { n: Number.MAX_SAFE_INTEGER + 1 } }),
      ...(["unknown", "cleared", "unavailable"] as const).map((extent) => source({ extent }))]) {
      expect(estimateExact(unit)).toBeNull()
      expect(run(body({ exact: [{ source: unit.id, reason: "evidence" }] }), fixtureCatalogue([unit])))
        .toEqual({ ok: false, reason: "missing_source" })
    }
    for (const value of [null, false, 0, {}] satisfies JsonValue[]) {
      const unit = source({ kind: "json", value })
      expect(estimateExact(unit)).toBeGreaterThan(0)
      expect(run(body({ exact: [{ source: unit.id, reason: "identifier" }] }), fixtureCatalogue([unit])).ok).toBe(true)
    }
    for (const role of ["user", "assistant", "tool"] as const) {
      const preview = source({ role, extent: "preview" })
      expect(estimateExact(preview)).toBeGreaterThan(0)
      for (const reason of ["identifier", "evidence"] as const)
        expect(run(body({ exact: [{ source: preview.id, reason }] }), fixtureCatalogue([preview])).ok).toBe(true)
      expect(run(body(), fixtureCatalogue([preview]))).toEqual({ ok: false, reason: "missing_source" })
      expect(run(body(), fixtureCatalogue([source({ role })])))
        .toMatchObject(role === "user" ? { ok: true } : { ok: false, reason: "untrusted_constraint" })
    }
  })

  test("citation hint conservatively prices dictionary metadata and possible retrieval; payload is excluded", () => {
    for (const extent of ["full", "preview", "unknown", "cleared", "unavailable"] as const) {
      const unit = source({ id: "S001", extent, actor: "actor\r\n😀\u2028", scope: "scope/".repeat(100),
        locator: { ...source().locator, path: ["state", "output", "漢字", 42] }, exit: 75 })
      if (extent === "unavailable") delete unit.value
      const result = run(body({ exact: [], notes: [note({ sources: [unit.id] })] }), fixtureCatalogue([unit]))
      if (!result.ok) throw new Error(result.reason)
      const lines = result.artifact.text.split("\n").filter((line) => line.startsWith('{"source":'))
      expect(lines).toHaveLength(1)
      expect(readRenderedSources(result.artifact.text)).toEqual(result.artifact.sources.map(readerDescriptor))
      expect(JSON.parse(lines[0]).provenance).toHaveLength(11)
      const added = Token.estimate(result.artifact.text) - estimateHostBase(envelope) - Token.estimate(JSON.stringify(result.artifact.body.notes))
      expect(estimateCitation(unit)).toBeGreaterThanOrEqual(added)
      expect(estimateCitation(unit)).toBeGreaterThan(estimateCitation({ ...unit, actor: null, scope: null }))
      expect(estimateCitation({ ...unit, value: "uncounted payload".repeat(1000) })).toBe(estimateCitation(unit))
    }
  })

  test("shared exact/note/reference citations retain one full descriptor per active ID", () => {
    const cat = fixtureCatalogue([source({ id: "S001", role: "tool" }),
      source({ id: "S002", role: "assistant", order: 2 }), source({ id: "S003", role: "tool", order: 3 }),
      source({ id: "S004", order: 4, value: "uncited" })])
    const selected = body({ exact: [{ source: "S001", reason: "evidence" }],
      notes: [note({ sources: ["S001", "S002", "S003"] }), note({ sources: ["S001", "S002"] })],
      reference_only: ["S001", "S003"].map((source) => ({ source, purpose: "detail", retrieve_when: "debugging" })) })
    const result = run(selected, cat)
    if (!result.ok) throw new Error(result.reason)
    expect(result.artifact.body).toEqual(selected)
    expect(result.artifact.sources.map((entry) => entry.id)).toEqual(["S001", "S002", "S003"])
    const descriptors = result.artifact.text.split("\n").filter((line) => line.startsWith('{"source":')).map((line) => JSON.parse(line))
    expect(descriptors.map((entry) => entry.source)).toEqual(["S002", "S003"])
    const nonExact = [...new Set([...selected.notes.flatMap((entry) => entry.sources),
      ...selected.reference_only.map((entry) => entry.source)])]
      .filter((id) => !selected.exact.some((entry) => entry.source === id))
    expect(nonExact).toEqual(["S002", "S003"])
    const costs = nonExact.map((id) => estimateCitation(cat.units.find((unit) => unit.id === id)!))
    expect(costs.reduce((sum, cost) => sum + cost, 0)).toBeGreaterThanOrEqual(descriptors.reduce((sum, entry) =>
      sum + Token.estimate(JSON.stringify(entry) + "\n"), 0))
    expect(costs.reduce((sum, cost) => sum + cost, 0)).toBeLessThan(
      cat.units.slice(0, 3).reduce((sum, unit) => sum + estimateCitation(unit), 0))
    const frames = readExactFrames(result.artifact.text)
    const lookup = new Map(readRenderedSources(result.artifact.text).map((entry) => [entry.id, entry]))
    expect(lookup.size).toBe(3)
    for (const entry of result.artifact.sources) {
      expect(lookup.get(entry.id)).toEqual(readerDescriptor(entry))
      expect(readRenderedSources(result.artifact.text).filter((source) => source.id === entry.id)).toHaveLength(1)
    }
    const duplicate = descriptors.length ? result.artifact.text + "\n" + JSON.stringify(frames[0].provenance) : ""
    expect(Token.estimate(duplicate)).toBeGreaterThan(Token.estimate(result.artifact.text))
  })

  test("request uses actual envelope for fixed cost; empty diagnostic projection never passes decoder", () => {
    const current = packet()
    for (const producerID of [envelope.producerID, SessionID.make("ses_" + "long-identity".repeat(100))]) {
      const raw = request(current.captured, current.sources, producerID).messages[0].content
      const parsed = readSourceCatalogue(raw)
      const wire = JSON.parse(raw)
      const empty = { ...emptyProjection(), envelope: wire.envelope }
      expect(parsed.budget).toEqual({ maxTokens: 6000, fixedTokens: Token.estimate(render(empty)) + pricing(current.sources.units).sharedTokens })
      expect(parsed.budget.fixedTokens).toBe(estimateHostBase(wire.envelope) + pricing(current.sources.units).sharedTokens)
      expect(readHostHeader(render(empty)).producer_id).toBe(producerID)
      expect(decode({ text: JSON.stringify(empty.body), catalogue: current.sources,
        envelope: wire.envelope, maxTokens: 6000 })).toEqual({ ok: false, reason: "empty_handoff" })
    }
  })

  test("combined forecast reserves variable reference text as well as notes, exact and citation metadata", () => {
    const cat = fixtureCatalogue([source({ id: "S001" }), source({ id: "S002", role: "tool", order: 2 })])
    const selected = body({ exact: [{ source: "S001", reason: "constraint" }], notes: [note({ sources: ["S002"] })],
      reference_only: [{ source: "S002", purpose: "original record ".repeat(30), retrieve_when: "debugging original bytes ".repeat(30) }] })
    const result = run(selected, cat, 6000)
    if (!result.ok) throw new Error(result.reason)
    const forecast = estimateHostBase(envelope) + estimateExact(cat.units[0])! + estimateCitation(cat.units[1]) +
      Token.estimate(JSON.stringify(selected.notes) + JSON.stringify(selected.reference_only))
    expect(forecast).toBeGreaterThanOrEqual(Token.estimate(result.artifact.text))
    expect(Token.estimate(result.artifact.text)).toBeLessThanOrEqual(6000)
  })

  test("strict grouped parser accepts every cost field; missing, unsafe or extra cost fields fail", () => {
    const current = packet()
    const parsed = readSourceCatalogue(current.prepared.messages[0].content)
    expect(parsed.units).toEqual(current.sources.units.map(({ digest, ...unit }) => unit))
    for (const unit of current.sources.units) {
      expect(parsed.exactTokens[unit.id]).toBe(estimateExact(unit, pricing(current.sources.units)))
      expect(parsed.citationTokens[unit.id]).toBe(estimateCitation(unit, pricing(current.sources.units)))
    }
    const wrapper = current.sources.units.find((unit) => unit.role === "tool" && unit.locator.path.length === 0)!
    expect(parsed.exactTokens[wrapper.id]).toBeNull()
    expect(parsed.citationTokens[wrapper.id]).toBeGreaterThan(0)
    expect(parsed.exactTokens.S001).toBeGreaterThan(1000)
    const scalar = current.sources.units.find((unit) => unit.value === "Case_AbC/001")!
    expect(parsed.exactTokens[scalar.id]).toBeGreaterThan(0)
    const grounded = run(body({ exact: [{ source: scalar.id, reason: "identifier" }],
      notes: [note({ sources: [wrapper.id], text: "Captured response has unknown original extent." })] }), current.sources)
    expect(grounded.ok).toBe(true)
    for (const change of [
      (unit: Record<string, unknown>) => { delete unit.exactTokens },
      (unit: Record<string, unknown>) => { unit.exactTokens = -1 },
      (unit: Record<string, unknown>) => { unit.exactTokens = 1.5 },
      (unit: Record<string, unknown>) => { delete unit.citationTokens },
      ...[null, "1", 0, -1, 1.5, {}, true].map((value) =>
        (unit: Record<string, unknown>) => { unit.citationTokens = value }),
      (unit: Record<string, unknown>) => { unit.estimatedTokens = 1 },
    ]) {
      const wire = JSON.parse(current.prepared.messages[0].content)
      change(wire.source.groups[0].units[0])
      expect(() => readSourceCatalogue(wire)).toThrow()
    }
  })

  for (const canRecall of [false, true]) test(`real fork appends host snapshot rules for receiver.canRecall:${canRecall}`, async () => {
    const { run } = await import("@/continuity/fork")
    const captured = { ...packet().captured, canRecall }
    const model: import("@/provider/provider").Model = {
      id: Model.ID.make("model"), providerID: Provider.ID.make("provider"), name: "Pure capture model",
      api: { id: "model", url: "https://example.invalid", npm: "@ai-sdk/openai-compatible" },
      capabilities: { toolcall: true, attachment: false, reasoning: false, temperature: true, interleaved: false,
        input: { text: true, image: false, audio: false, video: false, pdf: false },
        output: { text: true, image: false, audio: false, video: false, pdf: false } },
      cost: { input: 0, output: 0, cache: { read: 0, write: 0 } }, limit: { context: 200000, output: 10000 },
      status: "active", options: {}, headers: {}, release_date: "2026-01-01",
    }
    const requests: LLM.StreamInput[] = []
    const unexpected = () => Effect.die(new Error("Unexpected provider call; pure capture only"))
    const result = await Effect.runPromise(run(captured, {
      provider: { getModel: (providerID, modelID) => {
        expect(providerID).toBe(model.providerID)
        expect(modelID).toBe(model.id)
        return Effect.succeed(model)
      }, list: unexpected, getProvider: unexpected, getLanguage: unexpected,
      closest: unexpected, getSmallModel: unexpected, defaultModel: unexpected },
      llm: { stream: (request) => {
        requests.push(request)
        const events: LLMEvent[] = [{ type: "text-delta", id: "pure", text: JSON.stringify(body({
          exact: [{ source: "S001", reason: "constraint" }],
          reference_only: canRecall ? [{ source: "S001", purpose: "detail", retrieve_when: "debugging" }] : [],
        })) }, { type: "finish", reason: "stop" }]
        return Stream.fromIterable(events)
      } },
    }))
    expect(requests).toHaveLength(1)
    expect(result?.body.status).toBe("ready")
    const request = requests[0]
    const prefix = PROMPT + `\nV1 BODY SCHEMA (host-owned):\n${JSON.stringify(jsonSchema)}`
    expect(request.agent.prompt?.startsWith(prefix)).toBe(true)
    const suffix = request.agent.prompt!.slice(prefix.length)
    expect(suffix.startsWith("\nHOST SNAPSHOT RULES (host-owned; current runtime):\n")).toBe(true)
    expect(suffix).toContain(`receiver.canRecall:${canRecall}\n`)
    const noRecall = "reference_only MUST be []; this parent has no operational retrieval route. Preserve necessary supplied facts in exact or grounded notes; do not claim unsupported recovery."
    if (!canRecall) expect(suffix).toContain(noRecall)
    if (canRecall) {
      expect(suffix).not.toContain(noRecall)
      expect(suffix).toContain("reference_only requires receiver.canRecall:true AND each referenced unit.recoverable:true.")
    }
    expect(suffix).toContain("ready MUST have issues:[]; nonempty issues require status:needs_context. Unknown task facts are notes, not ready issues. exact reason only constraint/identifier/evidence.")
    expect(suffix).toContain("fixed + exact(sum selected) + citation(sum unique active NOT exact) + notesJSON")
    expect(suffix).toContain("Actual rendered budget maximum: 6000 tokens.")
    expect(request.system).toEqual([])
    expect(request.tools).toEqual({})
    expect(request.toolChoice).toBe("none")
    expect(request.purpose).toBe("context-maintenance")
    const parent = captured.tail[0].info
    if (parent.role !== "user") throw new Error("Fixture requires a user tail anchor")
    expect(request.user.model).toEqual(parent.model)
    const payload = JSON.parse(String(request.messages[0].content))
    expect(payload.receiver.canRecall).toBe(canRecall)
    expect(payload.source.canRecall).toBe(canRecall)
    expect(payload.source.groups.flatMap((group: { units: { recoverable: boolean }[] }) => group.units)
      .every((unit: { recoverable: boolean }) => unit.recoverable === canRecall)).toBe(true)
    expect(JSON.stringify(payload.source)).not.toContain("HOST SNAPSHOT RULES")
  })

  test("hints exclude notes/extra descriptors; final 6000 guard still rejects protected overage", () => {
    expect(MAX_ARTIFACT_TOKENS).toBe(6000)
    const unit = source({ value: "protected byte string ".repeat(1400) })
    const cat = prior({ value: unit.value })
    expect(estimateExact(unit)! + estimateHostBase(envelope)).toBeGreaterThan(6000)
    expect(run(body(), cat, MAX_ARTIFACT_TOKENS)).toEqual({ ok: false, reason: "protected_over_budget" })
    expect(run(body({ exact: [], notes: [note()] }), cat, MAX_ARTIFACT_TOKENS))
      .toEqual({ ok: false, reason: "needs_context" })
    const extra = source({ id: "S02", role: "assistant", actor: "metadata/".repeat(200), order: 2 })
    const hints = estimateHostBase(envelope) + estimateExact(source())!
    expect(hints).toBeLessThan(6000)
    const oversized = body({ notes: [note({ sources: ["S01", "S02"], text: "grounded note ".repeat(2000) })] })
    expect(run(oversized, fixtureCatalogue([source(), extra]), MAX_ARTIFACT_TOKENS))
      .toEqual({ ok: false, reason: "protected_over_budget" })
    const result = run(body({ notes: [note({ sources: ["S01", "S02"] })] }), fixtureCatalogue([source(), extra]))
    if (!result.ok) throw new Error(result.reason)
    expect(Token.estimate(result.artifact.text)).toBeGreaterThan(hints)
  })
})
