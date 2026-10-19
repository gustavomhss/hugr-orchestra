import { afterEach, describe, expect } from "bun:test"
import path from "path"
import fs from "fs/promises"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { Effect } from "effect"
import { CrossSpawnSpawner } from "@orchestra/core/cross-spawn-spawner"
import { FSUtil } from "@orchestra/core/fs-util"
import { Wildcard } from "@orchestra/core/util/wildcard"
import { LSP } from "@/lsp/lsp"
import { Truncate } from "@/tool/truncate"
import { Tool } from "@/tool/tool"
import { EditTool } from "../../src/tool/edit"
import { WriteTool } from "../../src/tool/write"
import { ApplyPatchTool } from "../../src/tool/apply_patch"
import { Format } from "../../src/format"
import { Agent } from "../../src/agent/agent"
import { EventV2Bridge } from "../../src/event-v2-bridge"
import { SessionID, MessageID } from "../../src/session/schema"
import { disposeAllInstances, TestInstance, tmpdirScoped } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

afterEach(async () => {
  await disposeAllInstances()
})

const it = testEffect(
  LayerNode.compile(
    LayerNode.group([
      LSP.node,
      FSUtil.node,
      Format.node,
      EventV2Bridge.node,
      Truncate.node,
      Agent.node,
      CrossSpawnSpawner.node,
    ]),
  ),
)

// Symlinks to files need a privilege on Windows; directory junctions do not, so those cases run on every OS.
const posix = process.platform === "win32" ? it.instance.skip : it.instance

type Ask = { permission: string; patterns: readonly string[] }

// `deny` rejects the named permission; `denyEdit` rejects `edit` when any asked pattern matches it, as the permission
// engine does; `during` runs when `edit` is asked, standing for a swap after the checks.
function makeCtx(options: { deny?: string; denyEdit?: string; during?: () => Promise<void> } = {}) {
  const asked: Ask[] = []
  const ctx = {
    sessionID: SessionID.make("ses_test-symlink"),
    messageID: MessageID.make("msg_test"),
    callID: "",
    agent: "maestro",
    abort: AbortSignal.any([]),
    messages: [],
    metadata: () => Effect.void,
    ask: (request: Ask) =>
      Effect.gen(function* () {
        asked.push({ permission: request.permission, patterns: request.patterns })
        if (request.permission === options.deny) return yield* Effect.die(new Error(`denied ${request.permission}`))
        const denyEdit = options.denyEdit
        if (
          request.permission === "edit" &&
          denyEdit &&
          request.patterns.some((item) => Wildcard.match(item, denyEdit))
        )
          return yield* Effect.die(new Error("denied edit"))
        if (request.permission === "edit" && options.during) yield* Effect.promise(options.during)
      }),
  }
  return { asked, ctx }
}

const writeTool = Effect.fn("SymlinkEscape.write")(function* (
  args: { filePath: string; content: string },
  ctx: Tool.Context,
) {
  const tool = yield* (yield* WriteTool).init()
  return yield* tool.execute(args, ctx)
})

const editTool = Effect.fn("SymlinkEscape.edit")(function* (
  args: { filePath: string; oldString: string; newString: string },
  ctx: Tool.Context,
) {
  const tool = yield* (yield* EditTool).init()
  return yield* tool.execute(args, ctx)
})

const patchTool = Effect.fn("SymlinkEscape.patch")(function* (patchText: string, ctx: Tool.Context) {
  const tool = yield* (yield* ApplyPatchTool).init()
  return yield* tool.execute({ patchText }, ctx)
})

const outsideDir = Effect.gen(function* () {
  const dir = yield* tmpdirScoped()
  return yield* Effect.promise(() => fs.realpath(dir))
})

const read = (file: string) => Effect.promise(() => fs.readFile(file, "utf-8"))
const exists = (file: string) =>
  Effect.promise(() =>
    fs.lstat(file).then(
      () => true,
      () => false,
    ),
  )
const put = (file: string, content: string) => Effect.promise(() => fs.writeFile(file, content))
const link = (target: string, file: string) => Effect.promise(() => fs.symlink(target, file, "junction"))

const patch = (...lines: string[]) => ["*** Begin Patch", ...lines, "*** End Patch"].join("\n")

