import { describe, expect, test } from "bun:test"
import { validateRequest } from "../../../script/test-ci-request.ts"

const production = "e2e/playwright.production.config.ts"
const performance = "e2e/performance/playwright.config.ts"
const resolve = (selector: string) => {
  if (!["app", "@orchestra/app"].includes(selector)) throw new Error(`unknown selector: ${selector}`)
  return { package: "app", directory: "modules/app.v2+[web]" }
}

describe("request package locations", () => {
  test("legacy requests retain exact shapes and omitted runner defaults", () => {
    expect(validateRequest({ package: "core", args: [] }, (file) => file === "packages/core/package.json"))
      .toEqual({ package: "core", runner: "bun", args: [], env: {}, config: undefined })
    expect(validateRequest({ package: "python", args: [] }, (file) => file === "packages/python/requirements-dev.txt"))
      .toEqual({ package: "python", runner: "pytest", args: [], env: {}, config: undefined })
    expect(validateRequest({ package: "core", directory: "packages/core", runner: "node", args: ["a.node-smoke.mjs"] }, () => true))
      .toEqual({ package: "core", runner: "node", args: ["a.node-smoke.mjs"], env: {}, config: undefined })
  })

  test("custom location without a resolver is rejected before manifest lookup", () => {
    expect(() => validateRequest({ package: "core", directory: "modules/core", args: [] }, () => {
      throw new Error("must not read an untrusted location")
    })).toThrow("directory does not match")
  })

  test("canonical selector resolves before manifest reads and returns the legacy alias", () => {
    const calls: string[] = []
    expect(validateRequest({ package: "@orchestra/app", args: ["test/a.test.ts"] }, (file) => {
      calls.push(file)
      return file === "modules/app.v2+[web]/package.json"
    }, (selector) => {
      calls.push(selector)
      return resolve(selector)
    })).toEqual({ package: "app", directory: "modules/app.v2+[web]", runner: "bun", args: ["test/a.test.ts"], env: {}, config: undefined })
    expect(calls).toEqual(["@orchestra/app", "modules/app.v2+[web]/package.json", "modules/app.v2+[web]/package.json"])
  })

  test("resolver failures precede runner checks", () => {
    expect(() => validateRequest({ package: "missing", runner: "invalid", args: [] }, () => {
      throw new Error("must resolve first")
    }, resolve)).toThrow("unknown selector: missing")
  })

  test("a claimed location must exactly match the resolver", () => {
    expect(() => validateRequest({ package: "app", directory: "packages/app", args: [] }, () => true, resolve))
      .toThrow("directory does not match")
    expect(validateRequest({ package: "app", directory: "modules/app.v2+[web]", args: [] }, () => true, resolve).directory)
      .toBe("modules/app.v2+[web]")
  })

  test.each(["", ".", "./app", "/app", "C:/app", "C:\\app", "../app", "modules/../app", "modules/./app",
    "modules//app", "modules/app/", "modules\n/app", "modules/\0app", "modules/\x7fapp"])(
    "rejects unsafe resolved directory %j before file lookup", (directory) => {
      expect(() => validateRequest({ package: "app", args: [] }, () => {
        throw new Error("must validate directory first")
      }, () => ({ package: "app", directory }))).toThrow("invalid package directory")
    },
  )

  test.each(["bun", "node", "pytest"])("%s checks its manifest at the resolved directory", (runner) => {
    const files: string[] = []
    expect(validateRequest({ package: "app", runner, args: [] }, (file) => {
      files.push(file)
      return true
    }, resolve).runner).toBe(runner)
    expect(files).toEqual([`modules/app.v2+[web]/${runner === "pytest" ? "requirements-dev.txt" : "package.json"}`])
    expect(() => validateRequest({ package: "app", runner, args: [] }, () => false, resolve)).toThrow(`cannot run ${runner}`)
  })

  test("moved Playwright specs accept actual and legacy prefixes in order", () => {
    const files = new Set(["package.json", production, "e2e/a.spec.ts", "e2e/b.spec.ts"])
    expect(validateRequest({ package: "@orchestra/app", runner: "playwright", config: production,
      args: ["./modules/app.v2+[web]/e2e/a.spec.ts", "packages\\app\\e2e\\b.spec.ts"] },
    (file) => file.startsWith("modules/app.v2+[web]/") && files.has(file.slice("modules/app.v2+[web]/".length)), resolve))
      .toEqual({ package: "app", directory: "modules/app.v2+[web]", runner: "playwright",
        args: ["e2e/a.spec.ts", "e2e/b.spec.ts"], env: {}, config: production, benchmarkRenderer: undefined })
  })

  test("legacy Playwright return shape remains unchanged", () => {
    expect(validateRequest({ package: "app", runner: "playwright", config: production, args: ["packages/app/./e2e/a.spec.ts"] }, () => true))
      .toEqual({ package: "app", runner: "playwright", args: ["e2e/a.spec.ts"], env: {}, config: production, benchmarkRenderer: undefined })
  })

  test("performance renderer and exact selection rules survive relocation", () => {
    const request = { package: "app", runner: "playwright", config: performance, benchmarkRenderer: "current",
      args: ["e2e/performance/a.spec.ts"] }
    const validated = validateRequest(request, () => true, resolve)
    if (!("benchmarkRenderer" in validated)) throw new Error("FIXTURE_PLAYWRIGHT_BRANCH_MISSING")
    expect(validated.benchmarkRenderer).toBe("current")
    expect(() => validateRequest({ ...request, benchmarkRenderer: undefined }, () => true, resolve)).toThrow("current or legacy")
    expect(() => validateRequest({ ...request, args: [] }, () => true, resolve)).toThrow("nonempty")
    expect(() => validateRequest({ ...request, args: ["e2e/a.spec.ts"] }, () => true, resolve)).toThrow("invalid spec path")
    expect(() => validateRequest({ ...request, args: ["../e2e/performance/a.spec.ts"] }, () => true, resolve)).toThrow("invalid spec path")
    expect(() => validateRequest({ ...request, args: ["e2e/performance/a.spec.ts", "packages/app/e2e/performance/a.spec.ts"] }, () => true, resolve))
      .toThrow("spec files repeated")
    expect(() => validateRequest(request, (file) => !file.endsWith(".spec.ts"), resolve)).toThrow("spec missing")
    expect(() => validateRequest(request, (file) => !file.endsWith(performance), resolve)).toThrow("config missing")
    expect(() => validateRequest({ ...request, config: production, benchmarkRenderer: undefined }, () => true, resolve))
      .toThrow("invalid spec path")
  })

  test("runner, config and environment restrictions still apply", () => {
    expect(() => validateRequest({ package: "app", runner: "shell", args: [] }, () => true, resolve)).toThrow("cannot run shell")
    expect(() => validateRequest({ package: "app", args: [], config: production }, () => true, resolve)).toThrow("config requires")
    expect(() => validateRequest({ package: "app", args: [], benchmarkRenderer: "current" }, () => true, resolve)).toThrow("requires Playwright")
    expect(() => validateRequest({ package: "app", args: [], env: { SECRET: "value" } }, () => true, resolve)).toThrow("KEY one of")
    expect(validateRequest({ package: "app", args: [], env: { ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER: "1" } }, () => true, resolve).env)
      .toEqual({ ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER: "1" })
    expect(() => validateRequest({ package: "app", runner: "playwright", config: "e2e/other.config.ts", args: [] }, () => true, resolve))
      .toThrow("playwright config must be")
    expect(() => validateRequest({ package: "core", runner: "playwright", config: production, args: ["e2e/a.spec.ts"] }, () => true,
      () => ({ package: "core", directory: "modules/core" }))).toThrow("requires package app")
  })
})
