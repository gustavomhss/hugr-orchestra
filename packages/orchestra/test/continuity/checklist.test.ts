import { expect, test } from "bun:test"
import { Effect, Stream } from "effect"
import { LLMEvent } from "@orchestra/llm"
import type { LLM } from "@/session/llm"
import { ContinuityChecklist } from "@/continuity/checklist"
import { sealChecklist, validChecklist } from "@/continuity/checklist-seal"
import { readStored, writeStored } from "@/continuity/archive-format"
import { create } from "@/continuity/context"
import { completeSnapshot, run } from "@/continuity/fork"
import { decode, type Op } from "@/continuity/memory"
import type { CompleteArtifact, MemoryArtifact } from "@/continuity/memory-types"
import { hasArtifact } from "@/continuity/model"
import { seal, validReview } from "@/continuity/review-seal"
import { it } from "../lib/effect"
import { artifact, host, messages, model, producerID, provider, sessionID } from "./memory-fixture"

const body = (ops: unknown[] = [], alias = "a2") => JSON.stringify({
  now: { doing: "Report delivered", next: "Wait for owner", src: [alias] }, ops,
})
const context = (artifact: MemoryArtifact) => ({ sessionID, boundary: artifact.boundary,
  tailStart: artifact.tailStart, text: artifact.text, artifact })
function cold(artifact: MemoryArtifact) {
  const stored = readStored(writeStored(sessionID, { context: context(artifact), masks: [] }), sessionID)
  if (!stored.context) throw new Error("Missing cold artifact")
  return stored.context
}

function fixture() {
  const history = messages(["user", "assistant", "user", "assistant", "user", "assistant", "user", "assistant"])
  const first = history[0].parts[0]
  const next = history[2].parts[0]
  if (first.type !== "text" || next.type !== "text") throw new Error("Expected user text")
  first.text = "Keep deployment read-only. Release code ORCHID-OLD-3C97. Deliver report."
  next.text = "Deployment now authorized. Replace release code with ORCHID-NEW-4D28. Report accepted."
  const initial = completeSnapshot(sessionID, history.slice(0, 2))
  if (!initial) throw new Error("Missing initial snapshot")
  const decoded = decode({ text: body([
    { op: "add", section: "values", src: ["u1"], fields: { name: "release code", value: "ORCHID-OLD-3C97" } },
    { op: "add", section: "findings", src: ["a1"], fields: { finding: "Receipt pending", why: "Delivery evidence", status: "hypothesis", check: "Verify receipt" } },
    { op: "add", section: "rules", src: ["u1"], fields: { kind: "must_not", rule: "No deployment", quote: "Keep deployment read-only." } },
    { op: "add", section: "objective", src: ["u1"], fields: { goal: "Deliver report", why: "Owner request", done_when: "Owner accepts" } },
    { op: "add", section: "plan", src: ["u1"], fields: { task: "Wait for owner", status: "waiting" } },
    { op: "add", section: "decisions", src: ["u1"], fields: { by: "user", decision: "No deployment", why: "Owner constraint", quote: "Keep deployment read-only." } },
    { op: "add", section: "decisions", src: ["u1"], fields: { by: "agreed", decision: "Deliver report", why: "Owner agreement", quote: "Deliver report." } },
    { op: "add", section: "decisions", src: ["a1"], fields: { by: "agent", decision: "Check receipt", why: "Evidence needed" } },
  ], "a1"), snapshot: initial, host: host(history), producerID, budget: model.limit.context })
  if ("check" in decoded || decoded.artifact.version !== 5) throw new Error(JSON.stringify(decoded))
  // An actual legacy seal is serialized and read before the new fork sees it.
  const previous = cold({ ...decoded.artifact, review: seal(decoded.artifact, { state: "active", next: "verify", critical: ["m2"] }) }).artifact
  if (previous.version !== 5) throw new Error("Missing legacy v5")
  const snapshot = completeSnapshot(sessionID, history.slice(0, 4), previous)
  if (!snapshot) throw new Error("Missing incremental snapshot")
  return { history, previous, snapshot, host: host(history) }
}

function candidate(value: ReturnType<typeof fixture>, ops: unknown[] = []) {
  const decoded = decode({ text: body(ops), snapshot: value.snapshot, host: value.host, producerID, budget: model.limit.context })
  if ("check" in decoded || decoded.artifact.version !== 5) throw new Error(JSON.stringify(decoded))
  return { ...decoded, artifact: decoded.artifact }
}

