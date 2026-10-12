// Exact-path hosted proof for pinned Linux srt; select this file explicitly in Linux CI.
import { expect } from "bun:test"
import path from "path"
import { pathToFileURL } from "url"
import { Effect, Schedule } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { LayerNode } from "../src/effect/layer-node"
import { FSUtil } from "../src/fs-util"
import { AppProcess } from "../src/process"
import { ToolSafety } from "../src/tool-safety"
import { ToolSafetySandbox } from "../src/tool-safety-sandbox"
import { ToolSafetySandboxRuntime } from "../src/tool-safety-sandbox-runtime"
import { ToolSafetySrtReadAlias } from "../src/tool-safety-srt-read-alias"
import { testEffect } from "./lib/effect"

const it = testEffect(LayerNode.compile(LayerNode.group([FSUtil.node, AppProcess.node])))

const host = (command: string, args: string[]) => Effect.gen(function* () {
  const processes = yield* AppProcess.Service
  return yield* processes.run(ChildProcess.make(command, args), { timeout: "10 minutes" }).pipe(Effect.flatMap(AppProcess.requireSuccess))
})

const prepared = Effect.gen(function* () {
  if (process.platform !== "linux" || process.env.CI !== "true")
    throw new Error("BLOCKED: this hosted regression requires Linux CI")
  yield* host("sudo", ["sysctl", "-w", "kernel.apparmor_restrict_unprivileged_userns=0"])
  if (!(yield* ToolSafetySandbox.available("bwrap")) || !(yield* ToolSafetySandbox.available("socat")))
    yield* host("sudo", ["apt-get", "install", "-y", "--no-install-recommends", "bubblewrap", "socat"])
  yield* ToolSafetySandboxRuntime.resolve(true).pipe(
    Effect.flatMap((value) => "directory" in value ? Effect.void : Effect.fail(value.reason)),
    Effect.retry({ schedule: Schedule.spaced("1 second"), times: 300 }),
  )
})

it.live("pinned srt restores only the exact regular rustup file alias", () => Effect.gen(function* () {
  expect(() => ToolSafetySrtReadAlias.transform("")).toThrow("sandbox-runtime-read-alias-integrity-mismatch")
  expect(() => ToolSafetySrtReadAlias.transform("unknown runtime bytes")).toThrow("sandbox-runtime-read-alias-integrity-mismatch")
  yield* prepared
  const fs = yield* FSUtil.Service
  const processes = yield* AppProcess.Service
  const source = yield* ToolSafetySandboxRuntime.Source
  if (!source) throw new Error("BLOCKED: pinned srt source unavailable")
  const base = yield* fs.makeTempDirectoryScoped({ prefix: "srt-read-alias-" }).pipe(Effect.flatMap(fs.realPath))
  const worktree = path.join(base, "worktree")
  const homes = path.join(base, "homes")
  const rustup = path.join(homes, "rustup")
  const settings = path.join(rustup, "settings.toml")
  const alias = path.join(base, "landing", "rustup", "settings.toml")
  const publicMarker = path.join(worktree, "public-marker")
  const privateMarker = path.join(path.dirname(alias), "private-marker")
  const privateDirectory = path.join(path.dirname(alias), "private-directory")
  const directoryMarker = path.join(privateDirectory, "marker")
  const gitTarget = path.join(base, "dotfiles", "git", "config")
  const gitAlias = path.join(homes, "xdg", "git", "config")
  yield* fs.makeDirectory(worktree, { recursive: true })
  yield* fs.makeDirectory(rustup, { recursive: true })
  yield* fs.makeDirectory(path.dirname(alias), { recursive: true })
  yield* fs.writeFileString(publicMarker, "public synthetic marker")
  yield* fs.writeFileString(privateMarker, "private synthetic marker")
  yield* fs.writeWithDirs(gitTarget, "synthetic named git config")
  yield* fs.makeDirectory(privateDirectory)
  yield* fs.writeFileString(directoryMarker, "private directory marker")
  yield* fs.symlink("/usr/bin/env", settings)
  yield* fs.symlink(settings, alias)
  yield* fs.makeDirectory(path.dirname(gitAlias), { recursive: true })
  yield* fs.symlink(gitTarget, gitAlias)
  const native = { directory: worktree }
  const env = { RUSTUP_HOME: path.dirname(alias), XDG_CONFIG_HOME: path.dirname(path.dirname(gitAlias)), PATH: process.env.PATH ?? "" }
  const script = `const fs=require('fs');const files=${JSON.stringify([alias, "/usr/bin/env", privateMarker, publicMarker, gitAlias, directoryMarker])};process.stdout.write(JSON.stringify(files.map(f=>{try{return fs.readFileSync(f).length>0}catch{return false}})))`
  const run = (profile: ToolSafety.Profile, inputEnv = env) => Effect.gen(function* () {
    const input = ChildProcess.make(process.execPath, ["-e", script], { cwd: worktree, env: inputEnv })
    const wrapped = yield* ToolSafetySandbox.wrap(input).pipe(
      Effect.provideService(ToolSafety.RuntimeProfile, profile),
      Effect.provideService(ToolSafety.NativeContext, native),
    )
    expect(wrapped._tag).toBe("StandardCommand")
    if (wrapped._tag !== "StandardCommand") throw new Error("BLOCKED: pinned srt command shape")
    expect(wrapped.command).toBe(process.execPath)
    expect(wrapped.args).toContain(ToolSafetySandboxRuntime.cli(source.directory))
    const control = yield* processes.run(input, { timeout: "10 seconds" })
    expect(control.exitCode, control.stderr.toString()).toBe(0)
    expect(JSON.parse(control.stdout.toString())).toEqual([true, true, true, true, true, true])
    const result = yield* processes.run(wrapped, { timeout: "30 seconds" })
    expect(result.exitCode, result.stderr.toString()).toBe(0)
    return JSON.parse(result.stdout.toString()) as boolean[]
  })
  const profile = { requireSandbox: true, writeRoots: [], sandbox: { enabled: true, readRoots: [worktree] } } satisfies ToolSafety.Profile
  expect(yield* run(profile)).toEqual([true, true, false, true, true, false])
  expect(yield* run({ ...profile, sandbox: { ...profile.sandbox, denyPaths: ["/usr/bin/env"] } })).toEqual([false, false, false, true, true, false])

  yield* fs.remove(alias)
  yield* fs.remove(settings)
  yield* fs.makeDirectory(settings)
  yield* fs.symlink(privateDirectory, alias)
  const directoryScript = `const fs=require('fs');try{process.stdout.write(String(fs.readFileSync(${JSON.stringify(path.join(alias, "marker"))}).length>0))}catch{process.stdout.write('false')}`
  const directoryInput = ChildProcess.make(process.execPath, ["-e", directoryScript], { cwd: worktree, env })
  const directoryWrapped = yield* ToolSafetySandbox.wrap(directoryInput).pipe(
    Effect.provideService(ToolSafety.RuntimeProfile, profile), Effect.provideService(ToolSafety.NativeContext, native),
  )
  const directoryControl = yield* processes.run(directoryInput)
  expect(directoryControl.stdout.toString()).toBe("true")
  expect((yield* processes.run(directoryWrapped)).stdout.toString()).toBe("false")
}), 300_000)

