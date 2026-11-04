import fs from "fs/promises"
import path from "path"
import { describe, expect, test } from "bun:test"
import { Effect, Layer } from "effect"
import { HttpClient, HttpClientResponse } from "effect/unstable/http"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNodePlatform } from "@orchestra/core/effect/app-node-platform"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { Global } from "@orchestra/core/global"
import { SkillDiscovery } from "@orchestra/core/skill/discovery"
import { tmpdir } from "./fixture/tmpdir"

const base = "https://skills.example.test/catalog/"

async function pull(
  skills: unknown[],
  files: Record<string, string> = {},
  cache?: Awaited<ReturnType<typeof tmpdir>>,
  redirects: Record<string, string> = {},
) {
  const tmp = cache ?? (await tmpdir())
  const requests: string[] = []
  const http = Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make((request) =>
      Effect.sync(() => requests.push(request.url)).pipe(
        Effect.map(() => {
          const location = redirects[request.url]
          if (location) return HttpClientResponse.fromWeb(request, new Response("", { status: 302, headers: { location } }))
          const body = request.url === `${base}index.json` ? JSON.stringify({ skills }) : files[request.url]
          return HttpClientResponse.fromWeb(
            request,
            new Response(body ?? "Not Found", { status: body === undefined ? 404 : 200 }),
          )
        }),
      ),
    ),
  )
  const skillDiscoveryLayer = AppNodeBuilder.build(SkillDiscovery.node, [
    [LayerNodePlatform.httpClient, http],
    [Global.node, Global.layerWith({ cache: tmp.path })],
  ])
  const directories = await Effect.runPromise(
    Effect.gen(function* () {
      return yield* (yield* SkillDiscovery.Service).pull(base)
    }).pipe(Effect.provide(skillDiscoveryLayer)),
  )
  return { tmp, requests, directories }
}

