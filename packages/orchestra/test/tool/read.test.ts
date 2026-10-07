import { PermissionV1 } from "@orchestra/core/v1/permission"
import { afterEach, describe, expect, test } from "bun:test"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { Cause, Effect, Exit, FileSystem, Layer, Schema } from "effect"
import path from "path"
import { Agent } from "../../src/agent/agent"
import { CrossSpawnSpawner } from "@orchestra/core/cross-spawn-spawner"
import { FSUtil } from "@orchestra/core/fs-util"
import { Global } from "@orchestra/core/global"
import { Config } from "@/config/config"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { Ripgrep } from "@orchestra/core/ripgrep"
import { Permission } from "../../src/permission"
import { SessionID, MessageID } from "../../src/session/schema"
import { Instruction } from "../../src/session/instruction"
import { Parameters, ReadTool } from "../../src/tool/read"
import { Truncate } from "@/tool/truncate"
import { Tool } from "@/tool/tool"
import { Filesystem } from "@/util/filesystem"
import {
  disposeAllInstances,
  provideInstance,
  testInstanceStoreLayer,
  TestInstance,
  tmpdirScoped,
} from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const FIXTURES_DIR = path.join(import.meta.dir, "fixtures")
const MAX_MEDIA_BYTES = 20 * 1024 * 1024

afterEach(async () => {
  await disposeAllInstances()
})

const ctx = {
  sessionID: SessionID.make("ses_test"),
  messageID: MessageID.make("msg_test"),
  callID: "",
  agent: "maestro",
  abort: AbortSignal.any([]),
  messages: [],
  metadata: () => Effect.void,
  ask: () => Effect.void,
}

const readLayer = (flags: Partial<RuntimeFlags.Info> = {}) =>
  LayerNode.compile(
    LayerNode.group([Agent.node, FSUtil.node, CrossSpawnSpawner.node, Instruction.node, Ripgrep.node, Truncate.node]),
  )

const it = testEffect(Layer.mergeAll(readLayer(), testInstanceStoreLayer))

it.instance("raw reader blocks credential hidden after line crop and across 64 KiB chunks", () =>
  Effect.gen(function* () {
    const instance = yield* TestInstance
    const fs = yield* FSUtil.Service
    const file = path.join(instance.directory, "raw-secret.txt")
    yield* fs.writeFileString(file, "ordinary "+"x".repeat(70000)+"\n")
    expect((yield* run({ filePath: file, limit: 1 })).output).toContain("line truncated")
    const secret = "gh"+"p_"+"Q".repeat(40)
    for (const prefix of [1980, 65520]) {
      yield* fs.writeFileString(file, "x".repeat(prefix)+" "+secret+"\n")
      const exit = yield* Effect.exit(run({ filePath: file, limit: 1 }))
      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) {
        expect(Cause.pretty(exit.cause)).toContain("recognized-secret-output")
        expect(Cause.pretty(exit.cause)).not.toContain(secret)
      }
    }
  }),
)

const init = Effect.fn("ReadToolTest.init")(function* () {
  const info = yield* ReadTool
  return yield* info.init()
})

const run = Effect.fn("ReadToolTest.run")(function* (
  args: Tool.InferParameters<typeof ReadTool>,
  next: Tool.Context = ctx,
) {
  const tool = yield* init()
  return yield* tool.execute(args, next)
})

const exec = Effect.fn("ReadToolTest.exec")(function* (
  dir: string,
  args: Tool.InferParameters<typeof ReadTool>,
  next: Tool.Context = ctx,
) {
  return yield* provideInstance(dir)(run(args, next))
})

const fail = Effect.fn("ReadToolTest.fail")(function* (
  dir: string,
  args: Tool.InferParameters<typeof ReadTool>,
  next: Tool.Context = ctx,
) {
  const exit = yield* exec(dir, args, next).pipe(Effect.exit)
  if (Exit.isFailure(exit)) {
    const err = Cause.squash(exit.cause)
    return err instanceof Error ? err : new Error(String(err))
  }
  throw new Error("expected read to fail")
})

const full = (p: string) => (process.platform === "win32" ? Filesystem.normalizePath(p) : p)
const glob = (p: string) =>
  process.platform === "win32" ? Filesystem.normalizePathPattern(p) : p.replaceAll("\\", "/")
