import { expect, test } from "bun:test"
import { runCommand } from "./runtime"

// wsl.exe writes UTF-16LE, with or without a BOM, and Linux programs behind it write UTF-8. runCommand picks the
// encoding from the first chunk of each stream and decodes across chunk boundaries. A real process writes the bytes,
// so the same test covers the legacy spawn and the omni one (OPENCODE_EXPERIMENTAL_OMNI_SPAWNER).

// Splits a string's UTF-16LE bytes inside a code unit, so the second write starts with half a character.
function halves(text: string) {
  const bytes = Buffer.from(text, "utf16le")
  const cut = bytes.length - 3
  return [bytes.subarray(0, cut), bytes.subarray(cut)].map((part) => part.toString("latin1"))
}

test("decodes UTF-16LE with a BOM, non-ASCII included", async () => {
  const script = `process.stdout.write(Buffer.from("\\ufeffOlá — 日本語\\r\\n", "utf16le"))`
  const result = await runCommand(process.execPath, ["-e", script])
  expect(result).toEqual({ code: 0, signal: null, stdout: "Olá — 日本語\r\n", stderr: "" })
})

test("detects BOM-less UTF-16LE (wsl --list) and decodes across a write split inside a code unit", async () => {
  const table = "  NAME            STATE           VERSION\r\n* Ubuntu-24.04    Running         2\r\n"
  const [head, tail] = halves(table)
  const script = `
process.stdout.write(Buffer.from(${JSON.stringify(head)}, "latin1"), () =>
  setTimeout(() => process.stdout.write(Buffer.from(${JSON.stringify(tail)}, "latin1")), 50))`
  const result = await runCommand(process.execPath, ["-e", script])
  expect(result.stdout).toBe(table)
  expect(result.code).toBe(0)
})

test("keeps UTF-8 when the first chunk is UTF-8, across a split multi-byte character", async () => {
  const bytes = Buffer.from("versão 2.6.1 ✓\n", "utf8")
  const cut = bytes.indexOf(0xc3) + 1
  const script = `
const bytes = Buffer.from(${JSON.stringify(bytes.toString("base64"))}, "base64")
process.stdout.write(bytes.subarray(0, ${cut}), () => setTimeout(() => process.stdout.write(bytes.subarray(${cut})), 50))`
  const result = await runCommand(process.execPath, ["-e", script])
  expect(result.stdout).toBe("versão 2.6.1 ✓\n")
})

test("decodes stdout and stderr independently and keeps the exit code", async () => {
  const script = `
process.stdout.write(Buffer.from("\\ufeffout ok\\n", "utf16le"))
process.stderr.write("err ok\\n", () => process.exit(3))`
  const result = await runCommand(process.execPath, ["-e", script])
  expect(result).toEqual({ code: 3, signal: null, stdout: "out ok\n", stderr: "err ok\n" })
})

test("rejects a command that never exits, within its timeout", async () => {
  const started = Date.now()
  await expect(
    runCommand(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { timeoutMs: 500 }),
  ).rejects.toThrow()
  expect(Date.now() - started).toBeLessThan(20_000)
})
