import { createHash } from "node:crypto"
import { appendFile, lstat, mkdir, mkdtemp, realpath } from "node:fs/promises"
import path from "node:path"

export const distributionDenoVersion = "2.9.7"

// Exact native upstream release assets; GitHub v2.9.7 asset SHA-256 receipts,
// 2026-10-14. npm's wrapper publication is not this release's availability oracle.
const pins = {
  "darwin-arm64": ["aarch64-apple-darwin", "5cd46d6268f6f78f5d88bdc7159d20bd44cdaa4b3303474839f87ec6fe7ae25c"],
  "darwin-x64": ["x86_64-apple-darwin", "95daaff11c116a52ad54785e7914c8e9c9cdcaba793c5ed929c74ca2d8e6259a"],
  "linux-arm64": ["aarch64-unknown-linux-gnu", "c832298b1ad4422481334855f6003e0f54145762c5a134f20a489511d2f65bbf"],
  "linux-x64": ["x86_64-unknown-linux-gnu", "c6527f24f4b16031d3ae4fa9f658d5f11534c8d84ce7dc8502420280919c3490"],
  "win32-arm64": ["aarch64-pc-windows-msvc", "c4c4ac8bfdaa37814bda5c05fc9cdf2154904e2ef8277673a30bdceaaa649807"],
  "win32-x64": ["x86_64-pc-windows-msvc", "a0c3101b4158d1dfb7d6a78a7bf0f3de80c96bb423c152beec8beb22786f2238"],
} as const

export const distributionDenoMaxBytes = 128 * 1024 * 1024

export async function admitDistributionDeno(env = process.env) {
  if (env.RUNNER_ENVIRONMENT !== "github-hosted" || !env.RUNNER_TEMP || !env.GITHUB_ENV || !env.GITHUB_WORKSPACE)
    throw new Error("DENO_OWNED_HOSTED_SETUP_REQUIRED")
  const row: unknown = JSON.parse(env.ROW ?? "null")
  const hosts = { "darwin-arm64": "macos-14", "darwin-x64": "macos-15-intel", "linux-arm64": "ubuntu-24.04-arm",
    "linux-x64": "ubuntu-latest", "win32-arm64": "windows-11-arm", "win32-x64": "windows-latest" }
  const pin = Object.entries(pins).find(([host]) => host === `${process.platform}-${process.arch}`)?.[1]
  if (!pin) throw new Error("DENO_NATIVE_HOST_UNSUPPORTED")
  if (!row || typeof row !== "object" || !("package" in row) || !("platform" in row) || !("cpu" in row) || !("host" in row) ||
      row.package !== "cli" || row.platform !== process.platform || row.cpu !== (process.arch === "x64" ? "X64" : "ARM64") ||
      row.host !== hosts[`${process.platform}-${process.arch}` as keyof typeof hosts] || env.RUNNER_ARCH !== row.cpu ||
      env.RUNNER_OS !== (process.platform === "darwin" ? "macOS" : process.platform === "linux" ? "Linux" : "Windows"))
    throw new Error("DENO_NATIVE_HOST_MISMATCH")
  const checkout = await realpath(path.resolve(import.meta.dirname, ".."))
  const canonical = async (file: string, directory: boolean) => {
    const info = await lstat(file).catch(() => { throw new Error("DENO_SETUP_PATH_MISSING") })
    if (info.isSymbolicLink() || (directory ? !info.isDirectory() : !info.isFile() || info.nlink !== 1))
      throw new Error("DENO_SETUP_PATH_TYPE")
    if (process.getuid && info.uid !== process.getuid()) throw new Error("DENO_SETUP_PATH_OWNER")
    if (!path.isAbsolute(file) || path.resolve(file) !== await realpath(file) || /[\r\n]/.test(file))
      throw new Error("DENO_SETUP_PATH_CANONICAL")
    return path.resolve(file)
  }
  const workspace = await canonical(env.GITHUB_WORKSPACE, true)
  const temp = await canonical(env.RUNNER_TEMP, true)
  const githubEnv = await canonical(env.GITHUB_ENV, false)
  if (workspace !== checkout || temp === checkout ||
      temp.startsWith(checkout + path.sep) || checkout.startsWith(temp + path.sep) || !githubEnv.startsWith(temp + path.sep))
    throw new Error("DENO_OWNED_SETUP_PATH_MISMATCH")
  return { checkout, temp, githubEnv, pin }
}

