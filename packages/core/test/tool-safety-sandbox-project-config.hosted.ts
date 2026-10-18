// Dedicated hosted proof: excluded from ordinary Bun suffix discovery, selected by its exact path.
// A sandboxed shell command must not write the project config Orchestra loads and then runs on the host (LSP, formatter
// and MCP commands, plugins): not by overwriting, creating, `mv` over, symlinking or hard-linking it. macOS runs the
// real seatbelt profile; on Linux CI this relaxes the runner's AppArmor user-namespace restriction for bubblewrap and
// installs the sandbox's system dependencies when absent, and the product fetches its pinned srt itself.
import { expect } from "bun:test"
import { lstatSync } from "node:fs"
import path from "node:path"
import { Effect, Schedule } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { LayerNode } from "../src/effect/layer-node"
import { FSUtil } from "../src/fs-util"
import { AppProcess } from "../src/process"
import { ToolSafety } from "../src/tool-safety"
import { ToolSafetySandbox } from "../src/tool-safety-sandbox"
import { ToolSafetySandboxRuntime } from "../src/tool-safety-sandbox-runtime"
import { testEffect } from "./lib/effect"

const it = testEffect(LayerNode.compile(LayerNode.group([FSUtil.node, AppProcess.node])))
const confinable = process.platform === "darwin" || (process.platform === "linux" && process.env.CI === "true")
const live = confinable ? it.live : it.live.skip

const host = (command: string, args: string[]) =>
  Effect.gen(function* () {
    const processes = yield* AppProcess.Service
    return yield* processes.run(ChildProcess.make(command, args), { timeout: "10 minutes" }).pipe(Effect.flatMap(AppProcess.requireSuccess))
  })

// Linux: relax AppArmor for bubblewrap, install what the sandbox needs, then wait for the product's own srt fetch.
const prepared = Effect.gen(function* () {
  if (process.platform !== "linux") return
  yield* host("sudo", ["sysctl", "-w", "kernel.apparmor_restrict_unprivileged_userns=0"])
  if (!(yield* ToolSafetySandbox.available("bwrap")) || !(yield* ToolSafetySandbox.available("socat")))
    yield* host("sudo", ["apt-get", "install", "-y", "--no-install-recommends", "bubblewrap", "socat"])
  yield* ToolSafetySandboxRuntime.resolve(true).pipe(
    Effect.flatMap((value) => "directory" in value ? Effect.void : Effect.fail(value.reason)),
    Effect.retry({ schedule: Schedule.spaced("1 second"), times: 300 }),
  )
})

const project = Effect.gen(function* () {
  yield* prepared
  const fs = yield* FSUtil.Service
  const processes = yield* AppProcess.Service
  const root = yield* fs.makeTempDirectoryScoped({ prefix: "project-config-" }).pipe(Effect.flatMap(fs.realPath))
  const run = (script: string, options?: { profile?: ToolSafety.Profile; directory?: string }) => Effect.scoped(Effect.gen(function* () {
    const directory = options?.directory ?? root
    const command = yield* ToolSafetySandbox.wrap(ChildProcess.make("/bin/sh", ["-c", script], { cwd: directory })).pipe(
      Effect.provideService(ToolSafety.RuntimeProfile, options?.profile ?? { requireSandbox: true, writeRoots: [root], sandbox: { enabled: true } }),
      Effect.provideService(ToolSafety.NativeContext, { directory }),
    )
    return yield* processes.run(command, { timeout: "2 minutes" })
  }))
  const unconfined = (script: string, cwd = root) => processes.run(ChildProcess.make("/bin/sh", ["-c", script], { cwd }), { timeout: "30 seconds" })
  // lstat, so a dangling or planted symlink counts as present.
  const present = (name: string) => lstatSync(path.join(root, name), { throwIfNoEntry: false }) !== undefined
  return { fs, root, run, unconfined, present }
})

const names = ["orchestra.json", "orchestra.jsonc", "tui.json", "tui.jsonc", ".orchestra"]

