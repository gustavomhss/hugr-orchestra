import { describe, expect, test } from "bun:test"
import fs from "fs/promises"
import path from "path"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { FSUtil } from "@orchestra/core/fs-util"
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
  it.live("creates the profile orchestra.json when no project config exists", () =>
    Effect.gen(function* () {
      const dir = yield* scratch
      const file = yield* McpProjectConfig.write(dir.path, "docs", { type: "remote", url: "https://mcp.example.test" })
      expect(file).toBe(path.join(dir.path, "orchestra.json"))
      expect(JSON.parse(yield* text(file))).toEqual({
        mcp: { docs: { type: "remote", url: "https://mcp.example.test" } },
      })
    }),
  )

  it.live("edits only the sent fields and keeps comments and env references", () =>
    Effect.gen(function* () {
      const dir = yield* scratch
      const file = path.join(dir.path, "orchestra.jsonc")
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
      const file = path.join(dir.path, "orchestra.json")
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
      const root = path.join(dir.path, "orchestra.json")
      const nested = path.join(dir.path, ".orchestra", "orchestra.json")
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
      const root = path.join(dir.path, "orchestra.json")
      const nested = path.join(dir.path, ".orchestra", "orchestra.jsonc")
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

  it.live("lists raw entries from the winning file and skips files it cannot parse", () =>
    Effect.gen(function* () {
      const dir = yield* scratch
      yield* Effect.promise(() =>
        Bun.write(
          path.join(dir.path, "orchestra.json"),
          JSON.stringify({
            mcp: {
              cli: { type: "local", command: ["run", "--token", "{env:TOKEN}"], environment: { A: "b" } },
              both: { type: "local", command: ["old"] },
              flag: { enabled: false },
            },
          }),
        ),
      )
      yield* Effect.promise(() =>
        Bun.write(
          path.join(dir.path, ".orchestra", "orchestra.jsonc"),
          `{ "mcp": { "both": { "type": "remote", "url": "https://x.test/?k={env:K}", "headers": { "A": "b" } } } }`,
        ),
      )
      yield* Effect.promise(() => Bun.write(path.join(dir.path, "orchestra.jsonc"), `{ "mcp": { "lost": `))
      expect(yield* McpProjectConfig.entries(dir.path)).toEqual({
        cli: { type: "local", command: ["run", "--token", "{env:TOKEN}"] },
        both: { type: "remote", url: "https://x.test/?k={env:K}" },
        flag: {},
      })
    }),
  )

  it.live("refuses files it cannot edit and leaves them untouched", () =>
    Effect.gen(function* () {
      const dir = yield* scratch
      const file = path.join(dir.path, "orchestra.json")
      const local = { type: "local" as const, command: ["x"] }
      for (const [content, message] of [
        [`{ "mcp": { "a": `, "is not valid JSONC"],
        [`[]`, "must contain a JSON object"],
        [`{ "mcp": [] }`, `"mcp" in ${file} must be an object`],
        [`{ "mcp": "nope" }`, `"mcp" in ${file} must be an object`],
        [`{ "mcp": { "a": true } }`, `"mcp.a" in ${file} must be an object`],
      ]) {
        yield* Effect.promise(() => Bun.write(file, content))
        const error = yield* Effect.flip(McpProjectConfig.write(dir.path, "a", local))
        expect(error).toBeInstanceOf(McpProjectConfig.FileError)
        expect(error.message).toContain(message)
        expect(yield* text(file)).toBe(content)
      }
    }),
  )

  it.live("serializes concurrent writes to one profile so none is lost", () =>
    Effect.gen(function* () {
      const dir = yield* scratch
      const names = Array.from({ length: 8 }, (_, index) => `server-${index}`)
      yield* Effect.forEach(
        names,
        (name) => McpProjectConfig.write(dir.path, name, { type: "local", command: [name] }),
        {
          concurrency: "unbounded",
        },
      )
      expect(Object.keys(JSON.parse(yield* text(path.join(dir.path, "orchestra.json"))).mcp).sort()).toEqual(names)
    }),
  )

  it.live("writes through a symlinked config without replacing the link", () =>
    Effect.gen(function* () {
      const dir = yield* scratch
      const real = path.join(dir.path, "real.json")
      const link = path.join(dir.path, "orchestra.json")
      yield* Effect.promise(() => Bun.write(real, "{}"))
      yield* Effect.promise(() => fs.symlink(real, link))
      yield* McpProjectConfig.write(dir.path, "a", { type: "local", command: ["x"] })
      expect((yield* Effect.promise(() => fs.lstat(link))).isSymbolicLink()).toBe(true)
      expect(JSON.parse(yield* text(real))).toEqual({ mcp: { a: { type: "local", command: ["x"] } } })
    }),
  )

  test.each([
    ["docs", true],
    ["Docs Server", true],
    ["toString", true],
    ["", false],
    ["   ", false],
    [".", false],
    ["..", false],
    ["__proto__", false],
    ["a/b", false],
    ["a\\b", false],
    ["line\nbreak", false],
  ])("validName(%j) is %s", (name, valid) => {
    expect(McpProjectConfig.validName(name)).toBe(valid)
  })
})