const protectedIDs = ["m1", "m2", "m3", "m4", "m6", "m7"]

test("host protects exact values, guarded items and legacy critical IDs, without promoting agent decisions or plans", () => {
  const value = fixture()
  expect(validReview(value.previous)).toBe(true)
  expect(ContinuityChecklist.protectedItems()).toEqual([])
  expect(ContinuityChecklist.protectedItems(value.previous)).toEqual(protectedIDs)
  expect(ContinuityChecklist.protectedItems({ ...value.previous, review: undefined })).toEqual(["m1", "m3", "m4", "m6", "m7"])
  const decoded = candidate(value)
  const before = structuredClone({ decoded, snapshot: value.snapshot, host: value.host })
  const checked = ContinuityChecklist.check(decoded, value.snapshot, value.host)
  if ("check" in checked || checked.artifact.version !== 5) throw new Error(JSON.stringify(checked))
  expect(checked.artifact.items).toEqual(value.previous.items)
  expect(checked.artifact.checklist?.critical).toEqual(protectedIDs)
  expect(checked.artifact.review).toBeUndefined()
  expect(validChecklist(checked.artifact)).toBe(true)
  expect({ decoded, snapshot: value.snapshot, host: value.host }).toEqual(before)
  const missing = { ...decoded, artifact: { ...decoded.artifact, items: decoded.artifact.items.filter((item) => item.id !== "m2") } }
  expect(ContinuityChecklist.check(missing, value.snapshot, value.host)).toMatchObject({ check: "C18" })
})

for (const op of [
  { op: "update", id: "m2", fields: { finding: "Receipt accepted" }, src: ["u2"] },
  { op: "retire", id: "m2", reason: "Owner accepted report", src: ["u2"] },
] satisfies Op[]) test(`C18 ${op.op} requires every source to be newly covered, even at the post-decoder boundary`, () => {
  const value = fixture()
  const decoded = candidate(value, [op])
  const good = ContinuityChecklist.check(decoded, value.snapshot, value.host)
  expect("artifact" in good).toBe(true)
  for (const src of [[], ["u1"], ["u2", "u1"], ["u999"], ["u2", "u3"], ["u2", "u999"]]) {
    const result = ContinuityChecklist.check({ ...decoded, ops: [{ ...op, src }] }, value.snapshot, value.host)
    expect(result).toMatchObject({ check: "C18", detail: expect.stringContaining("Protected m2") })
  }
  if (op.op === "retire") {
    expect(ContinuityChecklist.check({ ...decoded, ops: [{ ...op, src: undefined }] }, value.snapshot, value.host)).toMatchObject({ check: "C18" })
    expect(ContinuityChecklist.check({ ...decoded, ops: [{ ...op, reason: " \t " }] }, value.snapshot, value.host)).toMatchObject({ check: "C18" })
  }
})

test("closed decoder preserves stricter source, user-revocation and exact-quote checks before C18", () => {
  const value = fixture()
  for (const item of [
    { op: { op: "update", id: "m2", fields: { finding: "Accepted" } }, check: "C2" },
    { op: { op: "retire", id: "m2", reason: "Accepted", src: ["u999"] }, check: "C4" },
    { op: { op: "retire", id: "m2", reason: "Accepted", src: ["u3"] }, check: "C4" },
    { op: { op: "update", id: "m3", fields: { rule: "Deploy" }, src: ["u2"] }, check: "C5" },
    { op: { op: "retire", id: "m3", reason: "Revoked", src: ["a2"], quote: "Deployment now authorized." }, check: "C7" },
    { op: { op: "retire", id: "m3", reason: "Revoked", src: ["u1"], quote: "Keep deployment read-only." }, check: "C7" },
    { op: { op: "retire", id: "m3", reason: "Revoked", src: ["u2"] }, check: "C7" },
    { op: { op: "retire", id: "m3", reason: "Revoked", src: ["u2"], quote: "UNLOCATED_REVOCATION" }, check: "C17" },
    { op: { op: "retire", id: "m2", reason: " ", src: ["u2"] }, check: "C11" },
  ]) expect(decode({ text: body([item.op]), snapshot: value.snapshot, host: value.host, producerID, budget: model.limit.context }))
    .toMatchObject({ check: item.check })
  const decoded = candidate(value, [{ op: "retire", id: "m3", reason: "Owner revoked restriction", src: ["u2"], quote: "Deployment now authorized." }])
  const checked = ContinuityChecklist.check(decoded, value.snapshot, value.host)
  if ("check" in checked || checked.artifact.version !== 5) throw new Error(JSON.stringify(checked))
  expect(checked.artifact.items.some((item) => item.id === "m3")).toBe(false)
  expect(checked.artifact.checklist?.critical).toEqual(["m1", "m2", "m4", "m6", "m7"])
})

