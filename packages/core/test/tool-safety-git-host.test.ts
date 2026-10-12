import { describe, expect } from "bun:test"
import path from "node:path"
import { copyFile, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises"
import which from "which"
import { Effect } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { LayerNode } from "../src/effect/layer-node"
import { FSUtil } from "../src/fs-util"
import { AppProcess } from "../src/process"
import { ToolSafety } from "../src/tool-safety"
import { ToolSafetyGitHost } from "../src/tool-safety-git-host"
import { ToolSafetySandbox } from "../src/tool-safety-sandbox"
import { testEffect } from "./lib/effect"

const it = testEffect(LayerNode.compile(LayerNode.group([FSUtil.node, AppProcess.node])))
const windows = process.platform === "win32" ? it.live : it.live.skip
const ps = (script: string, cwd = process.cwd(), env?: Record<string, string | undefined>) =>
  ChildProcess.make("pwsh", ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script], { cwd, env, stdin: "ignore" })

describe("words", () => {
  it.live("reads exactly one plain git call and nothing a shell would read more into", () => Effect.sync(() => {
    const words = (script: string) => ToolSafetyGitHost.words(ps(script))
    expect(words("git status")).toEqual(["status"])
    expect(words("  git.exe  log --oneline -5 ")).toEqual(["log", "--oneline", "-5"])
    expect(words(`git log "--format=%h %s" 'HEAD~1' -- src\\a.ts`)).toEqual(["log", "--format=%h %s", "HEAD~1", "--", "src\\a.ts"])
    expect(words(`git show ""`)).toEqual(["show", ""])
    for (const script of [
      "git status; git commit -m x", "git status | Out-String", "git status && git log", "git log > out.txt",
      "git log $x", "git log $(evil)", "git log @args", "git log --% x", "git log `n", "git log # c", "git log {x}",
      'git log "$env:X"', "git log 'a\nb'", "git log a,b", "git log 'open", "echo git status", "& git status",
      "C:\\x\\git.exe status", ".\\git status",
    ]) expect(words(script)).toBeUndefined()
    // Only pwsh -Command or a cmd.exe shell; Windows PowerShell and other programs are never read.
    expect(ToolSafetyGitHost.words(ChildProcess.make("powershell", ["-Command", "git status"]))).toBeUndefined()
    expect(ToolSafetyGitHost.words(ChildProcess.make("pwsh", ["-File", "x.ps1", "-Command", "git status"]))).toBeUndefined()
    expect(ToolSafetyGitHost.split(`git log "%PATH%"`, true)).toBeUndefined()
    expect(ToolSafetyGitHost.split(`git log 'x'`, true)).toBeUndefined()
  }))
})

const run = (cwd: string, args: string[], env?: Record<string, string | undefined>) => {
  const result = Bun.spawnSync(args, { cwd, env, stdout: "pipe", stderr: "pipe" })
  if (result.exitCode !== 0) throw new Error(`${args.join(" ")}: ${result.stderr.toString()}`)
  return result.stdout.toString()
}

