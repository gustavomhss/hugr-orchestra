import { expect, test } from "bun:test"
import { stripVTControlCharacters } from "node:util"
import { spawn, type Child } from "../index.js"

test("pipe tree identity is distinct, stable and independent of output and stdin", async () => {
  await using first = spawn(process.execPath, ["-e", `
    import { readFileSync } from "node:fs"
    console.log("READY")
    if (readFileSync(0, "utf8") !== "probe") process.exitCode = 1
  `], { stdin: "pipe" })
  await using second = spawn(process.execPath, ["-e", 'console.log("READY"); process.stdin.resume()'], { stdin: "pipe" })
  const firstID = first.treeId
  expect(firstID).toMatch(/^\d+:\d+$/)
  expect(second.treeId).toMatch(/^\d+:\d+$/)
  expect(second.treeId).not.toBe(firstID)
  expect(firstID).not.toBe(String(first.pid))
  await ready(first)
  await ready(second)
  await first.write("probe")
  await first.closeStdin()
  expect((await first.wait()).success).toBe(true)
  expect(first.treeId).toBe(firstID)
  await first.stop({ graceMs: 0 })
  expect(first.treeId).toBe(firstID)
}, 30_000)

test("PTY tree identity is stable after stop", async () => {
  await using child = spawn(process.execPath, ["-e", 'console.log("READY"); setInterval(() => {}, 1000)'], { pty: true })
  const id = child.treeId
  expect(id).toMatch(/^\d+:\d+$/)
  expect(id).not.toBe(String(child.pid))
  await ready(child)
  await child.stop({ graceMs: 0 })
  expect(child.treeId).toBe(id)
}, 30_000)

async function ready(child: Child) {
  for await (const line of child.lines()) {
    // ConPTY includes terminal initialization sequences before the marker.
    if (stripVTControlCharacters(line.text) === "READY") return
  }
  throw new Error("Output ended before the READY marker")
}


test.skipIf(process.platform !== "darwin")("observes the physical footprint of a real live tree", async () => {
  await using child = spawn(process.execPath, ["-e", `
    const { spawn } = require("node:child_process")
    const descendant = spawn(process.execPath, ["-e", "console.log('READY'); setInterval(() => {}, 1000)"], { stdio: ["ignore", "pipe", "ignore"] })
    descendant.stdout.once("data", () => console.log("READY " + descendant.pid))
    setInterval(() => {}, 1000)
  `])
  const lines = child.lines()[Symbol.asyncIterator]()
  const marker = await lines.next()
  const descendant = Number(/^READY (\d+)$/.exec(marker.value?.text ?? "")?.[1])
  expect(descendant).toBeGreaterThan(0)
  expect(child.observeTree).toBeDefined()
  const sample = await child.observeTree!()
  expect(sample.members.map((member) => member.pid)).toContain(child.pid)
  expect(sample.members.map((member) => member.pid)).toContain(descendant)
  expect(Number.isSafeInteger(sample.physicalFootprintBytes)).toBe(true)
  expect(sample.physicalFootprintBytes!).toBeGreaterThan(0)
  expect(sample.footprintIdentity).toBeTruthy()
  expect((await child.observeTree!()).footprintIdentity).toBe(sample.footprintIdentity)
  await child.stop({ graceMs: 0 })
  const stopped = await child.observeTree!()
  expect(stopped.members).toEqual([])
  expect(stopped.physicalFootprintBytes).toBeUndefined()
}, 30_000)