live("creating a project config that does not exist yet is refused: write, mkdir, mv, symlink", () =>
  Effect.gen(function* () {
    const p = yield* project
    const attacks = [
      "echo '{}' > orchestra.json", "echo '{}' > orchestra.jsonc", "echo '{}' > tui.json", "echo '{}' > tui.jsonc",
      "mkdir .orchestra", "mkdir -p .orchestra/plugins && echo x > .orchestra/plugins/p.ts", "echo x > .orchestra",
      "echo '{}' > staged && mv staged orchestra.json", "echo '{}' > staged && mv staged .orchestra",
      "echo x > staged && ln -s staged orchestra.jsonc", "ln -s /bin/sh orchestra.json", "ln -s /tmp .orchestra",
    ]
    // Control: the same commands do create the files without the sandbox, so a refusal below is the sandbox's.
    const control = yield* p.fs.makeTempDirectoryScoped({ prefix: "project-config-control-" }).pipe(Effect.flatMap(p.fs.realPath))
    for (const attack of attacks.slice(0, 7)) {
      expect((yield* p.unconfined(attack, control)).exitCode).toBe(0)
      yield* p.fs.remove(control, { recursive: true, force: true })
      yield* p.fs.makeDirectory(control)
    }
    for (const attack of attacks) {
      const result = yield* p.run(attack)
      expect({ attack, exitCode: result.exitCode }).not.toEqual({ attack, exitCode: 0 })
      expect({ attack, present: names.filter(p.present) }).toEqual({ attack, present: [] })
    }
    // Names that only look similar, and everything else in the workspace, stay writable.
    const normal = yield* p.run("echo ok > normal.txt && mkdir -p sub/deep .hidden/deep && echo ok > sub/deep/f && echo ok > .hidden/deep/sample.txt && echo ok > orchestra.json.bak && mkdir .orchestra-cache && echo ok > notorchestra.json && mkdir -p sub/.orchestra-x")
    expect(normal.exitCode).toBe(0)
    expect(yield* p.fs.readFileString(path.join(p.root, "sub/deep/f"))).toBe("ok\n")
    // Recursive grep from '.' visits hidden paths; srt's absent-name guards must not break ordinary reads.
    const reads = yield* p.run("grep -r ok . && ls -la && find . -type f")
    expect(reads.exitCode).toBe(0)
    expect(reads.stdout.toString()).toContain("./sub/deep/f:ok")
    expect(reads.stdout.toString()).toContain("./.hidden/deep/sample.txt:ok")
    expect(reads.stderr.toString()).toBe("")
    expect(names.filter(p.present)).toEqual([])
    if (process.platform === "linux") {
      const protectedNames = [".bashrc", ".gitconfig", ".vscode"]
      const attacks = ["echo x > .bashrc", "echo x > .gitconfig", "mkdir .vscode", "echo x > staged && mv staged .bashrc", "echo x > staged && ln -s staged .gitconfig", "ln -s /tmp .vscode"]
      const control = yield* p.fs.makeTempDirectoryScoped({ prefix: "dotfile-control-" }).pipe(Effect.flatMap(p.fs.realPath))
      for (const attack of attacks) {
        expect((yield* p.unconfined(attack, control)).exitCode).toBe(0)
        yield* p.fs.remove(control, { recursive: true, force: true })
        yield* p.fs.makeDirectory(control)
        const result = yield* p.run(attack)
        expect({ attack, exitCode: result.exitCode }).not.toEqual({ attack, exitCode: 0 })
        expect({ attack, present: protectedNames.filter(p.present) }).toEqual({ attack, present: [] })
      }
    }
  }), 240_000,
)

