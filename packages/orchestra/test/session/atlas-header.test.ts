import { expect } from "bun:test"
import { mkdir } from "node:fs/promises"
import path from "node:path"
import { Effect } from "effect"
import type { Agent } from "@/agent/agent"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { LEGACY_BACKEND_ID, renderPrompt, roster } from "@/maestro/roster"
import { LLMRequestPrep } from "@/session/llm/request"
import { MessageID, SessionID } from "@/session/schema"
import { TestInstance } from "../fixture/fixture"
import { ProviderTest } from "../fake/provider"
import { testEffect } from "../lib/effect"

const it = testEffect(RuntimeFlags.layer())
// The label is never the key: the backend seat runs under a renamed label here and still gets its header.
const LABEL = "Renamed Seat"
const charter = renderPrompt(roster.find((member) => member.memberId === "backend")!, LABEL)!

// Real Atlas Memory log lines, written by Atlas's own durable store (backend rule, legacy-id rule, another seat's
// rule, a backend task record). The legacy owner is templated so the former name stays out of tracked files; each
// line carries its own content hash, so a wrong substitution makes the store partial and these tests fail.
const log = Bun.file(path.join(import.meta.dir, "../fixture/atlas-memory.jsonl"))
const OWN = "Wrap repository errors with the operation name"
const LEGACY = "Keep HTTP handlers thin"
const FOREIGN = "Foreign seat rule that must never reach the backend"
const TASK = "Task lesson that is not a header rule"

const agent = (id: string, prompt?: string): Agent.Info => ({
  id,
  name: id === "backend" ? LABEL : id,
  mode: "all",
  native: true,
  prompt,
  options: {},
  permission: [],
})

const writeLog = (directory: string, extra = "") =>
  Effect.promise(async () => {
    await mkdir(path.join(directory, ".atlas"), { recursive: true })
    const text = (await log.text()).replace("{{LEGACY_OWNER}}", LEGACY_BACKEND_ID)
    await Bun.write(path.join(directory, ".atlas/memory.jsonl"), text + extra)
  })

const prepare = (info: Agent.Info, purpose?: "context-maintenance") =>
  Effect.gen(function* () {
    const flags = yield* RuntimeFlags.Service
    const model = ProviderTest.model()
    return yield* LLMRequestPrep.prepare({
      purpose,
      sessionID: SessionID.make("ses_atlas"),
      model,
      agent: info,
      user: {
        id: MessageID.make("msg_atlas"),
        sessionID: SessionID.make("ses_atlas"),
        role: "user",
        agent: info.id ?? info.name,
        model: { providerID: model.providerID, modelID: model.id },
        time: { created: 0 },
      },
      system: ["ENVIRONMENT"],
      messages: [{ role: "user", content: "work" }],
      tools: {},
      provider: ProviderTest.info({}, model),
      auth: undefined,
      plugin: {
        trigger: (_name, _input, output) => Effect.succeed(output),
        list: () => Effect.succeed([]),
        init: () => Effect.void,
      },
      flags,
      isWorkflow: false,
    })
  })

const headerOf = (system: readonly string[]) => system[0]!.match(/<atlas-header[\s\S]*<\/atlas-header>/)?.[0]

it.instance(
  "a backend turn carries its own and its legacy-id rules, never another seat's rule or a task record",
  () =>
    Effect.gen(function* () {
      yield* writeLog((yield* TestInstance).directory)
      const header = headerOf((yield* prepare(agent("backend", charter))).system)
      expect(header).toBeDefined()
      expect(header).toContain('<atlas-header member="backend" rules="2"')
      expect(header).not.toContain("degraded")
      expect(header).toContain(OWN)
      expect(header).toContain(LEGACY)
      expect(header).not.toContain(FOREIGN)
      expect(header).not.toContain(TASK)
      expect(header).toContain("Awareness:")
      expect(header).toContain("Orientation: none recorded")
    }),
  { git: true },
)

it.instance(
  "the header is the last system part and leaves the charter and the other parts byte-identical",
  () =>
    Effect.gen(function* () {
      yield* writeLog((yield* TestInstance).directory)
      const system = (yield* prepare(agent("backend", charter))).system
      expect(system).toHaveLength(1)
      expect(system[0]).toBe([charter, "ENVIRONMENT", headerOf(system)].join("\n"))
      expect(system[0]!.slice(0, charter.length)).toBe(charter)
    }),
  { git: true },
)

it.instance(
  "other seats, title, compaction and maintenance turns get no header",
  () =>
    Effect.gen(function* () {
      yield* writeLog((yield* TestInstance).directory)
      for (const info of [
        agent("patty", "PATTY"),
        agent("title", "TITLE"),
        agent("compaction", "COMPACT"),
        agent("summary", "SUMMARY"),
      ])
        expect((yield* prepare(info)).system).toEqual([`${info.prompt}\nENVIRONMENT`])
      expect((yield* prepare({ ...agent("backend", charter), native: false })).system).toEqual([
        `${charter}\nENVIRONMENT`,
      ])
      expect((yield* prepare(agent("backend", charter), "context-maintenance")).system).toEqual([charter])
    }),
  { git: true },
)

it.instance(
  "a partial store keeps the verified rules and is marked degraded",
  () =>
    Effect.gen(function* () {
      yield* writeLog((yield* TestInstance).directory, '{"id":"torn","payload":\n')
      const header = headerOf((yield* prepare(agent("backend", charter))).system)
      expect(header).toContain('degraded="rules-partial"')
      expect(header).toContain(OWN)
      expect(header).not.toContain(FOREIGN)
    }),
  { git: true },
)

it.instance(
  "an unreadable store yields an explicit degraded line, never a silent omission or a failed turn",
  () =>
    Effect.gen(function* () {
      const directory = (yield* TestInstance).directory
      yield* Effect.promise(() => mkdir(path.join(directory, ".atlas/memory.jsonl"), { recursive: true }))
      const header = headerOf((yield* prepare(agent("backend", charter))).system)
      expect(header).toStartWith('<atlas-header member="backend" degraded="unavailable">Degraded:')
      expect(header).not.toContain("Project rules")
    }),
  { git: true },
)

it.instance(
  "a project with no Atlas memory yet gets a complete, empty header",
  () =>
    Effect.gen(function* () {
      const header = headerOf((yield* prepare(agent("backend", charter))).system)
      expect(header).toContain('rules="0"')
      expect(header).toContain("Project rules: none recorded")
      expect(header).not.toContain("degraded")
    }),
  { git: true },
)
