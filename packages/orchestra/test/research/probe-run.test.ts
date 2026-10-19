import { describe, expect } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { Cause, Effect, Exit, Schema } from "effect"
import { Database } from "@orchestra/core/database/database"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { filesystem, httpClient } from "@orchestra/core/effect/app-node-platform"
import { FSUtil } from "@orchestra/core/fs-util"
import { ModelV2 } from "@orchestra/core/model"
import { AppProcess } from "@orchestra/core/process"
import { ProviderV2 } from "@orchestra/core/provider"
import { ProbeRun } from "@orchestra/core/research-toolkit/probe/run"
import type { Probe } from "@orchestra/core/research-toolkit/probe/types"
import { ResearchAllowance } from "@orchestra/core/research/allowance"
import { ResearchRecords } from "@orchestra/core/research/records"
import { RipgrepBinary } from "@orchestra/core/ripgrep/binary"
import { SessionProjector } from "@orchestra/core/session/projector"
import { Research } from "@orchestra/schema/research"
import { Agent } from "@/agent/agent"
import { Config } from "@/config/config"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Git } from "@/git"
import { AtlasKnowledge } from "@/maestro/atlas-knowledge"
import { LogicalTask } from "@/maestro/logical-task"
import { Permission } from "@/permission"
import { ResearchExecution } from "@/research/allowance"
import { ResearchSeatTools } from "@/research/seat-tools"
import { Instruction } from "@/session/instruction"
import { MessageID, PartID } from "@/session/schema"
import { Session } from "@/session/session"
import { Skill } from "@/skill"
import { ToolRegistry } from "@/tool/registry"
import { Tool } from "@/tool/tool"
import { Truncate } from "@/tool/truncate"
import { expectSpawn } from "../../../core/test/fixture/omni-expect"
import { TestAppNodeBuilder } from "../fixture/app-node-builder"
import { TestInstance } from "../fixture/fixture"
import { jail } from "../fixture/sandbox-host"
import { testEffect } from "../lib/effect"

// probe_run as the seat calls it (J4, J1.10): through the registry's wrapped tool, inside one native dispatch, over the
// probe-repo fixture with its planted type error and clamp defect.

const it = testEffect(TestAppNodeBuilder.build(LayerNode.group([
  Agent.node, Config.node, Git.node, Session.node, SessionProjector.node, Database.node, Permission.node, FSUtil.node,
  Skill.node, Truncate.node, filesystem, httpClient, Instruction.node, AtlasKnowledge.node,
  EventV2Bridge.node, ResearchExecution.node, ResearchAllowance.node, ResearchRecords.node, AppProcess.node, RipgrepBinary.node,
  ToolRegistry.node,
]), [[RuntimeFlags.node, RuntimeFlags.layer({ pure: true, disableDefaultPlugins: true, disableExternalSkills: true })]]))
// A probe runs only inside the host's real jail; elsewhere it refuses, which the core probe tests cover.
const live = jail ? it.instance : it.instance.skip

const model = { providerID: ProviderV2.ID.make("openai"), modelID: ModelV2.ID.make("gpt-test") }
const DISPATCH = "probe-run-dispatch"
const FIXTURE = path.join(import.meta.dir, "fixtures", "probe-repo")

// The fixture as an untracked worktree with the project's own typescript; bunfig.toml selects bun as its test runner.
const repo = (directory: string) => Effect.promise(async () => {
  await fs.cp(FIXTURE, directory, { recursive: true })
  await Bun.write(path.join(directory, "bunfig.toml"), "")
  await Bun.write(path.join(directory, ".gitignore"), "node_modules\n")
  await fs.mkdir(path.join(directory, "node_modules"))
  await fs.symlink(path.dirname(Bun.resolveSync("typescript/package.json", import.meta.dir)), path.join(directory, "node_modules", "typescript"), "junction")
})