// Same streaming boundary serves upstream setup and hosted loopback HTTP controls.
export async function downloadDistributionDeno(url: string, digest: string) {
  const controller = new AbortController()
  const response = await fetch(url, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(120_000)]), redirect: "follow" })
  if (!response.ok) {
    return rejectDownload(controller, new Error(`DENO_UPSTREAM_DOWNLOAD_FAILED: HTTP ${response.status}`), () => response.body?.cancel())
  }
  const length = response.headers.get("content-length")
  if (length !== null && (!/^\d+$/.test(length) || !Number.isSafeInteger(Number(length)) || Number(length) > distributionDenoMaxBytes)) {
    return rejectDownload(controller, new Error("DENO_DOWNLOAD_CONTENT_LENGTH_LIMIT"), () => response.body?.cancel())
  }
  if (!response.body) throw new Error("DENO_DOWNLOAD_BODY_MISSING")
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  const size = { bytes: 0 }
  while (true) {
    const chunk = await reader.read()
    if (chunk.done) break
    size.bytes += chunk.value.byteLength
    if (size.bytes > distributionDenoMaxBytes) {
      return rejectDownload(controller, new Error("DENO_DOWNLOAD_STREAM_LIMIT"), () => reader.cancel())
    }
    chunks.push(chunk.value)
  }
  if (!size.bytes || (length !== null && size.bytes !== Number(length))) throw new Error("DENO_DOWNLOAD_SIZE_MISMATCH")
  const bytes = Buffer.concat(chunks, size.bytes)
  const sha256 = createHash("sha256").update(bytes).digest("hex")
  if (sha256 !== digest) throw new Error(`DENO_UPSTREAM_DIGEST_MISMATCH: ${sha256}`)
  return { bytes, sha256 }
}

async function rejectDownload(controller: AbortController, error: Error, cancel: () => Promise<unknown> | undefined): Promise<never> {
  // The named failure exists before abort; network teardown must precede stream cleanup.
  controller.abort(error)
  await cancel()?.catch(() => {}) // AbortError from cleanup must not replace the primary failure.
  throw error
}

export function requireDistributionDenoVersion(output: string) {
  if (!new RegExp(`^deno ${distributionDenoVersion.replaceAll(".", "\\.")}(?: \\([^\\r\\n]*\\))?$`).test(output.split(/\r?\n/)[0]))
    throw new Error("DENO_RUNTIME_VERSION_MISMATCH")
}

export async function installDistributionDeno(env = process.env) {
  // Admission precedes download, temp creation, archive writes and environment publication.
  const admitted = await admitDistributionDeno(env)
  const url = `https://github.com/denoland/deno/releases/download/v${distributionDenoVersion}/deno-${admitted.pin[0]}.zip`
  const downloaded = await downloadDistributionDeno(url, admitted.pin[1])
  const directory = await mkdtemp(path.join(admitted.temp, "distribution-deno-"))
  await Bun.write(path.join(directory, "deno.zip"), downloaded.bytes)
  const executable = path.join(directory, process.platform === "win32" ? "deno.exe" : "deno")
  await appendFile(admitted.githubEnv, `ORCHESTRA_DISTRIBUTION_DENO=${executable}\nORCHESTRA_DISTRIBUTION_DENO_VERSION=${distributionDenoVersion}\nDISTRIBUTION_DENO_DIRECTORY=${directory}\n`)
  await mkdir(path.join(admitted.checkout, "distribution-logs"), { recursive: true })
  await Bun.write(path.join(admitted.checkout, "distribution-logs/deno-runtime.json"), JSON.stringify({ version: distributionDenoVersion, url, sha256: downloaded.sha256,
    host: { os: process.platform, cpu: process.arch }, executable }, null, 2) + "\n")
}

if (import.meta.main) await (process.argv[2] === "--admit" ? admitDistributionDeno()
  : process.argv[2] === "--verify-version" ? Bun.file(process.argv[3]).text().then(requireDistributionDenoVersion)
  : installDistributionDeno())