const githubBase = <A, E, R>(url: string, self: Effect.Effect<A, E, R>) =>
  Effect.acquireUseRelease(
    Effect.sync(() => {
      const previous = process.env.ORCHESTRA_REPO_CLONE_GITHUB_BASE_URL
      process.env.ORCHESTRA_REPO_CLONE_GITHUB_BASE_URL = url
      return previous
    }),
    () => self,
    (previous) =>
      Effect.sync(() => {
        if (previous) process.env.ORCHESTRA_REPO_CLONE_GITHUB_BASE_URL = previous
        else delete process.env.ORCHESTRA_REPO_CLONE_GITHUB_BASE_URL
      }),
  )
const git = Effect.fn("ReadToolTest.git")(function* (cwd: string, args: string[]) {
  return yield* Effect.promise(async () => {
    const proc = Bun.spawn(["git", ...args], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
    })
    const [stdout, stderr, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ])
    if (code !== 0) throw new Error(stderr.trim() || stdout.trim() || `git ${args.join(" ")} failed`)
    return stdout.trim()
  })
})
const put = Effect.fn("ReadToolTest.put")(function* (p: string, content: string | Buffer | Uint8Array) {
  const fs = yield* FSUtil.Service
  yield* fs.writeWithDirs(p, content)
})
const load = Effect.fn("ReadToolTest.load")(function* (p: string) {
  const fs = yield* FSUtil.Service
  return yield* fs.readFileString(p)
})
const asks = () => {
  const items: Array<Omit<PermissionV1.Request, "id" | "sessionID" | "tool">> = []
  return {
    items,
    next: {
      ...ctx,
      ask: (req: Omit<PermissionV1.Request, "id" | "sessionID" | "tool">) =>
        Effect.sync(() => {
          items.push(req)
        }),
    },
  }
}

describe("tool.read external_directory permission", () => {
  it.live("allows reading absolute path inside project directory", () =>
    Effect.gen(function* () {
      const dir = yield* tmpdirScoped()
      yield* put(path.join(dir, "test.txt"), "hello world")

      const result = yield* exec(dir, { filePath: path.join(dir, "test.txt") })
      expect(result.output).toContain("hello world")
    }),
  )

  it.live("allows reading file in subdirectory inside project directory", () =>
    Effect.gen(function* () {
      const dir = yield* tmpdirScoped()
      yield* put(path.join(dir, "subdir", "test.txt"), "nested content")

      const result = yield* exec(dir, { filePath: path.join(dir, "subdir", "test.txt") })
      expect(result.output).toContain("nested content")
    }),
  )

  it.live("asks for external_directory permission when reading absolute path outside project", () =>
    Effect.gen(function* () {
      const outer = yield* tmpdirScoped()
      const dir = yield* tmpdirScoped({ git: true })
      yield* put(path.join(outer, "secret.txt"), "secret data")

      const { items, next } = asks()

      yield* exec(dir, { filePath: path.join(outer, "secret.txt") }, next)
      const ext = items.find((item) => item.permission === "external_directory")
      expect(ext).toBeDefined()
      expect(ext!.patterns).toContain(glob(path.join(outer, "*")))
    }),
  )

  if (process.platform === "win32") {
    it.live("normalizes read permission paths on Windows", () =>
      Effect.gen(function* () {
        const dir = yield* tmpdirScoped({ git: true })
        yield* put(path.join(dir, "test.txt"), "hello world")

        const { items, next } = asks()
        const target = path.join(dir, "test.txt")
        const alt = target
          .replace(/^[A-Za-z]:/, "")
          .replaceAll("\\", "/")
          .toLowerCase()

        yield* exec(dir, { filePath: alt }, next)
        const read = items.find((item) => item.permission === "read")
        expect(read).toBeDefined()
        expect(read!.patterns).toEqual([path.relative(dir, full(target))])
      }),
    )
  }

  it.live("uses worktree-relative path for read permission so user rules match like edit/write", () =>
    Effect.gen(function* () {
      const dir = yield* tmpdirScoped({ git: true })
      yield* put(path.join(dir, "src", "secret.ts"), "shh")

      const { items, next } = asks()
      yield* exec(dir, { filePath: path.join(dir, "src", "secret.ts") }, next)
      const read = items.find((item) => item.permission === "read")
      expect(read).toBeDefined()
      expect(read!.patterns).toEqual([path.join("src", "secret.ts")])
    }),
  )

  it.live("asks for directory-scoped external_directory permission when reading external directory", () =>
    Effect.gen(function* () {
      const outer = yield* tmpdirScoped()
      const dir = yield* tmpdirScoped({ git: true })
      yield* put(path.join(outer, "external", "a.txt"), "a")

      const { items, next } = asks()

      yield* exec(dir, { filePath: path.join(outer, "external") }, next)
      const ext = items.find((item) => item.permission === "external_directory")
      expect(ext).toBeDefined()
      expect(ext!.patterns).toContain(glob(path.join(outer, "external", "*")))
    }),
  )

  it.live("asks for external_directory permission when reading relative path outside project", () =>
    Effect.gen(function* () {
      const dir = yield* tmpdirScoped({ git: true })

      const { items, next } = asks()

      yield* fail(dir, { filePath: "../outside.txt" }, next)
      const ext = items.find((item) => item.permission === "external_directory")
      expect(ext).toBeDefined()
    }),
  )

  it.live("does not ask for external_directory permission when reading inside project", () =>
    Effect.gen(function* () {
      const dir = yield* tmpdirScoped({ git: true })
      yield* put(path.join(dir, "internal.txt"), "internal content")

      const { items, next } = asks()

      yield* exec(dir, { filePath: path.join(dir, "internal.txt") }, next)
      const ext = items.find((item) => item.permission === "external_directory")
      expect(ext).toBeUndefined()
    }),
  )
})

