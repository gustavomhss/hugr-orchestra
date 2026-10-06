import { describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { Cause, Effect, Exit, Layer } from "effect"
import { ArsenalBindings } from "@/maestro/arsenal-bindings"
import { WriteRoots } from "@/maestro/write-roots"
import { AppRuntime } from "@/effect/app-runtime"
import { InstanceStore } from "@/project/instance-store"
import { InstanceRef } from "@/effect/instance-ref"
import { Session } from "@/session/session"
import { MessageID, type SessionID } from "@/session/schema"
import { Global } from "@opencode-ai/core/global"
import { AppProcess } from "@opencode-ai/core/process"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { filesystem } from "@opencode-ai/core/effect/app-node-platform"
import { ToolSafety } from "@opencode-ai/core/tool-safety"
import { ToolSafetySandbox } from "@opencode-ai/core/tool-safety-sandbox"
import { BackendWork } from "@/maestro/backend-work"
import { Database } from "@opencode-ai/core/database/database"
import { Service } from "@/tool/registry"
import { Tool } from "@/tool/tool"
import { Permission } from "@/permission"
import { prepareArsenalSDK } from "./arsenal-fixture"
import { tmpdir } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

// F2.14: the host, not the prompt, decides where a bound backend child may write. These run the real write and shell
// tools through ArsenalBindings.withSession, the per-Session binding every native tool call goes through.

const it = testEffect(Layer.empty)
// What this host gives a bound child's shell: a jail (seatbelt or srt), or none yet and the reason.
const host = await Effect.runPromise(ToolSafetySandbox.status())
const sandbox = host.shellWrites === "enforced" ? host.shellSandbox.kind : undefined

const harness = (bindings: ReadonlyArray<string[] | undefined>, run: (input: {
  directory: string
  bound: SessionID[]
  unbound: SessionID
  write: (sessionID: SessionID, filePath: string) => Effect.Effect<Exit.Exit<unknown, unknown>>
  shell: (sessionID: SessionID, command: string) => Effect.Effect<Exit.Exit<{ metadata: { exit?: number | null }; output: string }, unknown>>
  // The production path: the shell call goes through ToolSafety.run, which observes it and records its shell fact.
  guarded: (sessionID: SessionID, command: string, observed: ToolSafety.Observation[]) => Effect.Effect<Exit.Exit<unknown, unknown>>
  database: Database.Interface
}) => Effect.Effect<void, unknown, never>) =>
  Effect.promise(async () => {
    await using tmp = await tmpdir({ git: true })
    await prepareArsenalSDK(tmp.path, Global.Path.config)
    const directory = await fs.realpath(tmp.path)
    await Promise.all(["src", "outside"].map((name) => fs.mkdir(path.join(directory, name))))
    await AppRuntime.runPromise(Effect.scoped(Effect.gen(function* () {
      const instances = yield* InstanceStore.Service
      const instance = yield* instances.load({ directory })
      yield* Effect.gen(function* () {
        const sessions = yield* Session.Service
        const native = yield* ArsenalBindings.make
        const registry = yield* Service
        const permission = yield* Permission.Service
        const tools = yield* registry.all()
        const tool = (id: string) => {
          const found = tools.find((item) => item.id === id)
          if (!found) throw new Error(`native ${id} tool missing`)
          return found
        }
        const parent = yield* sessions.create({ agent: "build" })
        const context = (sessionID: SessionID): Tool.Context => ({
          sessionID, messageID: MessageID.ascending(), callID: `call-${MessageID.ascending()}`, agent: "backend",
          agentID: "backend", abort: new AbortController().signal, messages: [], metadata: () => Effect.void,
          ask: (request) => permission.ask({ ...request, sessionID, ruleset: [{ permission: "*", pattern: "*", action: "allow" }] }).pipe(Effect.orDie),
        })
        const bound = yield* Effect.forEach(bindings, (writePaths) => Effect.gen(function* () {
          const permission = yield* WriteRoots.bind("backend", writePaths, [])
          return (yield* sessions.create({ parentID: parent.id, agent: "backend", permission })).id
        }))
        yield* run({
          directory,
          bound,
          unbound: parent.id,
          write: (sessionID, filePath) =>
            native.withSession(sessionID, tool("write").execute({ filePath, content: "written" }, context(sessionID))).pipe(Effect.exit),
          shell: (sessionID, command) =>
            native.withSession(sessionID, tool("bash").execute({ command, description: "write roots probe" }, context(sessionID))).pipe(
              Effect.map((result) => ({ metadata: result.metadata as { exit?: number | null }, output: result.output })),
              Effect.exit,
            ),
          database: yield* Database.Service,
          guarded: (sessionID, command, observed) =>
            native.withSession(sessionID, ToolSafety.make.pipe(Effect.flatMap((safety) => safety.run(
              { tool: "bash", args: { command }, sessionID, callID: `call-${MessageID.ascending()}`, directory, projectID: instance.project.id },
              tool("bash").execute({ command, description: "write roots probe" }, context(sessionID)),
              (value) => Effect.sync(() => observed.push(value)),
            )))).pipe(Effect.exit),
        })
      }).pipe(Effect.provideService(InstanceRef, instance))
    }).pipe(Effect.provide(LayerNode.compile(LayerNode.group([FSUtil.node, AppProcess.node, Global.node, filesystem]))))))
  })

const exists = (file: string) => Effect.promise(() => fs.access(file).then(() => true, () => false))
const held = (exit: Exit.Exit<unknown, unknown>, reason: string) => {
  expect(Exit.isFailure(exit)).toBe(true)
  if (Exit.isFailure(exit)) {
    const error = Cause.squash(exit.cause)
    expect(error instanceof Error ? error.message : String(error)).toContain(`Tool safety HOLD: ${reason}`)
  }
}

describe("backend write roots enforcement", () => {
  it.live("a bound child writes inside its roots, is held outside them, and absent roots mean read-only", () =>
    harness([["src", "docs/new.md"], undefined], (h) => Effect.gen(function* () {
      const [child, readOnly] = h.bound
      expect(Exit.isSuccess(yield* h.write(child, path.join(h.directory, "src", "inside.txt")))).toBe(true)
      expect(Exit.isSuccess(yield* h.write(child, path.join(h.directory, "docs", "new.md")))).toBe(true)
      held(yield* h.write(child, path.join(h.directory, "outside", "blocked.txt")), "write-outside-physical-roots")
      held(yield* h.write(child, path.join(h.directory, "docs", "other.md")), "write-outside-physical-roots")
      expect(yield* exists(path.join(h.directory, "outside", "blocked.txt"))).toBe(false)
      expect(yield* exists(path.join(h.directory, "docs", "other.md"))).toBe(false)

      held(yield* h.write(readOnly, path.join(h.directory, "src", "read-only.txt")), "write-outside-physical-roots")
      expect(yield* exists(path.join(h.directory, "src", "read-only.txt"))).toBe(false)

      // Direct use is unchanged: a Session the host bound no roots for writes as before.
      expect(Exit.isSuccess(yield* h.write(h.unbound, path.join(h.directory, "outside", "direct.txt")))).toBe(true)
    })),
    120000,
  )

  it.live(`the bound child's shell is confined (${sandbox ? `sandbox ${sandbox}` : `no sandbox: ${host.shellSandbox.reason}`})`, () =>
    harness([["src"]], (h) => Effect.gen(function* () {
      const [child] = h.bound
      const outside = path.join(h.directory, "outside")
      yield* Effect.promise(() => fs.writeFile(path.join(outside, "locked"), "x", { mode: 0o444 }))
      const escape = yield* h.shell(child, `printf escaped > outside/shell.txt`)
      if (!sandbox) {
        // Owner decision 2026-10-06: without a sandbox the shell runs without the write jail (the host fact says so,
        // see below); the edit tools still hold writes outside the roots.
        expect(Exit.isSuccess(escape) && escape.value.metadata.exit).toBe(0)
        expect(yield* exists(path.join(outside, "shell.txt"))).toBe(true)
        held(yield* h.write(child, path.join(outside, "edit.txt")), "write-outside-physical-roots")
        expect(yield* exists(path.join(outside, "edit.txt"))).toBe(false)
        return
      }
      expect(yield* exists(path.join(outside, "shell.txt"))).toBe(false)
      if (Exit.isSuccess(escape)) expect(escape.value.metadata.exit).not.toBe(0)
      const chmod = yield* h.shell(child, `chmod 644 outside/locked`)
      if (Exit.isSuccess(chmod)) expect(chmod.value.metadata.exit).not.toBe(0)
      expect((yield* Effect.promise(() => fs.stat(path.join(outside, "locked")))).mode & 0o777).toBe(0o444)
      const inside = yield* h.shell(child, `printf kept > src/shell.txt && printf t > "$TMPDIR/probe" && cat "$TMPDIR/probe" > /dev/null`)
      expect(Exit.isSuccess(inside) && inside.value.metadata.exit).toBe(0)
      expect(yield* Effect.promise(() => fs.readFile(path.join(h.directory, "src", "shell.txt"), "utf8"))).toBe("kept")
    })),
    120000,
  )

  it.live("the observation and the work result carry the shell fact", () =>
    harness([["src"]], (h) => Effect.gen(function* () {
      const [child] = h.bound
      const observed: ToolSafety.Observation[] = []
      expect(Exit.isSuccess(yield* h.guarded(child, `printf fact > src/fact.txt`, observed))).toBe(true)
      expect(observed.at(-1)).toMatchObject({ outcome: "success", ...host })
      const work = BackendWork.track({ enabled: true, sessionID: child, writeRoots: ["src"], publish: () => Effect.void })
      expect(yield* work.notice("completed", "done").pipe(Effect.provideService(Database.Service, h.database)))
        .toMatchObject({ writeRoots: ["src"], ...host })
    })),
    120000,
  )

  it.live("an unbound Session's shell is unchanged", () =>
    harness([], (h) => Effect.gen(function* () {
      const direct = yield* h.shell(h.unbound, `printf direct > outside/direct.txt`)
      expect(Exit.isSuccess(direct) && direct.value.metadata.exit).toBe(0)
      expect(yield* exists(path.join(h.directory, "outside", "direct.txt"))).toBe(true)
    })),
    120000,
  )
})

describe("WriteRoots.profile", () => {
  test("narrows bound roots to the project's own roots and always requires the sandbox", () => {
    const directory = path.resolve("/w")
    const at = (...parts: string[]) => path.join(directory, ...parts)
    expect(WriteRoots.profile(undefined, [at("src")], directory)).toEqual({
      writeRoots: [at("src")],
      requireSandbox: true,
      sandbox: { enabled: true, scratch: true, unconfinedFallback: true },
    })
    expect(WriteRoots.profile({ writeRoots: ["src"] }, [at("src", "a"), at("other"), directory], directory).writeRoots)
      .toEqual([at("src", "a"), "src"])
    expect(WriteRoots.profile({ writeRoots: [] }, [at("src")], directory).writeRoots).toEqual([])
    expect(WriteRoots.profile({ neverTouch: ["secret"] }, [], directory)).toMatchObject({ neverTouch: ["secret"], writeRoots: [] })
  })

  test("leaves Sessions without bound roots on the project loader", () => {
    const load = () => Effect.succeed(undefined)
    expect(WriteRoots.loader(load, { directory: "/w" })).toBe(load)
    expect(WriteRoots.loader(load, { directory: "/w", permission: [{ permission: "edit", pattern: "*", action: "allow" }] })).toBe(load)
    expect(WriteRoots.loader(load, { directory: "/w", permission: [{ permission: "tool_safety_write_root", pattern: "*", action: "deny" }] })).not.toBe(load)
  })
})
