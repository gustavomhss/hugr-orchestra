import { createHash } from "node:crypto"
import { appendFile, mkdir, mkdtemp } from "node:fs/promises"
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

if (import.meta.main) {
  if (process.env.RUNNER_ENVIRONMENT !== "github-hosted" || !process.env.RUNNER_TEMP || !process.env.GITHUB_ENV)
    throw new Error("DENO_OWNED_HOSTED_SETUP_REQUIRED")
  const pin = Object.entries(pins).find(([host]) => host === `${process.platform}-${process.arch}`)?.[1]
  if (!pin) throw new Error("DENO_NATIVE_HOST_UNSUPPORTED")
  const directory = await mkdtemp(path.join(process.env.RUNNER_TEMP, "distribution-deno-"))
  const url = `https://github.com/denoland/deno/releases/download/v${distributionDenoVersion}/deno-${pin[0]}.zip`
  const response = await fetch(url, { signal: AbortSignal.timeout(120_000), redirect: "follow" })
  if (!response.ok) throw new Error(`DENO_UPSTREAM_DOWNLOAD_FAILED: HTTP ${response.status}`)
  const bytes = new Uint8Array(await response.arrayBuffer())
  const sha256 = createHash("sha256").update(bytes).digest("hex")
  if (sha256 !== pin[1]) throw new Error(`DENO_UPSTREAM_DIGEST_MISMATCH: ${sha256}`)
  await Bun.write(path.join(directory, "deno.zip"), bytes)
  const executable = path.join(directory, process.platform === "win32" ? "deno.exe" : "deno")
  await appendFile(process.env.GITHUB_ENV, `ORCHESTRA_DISTRIBUTION_DENO=${executable}\nORCHESTRA_DISTRIBUTION_DENO_VERSION=${distributionDenoVersion}\nDISTRIBUTION_DENO_DIRECTORY=${directory}\n`)
  await mkdir("distribution-logs", { recursive: true })
  await Bun.write("distribution-logs/deno-runtime.json", JSON.stringify({ version: distributionDenoVersion, url, sha256,
    host: { os: process.platform, cpu: process.arch }, executable }, null, 2) + "\n")
}
