import { expect, test } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { createNativeMemory } from "@orchestra/atlas-boundary/native-memory"
import { AgentV2 } from "@orchestra/core/agent"
import { BackendToolkit } from "@orchestra/core/backend-toolkit"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { GitCli } from "@orchestra/core/git-cli"
import { Location } from "@orchestra/core/location"
import { PermissionV2 } from "@orchestra/core/permission"
import { Project } from "@orchestra/core/project"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionV2 } from "@orchestra/core/session"
import { SessionMessage } from "@orchestra/core/session/message"
import { Tool } from "@orchestra/core/tool/tool"
import { Effect, Layer } from "effect"
import { MaestroSeats } from "../src/v2/seats-service"
import { MaestroAtlasMemoryTools } from "../src/v2/tools/atlas-memory"

// V2 atlas_memory_recall / atlas_memory_emit against a real git worktree and Atlas's real native Memory: Maestro and
// non-memory seats are refused before any permission ask, a memory seat recalls and writes its own records under the
// actual call's binding, and an identical resubmission writes nothing new.

const sessionID = SessionV2.ID.make("ses_atlas_memory_v2")
const TASK = {
  taskId: "T-17",
  attempted: ["wrapped repository errors with the operation name"],
  failedWith: ["go vet: unused import in handler.go"],
  stoppedAt: "handler compiles; list endpoint not started",
  lesson: "run go vet before the handler tests",
}

async function worktree() {
  const directory = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "maestro-atlas-memory-v2-")))
  await fs.writeFile(path.join(directory, "README.md"), "fixture\n")
  await Effect.runPromise(
    Effect.gen(function* () {
      const cli = yield* GitCli.Service
      yield* Effect.forEach([["init", "-q"], ["add", "README.md"], ["commit", "-q", "-m", "fixture"]], (args) =>
        cli
          .run(["-c", "user.email=atlas@example.com", "-c", "user.name=Atlas", "-c", "commit.gpgsign=false", ...args], {
            cwd: directory,
          })
          .pipe(
            Effect.tap((result) =>
              result.exitCode === 0 ? Effect.void : Effect.die(new Error(`git ${args.join(" ")} failed`)),
            ),
          ),
      )
    }).pipe(Effect.provide(AppNodeBuilder.build(GitCli.node) as Layer.Layer<GitCli.Service>)),
  )
  // The clean fake scanner: Atlas pipes each record to it and treats exit 0 as clean.
  const scanner = path.join(await fs.mkdtemp(path.join(os.tmpdir(), "maestro-atlas-scanner-")), "gitleaks")
  await fs.writeFile(scanner, "#!/bin/sh\n/bin/cat >/dev/null\nexit 0\n")
  await fs.chmod(scanner, 0o755)
  return { directory, scanner }
}

function harness(directory: string, scanner: string) {
  const asks: PermissionV2.AssertInput[] = []
  const root = AbsolutePath.make(directory)
  const layer = Layer.mergeAll(
    AppNodeBuilder.build(GitCli.node) as Layer.Layer<GitCli.Service>,
    Layer.succeed(MaestroSeats.Service, MaestroSeats.make(["backend", "archie", "lucy"])),
    Layer.mock(AgentV2.Service, {
      get: (id) => Effect.succeed(["maestro", "backend", "lucy"].includes(id) ? AgentV2.Info.empty(id) : undefined),
    }),
    Layer.mock(PermissionV2.Service, { assert: (input) => Effect.sync(() => asks.push(input)) }),
    Layer.succeed(
      Location.Service,
      Location.Service.of({ directory: root, project: { id: Project.ID.make("prj_atlas_memory_v2"), directory: root } }),
    ),
  )
  const settle = (agent: string, name: string, input: unknown, id: string) =>
    Effect.runPromise(
      Effect.gen(function* () {
        const tools = MaestroAtlasMemoryTools.tools({
          agents: yield* AgentV2.Service,
          seats: yield* MaestroSeats.Service,
          permission: yield* PermissionV2.Service,
          git: yield* GitCli.Service,
          location: yield* Location.Service,
        })
        const tool = name === MaestroAtlasMemoryTools.names.recall ? tools.atlas_memory_recall : tools.atlas_memory_emit
        const settled = yield* Tool.settle(tool, { type: "tool-call", id, name, input }, {
          sessionID,
          agent: AgentV2.ID.make(agent),
          assistantMessageID: SessionMessage.ID.make("msg_atlas_memory_v2"),
          toolCallID: id,
        })
        const structured = settled.structured as { output: string; atlasMemory?: MaestroAtlasMemoryTools.Receipt }
        return { body: JSON.parse(structured.output), receipt: structured.atlasMemory }
      }).pipe(
        Effect.provideService(BackendToolkit.Target, { unsupported: "test-pins-its-scanner" }),
        Effect.provideService(MaestroAtlasMemoryTools.Open, (binding) =>
          createNativeMemory({ ...binding, scanner: { name: "gitleaks", command: scanner } }),
        ),
        Effect.provide(layer),
      ),
    )
  return { asks, settle }
}

