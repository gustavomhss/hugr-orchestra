import { expect, test } from "bun:test"
import { ContinuityReview } from "@/continuity/review"
import { decode, scope } from "@/continuity/memory"
import { fingerprint } from "@/continuity/model"
import type { CompleteArtifact, Host, MemorySnapshot } from "@/continuity/memory-types"
import { seal } from "@/continuity/review-seal"
import { Transcript } from "@/continuity/transcript"
import { PartID, SessionID } from "@/session/schema"
import { messages, producerID, sessionID } from "./memory-fixture"

function fixture(previous?: CompleteArtifact, empty = false) {
  const history = messages(["user", "assistant", "user", "assistant", "user", "assistant"])
  const contents = ["OLD_RAW_REQUIREMENT: Keep deployment read-only. Artifact: /workspace/report.json.",
    "OLD_RAW_OBSERVATION: Initial report drafted; verify receipt.",
    "NEW_USER_EVIDENCE: Report accepted; exit 1 expected for negative control. Wait for owner.",
    "NEW_BOUNDARY: Delivered report and receipt; waiting for owner.", "POST_BOUNDARY_NEW_TASK", "POST_BOUNDARY_RESPONSE"]
  history.forEach((message, index) => {
    message.parts = [{ id: PartID.make(`prt_${index}`), messageID: message.info.id, sessionID, type: "text", text: contents[index] }]
  })
  history[3].parts.push({ id: PartID.make("prt_tool"), messageID: history[3].info.id, sessionID, type: "tool", tool: "bash", callID: "negative-control",
    state: { status: "completed", input: { command: "run-negative-control" }, output: "Expected negative control: 1 fail", title: "control",
      metadata: { exit: 1 }, time: { start: 3, end: 4 }, attachments: [{ id: PartID.make("prt_image"), messageID: history[3].info.id,
        sessionID, type: "file", mime: "image/png", url: "data:image/png;base64,BINARY_SECRET" }] } },
    { id: PartID.make("prt_reasoning"), messageID: history[3].info.id, sessionID, type: "reasoning", text: "PRODUCER_REASONING_SECRET", time: { start: 3, end: 4 } })
  const snapshot: MemorySnapshot = { sessionID, boundary: history[3].info.id, complete: true, covered: history.slice(0, 4),
    head: history.slice(previous?.covered.length ?? 0, 4), tail: [], previous, canRecall: true }
  const host: Host = { history, member: false, delegations: {} }
  const artifact = produce(snapshot, host, empty || previous ? [] : [
    { op: "add", section: "findings", src: ["t1"], fields: { finding: "Negative control returned expected failure", why: "Oracle detects faults", status: "confirmed" } },
    { op: "add", section: "values", src: ["u1"], fields: { name: "Artifact", value: "/workspace/report.json" } },
    { op: "add", section: "rules", src: ["u1"], fields: { kind: "must_not", rule: "Keep deployment read-only", quote: "Keep deployment read-only." } },
    { op: "add", section: "decisions", src: ["u1"], fields: { by: "user", decision: "Keep deployment read-only", why: "User constraint", quote: "Keep deployment read-only." } },
    { op: "add", section: "objective", src: ["u1"], fields: { goal: "Deliver report", why: "Owner needs receipt", done_when: "Owner accepts report" } },
    { op: "add", section: "plan", src: ["u2"], fields: { task: "Wait for owner", status: "waiting" } },
    { op: "add", section: "decisions", src: ["a2"], fields: { by: "agent", decision: "Report delivered", why: "Recorded boundary" } },
  ])
  return { snapshot, host, artifact }
}

function produce(snapshot: MemorySnapshot, host: Host, ops: unknown[], alias = "a2") {
  const result = decode({ text: JSON.stringify({ ops, now: { doing: "Report delivered; awaiting owner", next: "Wait for owner", src: [alias] } }),
    snapshot, host, producerID, budget: 20_000 })
  if ("check" in result || result.artifact.version !== 5) throw new Error(JSON.stringify(result))
  return result.artifact
}

function prior() {
  const value = fixture()
  const snapshot: MemorySnapshot = { ...value.snapshot, boundary: value.host.history[1].info.id,
    covered: value.host.history.slice(0, 2), head: value.host.history.slice(0, 2) }
  const artifact = produce(snapshot, value.host, [
    { op: "add", section: "values", src: ["u1"], fields: { name: "Artifact", value: "/workspace/report.json" } },
    { op: "add", section: "findings", src: ["a1"], fields: { finding: "Initial report drafted", why: "Pending verification", status: "hypothesis", check: "Verify receipt" } },
    { op: "add", section: "rules", src: ["u1"], fields: { kind: "must_not", rule: "Keep deployment read-only", quote: "Keep deployment read-only." } },
  ], "a1")
  return { ...artifact, review: seal(artifact, { state: "active", next: "verify", critical: ["m1", "m2"] }) }
}

