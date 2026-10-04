import { expect, test } from "bun:test"
import { decode, responseSchema } from "@/continuity/memory"
import { MessageID, SessionID } from "@/session/schema"
import { Token } from "@/util/token"
import { artifact, captured, memory, messages, producerID, reference, sessionID } from "./memory-fixture"

const body = { memory, references: [{ id: reference().id, why: "Recover verification evidence." }] }
const input = () => ({ text: JSON.stringify(body), snapshot: captured(), producerID, available: [reference()], maxTokens: 20_000 })

test("closed transport becomes historical Markdown with host coverage and references", () => {
  const result = decode(input())
  expect(result).toMatchObject({ version: 2, parentID: sessionID, producerID,
    boundary: "msg_9", coveredThrough: "msg_1", tailStart: "msg_2", memory,
    references: [{ ...reference(), why: body.references[0].why }] })
  expect(result?.text).toContain(memory)
  expect(result?.text).toContain("Host coverage:")
  expect(result?.text).toContain("context_recall")
  expect(result?.text).toContain(`](#archive-${reference().id})`)
  expect(result?.text).not.toContain('"exact":')
})

for (const value of [
  {}, [], null, { ...body, memory: " \n\t" }, { ...body, memory: 42 },
  { ...body, extra: true }, { ...body, status: "ready" }, { memory },
  { ...body, references: [{ ...body.references[0], path: "/tmp/forged" }] },
  { ...body, references: [{ id: reference().id }] },
  { ...body, references: [{ id: reference().id, why: " \n " }] },
  { ...body, references: {} },
]) test(`rejects malformed closed transport ${JSON.stringify(value)}`, () => {
  expect(decode({ ...input(), text: JSON.stringify(value) })).toBeUndefined()
})

for (const text of [
  '{"memory":"first","memory":"second","references":[]}',
  '{"memory":"first","mem\\u006fry":"second","references":[]}',
  `{"memory":"valid","references":[{"id":"${reference().id}","id":"${reference().id}","why":"test"}]}`,
  `{"memory":"valid","references":[{"id":"${reference().id}","why":"first","wh\\u0079":"second"}]}`,
  JSON.stringify(body) + " trailing", JSON.stringify(body) + "{}",
  "```json\n" + JSON.stringify(body) + "\n```",
  JSON.stringify(body).slice(0, -1), '{"memory":"yes","references":[],}',
  '{/* comment */ "memory":"yes","references":[]}',
]) test(`requires complete JSON without duplicate keys: ${text.slice(0, 75)}`, () => {
  expect(decode({ ...input(), text })).toBeUndefined()
})

test("reference membership and uniqueness reject foreign or duplicate IDs", () => {
  expect(decode(input())).toBeDefined()
  expect(decode({ ...input(), text: JSON.stringify({ memory,
    references: [{ id: "f".repeat(64), why: "foreign" }] }) })).toBeUndefined()
  expect(decode({ ...input(), text: JSON.stringify({ memory,
    references: [body.references[0], body.references[0]] }) })).toBeUndefined()
  expect(decode({ ...input(), available: [reference(), reference()] })).toBeUndefined()
  expect(decode({ ...input(), available: [{ ...reference(), bytes: -1 }] })).toBeUndefined()
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

test("references may retire freely while prior memory advances incrementally", () => {
  const previous = artifact()
  const history = messages()
  const result = decode({ ...input(), text: JSON.stringify({ memory: "# Work\nDeployment still awaits approval.", references: [] }),
    snapshot: { ...captured(), previous, boundary: history[15].info.id, tailStart: history[8].info.id,
      head: history.slice(2, 8), tail: history.slice(8) }, available: [] })
  expect(result?.references).toEqual([])
  expect(result?.coveredThrough).toBe(history[7].info.id)
  expect(previous.references).toHaveLength(1)
})

test("host reference labels cannot inject Markdown links, headings or HTML", () => {
  const result = decode({ ...input(), available: [{ ...reference(), title: "x](file:///tmp/run)\n# forged <script>" }],
    text: JSON.stringify({ memory, references: [{ id: reference().id, why: "[run](javascript:evil)\n## forged" }] }) })
  expect(result).toBeDefined()
  expect(result?.text).toContain(`](#archive-${reference().id})`)
  expect(result?.text).not.toContain("](file:")
  expect(result?.text).not.toContain("](javascript:")
  expect(result?.text).not.toContain("\n# forged")
  expect(result?.text).not.toContain("\n## forged")
  expect(result?.text).not.toContain("<script>")
  expect(result?.text).toContain("\\[run\\]")
})

test("caller capacity counts rendered footer; neither 6000 nor a reduction ratio is a gate", () => {
  const value = { ...input(), text: JSON.stringify({ memory: memory.repeat(220), references: body.references }) }
  const result = decode(value)
  expect(result).toBeDefined()
  const tokens = Token.estimate(result!.text)
  expect(tokens).toBeGreaterThan(6000)
  expect(decode({ ...value, maxTokens: tokens })).toBeDefined()
  expect(decode({ ...value, maxTokens: tokens - 1 })).toBeUndefined()
  for (const maxTokens of [0, -1, NaN, Infinity]) expect(decode({ ...value, maxTokens })).toBeUndefined()
})

test("native schema stays closed and bounded without huge enum inventories", () => {
  const small = responseSchema([reference()])
  expect(small).toMatchObject({ additionalProperties: false, required: ["memory", "references"],
    properties: { references: { items: { additionalProperties: false, required: ["id", "why"],
      properties: { id: { enum: [reference().id] } } } } } })
  const large = responseSchema(Array.from({ length: 1100 }, (_, index) => ({ ...reference(), id: index.toString(16).padStart(64, "0") })))
  expect(large).toMatchObject({ properties: { references: { maxItems: 1100,
    items: { properties: { id: { pattern: "^[a-f0-9]{64}$" } } } } } })
  expect(JSON.stringify(large)).not.toContain('"enum"')
})
