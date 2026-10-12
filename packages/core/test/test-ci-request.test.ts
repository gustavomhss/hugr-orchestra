import { expect, test } from "bun:test"
import { benchmarkEnvironment, controlLines, parseOptions, playwrightArgs, reportLines, requireTestJobs, validateRequest, validateSelection } from "../../../script/test-ci-request"

const config = "e2e/playwright.production.config.ts"
const spec = "e2e/regression/session-research-result.spec.ts"
const benchmark = "e2e/performance/timeline/session-research-benchmark.spec.ts"
const performance = "e2e/performance/playwright.config.ts"
const files = new Set(["packages/app/package.json", `packages/app/${config}`, `packages/app/${spec}`,
  `packages/app/${performance}`, `packages/app/${benchmark}`, "packages/relay/requirements-dev.txt"])
const isFile = (file: string) => files.has(file)
const valid = { package: "app", runner: "playwright", config, args: [spec] }

test("explicit production and benchmark requests select exact paths on both separator styles", () => {
  expect(parseOptions(["app", spec, "--runner", "playwright", "--config", config]).options)
    .toMatchObject({ runner: "playwright", config, os: "linux" })
  const request = validateRequest({ ...valid, args: [`./packages/app/${spec}`] }, isFile)
  expect(request.args).toEqual([spec])
  const args = playwrightArgs(request)
  expect(args.slice(0, 8)).toEqual(["--config", config, "--workers", "1", "--retries", "0", "--repeat-each", "1"])
  const filter = new RegExp(args.at(-1)!)
  expect(filter.test(`/repo/packages/app/${spec}`)).toBe(true)
  expect(filter.test(`C:\\repo\\packages\\app\\${spec.replaceAll("/", "\\")}`)).toBe(true)
  expect(filter.test(`/repo/packages/app/${spec}.other.spec.ts`)).toBe(false)
  expect(playwrightArgs(validateRequest({ ...valid, config: performance, benchmarkRenderer: "current", args: [benchmark] }, isFile))[7]).toBe("3")
})

test("legacy runner inference, explicit pytest, defaults and added OS choices stay valid", () => {
  expect(validateRequest({ package: "app", args: [] }, isFile).runner).toBe("bun")
  expect(validateRequest({ package: "relay", args: ["tests/test_authoring.py", "-k", "author"] }, isFile).runner).toBe("pytest")
  expect(validateRequest({ package: "relay", runner: "pytest", args: [] }, isFile).runner).toBe("pytest")
  expect(parseOptions(["app"]).options.os).toBe("linux")
  for (const os of ["linux", "windows", "both", "macos", "macos-intel", "all"])
    expect(parseOptions(["app", "--os", os]).options.os).toBe(os)
})

test("bun, node and env requests survive validation; unlisted or malformed env fails by name", () => {
  const env = { ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER: "1" }
  const parsed = parseOptions(["app", "smoke.node-smoke.mjs", "--runner", "node", "--env", "ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER=1"])
  expect(parsed.options.runner).toBe("node")
  expect(parsed.env).toEqual(env)
  expect(validateRequest({ package: "app", runner: "node", env, args: ["smoke.node-smoke.mjs"] }, isFile)).toMatchObject({ runner: "node", env })
  expect(validateRequest({ package: "app", runner: "bun", args: [] }, isFile).env).toEqual({})
  expect(validateRequest({ ...valid, env }, isFile).env).toEqual(env)
  expect(() => parseOptions(["app", "--env", "PATH=x"])).toThrow("KEY one of")
  expect(() => parseOptions(["app", "--env", "ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER=a b"])).toThrow("needs a value matching")
  expect(() => validateRequest({ package: "app", env: { PATH: "x" }, args: [] }, isFile)).toThrow("KEY one of")
  expect(() => validateRequest({ package: "app", env: [], args: [] }, isFile)).toThrow("env must be an object")
})

