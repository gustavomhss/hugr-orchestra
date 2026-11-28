import { expect } from "bun:test"
import { copyFile } from "node:fs/promises"
import path from "node:path"

type Profile = { readonly payload: string; readonly scans: string } & (
  | { readonly profile: "receipts"; readonly blocked: string }
  | { readonly profile: "atomic"; readonly armed: string; readonly witness: string; readonly faultPayload: string;
      readonly review: string; readonly backup: string }
)

// A native executable replaces only the fixtures' POSIX scanner process. Detection itself is not qualified here.
export async function buildWindowsScanner(root: string) {
  const entry = path.join(root, "scanner.ts")
  const executable = path.join(root, "scanner.exe")
  await Bun.write(entry, String.raw`
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
const args = process.argv.slice(2);
if (args.length === 1 && args[0] === "--version") process.exit(0);
if (JSON.stringify(args) !== JSON.stringify(["stdin", "--report-format", "json", "--exit-code", "1"])) process.exit(2);
const config = JSON.parse(readFileSync(process.execPath + ".json", "utf8"));
if (typeof config.payload !== "string" || typeof config.scans !== "string") process.exit(2);
if (config.profile !== "receipts" && config.profile !== "atomic") process.exit(2);
const required = config.profile === "receipts" ? ["blocked"] : ["armed", "witness", "faultPayload", "review", "backup"];
if (required.some((key) => typeof config[key] !== "string")) process.exit(2);
try {
  const payload = readFileSync(0);
  if (config.profile === "receipts") appendFileSync(config.payload, payload);
  else writeFileSync(config.payload, payload);
  // TS template source has two backslashes, yielding one for shell printf: existing marker bytes are scan + LF.
  appendFileSync(config.scans, Buffer.from([0x73, 0x63, 0x61, 0x6e, 0x0a]));
  if (config.profile === "receipts") {
    if (existsSync(config.blocked)) process.exit(1);
    process.exit(0);
  }
  if (existsSync(config.armed) && !existsSync(config.witness)) {
    if (!payload.includes("joint decision must not expose an uncommitted rule")) process.exit(1);
    copyFileSync(config.payload, config.faultPayload);
    renameSync(config.review, config.backup);
    mkdirSync(config.review);
    writeFileSync(config.witness, "actual record scanned");
  }
  process.exit(0);
} catch { process.exit(1); }
`)
  const built = await Bun.build({
    entrypoints: [entry], target: "bun",
    compile: {
      outfile: executable,
      autoloadBunfig: false, autoloadDotenv: false, autoloadTsconfig: false, autoloadPackageJson: false,
    },
  })
  expect(built.success, `Native boundary scanner build: ${built.logs.join("\n")}`).toBe(true)
  const bytes = new Uint8Array(await Bun.file(executable).arrayBuffer())
  expect(bytes.byteLength).toBeGreaterThan(64)
  expect(Array.from(bytes.subarray(0, 2))).toEqual([0x4d, 0x5a])
  const pe = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0x3c, true)
  expect(pe + 4).toBeLessThanOrEqual(bytes.byteLength)
  expect(Array.from(bytes.subarray(pe, pe + 4))).toEqual([0x50, 0x45, 0, 0])
  console.log(`L11_BOUNDARY_WINDOWS_SCANNER ${JSON.stringify({ platform: process.platform, arch: process.arch,
    nativePE: true, bytes: bytes.byteLength, sha256: new Bun.CryptoHasher("sha256").update(bytes).digest("hex") })}`)
  return async (command: string, profile: Profile) => {
    await copyFile(executable, command)
    await Bun.write(command + ".json", JSON.stringify(profile))
    return command
  }
}
