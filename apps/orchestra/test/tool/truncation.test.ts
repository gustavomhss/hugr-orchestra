import { describe, test, expect } from "bun:test"
import { ConfigV1 } from "@orchestra/core/v1/config/config"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { filesystem } from "@orchestra/core/effect/app-node-platform"
import { FSUtil } from "@orchestra/core/fs-util"
import { Effect, FileSystem } from "effect"
import { Truncate } from "@/tool/truncate"
import { Config } from "@/config/config"
import { Identifier } from "../../src/id/id"
import { Process } from "@/util/process"
import path from "path"
import { testEffect } from "../lib/effect"
import { writeFileStringScoped } from "../lib/filesystem"
import { TestConfig } from "../fixture/config"

const FIXTURES_DIR = path.join(import.meta.dir, "fixtures")
const ROOT = path.resolve(import.meta.dir, "..", "..")

const it = testEffect(LayerNode.compile(LayerNode.group([Truncate.node, FSUtil.node, filesystem])))

const configuredLayer = (cfg: ConfigV1.Info) =>
  LayerNode.compile(LayerNode.group([Truncate.node, FSUtil.node, filesystem, Config.node]), [
    [Config.node, TestConfig.layer({ get: () => Effect.succeed(cfg) })],
  ])
const configuredIt = (cfg: ConfigV1.Info) => testEffect(configuredLayer(cfg))

