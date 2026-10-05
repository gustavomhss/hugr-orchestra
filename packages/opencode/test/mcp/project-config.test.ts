import { describe, expect } from "bun:test"
import path from "path"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { Effect } from "effect"
import { McpProjectConfig } from "../../src/mcp/project-config"
import { tmpdir } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(LayerNode.compile(LayerNode.group([FSUtil.node])))

const scratch = Effect.acquireRelease(
  Effect.promise(() => tmpdir()),
  (dir) => Effect.promise(() => dir[Symbol.asyncDispose]()),
)
const text = (file: string) => Effect.promise(() => Bun.file(file).text())

describe("McpProjectConfig", () => {
  it.live("creates the profile opencode.json when no project config exists", () =>
    Effect.gen(function* () {
      const dir = yield* scratch
      const file = yield* McpProjectConfig.write(dir.path, "docs", { type: "remote", url: "https://mcp.example.test" })
      expect(file).toBe(path.join(dir.path, "opencode.json"))
      expect(JSON.parse(yield* text(file))).toEqual({
        mcp: { docs: { type: "remote", url: "https://mcp.example.test" } },
      })
    }),
  )

  it.live("edits only the sent fields and keeps comments and env references", () =>
    Effect.gen(function* () {
      const dir = yield* scratch
      const file = path.join(dir.path, "opencode.jsonc")
      yield* Effect.promise(() =>
        Bun.write(
          file,
          `{
  // owner note
  "mcp": {
    "fs": { "type": "local", "command": ["old"], "environment": { "TOKEN": "{env:TOKEN}" }, "enabled": false }
  }
}`,
        ),
      )
      expect(yield* McpProjectConfig.write(dir.path, "fs", { type: "local", command: ["bunx", "server", "."] })).toBe(
        file,
      )
      const written = yield* text(file)
      expect(written).toContain("// owner note")
      expect(written).toContain('"TOKEN": "{env:TOKEN}"')
      expect(written).toContain('"enabled": false')
      expect(written).toContain('"bunx"')
      expect(written).not.toContain('"old"')
    }),
  )

  it.live("switching transport drops the other transport's keys", () =>
    Effect.gen(function* () {
      const dir = yield* scratch
      const file = path.join(dir.path, "opencode.json")
      yield* Effect.promise(() =>
        Bun.write(
          file,
          JSON.stringify({ mcp: { svc: { type: "local", command: ["a"], cwd: "x", environment: {}, enabled: true } } }),
        ),
      )
      yield* McpProjectConfig.write(dir.path, "svc", { type: "remote", url: "http://127.0.0.1:9000/mcp" })
      expect(JSON.parse(yield* text(file)).mcp.svc).toEqual({
        type: "remote",
        enabled: true,
        url: "http://127.0.0.1:9000/mcp",
      })
    }),
  )

  it.live("writes where the server is already defined, otherwise the first existing file", () =>
    Effect.gen(function* () {
      const dir = yield* scratch
      const root = path.join(dir.path, "opencode.json")
      const nested = path.join(dir.path, ".opencode", "opencode.json")
      yield* Effect.promise(() => Bun.write(root, JSON.stringify({ username: "owner" })))
      yield* Effect.promise(() =>
        Bun.write(nested, JSON.stringify({ mcp: { kept: { type: "local", command: ["k"] } } })),
      )
      expect(yield* McpProjectConfig.write(dir.path, "kept", { type: "local", command: ["k2"] })).toBe(nested)
      expect(yield* McpProjectConfig.write(dir.path, "fresh", { type: "local", command: ["f"] })).toBe(root)
      expect(JSON.parse(yield* text(root))).toEqual({
        username: "owner",
        mcp: { fresh: { type: "local", command: ["f"] } },
      })
    }),
  )

  it.live("removes the server from every profile file that defines it", () =>
    Effect.gen(function* () {
      const dir = yield* scratch
      const root = path.join(dir.path, "opencode.json")
      const nested = path.join(dir.path, ".opencode", "opencode.jsonc")
      yield* Effect.promise(() =>
        Bun.write(root, JSON.stringify({ mcp: { gone: { enabled: false }, stay: { enabled: true } } })),
      )
      yield* Effect.promise(() =>
        Bun.write(nested, JSON.stringify({ mcp: { gone: { type: "local", command: ["g"] } } })),
      )
      expect(yield* McpProjectConfig.remove(dir.path, "gone")).toEqual([root, nested])
      expect(JSON.parse(yield* text(root))).toEqual({ mcp: { stay: { enabled: true } } })
      expect(JSON.parse(yield* text(nested))).toEqual({ mcp: {} })
      expect(yield* McpProjectConfig.remove(dir.path, "gone")).toEqual([])
      expect(yield* McpProjectConfig.remove(dir.path, "toString")).toEqual([])
    }),
  )
})