function accepted() {
  return { verdict: "accept", cursor: { supported: true, state: "closed", next: "wait-user", reason: "Owner accepted report; wait for owner", src: ["a2"] },
    critical: [] as { item: string; src: string[] }[], resolved: [] as { item: string; reason: string; src: string[] }[],
    issues: [] as { kind: string; detail: string; src: string[] }[] }
}
const review = (value: ReturnType<typeof fixture>, body: unknown = accepted()) => ContinuityReview.decode({ ...value, text: JSON.stringify(body) })
function failure(value: ReturnType<typeof ContinuityReview.decode>, detail?: string) {
  expect(value).toMatchObject({ check: "C18" })
  if (!("check" in value)) throw new Error("Expected rejected review")
  expect(value.detail.trim().length).toBeGreaterThan(0)
  if (detail) expect(value.detail).toContain(detail)
}
function envelope(value: ReturnType<typeof fixture>) {
  const request = ContinuityReview.request(value.snapshot, value.host, value.artifact)
  expect(Object.keys(request).sort()).toEqual(["messages", "system"])
  expect(request.messages).toHaveLength(1)
  expect(request.messages[0].role).toBe("user")
  const content = request.messages[0].content
  if (typeof content !== "string") throw new Error("Expected text-only review input")
  return { request, content, data: JSON.parse(content) }
}

test("request carries full raw covered source, candidate, indexed aliases and typed lifecycle outcomes", () => {
  const value = fixture()
  const result = envelope(value)
  expect(result.data.mode).toBe("full-covered")
  expect(result.data.transcript).toBe(Transcript.transcript(value.snapshot.covered!))
  expect(result.data.transcript).toContain("OLD_RAW_REQUIREMENT")
  expect(result.data.transcript).toContain("NEW_BOUNDARY")
  expect(result.data.candidate).toEqual({ text: value.artifact.text, items: value.artifact.items, now: value.artifact.now })
  expect(result.data.index).toEqual(expect.arrayContaining([
    expect.objectContaining({ alias: "u1", message: "msg_0", eligibleBoundary: false }),
    expect.objectContaining({ alias: "a2", message: "msg_3", eligibleBoundary: true }),
    expect.objectContaining({ alias: "t1", part: "prt_tool", eligibleBoundary: true }),
  ]))
  expect(result.data.outcomes).toEqual([expect.objectContaining({ alias: "t1", tool: "bash", status: "completed", exit: 1,
    observation: "Expected negative control: 1 fail", meaning: "Invocation lifecycle only; success depends on task and source evidence." })])
  for (const secret of ["POST_BOUNDARY_NEW_TASK", "POST_BOUNDARY_RESPONSE", "PRODUCER_REASONING_SECRET", "BINARY_SECRET"])
    expect(result.content).not.toContain(secret)
  expect(result.data.transcript).toContain("Media metadata only")
  expect(result.request.system[0]).toContain("A nonzero exit may be an expected negative")
  expect(result.request.system[0]).toContain("not a guarantee")
  expect(result.request.system[0]).toContain("false-completion")
})

test("valid prior seal enables incremental review; absent receipt rechecks full sources and stale receipt fails closed", () => {
  const previous = prior()
  const incremental = fixture(previous)
  const result = envelope(incremental)
  expect(result.data.mode).toBe("incremental")
  expect(result.data.transcript).toBe(Transcript.transcript(incremental.snapshot.head))
  expect(result.data.transcript).not.toContain("OLD_RAW_REQUIREMENT")
  expect(result.data.transcript).toContain("NEW_USER_EVIDENCE")
  expect(result.data.previous).toEqual({ text: previous.text, items: previous.items, review: previous.review })
  const old = fixture({ ...previous, review: undefined })
  const full = envelope(old)
  expect(full.data.mode).toBe("full-covered")
  expect(full.data.transcript).toContain("OLD_RAW_REQUIREMENT")
  expect(full.data.previous.review).toBeNull()
  old.snapshot.previous = { ...previous, review: { ...previous.review!, digest: "stale" } }
  expect(() => envelope(old)).toThrow("C18")
  failure(review(old), "matching owned complete coverage")
})

