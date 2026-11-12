import { expect, test } from "bun:test"
import { createHash } from "node:crypto"

type DesktopFeed = {
  version: string
  files: readonly { url: string; sha512: string; size: number; blockMapSize?: number }[]
  releaseDate?: string
  path?: string
  sha512?: string
}
type FeedFloor = { version: string; receiptSha256: string }
type Api = {
  parseDesktopFeed(text: string): DesktopFeed
  parseDesktopFeedFloor(body: string): FeedFloor | undefined
  withDesktopFeedFloor(body: string, floor: FeedFloor): string
  assertDesktopFeedVersion(input: {
    version: string
    receiptSha256: string
    currentFeeds: readonly { name: string; feed: DesktopFeed }[]
    floor?: FeedFloor
    releaseExists: boolean
  }): void
  validateDesktopFeedTargets(
    feed: DesktopFeed,
    input: {
      version: string
      repository: string
      payloads: ReadonlyMap<string, { size: number; sha512: string; blockmap?: boolean }>
    },
  ): void
}
// Missing future helper is individual API RED; it does not prevent existing verifier/workflow evidence from loading.
const api = () => import(new URL("../src/desktop-feed.ts", import.meta.url).href) as Promise<Api>
const version = "0.3.6"
const receiptSha256 = "a".repeat(64)
const repository = "fixture/release"
const name = "orchestra-desktop-mac-x64.zip"
const bytes = "approved exact desktop payload"
const sha512 = createHash("sha512").update(bytes).digest("base64")
const local: DesktopFeed = {
  version,
  files: [{ url: name, sha512, size: Buffer.byteLength(bytes) }],
  releaseDate: "2026-11-01T00:00:00.000Z",
}
const absolute = `https://github.com/${repository}/releases/download/desktop-v${version}/${name}`
const immutable: DesktopFeed = { ...local, files: [{ ...local.files[0], url: absolute }] }
const currentFeeds = ["latest.yml", "latest-mac.yml", "latest-linux.yml"].map((name) => ({ name, feed: local }))
const target = { version, repository, payloads: new Map([[name, { size: Buffer.byteLength(bytes), sha512 }]]) }
const marker = (floor: FeedFloor) => `<!-- orchestra-feed-v1:${JSON.stringify(floor)} -->`

test("desktop feed API accepts real producer and legacy fields without coercion", async () => {
  const helper = await api()
  const pair = { ...local, path: name, sha512 }
  expect(helper.parseDesktopFeed(JSON.stringify(pair))).toEqual(pair)
  expect(helper.parseDesktopFeed(JSON.stringify(immutable))).toEqual(immutable)
})

for (const invalid of [
  { ...local, version: "0.3.6-beta.1" },
  { ...local, files: [] },
  { ...local, files: [{ ...local.files[0], size: "29" }] },
  { ...local, files: [{ ...local.files[0], size: -1 }] },
  { ...local, files: [{ ...local.files[0], size: 1.5 }] },
  { ...local, files: [{ ...local.files[0], sha512: "not-a-SHA512" }] },
  { ...local, files: [{ ...local.files[0], url: "" }] },
  { ...local, files: [{ ...local.files[0], blockMapSize: 0 }] },
]) {
  test(`desktop feed API rejects invalid structured metadata ${JSON.stringify(invalid)}`, async () => {
    const helper = await api()
    expect(() => helper.parseDesktopFeed(JSON.stringify(invalid))).toThrow("RELEASE_FEED_INVALID")
  })
}

for (const pair of [
  { path: name },
  { sha512 },
  { path: "different.zip", sha512 },
  { path: name, sha512: createHash("sha512").update("other bytes").digest("base64") },
]) {
  test(`desktop feed API rejects contradictory legacy pair ${JSON.stringify(pair)}`, async () => {
    const helper = await api()
    expect(() => helper.parseDesktopFeed(JSON.stringify({ ...local, ...pair }))).toThrow("RELEASE_FEED_INVALID")
  })
}

test("desktop feed API accepts a legacy pair matching another actual files entry", async () => {
  const helper = await api()
  const pair = { ...local, files: [{ ...local.files[0], url: "first.zip" }, local.files[0]], path: name, sha512 }
  expect(helper.parseDesktopFeed(JSON.stringify(pair))).toEqual(pair)
})

