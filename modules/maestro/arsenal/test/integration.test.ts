import { expect, test } from "bun:test"
import { Arsenal } from "../src/index"
import { acquisitionDescriptors } from "../src/engine/descriptors"
import { governanceToolDescriptors } from "../src/governance/descriptors"
import type { Tool } from "../src/contract"
import { fixture } from "./fixtures.governance"

test("actual acquisition and governance owners supply every registered descriptor", async () => {
  for (const descriptor of [...Object.values(acquisitionDescriptors), ...Object.values(governanceToolDescriptors)]) {
    const module = await import(`../src/tools/${descriptor.name}.ts`)
    const tool = module.default as Tool
    expect(await Arsenal.describe(descriptor.name)).toEqual(descriptor)
    expect({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema, effects: tool.effects }).toEqual(descriptor)
    expect(typeof tool.handler).toBe("function")
  }
})

test("registry executes owner-specific mapper, profile and governance schemas with frozen resources", async () => {
  const tmp = await fixture()
  await Bun.write(`${tmp.root}/source.ts`, "export const value = 1\n")
  const mapped = await Arsenal.execute("repo-mapper", { offset: 0, limit: 1, maxEntries: 10 }, tmp.context)
  expect(mapped.isError).not.toBe(true)
  expect(JSON.parse(mapped.content[0].text).entries[0].path).toBe("source.ts")
  expect(tmp.permissions.length).toBeGreaterThan(0)
  for (const request of tmp.permissions) {
    expect(Object.isFrozen(request)).toBe(true)
    expect(Object.isFrozen(request.paths)).toBe(true)
    expect(Object.isFrozen(request.commands)).toBe(true)
  }
  const profile = await Arsenal.execute("profile", { action: "set", patch: { scrutiny: "balanced" } }, tmp.context)
  expect(profile.isError).not.toBe(true)
  expect(JSON.parse(profile.content[0].text).profile.scrutiny).toBe("balanced")
  const governance = await Arsenal.execute("governance", {
    operation: "ruleset-propose", repository: "fixture/project",
  }, tmp.context)
  expect(governance.isError).not.toBe(true)
  expect(JSON.parse(governance.content[0].text).executed).toBe(false)
})