test("selection rejects empty, partially ignored and extra files; accepts exact files", () => {
  expect(() => validateSelection([spec], [spec])).not.toThrow()
  expect(() => validateSelection([], [])).toThrow("nonempty")
  expect(() => validateSelection([spec], [])).toThrow(`empty selection: ${spec}`)
  expect(() => validateSelection([spec, benchmark], [spec])).toThrow(`empty selection: ${benchmark}`)
  expect(() => validateSelection([spec], [spec, benchmark])).toThrow(`unexpected selection: ${benchmark}`)
})

for (const flag of ["--os", "--runner", "--config", "--benchmark-renderer"])
  test(`${flag} rejects missing and repeated values`, () => {
    expect(() => parseOptions(["app", flag])).toThrow(`${flag} needs a value`)
    expect(() => parseOptions(["app", flag, "--help"])).toThrow(`${flag} needs a value`)
    expect(() => parseOptions(["app", flag, "value", flag, "value"])).toThrow(`${flag} repeated`)
  })

for (const [argv, reason] of [
  [["--os", "unknown"], "--os must be"], [["--runner", "shell"], "--runner must be"],
  [["--config", config], "--config requires"], [["--runner", "playwright", "-t", "filter"], "only named"],
] as const)
  test(`invalid CLI ${argv.join(" ")}`, () => expect(() => parseOptions(["app", ...argv])).toThrow(reason))

for (const [patch, reason] of [
  [{ package: "../app" }, "valid package"], [{ package: "relay" }, "cannot run"],
  [{ runner: "shell" }, "cannot run"], [{ runner: 0 }, "cannot run"], [{ config: undefined }, "config must be"],
  [{ config: "playwright.config.ts" }, "config must be"], [{ args: [] }, "nonempty"],
  [{ args: [spec, spec] }, "repeated"], [{ args: ["e2e/missing.spec.ts"] }, "spec missing"],
  [{ args: ["e2e/../regression/x.spec.ts"] }, "invalid spec path"], [{ args: ["/tmp/x.spec.ts"] }, "invalid spec path"],
  [{ args: ["e2e/**/*.spec.ts"] }, "invalid spec path"], [{ args: ["--pass-with-no-tests"] }, "invalid spec path"],
  [{ args: [benchmark] }, "invalid spec path"], [{ args: [42] }, "string array"],
] as const)
  test(`invalid request ${JSON.stringify(patch)}`, () => expect(() => validateRequest({ ...valid, ...patch }, isFile)).toThrow(reason))

test("missing config, malformed request and missing runner dependency fail by name", () => {
  expect(() => validateRequest(valid, (file) => file !== `packages/app/${config}` && isFile(file))).toThrow(`config missing: ${config}`)
  expect(() => validateRequest(null, isFile)).toThrow("must be an object")
  expect(() => validateRequest({ package: "missing", args: [] }, isFile)).toThrow("cannot run")
})

test("benchmark transport freezes renderer and tested snapshot revision", () => {
  for (const renderer of ["current", "legacy"]) {
    const options = parseOptions(["app", benchmark, "--runner", "playwright", "--config", performance, "--benchmark-renderer", renderer]).options
    expect(validateRequest({ ...valid, config: options.config, benchmarkRenderer: options.benchmarkRenderer, args: [benchmark] }, isFile))
      .toMatchObject({ benchmarkRenderer: renderer })
    expect(benchmarkEnvironment(renderer, "a".repeat(40))).toEqual({ RESEARCH_BENCH_RENDERER: renderer, RESEARCH_BENCH_REVISION: "a".repeat(40) })
  }
  expect(() => benchmarkEnvironment("current", undefined)).toThrow("actual GITHUB_SHA")
  expect(() => benchmarkEnvironment("legacy", "")).toThrow("actual GITHUB_SHA")
  expect(() => benchmarkEnvironment("current", "not-a-commit")).toThrow("actual GITHUB_SHA")
})

