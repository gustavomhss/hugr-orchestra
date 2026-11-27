import { expect, test } from "bun:test"
import { stripVTControlCharacters } from "node:util"
import { spawn, type Child } from "../index.js"

test("pipe tree identity is distinct, stable and independent of output and stdin", async () => {
  await using first = spawn(process.execPath, ["-e", 'console.log("READY"); process.stdin.resume()'], { stdin: "pipe" })
  await using second = spawn(process.execPath, ["-e", 'console.log("READY"); process.stdin.resume()'], { stdin: "pipe" })
  const firstID = first.treeId
  expect(firstID).toMatch(/^\d+:\d+$/)
  expect(second.treeId).toMatch(/^\d+:\d+$/)
  expect(second.treeId).not.toBe(firstID)
  expect(firstID).not.toBe(String(first.pid))
  await ready(first)
  await ready(second)
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
