import assert from "node:assert/strict"
import { readFileSync, statSync } from "node:fs"
import { test } from "node:test"

test("the completion profile declares an empty toolset without default or repository injection", () => {
  const profiles = JSON.parse(readFileSync(new URL("./grok-agent.json", import.meta.url), "utf8"))
  assert.deepEqual(Object.keys(profiles), ["atlas-text"])
  const profile = profiles["atlas-text"]
  assert.deepEqual(profile.toolConfig, { tools: [] })
  for (const key of ["injectDefaultTools", "agentsMd", "discoverSkills", "inheritSkills"]) assert.equal(profile[key], false)
  assert.equal(profile.mcpInheritance, "none")
  assert.equal(profile.permissionMode, "dontAsk")
  assert.equal(profile.promptMode, "full")
  assert.equal(typeof profile.prompt, "string")
  assert(profile.prompt.length > 0)
})

test("the configured wrapper is executable so its version/profile receipt can be captured", () => {
  assert.notEqual(statSync(new URL("./grok-text.sh", import.meta.url)).mode & 0o111, 0)
})
