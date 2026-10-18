import { describe, expect, beforeAll, afterAll, beforeEach, afterEach } from "bun:test"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { FSUtil } from "@orchestra/core/fs-util"
import { Effect } from "effect"
import { Discovery } from "../../src/skill/discovery"
import { Global } from "@orchestra/core/global"
import { Filesystem } from "@/util/filesystem"
import { mkdtemp, rm } from "fs/promises"
import path from "path"
import { testEffect } from "../lib/effect"

let CLOUDFLARE_SKILLS_URL: string
let server: ReturnType<typeof Bun.serve>
let downloadCount = 0
let mutableVersion = "1"
let mutableContent = "# Old"
let mutableDownloadCount = 0
let mutableFiles = ["SKILL.md"]
let catalogAVersion = "1"
let catalogAContent = "# A"
let catalogBContent = "# B"

const fixturePath = path.join(import.meta.dir, "../fixture/skills")
let cacheDir: string
let previousCache: string
const it = testEffect(LayerNode.compile(LayerNode.group([Discovery.node, FSUtil.node])))

beforeAll(async () => {
  server = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url)

      if (url.pathname === "/mutable/index.json") {
        return Response.json({ skills: [{ name: "mutable", version: mutableVersion, files: mutableFiles }] })
      }
      if (url.pathname === "/mutable/mutable/SKILL.md") {
        mutableDownloadCount++
        return new Response(mutableContent)
      }
      if (url.pathname === "/mutable/mutable/old.md") return new Response("old reference")
      if (url.pathname === "/catalog-a/index.json") {
        return Response.json({ skills: [{ name: "shared", version: catalogAVersion, files: ["SKILL.md"] }] })
      }
      if (url.pathname === "/catalog-a/shared/SKILL.md") return new Response(catalogAContent)
      if (url.pathname === "/catalog-b/index.json") {
        return Response.json({ skills: [{ name: "shared", version: "1", files: ["SKILL.md"] }] })
      }
      if (url.pathname === "/catalog-b/shared/SKILL.md") return new Response(catalogBContent)

      // route /.well-known/skills/* to the fixture directory
      if (url.pathname.startsWith("/.well-known/skills/")) {
        const filePath = url.pathname.replace("/.well-known/skills/", "")
        const fullPath = path.join(fixturePath, filePath)

        if (await Filesystem.exists(fullPath)) {
          if (!fullPath.endsWith("index.json")) {
            downloadCount++
          }
          return new Response(Bun.file(fullPath))
        }
      }

      return new Response("Not Found", { status: 404 })
    },
  })

  CLOUDFLARE_SKILLS_URL = `http://localhost:${server.port}/.well-known/skills/`
})

afterAll(async () => {
  void server?.stop()
})

beforeEach(async () => {
  previousCache = Global.Path.cache
  cacheDir = await mkdtemp(path.join(Global.Path.tmp, "skill-discovery-"))
  ;(Global.Path as { cache: string }).cache = cacheDir
})

afterEach(async () => {
  ;(Global.Path as { cache: string }).cache = previousCache
  await rm(cacheDir, { recursive: true, force: true })
})