describe("tool.read env file permissions", () => {
  const cases: [string, boolean][] = [
    [".env", true],
    [".env.local", true],
    [".env.production", true],
    [".env.development.local", true],
    [".env.example", false],
    [".envrc", false],
    ["environment.ts", false],
  ]

  for (const agentName of ["maestro", "general"] as const) {
    describe(`agent=${agentName}`, () => {
      for (const [filename, shouldAsk] of cases) {
        it.live(`${filename} asks=${shouldAsk}`, () =>
          Effect.gen(function* () {
            const dir = yield* tmpdirScoped()
            yield* put(path.join(dir, filename), "content")

            const asked = yield* provideInstance(dir)(
              Effect.gen(function* () {
                const agent = yield* Agent.Service
                const info = yield* agent.get(agentName)
                let asked = false
                const next = {
                  ...ctx,
                  ask: (req: Omit<PermissionV1.Request, "id" | "sessionID" | "tool">) =>
                    Effect.sync(() => {
                      for (const pattern of req.patterns) {
                        const rule = Permission.evaluate(req.permission, pattern, info.permission)
                        if (rule.action === "ask" && req.permission === "read") {
                          asked = true
                        }
                        if (rule.action === "deny") {
                          throw new PermissionV1.DeniedError({ ruleset: info.permission })
                        }
                      }
                    }),
                }

                yield* run({ filePath: path.join(dir, filename) }, next)
                return asked
              }),
            )

            expect(asked).toBe(shouldAsk)
          }),
        )
      }
    })
  }
})

