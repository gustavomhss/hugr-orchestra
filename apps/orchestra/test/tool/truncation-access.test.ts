import { afterEach, expect } from "bun:test"
import { Database } from "@orchestra/core/database/database"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { SessionV1 } from "@orchestra/core/v1/session"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { filesystem } from "@orchestra/core/effect/app-node-platform"
import { CrossSpawnSpawner } from "@orchestra/core/cross-spawn-spawner"
import { Ripgrep } from "@orchestra/core/ripgrep"
import { SessionProjector } from "@orchestra/core/session/projector"
import { FSUtil } from "@orchestra/core/fs-util"
import { ResearchRecords } from "@orchestra/core/research/records"
import { ResearchBinding } from "@orchestra/core/research/binding"
import { ResearchLedger } from "@orchestra/core/research/ledger"
import { Research } from "@orchestra/schema/research"
import { Cause, Effect, Exit, Schema } from "effect"
import path from "node:path"
import { Agent } from "@/agent/agent"
import { BackgroundJob } from "@/background/job"
import { Config } from "@/config/config"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Git } from "@/git"
import { roster } from "@orchestra/maestro/roster"
import { LogicalTask } from "@/maestro/logical-task"
import { ResearchExecution } from "@/research/allowance"
import { MCP } from "@/mcp"
import { Permission } from "@/permission"
import { Plugin } from "@/plugin"
import { scopeLinuxWorkspace } from "@orchestra/app-dock/app-dock-linux"
import { Provider } from "@/provider/provider"
import { MessageID, PartID } from "@/session/schema"
import { Session } from "@/session/session"
import { SessionRunState } from "@/session/run-state"
import { SessionStatus } from "@/session/status"
import { SessionTools } from "@/session/tools"
import { ToolRegistry } from "@/tool/registry"
import { Truncate } from "@/tool/truncate"
import { TestAppNodeBuilder } from "../fixture/app-node-builder"
import { disposeAllInstances, TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

afterEach(async () => {
  await disposeAllInstances()
})

const it = testEffect(
  TestAppNodeBuilder.build(
    LayerNode.group([
      filesystem,
      Agent.node,
      BackgroundJob.node,
      Config.node,
      CrossSpawnSpawner.node,
      Database.node,
      EventV2Bridge.node,
      FSUtil.node,
      Git.node,
      MCP.node,
      Permission.node,
      ResearchExecution.node,
      ResearchRecords.node,
      Plugin.node,
      Ripgrep.node,
      RuntimeFlags.node,
      Session.node,
      SessionProjector.node,
      SessionRunState.node,
      SessionStatus.node,
      ToolRegistry.node,
      Truncate.node,
    ]),
  ),
)

const model = {
  providerID: ProviderV2.ID.make("test"),
  api: { id: "test-model" },
} as Provider.Model

// The real Linux workspace agent, registered the way the App Dock plugin registers it.
const linux: { agent?: Record<string, Record<string, unknown>> } = {}
scopeLinuxWorkspace(linux)

// A truncated result either points at a saved file the agent can open with its real tools, or names no file at all.
it.instance(
  "every agent reads the saved output it is pointed at, and the rest are told to ask for less",
  () =>
    Effect.gen(function* () {
      const agents = yield* Agent.Service
      const truncate = yield* Truncate.Service
      const sessions = yield* Session.Service
      const execution = yield* ResearchExecution.Service
      const directory = (yield* TestInstance).directory
      const authority = yield* sessions.create({ agent: "maestro" })
      const template: SessionV1.Assistant = {
        id: MessageID.ascending(),
        sessionID: authority.id,
        parentID: MessageID.ascending(),
        role: "assistant",
        agent: "maestro",
        mode: "maestro",
        path: { cwd: directory, root: directory },
        cost: 0,
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
        modelID: ModelV2.ID.make("test-model"),
        providerID: ProviderV2.ID.make("test"),
        time: { created: Date.now() },
      }
      const text = Array.from({ length: 3000 }, (_, i) => `line${i}`).join("\n")
      const access: Record<string, "read" | "narrow"> = {}

      for (const agent of yield* agents.list()) {
        const session = agent.id === "jimmy"
          ? yield* sessions.create({ agent: "jimmy", parentID: authority.id })
          : authority
        if (agent.id === "jimmy")
          yield* LogicalTask.ensure({
            executionSessionID: session.id,
            authoritySessionID: authority.id,
            projectID: session.projectID,
            memberID: "jimmy",
            source: "host",
          })
        const message = {
          ...template,
          id: MessageID.ascending(),
          sessionID: session.id,
          agent: agent.id ?? agent.name,
          mode: agent.mode,
        }
        yield* sessions.updateMessage(message)
        // Resolve the real invocation bridge inside the host-issued parent allowance, just like native dispatch.
        yield* execution.enter(session.id, `saved-output:${agent.id ?? agent.name}`, Effect.gen(function* () {
          const result = yield* truncate.output(text, {}, agent)
          if (!result.truncated) throw new Error("expected truncated")
          const tools = yield* SessionTools.resolve({
            agent,
            model,
            session,
            processor: { message, updateToolCall: () => Effect.succeed(undefined), completeToolCall: () => Effect.void },
            bypassAgentCheck: true,
            messages: [],
            promptOps: {} as never,
          })
          const run = (tool: string, args: Record<string, unknown>, persisted = true) => Effect.gen(function* () {
            const execute = tools[tool]?.execute
            if (!execute) return undefined
            const callID = `call_${agent.id}_${tool}_${PartID.ascending()}`
            if (persisted) yield* sessions.updatePart({
              id: PartID.ascending(), sessionID: session.id, messageID: message.id, type: "tool", tool, callID,
              state: { status: "running", input: args, time: { start: Date.now() } },
            })
            // A pending call waits for the owner's reply, which is neither access nor a denial.
            return yield* Effect.promise(() =>
              execute(args, { toolCallId: callID, abortSignal: new AbortController().signal, messages: [] }),
            ).pipe(
              Effect.timeoutOrElse({
                duration: "10 seconds",
                orElse: () => Effect.die(new Error(`${agent.id} ${tool} asked the owner for permission`)),
              }),
              Effect.exit,
            )
          })
          const denied = (exit: Exit.Exit<unknown> | undefined) =>
            exit === undefined || (Exit.isFailure(exit) && Cause.pretty(exit.cause).includes("PermissionDeniedError"))

          // No seat may change or delete saved output, whether or not it may read it.
          if (roster.some((member) => member.memberId === agent.id && member.nativeProfile)) {
            expect(denied(yield* run("write", { filePath: result.outputPath, content: "changed" }))).toBe(true)
            expect(denied(yield* run("edit", { filePath: result.outputPath, oldString: "line0", newString: "x" }))).toBe(true)
            expect(denied(yield* run("bash", { command: `rm "${result.outputPath}"`, description: "remove" }))).toBe(true)
          }

          if (!result.content.includes(result.outputPath)) {
            expect(result.content).toContain("do not look for a file")
            expect(result.content).not.toContain("`read`")
            expect(result.content).not.toContain("`grep`")
            // The hint is withheld only from agents that really cannot open the file.
            expect(denied(yield* run("read", { filePath: result.outputPath }))).toBe(true)
            access[agent.id ?? agent.name] = "narrow"
            return
          }
          expect(result.content).toContain("Use `grep` to search the full content or `read` with offset/limit")
          const read = yield* run("read", { filePath: result.outputPath, offset: 2990, limit: 5 })
          if (!read || Exit.isFailure(read)) throw new Error(
            `${agent.id} cannot read the saved output it was pointed at${read && Exit.isFailure(read) ? `: ${Cause.pretty(read.cause)}` : ""}`,
          )
          expect(JSON.stringify(read.value)).toContain("line2990")
          if (agent.id === "jimmy") {
            const retained = Schema.decodeUnknownSync(Schema.Struct({
              output: Schema.String,
              metadata: Schema.Struct({ researchSource: Research.SourceReceipt, researchReceived: Research.SourceReceipt }),
            }))(read.value)
            const fs = yield* FSUtil.Service
            const records = yield* ResearchRecords.Service
            const binding = yield* ResearchBinding.resolve(session.id, session.projectID)
            expect(retained.metadata.researchSource.origin).toEqual({
              kind: "tool-output", uri: yield* fs.realPath(result.outputPath),
            })
            expect(retained.metadata.researchSource.observed).toEqual({ byteStart: 0, lineStart: 2990, lineEnd: 2994 })
            expect(retained.metadata.researchSource.complete).toBe(false)
            expect(retained.metadata.researchSource.derivedFrom).toEqual(retained.metadata.researchReceived.ref)
            expect(retained.metadata.researchReceived.ref.digest).toBe(ResearchLedger.digest(text))
            expect(retained.output).toContain("does not prove original-source completeness, absence, or runtime behavior")
            const projection = yield* records.view(binding, { action: "source", ref: retained.metadata.researchSource.ref })
            if (!("text" in projection)) throw new Error("Expected retained saved-output projection")
            expect(projection.text).toBe(text.split("\n").slice(2989, 2994).join("\n"))
            const raw = yield* records.view(binding, { action: "source", ref: retained.metadata.researchReceived.ref })
            if (!("text" in raw)) throw new Error("Expected retained received bytes")
            expect(raw.text).toBe(text.slice(0, Buffer.byteLength(raw.text, "utf8")))
            const forged = yield* run("read", { filePath: result.outputPath, limit: 1 }, false)
            expect(forged && Exit.isFailure(forged) && Cause.pretty(forged.cause)).toContain("Native assistant/tool part does not match")

            const outside = path.join(directory, "..", `outside-${PartID.ascending()}.txt`)
            yield* Effect.acquireRelease(fs.writeFileString(outside, "outside retained root"), () => fs.remove(outside).pipe(Effect.orDie))
            expect(denied(yield* run("read", { filePath: outside, limit: 1 }))).toBe(true)
            const alias = path.join(path.dirname(result.outputPath), `alias-${PartID.ascending()}`)
            yield* Effect.acquireRelease(fs.symlink(outside, alias), () => fs.remove(alias).pipe(Effect.orDie))
            expect(denied(yield* run("read", { filePath: alias, limit: 1 }))).toBe(true)
            const env = path.join(directory, ".env")
            yield* fs.writeFileString(env, "UNRECOGNIZED_SECRET=private")
            const envAlias = path.join(path.dirname(result.outputPath), `env-alias-${PartID.ascending()}`)
            yield* Effect.acquireRelease(fs.symlink(env, envAlias), () => fs.remove(envAlias).pipe(Effect.orDie))
            expect(denied(yield* run("read", { filePath: envAlias, limit: 1 }))).toBe(true)

            // These bytes are host fixture output, not model-authored receipt inputs.
            const capped = yield* truncate.write(Array.from({ length: 40 }, () => "x".repeat(1990)).join("\n"))
            const overCap = yield* run("read", { filePath: capped, limit: 40 })
            expect(overCap && Exit.isFailure(overCap) && Cause.pretty(overCap.cause)).toContain("Requested range exceeds 50 KB output limit")
            const malformed = yield* truncate.write("temporary native display")
            yield* fs.writeFile(malformed, new Uint8Array([0x78, 0xff, 0x0a]))
            const unsupported = yield* run("read", { filePath: malformed, limit: 1 })
            expect(unsupported && Exit.isFailure(unsupported) && Cause.pretty(unsupported.cause)).toContain("Observed file bytes are not supported UTF-8 text")
            const secret = yield* truncate.write("temporary native display")
            yield* fs.writeFileString(secret, "gh" + "p_" + "Q".repeat(40))
            const protectedOutput = yield* run("read", { filePath: secret, limit: 1 })
            expect(protectedOutput && Exit.isFailure(protectedOutput) && Cause.pretty(protectedOutput.cause)).toContain("recognized-secret-output")

            // Retention remains immutable even if the live display changes after the native read.
            yield* fs.writeFileString(result.outputPath, "later display")
            const historical = yield* records.view(binding, { action: "source", ref: retained.metadata.researchSource.ref })
            if (!("text" in historical)) throw new Error("Expected historical retained projection")
            expect(historical.text).toBe(projection.text)
            yield* fs.writeFileString(result.outputPath, text)
          }
          const grep = yield* run("grep", { pattern: "line2999", path: result.outputPath })
          if (grep && Exit.isFailure(grep)) throw new Error(`${agent.id} cannot grep the saved output it was pointed at`)
          if (grep) expect(JSON.stringify(grep.value)).toContain("line2999")
          access[agent.id ?? agent.name] = "read"
        }))
      }

      expect(access).toEqual({
        maestro: "read",
        general: "read",
        explore: "read",
        lucy: "read",
        billy: "read",
        jimmy: "read",
        frankie: "read",
        live: "read",
        // Bash and edit seats: external access to the directory would also let them run commands and edit there.
        backend: "narrow",
        archie: "narrow",
        patty: "narrow",
        rosie: "narrow",
        // The Linux workspace agent's tools reach only the workspace.
        linux: "narrow",
        // Hidden agents hold no tools.
        compaction: "narrow",
        title: "narrow",
        summary: "narrow",
      })
      yield* sessions.remove(authority.id)
    }),
  { config: linux },
)
