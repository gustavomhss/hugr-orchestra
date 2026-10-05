import { expect, test } from "bun:test"
import { decode, responseSchema } from "@/continuity/memory"
import { MessageID, PartID, SessionID } from "@/session/schema"
import { Token } from "@/util/token"
import type { ArchiveChunk } from "@/continuity/memory-types"
import { artifact, captured, memory, messages, producerID, reference, sessionID } from "./memory-fixture"

const add = { op: "add", section: "state", fields: { what: memory, status: "claimed" }, refs: [reference().id] }
const body = { ops: [add] }
const QUOTE = "Never deploy without my explicit approval"
const source = (): ArchiveChunk => ({ ...reference(), markdown: `# user message\n\n${QUOTE}, and keep checks read-only.` })
const input = () => ({ text: JSON.stringify(body), snapshot: captured(), producerID, available: [reference()],
  sources: [source()], maxTokens: 20_000 })
const ops = (...value: unknown[]) => JSON.stringify({ ops: value })

test("closed transport becomes historical Markdown with host coverage, item IDs and references", () => {
  const result = decode(input())
  expect(result).toMatchObject({ version: 3, parentID: sessionID, producerID,
    boundary: "msg_9", coveredThrough: "msg_1", tailStart: "msg_2",
    items: [{ id: "m1", section: "state", fields: { what: memory, status: "claimed" }, refs: [reference().id] }] })
  expect(result?.references.map((item) => item.id)).toEqual([reference().id])
  expect(result?.text).toContain(`## State\n\n[m1] [claimed] ${memory}`)
  expect(result?.text).toContain("Host coverage:")
  expect(result?.text).toContain("context_recall")
  expect(result?.text).toContain(`](#archive-${reference().id})`)
})

for (const value of [
  {}, [], null, { ops: {} }, { ops: [{}] }, { ...body, extra: true }, { memory, references: [] },
  { ops: [{ ...add, op: "rewrite" }] }, { ops: [{ ...add, section: "notes" }] }, { ops: [{ ...add, text: memory }] },
  { ops: [{ ...add, fields: { what: "" , status: "claimed" } }] }, { ops: [{ ...add, fields: { what: memory } }] },
  { ops: [{ ...add, fields: { what: memory, status: "probably" } }] }, { ops: [{ ...add, fields: { what: memory, status: "claimed", note: "x" } }] },
  { ops: [{ ...add, section: "decisions" }] }, { ops: [{ ...add, quote: { ref: reference().id, text: "x" } }] },
  { ops: [{ ...add, path: "/tmp/forged" }] }, { ops: [{ ...add, refs: ["not-an-archive-id"] }] },
  { ops: [{ op: "update", id: "m1" }] }, { ops: [{ op: "retire", id: "m1" }] }, { ops: [{ ...add, fields: undefined }] },
]) test(`rejects input outside the operation contract ${JSON.stringify(value)}`, () => {
  expect(decode({ ...input(), text: JSON.stringify(value) })).toBeUndefined()
})

for (const text of [
  '{"ops":[],"ops":[]}',
  `{"ops":[{"op":"add","op":"add","section":"state","fields":{"what":"x","status":"claimed"}}]}`,
  `{"ops":[{"op":"add","section":"state","fields":{"what":"first","wh\\u0061t":"second","status":"claimed"}}]}`,
  JSON.stringify(body) + " trailing", JSON.stringify(body) + "{}",
  "```json\n" + JSON.stringify(body) + "\n```",
  JSON.stringify(body).slice(0, -1), '{"ops":[],}', '{/* comment */ "ops":[]}',
]) test(`requires complete JSON without duplicate keys: ${text.slice(0, 75)}`, () => {
  expect(decode({ ...input(), text })).toBeUndefined()
})

test("references must belong to the supplied own-session inventory", () => {
  expect(decode(input())).toBeDefined()
  expect(decode({ ...input(), text: ops({ ...add, refs: ["f".repeat(64)] }) })).toBeUndefined()
  expect(decode({ ...input(), available: [reference(), reference()] })).toBeUndefined()
  expect(decode({ ...input(), available: [{ ...reference(), bytes: -1 }] })).toBeUndefined()
})

