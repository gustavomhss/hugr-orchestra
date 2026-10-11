import { describe, expect } from "bun:test"
import os from "os"
import path from "path"
import { mkdir, rm, writeFile } from "fs/promises"
import { $ } from "bun"
import { Cause, Effect, Exit, Layer } from "effect"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { CrossSpawnSpawner } from "@orchestra/core/cross-spawn-spawner"
import { FSUtil } from "@orchestra/core/fs-util"
import { BackendToolkit } from "@orchestra/core/backend-toolkit"
import { ToolSafety } from "@orchestra/core/tool-safety"
import { ToolSafetySandbox } from "@orchestra/core/tool-safety-sandbox"
import { ToolSafetySandboxRuntime } from "@orchestra/core/tool-safety-sandbox-runtime"
import { Config } from "@/config/config"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { Truncate } from "@/tool/truncate"
import { TRUNCATION_DIR } from "@/tool/truncation-dir"
import { backendSkills } from "@/maestro/roster"
import { WriteRoots } from "@/maestro/write-roots"
import { Shell } from "@orchestra/core/shell"
import { ShellTool } from "../../src/tool/shell"
import { Agent } from "../../src/agent/agent"
import { Plugin } from "../../src/plugin"
import { SessionID, MessageID } from "../../src/session/schema"
import { provideInstance, testInstanceStoreLayer, tmpdirScoped } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { SEAT_SHELL_REFUSED, seatShellRuns } from "../fixture/seat-sandbox"

// The real shell tool for a native seat. The context approves every ask, so the workspace argument checks (ShellScan)
// let each command through and only the OS sandbox stands between the seat and a path outside its grants.
const it = testEffect(
  Layer.mergeAll(
    LayerNode.compile(
      LayerNode.group([CrossSpawnSpawner.node, FSUtil.node, Plugin.node, Truncate.node, Config.node, Agent.node, RuntimeFlags.node]),
    ),
    testInstanceStoreLayer,
  ),
)

const context = (agent: string) => ({
  sessionID: SessionID.make("ses_test"),
  messageID: MessageID.make("msg_test"),
  callID: "",
  agent,
  agentID: agent,
  abort: AbortSignal.any([]),
  messages: [],
  metadata: () => Effect.void,
  ask: () => Effect.void,
})

const shell = (directory: string, agent: string, command: string) =>
  Effect.gen(function* () {
    const info = yield* ShellTool
    const tool = yield* info.init()
    return yield* tool.execute({ command }, context(agent))
  }).pipe(provideInstance(directory))

const python = Bun.which("python3")
Shell.acceptable.reset()
// The runtime as the first word of a command, spelled for the session's shell (PowerShell needs the call operator).
const bun = `${["pwsh", "powershell"].includes(Shell.name(Shell.acceptable())) ? "& " : ""}"${process.execPath.replaceAll("\\", "/")}"`

// A secret outside every grant: in the account's real home, as ~/.config/<x>, and /etc/hostname where the host has one.
const secrets = Effect.acquireRelease(
  Effect.promise(async () => {
    const directory = path.join(os.homedir(), ".config", `orchestra-read-probe-${Math.random().toString(36).slice(2)}`)
    await mkdir(directory, { recursive: true })
    const file = path.join(directory, "secret.txt")
    await writeFile(file, "home-secret-body")
    return { directory, file, hostname: await Bun.file("/etc/hostname").text().then((text) => text.trim() || undefined, () => undefined) }
  }),
  (secret) => Effect.promise(() => rm(secret.directory, { recursive: true, force: true })),
)