// A seat's linked worktree: the repository and its config lie outside the write root, the worktree is the write root.
// The repository's config names a program for every git hook point the read-only subcommands could reach, and the
// worktree's attributes (which the seat can write) select those drivers. Each payload appends its name to `markers`.
const fixture = Effect.gen(function* () {
  const fs = yield* FSUtil.Service
  const processes = yield* AppProcess.Service
  const temp = (prefix: string) => fs.makeTempDirectoryScoped({ prefix }).pipe(Effect.flatMap(fs.realPath))
  const main = yield* temp("ghm-")
  const wt = yield* temp("ghw-")
  const host = yield* temp("ghh-")
  const git = which.sync("git")
  const markers = path.join(host, "markers.txt")
  const sh = markers.replaceAll("\\", "/")
  const append = (name: string) => `echo ${name} >> "${sh}"`
  const g = (cwd: string, ...args: string[]) => run(cwd, [git, "-c", "user.name=t", "-c", "user.email=t@t", ...args])
  yield* Effect.promise(async () => {
    await writeFile(path.join(main, "a.txt"), "one\n")
    await writeFile(path.join(main, ".gitattributes"), "*.txt diff=evil\n")
    g(main, "init", "-q", "-b", "main")
    g(main, "add", ".")
    g(main, "commit", "-qm", "init")
    g(main, "tag", "v1")
    await rm(wt, { recursive: true })
    g(main, "worktree", "add", "-q", "-b", "seat", wt)
    // A signed-looking commit, so a signature check would start gpg.program.
    const signed = g(wt, "cat-file", "commit", "HEAD")
      .replace(/^(committer .*\n)/m, "$1gpgsig -----BEGIN PGP SIGNATURE-----\n \n -----END PGP SIGNATURE-----\n")
    const id = Bun.spawnSync([git, "hash-object", "-t", "commit", "-w", "--stdin"], { cwd: wt, stdin: Buffer.from(signed) })
    g(wt, "update-ref", "HEAD", id.stdout.toString().trim())
    await mkdir(path.join(host, "hooks"))
    await writeFile(path.join(host, "hooks", "post-index-change"), `#!/bin/sh\n${append("hook")}\n`)
    await writeFile(path.join(host, "gpg"), `#!/bin/sh\n${append("gpg")}\nexit 1\n`)
    for (const [key, value] of [
      ["core.fsmonitor", append("fsmonitor")], ["core.hooksPath", path.join(host, "hooks").replaceAll("\\", "/")],
      ["core.pager", `${append("pager")}; cat`], ["pager.log", `${append("pager")}; cat`],
      ["diff.evil.textconv", `${append("textconv")}; cat`], ["diff.evil.command", `${append("extdiff")}; true`],
      ["diff.external", `${append("external")}; true`], ["gpg.program", path.join(host, "gpg").replaceAll("\\", "/")],
      ["log.showSignature", "true"], ["alias.st", `!${append("alias")}`], ["core.sshCommand", append("ssh")],
    ]) g(main, "config", key, value)
    await writeFile(path.join(wt, "a.txt"), "one\ntwo\n")
  })
  const profile = { requireSandbox: true, writeRoots: [wt] } satisfies ToolSafety.Profile
  const wrap = (command: ChildProcess.StandardCommand, directory = wt, writes = profile) =>
    ToolSafetySandbox.wrap(command).pipe(
      Effect.provideService(ToolSafety.RuntimeProfile, writes),
      Effect.provideService(ToolSafety.NativeContext, { directory }),
    )
  const fired = Effect.promise(() => readFile(markers, "utf8").catch(() => ""))
  return { fs, processes, main, wt, host, git, markers, g, wrap, fired }
})

// The read-only calls a seat makes, each through the shell tool's own pwsh command line.
const READS = [
  "git status", "git status --porcelain", "git diff", "git diff --cached", "git diff HEAD --stat", "git log -p -1",
  "git log --oneline", 'git log "--format=%G?" -1', "git show HEAD", "git show HEAD:a.txt", "git blame a.txt",
  "git grep -n one", "git rev-parse --show-toplevel", "git rev-list --count HEAD", "git ls-files", "git branch --list",
  "git branch -v", "git tag -l", "git remote -v", "git describe --tags --always", "git cat-file -p HEAD",
  "git merge-base HEAD HEAD", "git --no-pager log -1 --stat",
]