test("accept returns host decision and conserves guarded IDs without reclassifying agent decisions", () => {
  const value = fixture()
  expect(review(value)).toEqual({ state: "closed", next: "wait-user", critical: ["m3", "m4", "m5"] })
  const body = accepted()
  body.critical = [{ item: "m1", src: ["t1"] }, { item: "m2", src: ["u1"] }]
  expect(review(value, body)).toEqual({ state: "closed", next: "wait-user", critical: ["m1", "m2", "m3", "m4", "m5"] })
})

test("incremental review supplements older failed evidence when candidate introduces a new historical success claim", () => {
  const value = fixture()
  const old = value.host.history[1]
  old.parts.push({ id: PartID.make("prt_old_failed"), messageID: old.info.id, sessionID, type: "tool", tool: "bash", callID: "old-failure",
    state: { status: "completed", input: { command: "verify-original" }, output: "OLD_CHECK_FAILED: exit 75", title: "Old check",
      metadata: { exit: 75 }, time: { start: 1, end: 2 } } })
  const initial: MemorySnapshot = { ...value.snapshot, boundary: old.info.id, covered: value.host.history.slice(0, 2), head: value.host.history.slice(0, 2) }
  const artifact = produce(initial, value.host, [], "a1")
  const previous = { ...artifact, review: seal(artifact, { state: "active", next: "verify", critical: [] }) }
  value.snapshot = { ...value.snapshot, previous, head: value.host.history.slice(2, 4) }
  value.artifact = produce(value.snapshot, value.host, [{ op: "add", section: "findings", src: ["t1"],
    fields: { finding: "Original verification passed", why: "Claims prior success", status: "confirmed" } }])
  const packet = envelope(value)
  expect(packet.data.mode).toBe("incremental")
  expect(packet.data.transcript).toContain("OLD_CHECK_FAILED: exit 75")
  expect(packet.data.outcomes).toContainEqual(expect.objectContaining({ alias: "t1", exit: 75 }))
  expect(packet.data.transcript).not.toContain("POST_BOUNDARY_NEW_TASK")
  expect(previous.covered[1].digest).toBe(fingerprint(old))
  failure(review(value, { ...accepted(), verdict: "repair", issues: [{ kind: "false-completion", detail: "Old check failed, not passed", src: ["t1"] }] }), "Old check failed")
})

test("all semantic issue classes reject even an accept verdict with concrete correction feedback", () => {
  for (const kind of ["omission", "unsupported", "contradiction", "stale-cursor", "repetition", "false-completion"]) {
    const body = accepted()
    body.issues = [{ kind, detail: "Candidate lost read-only constraint or invents completion", src: ["u1", "t1"] }]
    failure(review(fixture(), body), `${kind}: Candidate lost read-only constraint or invents completion (u1, t1)`)
  }
  failure(review(fixture(), { ...accepted(), verdict: "repair" }), "Review repair")
  const unsupported = accepted()
  unsupported.cursor.supported = false
  unsupported.cursor.reason = "Candidate Now repeats already delivered work"
  failure(review(fixture(), unsupported), "cursor unsupported: Candidate Now repeats already delivered work")
})

// These reports supply semantic judgments; the pure decoder checks them, not model accuracy.
test("omitting a source requirement or retaining a stale next move cannot override reviewer repair", () => {
  const omitted = fixture(undefined, true)
  const omission = { ...accepted(), verdict: "repair", issues: [{ kind: "omission", detail: "Retain deployment read-only requirement", src: ["u1"] }] }
  expect(envelope(omitted).data.transcript).toContain("Keep deployment read-only")
  expect(omitted.artifact.items).toEqual([])
  failure(review(omitted, omission), "omission: Retain deployment read-only requirement")
  const stale = fixture()
  stale.artifact.now.next = "Draft initial report again"
  stale.artifact.text = stale.artifact.text.replace("Next: Wait for owner", "Next: Draft initial report again")
  const report = { ...accepted(), cursor: { ...accepted().cursor, supported: false, reason: "Report already delivered; wait for owner" },
    issues: [{ kind: "stale-cursor", detail: "Replace drafting next move with owner handoff", src: ["u2", "a2"] }] }
  expect(envelope(stale).data.candidate.now.next).toBe("Draft initial report again")
  failure(review(stale, report), "stale-cursor: Replace drafting next move with owner handoff")
})