test("desktop feed API floor is absent or exact, preserves notes and refuses duplicate malformed or regressing identity", async () => {
  const helper = await api()
  const floor = { version, receiptSha256 }
  expect(helper.parseDesktopFeedFloor("Human notes\n")).toBeUndefined()
  expect(helper.parseDesktopFeedFloor(`Human notes\n${marker(floor)}`)).toEqual(floor)
  const body = helper.withDesktopFeedFloor("Human notes\n", floor)
  expect(body).toContain("Human notes")
  expect(helper.parseDesktopFeedFloor(body)).toEqual(floor)
  expect(helper.withDesktopFeedFloor(body, floor).match(/orchestra-feed-v1:/g)).toHaveLength(1)
  for (const bad of [
    marker(floor) + marker(floor),
    "<!-- orchestra-feed-v1:{partial -->",
    marker({ version, receiptSha256: "bad" }),
    marker({ version: "future", receiptSha256 }),
  ])
    expect(() => helper.parseDesktopFeedFloor(bad)).toThrow("RELEASE_FEED_FLOOR_INVALID")
  expect(() => helper.withDesktopFeedFloor(body, { version: "0.3.5", receiptSha256 })).toThrow()
  expect(() => helper.withDesktopFeedFloor(body, { version, receiptSha256: "b".repeat(64) })).toThrow()
})

test("desktop feed API floor survives all manifests absent and authorizes only same receipt repair", async () => {
  const helper = await api()
  const floor = { version, receiptSha256 }
  expect(() =>
    helper.assertDesktopFeedVersion({ version, receiptSha256, currentFeeds: [], floor, releaseExists: true }),
  ).not.toThrow()
  expect(() =>
    helper.assertDesktopFeedVersion({ version: "0.3.5", receiptSha256, currentFeeds: [], floor, releaseExists: true }),
  ).toThrow()
  expect(() =>
    helper.assertDesktopFeedVersion({
      version,
      receiptSha256: "b".repeat(64),
      currentFeeds: [],
      floor,
      releaseExists: true,
    }),
  ).toThrow()
  expect(() =>
    helper.assertDesktopFeedVersion({ version, receiptSha256, currentFeeds: [], releaseExists: false }),
  ).not.toThrow()
})

test("desktop feed API admits complete legacy state but refuses unmarked partial duplicate unknown and newer SO metadata", async () => {
  const helper = await api()
  const input = { version, receiptSha256, currentFeeds, releaseExists: true }
  expect(() => helper.assertDesktopFeedVersion(input)).not.toThrow()
  for (const feeds of [
    currentFeeds.slice(1),
    [...currentFeeds, currentFeeds[0]],
    [...currentFeeds, { name: "unknown.yml", feed: local }],
    [...currentFeeds, { name: "latest-linux-arm64.yml", feed: { ...local, version: "0.3.7" } }],
  ])
    expect(() => helper.assertDesktopFeedVersion({ ...input, currentFeeds: feeds })).toThrow()
})

test("desktop feed API validates actual immutable payload size and digest with approved adjacent blockmaps", async () => {
  const helper = await api()
  expect(() => helper.validateDesktopFeedTargets(immutable, target)).not.toThrow()
  const mapped = { ...immutable, files: [{ ...immutable.files[0], blockMapSize: 32 }] }
  expect(() => helper.validateDesktopFeedTargets(mapped, target)).toThrow()
  expect(() =>
    helper.validateDesktopFeedTargets(mapped, {
      ...target,
      payloads: new Map([[name, { ...target.payloads.get(name)!, blockmap: true }]]),
    }),
  ).not.toThrow()
  expect(() =>
    helper.validateDesktopFeedTargets(immutable, { ...target, payloads: new Map([[name, { size: 1, sha512 }]]) }),
  ).toThrow()
  expect(() =>
    helper.validateDesktopFeedTargets(immutable, {
      ...target,
      payloads: new Map([
        [name, { size: Buffer.byteLength(bytes), sha512: createHash("sha512").update("wrong").digest("base64") }],
      ]),
    }),
  ).toThrow()
})

for (const url of [
  name,
  `https://other.invalid/${name}`,
  absolute.replace("fixture/release", "foreign/repo"),
  absolute.replace("desktop-v0.3.6", "desktop-v0.3.5"),
  absolute.replace("https://", "http://"),
  absolute + "?token=x",
  absolute + "#override",
  absolute.replace("github.com", "user:password@github.com"),
  absolute.replace(name, `%2F${name}`),
  absolute.replace(name, `../${name}`),
  absolute.replace(name, `%2e%2e/${name}`),
]) {
  test(`desktop feed API rejects non-immutable candidate target ${url}`, async () => {
    const helper = await api()
    expect(() =>
      helper.validateDesktopFeedTargets({ ...immutable, files: [{ ...immutable.files[0], url }] }, target),
    ).toThrow()
  })
}

test("desktop feed API refuses effective legacy or package override URLs outside validated files", async () => {
  const helper = await api()
  for (const extra of [
    { path: name, sha512 },
    { packages: { x64: { path: "https://unapproved.invalid/payload.7z", sha512 } } },
  ])
    expect(() =>
      helper.validateDesktopFeedTargets(helper.parseDesktopFeed(JSON.stringify({ ...immutable, ...extra })), target),
    ).toThrow()
})