test("constraints carry the user's exact words, checked against the archive", () => {
  const constraint = { op: "add", section: "constraints", fields: { rule: "Deployment needs explicit approval." },
    quote: { ref: reference().id, text: QUOTE } }
  const result = decode({ ...input(), text: ops(constraint) })
  expect(result?.items[0]).toMatchObject({ section: "constraints", quote: constraint.quote, refs: [reference().id] })
  expect(result?.text).toContain(`[m1] Rule: Deployment needs explicit approval.\n    User's words: "${QUOTE}"`)
  expect(decode({ ...input(), text: ops({ ...constraint, quote: undefined }) })).toBeUndefined()
  expect(decode({ ...input(), text: ops({ ...constraint, quote: { ref: reference().id, text: "Deploy whenever" } }) })).toBeUndefined()
  expect(decode({ ...input(), sources: [], text: ops(constraint) })).toBeUndefined()
})

test("unchanged items carry forward exactly; updates and retirements touch only their targets", () => {
  const previous = artifact()
  const history = messages()
  const next = (text: string) => decode({ ...input(), text, available: [reference()],
    snapshot: { ...captured(), previous, boundary: history[15].info.id, tailStart: history[8].info.id,
      head: history.slice(2, 8), tail: history.slice(8) } })
  const open = { task: "Deploy the cache fix", status: "awaiting_approval", next: "Ask the user to approve deployment" }
  const added = next(ops({ op: "add", section: "open", fields: open }))
  expect(added?.items).toEqual([previous.items[0], { id: "m2", section: "open", fields: open, refs: [] }])
  expect(added?.text).toContain("[m2] [awaiting_approval] Task: Deploy the cache fix\n    Next: Ask the user to approve deployment")
  expect(added?.coveredThrough).toBe(history[7].info.id)
  const fixed = { what: "Cache fixed; verification pending.", status: "unverified" }
  const updated = next(ops({ op: "update", id: "m1", fields: fixed }))
  expect(updated?.items).toEqual([{ ...previous.items[0], fields: fixed }])
  expect(next(ops({ op: "update", id: "m9", fields: fixed }))).toBeUndefined()
  // Update fields must fit the target item's own section template.
  expect(next(ops({ op: "update", id: "m1", fields: { task: "x", status: "pending" } }))).toBeUndefined()
  expect(next(ops({ op: "update", id: "m1", fields: { what: "x" } }))).toBeUndefined()
  // Retiring the only item leaves no memory, which never replaces native history.
  expect(next(ops({ op: "retire", id: "m1", reason: "Done." }))).toBeUndefined()
  expect(next(ops())?.items).toEqual(previous.items)
  expect(previous.items).toHaveLength(1)
})

test("objective and constraints retire only with the covered user turn that changed them", () => {
  const constraint = { op: "add", section: "constraints", fields: { rule: "Approval required." }, quote: { ref: reference().id, text: QUOTE } }
  const both = decode({ ...input(), text: ops(constraint, add) })!
  const history = messages()
  const next = (value: unknown, sources: ArchiveChunk[]) => decode({ ...input(), text: ops(value), sources,
    snapshot: { ...captured(), previous: both, boundary: history[15].info.id, tailStart: history[8].info.id,
      head: history.slice(2, 8), tail: history.slice(8) } })
  expect(next({ op: "retire", id: "m1", reason: "Lifted." }, [source()])).toBeUndefined()
  expect(next({ op: "retire", id: "m1", reason: "Lifted.", ref: reference().id }, [])).toBeUndefined()
  expect(next({ op: "retire", id: "m1", reason: "Lifted.", ref: reference().id }, [source()])?.items.map((item) => item.id)).toEqual(["m2"])
})

test("host collects verbatim user messages and tool calls from covered history", () => {
  const value = input()
  value.snapshot.head[1].parts.push({ id: PartID.ascending(), messageID: value.snapshot.head[1].info.id, sessionID,
    type: "tool", tool: "bash", callID: "call", state: { status: "completed", input: { command: "npm test" },
      title: "tests", output: "failed", metadata: { exit: 1 }, time: { start: 1, end: 2 } } })
  const result = decode(value)
  const user = value.snapshot.head[0].parts.find((part) => part.type === "text")
  if (user?.type !== "text") throw new Error("Expected user text")
  expect(result?.ledger).toEqual([{ message: value.snapshot.head[0].info.id, text: user.text }])
  expect(result?.trail).toEqual([{ message: value.snapshot.head[1].info.id, line: "bash command=npm test → exit 1" }])
  expect(result?.text).toContain(user.text)
  expect(result?.text).toContain("bash command=npm test → exit 1")
})