describe("git via host", () => {
  windows("read-only git runs on the host for a confined seat, and none of the configured programs runs", () =>
    Effect.gen(function* () {
      const f = yield* fixture
      // Positive control: plain host git in the same worktree starts the configured programs.
      for (const args of [["status"], ["diff"], ["log", "-p", "-1"], ["log", "-1"], ["blame", "a.txt"]])
        Bun.spawnSync([f.git, ...args], { cwd: f.wt, stdout: "pipe", stderr: "pipe" })
      const control = yield* f.fired
      for (const name of ["fsmonitor", "textconv", "extdiff", "gpg"]) expect(control).toContain(name)
      yield* Effect.promise(() => rm(f.markers, { force: true }))

      const outputs: Record<string, string> = {}
      for (const script of READS) {
        const command = yield* f.wrap(ps(script, f.wt))
        if (command._tag !== "StandardCommand") throw new Error("expected one command")
        expect(path.basename(command.command).toLowerCase()).toBe("git.exe")
        const result = yield* f.processes.run(command, { timeout: "60 seconds" })
        expect(result.exitCode, `${script}: ${result.stderr.toString()}`).toBe(0)
        outputs[script] = result.stdout.toString()
      }
      expect(yield* f.fired).toBe("")
      expect(outputs["git status --porcelain"]).toBe(" M a.txt\n")
      expect(outputs["git diff"]).toContain("+two")
      expect(outputs["git log -p -1"]).toContain("+one")
      expect(path.resolve(outputs["git rev-parse --show-toplevel"].trim())).toBe(yield* Effect.promise(() => realpath(f.wt)))
      expect(outputs["git rev-list --count HEAD"].trim()).toBe("1")
      expect(outputs["git tag -l"].trim()).toBe("v1")
      expect(outputs["git branch --list"]).toContain("* seat")
      // A pwsh-quoted operand and a cmd.exe shell reach host git the same way.
      const quoted = yield* f.processes.run(yield* f.wrap(ps(`git log "--format=%s" -1`, f.wt)), { timeout: "60 seconds" })
      expect(quoted.stdout.toString().trim()).toBe("init")
      const cmd = yield* f.wrap(ChildProcess.make("git log --oneline -1", [], { shell: "cmd.exe", cwd: f.wt, stdin: "ignore" }))
      expect(cmd._tag === "StandardCommand" && path.basename(cmd.command).toLowerCase()).toBe("git.exe")
      expect((yield* f.processes.run(cmd, { timeout: "60 seconds" })).stdout.toString()).toContain("init")
      expect(yield* f.fired).toBe("")
    }), 300_000,
  )

  windows("the environment cannot steer host git, secrets do not reach it, and a workspace git.exe is never run", () =>
    Effect.gen(function* () {
      const f = yield* fixture
      const shim = path.join(f.wt, "bin")
      yield* Effect.promise(async () => {
        await mkdir(shim)
        // hostname.exe prints the machine name: if a shim ran, the output would not be the worktree path.
        await copyFile(path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "hostname.exe"), path.join(shim, "git.exe"))
        await copyFile(path.join(shim, "git.exe"), path.join(f.wt, "git.exe"))
      })
      const inherited = Object.fromEntries(Object.entries(process.env).filter(([key]) => key.toUpperCase() !== "PATH"))
      const env = {
        ...inherited, PATH: `${shim};${f.wt};${process.env.PATH ?? process.env.Path}`, GIT_DIR: path.join(f.main, ".git"),
        GIT_EXTERNAL_DIFF: "x", GIT_CONFIG_PARAMETERS: "'core.fsmonitor'='x'", GIT_CONFIG_COUNT: "1",
        GIT_CONFIG_KEY_0: "core.pager", GIT_CONFIG_VALUE_0: "x", ORCHESTRA_TEST_SECRET_TOKEN: "hidden",
      }
      // Control: a PATH lookup finds the shim first.
      expect(FSUtil.contains(f.wt, which.sync("git", { path: env.PATH }))).toBe(true)
      const command = yield* f.wrap(ps("git rev-parse --show-toplevel", f.wt, env))
      if (command._tag !== "StandardCommand") throw new Error("expected one command")
      expect(FSUtil.contains(f.wt, command.command)).toBe(false)
      const names = Object.keys(command.options.env ?? {})
      expect(names).not.toContain("ORCHESTRA_TEST_SECRET_TOKEN")
      expect(names.filter((name) => name.startsWith("GIT_")).sort()).toEqual([
        "GIT_ASKPASS", "GIT_EDITOR", "GIT_NO_LAZY_FETCH", "GIT_OPTIONAL_LOCKS", "GIT_PAGER", "GIT_PROTOCOL_FROM_USER",
        "GIT_TERMINAL_PROMPT",
      ])
      const result = yield* f.processes.run(command, { timeout: "60 seconds" })
      expect(result.exitCode, result.stderr.toString()).toBe(0)
      expect(path.resolve(result.stdout.toString().trim())).toBe(yield* Effect.promise(() => realpath(f.wt)))
      const diff = yield* f.processes.run(yield* f.wrap(ps("git diff", f.wt, env)), { timeout: "60 seconds" })
      expect(diff.stdout.toString()).toContain("+two")
      expect(yield* f.fired).toBe("")
    }), 300_000,
  )

  windows("writing, unknown and compound git calls stay confined and fail with a named reason", () =>
    Effect.gen(function* () {
      const f = yield* fixture
      const holds: Record<string, string> = {
        "git commit -am x": "git-host-subcommand-confined", "git add .": "git-host-subcommand-confined",
        "git checkout -b x": "git-host-subcommand-confined", "git reset --hard": "git-host-subcommand-confined",
        "git stash": "git-host-subcommand-confined", "git fetch": "git-host-subcommand-confined",
        "git push": "git-host-subcommand-confined", "git config user.name x": "git-host-subcommand-confined",
        "git worktree list": "git-host-subcommand-confined", "git st": "git-host-subcommand-confined",
        "git -c core.pager=x log": "git-host-global-option", "git -C .. status": "git-host-global-option",
        "git --git-dir=.. log": "git-host-global-option", "git --exec-path=. status": "git-host-global-option",
        "git log --output=x": "git-host-option-confined", "git diff --ext-diff": "git-host-option-confined",
        "git log --textconv -p": "git-host-option-confined", "git log --show-signature": "git-host-option-confined",
        "git grep -O x": "git-host-option-confined", "git grep -f x": "git-host-option-confined",
        "git diff --no-index a b": "git-host-option-confined", "git cat-file --filters HEAD:a.txt": "git-host-option-confined",
        "git status --ignore-submodules=none": "git-host-option-confined", "git log --out=x": "git-host-option-confined",
        "git branch x": "git-host-operand-confined", "git tag v2": "git-host-operand-confined",
        "git remote add o x": "git-host-operand-confined",
      }
      for (const [script, reason] of Object.entries(holds)) {
        const error = yield* Effect.flip(f.wrap(ps(script, f.wt)))
        expect(error.reason, script).toBe(reason)
        expect(error.message).toContain("Orchestra has no git tool for writing commands")
      }
      // A cwd outside the workspace never reaches host git.
      expect((yield* Effect.flip(f.wrap(ps("git status", f.main)))).reason).toBe("git-host-cwd-outside-workspace")
      // Compound or dynamic lines are not one git call: they go to the AppContainer, where git cannot start.
      for (const script of ["git status; git log -1", "git status | Out-String", "git log $env:X"]) {
        const command = yield* f.wrap(ps(script, f.wt))
        expect(command._tag === "StandardCommand" && command.args[0], script).toBe("--appcontainer")
        const result = yield* f.processes.run(command, { timeout: "60 seconds" })
        expect(result.stderr.toString(), script).toContain("/dev/null")
      }
      expect(yield* f.fired).toBe("")
    }), 300_000,
  )

  windows("a git directory the seat can write, or another repository, never runs on the host", () =>
    Effect.gen(function* () {
      const f = yield* fixture
      const temp = f.fs.makeTempDirectoryScoped({ prefix: "ghp-" }).pipe(Effect.flatMap(f.fs.realPath))
      const planted = yield* temp
      const redirected = yield* temp
      const inner = yield* temp
      const sh = f.markers.replaceAll("\\", "/")
      yield* Effect.promise(async () => {
        // A repository inside the write root, whose config the seat wrote: filters, fsmonitor, hooks and an include.
        await writeFile(path.join(planted, "a.txt"), "one\n")
        f.g(planted, "init", "-q")
        f.g(planted, "add", ".")
        f.g(planted, "commit", "-qm", "init")
        await writeFile(path.join(planted, "extra.cfg"), `[core]\n\tpager = echo include >> "${sh}"; cat\n`)
        for (const [key, value] of [
          ["core.fsmonitor", `echo fsmonitor >> "${sh}"`], ["filter.evil.clean", `echo filter >> "${sh}"; cat`],
          ["filter.evil.smudge", `echo filter >> "${sh}"; cat`], ["include.path", path.join(planted, "extra.cfg").replaceAll("\\", "/")],
        ]) f.g(planted, "config", key, value)
        await writeFile(path.join(planted, ".gitattributes"), "* filter=evil\n")
        await writeFile(path.join(planted, "a.txt"), "one\nchanged\n")
        // A `.git` file naming another repository's git directory, and one naming another worktree's.
        await writeFile(path.join(redirected, ".git"), `gitdir: ${path.join(f.main, ".git")}\n`)
        await mkdir(path.join(redirected, "other"))
        await writeFile(path.join(redirected, "other", ".git"), `gitdir: ${path.join(f.main, ".git", "worktrees", path.basename(f.wt))}\n`)
        // A `.git` file naming a git directory inside the write root.
        f.g(inner, "init", "-q", "--separate-git-dir", path.join(inner, "store"), path.join(inner, "tree"))
      })
      // Positive control: plain host git in the planted repository runs its payloads.
      Bun.spawnSync([f.git, "status"], { cwd: planted, stdout: "pipe", stderr: "pipe" })
      expect(yield* f.fired).toContain("fsmonitor")
      yield* Effect.promise(() => rm(f.markers, { force: true }))

      const seat = (directory: string) => ({ requireSandbox: true, writeRoots: [directory] }) satisfies ToolSafety.Profile
      for (const script of READS) {
        const error = yield* Effect.flip(f.wrap(ps(script, planted), planted, seat(planted)))
        expect(error.reason, script).toBe("git-host-repository-writable")
      }
      expect((yield* Effect.flip(f.wrap(ps("git log", redirected), redirected, seat(redirected)))).reason)
        .toBe("git-host-repository-foreign")
      expect((yield* Effect.flip(f.wrap(ps("git log", path.join(redirected, "other")), redirected, seat(redirected)))).reason)
        .toBe("git-host-repository-foreign")
      expect((yield* Effect.flip(f.wrap(ps("git status", path.join(inner, "tree")), inner, seat(inner)))).reason)
        .toBe("git-host-repository-writable")
      expect(yield* f.fired).toBe("")
    }), 300_000,
  )

  // Host git follows directory junctions in the work tree (measured on windows-latest: status lists, diff and grep print
  // files under a junction's target). It stays inside the read jail only because a confined command cannot create a
  // junction, symlink or hard link to a path it cannot write (Windows' sandbox link mitigations).
  windows("a confined command cannot link the work tree to a path outside its grants", () =>
    Effect.gen(function* () {
      const f = yield* fixture
      yield* Effect.promise(() => writeFile(path.join(f.host, "secret.txt"), "secret"))
      const script = (name: string) => `
$r = [ordered]@{}
function t($k, $b) { try { & $b | Out-Null; $r[$k] = 'ok' } catch { $r[$k] = 'denied' } }
t 'junction' { New-Item -ItemType Junction -Path '${path.join(f.wt, `j${name}`)}' -Value '${f.host}' -ErrorAction Stop }
t 'symlink' { New-Item -ItemType SymbolicLink -Path '${path.join(f.wt, `s${name}`)}' -Value '${f.host}' -ErrorAction Stop }
t 'hardlink' { New-Item -ItemType HardLink -Path '${path.join(f.wt, `h${name}.txt`)}' -Value '${path.join(f.host, "secret.txt")}' -ErrorAction Stop }
$r | ConvertTo-Json -Compress`
      const confined = yield* f.processes.run(yield* f.wrap(ps(script("c"), f.wt)), { timeout: "60 seconds" })
      expect(JSON.parse(confined.stdout.toString().trim())).toEqual({ junction: "denied", symlink: "denied", hardlink: "denied" })
      // Positive control: the host user can create the junction.
      const control = yield* f.processes.run(ps(script("u"), f.wt), { timeout: "60 seconds" })
      expect(JSON.parse(control.stdout.toString().trim())).toMatchObject({ junction: "ok" })
    }), 300_000,
  )
})