describe("Discovery.pull", () => {
  it.live("downloads skills from cloudflare url", () =>
    Effect.gen(function* () {
      const fsys = yield* FSUtil.Service
      const discovery = yield* Discovery.Service
      const dirs = yield* discovery.pull(CLOUDFLARE_SKILLS_URL)
      expect(dirs.length).toBeGreaterThan(0)
      for (const dir of dirs) {
        expect(dir).toStartWith(cacheDir)
        const md = path.join(dir, "SKILL.md")
        expect(yield* fsys.existsSafe(md)).toBe(true)
      }
    }),
  )

  it.live("url without trailing slash works", () =>
    Effect.gen(function* () {
      const fsys = yield* FSUtil.Service
      const discovery = yield* Discovery.Service
      const dirs = yield* discovery.pull(CLOUDFLARE_SKILLS_URL.replace(/\/$/, ""))
      expect(dirs.length).toBeGreaterThan(0)
      for (const dir of dirs) {
        const md = path.join(dir, "SKILL.md")
        expect(yield* fsys.existsSafe(md)).toBe(true)
      }
    }),
  )

  it.live("returns empty array for invalid url", () =>
    Effect.gen(function* () {
      const discovery = yield* Discovery.Service
      const dirs = yield* discovery.pull(`http://localhost:${server.port}/invalid-url/`)
      expect(dirs).toEqual([])
    }),
  )

  it.live("returns empty array for non-json response", () =>
    Effect.gen(function* () {
      // any url not explicitly handled in server returns 404 text "Not Found"
      const discovery = yield* Discovery.Service
      const dirs = yield* discovery.pull(`http://localhost:${server.port}/some-other-path/`)
      expect(dirs).toEqual([])
    }),
  )

  it.live("downloads reference files alongside SKILL.md", () =>
    Effect.gen(function* () {
      const fsys = yield* FSUtil.Service
      const discovery = yield* Discovery.Service
      const dirs = yield* discovery.pull(CLOUDFLARE_SKILLS_URL)
      // find a skill dir that should have reference files (e.g. agents-sdk)
      const agentsSdk = dirs.find((d) => d.endsWith(path.sep + "agents-sdk"))
      expect(agentsSdk).toBeDefined()
      if (agentsSdk) {
        const refs = path.join(agentsSdk, "references")
        expect(yield* fsys.existsSafe(path.join(agentsSdk, "SKILL.md"))).toBe(true)
        // agents-sdk has reference files per the index
        const refDir = yield* Effect.promise(() =>
          Array.fromAsync(new Bun.Glob("**/*.md").scan({ cwd: refs, onlyFiles: true })),
        )
        expect(refDir.length).toBeGreaterThan(0)
      }
    }),
  )

  it.live("caches downloaded files on second pull", () =>
    Effect.gen(function* () {
      // clear dir and downloadCount
      yield* Effect.promise(() => rm(cacheDir, { recursive: true, force: true }))
      downloadCount = 0
      const discovery = yield* Discovery.Service

      // first pull to populate cache
      const first = yield* discovery.pull(CLOUDFLARE_SKILLS_URL)
      expect(first.length).toBeGreaterThan(0)
      const firstCount = downloadCount
      expect(firstCount).toBeGreaterThan(0)

      // second pull should return same results from cache
      const second = yield* discovery.pull(CLOUDFLARE_SKILLS_URL)
      expect(second.length).toBe(first.length)
      expect(second.sort()).toEqual(first.sort())

      // second pull should NOT increment download count
      expect(downloadCount).toBe(firstCount)
    }),
  )

  it.live("refreshes a remote skill when its version changes", () =>
    Effect.gen(function* () {
      yield* Effect.promise(() => rm(cacheDir, { recursive: true, force: true }))
      mutableVersion = "1"
      mutableContent = "# Old"
      mutableDownloadCount = 0
      mutableFiles = ["SKILL.md", "old.md"]
      const discovery = yield* Discovery.Service
      const url = `http://localhost:${server.port}/mutable/`

      const first = yield* discovery.pull(url)
      expect(yield* Effect.promise(() => Bun.file(path.join(first[0], "SKILL.md")).text())).toBe("# Old")

      mutableVersion = "2"
      mutableContent = "# Partial"
      mutableFiles = ["SKILL.md", "missing.md"]
      const second = yield* discovery.pull(url)
      expect(yield* Effect.promise(() => Bun.file(path.join(second[0], "SKILL.md")).text())).toBe("# Old")
      expect(yield* Effect.promise(() => Bun.file(path.join(second[0], "old.md")).text())).toBe("old reference")

      mutableVersion = "3"
      mutableContent = "# New"
      mutableFiles = ["SKILL.md"]
      yield* discovery.pull(url)
      expect(yield* Effect.promise(() => Bun.file(path.join(second[0], "SKILL.md")).text())).toBe("# New")
      expect(yield* Effect.promise(() => Bun.file(path.join(second[0], "old.md")).exists())).toBe(false)
      expect(mutableDownloadCount).toBe(3)

      yield* discovery.pull(url)
      expect(mutableDownloadCount).toBe(3)
    }),
  )

  it.live("keeps same-named skills isolated by catalog", () =>
    Effect.gen(function* () {
      catalogAVersion = "1"
      catalogAContent = "# A"
      catalogBContent = "# B"
      const discovery = yield* Discovery.Service
      const catalogA = `http://localhost:${server.port}/catalog-a/`
      const catalogB = `http://localhost:${server.port}/catalog-b/`

      const [aV1] = yield* discovery.pull(catalogA)
      const [bV1] = yield* discovery.pull(catalogB)
      catalogAVersion = "2"
      catalogAContent = "# New"
      const [aV2] = yield* discovery.pull(catalogA)

      expect(aV2).toBe(aV1)
      expect(aV2).not.toBe(bV1)
      expect(yield* Effect.promise(() => Bun.file(path.join(aV2, "SKILL.md")).text())).toBe("# New")
      expect(yield* Effect.promise(() => Bun.file(path.join(bV1, "SKILL.md")).text())).toBe("# B")
    }),
  )
})
