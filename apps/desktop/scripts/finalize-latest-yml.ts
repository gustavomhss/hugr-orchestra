#!/usr/bin/env bun

// The approved feed names immutable versioned release assets; only its metadata moves in desktop-latest.
import path from "path"
import { lstat } from "node:fs/promises"
import { parseDesktopFeed, validateDesktopFeedTargets, type DesktopFeed } from "@orchestra/script/desktop-feed"

export async function finalize(input: {
  dir: string
  out: string
  payloads: string
  version: string
  repository?: string
}) {
  const feeds: Record<string, DesktopFeed> = {}
  const winX64 = await read(input, "x86_64-pc-windows-msvc", "latest.yml")
  const winArm64 = await read(input, "aarch64-pc-windows-msvc", "latest.yml")
  if (winX64 || winArm64) {
    const base = winArm64 ?? winX64!
    feeds["latest.yml"] = {
      version: base.version,
      files: [...(winArm64?.files ?? []), ...(winX64?.files ?? [])],
      releaseDate: base.releaseDate,
    }
  }
  const linuxX64 = await read(input, "x86_64-unknown-linux-gnu", "latest-linux.yml")
  if (linuxX64) feeds["latest-linux.yml"] = linuxX64
  const linuxArm64 = await read(input, "aarch64-unknown-linux-gnu", "latest-linux-arm64.yml")
  if (linuxArm64) feeds["latest-linux-arm64.yml"] = linuxArm64
  const macX64 = await read(input, "x86_64-apple-darwin", "latest-mac.yml")
  const macArm64 = await read(input, "aarch64-apple-darwin", "latest-mac.yml")
  if (macX64 || macArm64) {
    const base = macArm64 ?? macX64!
    feeds["latest-mac.yml"] = {
      version: base.version,
      files: [...(macArm64?.files ?? []), ...(macX64?.files ?? [])],
      releaseDate: base.releaseDate,
    }
  }
  if (!Object.keys(feeds).length) throw new Error(`No latest*.yml found under ${input.dir}`)
  const repository = input.repository ?? "gustavomhss/hugr-orchestra"
  // Validate every original local payload before serializing any approved metadata.
  const output = Object.fromEntries(
    await Promise.all(
      Object.entries(feeds).map(async ([filename, feed]) => {
        const payloads = new Map(
          await Promise.all(
            feed.files.map(async (file) => {
              const actual = await verifyPayload(input.payloads, filename, file)
              return [file.url, actual] as const
            }),
          ),
        )
        const immutable: DesktopFeed = {
          version: feed.version,
          files: feed.files.map((file) => ({
            ...file,
            url: `https://github.com/${repository}/releases/download/desktop-v${input.version}/${encodeURIComponent(file.url)}`,
          })),
          ...(feed.releaseDate !== undefined ? { releaseDate: feed.releaseDate } : {}),
        }
        validateDesktopFeedTargets(immutable, { version: input.version, repository, payloads })
        return [filename, serialize(immutable)] as const
      }),
    ),
  )
  await Promise.all(
    Object.entries(output).map(async ([filename, content]) => {
      await Bun.write(path.join(input.out, filename), content)
      console.log(`wrote ${filename}`)
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
  await finalize({ dir, out, payloads, version, repository: process.env.GITHUB_REPOSITORY })
}

async function read(input: { dir: string; version: string }, target: string, filename: string) {
  const file = Bun.file(path.join(input.dir, `latest-yml-${target}`, filename))
  if (!(await file.exists())) return
  const feed = parseDesktopFeed(await file.text())
  if (feed.version !== input.version)
    throw new Error(`${filename} carries version ${feed.version}, expected ${input.version}`)
  return feed
}

function serialize(feed: DesktopFeed) {
  const lines = [`version: ${feed.version}`, "files:"]
  for (const file of feed.files) {
    lines.push(`  - url: ${file.url}`, `    sha512: ${file.sha512}`, `    size: ${file.size}`)
    if (file.blockMapSize !== undefined) lines.push(`    blockMapSize: ${file.blockMapSize}`)
  }
  if (feed.releaseDate !== undefined)
    lines.push(
      `releaseDate: ${/[\u0000-\u001f\u007f']/.test(feed.releaseDate) ? JSON.stringify(feed.releaseDate) : `'${feed.releaseDate}'`}`,
    )
  return lines.join("\n") + "\n"
}

async function verifyPayload(directory: string, feed: string, file: DesktopFeed["files"][number]) {
  if (!file.url || /[/\\:\u0000-\u001f\u007f]/.test(file.url) || file.url === "." || file.url === "..")
    throw new Error("RELEASE_FEED_PAYLOAD_NAME_INVALID")
  const filename = path.join(directory, file.url)
  const payload = Bun.file(filename)
  if (!(await payload.exists())) throw new Error(`${feed} names ${file.url}, which no build produced`)
  const stat = await lstat(filename)
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("RELEASE_FEED_PAYLOAD_INVALID")
  const hasher = new Bun.CryptoHasher("sha512")
  for await (const chunk of payload.stream()) hasher.update(chunk)
  const sha512 = hasher.digest("base64")
  if (payload.size !== file.size || sha512 !== file.sha512)
    throw new Error(`${file.url} differs from the size or sha512 in ${feed}`)
  const blockmap = await lstat(`${filename}.blockmap`).then(
    (stat) => stat.isFile() && !stat.isSymbolicLink(),
    (error: unknown) => {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return false
      throw error
    },
  )
  return { size: payload.size, sha512, blockmap }
}
