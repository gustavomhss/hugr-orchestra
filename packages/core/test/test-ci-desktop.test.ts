import { YAML } from "bun"
import { afterEach, expect, test } from "bun:test"
import { mkdtemp, mkdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { desktopProof, desktopSelection, proofPlatform } from "../../../script/test-ci-desktop"
import { testPaths } from "../../../script/test-ci-upload"

const root = path.resolve(import.meta.dir, "../../..")
const proof = "src/main/jimmy-desktop-proof.test.ts"
const ordinary = "src/main/ordinary.test.ts"
const extra = "src/main/jimmy-desktop-proof.extra.test.ts"
const dirs: string[] = []
const workflow = YAML.parse(await Bun.file(path.join(root, ".github/workflows/test-ci.yml")).text()) as {
  jobs: { test: { steps: { name: string; id?: string; if?: string; run?: string }[] } }
}
const steps = workflow.jobs.test.steps
const selection = steps.find((step) => step.id === "desktop-selection")!
const completion = steps.find((step) => step.id === "jimmy-evidence")!

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

async function fixture(args: string[]) {
  const cwd = await mkdtemp(path.join(tmpdir(), "test-ci-desktop-"))
  dirs.push(cwd)
  await Promise.all(["script", "packages/desktop/src/main", "test-ci-evidence"].map((dir) => mkdir(path.join(cwd, dir), { recursive: true })))
  await Bun.write(path.join(cwd, "script/test-ci-desktop.ts"), Bun.file(path.join(root, "script/test-ci-desktop.ts")))
  await Bun.write(path.join(cwd, "packages/desktop/bunfig.toml"), '[test]\npathIgnorePatterns = ["src/main/ignored.test.ts"]\n')
  await Promise.all([proof, ordinary, extra, "src/main/ignored.test.ts", "src/main/helper.ts", ".hidden/hidden.test.ts", "node_modules/hidden.test.ts"].map((file) =>
    Bun.write(path.join(cwd, "packages/desktop", file), `import { test } from "bun:test"\nconsole.log(${JSON.stringify(`SELECTED ${file}`)})\ntest("fixture selected", () => {})\n`)))
  const request = { package: "desktop", runner: "bun", args: [...testPaths("desktop", args,
    (file) => [proof, ordinary, extra, "src/main/helper.ts"].includes(file.replace(/^\.\//, ""))), "--timeout", "120000"] }
  await Bun.write(path.join(cwd, ".ci-run.json"), JSON.stringify(request))
  return { cwd, request, desktop: path.join(cwd, "packages/desktop") }
}

function run(step: typeof selection, cwd: string) {
  expect(step?.run).toBeString()
  return Bun.spawnSync(["bash", "-e", "-c", step.run!], { cwd, env: { ...process.env,
    GITHUB_SHA: "current-sha", GITHUB_RUN_ID: "current-run", GITHUB_OUTPUT: path.join(cwd, "output") } })
}

async function markers(cwd: string) {
  await Bun.write(path.join(cwd, "test-ci-evidence/jimmy-desktop-proof.json"), JSON.stringify({
    schema: "jimmy-desktop-proof-v1", sha: "current-sha", runID: "current-run", stopped: true,
    fixtureReaped: "SIGKILL", platform: process.platform, arch: process.arch,
    mutation: { changes: ["artifact"], failure: "generated native artifact bridge" },
  }))
  await Bun.write(path.join(cwd, "test-ci-evidence/jimmy-desktop-typecheck.json"), JSON.stringify({
    schema: "jimmy-desktop-typecheck-v1", sha: "current-sha", runID: "current-run", passed: true,
  }))
}

// `named`: some positional selects the proof alone, which keeps the opt-in off the proof's platforms.
const cases = [
  ["exact", [proof], [proof], true],
  ["exact dot path", [`./${proof}`], [proof], true],
  ["directory", ["src/main"], [proof, ordinary, extra], false],
  ["explicit directory", ["./src/main"], [proof, ordinary, extra], false],
  ["filter", ["jimmy-desktop-proof"], [proof, extra], false],
  ["package", [], [proof, ordinary, extra], false],
  ["package name-filter", ["-t", "fixture selected"], [proof, ordinary, extra], false],
  ["exact order", [ordinary, proof], [ordinary, proof], true],
  ["mixed path mode", [ordinary, "jimmy-desktop-proof"], [ordinary], false],
] as const
const hosts = [
  { platform: "linux", arch: "x64", supported: true },
  { platform: "linux", arch: "arm64", supported: true },
  { platform: "darwin", arch: "arm64", supported: true },
  { platform: "darwin", arch: "x64", supported: false },
  { platform: "win32", arch: "x64", supported: false },
] as const

for (const [name, args, expected, named] of cases) test(`${name}: actual Bun selection drives setup and missing-proof failure`, async () => {
  const value = await fixture([...args])
  const selected = desktopSelection(value.request, value.desktop)
  expect([...selected].sort()).toEqual([...expected].sort())
  if (name === "exact order") expect(selected).toEqual([...expected])
  // Real pinned Bun is the independent selector; no duplicate selection oracle.
  const actual = Bun.spawnSync([process.execPath, "test", ...value.request.args], { cwd: value.desktop })
  expect(actual.exitCode).toBe(0)
  expect(actual.stdout.toString().split(/\r?\n/).filter((line) => line.startsWith("SELECTED "))
    .map((line) => line.slice("SELECTED ".length)).sort()).toEqual([...expected].sort())
  // The workflow steps decide on this runner's own platform.
  const required = expected.some((file) => file === proof) && (proofPlatform(process.platform, process.arch) || named)
  const setup = run(selection, value.cwd)
  expect(setup.exitCode).toBe(0)
  expect(await Bun.file(path.join(value.cwd, "output")).text()).toBe(`proof=${required}\n`)
  const gate = run(completion, value.cwd)
  if (!required) {
    expect(gate.exitCode).toBe(0)
    return
  }
  expect(gate.exitCode).not.toBe(0)
  expect(gate.stderr.toString()).toContain("Missing completed Jimmy desktop proof evidence")
  await markers(value.cwd)
  expect(run(completion, value.cwd).exitCode).toBe(0)
})

test("proof platforms opt in on every selection; elsewhere only a request naming the proof alone", async () => {
  for (const [name, args, expected, named] of cases) {
    const value = await fixture([...args])
    for (const host of hosts) {
      expect(proofPlatform(host.platform, host.arch), `${host.platform}/${host.arch}`).toBe(host.supported)
      expect(desktopProof(value.request, value.desktop, host), `${name} on ${host.platform}/${host.arch}`)
        .toBe(expected.some((file) => file === proof) && (host.supported || named))
    }
  }
  // The real tree: a whole-package or directory run off the proof's platforms leaves it skipped, a named one fails there.
  const real = (args: string[], host: { platform: string; arch: string }) =>
    desktopProof({ package: "desktop", runner: "bun", args: [...args, "--timeout", "120000"] }, path.join(root, "packages/desktop"), host)
  for (const host of hosts) {
    for (const args of [[], ["src/main"], ["./src/main"], ["-t", "Jimmy"]]) expect(real(args, host)).toBe(host.supported)
    for (const args of [[`./${proof}`], ["jimmy-desktop-proof"], ["./src/main/app-dock-native.test.ts", `./${proof}`]])
      expect(real(args, host)).toBe(true)
  }
  expect(desktopProof({ package: "core", runner: "bun", args: [proof] }, "missing", { platform: "linux", arch: "x64" })).toBe(false)
})

test("ordinary exact and filter selections exclude proof without demanding markers", async () => {
  for (const args of [[ordinary], ["ordinary"]]) {
    const value = await fixture(args)
    expect(desktopSelection(value.request, value.desktop)).toEqual([ordinary])
    expect(run(selection, value.cwd).exitCode).toBe(0)
    expect(await Bun.file(path.join(value.cwd, "output")).text()).toBe("proof=false\n")
    expect(run(completion, value.cwd).exitCode).toBe(0)
  }
})

test("empty selection is named failure, including pass-with-no-tests and ignored files", async () => {
  for (const args of [["missing-filter"], ["missing-filter", "--pass-with-no-tests"], ["./missing.test.ts"], ["./src/main/ignored.test.ts"]]) {
    const value = await fixture(args)
    for (const step of [selection, completion]) {
      const result = run(step, value.cwd)
      expect(result.exitCode).not.toBe(0)
      expect(result.stderr.toString()).toContain("Jimmy desktop empty test selection")
    }
  }
})

test("empty proof/typecheck markers and absent typecheck are named failures", async () => {
  const value = await fixture([proof])
  for (const name of ["proof", "typecheck"]) {
    await markers(value.cwd)
    await Bun.write(path.join(value.cwd, `test-ci-evidence/jimmy-desktop-${name}.json`), " \n")
    const result = run(completion, value.cwd)
    expect(result.exitCode).not.toBe(0)
    expect(result.stderr.toString()).toContain(`Empty completed Jimmy desktop ${name} evidence`)
  }
  await markers(value.cwd)
  await rm(path.join(value.cwd, "test-ci-evidence/jimmy-desktop-typecheck.json"))
  const result = run(completion, value.cwd)
  expect(result.exitCode).not.toBe(0)
  expect(result.stderr.toString()).toContain("Missing completed Jimmy desktop typecheck evidence")
})

test("stale marker: both records require current SHA/run ID; setup clears even same-run records", async () => {
  // A request naming the proof requires its records on every host.
  const value = await fixture([proof])
  for (const name of ["proof", "typecheck"]) {
    for (const field of ["sha", "runID"]) {
      await markers(value.cwd)
      const file = Bun.file(path.join(value.cwd, `test-ci-evidence/jimmy-desktop-${name}.json`))
      await Bun.write(file, JSON.stringify({ ...await file.json(), [field]: "stale" }))
      const result = run(completion, value.cwd)
      expect(result.exitCode).not.toBe(0)
      expect(result.stderr.toString()).toContain(`Jimmy desktop ${name} evidence belongs to another run`)
    }
  }
  await markers(value.cwd)
  expect(run(completion, value.cwd).exitCode).toBe(0)
  expect(run(selection, value.cwd).exitCode).toBe(0)
  for (const name of ["proof", "typecheck"])
    expect(await Bun.file(path.join(value.cwd, `test-ci-evidence/jimmy-desktop-${name}.json`)).exists()).toBe(false)
  expect(run(completion, value.cwd).exitCode).not.toBe(0)
})

test("incomplete native/mutation and typecheck records cannot satisfy completion", async () => {
  const value = await fixture([proof])
  for (const [name, patch, error] of [
    ["proof", { stopped: false }, "native/mutation proof"],
    ["proof", { mutation: { changes: [], failure: "generated native artifact bridge" } }, "native/mutation proof"],
    ["typecheck", { passed: false }, "scoped typecheck"],
  ] as const) {
    await markers(value.cwd)
    const file = Bun.file(path.join(value.cwd, `test-ci-evidence/jimmy-desktop-${name}.json`))
    await Bun.write(file, JSON.stringify({ ...await file.json(), ...patch }))
    const result = run(completion, value.cwd)
    expect(result.exitCode).not.toBe(0)
    expect(result.stderr.toString()).toContain(error)
  }
})

test("workflow setup uses resolved proof output; completion cannot skip failed selection", () => {
  expect(steps.find((step) => step.name === "Setup Jimmy desktop Electron runtime")?.if).toBe("steps.desktop-selection.outputs.proof == 'true'")
  expect(completion.if).toBe("always() && steps.request.outputs.package == 'desktop' && steps.request.outputs.runner == 'bun'")
  expect(desktopSelection({ package: "core", runner: "bun", args: [] }, "missing")).toEqual([])
  expect(desktopSelection({ package: "desktop", runner: "pytest", args: [] }, "missing")).toEqual([])
})

test("proof opt-in is issued only by selected provisioning after successful installation", () => {
  const runtime = steps.find((step) => step.name === "Setup Jimmy desktop Electron runtime")!
  expect(runtime?.if).toBe("steps.desktop-selection.outputs.proof == 'true'")
  expect(runtime?.run).toBeString()
  const commands = runtime.run!.trim().split("\n").map((line) => line.trim())
  expect(steps.filter((step) => JSON.stringify(step).includes("ORCHESTRA_JIMMY_DESKTOP_PROOF"))).toEqual([runtime])
  expect(JSON.stringify(workflow).split("ORCHESTRA_JIMMY_DESKTOP_PROOF")).toHaveLength(2)
  expect(commands[0]).toBe("set -euo pipefail")
  expect(commands).toContain("sudo apt-get install -y xvfb libgtk-3-0 libnss3 libasound2t64")
  expect(commands).toContain("node -e \"require(require('node:path').join(require('node:path').dirname(require.resolve('electron', {paths:['./packages/desktop']})), 'install.js'))\"")
  expect(commands.at(-1)).toBe('echo "ORCHESTRA_JIMMY_DESKTOP_PROOF=1" >> "$GITHUB_ENV"')
  expect(steps.indexOf(runtime)).toBeGreaterThan(steps.indexOf(selection))
  expect(steps.indexOf(runtime)).toBeLessThan(steps.findIndex((step) => step.name === "Run tests"))
})

test("real desktop tree selects proof for exact/directory/filter/package requests", () => {
  for (const args of [[`./${proof}`], ["src/main"], ["jimmy-desktop-proof"], []])
    expect(desktopSelection({ package: "desktop", runner: "bun", args: [...args, "--timeout", "120000"] },
      path.join(root, "packages/desktop"))).toContain(proof)
})

test("ambiguous file-changing options fail by name instead of skipping proof", async () => {
  const value = await fixture(["--shard=1/2"])
  for (const step of [selection, completion]) {
    const result = run(step, value.cwd)
    expect(result.exitCode).not.toBe(0)
    expect(result.stderr.toString()).toContain("Unknown option '--shard'")
  }
})

test("scoped guard and teeth typecheck with the package compiler in CI", async () => {
  const value = await fixture([proof])
  const config = path.join(value.cwd, "guard.tsconfig.json")
  const control = path.join(value.cwd, "compiler-control.ts")
  await Bun.write(config, JSON.stringify({
    extends: path.join(root, "packages/core/tsconfig.json"),
    compilerOptions: { typeRoots: [path.join(root, "node_modules/@types")] },
    include: [path.join(root, "script/test-ci-desktop.ts"), import.meta.path, control],
  }))
  // Asynchronous: Bun 1.3.14's Windows spawnSync measures its timeout from the previous synchronous spawn's clock
  // (oven-sh/bun#33932), so after an idle stretch of this suite the compiler would be killed within milliseconds.
  const typecheck = async () => {
    const child = Bun.spawn([process.execPath, "typecheck", "--project", config], {
      cwd: path.join(root, "packages/core"), timeout: 60000, stdout: "pipe", stderr: "pipe",
    })
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ])
    return { output: stdout + stderr, exitCode }
  }
  await Bun.write(control, "const control: never = 1\n")
  const broken = await typecheck()
  expect(broken.exitCode).not.toBe(0)
  expect(broken.output).toContain("compiler-control.ts")
  await Bun.write(control, "const control = 1\n")
  const result = await typecheck()
  expect(result.output).toContain("$ tsgo --noEmit")
  if (result.exitCode !== 0) throw new Error(result.output)
  expect(result.exitCode).toBe(0)
}, 90000)
