import { createHash } from "node:crypto"
import { lstat, readFile, readdir } from "node:fs/promises"
import { join } from "node:path"

const targets = [
  "linux-x64-baseline",
  "linux-arm64",
  "darwin-arm64",
  "darwin-x64-baseline",
  "windows-x64-baseline",
  "windows-arm64",
  "linux-x64-baseline-musl",
  "linux-arm64-musl",
]
const installers = [
  "mac-arm64.dmg",
  "mac-x64.dmg",
  "mac-arm64.zip",
  "mac-x64.zip",
  "win-x64.exe",
  "win-arm64.exe",
  "linux-x86_64.AppImage",
  "linux-amd64.deb",
  "linux-x86_64.rpm",
]
const identityKeys = ["version", "sourceSha", "cliRunId", "desktopRunId", "qualificationRunId"] as const

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected an object")
  return value as Record<string, unknown>
}

function identity(value: unknown) {
  const result = object(value)
  if (typeof result.version !== "string" || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(result.version))
    throw new Error("Invalid stable version")
  if (typeof result.sourceSha !== "string" || !/^[a-f0-9]{40}$/.test(result.sourceSha))
    throw new Error("Invalid source SHA")
  for (const key of identityKeys.slice(2)) {
    if (typeof result[key] !== "number" || !Number.isSafeInteger(result[key]) || result[key] <= 0)
      throw new Error(`Invalid ${key}`)
  }
  return result
}

export async function verifyReleaseArtifacts(root: string, receipt: unknown, expected: unknown): Promise<void> {
  const wanted = identity(expected)
  const actual = identity(receipt)
  for (const key of identityKeys) if (actual[key] !== wanted[key]) throw new Error(`Identity mismatch: ${key}`)
  const validation = object(actual.validation)
  if (actual.schemaVersion !== 1 || validation.result !== "pass" || !Array.isArray(actual.files))
    throw new Error("Invalid validation receipt")
  if (validation.appVersion !== wanted.version || validation.cliVersion !== wanted.version)
    throw new Error("Runtime version mismatch")
  const version = wanted.version
  const desktop = installers.map((suffix) => `desktop/orchestra-desktop-${suffix}`)
  const required = new Set([
    ...targets.map((target) => `cli/orchestra-${version}-${target}.tar.gz`),
    ...targets.map((target) => `cli/npm-packs/humanguardrail-cli-${target}-${version}.tgz`),
    `cli/npm-packs/humanguardrail-cli-${version}.tgz`,
    "cli/install.sh",
    "cli/SHA256SUMS",
    ...desktop,
    "feed/latest.yml",
    "feed/latest-mac.yml",
    "feed/latest-linux.yml",
    "feed/SHA256SUMS",
  ])
  const allowed = new Set([...required, ...desktop.map((path) => `${path}.blockmap`)])
  const files = new Map<string, { size: number; sha256: string }>()
  for (const entry of actual.files) {
    const file = object(entry)
    if (typeof file.path !== "string" || !allowed.has(file.path) || files.has(file.path))
      throw new Error("Invalid or duplicate artifact path")
    if (typeof file.size !== "number" || !Number.isSafeInteger(file.size) || file.size < 0)
      throw new Error(`Invalid size: ${file.path}`)
    if (typeof file.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(file.sha256))
      throw new Error(`Invalid digest: ${file.path}`)
    files.set(file.path, { size: file.size, sha256: file.sha256 })
  }
  for (const path of required) if (!files.has(path)) throw new Error(`Missing receipt artifact: ${path}`)
  const rootStat = await lstat(root)
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error("Invalid artifact root")
  const seen = new Set<string>()
  const directories = new Set(["cli", "cli/npm-packs", "desktop", "feed"])
  async function inspect(path: string): Promise<void> {
    const stat = await lstat(join(root, path))
    if (stat.isSymbolicLink()) throw new Error(`Symlink artifact: ${path}`)
    if (stat.isDirectory()) {
      if (!directories.has(path)) throw new Error(`Unexpected directory: ${path}`)
      for (const name of await readdir(join(root, path))) await inspect(`${path}/${name}`)
      return
    }
    const file = files.get(path)
    if (!stat.isFile() || !file) throw new Error(`Unexpected artifact: ${path}`)
    const bytes = await readFile(join(root, path))
    if (bytes.length !== file.size || createHash("sha256").update(bytes).digest("hex") !== file.sha256)
      throw new Error(`Artifact mismatch: ${path}`)
    if (path.startsWith("feed/") && path.endsWith(".yml")) {
      const versions = [...bytes.toString("utf8").matchAll(/^(?:version|"version"|'version')[ \t]*:([^\r\n]*)/gm)]
      const scalar = versions[0]?.[1]?.trim()
      if (versions.length !== 1 || ![version, `"${version}"`, `'${version}'`].includes(scalar))
        throw new Error(`Feed version mismatch: ${path}`)
    }
    seen.add(path)
  }
  for (const path of ["cli", "desktop", "feed"]) {
    const stat = await lstat(join(root, path))
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`Invalid publication directory: ${path}`)
    await inspect(path)
  }
  for (const path of files.keys()) if (!seen.has(path)) throw new Error(`Missing artifact: ${path}`)
}

if (import.meta.main) {
  const root = process.argv[2]
  const receipt = process.argv[3]
  if (!root || !receipt) throw new Error("Usage: release-artifact-identity.ts ROOT RECEIPT")
  await verifyReleaseArtifacts(root, JSON.parse(await readFile(receipt, "utf8")), {
    version: process.env.VERSION,
    sourceSha: process.env.GITHUB_SHA,
    cliRunId: Number(process.env.CLI_RUN_ID),
    desktopRunId: Number(process.env.DESKTOP_RUN_ID),
    qualificationRunId: Number(process.env.QUALIFICATION_RUN_ID),
  })
  console.log("Release artifact identity verified")
}