describe("tool writes through workspace symlinks", () => {
  describe("write", () => {
    posix("asks external_directory for a symlinked file and writes nothing when refused", () =>
      Effect.gen(function* () {
        const test = yield* TestInstance
        const outside = yield* outsideDir
        yield* put(path.join(outside, "rc"), "keep")
        yield* link(path.join(outside, "rc"), path.join(test.directory, "x.txt"))

        const denied = makeCtx({ deny: "external_directory" })
        const exit = yield* writeTool({ filePath: "x.txt", content: "pwned" }, denied.ctx).pipe(Effect.exit)
        expect(exit._tag).toBe("Failure")
        expect(denied.asked[0]?.permission).toBe("external_directory")
        expect(denied.asked[0]?.patterns[0]).toContain(outside.replaceAll("\\", "/"))
        expect(yield* read(path.join(outside, "rc"))).toBe("keep")

        const allowed = makeCtx()
        yield* writeTool({ filePath: "x.txt", content: "allowed" }, allowed.ctx)
        expect(allowed.asked.map((item) => item.permission)).toEqual(["external_directory", "edit"])
        expect(yield* read(path.join(outside, "rc"))).toBe("allowed")
      }),
    )

    it.instance("asks external_directory for a symlinked parent directory", () =>
      Effect.gen(function* () {
        const test = yield* TestInstance
        const outside = yield* outsideDir
        yield* link(outside, path.join(test.directory, "linked"))

        const denied = makeCtx({ deny: "external_directory" })
        const exit = yield* writeTool({ filePath: "linked/new.txt", content: "pwned" }, denied.ctx).pipe(Effect.exit)
        expect(exit._tag).toBe("Failure")
        expect(denied.asked[0]?.permission).toBe("external_directory")
        expect(yield* exists(path.join(outside, "new.txt"))).toBe(false)

        const allowed = makeCtx()
        yield* writeTool({ filePath: "linked/new.txt", content: "allowed" }, allowed.ctx)
        expect(allowed.asked[0]?.permission).toBe("external_directory")
        expect(yield* read(path.join(outside, "new.txt"))).toBe("allowed")
      }),
    )

    posix("asks external_directory for a dangling symlink and creates nothing when refused", () =>
      Effect.gen(function* () {
        const test = yield* TestInstance
        const outside = yield* outsideDir
        yield* link(path.join(outside, "created.txt"), path.join(test.directory, "x.txt"))

        const denied = makeCtx({ deny: "external_directory" })
        const exit = yield* writeTool({ filePath: "x.txt", content: "pwned" }, denied.ctx).pipe(Effect.exit)
        expect(exit._tag).toBe("Failure")
        expect(denied.asked[0]?.permission).toBe("external_directory")
        expect(yield* exists(path.join(outside, "created.txt"))).toBe(false)
      }),
    )

    posix("does not ask for a symlink that stays inside the workspace and keeps the link", () =>
      Effect.gen(function* () {
        const test = yield* TestInstance
        yield* put(path.join(test.directory, "real.txt"), "old")
        yield* link(path.join(test.directory, "real.txt"), path.join(test.directory, "alias.txt"))

        const run = makeCtx()
        yield* writeTool({ filePath: "alias.txt", content: "new" }, run.ctx)
        expect(run.asked.map((item) => item.permission)).toEqual(["edit"])
        expect(yield* read(path.join(test.directory, "real.txt"))).toBe("new")
        expect((yield* Effect.promise(() => fs.lstat(path.join(test.directory, "alias.txt")))).isSymbolicLink()).toBe(
          true,
        )
      }),
    )

    posix("refuses a file swapped for a symlink after the checks", () =>
      Effect.gen(function* () {
        const test = yield* TestInstance
        const outside = yield* outsideDir
        const inside = path.join(test.directory, "real.txt")
        yield* put(inside, "old")
        yield* put(path.join(outside, "rc"), "keep")
        yield* link(inside, path.join(test.directory, "alias.txt"))

        const run = makeCtx({
          during: async () => {
            await fs.rm(inside)
            await fs.symlink(path.join(outside, "rc"), inside)
          },
        })
        const exit = yield* writeTool({ filePath: "alias.txt", content: "pwned" }, run.ctx).pipe(Effect.exit)
        expect(exit._tag).toBe("Failure")
        expect(yield* read(path.join(outside, "rc"))).toBe("keep")
      }),
    )

    it.instance("refuses a parent directory swapped for a link after the checks", () =>
      Effect.gen(function* () {
        const test = yield* TestInstance
        const outside = yield* outsideDir
        const dir = path.join(test.directory, "dir")
        yield* Effect.promise(() => fs.mkdir(dir))
        yield* put(path.join(dir, "file.txt"), "old")
        yield* put(path.join(outside, "file.txt"), "keep")

        const run = makeCtx({
          during: async () => {
            await fs.rename(dir, path.join(test.directory, "dir.bak"))
            await fs.symlink(outside, dir, "junction")
          },
        })
        const exit = yield* writeTool({ filePath: "dir/file.txt", content: "pwned" }, run.ctx).pipe(Effect.exit)
        expect(exit._tag).toBe("Failure")
        expect(yield* read(path.join(outside, "file.txt"))).toBe("keep")
      }),
    )
  })

  describe("edit", () => {
    posix("asks external_directory for a symlinked file and edits nothing when refused", () =>
      Effect.gen(function* () {
        const test = yield* TestInstance
        const outside = yield* outsideDir
        yield* put(path.join(outside, "rc"), "alias ll=ls")
        yield* link(path.join(outside, "rc"), path.join(test.directory, "x.ts"))

        const denied = makeCtx({ deny: "external_directory" })
        const exit = yield* editTool({ filePath: "x.ts", oldString: "ls", newString: "rm -rf ~" }, denied.ctx).pipe(
          Effect.exit,
        )
        expect(exit._tag).toBe("Failure")
        expect(denied.asked[0]?.permission).toBe("external_directory")
        expect(yield* read(path.join(outside, "rc"))).toBe("alias ll=ls")
      }),
    )

    posix("asks external_directory when creating through a dangling symlink", () =>
      Effect.gen(function* () {
        const test = yield* TestInstance
        const outside = yield* outsideDir
        yield* link(path.join(outside, "created.ts"), path.join(test.directory, "x.ts"))

        const denied = makeCtx({ deny: "external_directory" })
        const exit = yield* editTool({ filePath: "x.ts", oldString: "", newString: "pwned" }, denied.ctx).pipe(
          Effect.exit,
        )
        expect(exit._tag).toBe("Failure")
        expect(yield* exists(path.join(outside, "created.ts"))).toBe(false)
      }),
    )

    it.instance("asks external_directory for a symlinked parent directory", () =>
      Effect.gen(function* () {
        const test = yield* TestInstance
        const outside = yield* outsideDir
        yield* put(path.join(outside, "f.ts"), "one")
        yield* link(outside, path.join(test.directory, "linked"))

        const denied = makeCtx({ deny: "external_directory" })
        const exit = yield* editTool({ filePath: "linked/f.ts", oldString: "one", newString: "two" }, denied.ctx).pipe(
          Effect.exit,
        )
        expect(exit._tag).toBe("Failure")
        expect(denied.asked[0]?.permission).toBe("external_directory")
        expect(yield* read(path.join(outside, "f.ts"))).toBe("one")
      }),
    )
  })

  describe("apply_patch", () => {
    it.instance("asks external_directory for an add under a symlinked directory", () =>
      Effect.gen(function* () {
        const test = yield* TestInstance
        const outside = yield* outsideDir
        yield* link(outside, path.join(test.directory, "linked"))

        const denied = makeCtx({ deny: "external_directory" })
        const exit = yield* patchTool(patch("*** Add File: linked/new.txt", "+pwned"), denied.ctx).pipe(Effect.exit)
        expect(exit._tag).toBe("Failure")
        expect(denied.asked[0]?.permission).toBe("external_directory")
        expect(yield* exists(path.join(outside, "new.txt"))).toBe(false)

        const allowed = makeCtx()
        yield* patchTool(patch("*** Add File: linked/new.txt", "+allowed"), allowed.ctx)
        expect(yield* read(path.join(outside, "new.txt"))).toBe("allowed\n")
      }),
    )

    posix("asks external_directory for an update through a symlinked file", () =>
      Effect.gen(function* () {
        const test = yield* TestInstance
        const outside = yield* outsideDir
        yield* put(path.join(outside, "rc"), "one\n")
        yield* link(path.join(outside, "rc"), path.join(test.directory, "x.txt"))

        const denied = makeCtx({ deny: "external_directory" })
        const exit = yield* patchTool(patch("*** Update File: x.txt", "@@", "-one", "+pwned"), denied.ctx).pipe(
          Effect.exit,
        )
        expect(exit._tag).toBe("Failure")
        expect(yield* read(path.join(outside, "rc"))).toBe("one\n")
      }),
    )

    it.instance("asks external_directory for a move target under a symlinked directory", () =>
      Effect.gen(function* () {
        const test = yield* TestInstance
        const outside = yield* outsideDir
        yield* put(path.join(test.directory, "a.txt"), "one\n")
        yield* link(outside, path.join(test.directory, "linked"))

        const denied = makeCtx({ deny: "external_directory" })
        const exit = yield* patchTool(
          patch("*** Update File: a.txt", "*** Move to: linked/b.txt", "@@", "-one", "+two"),
          denied.ctx,
        ).pipe(Effect.exit)
        expect(exit._tag).toBe("Failure")
        expect(yield* exists(path.join(outside, "b.txt"))).toBe(false)
        expect(yield* read(path.join(test.directory, "a.txt"))).toBe("one\n")
      }),
    )

    posix("deleting a symlink removes the link, never what it points to", () =>
      Effect.gen(function* () {
        const test = yield* TestInstance
        const outside = yield* outsideDir
        yield* put(path.join(outside, "rc"), "keep\n")
        yield* link(path.join(outside, "rc"), path.join(test.directory, "x.txt"))

        const run = makeCtx()
        yield* patchTool(patch("*** Delete File: x.txt"), run.ctx)
        expect(run.asked[0]?.permission).toBe("external_directory")
        expect(yield* exists(path.join(test.directory, "x.txt"))).toBe(false)
        expect(yield* read(path.join(outside, "rc"))).toBe("keep\n")
      }),
    )
  })

  // A deny written for a workspace path must hold when the same file is reached through a link named elsewhere.
  // Edit patterns are relative to the worktree, which is not the test directory here, hence the leading star.
  describe("edit rules on the real path", () => {
    const secretDir = Effect.gen(function* () {
      const test = yield* TestInstance
      yield* Effect.promise(() => fs.mkdir(path.join(test.directory, "secret")))
      yield* put(path.join(test.directory, "secret", "key.txt"), "keep\n")
      yield* link(path.join(test.directory, "secret"), path.join(test.directory, "docs"))
      return test.directory
    })

    it.instance("write is denied by a rule on where the link lands", () =>
      Effect.gen(function* () {
        const directory = yield* secretDir
        const run = makeCtx({ denyEdit: "*secret/*" })
        const exit = yield* writeTool({ filePath: "docs/key.txt", content: "pwned" }, run.ctx).pipe(Effect.exit)
        expect(exit._tag).toBe("Failure")
        expect(run.asked.find((item) => item.permission === "edit")?.patterns).toHaveLength(2)
        expect(yield* read(path.join(directory, "secret", "key.txt"))).toBe("keep\n")
      }),
    )

    it.instance("edit is denied by a rule on where the link lands", () =>
      Effect.gen(function* () {
        const directory = yield* secretDir
        const run = makeCtx({ denyEdit: "*secret/*" })
        const exit = yield* editTool({ filePath: "docs/key.txt", oldString: "keep", newString: "pwned" }, run.ctx).pipe(
          Effect.exit,
        )
        expect(exit._tag).toBe("Failure")
        expect(yield* read(path.join(directory, "secret", "key.txt"))).toBe("keep\n")
      }),
    )

    it.instance("apply_patch is denied by a rule on where the link lands", () =>
      Effect.gen(function* () {
        const directory = yield* secretDir
        const run = makeCtx({ denyEdit: "*secret/*" })
        const exit = yield* patchTool(patch("*** Update File: docs/key.txt", "@@", "-keep", "+pwned"), run.ctx).pipe(
          Effect.exit,
        )
        expect(exit._tag).toBe("Failure")
        expect(yield* read(path.join(directory, "secret", "key.txt"))).toBe("keep\n")
      }),
    )
  })
})
