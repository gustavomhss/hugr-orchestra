// The omni positive control (script/test-omni-control.ts) as Bun runs it: each case is a real `bun test` over a
// throwaway directory whose bunfig preloads only the control. Omni.count() stands in for a spawn, so no case needs the
// addon. Also pins where each scope is set: test-ci.yml declares, and no other workflow touches the variable, so
// every test.yml lane keeps expecting a spawn.
import { expect, test } from "bun:test"
import { Glob, YAML } from "bun"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

const root = path.resolve(import.meta.dir, "../../..")
const omni = JSON.stringify(path.join(root, "packages/core/src/omni.ts"))
const plain = `import { test } from "bun:test"\ntest("plain", () => {})\n`
const declared = `import { test } from "bun:test"\nimport { Omni } from ${omni}\nOmni.expectSpawn(import.meta.path)\ntest("declared", () => {})\n`
const spawned = `import { test } from "bun:test"\nimport { Omni } from ${omni}\ntest("spawned", () => Omni.count("spawns"))\n`
const delegated = `import { test } from "bun:test"\nimport { Omni } from ${omni}\ntest("delegated", () => Omni.count("delegations"))\n`

async function control(files: Record<string, string>, env: Record<string, string | undefined>) {
  const dir = await mkdtemp(path.join(tmpdir(), "omni-control-"))
  try {
    await Bun.write(path.join(dir, "bunfig.toml"),
      `[test]\npreload = [${JSON.stringify(path.join(root, "script/test-omni-control.ts"))}]\n`)
    await Promise.all(Object.entries(files).map(([name, body]) => Bun.write(path.join(dir, name), body)))
    // This run's own preload marked it as the outermost run; the child must be an outermost run of its own.
    const childEnv: Record<string, string | undefined> = { ...process.env, ORCHESTRA_OMNI_CONTROL_RUN: undefined,
      ORCHESTRA_OMNI_CONTROL: undefined, ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER: "1", ...env }
    const result = Bun.spawnSync([process.execPath, "test", ...Object.keys(files).map((file) => `./${file}`)], {
      cwd: dir, env: Object.fromEntries(Object.entries(childEnv).filter((entry): entry is [string, string] => entry[1] !== undefined)),
    })
    return { code: result.exitCode, output: `${result.stdout.toString()}\n${result.stderr.toString()}` }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

test("focused: a selection that declares nothing and spawns nothing is not applicable and passes", async () => {
  const run = await control({ "plain.test.ts": plain }, { ORCHESTRA_OMNI_CONTROL: "declared" })
  expect(run.output).toContain("omni positive control: not applicable (focused: no loaded test file declares an omni spawn)")
  expect(run.code).toBe(0)
}, 60_000)

test("focused: a loaded file that declares an omni spawn fails the run that made none, and names the file", async () => {
  const run = await control({ "declared.test.ts": declared, "plain.test.ts": plain }, { ORCHESTRA_OMNI_CONTROL: "declared" })
  // The path is relative to the run's cwd; Windows may spell the temp directory in its short 8.3 form.
  expect(run.output).toMatch(/omni positive control: FAIL \(declared by [^)]*declared\.test\.ts\)/)
  expect(run.output).toContain("made no omni spawn")
  expect(run.code).not.toBe(0)
}, 60_000)

test("focused: a declared selection that spawned through omni passes", async () => {
  const run = await control({ "declared.test.ts": declared, "spawned.test.ts": spawned }, { ORCHESTRA_OMNI_CONTROL: "declared" })
  expect(run.output).toMatch(/omni positive control: pass \(declared by [^)]*declared\.test\.ts\); 1 omni spawn\(s\), 0 delegated\./)
  expect(run.code).toBe(0)
}, 60_000)

test("focused: a delegation without any omni spawn fails even when nothing is declared", async () => {
  const run = await control({ "delegated.test.ts": delegated }, { ORCHESTRA_OMNI_CONTROL: "declared" })
  expect(run.output).toContain("omni positive control: FAIL (focused: no loaded test file declares an omni spawn)")
  expect(run.output).toContain("delegated 1 spawn(s) to legacy")
  expect(run.code).not.toBe(0)
}, 60_000)

test("suite (unset, as in test.yml): a run that made no omni spawn fails, declared or not", async () => {
  const run = await control({ "plain.test.ts": plain }, {})
  expect(run.output).toContain("omni positive control: FAIL (suite: every run must spawn through omni)")
  expect(run.code).not.toBe(0)
}, 60_000)

test("any other scope fails the run before a test starts", async () => {
  const run = await control({ "plain.test.ts": plain }, { ORCHESTRA_OMNI_CONTROL: "focused" })
  expect(run.output).toContain('ORCHESTRA_OMNI_CONTROL="focused" is not suite or declared')
  expect(run.code).not.toBe(0)
}, 60_000)

test("legacy rollback checks nothing and says so", async () => {
  const run = await control({ "plain.test.ts": plain }, { ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER: "0" })
  expect(run.output).toContain("omni positive control: off (legacy rollback); nothing checked.")
  expect(run.code).toBe(0)
}, 60_000)

test("only test-ci.yml's Run tests step declares; no other workflow sets the control's scope", async () => {
  const workflows = [...new Glob("*.{yml,yaml}").scanSync(path.join(root, ".github/workflows"))]
  expect(workflows).toContain("test.yml")
  const raw = await Bun.file(path.join(root, ".github/workflows/test-ci.yml")).text()
  const steps = (YAML.parse(raw) as { jobs: { test: { steps: { name: string; env?: Record<string, string> }[] } } }).jobs.test.steps
  expect(steps.filter((step) => step.env?.ORCHESTRA_OMNI_CONTROL !== undefined).map((step) => [step.name, step.env?.ORCHESTRA_OMNI_CONTROL]))
    .toEqual([["Run tests", "declared"]])
  for (const file of workflows.filter((name) => name !== "test-ci.yml"))
    expect(await Bun.file(path.join(root, ".github/workflows", file)).text()).not.toContain("ORCHESTRA_OMNI_CONTROL")
})
