import { describe, expect, test } from "bun:test"
import path from "path"
import { Effect } from "effect"
import type { SessionV1 } from "@orchestra/core/v1/session"
import { ProviderV2 } from "@orchestra/core/provider"
import { ModelV2 } from "@orchestra/core/model"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { CrossSpawnSpawner } from "@orchestra/core/cross-spawn-spawner"
import { FSUtil } from "@orchestra/core/fs-util"
import { Database } from "@orchestra/core/database/database"
import { SessionProjector } from "@orchestra/core/session/projector"
import { BackendEvidence } from "../../src/maestro/backend-evidence"
import { BackendResult } from "../../src/maestro/backend-result"
import { BackendWork } from "../../src/maestro/backend-work"
import { Session } from "../../src/session/session"
import { MessageID, PartID, SessionID } from "../../src/session/schema"
import { Agent } from "../../src/agent/agent"
import { Format } from "../../src/format"
import { LSP } from "../../src/lsp/lsp"
import { Truncate } from "../../src/tool/truncate"
import { Config } from "../../src/config/config"
import { Plugin } from "../../src/plugin"
import { RuntimeFlags } from "../../src/effect/runtime-flags"
import { EventV2Bridge } from "../../src/event-v2-bridge"
import { InstanceRef } from "../../src/effect/instance-ref"
import { InstanceState } from "../../src/effect/instance-state"
import { WriteTool } from "../../src/tool/write"
import { EditTool } from "../../src/tool/edit"
import { ApplyPatchTool } from "../../src/tool/apply_patch"
import { ShellTool } from "../../src/tool/shell"
import { TestAppNodeBuilder } from "../fixture/app-node-builder"
import { TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const directory = path.resolve("backend-evidence-fixture")
const sessionID = SessionID.make("ses_backend_evidence")
const placement = { executionSessionID: sessionID, directory }
const card: BackendResult.Card = {
  outcome: "done",
  changes: [{ path: "written.txt", change: "modified" }],
  checks: [{ checkId: "worker", command: "exit 0", cwd: directory, status: "pass", exitCode: 0 }],
  blockers: [], risks: ["Worker claim, not acceptance."], nextActions: [],
}

function assistant(parts: (messageID: MessageID) => SessionV1.Part[], id = sessionID): SessionV1.WithParts {
  const messageID = MessageID.ascending()
  return {
    info: {
      id: messageID, sessionID: id, role: "assistant", parentID: MessageID.ascending(), mode: "backend", agent: "backend",
      cost: 0, path: { cwd: directory, root: directory },
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      modelID: ModelV2.ID.make("evidence-test"), providerID: ProviderV2.ID.make("test"), time: { created: 1 }, finish: "stop",
    },
    parts: parts(messageID),
  }
}

function call(tool: string, input: Record<string, unknown>, metadata: Record<string, unknown> = {}, callID = "call_evidence") {
  return assistant((messageID) => [{
    id: PartID.ascending(), messageID, sessionID, type: "tool", tool, callID,
    state: { status: "completed", input, metadata, title: tool, output: "", time: { start: 1, end: 2 } },
  }])
}

function final(value = card, id = sessionID) {
  return assistant((messageID) => [{
    id: PartID.ascending(), messageID, sessionID: id, type: "text",
    text: "```backend-result\n" + JSON.stringify(value) + "\n```",
  }], id)
}

const result = BackendResult.assemble(final())
const unbound: BackendResult.WorkerEvidence["changes"] = [{ index: 0, evidence: "unbound", callIDs: [] }]
const bound: BackendResult.WorkerEvidence["changes"] = [{ index: 0, evidence: "bound", callIDs: ["call_evidence"] }]

describe("BackendEvidence", () => {
  for (const scenario of [
    { tool: "write", expected: { changes: bound, checks: unbound } },
    { tool: "edit", expected: { changes: bound, checks: unbound } },
    { tool: "apply_patch", expected: { changes: bound, checks: unbound } },
    { tool: "bash", expected: { changes: unbound, checks: bound } },
  ]) {
    test(`providerExecuted filter rejects completed ${scenario.tool} with otherwise matching evidence`, () => {
      const message = call(
        scenario.tool,
        {
          filePath: "written.txt",
          content: "new",
          oldString: "old",
          newString: "new",
          patchText: "*** Begin Patch\n*** Add File: written.txt\n+new\n*** End Patch",
          command: "exit 0",
          workdir: directory,
        },
        { exit: 0, files: [{ filePath: path.join(directory, "written.txt"), type: "add" }] },
      )
      const before = JSON.stringify(result)
      expect(BackendEvidence.bind(result, [message], placement)).toEqual(scenario.expected)
      expect(
        BackendEvidence.bind(result, [
          {
            ...message,
            parts: message.parts.map((part) => ({ ...part, metadata: { providerExecuted: true } })),
          },
        ], placement),
      ).toEqual({ changes: unbound, checks: unbound })
      expect(
        BackendEvidence.bind(result, [
          {
            ...message,
            parts: message.parts.map((part) => ({ ...part, metadata: { providerExecuted: false } })),
          },
        ], placement),
      ).toEqual(scenario.expected)
      expect(JSON.stringify(result)).toBe(before)
    })
  }

  test("binds explicit native write/edit and host patch inventory without changing claims", () => {
    for (const history of [
      [call("write", { filePath: "written.txt", content: "value" })],
      [call("edit", { filePath: path.join(directory, "written.txt"), oldString: "old", newString: "new" })],
      [call("apply_patch", { patchText: "deliberately unrelated input text" }, {
        files: [{ filePath: path.join(directory, "written.txt"), type: "add" }],
      })],
    ]) {
      const before = JSON.stringify(result)
      expect(BackendEvidence.bind(result, history, placement)).toEqual({ changes: bound, checks: unbound })
      expect(JSON.stringify(result)).toBe(before)
      expect(result.workerEvidence).toBeUndefined()
    }
  })

  test("binds both host-observed move paths", () => {
    const changes: BackendResult.Card["changes"] = [
      { path: "old.txt", change: "deleted" }, { path: "new.txt", change: "created" },
    ]
    expect(BackendEvidence.bind({ ...result, changes }, [call("apply_patch", {}, {
      files: [{ filePath: path.join(directory, "old.txt"), movePath: path.join(directory, "new.txt"), type: "move" }],
    })], placement).changes).toEqual([
      { index: 0, evidence: "bound", callIDs: ["call_evidence"] },
      { index: 1, evidence: "bound", callIDs: ["call_evidence"] },
    ])
  })

  test("read, glob, shell and generated shell mentions cannot prove file writes", () => {
    for (const history of [
      call("read", { filePath: "written.txt" }), call("glob", { pattern: "written.txt" }),
      call("bash", { command: "printf generated > written.txt" }, { exit: 0, files: ["written.txt"] }),
      call("hugr-compose", { path: "written.txt" }, { observed_changes: ["written.txt"], status: "generated" }),
      call("write", { filePath: "other.txt", content: "written.txt" }),
      call("write", { path: "written.txt" }),
      call("apply_patch", { patchText: "*** Add File: written.txt\n+new" }),
      call("apply_patch", {}, { files: [{ relativePath: "written.txt", type: "add" }] }),
      call("apply_patch", {}, { files: [{ filePath: "written.txt", type: "add" }] }),
    ]) expect(BackendEvidence.bind(result, [history], placement).changes).toEqual(unbound)
  })

  test("matches exact shell command and actual initial cwd, including workdir override", () => {
    expect(BackendEvidence.bind(result, [call("bash", { command: "exit 0" }, { exit: 0 })], placement).checks).toEqual(bound)
    const checks: BackendResult.Card["checks"] = [{ ...card.checks[0], cwd: path.join(directory, "nested") }]
    expect(BackendEvidence.bind({ ...result, checks }, [call("bash", { command: "exit 0", workdir: "nested" }, { exit: 0 })], placement).checks).toEqual(bound)
    expect(BackendEvidence.bind(result, [call("bash", { command: "exit 0", workdir: "nested" }, { exit: 0 })], placement).checks).toEqual(unbound)
    expect(BackendEvidence.bind(result, [call("bash", { command: " exit 0" }, { exit: 0 })], placement).checks).toEqual(unbound)
    expect(BackendEvidence.bind(result, [call("powershell", { command: "exit 0" }, { exit: 0 })], placement).checks).toEqual(unbound)
    if (process.platform === "win32") {
      expect(BackendEvidence.bind(result, [call("bash", { command: "exit 0", workdir: path.parse(directory).root.slice(0, 2) }, { exit: 0 })], placement).checks).toEqual(unbound)
    }
  })

  test("rejects contradictory exit/status and missing, held or malformed observed exits", () => {
    expect(BackendEvidence.bind(result, [], placement)).toEqual({ changes: unbound, checks: unbound })
    for (const metadata of [{ exit: 1 }, { exit: null }, {}, { exitCode: 0 }, { exit: "0" }, { exit: 0.5 }, { exit: NaN }, { exit: Infinity }]) {
      expect(BackendEvidence.bind(result, [call("bash", { command: "exit 0" }, metadata)], placement).checks).toEqual(unbound)
    }
    const failed: BackendResult.Card["checks"] = [{ ...card.checks[0], status: "fail", exitCode: 1 }]
    expect(BackendEvidence.bind({ ...result, checks: failed }, [call("bash", { command: "exit 0" }, { exit: 1 })], placement).checks).toEqual(bound)
    expect(BackendEvidence.bind({ ...result, checks: [{ ...card.checks[0], exitCode: 7 }] }, [call("bash", { command: "exit 0" }, { exit: 0 })], placement).checks).toEqual(unbound)
    for (const status of ["fail", "skip", "missing", "acquisition-error"] as const) {
      expect(BackendEvidence.bind({ ...result, checks: [{ ...card.checks[0], status }] }, [call("bash", { command: "exit 0" }, { exit: 0 })], placement).checks).toEqual(unbound)
    }
    expect(BackendEvidence.bind({ ...result, checks: [{ ...card.checks[0], exitCode: undefined }] }, [call("bash", { command: "exit 0" }, { exit: 1 })], placement).checks).toEqual(unbound)
  })

  test("foreign Session, failed/running parts and duplicate identities cannot bind", () => {
    for (const tool of ["write", "bash"]) {
      const message = call(tool, { filePath: "written.txt", command: "exit 0" }, { exit: 0 })
      const part = message.parts[0]
      if (part?.type !== "tool") throw new Error("missing tool fixture")
      const foreign = SessionID.make("ses_foreign_evidence")
      const histories: SessionV1.WithParts[][] = [
        [{ ...message, info: { ...message.info, sessionID: foreign } }],
        [{ ...message, parts: [{ ...part, sessionID: foreign }] }],
        [{ ...message, parts: [{ ...part, messageID: MessageID.ascending() }] }],
        [{ ...message, parts: [{ ...part, state: { status: "error", input: part.state.input, error: "held", time: { start: 1, end: 2 } } }] }],
        [{ ...message, parts: [{ ...part, state: { status: "running", input: part.state.input, time: { start: 1 } } }] }],
        [message, message],
        [message, call(tool, part.state.input, { exit: 0 })],
        [{ ...message, parts: [part, { ...part, callID: "different" }] }],
      ]
      for (const history of histories) expect(BackendEvidence.bind(result, history, placement)).toEqual({ changes: unbound, checks: unbound })
      expect(BackendEvidence.bind(result, [message], { ...placement, directory: "relative" })).toEqual({ changes: unbound, checks: unbound })
    }
  })
})

const it = testEffect(TestAppNodeBuilder.build(LayerNode.group([
  Session.node, Agent.node, Format.node, LSP.node, FSUtil.node, CrossSpawnSpawner.node, Truncate.node,
  Database.node, Config.node, Plugin.node, RuntimeFlags.node, EventV2Bridge.node, SessionProjector.node,
])))

it.instance("stored Session tracker binds real write/edit/patch/shell and retains evidence after failure", () =>
  Effect.gen(function* () {
    const instance = yield* TestInstance
    const sessions = yield* Session.Service
    const chat = yield* sessions.create({ title: "Backend evidence integration" })
    const workerCard: BackendResult.Card = { ...card, changes: [
      { path: "written.txt", change: "modified" }, { path: "patched.txt", change: "created" },
      { path: "generated.txt", change: "created" },
    ], checks: [
      { checkId: "ok", command: "exit 0", cwd: instance.directory, status: "pass", exitCode: 0 },
      { checkId: "bogus-pass", command: "exit 7", cwd: instance.directory, status: "pass", exitCode: 0 },
    ] }
    const ctx = {
      sessionID: chat.id, messageID: MessageID.ascending(), agent: "maestro", callID: "call_real_evidence",
      abort: new AbortController().signal, messages: [], metadata: () => Effect.void, ask: () => Effect.void,
    }
    const store = Effect.fnUntraced(function* (tool: string, input: Record<string, unknown>, output: { title: string; output: string; metadata: Record<string, unknown> }, callID: string) {
      const message = assistant((messageID) => [{
        id: PartID.ascending(), messageID, sessionID: chat.id, type: "tool", tool, callID,
        state: { status: "completed", input, ...output, time: { start: 1, end: 2 } },
      }], chat.id)
      yield* sessions.updateMessage(message.info)
      yield* sessions.updatePart(message.parts[0])
    })
    const write = yield* WriteTool
    const writeDef = yield* write.init()
    const writeArgs = { filePath: "written.txt", content: "before" }
    yield* store(write.id, writeArgs, yield* writeDef.execute(writeArgs, ctx), "call_write")
    const edit = yield* EditTool
    const editDef = yield* edit.init()
    const editArgs = { filePath: "written.txt", oldString: "before", newString: "after" }
    yield* store(edit.id, editArgs, yield* editDef.execute(editArgs, ctx), "call_edit")
    const patch = yield* ApplyPatchTool
    const patchDef = yield* patch.init()
    const patchArgs = { patchText: "*** Begin Patch\n*** Add File: patched.txt\n+host patch\n*** End Patch" }
    yield* store(patch.id, patchArgs, yield* patchDef.execute(patchArgs, ctx), "call_patch")
    const shell = yield* ShellTool
    const shellDef = yield* shell.init()
    for (const command of ["exit 0", "exit 7", "echo generated.txt"]) {
      const args = { command, description: "Evidence check" }
      yield* store(shell.id, args, yield* shellDef.execute(args, ctx), "call_" + command)
    }
    expect(yield* Effect.promise(() => Bun.file(path.join(instance.directory, "written.txt")).text())).toBe("after")
    expect(yield* Effect.promise(() => Bun.file(path.join(instance.directory, "patched.txt")).text())).toBe("host patch\n")
    const last = final(workerCard, chat.id)
    yield* sessions.updateMessage(last.info)
    yield* sessions.updatePart(last.parts[0])
    const published: BackendResult.WorkResult[] = []
    const tracker = BackendWork.track({ enabled: true, sessionID: chat.id, publish: (value) => Effect.sync(() => { published.push(value) }) })
    yield* tracker.record(last)
    const recorded = published[0]
    const expected: BackendResult.WorkerEvidence = {
      changes: [
        { index: 0, evidence: "bound", callIDs: ["call_edit", "call_write"] },
        { index: 1, evidence: "bound", callIDs: ["call_patch"] },
        { index: 2, evidence: "unbound", callIDs: [] },
      ],
      checks: [{ index: 0, evidence: "bound", callIDs: ["call_exit 0"] }, { index: 1, evidence: "unbound", callIDs: [] }],
    }
    expect(recorded?.workerEvidence).toEqual(expected)
    const pure = BackendResult.assemble(last)
    expect(recorded).toEqual({ ...pure, workerEvidence: expected })
    yield* tracker.hostEnded("failed", "Host verification failed")
    expect(published.at(-1)).toEqual({ ...recorded, terminal: { reason: "failed", hostDetail: "Host verification failed" } })
    const fresh = BackendWork.track({ enabled: true, sessionID: chat.id, publish: () => Effect.void })
    yield* fresh.hostEnded("interrupted", "Task cancelled")
    expect(fresh.attach({}).workResult?.workerEvidence).toEqual(expected)
    expect((yield* fresh.notice("completed", "Finished"))?.workerEvidence).toEqual(expected)
    expect((yield* fresh.notice("error", "Child failed"))?.workerEvidence).toEqual(expected)
    const misplaced = BackendWork.track({ enabled: true, sessionID: chat.id, publish: () => Effect.void })
    const context = yield* InstanceState.context
    yield* misplaced.record(last).pipe(Effect.provideService(InstanceRef, { ...context, directory: path.join(instance.directory, "other") }))
    expect(misplaced.attach({}).workResult?.workerEvidence).toBeUndefined()
    const missing = BackendWork.track({ enabled: true, sessionID: SessionID.create(), publish: () => Effect.void })
    yield* missing.record(last)
    expect(missing.attach({}).workResult?.workerEvidence).toBeUndefined()
  }),
  { config: { shell: process.platform === "win32" ? "powershell.exe" : "/bin/bash" } },
)
