import { expect, test } from "bun:test"
import { parseOptions, playwrightArgs, validateRequest, validateSelection } from "../../../script/test-ci-request"

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
  expect(playwrightArgs(validateRequest({ ...valid, config: performance, args: [benchmark] }, isFile))[7]).toBe("3")
})

test("legacy runner inference, explicit pytest, defaults and added OS choices stay valid", () => {
  expect(validateRequest({ package: "app", args: [] }, isFile).runner).toBe("bun")
  expect(validateRequest({ package: "relay", args: ["tests/test_authoring.py", "-k", "author"] }, isFile).runner).toBe("pytest")
  expect(validateRequest({ package: "relay", runner: "pytest", args: [] }, isFile).runner).toBe("pytest")
  expect(parseOptions(["app"]).options.os).toBe("linux")
  for (const os of ["linux", "windows", "both", "macos", "all"])
    expect(parseOptions(["app", "--os", os]).options.os).toBe(os)
})

test("selection rejects empty, partially ignored and extra files; accepts exact files", () => {
  expect(() => validateSelection([spec], [spec])).not.toThrow()
  expect(() => validateSelection([], [])).toThrow("nonempty")
  expect(() => validateSelection([spec], [])).toThrow(`empty selection: ${spec}`)
  expect(() => validateSelection([spec, benchmark], [spec])).toThrow(`empty selection: ${benchmark}`)
  expect(() => validateSelection([spec], [spec, benchmark])).toThrow(`unexpected selection: ${benchmark}`)
})

for (const flag of ["--os", "--runner", "--config"])
  test(`${flag} rejects missing and repeated values`, () => {
    expect(() => parseOptions(["app", flag])).toThrow(`${flag} needs a value`)
    expect(() => parseOptions(["app", flag, "--help"])).toThrow(`${flag} needs a value`)
    expect(() => parseOptions(["app", flag, "value", flag, "value"])).toThrow(`${flag} repeated`)
  })

for (const [argv, reason] of [
  [["--os", "unknown"], "--os must be"], [["--runner", "bun"], "--runner must be"],
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
