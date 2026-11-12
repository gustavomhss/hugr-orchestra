import { YAML } from "bun"
import semver from "semver"

export type DesktopFeed = {
  readonly version: string
  readonly files: readonly {
    readonly url: string
    readonly sha512: string
    readonly size: number
    readonly blockMapSize?: number
  }[]
  readonly releaseDate?: string
  readonly path?: string
  readonly sha512?: string
}
export type FeedFloor = { readonly version: string; readonly receiptSha256: string }
const manifests = ["latest.yml", "latest-mac.yml", "latest-linux.yml"]
const allowedManifests = new Set([...manifests, "latest-linux-arm64.yml"])
const marker = "<!-- orchestra-feed-v1:"

export function parseDesktopFeed(text: string): DesktopFeed {
  try {
    return requireFeed(YAML.parse(text))
  } catch {
    throw new Error("RELEASE_FEED_INVALID")
  }
}

export function parseDesktopFeedFloor(body: string): FeedFloor | undefined {
  const start = body.indexOf("<!-- orchestra-feed-")
  if (start === -1) return
  if (!body.startsWith(marker, start) || body.indexOf("<!-- orchestra-feed-", start + marker.length) !== -1)
    throw new Error("RELEASE_FEED_FLOOR_INVALID")
  const end = body.indexOf(" -->", start)
  if (end === -1) throw new Error("RELEASE_FEED_FLOOR_INVALID")
  try {
    const value: unknown = JSON.parse(body.slice(start + marker.length, end))
    const floor = object(value)
    if (
      Object.keys(floor).some((key) => !["version", "receiptSha256"].includes(key)) ||
      !stable(floor.version) ||
      !receipt(floor.receiptSha256)
    )
      throw new Error("invalid floor")
    return { version: floor.version, receiptSha256: floor.receiptSha256 }
  } catch {
    throw new Error("RELEASE_FEED_FLOOR_INVALID")
  }
}

export function withDesktopFeedFloor(body: string, floor: FeedFloor): string {
  if (!stable(floor.version) || !receipt(floor.receiptSha256)) throw new Error("RELEASE_FEED_FLOOR_INVALID")
  const current = parseDesktopFeedFloor(body)
  if (
    current &&
    (semver.gt(current.version, floor.version) ||
      (current.version === floor.version && current.receiptSha256 !== floor.receiptSha256))
  )
    throw new Error("RELEASE_FEED_FLOOR_CONFLICT")
  const encoded = `${marker}${JSON.stringify({ version: floor.version, receiptSha256: floor.receiptSha256 })} -->`
  if (!current) return `${body}${body.endsWith("\n") || !body ? "" : "\n"}${encoded}`
  const start = body.indexOf(marker)
  const end = body.indexOf(" -->", start) + 4
  return body.slice(0, start) + encoded + body.slice(end)
}

export function assertDesktopFeedVersion(input: {
  version: string
  receiptSha256: string
  currentFeeds: readonly { name: string; feed: DesktopFeed }[]
  floor?: FeedFloor
  releaseExists: boolean
}): void {
  if (!stable(input.version) || !receipt(input.receiptSha256)) throw new Error("RELEASE_FEED_IDENTITY_INVALID")
  const names = new Set<string>()
  for (const current of input.currentFeeds) {
    if (!allowedManifests.has(current.name) || names.has(current.name))
      throw new Error("RELEASE_FEED_MANIFEST_SET_INVALID")
    names.add(current.name)
    const feed = requireFeed(current.feed)
    if (semver.gt(feed.version, input.version)) throw new Error("RELEASE_FEED_NEWER_VERSION")
  }
  if (input.floor) {
    if (!stable(input.floor.version) || !receipt(input.floor.receiptSha256))
      throw new Error("RELEASE_FEED_FLOOR_INVALID")
    if (semver.gt(input.floor.version, input.version)) throw new Error("RELEASE_FEED_NEWER_FLOOR")
    if (input.floor.version === input.version && input.floor.receiptSha256 !== input.receiptSha256)
      throw new Error("RELEASE_FEED_RECEIPT_CONFLICT")
  }
  if (input.releaseExists && !input.floor && manifests.some((name) => !names.has(name)))
    throw new Error("RELEASE_FEED_LEGACY_PARTIAL: repair the unmarked feed before promotion")
}