test("false production completion is rejected by grounded review, while expected negative control remains acceptable", () => {
  expect(review(fixture())).toMatchObject({ state: "closed", next: "wait-user" })
  const value = fixture(undefined, true)
  const tool = value.host.history[3].parts.find((part) => part.type === "tool")
  if (!tool || tool.type !== "tool" || tool.state.status !== "completed") throw new Error("Expected completed control")
  tool.state.input = { command: "run-production-check" }
  tool.state.output = "Production check failed: receipt mismatch"
  value.artifact = produce(value.snapshot, value.host, [{ op: "add", section: "findings", src: ["t1"],
    fields: { finding: "Production check passed", why: "Ready to publish", status: "confirmed" } }])
  expect(envelope(value).data.outcomes[0]).toMatchObject({ status: "completed", exit: 1, observation: "Production check failed: receipt mismatch" })
  failure(review(value, { ...accepted(), verdict: "repair", issues: [{ kind: "false-completion",
    detail: "Invocation returned but production receipt check failed", src: ["t1"] }] }), "false-completion: Invocation returned but production receipt check failed")
})

test("full review does not clip large captured raw source", () => {
  const value = fixture(undefined, true)
  const part = value.host.history[0].parts[0]
  if (part.type !== "text") throw new Error("Expected raw user source")
  part.text = "COVERED_RAW_SOURCE ".repeat(1_000) + "FINAL_SOURCE_FACT"
  value.artifact = produce(value.snapshot, value.host, [])
  expect(envelope(value).data.transcript).toContain(part.text)
})

test("strict JSON rejects malformed, comments, fences, trailing content and duplicate keys at every depth", () => {
  const body = JSON.stringify(accepted())
  for (const text of ["", "{}", "null", "[]", "true", "{", `${body} trailing`, `\`\`\`json\n${body}\n\`\`\``,
    body.replace('"verdict":"accept"', '"verdict":"accept","verdict":"accept"'),
    body.replace('"supported":true', '"supported":true,"supported":true'),
    body.replace('"reason":', '"re\\u0061son":"duplicate","reason":'),
    body.replace('"critical":[]', '"critical":[{"item":"m1","src":["t1"],"item":"m1"}]'),
    body.replace('"verdict":', '/* comment */ "verdict":'), body.replace(/}$/, ",}")])
    failure(ContinuityReview.decode({ ...fixture(), text }))
})

test("closed required report rejects unknown fields, missing arrays, invalid labels, blank explanations and empty sources", () => {
  const good = accepted()
  for (const body of [{ ...good, extra: true }, { ...good, critical: undefined }, { ...good, resolved: undefined },
    { ...good, issues: undefined }, { ...good, cursor: undefined }, { ...good, verdict: "approve" },
    { ...good, cursor: { ...good.cursor, extra: true } }, { ...good, cursor: { ...good.cursor, state: "done" } },
    { ...good, cursor: { ...good.cursor, next: "stop" } }, { ...good, cursor: { ...good.cursor, supported: "true" } },
    { ...good, cursor: { ...good.cursor, reason: " \n " } }, { ...good, cursor: { ...good.cursor, src: [] } },
    { ...good, critical: [{ item: "m1", src: ["t1"], extra: true }] },
    { ...good, issues: [{ kind: "success", detail: "Invalid issue label", src: ["u1"] }] },
    { ...good, issues: [{ kind: "omission", detail: " \t ", src: ["u1"] }] },
    { ...good, issues: [{ kind: "omission", detail: "Missing requirement", src: [] }] },
    { ...good, issues: [{ kind: "omission", detail: "Missing requirement", src: ["u1"], extra: true }] }])
    failure(review(fixture(), body))
})

test("cursor needs actual eligible boundary alias; known older user/assistant sources cannot substitute", () => {
  const good = accepted()
  failure(review(fixture(), { ...good, cursor: { ...good.cursor, src: ["u2", "a1"] } }), "exact captured boundary")
  expect(review(fixture(), { ...good, cursor: { ...good.cursor, src: ["t1"] } })).toMatchObject({ state: "closed" })
  for (const src of [["a2", "u3"], ["a2", "a3"], ["a2", "t2"], ["a2", "m1"], ["a2", "a2"]])
    failure(review(fixture(), { ...good, cursor: { ...good.cursor, src } }))
  failure(review(fixture(), { ...good, issues: [{ kind: "omission", detail: "Foreign issue", src: ["u3"] }] }), "uncovered sources")
})

test("critical classification must name unique live IDs and cite that item's actual sources", () => {
  for (const critical of [[{ item: "m99", src: ["u1"] }], [{ item: "m2", src: ["a2"] }],
    [{ item: "m2", src: [] }], [{ item: "m2", src: ["u1", "u3"] }],
    [{ item: "m2", src: ["u1"] }, { item: "m2", src: ["u1"] }]])
    failure(review(fixture(), { ...accepted(), critical }))
})

test("live prior critical IDs persist when reviewer omits them", () => {
  expect(review(fixture(prior()))).toEqual({ state: "closed", next: "wait-user", critical: ["m1", "m2", "m3"] })
})

