// The omni positive control (script/test-omni-control.ts) as Bun runs it: each case is a real `bun test` over a
// throwaway directory whose bunfig preloads only the control. Omni.count() stands in for a spawn, so no case needs the
// addon. Also pins where the control's scope may be set: only test-ci.yml's Run tests step (from the request) and
// turbo.json's cache key mention the variable, so every test.yml lane keeps expecting a spawn.
import { expect, test } from "bun:test"
import { YAML } from "bun"
import { mkdtemp, rm } from "node:fs/promises"
import { readFileSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

const root = path.resolve(import.meta.dir, "../../..")
const omni = JSON.stringify(path.join(root, "packages/core/src/omni.ts"))
const expectations = JSON.stringify(path.join(root, "packages/core/test/fixture/omni-expect.ts"))
const head = `import { test } from "bun:test"\nimport { Omni } from ${omni}\nimport { expectSpawn } from ${expectations}\n`
const plain = `${head}test("plain", () => {})\n`
const silent = `${head}test("declares and spawns nothing", () => { expectSpawn(import.meta.path) })\n`
const spawning = `${head}test("declares and spawns", () => { expectSpawn(import.meta.path); Omni.count("spawns") })\n`
const other = `${head}test("spawns without declaring", () => { Omni.count("spawns") })\n`
const delegated = `${head}test("delegates", () => { Omni.count("delegations") })\n`
const mixed = `${head}test("declares and spawns", () => { expectSpawn(import.meta.path); Omni.count("spawns") })\ntest("plain", () => {})\n`
const skipped = `${head}test.skipIf(true)("declares", () => { expectSpawn(import.meta.path) })\ntest("plain", () => {})\n`
const nonce = "0123456789abcdef0123456789abcdef"

async function control(files: Record<string, string>, env: Record<string, string | undefined>, args: string[] = []) {
  const dir = await mkdtemp(path.join(tmpdir(), "omni-control-"))
  try {
    await Bun.write(path.join(dir, "bunfig.toml"),
      `[test]\npreload = [${JSON.stringify(path.join(root, "script/test-omni-control.ts"))}]\n`)
    await Promise.all(Object.entries(files).map(([name, body]) => Bun.write(path.join(dir, name), body)))
    // This run's own preload marked it as the outermost run; the child must be an outermost run of its own.
    const childEnv: Record<string, string | undefined> = { ...process.env, ORCHESTRA_OMNI_CONTROL_RUN: undefined,
      ORCHESTRA_OMNI_CONTROL: undefined, ORCHESTRA_OMNI_CONTROL_NONCE: undefined, ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER: "1", ...env }
    const result = Bun.spawnSync([process.execPath, "test", ...Object.keys(files).map((file) => `./${file}`), ...args], {
      cwd: dir, env: Object.fromEntries(Object.entries(childEnv).filter((entry): entry is [string, string] => entry[1] !== undefined)),
    })
    return { code: result.exitCode, output: `${result.stdout.toString()}\n${result.stderr.toString()}` }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

const declared = { ORCHESTRA_OMNI_CONTROL: "declared" }

test("declared: a run in which no declaring test ran and nothing spawned is not applicable and passes", async () => {
  const run = await control({ "plain.test.ts": plain }, declared)
  expect(run.output).toContain("omni positive control: not applicable (focused: no declaring test ran)")
  expect(run.code).toBe(0)
}, 60_000)

test("declared: a declaring test that made no omni spawn fails the run and names its file", async () => {
  const run = await control({ "silent.test.ts": silent, "plain.test.ts": plain }, declared)
  // The path is relative to the run's cwd; Windows may spell the temp directory in its short 8.3 form.
  expect(run.output).toMatch(/omni positive control: FAIL \(declared: 1 test\(s\) in [^)]*silent\.test\.ts\)\. [^\n]*silent\.test\.ts: 1 of 1 declaring test\(s\) made no omni spawn of their own/)
  expect(run.code).not.toBe(0)
}, 60_000)

test("declared: another file's spawn does not satisfy a declaring test that made none", async () => {
  // Named files run in the given order: the other file's spawn is counted before the declaring test starts.
  const run = await control({ "other.test.ts": other, "silent.test.ts": silent }, declared)
  expect(run.output).toMatch(/silent\.test\.ts: 1 of 1 declaring test\(s\) made no omni spawn of their own/)
  expect(run.code).not.toBe(0)
}, 60_000)

test("declared: a declaring test that spawned passes", async () => {
  const run = await control({ "spawning.test.ts": spawning }, declared)
  expect(run.output).toMatch(/omni positive control: pass \(declared: 1 test\(s\) in [^)]*spawning\.test\.ts\); 1 omni spawn\(s\), 0 delegated\./)
  expect(run.code).toBe(0)
}, 60_000)

test("declared: a -t filter or skipIf that leaves a file's declaring tests unrun leaves nothing expected", async () => {
  const filtered = await control({ "mixed.test.ts": mixed }, declared, ["-t", "plain"])
  expect(filtered.output).toContain("omni positive control: not applicable (focused: no declaring test ran)")
  expect(filtered.code).toBe(0)
  const skip = await control({ "skipped.test.ts": skipped }, declared)
  expect(skip.output).toContain("omni positive control: not applicable (focused: no declaring test ran)")
  expect(skip.code).toBe(0)
}, 60_000)

test("declared: a delegation without any omni spawn fails even when nothing is declared", async () => {
  const run = await control({ "delegated.test.ts": delegated }, declared)
  expect(run.output).toContain("omni positive control: FAIL (focused: no declaring test ran)")
  expect(run.output).toContain("delegated 1 spawn(s) to legacy")
  expect(run.code).not.toBe(0)
}, 60_000)

test("suite (unset, as in test.yml and whole-package test:ci): a run that made no omni spawn fails", async () => {
  const run = await control({ "plain.test.ts": plain }, {})
  expect(run.output).toContain("omni positive control: FAIL (suite: every run must spawn through omni)")
  expect(run.code).not.toBe(0)
}, 60_000)

test("suite: a declaring test that made no omni spawn fails even though another test spawned", async () => {
  const run = await control({ "other.test.ts": other, "silent.test.ts": silent }, {})
  expect(run.output).toMatch(/omni positive control: FAIL \(suite: every run must spawn through omni\)\. [^\n]*silent\.test\.ts: 1 of 1/)
  expect(run.code).not.toBe(0)
}, 60_000)

test("the nonce tags exactly one verdict line and is gone from the environment before any test loads", async () => {
  const leak = `import { test } from "bun:test"\ntest("leak", () => { console.log("seen nonce: " + String(process.env.ORCHESTRA_OMNI_CONTROL_NONCE)) })\n`
  const passing = await control({ "leak.test.ts": leak, "spawning.test.ts": spawning }, { ...declared, ORCHESTRA_OMNI_CONTROL_NONCE: nonce })
  expect(passing.output).toContain("seen nonce: undefined")
  expect(passing.output.split(`omni positive control [${nonce}]: `).length - 1).toBe(1)
  expect(passing.output).toContain(`omni positive control [${nonce}]: pass (declared`)
  expect(passing.code).toBe(0)
  const failing = await control({ "silent.test.ts": silent }, { ...declared, ORCHESTRA_OMNI_CONTROL_NONCE: nonce })
  expect(failing.output.split(`omni positive control [${nonce}]: `).length - 1).toBe(1)
  expect(failing.output).toContain(`omni positive control [${nonce}]: FAIL (declared`)
  expect(failing.code).not.toBe(0)
}, 60_000)

test("an invalid scope or nonce fails the run before a test starts", async () => {
  const scope = await control({ "plain.test.ts": plain }, { ORCHESTRA_OMNI_CONTROL: "focused" })
  expect(scope.output).toContain('ORCHESTRA_OMNI_CONTROL="focused" is not suite or declared')
  expect(scope.code).not.toBe(0)
  const empty = await control({ "plain.test.ts": plain }, { ORCHESTRA_OMNI_CONTROL: "" })
  expect(empty.output).toContain('ORCHESTRA_OMNI_CONTROL="" is not suite or declared')
  expect(empty.code).not.toBe(0)
  const bad = await control({ "plain.test.ts": plain }, { ...declared, ORCHESTRA_OMNI_CONTROL_NONCE: "fake" })
  expect(bad.output).toContain("ORCHESTRA_OMNI_CONTROL_NONCE is not 32 lowercase hex digits")
  expect(bad.code).not.toBe(0)
}, 60_000)

test("legacy rollback checks nothing and says so", async () => {
  const run = await control({ "silent.test.ts": silent }, { ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER: "0" })
  expect(run.output).toContain("omni positive control: off (legacy rollback); nothing checked.")
  expect(run.code).toBe(0)
}, 60_000)

// Raw bytes, not a parser: a mention in a comment is a false alarm cleared by reading it, never a miss. Spelling the
// name in pieces (string concatenation, a computed key) is not detected; that would be deliberate, not an accident.
const scopeVariable = /ORCHESTRA_OMNI_CONTROL(?![A-Z0-9_])/g
const mentions: Record<string, string> = {
  "script/test-omni-control.ts": "the control reads its scope",
  ".github/workflows/test-ci.yml": "the Run tests step sets the scope from the request (pinned below)",
  "turbo.json": "globalEnv keys cached turbo results by the scope (pinned below)",
  "packages/core/test/test-omni-control.test.ts": "this guard and its fixtures",
  "AGENTS.md": "documents the control",
}

test("only the ledgered files mention the control's scope variable, and test-ci.yml sets it only from the request", () => {
  const listing = Bun.spawnSync(["git", "ls-files", "-z"], { cwd: root })
  expect(listing.exitCode).toBe(0)
  const tracked = listing.stdout.toString().split("\0").filter(Boolean)
  expect(tracked.length).toBeGreaterThan(1000)
  const found = Object.fromEntries(tracked.flatMap((file) => {
    // Submodules and symlinks to directories are tracked entries without file content of their own.
    if (!statSync(path.join(root, file), { throwIfNoEntry: false })?.isFile()) return []
    const text = readFileSync(path.join(root, file), "latin1")
    const count = text.match(scopeVariable)?.length ?? 0
    return count > 0 ? [[file, count]] : []
  }))
  expect(Object.keys(found).toSorted()).toEqual(Object.keys(mentions).toSorted())
  expect(found[".github/workflows/test-ci.yml"]).toBe(1)
  expect(found["turbo.json"]).toBe(1)
  expect(readFileSync(path.join(root, "turbo.json"), "utf8")).toMatch(/"globalEnv":\s*\[[^\]]*"ORCHESTRA_OMNI_CONTROL"[^\]]*\]/)
  const workflow = YAML.parse(readFileSync(path.join(root, ".github/workflows/test-ci.yml"), "utf8")) as {
    env?: Record<string, string>
    jobs: Record<string, { env?: Record<string, string>; steps: { name: string; id?: string; run?: string; env?: Record<string, string> }[] }>
  }
  const steps = workflow.jobs.test!.steps
  const run = steps.findIndex((step) => step.name === "Run tests")
  expect(steps[run]?.env?.ORCHESTRA_OMNI_CONTROL).toBe("${{ steps.request.outputs.omni_control }}")
  expect(steps.find((step) => step.id === "request")?.run).toContain("omni_control=${omniControlScope(request)}")
  const nonce = steps.findIndex((step) => step.name === "Omni control nonce")
  expect(nonce).toBeGreaterThan(-1)
  expect(nonce).toBeLessThan(run)
  expect(steps[nonce]?.run).toContain('echo "omni control nonce: $nonce"')
  expect(steps[nonce]?.run).toContain('echo "ORCHESTRA_OMNI_CONTROL_NONCE=$nonce" >> "$GITHUB_ENV"')
})