const setup = Effect.fn("ProbeRunTest.setup")(function* () {
  const sessions = yield* Session.Service
  const agents = yield* Agent.Service
  const permission = yield* Permission.Service
  const registry = yield* ToolRegistry.Service
  const execution = yield* ResearchExecution.Service
  const allowances = yield* ResearchAllowance.Service
  const instance = yield* TestInstance
  const authority = yield* sessions.create({ agent: "maestro", title: "Probe authority" })
  const child = yield* sessions.create({ agent: ResearchSeatTools.SEAT, title: "Probe execution", parentID: authority.id })
  yield* LogicalTask.ensure({ executionSessionID: child.id, authoritySessionID: authority.id,
    projectID: child.projectID, memberID: ResearchSeatTools.SEAT, source: "host" })
  const agent = yield* agents.get(ResearchSeatTools.SEAT)
  const tools = yield* registry.tools({ ...model, agent })
  const user = yield* sessions.updateMessage({ id: MessageID.ascending(), sessionID: child.id, role: "user",
    agent: ResearchSeatTools.SEAT, model, time: { created: Date.now() } })
  const assistant = { id: MessageID.ascending(), sessionID: child.id, role: "assistant" as const, parentID: user.id,
    agent: ResearchSeatTools.SEAT, mode: "subagent", path: { cwd: instance.directory, root: instance.directory },
    ...model, cost: 0, tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }, time: { created: Date.now() } }
  yield* sessions.updateMessage(assistant)
  const context = (callID: string): Tool.Context => ({
    sessionID: child.id, messageID: assistant.id, callID, agent: agent.name, agentID: ResearchSeatTools.SEAT,
    permission: agent.permission, abort: AbortSignal.any([]), messages: [], metadata: () => Effect.void,
    ask: (request) => permission.ask({ ...request, sessionID: child.id, tool: { messageID: assistant.id, callID }, ruleset: agent.permission }).pipe(Effect.orDie),
  })
  const call = (name: string, args: unknown) => Effect.gen(function* () {
    const found = tools.find((candidate) => candidate.id === name)
    if (!found) throw new Error(`Missing native research tool: ${name}`)
    const callID = PartID.ascending()
    yield* sessions.updatePart({ type: "tool", id: PartID.ascending(), sessionID: child.id, messageID: assistant.id, callID, tool: name,
      state: { status: "running", input: {}, time: { start: Date.now() } } })
    return yield* execution.enter(child.id, DISPATCH, found.execute(args, context(callID)))
  })
  const probe = (input: Probe.ProbeInput) => call("probe_run", input).pipe(Effect.map((result) => ({
    result: JSON.parse(result.output.split("\n\nRetained source evidence:")[0]) as Probe.ProbeResult & { error?: string },
    receipt: Schema.decodeUnknownSync(Research.SourceReceipt)(result.metadata.researchSource),
  })))
  const refused = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(Effect.exit, Effect.map((exit) => Exit.isFailure(exit) ? Cause.pretty(exit.cause) : "accepted"))
  // Spends probe seconds of this dispatch's own ledger directly, as earlier probes would have.
  const spend = (seconds: number) => execution.enter(child.id, DISPATCH, Effect.gen(function* () {
    const frame = yield* ResearchExecution.Current
    if (!frame) throw new Error("No research frame")
    yield* allowances.charge(frame.allowance, "probe", `probe:spent:${seconds}`, seconds)
  }))
  return { call, probe, refused, spend, cleanup: sessions.remove(authority.id) }
})

const script = (source: string, extra?: Partial<Probe.ProbeInput>): Probe.ProbeInput =>
  ({ snapshot: { kind: "worktree" }, runner: { kind: "script", language: "ts", source }, ...extra })

const REPRO = `const { clamp } = await import(process.cwd() + "/src/clamp.ts")
const got = clamp(10, 0, 10)
console.log(got === 10 ? "OK" : \`DEFECT clamp(10, 0, 10) = \${got}\`)
`