test("benchmark transport rejects missing, empty, unknown and regression renderer conditions", () => {
  for (const renderer of [undefined, "", "unknown"])
    expect(() => validateRequest({ ...valid, config: performance, benchmarkRenderer: renderer, args: [benchmark] }, isFile)).toThrow("current or legacy")
  expect(() => parseOptions(["app", "--runner", "playwright", "--config", performance])).toThrow("current or legacy")
  expect(() => parseOptions(["app", "--runner", "playwright", "--config", performance, "--benchmark-renderer", "unknown"])).toThrow("current or legacy")
  expect(() => parseOptions(["app", "--benchmark-renderer", "current"])).toThrow("requires Playwright performance config")
  expect(() => validateRequest({ ...valid, benchmarkRenderer: "current" }, isFile)).toThrow("requires Playwright performance config")
  expect(() => validateRequest({ ...valid, config: performance, benchmarkRenderer: "current", args: [] }, isFile)).toThrow("nonempty")
})

test("report requires exact OS matrix jobs; missing, repeated and extra hosts fail", () => {
  const jobs = ["ubuntu-latest", "windows-latest", "macos-14"].map((host) => ({ name: `test (${host})` }))
  expect(requireTestJobs("all", [...jobs, { name: "cleanup" }])).toEqual(jobs)
  for (const [os, indices] of [["linux", [0]], ["windows", [1]], ["macos", [2]], ["both", [0, 1]]] as const)
    expect(requireTestJobs(os, indices.map((index) => jobs[index]!))).toHaveLength(indices.length)
  expect(() => requireTestJobs("linux", [])).toThrow("test (ubuntu-latest): missing or repeated")
  expect(() => requireTestJobs("linux", undefined as unknown as { name: string }[])).toThrow("missing matrix jobs")
  expect(() => requireTestJobs("all", jobs.slice(0, 2))).toThrow("test (macos-14): missing or repeated")
  expect(() => requireTestJobs("linux", [jobs[0]!, jobs[0]!])).toThrow("repeated")
  expect(() => requireTestJobs("linux", jobs)).toThrow("test (windows-latest): unexpected")
})

test("successful report requires step metadata, step log, endgroup and nonempty output", () => {
  const job = { name: "test (ubuntu-latest)", conclusion: "success", steps: [{ name: "Run tests", conclusion: "success" }] }
  const log = (text: string) => `test (ubuntu-latest)\tRun tests\t2026-10-09T00:00:00Z ${text}`
  expect(reportLines(job, [log("##[endgroup]"), log("\u001b[32m1 pass\u001b[0m")].join("\n"))).toEqual(["1 pass"])
  expect(reportLines(job, [log("##[endgroup]"), log("1 pass")].join("\r\n"))).toEqual(["1 pass"])
  expect(() => reportLines(job, " \n")).toThrow(`${job.name}: empty job log`)
  expect(() => reportLines({ ...job, steps: [] }, log("1 pass"))).toThrow("missing successful Run tests step")
  expect(() => reportLines({ ...job, steps: [{ name: "Run tests", conclusion: "skipped" }] }, log("1 pass"))).toThrow("missing successful Run tests step")
  expect(() => reportLines(job, "test\tSetup Bun\tinstall failed")).toThrow("missing Run tests log")
  expect(() => reportLines(job, log("1 pass"))).toThrow("missing Run tests endgroup marker")
  expect(() => reportLines(job, log("##[endgroup]"))).toThrow("empty Run tests output")
})

test("failed setup report retains setup diagnostics without requiring Run tests", () => {
  expect(reportLines({ name: "test (macos-14)", conclusion: "failure", steps: [{ name: "Setup Bun", conclusion: "failure" }] },
    "test (macos-14)\tSetup Bun\tinstallation failed")).toEqual(["installation failed"])
})

test("controlLines keeps the omni positive control's verdicts, never the source frame that quotes the throw", () => {
  expect(controlLines([
    " 22 |   if (problem) throw new Error(`omni positive control: FAIL (${reason}). ${problem}`)",
    "error: omni positive control: FAIL (suite: every run must spawn through omni). no omni spawn.",
    "omni positive control: not applicable (focused: no loaded test file declares an omni spawn); nothing.",
    "(fail) (unnamed) [1.30ms]",
    " 1 pass",
  ])).toEqual([
    "omni positive control: FAIL (suite: every run must spawn through omni). no omni spawn.",
    "omni positive control: not applicable (focused: no loaded test file declares an omni spawn); nothing.",
  ])
  expect(controlLines(["1 pass", "Ran 1 test across 1 file."])).toEqual([])
})