describe("tool.read truncation", () => {
  test("rejects zero offset and limit in schema", () => {
    const decode = Schema.decodeUnknownResult(Parameters)
    expect(decode({ filePath: "/a", offset: 0 })._tag).toBe("Failure")
    expect(decode({ filePath: "/a", limit: 0 })._tag).toBe("Failure")
  })

  test("accepts numeric strings for offset and limit", () => {
    const decode = Schema.decodeUnknownSync(Parameters)
    expect(decode({ filePath: "/a", offset: "-20", limit: "10" })).toMatchObject({ offset: -20, limit: 10 })
    expect(() => decode({ filePath: "/a", offset: "0" })).toThrow()
    expect(() => decode({ filePath: "/a", limit: "1.5" })).toThrow()
  })

  it.instance("truncates large file by bytes and sets truncated metadata", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const base = yield* load(path.join(FIXTURES_DIR, "models-api.json"))
      const target = 60 * 1024
      const content = base.length >= target ? base : base.repeat(Math.ceil(target / base.length))
      yield* put(path.join(test.directory, "large.json"), content)

      const result = yield* run({ filePath: path.join(test.directory, "large.json") })
      expect(result.metadata.truncated).toBe(true)
      expect(result.output).toContain("PARTIAL view")
      expect(result.output).toContain("Use offset=")
      expect(Buffer.byteLength(result.output, "utf-8")).toBeLessThanOrEqual(50 * 1024)
    }),
  )

  it.instance("truncates by line count when limit is specified", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const lines = Array.from({ length: 100 }, (_, i) => `line${i}`).join("\n")
      yield* put(path.join(test.directory, "many-lines.txt"), lines)

      const result = yield* run({ filePath: path.join(test.directory, "many-lines.txt"), limit: 10 })
      expect(result.metadata.truncated).toBe(true)
      expect(result.output).toContain("PARTIAL view. Showing lines 1-10")
      expect(result.output).toContain("Use offset=11")
      expect(result.output).toContain("line0")
      expect(result.output).toContain("line9")
      expect(result.output).not.toContain("line10")
    }),
  )

  it.instance("does not truncate small file", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      yield* put(path.join(test.directory, "small.txt"), "hello world")

      const result = yield* run({ filePath: path.join(test.directory, "small.txt") })
      expect(result.metadata.truncated).toBe(false)
      expect(result.output).toContain("End of file")
      expect(result.metadata.display).toMatchObject({
        type: "file",
        path: path.join(test.directory, "small.txt"),
        text: "hello world",
        lineStart: 1,
        lineEnd: 1,
        truncated: false,
      })
    }),
  )

  it.live("respects offset parameter", () =>
    Effect.gen(function* () {
      const dir = yield* tmpdirScoped()
      const lines = Array.from({ length: 20 }, (_, i) => `line${i + 1}`).join("\n")
      yield* put(path.join(dir, "offset.txt"), lines)

      const result = yield* exec(dir, { filePath: path.join(dir, "offset.txt"), offset: 10, limit: 5 })
      expect(result.output).toContain("10: line10")
      expect(result.output).toContain("14: line14")
      expect(result.output).not.toContain("9: line10")
      expect(result.output).not.toContain("15: line15")
      expect(result.output).toContain("line10")
      expect(result.output).toContain("line14")
      expect(result.output).not.toContain("line0")
      expect(result.output).not.toContain("line15")
    }),
  )

  it.live("throws when offset is beyond end of file", () =>
    Effect.gen(function* () {
      const dir = yield* tmpdirScoped()
      const lines = Array.from({ length: 3 }, (_, i) => `line${i + 1}`).join("\n")
      yield* put(path.join(dir, "short.txt"), lines)

      const err = yield* fail(dir, { filePath: path.join(dir, "short.txt"), offset: 4, limit: 5 })
      expect(err.message).toContain("Offset 4 is out of range for this file (3 lines)")
    }),
  )

  it.live("allows reading empty file at default offset", () =>
    Effect.gen(function* () {
      const dir = yield* tmpdirScoped()
      yield* put(path.join(dir, "empty.txt"), "")

      const result = yield* exec(dir, { filePath: path.join(dir, "empty.txt") })
      expect(result.metadata.truncated).toBe(false)
      expect(result.output).toContain("End of file")
    }),
  )

  it.live("throws when offset > 1 for empty file", () =>
    Effect.gen(function* () {
      const dir = yield* tmpdirScoped()
      yield* put(path.join(dir, "empty.txt"), "")

      const err = yield* fail(dir, { filePath: path.join(dir, "empty.txt"), offset: 2 })
      expect(err.message).toContain("Offset 2 is out of range for this file (0 lines)")
    }),
  )

  it.live("does not mark final directory page as truncated", () =>
    Effect.gen(function* () {
      const dir = yield* tmpdirScoped()
      yield* Effect.forEach(
        Array.from({ length: 10 }, (_, i) => i),
        (i) => put(path.join(dir, "dir", `file-${i + 1}.txt`), `line${i}`),
        {
          concurrency: "unbounded",
        },
      )

      const result = yield* exec(dir, { filePath: path.join(dir, "dir"), offset: 6, limit: 5 })
      expect(result.metadata.truncated).toBe(false)
      expect(result.output).not.toContain("Showing 5 of 10 entries")
      expect(result.metadata.display).toMatchObject({
        type: "directory",
        path: path.join(dir, "dir"),
        entries: ["file-5.txt", "file-6.txt", "file-7.txt", "file-8.txt", "file-9.txt"],
        offset: 6,
        totalEntries: 10,
        truncated: false,
      })
    }),
  )

  it.live("rejects negative directory offsets", () =>
    Effect.gen(function* () {
      const dir = yield* tmpdirScoped()
      yield* put(path.join(dir, "dir", "file.txt"), "content")
      const err = yield* fail(dir, { filePath: path.join(dir, "dir"), offset: -1 })
      expect(err.message).toBe("Negative offset is only supported for files.")
    }),
  )

  it.live("truncates long lines", () =>
    Effect.gen(function* () {
      const dir = yield* tmpdirScoped()
      yield* put(path.join(dir, "long-line.txt"), "x".repeat(3000))

      const result = yield* exec(dir, { filePath: path.join(dir, "long-line.txt") })
      expect(result.output).toContain("(line truncated to 2000 chars)")
      expect(result.output.length).toBeLessThan(3000)
    }),
  )

  it.live("errors for explicit ranges exceeding render budget", () =>
    Effect.gen(function* () {
      const dir = yield* tmpdirScoped()
      const file = path.join(dir, "oversized.txt")
      yield* put(file, `${"x".repeat(2000)}\n`.repeat(100))
      const err = yield* fail(dir, { filePath: file, limit: 100 })
      expect(err.message).toContain("Requested range exceeds 50 KB output limit")
    }),
  )

  it.live("uses unicode-safe long-line truncation", () =>
    Effect.gen(function* () {
      const dir = yield* tmpdirScoped()
      const file = path.join(dir, "unicode.txt")
      yield* put(file, "😀".repeat(2001))
      const result = yield* exec(dir, { filePath: file })
      expect(result.output).toContain("😀".repeat(2000))
      expect(result.output).not.toContain("�")
    }),
  )

  it.live("handles CRLF and split UTF-8 chunks", () =>
    Effect.gen(function* () {
      const dir = yield* tmpdirScoped()
      const file = path.join(dir, "utf8.txt")
      yield* put(file, "one\r\ntwo 😀\r\nthree")
      const result = yield* exec(dir, { filePath: file, limit: 3 })
      expect(result.output).toContain("1: one\n2: two 😀\n3: three")
      expect(result.output).not.toContain("\r")
    }),
  )

  it.instance("attaches images at media size cap", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const png = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==",
        "base64",
      )
      const file = path.join(test.directory, "image.png")
      yield* put(file, png)
      const fs = yield* FSUtil.Service

      const result = yield* run({ filePath: file }).pipe(
        Effect.provideService(
          FSUtil.Service,
          FSUtil.Service.of({
            ...fs,
            stat: (filepath) =>
              fs
                .stat(filepath)
                .pipe(
                  Effect.map((info) =>
                    filepath === file ? { ...info, size: FileSystem.Size(MAX_MEDIA_BYTES) } : info,
                  ),
                ),
          }),
        ),
      )
      expect(result.metadata.truncated).toBe(false)
      expect(result.attachments).toBeDefined()
      expect(result.attachments?.length).toBe(1)
      expect(result.attachments?.[0]).not.toHaveProperty("id")
      expect(result.attachments?.[0]).not.toHaveProperty("sessionID")
      expect(result.attachments?.[0]).not.toHaveProperty("messageID")
    }),
  )

  for (const [name, bytes, mime] of [
    [
      "image",
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==",
        "base64",
      ),
      "image/png",
    ],
    ["PDF", Buffer.from("%PDF-1.4"), "application/pdf"],
  ] as const) {
    it.instance(`rejects over-cap ${name} before reading attachment bytes`, () =>
      Effect.gen(function* () {
        const test = yield* TestInstance
        const file = path.join(test.directory, `oversized-${name}`)
        yield* put(file, bytes)
        const fs = yield* FSUtil.Service
        let reads = 0

        const err = yield* fail(test.directory, { filePath: file }).pipe(
          Effect.provideService(
            FSUtil.Service,
            FSUtil.Service.of({
              ...fs,
              stat: (filepath) =>
                fs
                  .stat(filepath)
                  .pipe(
                    Effect.map((info) =>
                      filepath === file ? { ...info, size: FileSystem.Size(MAX_MEDIA_BYTES + 1) } : info,
                    ),
                  ),
              readFile: (filepath) => {
                reads++
                return Effect.die(`readFile called for over-cap attachment: ${filepath}`)
              },
            }),
          ),
        )
        expect(err.message).toBe(
          `Cannot read ${mime} attachment at ${file}: ${MAX_MEDIA_BYTES + 1} bytes exceeds maximum ${MAX_MEDIA_BYTES} bytes. Use a file at or below ${MAX_MEDIA_BYTES} bytes.`,
        )
        expect(reads).toBe(0)
      }),
    )
  }

  it.live("detects attachment media from file contents", () =>
    Effect.gen(function* () {
      const dir = yield* tmpdirScoped()
      const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01])
      yield* put(path.join(dir, "image.bin"), jpeg)

      const result = yield* exec(dir, { filePath: path.join(dir, "image.bin") })
      expect(result.output).toBe("Image read successfully")
      expect(result.attachments?.[0].mime).toBe("image/jpeg")
      expect(result.attachments?.[0].url.startsWith("data:image/jpeg;base64,")).toBe(true)
    }),
  )

  it.live("large image files are properly attached without error", () =>
    Effect.gen(function* () {
      const result = yield* exec(FIXTURES_DIR, { filePath: path.join(FIXTURES_DIR, "large-image.png") })
      expect(result.metadata.truncated).toBe(false)
      expect(result.attachments).toBeDefined()
      expect(result.attachments?.length).toBe(1)
      expect(result.attachments?.[0].type).toBe("file")
      expect(result.attachments?.[0]).not.toHaveProperty("id")
      expect(result.attachments?.[0]).not.toHaveProperty("sessionID")
      expect(result.attachments?.[0]).not.toHaveProperty("messageID")
    }),
  )

  it.live(".fbs files (FlatBuffers schema) are read as text, not images", () =>
    Effect.gen(function* () {
      const dir = yield* tmpdirScoped()
      const fbs = `namespace MyGame;

table Monster {
  pos:Vec3;
  name:string;
  inventory:[ubyte];
}

root_type Monster;`
      yield* put(path.join(dir, "schema.fbs"), fbs)

      const result = yield* exec(dir, { filePath: path.join(dir, "schema.fbs") })
      expect(result.attachments).toBeUndefined()
      expect(result.output).toContain("namespace MyGame")
      expect(result.output).toContain("table Monster")
    }),
  )

  it.live("falls through unsupported image mime types to text", () =>
    Effect.gen(function* () {
      const dir = yield* tmpdirScoped()
      const cases = [
        ["image.bmp", "BM text content"],
        ["photo.tiff", "II text content"],
        ["photo.avif", "avif text content"],
      ] as const

      for (const item of cases) {
        yield* put(path.join(dir, item[0]), item[1])
        const result = yield* exec(dir, { filePath: path.join(dir, item[0]) })
        expect(result.attachments).toBeUndefined()
        expect(result.output).toContain(item[1])
      }
    }),
  )
})