it.live("a cross-root alias never bypasses a planned source deny shared with its destination", () => Effect.gen(function* () {
  yield* prepared
  const fs = yield* FSUtil.Service
  const processes = yield* AppProcess.Service
  const source = yield* ToolSafetySandboxRuntime.Source
  if (!source) throw new Error("BLOCKED: pinned srt source unavailable")
  const { wrapCommandWithSandboxLinux, cleanupBwrapMountPoints } = yield* Effect.promise(() => import(pathToFileURL(path.join(
    source.directory, "node_modules", "@anthropic-ai", "sandbox-runtime", "dist", "sandbox", "linux-sandbox-utils.js",
  )).href))
  const base = yield* fs.makeTempDirectoryScoped({ prefix: "srt-alias-deny-" }).pipe(Effect.flatMap(fs.realPath))
  const worktree = path.join(base, "worktree")
  const destination = path.join(base, "destination")
  const original = path.join(base, "private", "source")
  const alias = path.join(destination, "alias")
  yield* fs.makeDirectory(worktree)
  yield* fs.makeDirectory(destination)
  yield* fs.writeWithDirs(original, "synthetic source")
  yield* fs.symlink(original, alias)
  const script = `const fs=require('fs');console.log(JSON.stringify(${JSON.stringify([alias, original])}.map(file=>{try{return fs.readFileSync(file).length>0}catch{return false}})))`
  const input = ChildProcess.make(process.execPath, ["-e", script], { cwd: worktree })
  const control = yield* processes.run(input)
  expect(control.exitCode, control.stderr.toString()).toBe(0)
  expect(JSON.parse(control.stdout.toString())).toEqual([true, true])
  // The canonical file is explicitly restored under base, but base remains a planned source deny. That deny must
  // not disappear merely because it also contains the separate destination landing.
  const wrapped = yield* Effect.acquireRelease(Effect.promise(() => wrapCommandWithSandboxLinux({
    command: `${JSON.stringify(process.execPath)} -e ${JSON.stringify(script)}`,
    needsNetworkRestriction: true,
    readConfig: { denyOnly: [base, destination], allowWithinDeny: [destination, alias, original] },
    writeConfig: { allowOnly: [worktree], denyWithinAllow: [] },
    allowAllUnixSockets: false,
    seccompConfig: { applyPath: path.join(source.directory, "node_modules", "@anthropic-ai", "sandbox-runtime", "vendor", "seccomp", process.arch, "apply-seccomp") },
    ripgrepConfig: { command: ToolSafetySandboxRuntime.ripgrep(source.directory) },
  })), () => Effect.sync(() => cleanupBwrapMountPoints()))
  if (typeof wrapped !== "string") throw new Error("BLOCKED: pinned srt returned no wrapped command")
  const result = yield* processes.run(ChildProcess.make("/bin/sh", ["-c", wrapped], { cwd: worktree }), { timeout: "30 seconds" })
  expect(result.exitCode, result.stderr.toString()).toBe(0)
  expect(JSON.parse(result.stdout.toString())).toEqual([false, true])
}), 300_000)