live("an existing project config cannot be overwritten, removed, replaced or linked through; it stays readable", () =>
  Effect.gen(function* () {
    const p = yield* project
    yield* Effect.forEach(["orchestra.json", "orchestra.jsonc", "tui.json", ".orchestra/orchestra.json", ".orchestra/plugins/p.ts", ".orchestra/agents/a.md"], (file) =>
      p.fs.makeDirectory(path.dirname(path.join(p.root, file)), { recursive: true }).pipe(
        Effect.andThen(p.fs.writeFileString(path.join(p.root, file), `orig ${file}`)),
      ), { discard: true })
    const before = yield* Effect.forEach(["orchestra.json", "orchestra.jsonc", "tui.json", ".orchestra/orchestra.json", ".orchestra/plugins/p.ts", ".orchestra/agents/a.md"],
      (file) => p.fs.readFileString(path.join(p.root, file)).pipe(Effect.map((text) => [file, text] as const)))
    const attacks = [
      "echo pwn > orchestra.json", "echo pwn >> orchestra.json", "echo pwn > orchestra.jsonc", "echo pwn > tui.json", ": > orchestra.json",
      "rm orchestra.json", "rm -f orchestra.jsonc tui.json",
      "echo pwn > staged && mv staged orchestra.json", "echo pwn > staged && mv -f staged .orchestra/orchestra.json",
      "mv orchestra.json moved", "mv .orchestra moved", "rm -rf .orchestra",
      "echo pwn > staged && ln -sf staged orchestra.json", "echo pwn > staged && ln -sf staged .orchestra/orchestra.json",
      // The hard link must not become a second, writable name for the protected inode.
      "ln orchestra.json hard && echo pwn > hard", "ln .orchestra/orchestra.json hard && echo pwn >> hard",
      "echo pwn > .orchestra/orchestra.json", "echo pwn > .orchestra/plugins/p.ts", "echo pwn > .orchestra/plugins/new.ts",
      "mkdir .orchestra/tools && echo pwn > .orchestra/tools/t.ts", "echo pwn > .orchestra/agents/a.md", "rm .orchestra/agents/a.md",
      "chmod 777 orchestra.json",
    ]
    // An owner-approved edit-tool exception (`allowedConfigEdits`) never reaches the shell.
    const approved = { requireSandbox: true, writeRoots: [p.root], sandbox: { enabled: true }, allowedConfigEdits: ["orchestra.json", ".orchestra"] } satisfies ToolSafety.Profile
    for (const profile of [undefined, approved]) {
      for (const attack of attacks) {
        yield* p.run(attack, { profile })
        const after = yield* Effect.forEach(before, ([file]) => p.fs.readFileString(path.join(p.root, file)).pipe(Effect.map((text) => [file, text] as const)))
        expect({ attack, files: after }).toEqual({ attack, files: before })
        expect({ attack, moved: p.present("moved") }).toEqual({ attack, moved: false })
      }
    }
    const read = yield* p.run("cat orchestra.json .orchestra/plugins/p.ts")
    expect(read.exitCode).toBe(0)
    expect(read.stdout.toString()).toBe("orig orchestra.jsonorig .orchestra/plugins/p.ts")
    expect((yield* p.run("echo ok > normal.txt")).exitCode).toBe(0)
  }), 600_000,
)

live("a session opened in a subdirectory is covered: ancestors up to the write root cannot be given config", () =>
  Effect.gen(function* () {
    const p = yield* project
    const sub = path.join(p.root, "packages", "app")
    yield* p.fs.makeDirectory(sub, { recursive: true })
    yield* p.fs.writeFileString(path.join(p.root, "orchestra.json"), "orig")
    for (const attack of ["echo pwn > ../../orchestra.json", "mkdir ../../.orchestra", "echo pwn > ../../tui.json", "echo pwn > ../orchestra.jsonc", "echo pwn > orchestra.json", "mkdir .orchestra"]) {
      expect({ attack, exitCode: (yield* p.run(attack, { directory: sub })).exitCode }).not.toEqual({ attack, exitCode: 0 })
    }
    expect(yield* p.fs.readFileString(path.join(p.root, "orchestra.json"))).toBe("orig")
    expect(["apps/orchestra.jsonc", "packages/app/orchestra.json", "packages/app/.orchestra", ".orchestra", "tui.json"].filter(p.present)).toEqual([])
    expect((yield* p.run("echo ok > ../sibling.txt && echo ok > here.txt", { directory: sub })).exitCode).toBe(0)
  }), 240_000,
)
