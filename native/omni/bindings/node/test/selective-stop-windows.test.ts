import { expect, test } from "bun:test"
import { spawn } from "../index.js"

test.skipIf(process.platform !== "win32")("selective stop ends only the chosen live descendant", async () => {
  await using child = spawn(process.execPath, ["-e", `
    const { spawn } = require("node:child_process")
    const start = () => spawn(process.execPath, ["-e", "console.log('READY'); setInterval(() => {}, 1000)"], { stdio: ["ignore", "pipe", "ignore"] })
    const a = start(), b = start()
    let ready = 0
    for (const proc of [a, b]) proc.stdout.once("data", () => {
      if (++ready === 2) console.log("READY " + a.pid + " " + b.pid)
    })
    setInterval(() => {}, 1000)
  `])
  const lines = child.lines()[Symbol.asyncIterator]()
  const marker = await lines.next()
  const match = /^READY (\d+) (\d+)$/.exec(marker.value?.text ?? "")
  expect(match).not.toBeNull()
  const first = Number(match![1])
  const second = Number(match![2])
  const members = await child.controlMembers()
  expect(members.every((token) => /^(0|[1-9]\d*):(0|[1-9]\d*)$/.test(token))).toBe(true)
  const selected = members.find((token) => token.startsWith(`${first}:`))
  expect(selected).toBeDefined()
  expect(members.some((token) => token.startsWith(`${second}:`))).toBe(true)
  const [outcome] = await child.stopSelected([selected!])
  expect(["exited", "unknown"]).toContain(outcome)
  // Unknown means the asynchronous termination may still be settling.
  const deadline = Date.now() + 5000
  let remaining = await child.controlMembers()
  while (remaining.some((token) => token.startsWith(`${first}:`)) && Date.now() < deadline) {
    await Bun.sleep(10)
    remaining = await child.controlMembers()
  }
  expect(remaining.some((token) => token.startsWith(`${first}:`))).toBe(false)
  expect(remaining.some((token) => token.startsWith(`${second}:`))).toBe(true)
  expect(remaining.some((token) => token.startsWith(`${child.pid}:`))).toBe(true)
}, 30_000)

test.skipIf(process.platform !== "win32")("selective stop rejects malformed tokens without ending the child", async () => {
  await using child = spawn(process.execPath, ["-e", "console.log('READY'); setInterval(() => {}, 1000)"])
  const lines = child.lines()[Symbol.asyncIterator]()
  expect((await lines.next()).value?.text).toBe("READY")
  const [token] = await child.controlMembers()
  expect(token).toBeDefined()
  for (const invalid of [[], ["01:2"], ["1:+2"], ["1:18446744073709551616"], [123], Array(257).fill(token)]) {
    await expect(child.stopSelected(invalid as string[])).rejects.toThrow()
  }
  expect(await child.controlMembers()).toContain(token)
}, 30_000)