describe("Truncate", () => {
  describe("output", () => {
    it.live("truncates large json file by bytes", () =>
      Effect.gen(function* () {
        const svc = yield* Truncate.Service
        const fsys = yield* FSUtil.Service
        const content = yield* fsys.readFileString(path.join(FIXTURES_DIR, "models-api.json"))
        const result = yield* svc.output(content)

        expect(result.truncated).toBe(true)
        expect(result.content).toContain("truncated...")
        if (result.truncated) expect(result.outputPath).toBeDefined()
      }),
    )

    it.live("returns content unchanged when under limits", () =>
      Effect.gen(function* () {
        const svc = yield* Truncate.Service
        const content = "line1\nline2\nline3"
        const result = yield* svc.output(content)

        expect(result.truncated).toBe(false)
        expect(result.content).toBe(content)
      }),
    )

    it.live("truncates by line count", () =>
      Effect.gen(function* () {
        const svc = yield* Truncate.Service
        const lines = Array.from({ length: 100 }, (_, i) => `line${i}`).join("\n")
        const result = yield* svc.output(lines, { maxLines: 10 })

        expect(result.truncated).toBe(true)
        expect(result.content).toContain("...90 lines truncated...")
      }),
    )

    it.live("truncates by byte count", () =>
      Effect.gen(function* () {
        const svc = yield* Truncate.Service
        const content = "a".repeat(1000)
        const result = yield* svc.output(content, { maxBytes: 100 })

        expect(result.truncated).toBe(true)
        expect(result.content).toContain("truncated...")
      }),
    )

    it.live("truncates from head by default", () =>
      Effect.gen(function* () {
        const svc = yield* Truncate.Service
        const lines = Array.from({ length: 10 }, (_, i) => `line${i}`).join("\n")
        const result = yield* svc.output(lines, { maxLines: 3 })

        expect(result.truncated).toBe(true)
        expect(result.content).toContain("line0")
        expect(result.content).toContain("line1")
        expect(result.content).toContain("line2")
        expect(result.content).not.toContain("line9")
      }),
    )

    it.live("truncates from tail when direction is tail", () =>
      Effect.gen(function* () {
        const svc = yield* Truncate.Service
        const lines = Array.from({ length: 10 }, (_, i) => `line${i}`).join("\n")
        const result = yield* svc.output(lines, { maxLines: 3, direction: "tail" })

        expect(result.truncated).toBe(true)
        expect(result.content).toContain("line7")
        expect(result.content).toContain("line8")
        expect(result.content).toContain("line9")
        expect(result.content).not.toContain("line0")
      }),
    )

    test("uses default MAX_LINES and MAX_BYTES", () => {
      expect(Truncate.MAX_LINES).toBe(2000)
      expect(Truncate.MAX_BYTES).toBe(50 * 1024)
    })

    it.live("limits() falls back to MAX_LINES/MAX_BYTES when Config is not provided", () =>
      Effect.gen(function* () {
        const svc = yield* Truncate.Service
        const resolved = yield* svc.limits()
        expect(resolved.maxLines).toBe(Truncate.MAX_LINES)
        expect(resolved.maxBytes).toBe(Truncate.MAX_BYTES)
      }),
    )

    describe("with tool_output config", () => {
      const limitsIt = configuredIt({ tool_output: { max_lines: 123, max_bytes: 456 } })
      limitsIt.live("limits() reflects config overrides", () =>
        Effect.gen(function* () {
          const resolved = yield* (yield* Truncate.Service).limits()
          expect(resolved.maxLines).toBe(123)
          expect(resolved.maxBytes).toBe(456)
        }),
      )

      // Huge byte budget isolates line truncation. 100 lines against max_lines: 10
      // proves the configured line limit is what `output()` enforces.
      const lineIt = configuredIt({ tool_output: { max_lines: 10, max_bytes: 1024 * 1024 } })
      lineIt.live("output() truncates to configured max_lines", () =>
        Effect.gen(function* () {
          const content = Array.from({ length: 100 }, (_, i) => `line${i}`).join("\n")
          const result = yield* (yield* Truncate.Service).output(content)
          expect(result.truncated).toBe(true)
          expect(result.content).toContain("...90 lines truncated...")
        }),
      )

      // Huge line budget isolates byte truncation.
      const byteIt = configuredIt({ tool_output: { max_lines: 1_000_000, max_bytes: 100 } })
      byteIt.live("output() truncates to configured max_bytes", () =>
        Effect.gen(function* () {
          const content = "a".repeat(1000)
          const result = yield* (yield* Truncate.Service).output(content)
          expect(result.truncated).toBe(true)
          expect(result.content).toContain("bytes truncated...")
        }),
      )

      const overrideIt = configuredIt({ tool_output: { max_lines: 10, max_bytes: 100 } })
      overrideIt.live("per-call options still override config", () =>
        Effect.gen(function* () {
          const content = Array.from({ length: 50 }, (_, i) => `line${i}`).join("\n")
          const result = yield* (yield* Truncate.Service).output(content, {
            maxLines: 1000,
            maxBytes: 1024 * 1024,
          })
          expect(result.truncated).toBe(false)
        }),
      )
    })

    it.live("large single-line file truncates with byte message", () =>
      Effect.gen(function* () {
        const svc = yield* Truncate.Service
        const fsys = yield* FSUtil.Service
        const content = yield* fsys.readFileString(path.join(FIXTURES_DIR, "models-api.json"))
        const result = yield* svc.output(content)

        expect(result.truncated).toBe(true)
        expect(result.content).toContain("bytes truncated...")
        expect(Buffer.byteLength(content, "utf-8")).toBeGreaterThan(Truncate.MAX_BYTES)
      }),
    )

    it.live("writes full output to file when truncated", () =>
      Effect.gen(function* () {
        const svc = yield* Truncate.Service
        const lines = Array.from({ length: 100 }, (_, i) => `line${i}`).join("\n")
        const result = yield* svc.output(lines, { maxLines: 10 })

        expect(result.truncated).toBe(true)
        expect(result.content).toContain("The tool call succeeded but the output was truncated")
        expect(result.content).toContain("Use `grep` to search the full content")
        if (!result.truncated) throw new Error("expected truncated")
        expect(result.outputPath).toBeDefined()
        expect(result.outputPath).toContain("tool_")

        const fsys = yield* FSUtil.Service
        const written = yield* fsys.readFileString(result.outputPath!)
        expect(written).toBe(lines)
      }),
    )

    it.live("suggests an explore teammate when agent has task permission", () =>
      Effect.gen(function* () {
        const svc = yield* Truncate.Service
        const lines = Array.from({ length: 100 }, (_, i) => `line${i}`).join("\n")
        const agent = { permission: [{ permission: "task", pattern: "*", action: "allow" as const }] }
        const result = yield* svc.output(lines, { maxLines: 10 }, agent as any)

        expect(result.truncated).toBe(true)
        expect(result.content).toContain("Use `grep` to search the full content or `read` with offset/limit")
        expect(result.content).toContain("hand it to an `explore` teammate with `task`.")
      }),
    )

    it.live("omits the teammate hint when agent lacks task permission", () =>
      Effect.gen(function* () {
        const svc = yield* Truncate.Service
        const lines = Array.from({ length: 100 }, (_, i) => `line${i}`).join("\n")
        const agent = { permission: [{ permission: "task", pattern: "*", action: "deny" as const }] }
        const result = yield* svc.output(lines, { maxLines: 10 }, agent as any)

        expect(result.truncated).toBe(true)
        expect(result.content).toContain("Use `grep` to search the full content or `read` with offset/limit")
        expect(result.content).not.toContain("hand it to an `explore` teammate with `task`.")
      }),
    )

    // Run 16: the Linux workspace agent was told the full output sat at a host path and grepped it inside the workspace.
    it.live("a scoped agent without file tools gets no saved-file path, only how to ask its tools for less", () =>
      Effect.gen(function* () {
        const svc = yield* Truncate.Service
        const lines = Array.from({ length: 100 }, (_, i) => `line${i}`).join("\n")
        const linux = { permission: [{ permission: "*", pattern: "*", action: "deny" as const },
          { permission: "ui_*", pattern: "*", action: "allow" as const }] }
        const result = yield* svc.output(lines, { maxLines: 10 }, linux as any)

        if (!result.truncated) throw new Error("expected truncated")
        expect(result.content).toStartWith("line0\n")
        expect(result.content).toContain("...90 lines truncated...")
        expect(result.content).toContain("do not look for a file")
        expect(result.content).toContain("its paging arguments (cursor, offset)")
        expect(result.content).not.toContain(result.outputPath)
        expect(result.content).not.toContain("Grep")
        // A file tool reaches the saved output only with external access to its directory.
        const reader = { permission: [...linux.permission, { permission: "read", pattern: "*", action: "allow" as const }] }
        const outside = (yield* svc.output(lines, { maxLines: 10 }, reader as any)).content
        expect(outside).toContain("do not look for a file")
        expect(outside).not.toContain("Full output saved to:")
        const granted = {
          permission: [...reader.permission, { permission: "external_directory", pattern: Truncate.GLOB, action: "allow" as const }],
        }
        expect((yield* svc.output(lines, { maxLines: 10 }, granted as any)).content).toContain("Full output saved to:")
      }),
    )

    it.live("does not write file when not truncated", () =>
      Effect.gen(function* () {
        const svc = yield* Truncate.Service
        const content = "short content"
        const result = yield* svc.output(content)

        expect(result.truncated).toBe(false)
        if (result.truncated) throw new Error("expected not truncated")
        expect("outputPath" in result).toBe(false)
      }),
    )

    test("loads truncate effect in a fresh process", async () => {
      const out = await Process.run([process.execPath, "run", path.join(ROOT, "src", "tool", "truncate.ts")], {
        cwd: ROOT,
      })

      expect(out.code).toBe(0)
    }, 20000)
  })

  describe("cleanup", () => {
    const DAY_MS = 24 * 60 * 60 * 1000

    it.live("uses file mtime when IDs wrap", () =>
      Effect.gen(function* () {
        const svc = yield* Truncate.Service
        const fs = yield* FileSystem.FileSystem

        yield* fs.makeDirectory(Truncate.DIR, { recursive: true })

        const old = path.join(Truncate.DIR, Identifier.create("tool", "ascending", 2 ** 36 - 1))
        const recent = path.join(Truncate.DIR, Identifier.create("tool", "ascending", 2 ** 36 + 1))

        yield* writeFileStringScoped(old, "old content")
        yield* writeFileStringScoped(recent, "recent content")
        yield* fs.utimes(old, new Date(), new Date(Date.now() - 10 * DAY_MS))
        yield* fs.utimes(recent, new Date(), new Date(Date.now() - 3 * DAY_MS))
        yield* svc.cleanup()

        expect(yield* fs.exists(old)).toBe(false)
        expect(yield* fs.exists(recent)).toBe(true)
      }),
    )
  })
})
