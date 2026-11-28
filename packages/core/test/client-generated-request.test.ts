import { expect, test } from "bun:test"
import { isClientGeneratedRequest } from "./fixture/client-generated-request"

const exact = { package: "core", directory: "packages/core", runner: "bun",
  args: ["./test/client-generated-artifact.test.ts", "--timeout", "900000"], env: {} }

test("Client artifact request admits only the exact normalized qualification vector", () => {
  expect(isClientGeneratedRequest(exact)).toBe(true)
  expect(isClientGeneratedRequest({ ...exact, packageSelector: "packages/core", config: undefined })).toBe(true)
})

test.each([
  ["undefined request", undefined], ["null request", null], ["empty request", {}],
  ["wrong package", { ...exact, package: "client" }],
  ["wrong directory", { ...exact, directory: "packages/client" }],
  ["wrong runner", { ...exact, runner: "node" }],
  ["whole package", { ...exact, args: ["--timeout", "900000"] }],
  ["unnormalized filename", { ...exact, args: ["test/client-generated-artifact.test.ts", "--timeout", "900000"] }],
  ["substring selector", { ...exact, args: ["client-generated-artifact", "--timeout", "900000"] }],
  ["extra selector", { ...exact, args: [...exact.args, "./test/another.test.ts"] }],
  ["filter", { ...exact, args: [...exact.args, "-t", "qualification"] }],
  ["alternate timeout", { ...exact, args: [exact.args[0], "--timeout", "120000"] }],
  ["numeric timeout", { ...exact, args: [exact.args[0], "--timeout", 900000] }],
  ["missing timeout", { ...exact, args: [exact.args[0]] }],
  ["reordered arguments", { ...exact, args: ["--timeout", "900000", exact.args[0]] }],
  ["nonempty environment", { ...exact, env: { ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER: "strict" } }],
  ["missing environment", { ...exact, env: undefined }], ["array environment", { ...exact, env: [] }],
  ["null environment", { ...exact, env: null }],
  ["config option", { ...exact, config: "e2e/playwright.production.config.ts" }],
  ["null config", { ...exact, config: null }],
  ["benchmark option", { ...exact, benchmarkRenderer: "current" }],
  ["null benchmark option", { ...exact, benchmarkRenderer: null }],
])("Client artifact request stays off for %s", (_name, value) => {
  expect(isClientGeneratedRequest(value)).toBe(false)
})
