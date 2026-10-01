import { describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import type { SessionV1 } from "@opencode-ai/core/v1/session"
import { Model } from "@opencode-ai/schema/model"
import { Provider } from "@opencode-ai/schema/provider"
import { decode, estimateCitation, estimateExact } from "@/continuity/artifact"
import { request, snapshot } from "@/continuity/fork"
import { catalogue } from "@/continuity/source"
import type { HandoffBody, MaterializedArtifact } from "@/continuity/types"
import { MessageID, PartID, SessionID } from "@/session/schema"
import { readEnvelope, readExactFrames, readSourceCatalogue, selectSource } from "./fixtures"

const parentID = SessionID.make("ses_wire")
const producerID = SessionID.make("ses_wire_producer")
const domainDigest = "sha256:" + "a1".repeat(32)
const dataset = { digest: "payload-digest", sha256: "payload-sha256", checksum: "payload-checksum",
  hash: "payload-hash", domainDigest, nested: [{ digest: "nested-digest" }] }
const constraint = `Never deploy except approved local rehearsal. digest=${domainDigest}\r\n😀\u0000`
const code = `const dataset = ${JSON.stringify(dataset)};\r\n// digest sha256 checksum hash stay exact`

function user(text: string, index: number): SessionV1.WithParts {
  const id = MessageID.make(`msg_wire_${index}`)
  return { info: { id, sessionID: parentID, role: "user", agent: "worker", time: { created: index },
    model: { providerID: Provider.ID.make("provider"), modelID: Model.ID.make("model") } },
    parts: [{ id: PartID.make(`prt_wire_${index}`), messageID: id, sessionID: parentID, type: "text", text }] }
}

function packet(previous?: MaterializedArtifact) {
  const observation: SessionV1.WithParts = {
    info: { id: MessageID.make("msg_wire_tool"), sessionID: parentID, role: "assistant",
      parentID: MessageID.make("msg_wire_0"), modelID: Model.ID.make("model"), providerID: Provider.ID.make("provider"),
      mode: "worker", agent: "hash-reader", path: { cwd: "/local", root: "/local" }, time: { created: 2 }, cost: 0,
      tokens: { input: 1, output: 1, reasoning: 0, cache: { read: 0, write: 0 } } },
    parts: [{ id: PartID.make("prt_wire_tool"), messageID: MessageID.make("msg_wire_tool"), sessionID: parentID,
      type: "tool", tool: "read", callID: "call-wire", state: { status: "completed", input: { dataset },
        output: JSON.stringify({ dataset }), title: "hashes", metadata: { exit: 0, truncated: false },
        time: { start: 1, end: 2 } } }],
  }
  const history = previous ? [user("next", 3), ...Array.from({ length: 8 }, (_, i) => user(`tail-${i}`, i + 4))]
    : [user(constraint, 0), user(code, 1), observation, ...Array.from({ length: 8 }, (_, i) => user(`tail-${i}`, i + 3))]
  const captured = snapshot(parentID, history, previous, true)
  if (!captured) throw new Error("Missing wire snapshot")
  const sources = catalogue({ parentID, head: captured.head, previous: captured.previous, canRecall: true })
  return { sources, raw: request(captured, sources, producerID).messages[0].content }
}

function materialize(raw: string, sources: ReturnType<typeof catalogue>, body: HandoffBody) {
  const result = decode({ text: JSON.stringify(body), catalogue: sources, envelope: readEnvelope(raw), maxTokens: 6000 })
  if (!result.ok) throw new Error(result.reason)
  return result.artifact
}

describe("continuity source wire digest boundary", () => {
  test("omits only host unit digest; payload hash fields and all cost hints survive", () => {
    const current = packet()
    const before = structuredClone(current.sources)
    const wire = readSourceCatalogue(current.raw)
    expect(wire.units).toEqual(current.sources.units.map(({ digest, ...unit }) => unit))
    for (const unit of current.sources.units) {
      expect(unit.digest).toMatch(/^[a-f0-9]{64}$/)
      expect(unit.digest).not.toBe(domainDigest)
      expect(wire.units.find((entry) => entry.id === unit.id)).not.toHaveProperty("digest")
      expect(wire.exactTokens[unit.id]).toBe(estimateExact(unit))
      expect(wire.citationTokens[unit.id]).toBe(estimateCitation(unit))
    }
    const wrapper = wire.units.find((unit) => unit.role === "tool" && unit.locator.path.length === 0)
    expect(wrapper?.value).toMatchObject({ state: { input: { dataset }, output: JSON.stringify({ dataset }) } })
    expect(selectSource(wire.units.filter((unit) => unit.locator.path[1] === "output"), "payload-digest").value).toBe("payload-digest")
    expect(selectSource(wire.units.filter((unit) => unit.locator.path[1] === "output"), domainDigest).value).toBe(domainDigest)
    expect(current.sources).toEqual(before)
    const broken = JSON.parse(current.raw)
    broken.source.groups[0].units[0].digest = current.sources.units[0].digest
    expect(() => readSourceCatalogue(broken)).toThrow('Unrecognized key: \\"digest\\"')
  })

  test("wire selectors materialize original domain hashes and code with full host provenance", () => {
    const current = packet()
    const wire = readSourceCatalogue(current.raw)
    const selected = [selectSource(wire.units, constraint), selectSource(wire.units, code),
      wire.units.find((unit) => unit.role === "tool" && unit.locator.path.length === 0)!,
      selectSource(wire.units.filter((unit) => unit.locator.path[1] === "output"), domainDigest)]
    const artifact = materialize(current.raw, current.sources, { status: "ready",
      exact: selected.map((unit) => ({ source: unit.id, reason: unit.role === "user" ? "constraint" : "identifier" })),
      notes: [], reference_only: [], omissions: [], issues: [] })
    const frames = readExactFrames(artifact.text)
    expect(frames).toHaveLength(selected.length)
    for (const selectedUnit of selected) {
      const host = current.sources.units.find((unit) => unit.id === selectedUnit.id)!
      const frame = frames.find((entry) => entry.source === host.id)!
      const { value, ...descriptor } = host
      if (value === undefined) throw new Error("Fixture selection requires a supplied source value")
      expect(frame.value).toEqual(value)
      expect(frame.provenance).toEqual(descriptor)
      expect(artifact.sources.find((unit) => unit.id === host.id)).toEqual(descriptor)
      if (typeof value === "string") expect(Buffer.from(String(frame.value))).toEqual(Buffer.from(value))
    }
    expect(frames.find((entry) => entry.source === selected[3].id)?.provenance.digest)
      .toBe(createHash("sha256").update(JSON.stringify(domainDigest)).digest("hex"))
    const broken = artifact.text.split("\n").map((line) => {
      if (!line.startsWith('{"frame":"continuity_exact_v1"')) return line
      const frame = JSON.parse(line)
      delete frame.provenance.digest
      return JSON.stringify(frame)
    }).join("\n")
    expect(() => readExactFrames(broken)).toThrow()
  })

  test("protected prior values carry without wire control hashes; unsupplied prior values stay absent", () => {
    const initial = packet()
    const wire = readSourceCatalogue(initial.raw)
    const selected = selectSource(wire.units, constraint)
    const observed = wire.units.find((unit) => unit.role === "tool" && unit.locator.path.length === 0)!
    const previous = materialize(initial.raw, initial.sources, { status: "ready",
      exact: [{ source: selected.id, reason: "constraint" }], notes: [{ kind: "work", state: "unknown",
        text: "Captured hashes.", actor: observed.actor, scope: observed.scope, sources: [observed.id] }],
      reference_only: [], omissions: [], issues: [] })
    const current = packet(previous)
    const priorWire = readSourceCatalogue(current.raw)
    expect(selectSource(priorWire.units, constraint)).toMatchObject({ id: selected.id, origin: "prior", value: constraint })
    expect(priorWire.units.find((unit) => unit.id === observed.id)).not.toHaveProperty("value")
    expect(priorWire.exactTokens[observed.id]).toBeNull()
    expect(priorWire.units).toEqual(current.sources.units.map(({ digest, ...unit }) => unit))
    const carried = materialize(current.raw, current.sources, { ...previous.body, notes: [] })
    expect(carried.exact).toEqual(previous.exact)
    const { origin, ...priorProvenance } = readExactFrames(carried.text)[0].provenance
    const { origin: oldOrigin, ...originalProvenance } = readExactFrames(previous.text)[0].provenance
    expect(origin).toBe("prior")
    expect(oldOrigin).toBe("head")
    expect(priorProvenance).toEqual(originalProvenance)
    expect(Buffer.from(String(carried.exact[0].value))).toEqual(Buffer.from(constraint))
    expect(decode({ text: JSON.stringify({ ...previous.body, exact: [] }), catalogue: current.sources,
      envelope: readEnvelope(current.raw), maxTokens: 6000 })).toEqual({ ok: false, reason: "needs_context" })
  })
})