test("Maestro and seats without Atlas Memory are refused before any permission ask", async () => {
  const fixture = await worktree()
  const host = harness(fixture.directory, fixture.scanner)
  for (const agent of ["maestro", "lucy"]) {
    const recalled = await host.settle(agent, "atlas_memory_recall", { kind: "task", taskId: "T-17" }, `call_${agent}`)
    expect(recalled).toEqual({
      body: { outcome: "unavailable", reason: "the executing member is not a supported native Atlas owner" },
      receipt: undefined,
    })
    const emitted = await host.settle(agent, "atlas_memory_emit", { entry: TASK }, `call_${agent}_emit`)
    expect(emitted.receipt).toBeUndefined()
  }
  expect(host.asks).toEqual([])
})

test("a memory seat writes its own record once under the actual call and recalls it", async () => {
  const fixture = await worktree()
  const host = harness(fixture.directory, fixture.scanner)
  const empty = await host.settle("backend", "atlas_memory_recall", { kind: "task", taskId: "T-17" }, "call_recall_empty")
  expect(empty.body).toEqual({ store: "complete", records: [] })
  expect(empty.receipt).toMatchObject({
    schema: "atlas-memory-receipt-v1",
    op: "recall",
    outcome: "read",
    store: "complete",
    binding: {
      projectID: "prj_atlas_memory_v2",
      root: fixture.directory,
      memoryOwner: "backend",
      sessionID,
      callID: "call_recall_empty",
      assistantMessageID: "msg_atlas_memory_v2",
    },
  })

  const first = await host.settle("backend", "atlas_memory_emit", { entry: TASK }, "call_emit_first")
  expect(first.receipt).toMatchObject({ op: "emit", outcome: "admitted", binding: { callID: "call_emit_first" } })
  expect(first.receipt?.ref).toBeDefined()
  expect(first.receipt?.reconciled).toBeUndefined()
  expect(first.body.note).toBe("Remembered.")

  const again = await host.settle("backend", "atlas_memory_emit", { entry: TASK }, "call_emit_again")
  expect(again.receipt).toMatchObject({ outcome: "admitted", reconciled: true, ref: first.receipt?.ref })
  expect(again.body.note).toBe("Already recorded; nothing new was written.")

  const recalled = await host.settle("backend", "atlas_memory_recall", { kind: "task", taskId: "T-17" }, "call_recall")
  expect(recalled.body).toEqual({ store: "complete", records: [{ ref: first.receipt?.ref, kind: "task", entry: TASK }] })
  expect(host.asks.map((ask) => [ask.action, ask.resources, ask.source])).toEqual(
    ["call_recall_empty", "call_emit_first", "call_emit_again", "call_recall"].map((callID) => [
      callID.includes("emit") ? "atlas_memory_emit" : "atlas_memory_recall",
      ["backend"],
      { type: "tool", messageID: "msg_atlas_memory_v2", callID },
    ]),
  )
})
