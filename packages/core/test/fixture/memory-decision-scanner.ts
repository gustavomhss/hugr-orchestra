import { expect } from "bun:test"
import path from "node:path"

// Controlled scanner boundary, not gitleaks detection evidence. The real Atlas scanner invocation owns this native process.
export async function buildWindowsScanner(root: string) {
  const entry = path.join(root, "scanner.ts")
  const executable = path.join(root, "scanner.exe")
  await Bun.write(entry, String.raw`
import { existsSync, readFileSync, writeFileSync } from "node:fs";
const args = process.argv.slice(2);
if (args.length === 1 && args[0] === "--version") process.exit(0);
if (JSON.stringify(args) !== JSON.stringify(["stdin", "--report-format", "json", "--exit-code", "1"])) process.exit(2);
const config = JSON.parse(readFileSync(process.execPath + ".json", "utf8"));
if (typeof config.payload !== "string" || typeof config.scanned !== "string" ||
    typeof config.release !== "string" || typeof config.hold !== "boolean") process.exit(2);
const payload = readFileSync(0);
writeFileSync(config.payload, payload);
writeFileSync(config.scanned, "actual scan completed");
const pause = new Int32Array(new SharedArrayBuffer(4));
while (config.hold && !existsSync(config.release)) Atomics.wait(pause, 0, 0, 20);
process.exit(0);
`)
  const built = await Bun.build({
    entrypoints: [entry], target: "bun",
    compile: {
      outfile: executable,
      autoloadBunfig: false, autoloadDotenv: false, autoloadTsconfig: false, autoloadPackageJson: false,
    },
  })
  expect(built.success, `Native Windows scanner fixture build: ${built.logs.join("\n")}`).toBe(true)
  const bytes = new Uint8Array(await Bun.file(executable).arrayBuffer())
  expect(bytes.byteLength).toBeGreaterThan(64)
  expect(Array.from(bytes.subarray(0, 2))).toEqual([0x4d, 0x5a])
  const pe = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0x3c, true)
  expect(pe + 4).toBeLessThanOrEqual(bytes.byteLength)
  expect(Array.from(bytes.subarray(pe, pe + 4))).toEqual([0x50, 0x45, 0, 0])
  console.log(`L11_WINDOWS_SCANNER ${JSON.stringify({ platform: process.platform, arch: process.arch,
    nativePE: true, bytes: bytes.byteLength, sha256: new Bun.CryptoHasher("sha256").update(bytes).digest("hex") })}`)
  return executable
}