// macOS and Linux hosts with a sandbox (Linux CI: runs that start with test/linux-sandbox.hosted.ts). Windows has no
// read sandbox, so seats there keep only the argument checks (below).
describe.skipIf(process.platform === "win32" || !seatShellRuns())("tool.shell read sandbox for native seats", () => {
  it.live("a seat's interpreter and variable reads outside its grants are denied by the sandbox; Maestro's are not", () =>
    Effect.gen(function* () {
      if (!python) throw new Error("BLOCKED: python3 unavailable on this host")
      const directory = yield* tmpdirScoped({ git: true })
      const secret = yield* secrets
      const probes = [
        { command: `"${python}" -c "print(open('${secret.file}').read())"`, body: "home-secret-body" },
        { command: `F="$HOME/.config/${path.basename(secret.directory)}/secret.txt" sh -c 'cat "$F"'`, body: "home-secret-body" },
        ...(secret.hostname ? [{ command: `"${python}" -c "print(open('/etc/hostname').read())"`, body: secret.hostname }] : []),
      ]
      for (const probe of probes) {
        // Control: Maestro keeps today's behaviour (argument checks and asks, no read sandbox), so the same read works.
        const maestro = yield* shell(directory, "maestro", probe.command)
        expect(maestro.metadata.exit, maestro.output).toBe(0)
        expect(maestro.output).toContain(probe.body)
        const seat = yield* shell(directory, "backend", probe.command)
        expect(seat.metadata.exit, seat.output).not.toBe(0)
        expect(seat.output).not.toContain(probe.body)
        expect(seat.output).toMatch(/Operation not permitted|Permission denied|PermissionError|No such file|FileNotFoundError/)
      }
    }), 300_000,
  )

  it.live("in-worktree reads, writes and the toolchain still work for a seat, including git in a linked worktree", () =>
    Effect.gen(function* () {
      const directory = yield* tmpdirScoped({ git: true })
      yield* Effect.promise(() => writeFile(path.join(directory, "inside.txt"), "inside-text"))
      yield* Effect.promise(() => $`git add inside.txt && git commit -m inside`.cwd(directory).quiet())
      const linked = `${directory}-linked`
      yield* Effect.promise(() => $`git worktree add ${linked}`.cwd(directory).quiet())
      yield* Effect.addFinalizer(() => Effect.promise(() => rm(linked, { recursive: true, force: true })))
      for (const [agent, command, expected] of [
        ["backend", "cat inside.txt", "inside-text"],
        ["backend", `${bun} --version`, Bun.version],
        ["backend", `${bun} -e "console.log(require('fs').readFileSync('inside.txt', 'utf8'))"`, "inside-text"],
        ["backend", "echo written > out.txt && cat out.txt", "written"],
        ["backend", "git status --short", "out.txt"],
        ["patty", "git log --oneline -1", "inside"],
        ...(python ? [["patty", `"${python}" -c "print(open('inside.txt').read())"`, "inside-text"]] : []),
      ]) {
        const result = yield* shell(directory, agent, command)
        expect(result.metadata.exit, `${agent}: ${command}: ${result.output}`).toBe(0)
        expect(result.output).toContain(expected)
      }
      const status = yield* shell(linked, "backend", "git status && git log --oneline -1")
      expect(status.metadata.exit, status.output).toBe(0)
      expect(status.output).toContain("inside")
    }), 300_000,
  )

  it.live("a bound child writes only inside its write root and still reads the rest of its worktree", () =>
    Effect.gen(function* () {
      const directory = yield* tmpdirScoped({ git: true })
      yield* Effect.promise(() => mkdir(path.join(directory, "src")).then(() => writeFile(path.join(directory, "inside.txt"), "inside-text")))
      const bound = (command: string) => shell(directory, "backend", command).pipe(
        Effect.provideService(ToolSafety.RuntimeProfile, WriteRoots.profile(undefined, [path.join(directory, "src")], directory)),
      )
      const inside = yield* bound("cat inside.txt > src/copy.txt && cat src/copy.txt")
      expect(inside.metadata.exit, inside.output).toBe(0)
      expect(inside.output).toContain("inside-text")
      const outside = yield* bound("echo escaped > escaped.txt")
      expect(outside.metadata.exit).not.toBe(0)
      expect(yield* Effect.promise(() => Bun.file(path.join(directory, "escaped.txt")).exists())).toBe(false)
    }), 300_000,
  )

  it.live("a seat reads its granted directories: saved tool output, its skill root and the backend toolkit", () =>
    Effect.gen(function* () {
      const directory = yield* tmpdirScoped({ git: true })
      const saved = path.join(TRUNCATION_DIR, `shell-read-sandbox-${Math.random().toString(36).slice(2)}.txt`)
      yield* Effect.acquireRelease(
        Effect.promise(() => mkdir(TRUNCATION_DIR, { recursive: true }).then(() => writeFile(saved, "saved-output"))),
        () => Effect.promise(() => rm(saved, { force: true })),
      )
      const toolkit = yield* tmpdirScoped()
      yield* Effect.promise(() => mkdir(path.join(toolkit, "bin"), { recursive: true }).then(() => writeFile(path.join(toolkit, "bin", "engine.txt"), "toolkit-file")))
      const run = (command: string) => shell(directory, "backend", command).pipe(Effect.provideService(BackendToolkit.Root, toolkit))
      const output = yield* run(`cat "${saved}"`)
      expect(output.metadata.exit, output.output).toBe(0)
      expect(output.output).toContain("saved-output")
      const skills = yield* run(`ls "${backendSkills.root}"`)
      expect(skills.metadata.exit, skills.output).toBe(0)
      expect(skills.output).toContain("backend-implement")
      const engine = yield* run(`cat "${path.join(toolkit, "bin", "engine.txt")}"`)
      expect(engine.metadata.exit, engine.output).toBe(0)
      expect(engine.output).toContain("toolkit-file")
    }), 300_000,
  )
})