describe("SkillDiscovery.pull", () => {
  test("rejects skill name traversal without fetching files", async () => {
    const result = await pull([{ name: "../outside", files: ["SKILL.md"] }])
    try {
      expect(result.directories).toEqual([])
      expect(result.requests).toEqual([`${base}index.json`])
      expect(await fs.readdir(result.tmp.path)).toEqual([])
    } finally {
      await result.tmp[Symbol.asyncDispose]()
    }
  })

  test("rejects file traversal without fetching files", async () => {
    const result = await pull([{ name: "deploy", files: ["SKILL.md", "../outside.md"] }])
    try {
      expect(result.directories).toEqual([])
      expect(result.requests).toEqual([`${base}index.json`])
      expect(await fs.readdir(result.tmp.path)).toEqual([])
    } finally {
      await result.tmp[Symbol.asyncDispose]()
    }
  })

  test("rejects absolute file paths without fetching files", async () => {
    const result = await pull([{ name: "deploy", files: ["SKILL.md", "/tmp/outside.md"] }])
    try {
      expect(result.directories).toEqual([])
      expect(result.requests).toEqual([`${base}index.json`])
      expect(await fs.readdir(result.tmp.path)).toEqual([])
    } finally {
      await result.tmp[Symbol.asyncDispose]()
    }
  })

  test("rejects cross-origin file URLs without fetching files", async () => {
    const result = await pull([{ name: "deploy", files: ["SKILL.md", "https://evil.example.test/outside.md"] }])
    try {
      expect(result.directories).toEqual([])
      expect(result.requests).toEqual([`${base}index.json`])
      expect(await fs.readdir(result.tmp.path)).toEqual([])
    } finally {
      await result.tmp[Symbol.asyncDispose]()
    }
  })

  test("downloads safe nested files under the skill root", async () => {
    const result = await pull([{ name: "deploy", files: ["SKILL.md", "references/guide.md"] }], {
      [`${base}deploy/SKILL.md`]: "# Deploy",
      [`${base}deploy/references/guide.md`]: "# Guide",
    })
    try {
      expect(result.directories).toHaveLength(1)
      expect(result.requests.toSorted()).toEqual(
        [`${base}index.json`, `${base}deploy/SKILL.md`, `${base}deploy/references/guide.md`].toSorted(),
      )
      expect(await fs.readFile(path.join(result.directories[0], "SKILL.md"), "utf8")).toBe("# Deploy")
      expect(await fs.readFile(path.join(result.directories[0], "references", "guide.md"), "utf8")).toBe("# Guide")
    } finally {
      await result.tmp[Symbol.asyncDispose]()
    }
  })

  test("refreshes cached files when the version changes", async () => {
    const tmp = await tmpdir()
    try {
      const first = await pull(
        [{ name: "deploy", version: "1", files: ["SKILL.md"] }],
        {
          [`${base}deploy/SKILL.md`]: "# Old",
        },
        tmp,
      )
      const second = await pull(
        [{ name: "deploy", version: "2", files: ["SKILL.md"] }],
        {
          [`${base}deploy/SKILL.md`]: "# New",
        },
        tmp,
      )

      expect(await fs.readFile(path.join(first.directories[0], "SKILL.md"), "utf8")).toBe("# New")
      expect(second.requests).toContain(`${base}deploy/SKILL.md`)
      const third = await pull(
        [{ name: "deploy", version: "2", files: ["SKILL.md"] }],
        { [`${base}deploy/SKILL.md`]: "# Ignored" },
        tmp,
      )
      expect(third.requests).toEqual([`${base}index.json`])
    } finally {
      await tmp[Symbol.asyncDispose]()
    }
  })

  test("publishes complete updates and removes stale files", async () => {
    const tmp = await tmpdir()
    try {
      const first = await pull(
        [{ name: "deploy", version: "1", files: ["SKILL.md", "old.md"] }],
        {
          [`${base}deploy/SKILL.md`]: "# Old",
          [`${base}deploy/old.md`]: "old reference",
        },
        tmp,
      )
      const root = first.directories[0]

      await pull(
        [{ name: "deploy", version: "2", files: ["SKILL.md", "missing.md"] }],
        { [`${base}deploy/SKILL.md`]: "# Partial" },
        tmp,
      )
      expect(await fs.readFile(path.join(root, "SKILL.md"), "utf8")).toBe("# Old")
      expect(await fs.readFile(path.join(root, "old.md"), "utf8")).toBe("old reference")

      await pull([{ name: "deploy", version: "3", files: ["SKILL.md"] }], { [`${base}deploy/SKILL.md`]: "# New" }, tmp)
      expect(await fs.readFile(path.join(root, "SKILL.md"), "utf8")).toBe("# New")
      expect(await Bun.file(path.join(root, "old.md")).exists()).toBe(false)
    } finally {
      await tmp[Symbol.asyncDispose]()
    }
  })

  test("refuses a file larger than the per-file limit", async () => {
    const result = await pull([{ name: "deploy", files: ["SKILL.md", "big.md"] }], {
      [`${base}deploy/SKILL.md`]: "# Deploy",
      [`${base}deploy/big.md`]: "a".repeat(SkillDiscovery.MAX_FILE_BYTES + 1),
    })
    try {
      const root = path.join(result.tmp.path, "skills", (await fs.readdir(path.join(result.tmp.path, "skills")))[0], "deploy")
      expect(await Bun.file(path.join(root, "big.md")).exists()).toBe(false)
      expect(await fs.readFile(path.join(root, "SKILL.md"), "utf8")).toBe("# Deploy")
    } finally {
      await result.tmp[Symbol.asyncDispose]()
    }
  })

  test("refuses an oversized index", async () => {
    const result = await pull([{ name: "deploy", files: ["SKILL.md"], padding: "x".repeat(SkillDiscovery.MAX_INDEX_BYTES) }])
    try {
      expect(result.directories).toEqual([])
      expect(result.requests).toEqual([`${base}index.json`])
    } finally {
      await result.tmp[Symbol.asyncDispose]()
    }
  })

  test("stops downloading once a pull passes the total limit", async () => {
    const names = Array.from({ length: 24 }, (_, index) => `part-${index}.md`)
    const body = "a".repeat(SkillDiscovery.MAX_FILE_BYTES)
    const result = await pull(
      [{ name: "deploy", files: ["SKILL.md", ...names] }],
      Object.fromEntries([[`${base}deploy/SKILL.md`, "# Deploy"], ...names.map((name) => [`${base}deploy/${name}`, body])]),
    )
    try {
      const root = path.join(result.tmp.path, "skills", (await fs.readdir(path.join(result.tmp.path, "skills")))[0], "deploy")
      const written = (await fs.readdir(root)).length
      expect(written).toBeLessThan(names.length)
      // Files read at the same time were each admitted before the total was known.
      expect(written).toBeGreaterThanOrEqual(SkillDiscovery.MAX_PULL_BYTES / SkillDiscovery.MAX_FILE_BYTES - 1)
    } finally {
      await result.tmp[Symbol.asyncDispose]()
    }
  })

  test("refuses a file redirected to a link-local address", async () => {
    const target = "http://169.254.169.254/latest/meta-data/"
    const result = await pull(
      [{ name: "deploy", files: ["SKILL.md"] }],
      {},
      undefined,
      { [`${base}deploy/SKILL.md`]: target },
    )
    try {
      expect(result.directories).toEqual([])
      expect(result.requests).not.toContain(target)
    } finally {
      await result.tmp[Symbol.asyncDispose]()
    }
  })

  test("refuses an index redirected to loopback", async () => {
    const target = "http://127.0.0.1:9/index.json"
    const result = await pull([{ name: "deploy", files: ["SKILL.md"] }], {}, undefined, {
      [`${base}index.json`]: target,
    })
    try {
      expect(result.directories).toEqual([])
      expect(result.requests).toEqual([`${base}index.json`])
    } finally {
      await result.tmp[Symbol.asyncDispose]()
    }
  })

  test("follows a redirect to another public host", async () => {
    const moved = `${base}deploy/moved.md`
    const result = await pull(
      [{ name: "deploy", files: ["SKILL.md"] }],
      { [moved]: "# Deploy" },
      undefined,
      { [`${base}deploy/SKILL.md`]: moved },
    )
    try {
      expect(result.directories).toHaveLength(1)
      expect(await fs.readFile(path.join(result.directories[0], "SKILL.md"), "utf8")).toBe("# Deploy")
    } finally {
      await result.tmp[Symbol.asyncDispose]()
    }
  })
})
