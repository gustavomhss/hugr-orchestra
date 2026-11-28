import { expect, test } from "bun:test"
import { ChildProcess } from "effect/unstable/process"
import { OmniSpawner } from "../src/omni-spawner"

test("the owned sidecar selects only exact direct executable paths for isolation", () => {
  const select = OmniSpawner.activityIsolationRequested
  const selected = ChildProcess.make("/bin/cat", [])
  expect(select(selected)).toBe(false)
  const unbind = OmniSpawner.bindActivityIsolation('["/bin/cat"]')
  try {
    expect(select(selected)).toBe(true)
    expect(select(ChildProcess.make("/usr/bin/cat", []))).toBe(false)
    expect(select(ChildProcess.make("/bin/cat", [], { shell: true }))).toBe(false)
    expect(select(ChildProcess.make("cat", []))).toBe(false)
    expect(() => OmniSpawner.bindActivityIsolation('["/bin/../cat"]')).toThrow()
    expect(() => OmniSpawner.bindActivityIsolation('["cat"]')).toThrow()
    expect(select(selected)).toBe(true)
  } finally {
    unbind()
  }
  expect(select(selected)).toBe(false)
})
