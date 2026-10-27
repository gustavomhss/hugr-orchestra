#!/usr/bin/env bun

// Merges each build's latest*.yml (LATEST_YML_DIR/latest-yml-<rust target>/) into the update feed that
// .github/workflows/release-desktop.yml publishes in the desktop-latest release, and writes it to LATEST_YML_OUT. Every
// payload a feed names must be in LATEST_PAYLOAD_DIR with the size and sha512 the feed records, and every feed must
// carry ORCHESTRA_VERSION, so a published feed never points at a missing or different file.
import path from "path"

type FileEntry = {
  url: string
  sha512: string
  size: number
  blockMapSize?: number
}

type LatestYml = {
  version: string
  files: FileEntry[]
  releaseDate: string
}

export async function finalize(input: { dir: string; out: string; payloads: string; version: string }) {
  const output: Record<string, string> = {}

  // Windows: merge arm64 + x64 into single file
  const winX64 = await read(input.dir, "latest-yml-x86_64-pc-windows-msvc", "latest.yml")
  const winArm64 = await read(input.dir, "latest-yml-aarch64-pc-windows-msvc", "latest.yml")
  if (winX64 || winArm64) {
    const base = winArm64 ?? winX64!
    output["latest.yml"] = serialize({
      version: base.version,
      files: [...(winArm64?.files ?? []), ...(winX64?.files ?? [])],
      releaseDate: base.releaseDate,
    })
  }

  // Linux x64: pass through
  const linuxX64 = await read(input.dir, "latest-yml-x86_64-unknown-linux-gnu", "latest-linux.yml")
  if (linuxX64) output["latest-linux.yml"] = serialize(linuxX64)

  // Linux arm64: pass through
  const linuxArm64 = await read(input.dir, "latest-yml-aarch64-unknown-linux-gnu", "latest-linux-arm64.yml")
  if (linuxArm64) output["latest-linux-arm64.yml"] = serialize(linuxArm64)

  // macOS: merge arm64 + x64 into single file
  const macX64 = await read(input.dir, "latest-yml-x86_64-apple-darwin", "latest-mac.yml")
  const macArm64 = await read(input.dir, "latest-yml-aarch64-apple-darwin", "latest-mac.yml")
  if (macX64 || macArm64) {
    const base = macArm64 ?? macX64!
    output["latest-mac.yml"] = serialize({
      version: base.version,
      files: [...(macArm64?.files ?? []), ...(macX64?.files ?? [])],
      releaseDate: base.releaseDate,
    })
  }

  if (Object.keys(output).length === 0) throw new Error(`No latest*.yml found under ${input.dir}`)

  await Promise.all(
    Object.entries(output).map(async ([filename, content]) => {
      const feed = parse(content)
      if (feed.version !== input.version)
        throw new Error(`${filename} carries version ${feed.version}, expected ${input.version}`)
      await Promise.all(feed.files.map((file) => verifyPayload(input.payloads, filename, file)))
      await Bun.write(path.join(input.out, filename), content)
      console.log(`wrote ${filename}: ${feed.files.map((file) => file.url).join(", ")}`)
    }),
  )

  return output
}

if (import.meta.main) {
  const dir = process.env.LATEST_YML_DIR
  if (!dir) throw new Error("LATEST_YML_DIR is required")

  const out = process.env.LATEST_YML_OUT
  if (!out) throw new Error("LATEST_YML_OUT is required")

  const payloads = process.env.LATEST_PAYLOAD_DIR
  if (!payloads) throw new Error("LATEST_PAYLOAD_DIR is required")

  const version = process.env.ORCHESTRA_VERSION
  if (!version) throw new Error("ORCHESTRA_VERSION is required")

  await finalize({ dir, out, payloads, version })
}

function parse(content: string): LatestYml {
  const lines = content.split("\n")
  let version = ""
  let releaseDate = ""
  const files: FileEntry[] = []
  let current: Partial<FileEntry> | undefined

  const flush = () => {
    if (current?.url && current.sha512 && current.size) files.push(current as FileEntry)
    current = undefined
  }

  for (const line of lines) {
    const indented = line.startsWith("    ") || line.startsWith("  -")
    if (line.startsWith("version:")) version = line.slice("version:".length).trim()
    else if (line.startsWith("releaseDate:"))
      releaseDate = line.slice("releaseDate:".length).trim().replace(/^'|'$/g, "")
    else if (line.trim().startsWith("- url:")) {
      flush()
      current = { url: line.trim().slice("- url:".length).trim() }
    } else if (indented && current && line.trim().startsWith("sha512:"))
      current.sha512 = line.trim().slice("sha512:".length).trim()
    else if (indented && current && line.trim().startsWith("size:"))
      current.size = Number(line.trim().slice("size:".length).trim())
    else if (indented && current && line.trim().startsWith("blockMapSize:"))
      current.blockMapSize = Number(line.trim().slice("blockMapSize:".length).trim())
    else if (!indented && current) flush()
  }
  flush()

  return { version, files, releaseDate }
}

function serialize(data: LatestYml) {
  const lines = [`version: ${data.version}`, "files:"]
  for (const file of data.files) {
    lines.push(`  - url: ${file.url}`)
    lines.push(`    sha512: ${file.sha512}`)
    lines.push(`    size: ${file.size}`)
    if (file.blockMapSize) lines.push(`    blockMapSize: ${file.blockMapSize}`)
  }
  lines.push(`releaseDate: '${data.releaseDate}'`)
  return lines.join("\n") + "\n"
}

async function read(dir: string, subdir: string, filename: string): Promise<LatestYml | undefined> {
  const file = Bun.file(path.join(dir, subdir, filename))
  if (!(await file.exists())) return undefined
  return parse(await file.text())
}

async function verifyPayload(payloads: string, feed: string, file: FileEntry) {
  const payload = Bun.file(path.join(payloads, file.url))
  if (!(await payload.exists())) throw new Error(`${feed} names ${file.url}, which no build produced`)
  const hasher = new Bun.CryptoHasher("sha512")
  for await (const chunk of payload.stream()) hasher.update(chunk)
  if (payload.size !== file.size || hasher.digest("base64") !== file.sha512)
    throw new Error(`${file.url} differs from the size or sha512 in ${feed}`)
}