describe.skipIf(process.platform === "win32")("tool.shell without a sandbox", () => {
  it.live("a host without a sandbox refuses a seat's command with a named error and never runs it unconfined", () =>
    Effect.gen(function* () {
      const directory = yield* tmpdirScoped({ git: true })
      // Seatbelt and the fetched runtime taken away: the runtime's system dependency is missing.
      const none = <A, E, R>(effect: Effect.Effect<A, E, R>) => effect.pipe(
        Effect.provideService(ToolSafetySandbox.Seatbelt, path.join(directory, "missing-sandbox-exec")),
        Effect.provideService(ToolSafetySandboxRuntime.Source, {
          directory: path.join(directory, "runtime"), artifacts: [], dependencies: ["orchestra-missing-sandbox-dependency"],
        }),
      )
      // Precondition: no srt on PATH and no seatbelt, so nothing else can sandbox the command.
      expect(yield* none(ToolSafetySandbox.available())).toBeNull()
      const exit = yield* none(shell(directory, "backend", "touch ran")).pipe(Effect.exit)
      if (Exit.isSuccess(exit)) throw new Error(`a seat ran without a sandbox: ${exit.value.output}`)
      expect(Cause.pretty(exit.cause)).toContain(`Tool safety HOLD: ${SEAT_SHELL_REFUSED}: sandbox-dependency-missing: orchestra-missing-sandbox-dependency`)
      expect(yield* Effect.promise(() => Bun.file(path.join(directory, "ran")).exists())).toBe(false)
      // Maestro keeps today's behaviour on the same host.
      const maestro = yield* none(shell(directory, "maestro", "touch ran"))
      expect(maestro.metadata.exit).toBe(0)
      expect(yield* Effect.promise(() => Bun.file(path.join(directory, "ran")).exists())).toBe(true)
    }), 60_000,
  )
})

describe.skipIf(process.platform !== "win32")("tool.shell on Windows", () => {
  it.live("Windows has no read sandbox: a seat's command runs with the argument checks only", () =>
    Effect.gen(function* () {
      const directory = yield* tmpdirScoped({ git: true })
      const outside = yield* tmpdirScoped()
      yield* Effect.promise(() => writeFile(path.join(outside, "secret.txt"), "outside-body"))
      // The context approves the external-directory ask; nothing else stops the read (documented limit).
      const result = yield* shell(directory, "backend", `${bun} -e "console.log(require('fs').readFileSync(process.argv[1], 'utf8'))" "${path.join(outside, "secret.txt").replaceAll("\\", "/")}"`)
      expect(result.metadata.exit, result.output).toBe(0)
      expect(result.output).toContain("outside-body")
    }), 60_000,
  )
})