describe("tool.read loaded instructions", () => {
  it.live("loads AGENTS.md from parent directory and includes in metadata", () =>
    Effect.gen(function* () {
      const dir = yield* tmpdirScoped()
      yield* put(path.join(dir, "subdir", "AGENTS.md"), "# Test Instructions\nDo something special.")
      yield* put(path.join(dir, "subdir", "nested", "test.txt"), "test content")

      const result = yield* exec(dir, { filePath: path.join(dir, "subdir", "nested", "test.txt") })
      expect(result.output).toContain("test content")
      expect(result.output).toContain("system-reminder")
      expect(result.output).toContain("Test Instructions")
      expect(result.metadata.loaded).toBeDefined()
      expect(result.metadata.loaded).toContain(path.join(dir, "subdir", "AGENTS.md"))
    }),
  )

  it.live("keeps reminders on non-default reads", () =>
    Effect.gen(function* () {
      const dir = yield* tmpdirScoped()
      yield* put(path.join(dir, "subdir", "AGENTS.md"), "# Parent rule")
      const file = path.join(dir, "subdir", "nested", "test.txt")
      yield* put(file, "one\ntwo")
      const result = yield* exec(dir, { filePath: file, offset: 2, limit: 1 })
      expect(result.output).toContain("2: two")
      expect(result.output).toContain("Parent rule")
    }),
  )

  it.live("caps rendered body with reminders", () =>
    Effect.gen(function* () {
      const dir = yield* tmpdirScoped()
      yield* put(path.join(dir, "nested", "AGENTS.md"), "r".repeat(12 * 1024))
      const file = path.join(dir, "nested", "deep", "body.txt")
      yield* put(file, `${"x".repeat(500)}\n`.repeat(100))
      const result = yield* exec(dir, { filePath: file })
      expect(result.metadata.truncated).toBe(true)
      expect(Buffer.byteLength(result.output, "utf-8")).toBeLessThanOrEqual(50 * 1024)
      expect(result.output).toContain("system-reminder")
    }),
  )

  it.live("rejects empty partial view when reminder leaves no line budget", () =>
    Effect.gen(function* () {
      const dir = yield* tmpdirScoped()
      yield* put(path.join(dir, "nested", "AGENTS.md"), "r".repeat(48 * 1024))
      const file = path.join(dir, "nested", "deep", "body.txt")
      yield* put(file, "x".repeat(2000))
      const err = yield* fail(dir, { filePath: file })
      expect(err.message).toContain("One complete rendered line cannot fit")
      expect(err.message).not.toContain("Showing lines 1-0")
    }),
  )
})

