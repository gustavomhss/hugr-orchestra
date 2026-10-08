import { expect, test } from "bun:test"
import { readFile } from "node:fs/promises"

// Explicit entry for lead-owned hosted lanes. No skipping, emulated platform
// flags, local runner, or glibc binary in an Alpine container counts as proof.
const lane = process.env.ORCHESTRA_ARTIFACT_NATIVE_LANE
if (!lane || !["darwin-x64", "darwin-arm64", "linux-musl-x64", "linux-musl-arm64"].includes(lane))
  throw new Error("Required ORCHESTRA_ARTIFACT_NATIVE_LANE: darwin-x64|darwin-arm64|linux-musl-x64|linux-musl-arm64")
if (!process.env.RUNNER_OS || Bun.version !== "1.3.14")
  throw new Error("Hosted Actions artifact lane requires Bun 1.3.14")
if (!process.env.ORCHESTRA_ARTIFACT_BUNFIG || (await readFile(process.env.ORCHESTRA_ARTIFACT_BUNFIG, "utf8")).trim())
  throw new Error("Native artifact lane requires ORCHESTRA_ARTIFACT_BUNFIG naming the empty runner config")
if (process.platform !== (lane.startsWith("darwin-") ? "darwin" : "linux") || process.arch !== lane.split("-").at(-1))
  throw new Error(`Native artifact lane host mismatch: ${lane} vs ${process.platform}/${process.arch}`)

if (lane.startsWith("linux-musl-")) {
  const binary = await readFile(process.execPath)
  if (binary.subarray(0, 4).toString("hex") !== "7f454c46" || binary[4] !== 2 || binary[5] !== 1)
    throw new Error("Native musl lane requires actual little-endian ELF64 Bun")
  const headers = Number(binary.readBigUInt64LE(32))
  const interpreter = Array.from(
    { length: binary.readUInt16LE(56) },
    (_, index) => headers + index * binary.readUInt16LE(54),
  ).find((offset) => binary.readUInt32LE(offset) === 3)
  if (interpreter === undefined) throw new Error("Native musl Bun interpreter missing")
  const start = Number(binary.readBigUInt64LE(interpreter + 8))
  const loader = binary.subarray(start, start + Number(binary.readBigUInt64LE(interpreter + 32)) - 1).toString()
  const expected = `/lib/ld-musl-${process.arch === "arm64" ? "aarch64" : "x86_64"}.so.1`
  if (loader !== expected) throw new Error(`Native musl lane interpreter mismatch: ${loader}`)
  const version = Bun.spawnSync([loader], { stdout: "pipe", stderr: "pipe" })
  if (!`${version.stdout.toString()}${version.stderr.toString()}`.includes("Version 1.2.5\n"))
    throw new Error("Native musl regression lane requires actual musl 1.2.5")
}

test("required native artifact lane reports actual OS CPU Bun and libc gate", () => {
  expect(process.platform).toBe(lane.startsWith("darwin-") ? "darwin" : "linux")
  expect(Bun.version).toBe("1.3.14")
})

await import("./artifact-fs.test")
await import("./export-artifacts.test")
if (lane.startsWith("darwin-")) await import("./artifact-case-alias.test")