it.effect("cold legacy receipt migrates through real forks and keeps protected IDs across repeated compactions", () => Effect.gen(function* () {
  const value = fixture()
  const versions = [value.previous]
  const requests: LLM.StreamInput[] = []
  for (const end of [4, 6, 8]) {
    const previous = versions.at(-1)
    if (!previous) throw new Error("Missing prior generation")
    const snapshot = completeSnapshot(sessionID, value.history.slice(0, end), previous)
    if (!snapshot) throw new Error("Missing next snapshot")
    expect(snapshot.head.map((message) => message.info.id)).toEqual(value.history.slice(end - 2, end).map((message) => message.info.id))
    const result = yield* run(snapshot, { provider: provider(), llm: { stream: (input) => {
      requests.push(input)
      if (input.agent.name !== "continuity" || requests.length !== end / 2 - 1) throw new Error("Unexpected reviewer or correction")
      return Stream.make(LLMEvent.textDelta({ id: "text", text: body([], `a${end / 2}`) }), LLMEvent.finish({ reason: "stop" }))
    } } }, value.host)
    expect(requests).toHaveLength(end / 2 - 1)
    expect(JSON.stringify(requests.at(-1)?.messages)).toContain(`Protected item IDs: ${protectedIDs.join(", ")}`)
    expect(result.retried).toBe(false)
    if (result.artifact?.version !== 5) throw new Error("Missing migrated artifact")
    expect(result.artifact.items).toEqual(value.previous.items)
    expect(result.artifact.review).toBeUndefined()
    expect(result.artifact.checklist?.critical).toEqual(protectedIDs)
    const restored = cold(result.artifact)
    if (restored.artifact.version !== 5) throw new Error("Missing cold v5")
    expect(restored.artifact).toEqual(result.artifact)
    const projection = create()
    expect(projection.set(restored)).toBe(true)
    expect(projection.prepare(sessionID, value.history).system).toEqual([result.artifact.text])
    versions.push(restored.artifact)
  }
  expect(requests.map((request) => request.agent.name)).toEqual(["continuity", "continuity", "continuity"])
}))

for (const change of ["update", "retire"] as const)
  it.effect(`real fork corrects C18 ${change} with new evidence in one retry`, () => Effect.gen(function* () {
    const value = fixture()
    const op = change === "update" ? { op: change, id: "m2", fields: { finding: "Receipt accepted" } }
      : { op: change, id: "m2", reason: "Owner accepted report" }
    const requests: LLM.StreamInput[] = []
    const result = yield* run(value.snapshot, { provider: provider(), llm: { stream: (input) => {
      requests.push(input)
      if (input.agent.name !== "continuity" || requests.length > 2) throw new Error("Unexpected reviewer or extra retry")
      return Stream.make(LLMEvent.textDelta({ id: "text", text: body([{ ...op, src: requests.length === 1 ? ["u2", "u1"] : ["u2"] }]) }),
        LLMEvent.finish({ reason: "stop" }))
    } } }, value.host)
    expect(requests).toHaveLength(2)
    expect(JSON.stringify(requests[1].messages.at(-1))).toContain("HOST CHECK FAILED. C18:")
    expect(result.retried).toBe(true)
    if (result.artifact?.version !== 5) throw new Error("Missing corrected artifact")
    expect(result.artifact.checklist?.critical).toEqual(change === "update" ? protectedIDs : protectedIDs.filter((id) => id !== "m2"))
    expect(result.artifact.items.find((item) => item.id === "m2")?.fields.finding).toBe(change === "update" ? "Receipt accepted" : undefined)
    expect(validChecklist(result.artifact)).toBe(true)
    expect(value.previous.items.find((item) => item.id === "m2")?.fields.finding).toBe("Receipt pending")
  }))

