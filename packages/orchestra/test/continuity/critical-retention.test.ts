import { expect, test } from "bun:test"
import { decode } from "@/continuity/memory"
import { completeSnapshot } from "@/continuity/fork"
import { readStored, writeStored } from "@/continuity/archive-format"
import { create } from "@/continuity/context"
import { hasArtifact } from "@/continuity/model"
import { seal, validReview } from "@/continuity/review-seal"
import { PartID } from "@/session/schema"
import { captured, host, messages, model, producerID } from "./memory-fixture"

function scenario() {
  const history = messages(["user", "assistant"])
  const part = history[0].parts[0]
  if (part.type !== "text") throw new Error("Expected original text")
  part.text = "Keep deployment read-only. Release code ORCHID-QUALITY-8C71. Exact failure: exit 75: stale receipt."
  history[1].parts.push({ id: PartID.ascending(), sessionID: history[1].info.sessionID, messageID: history[1].info.id,
    type: "tool", tool: "bash", callID: "failed-receipt", state: { status: "completed", input: { command: "verify-receipt" },
      output: "exit 75: stale receipt", title: "Receipt check", metadata: { exit: 75 }, time: { start: 1, end: 2 } } })
  const snapshot = completeSnapshot(history[0].info.sessionID, history)
  if (!snapshot) throw new Error("Expected complete snapshot")
  return { history, snapshot, host: host(history) }
}

test("complete coverage cannot silently discard unlocated rules, values or errors; exact correction succeeds", () => {
  const value = scenario()
  for (const fields of [
    { section: "rules", field: "quote", valid: "Keep deployment read-only.", fields: { kind: "must_not", rule: "No deployment", quote: "UNLOCATED" } },
    { section: "values", field: "value", valid: "ORCHID-QUALITY-8C71", fields: { name: "release code", value: "UNLOCATED" } },
    { section: "failures", field: "error", valid: "exit 75: stale receipt", fields: { tried: "receipt check", cause: "stale receipt", lesson: "Verify receipt before continuing", error: "UNLOCATED" } },
  ]) {
    const produce = (exact: string) => decode({ text: JSON.stringify({ now: { doing: "Recorded receipt", next: "Await owner", src: ["a1"] },
      ops: [{ op: "add", section: fields.section, src: ["u1"], fields: { ...fields.fields, [fields.field]: exact } }] }),
      snapshot: value.snapshot, host: value.host, producerID, budget: model.limit.context })
    expect(produce("UNLOCATED")).toMatchObject({ check: "C17" })
    const corrected = produce(fields.valid)
    if (!("artifact" in corrected)) throw new Error(JSON.stringify(corrected))
    expect(corrected.dropped).toBe(0)
    expect(corrected.artifact.items).toHaveLength(1)
    expect(corrected.artifact.items[0].fields[fields.field]).toBe(fields.valid)
  }
})

test("partial v4 retains its per-operation drop compatibility", () => {
  const snapshot = captured()
  const result = decode({ text: JSON.stringify({ ops: [{ op: "add", section: "values", src: ["u1"],
    fields: { name: "unverified", value: "NOT_IN_THE_SOURCE" } }] }), snapshot, host: host(), producerID, budget: model.limit.context })
  if (!("artifact" in result)) throw new Error(JSON.stringify(result))
  expect(result.artifact.version).toBe(4)
  expect(result.artifact.items).toEqual([])
  expect(result.dropped).toBe(1)
})

test("unlocated revocation cannot pass complete coverage silently while preserving old protected rule", () => {
  const value = scenario()
  const initial = decode({ text: JSON.stringify({ now: { doing: "Read-only work", next: "Wait", src: ["a1"] }, ops: [
    { op: "add", section: "rules", src: ["u1"], fields: { kind: "must_not", rule: "No deployment", quote: "Keep deployment read-only." } },
  ] }), snapshot: value.snapshot, host: value.host, producerID, budget: model.limit.context })
  if (!("artifact" in initial)) throw new Error(JSON.stringify(initial))
  const extension = messages().slice(2, 4)
  const text = extension[0].parts[0]
  if (text.type !== "text") throw new Error("Expected new user")
  text.text = "Keep working on docs only."
  const history = [...value.history, ...extension]
  const snapshot = completeSnapshot(value.snapshot.sessionID, history, initial.artifact)
  if (!snapshot) throw new Error("Expected incremental snapshot")
  const result = decode({ text: JSON.stringify({ now: { doing: "Docs", next: "Wait", src: ["a2"] }, ops: [
    { op: "retire", id: initial.artifact.items[0].id, reason: "Owner revoked restriction", src: ["u2"], quote: "Deployment now authorized." },
  ] }), snapshot, host: host(history), producerID, budget: model.limit.context })
  expect(result).toMatchObject({ check: "C17" })
  expect(initial.artifact.items[0].fields.quote).toBe("Keep deployment read-only.")
})

test("review seal survives cold persistence and invalidates changed cursor, item, text and critical registry", () => {
  const value = scenario()
  const decoded = decode({ text: JSON.stringify({ now: { doing: "Deliverable complete", next: "Wait for owner", src: ["a1"] }, ops: [
    { op: "add", section: "values", src: ["u1"], fields: { name: "release code", value: "ORCHID-QUALITY-8C71" } },
  ] }), snapshot: value.snapshot, host: value.host, producerID, budget: model.limit.context })
  if (!("artifact" in decoded) || decoded.artifact.version !== 5) throw new Error("Expected v5")
  const artifact = { ...decoded.artifact, review: seal(decoded.artifact, { state: "closed", next: "wait-user", critical: ["m1"] }) }
  const context = { sessionID: artifact.parentID, boundary: artifact.boundary, text: artifact.text, artifact }
  expect(validReview(artifact)).toBe(true)
  const cold = readStored(writeStored(artifact.parentID, { context, masks: [] }), artifact.parentID)
  expect(cold.context?.artifact).toEqual(artifact)
  const contexts = create()
  contexts.set(context)
  expect(contexts.prepare(artifact.parentID, value.history).system[0]).toBe(artifact.text)
  for (const mutation of [
    { ...artifact, now: { ...artifact.now, next: "Repeat completed work" } },
    { ...artifact, items: artifact.items.map((item) => ({ ...item, fields: { ...item.fields, value: "FORGED" } })) },
    { ...artifact, text: artifact.text + " FORGED" },
    { ...artifact, review: { ...artifact.review, critical: ["m999"] } },
    { ...artifact, review: { ...artifact.review, critical: ["m1", "m1"] } },
    { ...artifact, review: { ...artifact.review, state: "closed" as const, next: "continue" as const } },
    { ...artifact, review: { ...artifact.review, digest: "0".repeat(64) } },
  ]) {
    expect(validReview(mutation)).toBe(false)
    expect(hasArtifact({ ...context, text: mutation.text, artifact: mutation })).toBe(false)
    expect(() => readStored(writeStored(artifact.parentID, { context: { ...context, text: mutation.text, artifact: mutation }, masks: [] }), artifact.parentID))
      .toThrow("archive-corrupt-memory")
  }
  expect(readStored(writeStored(artifact.parentID, { context: { ...context, artifact: decoded.artifact }, masks: [] }), artifact.parentID).context?.artifact.version).toBe(5)
})