test("retired prior critical IDs require exact explicit newly covered resolutions", () => {
  const value = fixture(prior())
  value.artifact = produce(value.snapshot, value.host, [{ op: "retire", id: "m1", reason: "Owner accepted report", src: ["u2"] }])
  failure(review(value), "explicit grounded resolutions: m1")
  const resolution = { item: "m1", reason: "Owner accepted report and no longer needs artifact locator", src: ["u2"] }
  expect(review(value, { ...accepted(), resolved: [resolution] })).toEqual({ state: "closed", next: "wait-user", critical: ["m2", "m3"] })
  for (const resolved of [[{ ...resolution, src: ["u1"] }], [{ ...resolution, src: ["u2", "a1"] }],
    [{ ...resolution, src: ["u3"] }], [{ ...resolution, src: [] }], [{ ...resolution, reason: " \n " }],
    [resolution, resolution], [{ ...resolution, item: "m2" }], [{ ...resolution, item: "m99" }],
    [{ ...resolution, extra: true }], [resolution, { ...resolution, item: "m3" }]])
    failure(review(value, { ...accepted(), resolved }))
  failure(review(fixture(prior()), { ...accepted(), resolved: [resolution] }), "retired prior critical")
})

test("empty candidate still requires supported cursor and a real empty/reasoning-only boundary anchor", () => {
  const value = fixture(undefined, true)
  expect(review(value)).toEqual({ state: "closed", next: "wait-user", critical: [] })
  failure(review(value, { ...accepted(), cursor: undefined }))
  failure(review(value, { ...accepted(), cursor: { ...accepted().cursor, supported: false } }))
  value.host.history[3].parts = value.host.history[3].parts.filter((part) => part.type === "reasoning")
  const alias = scope(value.snapshot, value.host).span.find((source) => source.message.info.id === value.snapshot.boundary)?.alias
  if (!alias) throw new Error("Missing terminal boundary anchor")
  expect(alias).toMatch(/^a[0-9]+$/)
  value.artifact = produce(value.snapshot, value.host, [], alias)
  expect(review(value, { ...accepted(), cursor: { ...accepted().cursor, src: [alias] } })).toEqual({ state: "closed", next: "wait-user", critical: [] })
  expect(envelope(value).data.index).toContainEqual(expect.objectContaining({ alias, eligibleBoundary: true }))
})

test("closed waiting controls allow owner handoff without invented work; waiting/active remain source-judged", () => {
  for (const next of ["ask-user", "wait-user"])
    expect(review(fixture(), { ...accepted(), cursor: { ...accepted().cursor, next } })).toMatchObject({ state: "closed", next })
  for (const next of ["continue", "verify"])
    failure(review(fixture(), { ...accepted(), cursor: { ...accepted().cursor, next } }), "Closed work")
  for (const state of ["waiting", "active"]) for (const next of ["continue", "verify", "ask-user", "wait-user"])
    expect(review(fixture(), { ...accepted(), cursor: { ...accepted().cursor, state, next } })).toMatchObject({ state, next })
})

test("foreign ownership, changed host prefix, candidate coverage and pending boundary fail before review approval", () => {
  const changed = fixture()
  changed.host.history = structuredClone(changed.host.history)
  const part = changed.host.history[0].parts[0]
  if (part.type !== "text") throw new Error("Expected user text")
  part.text = "OTHER_SOURCE_WITH_SAME_ALIAS"
  failure(review(changed), "matching owned complete coverage")
  expect(() => ContinuityReview.request(changed.snapshot, changed.host, changed.artifact)).toThrow("C18")
  const foreign = fixture()
  foreign.host.history[0].parts[0].sessionID = SessionID.make("ses_foreign")
  failure(review(foreign), "matching owned complete coverage")
  const wrong = fixture()
  wrong.artifact.parentID = SessionID.make("ses_foreign")
  failure(review(wrong))
  const corrupt = fixture()
  corrupt.artifact.covered = corrupt.artifact.covered.map((source) => ({ ...source, digest: "0".repeat(64) }))
  failure(review(corrupt))
  const pending = fixture()
  const tool = pending.host.history[3].parts.find((part) => part.type === "tool")
  if (!tool || tool.type !== "tool") throw new Error("Expected boundary tool")
  tool.state = { status: "running", input: {}, time: { start: 3 } }
  failure(review(pending))
})

test("request/decode leave captured source, candidate, prior seal and review report unchanged", () => {
  const value = fixture(prior())
  const body = accepted()
  const before = structuredClone({ value, body })
  envelope(value)
  review(value, body)
  expect({ value, body }).toEqual(before)
})