describe("tool.read binary detection", () => {
  it.live("rejects text extension files with null bytes", () =>
    Effect.gen(function* () {
      const dir = yield* tmpdirScoped()
      const bytes = Buffer.from([0x68, 0x65, 0x6c, 0x6c, 0x6f, 0x00, 0x77, 0x6f, 0x72, 0x6c, 0x64])
      yield* put(path.join(dir, "null-byte.txt"), bytes)

      const err = yield* fail(dir, { filePath: path.join(dir, "null-byte.txt") })
      expect(err.message).toContain("Cannot read binary file")
    }),
  )

  it.live("rejects known binary extensions", () =>
    Effect.gen(function* () {
      const dir = yield* tmpdirScoped()
      yield* put(path.join(dir, "module.wasm"), "not really wasm")

      const err = yield* fail(dir, { filePath: path.join(dir, "module.wasm") })
      expect(err.message).toContain("Cannot read binary file")
    }),
  )
})

describe("tool.read tail", () => {
  it.live("reads from the end with negative offset", () =>
    Effect.gen(function* () {
      const dir = yield* tmpdirScoped()
      const file = path.join(dir, "log.txt")
      yield* put(
        file,
        ["line1", "line2", "line3", "line4", "line5", "line6", "line7", "line8", "line9", "line10"].join("\n"),
      )

      const result = yield* exec(dir, { filePath: file, offset: -3 })
      expect(result.output).toContain("line10")
      expect(result.output).toContain("line9")
      expect(result.output).toContain("line8")
      expect(result.output).not.toContain("1: line1")
    }),
  )

  for (const [name, content] of [
    ["non-trailing newline", "one\ntwo\nthree"],
    ["trailing newline", "one\ntwo\nthree\n"],
  ] as const) {
    it.live(`returns exact last lines with ${name}`, () =>
      Effect.gen(function* () {
        const dir = yield* tmpdirScoped()
        const file = path.join(dir, "tail.txt")
        yield* put(file, content)
        const result = yield* exec(dir, { filePath: file, offset: -2 })
        expect(result.output).toContain("<content>\n2: two\n3: three\n(End of file - total 3 lines)\n</content>")
      }),
    )
  }

  it.live("clamps negative offset beyond file to first line", () =>
    Effect.gen(function* () {
      const dir = yield* tmpdirScoped()
      const file = path.join(dir, "tail.txt")
      yield* put(file, "one\ntwo\nthree")
      const result = yield* exec(dir, { filePath: file, offset: -10 })
      expect(result.output).toContain("<content>\n1: one\n2: two\n3: three\n(End of file - total 3 lines)\n</content>")
    }),
  )

  it.instance("uses seek reads without a forward stream", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const file = path.join(test.directory, "tail.txt")
      yield* put(file, `${"early\n".repeat(20_000)}tail-1\ntail-2\ntail-3`)
      const fs = yield* FSUtil.Service
      let streams = 0
      const result = yield* run({ filePath: file, offset: -3 }).pipe(
        Effect.provideService(
          FSUtil.Service,
          FSUtil.Service.of({
            ...fs,
            stream: (...args) => {
              streams++
              return fs.stream(...args)
            },
          }),
        ),
      )
      expect(streams).toBe(0)
      expect(result.output).toContain("tail-1")
      expect(result.output).not.toContain("early")
    }),
  )
})