describe("probe_run", () => {
  live("a typecheck probe reports the planted TS2322 in original coordinates, retained as a probe source", () =>
    Effect.gen(function* () {
      expectSpawn(import.meta.path)
      const fixture = yield* setup()
      const { result, receipt } = yield* fixture.probe({ snapshot: { kind: "worktree" }, runner: { kind: "typecheck", project: "tsconfig.json" } })
      const line = (yield* Effect.promise(() => Bun.file(path.join(FIXTURE, "src", "typed.ts")).text())).split("\n")
        .findIndex((text) => text.startsWith("export const count")) + 1
      expect(result.verdict, result.stdout.tail).toBe("failed")
      expect(result.diagnostics).toContainEqual(expect.objectContaining({ path: "src/typed.ts", line, column: 14, code: "TS2322" }))
      expect(result.memoryCap).toBe(ProbeRun.memoryCap())
      expect(receipt.origin).toEqual({ kind: "tool-output", uri: `probe:${receipt.binding.executionSessionID}/${result.probeID}` })
      expect(receipt.ref.representation).toBe("structured-json")
      yield* fixture.cleanup
    }), { git: true, init: repo }, 120_000)

  live("a test probe shows the planted clamp defect", () =>
    Effect.gen(function* () {
      expectSpawn(import.meta.path)
      const fixture = yield* setup()
      const { result } = yield* fixture.probe({ snapshot: { kind: "worktree" }, runner: { kind: "test", file: "test/clamp.fixture.ts" } })
      expect(result.verdict, result.stderr.tail).toBe("failed")
      expect(`${result.stdout.tail}\n${result.stderr.tail}`).toContain("a value equal to the upper bound is kept")
      expect(`${result.stdout.tail}\n${result.stderr.tail}`).toMatch(/Received: 9/)
      yield* fixture.cleanup
    }), { git: true, init: repo }, 120_000)

  live("with a hypothesis the probe resolves it, and its receipt is citable by inquiry claim and passes inquiry check", () =>
    Effect.gen(function* () {
      expectSpawn(import.meta.path)
      const fixture = yield* setup()
      const inquiry = (input: Research.InquiryInput) => fixture.call("inquiry", input)
      const open = Schema.decodeUnknownSync(Schema.Struct({ subquestions: Schema.Array(Research.RecordRef) }))(
        (yield* inquiry({ action: "open", question: "Does clamp keep its upper bound?", subquestions: ["What does clamp(10, 0, 10) return"],
          profile: "investigate" })).metadata.inquiry)
      const hypothesis = Schema.decodeUnknownSync(Schema.Struct({ hypothesis: Research.RecordRef }))((yield* inquiry({
        action: "hypothesize", subquestion: open.subquestions[0], proposition: "clamp(10, 0, 10) returns 9" })).metadata.inquiry).hypothesis
      const { result, receipt } = yield* fixture.probe(script(REPRO, { expect: { stdoutIncludes: "DEFECT" }, hypothesis }))
      expect(result.verdict, result.stderr.tail).toBe("reproduced")
      expect(result.script?.representation).toBe("text")
      // Tool output is never a claim's only evidence (R1): the claim pairs the probe with the line it observed.
      const code = Schema.decodeUnknownSync(Research.SourceReceipt)((yield* fixture.call("read", { filePath: "src/clamp.ts" })).metadata.researchSource).ref
      yield* inquiry({ action: "claim", subquestion: open.subquestions[0], proposition: "clamp(10, 0, 10) returns 9", nature: "observation",
        evidence: [{ source: receipt.ref, pointer: "/verdict" }, { source: code, lines: { start: 5, end: 5 } }] })
      const check = yield* inquiry({ action: "check" })
      expect(check.output).toContain("\"verdict\":\"pass\"")
      // The host already resolved the hypothesis from the probe (J4.10), so it is no longer open.
      expect(yield* fixture.refused(inquiry({ action: "resolve", hypothesis, status: "confirmed", evidence: [{ source: receipt.ref, pointer: "/verdict" }] })))
        .toContain("is not an open hypothesis")
      yield* fixture.cleanup
    }), { git: true, init: repo }, 120_000)

  live("probe seconds are charged per probe: once they run out, the next probe is refused with the named error", () =>
    Effect.gen(function* () {
      expectSpawn(import.meta.path)
      const fixture = yield* setup()
      yield* fixture.spend(Research.ProbeSeconds.quick - 1)
      expect((yield* fixture.probe(script("console.log('first')"))).result.verdict).toBe("passed")
      const refused = yield* fixture.refused(fixture.probe(script("console.log('second')")))
      expect(refused).toContain(`Research probe allowance exhausted (${Research.ProbeSeconds.quick}/${Research.ProbeSeconds.quick} seconds)`)
      yield* fixture.cleanup
    }), { git: true, init: repo }, 120_000)

  it.instance("an exhausted probe allowance refuses before any snapshot or process", () =>
    Effect.gen(function* () {
      const fixture = yield* setup()
      yield* fixture.spend(Research.ProbeSeconds.quick)
      expect(yield* fixture.refused(fixture.probe(script("console.log('never')")))).toContain("Research probe allowance exhausted")
      yield* fixture.cleanup
    }), { git: true, init: repo }, 60_000)
})
