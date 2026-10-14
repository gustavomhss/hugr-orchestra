import { describe, expect } from "bun:test"
import path from "node:path"
import fs from "node:fs/promises"
import { Cause, Effect, Exit, FileSystem } from "effect"
import { Flag } from "@orchestra/core/flag/flag"
import { ToolSafetyAppContainer } from "@orchestra/core/tool-safety-appcontainer"
import { ToolSafetySandbox } from "@orchestra/core/tool-safety-sandbox"
import { ToolSafetySandboxRuntime } from "@orchestra/core/tool-safety-sandbox-runtime"
import { ClaudeHostGate } from "@/claude-code/host/gate"
import { WriteRoots } from "@/maestro/write-roots"
import { Session } from "@/session/session"
import { seatShellRuns } from "../../fixture/seat-sandbox"
import { pollWithTimeout, testEffect } from "../../lib/effect"
import { expectSpawn } from "../../../../core/test/fixture/omni-expect"
import { ProcessFixture } from "./process-fixture"

const it = testEffect(ProcessFixture.layer)

// Adoption needs the real Omni spawner, as the shell tool's does.
const live = Flag.ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER === "off" ? it.instance.skip : it.instance
const fixture = ProcessFixture.fixture

describe("process MCP tool", () => {
  const sandbox = process.platform !== "win32" && seatShellRuns() ? live : it.instance.skip
  sandbox(
    "requireSandbox alone confines a maestro process start",
    () =>
      Effect.gen(function* () {
        const f = yield* fixture
        if (process.platform === "linux") {
          const runtime = yield* ToolSafetySandboxRuntime.ready()
          if (runtime.reason !== undefined) throw new Error(`Sandbox fixture not ready: ${runtime.reason}`)
          expect(runtime.directory).toBeTruthy()
        }
        expect(yield* ToolSafetySandbox.status()).toMatchObject({ shellWrites: "enforced" })
        const root = path.join(f.directory, "allowed")
        yield* Effect.promise(() => fs.mkdir(root))
        const escaped = path.join(f.directory, "escaped")
        const command = yield* f.node(
          "required.cjs",
          `
      const fs = require("node:fs")
      fs.writeFileSync(${JSON.stringify(path.join(root, "written"))}, "inside")
      try { fs.writeFileSync(${JSON.stringify(escaped)}, "escaped"); console.log("ESCAPED") }
      catch { console.log("denied") }
    `,
        )
        expectSpawn(import.meta.path)
        const result = yield* f.call(
          { action: "start", command, wait: 10_000 },
          { profile: { requireSandbox: true, writeRoots: [root] } },
        )
        expect(result.metadata.exit).toBe(0)
        expect(result.output).toContain("denied")
        expect(result.output).not.toContain("ESCAPED")
        expect(yield* Effect.promise(() => Bun.file(path.join(root, "written")).text())).toBe("inside")
        expect(yield* Effect.promise(() => Bun.file(escaped).exists())).toBe(false)
        expect(yield* f.processes.list(f.session.id)).toEqual([])
      }),
    60_000,
  )

  it.instance(
    "a required unavailable sandbox refuses start before any command runs",
    () =>
      Effect.gen(function* () {
        const f = yield* fixture
        const ran = path.join(f.directory, "ran")
        const command = yield* f.node(
          "unavailable.cjs",
          `require("node:fs").writeFileSync(${JSON.stringify(ran)}, "ran")`,
        )
        // Exact endpoint confinement ignores a PATH srt, so the real discovery references can remove every backend.
        const result = yield* f
          .call(
            { action: "start", command, wait: 10_000 },
            {
              profile: {
                requireSandbox: true,
                writeRoots: [f.directory],
                sandbox: {
                  enabled: true,
                  allowedLoopbackEndpoints: [{ directory: f.directory, host: "127.0.0.1", port: 12345 }],
                },
              },
            },
          )
          .pipe(
            Effect.provideService(ToolSafetyAppContainer.Launcher, ""),
            Effect.provideService(ToolSafetySandbox.Seatbelt, path.join(f.directory, "missing-sandbox-exec")),
            Effect.provideService(ToolSafetySandboxRuntime.Source, {
              directory: path.join(f.directory, "runtime"),
              artifacts: [],
              dependencies: ["orchestra-missing-sandbox-dependency"],
            }),
            Effect.exit,
          )
        expect(Exit.isFailure(result)).toBe(true)
        if (Exit.isFailure(result))
          expect(Cause.pretty(result.cause)).toMatch(
            /sandbox-loopback-endpoint-(backend-unavailable|exact-policy-unsupported)/,
          )
        expect(yield* Effect.promise(() => Bun.file(ran).exists())).toBe(false)
        expect(yield* f.processes.list(f.session.id)).toEqual([])
      }),
    60_000,
  )

  sandbox(
    "sandboxed start permits its write root, blocks other writes, and retains its jail until stop",
    () =>
      Effect.gen(function* () {
        const f = yield* fixture
        const root = path.join(f.directory, "allowed")
        yield* Effect.promise(() => fs.mkdir(root))
        const allowed = path.join(root, "written")
        const denied = path.join(f.directory, "escaped")
        const profile = WriteRoots.profile(undefined, [root], f.directory)
        const command = yield* f.node(
          "sandbox.cjs",
          `
      const fs = require("node:fs")
      fs.writeFileSync(${JSON.stringify(allowed)}, "inside")
      console.log("scratch=" + process.env.TMPDIR)
      const probe = () => {
        try { fs.writeFileSync(${JSON.stringify(denied)}, "escaped"); console.log("ESCAPED") }
        catch { console.log("denied") }
      }
      probe()
      setInterval(probe, 100)
    `,
        )
        expectSpawn(import.meta.path)
        const started = yield* f.call({ action: "start", command, wait: 1_000 }, { agent: "backend", profile })
        expect(started.metadata.exit).toBeNull()
        expect(started.output).toContain("denied")
        expect(started.output).not.toContain("ESCAPED")
        expect(yield* Effect.promise(() => Bun.file(allowed).text())).toBe("inside")
        expect(yield* Effect.promise(() => Bun.file(denied).exists())).toBe(false)
        const scratch = /scratch=([^\r\n]+)/.exec(started.output)?.[1]
        if (!scratch) throw new Error("sandbox did not report its scratch directory")
        expect(
          yield* Effect.promise(() =>
            fs.stat(scratch).then(
              (stat) => stat.isDirectory(),
              () => false,
            ),
          ),
        ).toBe(true)
        const tail = yield* pollWithTimeout(
          f
            .call({ action: "tail", id: started.metadata.id })
            .pipe(Effect.map((result) => (result.output.includes("denied") ? result : undefined))),
          "adopted sandbox never ran",
          "15 seconds",
        )
        expect(tail.output).not.toContain("ESCAPED")
        yield* f.call({ action: "stop", id: started.metadata.id })
        expect(
          yield* Effect.promise(() =>
            fs.stat(scratch).then(
              () => true,
              () => false,
            ),
          ),
        ).toBe(false)
      }),
    60_000,
  )

  sandbox(
    "a gate-prepared jail transfers once to process start and stays owned by the adopted tree",
    () =>
      Effect.gen(function* () {
        const f = yield* fixture
        const sessions = yield* Session.Service
        const root = path.join(f.directory, "allowed")
        yield* Effect.promise(() => fs.mkdir(root))
        yield* sessions.setPermission({
          sessionID: f.session.id,
          permission: yield* WriteRoots.bind("backend", ["allowed"], []).pipe(
            Effect.provideService(FileSystem.FileSystem, f.fs),
          ),
        })
        const profile = WriteRoots.profile(undefined, [root], f.directory)
        const ctx = f.context("backend")
        const gate = yield* ClaudeHostGate.live({ granted: { backend: ["process"] }, abort: ctx.abort }).pipe(
          Effect.provideService(FileSystem.FileSystem, f.fs),
        )
        yield* Effect.addFinalizer(() => gate.close)
        const command = yield* f.node(
          "prepared.cjs",
          `console.log("scratch=" + process.env.TMPDIR); setInterval(() => {}, 100)`,
        )
        const updated = yield* gate.confine({ sessionID: f.session.id, seat: "backend" }, command, ctx.callID!, {})
        if (!updated) throw new Error("process start was not jailed by the gate")
        expect(updated).not.toBe(command)
        expectSpawn(import.meta.path)
        const started = yield* f.call({ action: "start", command: updated, wait: 1_000 }, { ctx, profile })
        expect(started.metadata.pid).toBeGreaterThan(0)
        const scratch = /scratch=([^\r\n]+)/.exec(started.output)?.[1]
        if (!scratch) throw new Error("prepared jail did not start")
        // Post-tool cleanup and host closure must not release an adopted process's sandbox files.
        yield* gate.release(ctx.callID!)
        yield* gate.close
        expect(
          yield* Effect.promise(() =>
            fs.stat(scratch).then(
              (stat) => stat.isDirectory(),
              () => false,
            ),
          ),
        ).toBe(true)
        expect((yield* f.processes.list(f.session.id)).map((item) => item.pid)).toEqual([started.metadata.pid])
        yield* f.call({ action: "stop", id: started.metadata.id })
        expect(
          yield* Effect.promise(() =>
            fs.stat(scratch).then(
              () => true,
              () => false,
            ),
          ),
        ).toBe(false)
      }),
    60_000,
  )
})