export function validateDesktopFeedTargets(
  feed: DesktopFeed,
  input: {
    version: string
    repository: string
    payloads: ReadonlyMap<string, { size: number; sha512: string; blockmap?: boolean }>
  },
): void {
  const parsed = requireFeed(feed)
  if (
    !stable(input.version) ||
    parsed.version !== input.version ||
    !/^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_.-]+$/.test(input.repository) ||
    input.repository.split("/").some((part) => part === "." || part === "..")
  )
    throw new Error("RELEASE_FEED_TARGET_INVALID")
  const prefix = `https://github.com/${input.repository}/releases/download/desktop-v${input.version}/`
  for (const file of parsed.files) {
    if (!file.url.startsWith(prefix))
      throw new Error("RELEASE_FEED_TARGET_INVALID: rebuild and revalidate immutable feed artifacts")
    const encoded = file.url.slice(prefix.length)
    const name = decodeURIComponent(encoded)
    if (
      !name ||
      /[/\\:\u0000-\u001f\u007f]/.test(name) ||
      name === "." ||
      name === ".." ||
      encoded !== encodeURIComponent(name)
    )
      throw new Error("RELEASE_FEED_TARGET_INVALID")
    const payload = input.payloads.get(name)
    if (
      !payload ||
      payload.size !== file.size ||
      payload.sha512 !== file.sha512
    )
      throw new Error("RELEASE_FEED_PAYLOAD_MISMATCH")
  }
  // requireFeed binds the deprecated effective URL/checksum pair to one of the files validated above.
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("RELEASE_FEED_INVALID")
  return value as Record<string, unknown>
}

function stable(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value) &&
    semver.valid(value) === value
  )
}

function receipt(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value)
}

function checksum(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[A-Za-z0-9+/]{86}==$/.test(value) &&
    Buffer.from(value, "base64").byteLength === 64 &&
    Buffer.from(value, "base64").toString("base64") === value
  )
}

function requireFeed(value: unknown): DesktopFeed {
  const feed = object(value)
  if (
    Object.keys(feed).some((key) => !["version", "files", "releaseDate", "path", "sha512"].includes(key)) ||
    !stable(feed.version) ||
    !Array.isArray(feed.files) ||
    !feed.files.length ||
    (feed.releaseDate !== undefined && typeof feed.releaseDate !== "string")
  )
    throw new Error("RELEASE_FEED_INVALID")
  const files = feed.files.map((item) => {
    const file = object(item)
    if (
      Object.keys(file).some((key) => !["url", "sha512", "size", "blockMapSize"].includes(key)) ||
      typeof file.url !== "string" ||
      !file.url.trim() ||
      !checksum(file.sha512) ||
      typeof file.size !== "number" ||
      !Number.isSafeInteger(file.size) ||
      file.size <= 0 ||
      (file.blockMapSize !== undefined &&
        (typeof file.blockMapSize !== "number" || !Number.isSafeInteger(file.blockMapSize) || file.blockMapSize <= 0))
    )
      throw new Error("RELEASE_FEED_INVALID")
    return {
      url: file.url,
      sha512: file.sha512,
      size: file.size,
      ...(file.blockMapSize !== undefined ? { blockMapSize: file.blockMapSize as number } : {}),
    }
  })
  if (
    (feed.path === undefined) !== (feed.sha512 === undefined) ||
    (feed.path !== undefined &&
      (typeof feed.path !== "string" ||
        !checksum(feed.sha512) ||
        !files.some((file) => file.url === feed.path && file.sha512 === feed.sha512)))
  )
    throw new Error("RELEASE_FEED_INVALID")
  return {
    version: feed.version,
    files,
    ...(typeof feed.releaseDate === "string" ? { releaseDate: feed.releaseDate } : {}),
    ...(typeof feed.path === "string" && typeof feed.sha512 === "string"
      ? { path: feed.path, sha512: feed.sha512 }
      : {}),
  }
}