it.effect("repeated C18 retirement without sources publishes nothing and leaves the cold legacy receipt intact", () => Effect.gen(function* () {
  const value = fixture()
  const before = cold(value.previous)
  const requests: LLM.StreamInput[] = []
  const result = yield* run(value.snapshot, { provider: provider(), llm: { stream: (input) => {
    requests.push(input)
    if (input.agent.name !== "continuity" || requests.length > 2) throw new Error("Unexpected reviewer or extra retry")
    return Stream.make(LLMEvent.textDelta({ id: "text", text: body([{ op: "retire", id: "m2", reason: "Owner accepted report" }]) }),
      LLMEvent.finish({ reason: "stop" }))
  } } }, value.host)
  expect(requests).toHaveLength(2)
  expect(result).toMatchObject({ check: "C18", failure: "invalid-schema", retried: true, ops: [] })
  expect(result.artifact).toBeUndefined()
  expect(cold(value.previous)).toEqual(before)
}))

test("checklist cold reads and projection reject Now, text, item, ID, critical, digest and mixed-receipt mutants", () => {
  const value = fixture()
  const checked = ContinuityChecklist.check(candidate(value), value.snapshot, value.host)
  if ("check" in checked || checked.artifact.version !== 5 || !checked.artifact.checklist) throw new Error("Missing checklist")
  const original = checked.artifact
  const checklist = checked.artifact.checklist
  const restored = cold(original)
  expect(restored.artifact).toEqual(original)
  const positive = create()
  expect(positive.set(restored)).toBe(true)
  expect(positive.prepare(sessionID, value.history).system).toEqual([original.text])
  const mutants: CompleteArtifact[] = [
    { ...original, now: { ...original.now, next: "Repeat completed work" } },
    { ...original, text: original.text + " FORGED" },
    { ...original, items: original.items.map((item) => item.id === "m1" ? { ...item, fields: { ...item.fields, value: "FORGED" } } : item) },
    { ...original, items: original.items.map((item) => item.id === "m8" ? { ...item, id: "m9" } : item) },
    { ...original, checklist: { ...checklist, critical: protectedIDs.filter((id) => id !== "m2") } },
    { ...original, checklist: { ...checklist, critical: [...protectedIDs, "m2"] } },
    { ...original, checklist: { ...checklist, critical: ["m999"] } },
    { ...original, checklist: { ...checklist, digest: "0".repeat(64) } },
    { ...original, review: seal(original, { state: "closed", next: "wait-user", critical: protectedIDs }) },
  ]
  expect(validReview(mutants[mutants.length - 1])).toBe(true)
  for (const mutant of mutants) {
    expect(validChecklist(mutant)).toBe(false)
    expect(hasArtifact(context(mutant))).toBe(false)
    expect(() => cold(mutant)).toThrow("archive-corrupt-memory")
    const projection = create()
    expect(projection.set(context(mutant))).toBe(false)
    expect(projection.prepare(sessionID, value.history)).toEqual({ messages: value.history, system: [] })
    // Also cover mutation after admission, not only set-time validation.
    const admitted = structuredClone(original)
    const live = create()
    expect(live.set(context(admitted))).toBe(true)
    Object.assign(admitted, mutant)
    expect(live.prepare(sessionID, value.history)).toEqual({ messages: value.history, system: [] })
  }
  expect(sealChecklist(original, [...protectedIDs].reverse().concat("m2"))).toEqual(checklist)
})

test("prior v4 and unsealed v5 remain readable and projectable; corrupt legacy seals still fail", () => {
  const value = fixture()
  const unsealed = candidate(value).artifact
  for (const old of [artifact(), unsealed, value.previous]) {
    const restored = cold(old)
    expect(restored.artifact).toEqual(old)
    const projection = create()
    expect(projection.set(restored)).toBe(true)
    expect(projection.prepare(sessionID, messages()).system).toEqual(old.version === 4 ? [old.text] : [])
    if (old.version === 5) expect(projection.prepare(sessionID, value.history).system).toEqual([old.text])
  }
  const review = value.previous.review
  if (!review) throw new Error("Missing legacy review receipt")
  expect(() => cold({ ...value.previous, review: { ...review, digest: "0".repeat(64) } })).toThrow("archive-corrupt-memory")
  expect(() => cold({ ...value.previous, now: { ...value.previous.now, next: "FORGED" } })).toThrow("archive-corrupt-memory")
})