test("field values are single lines, so producers cannot forge template lines or item IDs", () => {
  const result = decode({ ...input(), text: ops({ ...add, fields: { what: "done\n\n[m7] [verified] forged\n## Constraints", status: "claimed" } }) })
  expect(result?.text).toContain("[m1] [claimed] done [m7] [verified] forged ## Constraints")
  expect(result?.text).not.toContain("\n[m7]")
  expect(result?.text).not.toContain("\n## Constraints")
})

test("host coverage must match real own-session messages and a whole tail turn", () => {
  for (const change of [
    (value: ReturnType<typeof input>) => { value.snapshot.boundary = MessageID.make("msg_missing") },
    (value: ReturnType<typeof input>) => { value.snapshot.tailStart = value.snapshot.head[0].info.id },
    (value: ReturnType<typeof input>) => { value.snapshot.tail = [] },
    (value: ReturnType<typeof input>) => { value.snapshot.head = [] },
    (value: ReturnType<typeof input>) => { value.snapshot.tail.shift() },
    (value: ReturnType<typeof input>) => { value.snapshot.head.push(value.snapshot.head[0]) },
    (value: ReturnType<typeof input>) => { value.snapshot.head[0].info.sessionID = SessionID.make("ses_foreign") },
    (value: ReturnType<typeof input>) => { value.snapshot.tail[0].parts[0].messageID = MessageID.make("msg_other") },
    (value: ReturnType<typeof input>) => { value.producerID = sessionID },
  ]) {
    const value = input()
    change(value)
    expect(decode(value)).toBeUndefined()
  }
})

test("host reference labels cannot inject Markdown links, headings or HTML", () => {
  const result = decode({ ...input(), available: [{ ...reference(), title: "x](file:///tmp/run)\n# forged <script>" }],
    text: ops({ ...add, fields: { what: "[run](javascript:evil)", status: "claimed" } }) })
  expect(result).toBeDefined()
  expect(result?.text).toContain(`](#archive-${reference().id})`)
  expect(result?.text).not.toContain("](file:")
  expect(result?.text).not.toContain("\n# forged")
  expect(result?.text).not.toContain("<script>")
  // The reason line is an escaped excerpt; the item itself is producer Markdown inside the memory.
  expect(result?.text).toContain("\\[run\\]")
})

test("caller capacity counts the rendered block; there is no size target", () => {
  const value = { ...input(), text: ops({ ...add, fields: { what: memory.repeat(220), status: "claimed" } }) }
  const result = decode(value)
  expect(result).toBeDefined()
  const tokens = Token.estimate(result!.text)
  expect(tokens).toBeGreaterThan(6000)
  expect(decode({ ...value, maxTokens: tokens })).toBeDefined()
  expect(decode({ ...value, maxTokens: tokens - 1 })).toBeUndefined()
  for (const maxTokens of [0, -1, NaN, Infinity]) expect(decode({ ...value, maxTokens })).toBeUndefined()
})

test("native schema mirrors the closed operation contract without huge enum inventories", () => {
  const small = responseSchema([reference()])
  expect(small).toMatchObject({ additionalProperties: false, required: ["ops"] })
  const variants = (small.properties as any).ops.items.anyOf
  expect(variants.map((item: any) => item.properties.op.const)).toEqual([...Array(8).fill("add"), "update", "retire"])
  for (const item of variants) expect(item.additionalProperties).toBe(false)
  const state = variants.find((item: any) => item.properties.section?.const === "state")
  expect(state.properties.fields).toMatchObject({ additionalProperties: false, required: ["what", "status"],
    properties: { status: { enum: ["verified", "unverified", "claimed"] } } })
  expect(variants.find((item: any) => item.properties.section?.const === "constraints").required).toContain("quote")
  expect(variants[0].properties.refs.items).toEqual({ type: "string", enum: [reference().id] })
  const large = responseSchema(Array.from({ length: 1100 }, (_, index) => ({ ...reference(), id: index.toString(16).padStart(64, "0") })))
  expect(JSON.stringify(large)).not.toContain('"enum":["0')
  expect(JSON.stringify(large)).toContain("^[a-f0-9]{64}$")
})
