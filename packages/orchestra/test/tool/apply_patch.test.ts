import { describe, expect } from "bun:test"
import path from "path"
import * as fs from "fs/promises"
import { PermissionV1 } from "@orchestra/core/v1/permission"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { ToolSafety } from "@orchestra/core/tool-safety"
import { Cause, Effect, Exit, Layer, Schema } from "effect"
import { ApplyPatchTool } from "../../src/tool/apply_patch"
import { LSP } from "@/lsp/lsp"
import { FSUtil } from "@orchestra/core/fs-util"
import { Format } from "../../src/format"
import { Agent } from "../../src/agent/agent"
import { EventV2Bridge } from "../../src/event-v2-bridge"
import { Truncate } from "@/tool/truncate"
import { TestInstance } from "../fixture/fixture"
import { SessionID, MessageID } from "../../src/session/schema"
import { testEffect } from "../lib/effect"

const it = testEffect(
  LayerNode.compile(
    LayerNode.group([LSP.node, FSUtil.node, Format.node, EventV2Bridge.node, Truncate.node, Agent.node]),
  ),
)

const baseCtx = {
  sessionID: SessionID.make("ses_test"),
  messageID: MessageID.make("msg_test"),
  callID: "",
  agent: "maestro",
  abort: AbortSignal.any([]),
  messages: [],
  metadata: () => Effect.void,
}

type AskInput = {
  permission: string
  patterns: string[]
  always: string[]
  metadata: {
    diff: string
    filepath: string
    files: Array<{
      filePath: string
      relativePath: string
      type: "add" | "update" | "delete" | "move"
      patch: string
      additions: number
      deletions: number
      movePath?: string
    }>
  }
}

type ToolCtx = typeof baseCtx & {
  ask: (input: AskInput) => Effect.Effect<void>
}

const execute = Effect.fn("ApplyPatchToolTest.execute")(function* (params: { patchText: string }, ctx: ToolCtx) {
  const info = yield* ApplyPatchTool
  const tool = yield* info.init()
  return yield* tool.execute(params, ctx)
})

const makeCtx = () => {
  const calls: AskInput[] = []
  const ctx: ToolCtx = {
    ...baseCtx,
    ask: (input) =>
      Effect.sync(() => {
        calls.push(input)
      }),
  }

  return { ctx, calls }
}

const readText = (filepath: string) => Effect.promise(() => fs.readFile(filepath, "utf-8"))
const writeText = (filepath: string, content: string) => Effect.promise(() => fs.writeFile(filepath, content, "utf-8"))
const makeDir = (dir: string) => Effect.promise(() => fs.mkdir(dir, { recursive: true }))

const expectFailure = <A, E, R>(effect: Effect.Effect<A, E, R>, message?: string) =>
  Effect.gen(function* () {
    const exit = yield* Effect.exit(effect)
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit) && message) expect(Cause.pretty(exit.cause)).toContain(message)
  })

const expectReadFailure = (filepath: string) => expectFailure(readText(filepath))

describe("tool.apply_patch freeform", () => {
  it.live("requires patchText", () =>
    Effect.gen(function* () {
      const { ctx } = makeCtx()
      yield* expectFailure(execute({ patchText: "" }, ctx), "patchText is required")
    }),
  )

  it.live("rejects invalid patch format", () =>
    Effect.gen(function* () {
      const { ctx } = makeCtx()
      yield* expectFailure(execute({ patchText: "invalid patch" }, ctx), "apply_patch verification failed")
    }),
  )

  it.live("rejects empty patch", () =>
    Effect.gen(function* () {
      const { ctx } = makeCtx()
      yield* expectFailure(execute({ patchText: "*** Begin Patch\n*** End Patch" }, ctx), "patch rejected: empty patch")
    }),
  )

  it.instance(
    "produces JSON-encodable permission metadata",
    () =>
      Effect.gen(function* () {
        const { ctx, calls } = makeCtx()
        yield* execute({ patchText: "*** Begin Patch\n*** Add File: new.txt\n+created\n*** End Patch" }, ctx)

        expect(() => {
          const request = Schema.encodeUnknownSync(PermissionV1.Request)({
            id: PermissionV1.ID.ascending(),
            sessionID: baseCtx.sessionID,
            ...calls[0],
          })
          Schema.encodeUnknownSync(Schema.Json)(request)
        }).not.toThrow()
      }),
    { git: true },
  )

  it.instance(
    "applies add/update/delete in one patch",
    () =>
      Effect.gen(function* () {
        const test = yield* TestInstance
        const { ctx, calls } = makeCtx()
        const modifyPath = path.join(test.directory, "modify.txt")
        const deletePath = path.join(test.directory, "delete.txt")
        yield* writeText(modifyPath, "line1\nline2\n")
        yield* writeText(deletePath, "obsolete\n")

        const patchText =
          "*** Begin Patch\n*** Add File: nested/new.txt\n+created\n*** Delete File: delete.txt\n*** Update File: modify.txt\n@@\n-line2\n+changed\n*** End Patch"

        const result = yield* execute({ patchText }, ctx)

        expect(result.title).toContain("Success. Updated the following files")
        expect(result.output).toContain("Success. Updated the following files")
        // Strict formatting assertions for slashes
        expect(result.output).toMatch(/A nested\/new\.txt/)
        expect(result.output).toMatch(/D delete\.txt/)
        expect(result.output).toMatch(/M modify\.txt/)
        if (process.platform === "win32") {
          expect(result.output).not.toContain("\\")
        }
        expect(result.metadata.diff).toContain("Index:")
        expect(calls.length).toBe(1)

        // Verify permission metadata includes files array for UI rendering
        const permissionCall = calls[0]
        expect(permissionCall.metadata.files).toHaveLength(3)
        expect(permissionCall.metadata.files.map((f) => f.type).sort()).toEqual(["add", "delete", "update"])

        const addFile = permissionCall.metadata.files.find((f) => f.type === "add")
        expect(addFile?.relativePath).toBe("nested/new.txt")
        expect(addFile?.patch).toContain("+created")

        const updateFile = permissionCall.metadata.files.find((f) => f.type === "update")
        expect(updateFile?.patch).toContain("-line2")
        expect(updateFile?.patch).toContain("+changed")

        expect(yield* readText(path.join(test.directory, "nested", "new.txt"))).toBe("created\n")
        expect(yield* readText(modifyPath)).toBe("line1\nchanged\n")
        yield* expectReadFailure(deletePath)
      }),
    { git: true },
  )

  it.instance(
    "permission metadata includes move file info",
    () =>
      Effect.gen(function* () {
        const test = yield* TestInstance
        const { ctx, calls } = makeCtx()
        const original = path.join(test.directory, "old", "name.txt")
        yield* makeDir(path.dirname(original))
        yield* writeText(original, "old content\n")

        const patchText =
          "*** Begin Patch\n*** Update File: old/name.txt\n*** Move to: renamed/dir/name.txt\n@@\n-old content\n+new content\n*** End Patch"

        yield* execute({ patchText }, ctx)

        expect(calls.length).toBe(1)
        const permissionCall = calls[0]
        expect(permissionCall.metadata.files).toHaveLength(1)

        const moveFile = permissionCall.metadata.files[0]
        expect(moveFile.type).toBe("move")
        expect(moveFile.relativePath).toBe("renamed/dir/name.txt")
        expect(moveFile.movePath).toBe(path.join(test.directory, "renamed/dir/name.txt"))
        expect(moveFile.patch).toContain("-old content")
        expect(moveFile.patch).toContain("+new content")
      }),
    { git: true },
  )

  it.instance("applies multiple hunks to one file", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const { ctx } = makeCtx()
      const target = path.join(test.directory, "multi.txt")
      yield* writeText(target, "line1\nline2\nline3\nline4\n")

      const patchText =
        "*** Begin Patch\n*** Update File: multi.txt\n@@\n-line2\n+changed2\n@@\n-line4\n+changed4\n*** End Patch"

      yield* execute({ patchText }, ctx)

      expect(yield* readText(target)).toBe("line1\nchanged2\nline3\nchanged4\n")
    }),
  )

  it.instance("does not invent a first-line diff for BOM files", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const { ctx, calls } = makeCtx()
      const bom = String.fromCharCode(0xfeff)
      const target = path.join(test.directory, "example.cs")
      yield* writeText(target, `${bom}using System;\n\nclass Test {}\n`)

      const patchText =
        "*** Begin Patch\n*** Update File: example.cs\n@@\n class Test {}\n+class Next {}\n*** End Patch"

      yield* execute({ patchText }, ctx)

      expect(calls.length).toBe(1)
      const shown = calls[0].metadata.files[0]?.patch ?? ""
      expect(shown).not.toContain(bom)
      expect(shown).not.toContain("-using System;")
      expect(shown).not.toContain("+using System;")

      const content = yield* readText(target)
      expect(content.charCodeAt(0)).toBe(0xfeff)
      expect(content.slice(1)).toBe("using System;\n\nclass Test {}\nclass Next {}\n")
    }),
  )

  it.instance("inserts lines with insert-only hunk", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const { ctx } = makeCtx()
      const target = path.join(test.directory, "insert_only.txt")
      yield* writeText(target, "alpha\nomega\n")

      const patchText = "*** Begin Patch\n*** Update File: insert_only.txt\n@@\n alpha\n+beta\n omega\n*** End Patch"

      yield* execute({ patchText }, ctx)

      expect(yield* readText(target)).toBe("alpha\nbeta\nomega\n")
    }),
  )

  it.instance("appends trailing newline on update", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const { ctx } = makeCtx()
      const target = path.join(test.directory, "no_newline.txt")
      yield* writeText(target, "no newline at end")

      const patchText =
        "*** Begin Patch\n*** Update File: no_newline.txt\n@@\n-no newline at end\n+first line\n+second line\n*** End Patch"

      yield* execute({ patchText }, ctx)

      const contents = yield* readText(target)
      expect(contents.endsWith("\n")).toBe(true)
      expect(contents).toBe("first line\nsecond line\n")
    }),
  )

  it.instance("moves file to a new directory", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const { ctx } = makeCtx()
      const original = path.join(test.directory, "old", "name.txt")
      yield* makeDir(path.dirname(original))
      yield* writeText(original, "old content\n")

      const patchText =
        "*** Begin Patch\n*** Update File: old/name.txt\n*** Move to: renamed/dir/name.txt\n@@\n-old content\n+new content\n*** End Patch"

      yield* execute({ patchText }, ctx)

      const moved = path.join(test.directory, "renamed", "dir", "name.txt")
      yield* expectReadFailure(original)
      expect(yield* readText(moved)).toBe("new content\n")
    }),
  )

  it.instance("moves file overwriting existing destination", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const { ctx } = makeCtx()
      const original = path.join(test.directory, "old", "name.txt")
      const destination = path.join(test.directory, "renamed", "dir", "name.txt")
      yield* makeDir(path.dirname(original))
      yield* makeDir(path.dirname(destination))
      yield* writeText(original, "from\n")
      yield* writeText(destination, "existing\n")

      const patchText =
        "*** Begin Patch\n*** Update File: old/name.txt\n*** Move to: renamed/dir/name.txt\n@@\n-from\n+new\n*** End Patch"

      yield* execute({ patchText }, ctx)

      yield* expectReadFailure(original)
      expect(yield* readText(destination)).toBe("new\n")
    }),
  )

  it.instance("adds file overwriting existing file", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const { ctx } = makeCtx()
      const target = path.join(test.directory, "duplicate.txt")
      yield* writeText(target, "old content\n")

      const patchText = "*** Begin Patch\n*** Add File: duplicate.txt\n+new content\n*** End Patch"

      yield* execute({ patchText }, ctx)
      expect(yield* readText(target)).toBe("new content\n")
    }),
  )

  it.instance("rejects update when target file is missing", () =>
    Effect.gen(function* () {
      const { ctx } = makeCtx()
      const patchText = "*** Begin Patch\n*** Update File: missing.txt\n@@\n-nope\n+better\n*** End Patch"

      yield* expectFailure(
        execute({ patchText }, ctx),
        "apply_patch verification failed: Failed to read file to update",
      )
    }),
  )

  it.instance("rejects delete when file is missing", () =>
    Effect.gen(function* () {
      const { ctx } = makeCtx()
      const patchText = "*** Begin Patch\n*** Delete File: missing.txt\n*** End Patch"

      yield* expectFailure(execute({ patchText }, ctx))
    }),
  )

  it.instance("rejects delete when target is a directory", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const { ctx } = makeCtx()
      const dirPath = path.join(test.directory, "dir")
      yield* makeDir(dirPath)

      const patchText = "*** Begin Patch\n*** Delete File: dir\n*** End Patch"

      yield* expectFailure(execute({ patchText }, ctx))
    }),
  )

  it.instance("rejects invalid hunk header", () =>
    Effect.gen(function* () {
      const { ctx } = makeCtx()
      const patchText = "*** Begin Patch\n*** Frobnicate File: foo\n*** End Patch"

      yield* expectFailure(execute({ patchText }, ctx), "apply_patch verification failed")
    }),
  )

  it.instance("rejects update with missing context", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const { ctx } = makeCtx()
      const target = path.join(test.directory, "modify.txt")
      yield* writeText(target, "line1\nline2\n")

      const patchText = "*** Begin Patch\n*** Update File: modify.txt\n@@\n-missing\n+changed\n*** End Patch"

      yield* expectFailure(execute({ patchText }, ctx), "apply_patch verification failed")
      expect(yield* readText(target)).toBe("line1\nline2\n")
    }),
  )

  it.instance("verification failure leaves no side effects", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const { ctx } = makeCtx()
      const patchText =
        "*** Begin Patch\n*** Add File: created.txt\n+hello\n*** Update File: missing.txt\n@@\n-old\n+new\n*** End Patch"

      yield* expectFailure(execute({ patchText }, ctx))
      yield* expectReadFailure(path.join(test.directory, "created.txt"))
    }),
  )

  it.instance("supports end of file anchor", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const { ctx } = makeCtx()
      const target = path.join(test.directory, "tail.txt")
      yield* writeText(target, "alpha\nlast\n")

      const patchText = "*** Begin Patch\n*** Update File: tail.txt\n@@\n-last\n+end\n*** End of File\n*** End Patch"

      yield* execute({ patchText }, ctx)
      expect(yield* readText(target)).toBe("alpha\nend\n")
    }),
  )

  it.instance("rejects missing second chunk context", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const { ctx } = makeCtx()
      const target = path.join(test.directory, "two_chunks.txt")
      yield* writeText(target, "a\nb\nc\nd\n")

      const patchText = "*** Begin Patch\n*** Update File: two_chunks.txt\n@@\n-b\n+B\n\n-d\n+D\n*** End Patch"

      yield* expectFailure(execute({ patchText }, ctx))
      expect(yield* readText(target)).toBe("a\nb\nc\nd\n")
    }),
  )

  it.instance("disambiguates change context with @@ header", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const { ctx } = makeCtx()
      const target = path.join(test.directory, "multi_ctx.txt")
      yield* writeText(target, "fn a\nx=10\ny=2\nfn b\nx=10\ny=20\n")

      const patchText = "*** Begin Patch\n*** Update File: multi_ctx.txt\n@@ fn b\n-x=10\n+x=11\n*** End Patch"

      yield* execute({ patchText }, ctx)
      expect(yield* readText(target)).toBe("fn a\nx=10\ny=2\nfn b\nx=11\ny=20\n")
    }),
  )

  it.instance("EOF anchor edits the last match, not the first", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const { ctx } = makeCtx()
      const target = path.join(test.directory, "eof_anchor.txt")
      // The hunk's lines appear twice; the anchor must pick the pair at the end of the file
      yield* writeText(target, "start\nmarker\nend\nmarker\nend\n")

      const patchText =
        "*** Begin Patch\n*** Update File: eof_anchor.txt\n@@\n-marker\n-end\n+marker-changed\n+end\n*** End of File\n*** End Patch"

      yield* execute({ patchText }, ctx)
      expect(yield* readText(target)).toBe("start\nmarker\nend\nmarker-changed\nend\n")
    }),
  )

  it.instance("rejects an EOF-anchored hunk that is not at the end of the file", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const { ctx } = makeCtx()
      const target = path.join(test.directory, "eof_middle.txt")
      yield* writeText(target, "alpha\nlast\nextra\n")

      const patchText =
        "*** Begin Patch\n*** Update File: eof_middle.txt\n@@\n-last\n+end\n*** End of File\n*** End Patch"

      yield* expectFailure(execute({ patchText }, ctx), "at the end of")
      expect(yield* readText(target)).toBe("alpha\nlast\nextra\n")
    }),
  )

  it.instance("applies a first hunk without an @@ line", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const { ctx } = makeCtx()
      const target = path.join(test.directory, "no_header.txt")
      yield* writeText(target, "line1\nline2\nline3\n")

      const patchText =
        "*** Begin Patch\n*** Update File: no_header.txt\n line1\n-line2\n+changed\n line3\n*** End Patch"

      yield* execute({ patchText }, ctx)
      expect(yield* readText(target)).toBe("line1\nchanged\nline3\n")
    }),
  )

  it.instance("rejects an update without hunk lines", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const { ctx } = makeCtx()
      const target = path.join(test.directory, "unchanged.txt")
      yield* writeText(target, "line1\n")

      yield* expectFailure(
        execute({ patchText: "*** Begin Patch\n*** Update File: unchanged.txt\n*** End Patch" }, ctx),
        "has no hunk lines",
      )
      yield* expectFailure(
        execute({ patchText: "*** Begin Patch\n*** Update File: unchanged.txt\n@@\n*** End Patch" }, ctx),
        "has no hunk lines",
      )
      expect(yield* readText(target)).toBe("line1\n")
    }),
  )

  it.instance("rejects a hunk line without a prefix", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const { ctx } = makeCtx()
      const target = path.join(test.directory, "unprefixed.txt")
      yield* writeText(target, "line1\nline2\n")

      const patchText = "*** Begin Patch\n*** Update File: unprefixed.txt\n@@\n-line2\nchanged\n*** End Patch"

      yield* expectFailure(execute({ patchText }, ctx), "Unexpected line 'changed'")
      expect(yield* readText(target)).toBe("line1\nline2\n")
    }),
  )

  it.instance("rejects an unknown line between file sections", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const { ctx } = makeCtx()
      const target = path.join(test.directory, "kept.txt")
      yield* writeText(target, "line1\nline2\n")

      const patchText =
        "*** Begin Patch\n*** Add File: added.txt\n+hello\n*** Updte File: kept.txt\n@@\n-line2\n+changed\n*** End Patch"

      yield* expectFailure(execute({ patchText }, ctx), "Unexpected line '*** Updte File: kept.txt'")
      yield* expectReadFailure(path.join(test.directory, "added.txt"))
      expect(yield* readText(target)).toBe("line1\nline2\n")
    }),
  )

  it.instance("keeps a context line that reads *** End Patch", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const { ctx } = makeCtx()
      const target = path.join(test.directory, "format.md")
      yield* writeText(target, "intro\n*** End Patch\nold\n")

      const patchText =
        "*** Begin Patch\n*** Update File: format.md\n@@\n intro\n *** End Patch\n-old\n+new\n*** End Patch"

      yield* execute({ patchText }, ctx)
      expect(yield* readText(target)).toBe("intro\n*** End Patch\nnew\n")
    }),
  )

  it.instance("rejects a second patch envelope", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const { ctx } = makeCtx()
      const target = path.join(test.directory, "second.txt")
      yield* writeText(target, "old\n")

      const patchText =
        "*** Begin Patch\n*** Add File: first.txt\n+first\n*** End Patch\n*** Begin Patch\n*** Update File: second.txt\n@@\n-old\n+new\n*** End Patch"

      yield* expectFailure(execute({ patchText }, ctx), "Unexpected line '*** End Patch'")
      yield* expectReadFailure(path.join(test.directory, "first.txt"))
      expect(yield* readText(target)).toBe("old\n")
    }),
  )

  it.instance("rejects an Add File line without +", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const { ctx } = makeCtx()
      const patchText = "*** Begin Patch\n*** Add File: added.txt\n+first\nsecond\n*** End Patch"

      yield* expectFailure(execute({ patchText }, ctx), "Unexpected line 'second'")
      yield* expectReadFailure(path.join(test.directory, "added.txt"))
    }),
  )

  it.instance("narrows the match with stacked @@ lines", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const { ctx } = makeCtx()
      const target = path.join(test.directory, "stacked.txt")
      yield* writeText(target, "class A\n  def run\n    x = 1\nclass B\n  def run\n    x = 1\n")

      const patchText =
        "*** Begin Patch\n*** Update File: stacked.txt\n@@ class B\n@@   def run\n-    x = 1\n+    x = 2\n*** End Patch"

      yield* execute({ patchText }, ctx)
      expect(yield* readText(target)).toBe("class A\n  def run\n    x = 1\nclass B\n  def run\n    x = 2\n")
    }),
  )

  it.instance("renames a file with Move to and no hunks", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const { ctx } = makeCtx()
      const original = path.join(test.directory, "before.txt")
      yield* writeText(original, "content\n")

      const patchText = "*** Begin Patch\n*** Update File: before.txt\n*** Move to: after.txt\n*** End Patch"

      yield* execute({ patchText }, ctx)
      yield* expectReadFailure(original)
      expect(yield* readText(path.join(test.directory, "after.txt"))).toBe("content\n")
    }),
  )

  it.instance("parses heredoc-wrapped patch", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const { ctx } = makeCtx()
      const patchText = `cat <<'EOF'
*** Begin Patch
*** Add File: heredoc_test.txt
+heredoc content
*** End Patch
EOF`

      yield* execute({ patchText }, ctx)
      expect(yield* readText(path.join(test.directory, "heredoc_test.txt"))).toBe("heredoc content\n")
    }),
  )

  it.instance("parses heredoc-wrapped patch without cat", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const { ctx } = makeCtx()
      const patchText = `<<EOF
*** Begin Patch
*** Add File: heredoc_no_cat.txt
+no cat prefix
*** End Patch
EOF`

      yield* execute({ patchText }, ctx)
      expect(yield* readText(path.join(test.directory, "heredoc_no_cat.txt"))).toBe("no cat prefix\n")
    }),
  )

  it.instance("matches with trailing whitespace differences", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const { ctx } = makeCtx()
      const target = path.join(test.directory, "trailing_ws.txt")
      // File has trailing spaces on some lines
      yield* writeText(target, "line1  \nline2\nline3   \n")

      // Patch doesn't have trailing spaces - should still match via rstrip pass
      const patchText = "*** Begin Patch\n*** Update File: trailing_ws.txt\n@@\n-line2\n+changed\n*** End Patch"

      yield* execute({ patchText }, ctx)
      expect(yield* readText(target)).toBe("line1  \nchanged\nline3   \n")
    }),
  )

  it.instance("matches with leading whitespace differences", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const { ctx } = makeCtx()
      const target = path.join(test.directory, "leading_ws.txt")
      // File has leading spaces
      yield* writeText(target, "  line1\nline2\n  line3\n")

      // Patch without leading spaces - should match via trim pass
      const patchText = "*** Begin Patch\n*** Update File: leading_ws.txt\n@@\n-line2\n+changed\n*** End Patch"

      yield* execute({ patchText }, ctx)
      expect(yield* readText(target)).toBe("  line1\nchanged\n  line3\n")
    }),
  )

  it.instance("matches with Unicode punctuation differences", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const { ctx } = makeCtx()
      const target = path.join(test.directory, "unicode.txt")
      // File has fancy Unicode quotes (U+201C, U+201D) and em-dash (U+2014)
      const leftQuote = "\u201C"
      const rightQuote = "\u201D"
      const emDash = "\u2014"
      yield* writeText(target, `He said ${leftQuote}hello${rightQuote}\nsome${emDash}dash\nend\n`)

      // Patch uses ASCII equivalents - should match via normalized pass
      // The replacement uses ASCII quotes from the patch (not preserving Unicode)
      const patchText =
        '*** Begin Patch\n*** Update File: unicode.txt\n@@\n-He said "hello"\n+He said "hi"\n*** End Patch'

      yield* execute({ patchText }, ctx)
      // Result has ASCII quotes because that's what the patch specifies
      expect(yield* readText(target)).toBe(`He said "hi"\nsome${emDash}dash\nend\n`)
    }),
  )

  it.instance("reads an empty line between hunk lines as a blank context line", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const { ctx } = makeCtx()
      const target = path.join(test.directory, "blank_context.txt")
      yield* writeText(target, "alpha\n\nbeta\n")

      // Models often drop the leading space of a blank context line; Codex reads the empty line as context too
      const patchText = "*** Begin Patch\n*** Update File: blank_context.txt\n@@\n alpha\n\n-beta\n+gamma\n*** End Patch"

      yield* execute({ patchText }, ctx)
      expect(yield* readText(target)).toBe("alpha\n\ngamma\n")
    }),
  )

  it.instance("writes an empty line between Add File lines", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const { ctx } = makeCtx()

      yield* execute({ patchText: "*** Begin Patch\n*** Add File: notes.md\n+first\n\n+second\n*** End Patch" }, ctx)
      expect(yield* readText(path.join(test.directory, "notes.md"))).toBe("first\n\nsecond\n")
    }),
  )

  it.instance("rejects an empty line between + lines of a hunk without context", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const { ctx } = makeCtx()
      const target = path.join(test.directory, "append.txt")
      yield* writeText(target, "alpha\n\nomega\n")

      const patchText = "*** Begin Patch\n*** Update File: append.txt\n@@\n+one\n\n+two\n*** End Patch"

      yield* expectFailure(execute({ patchText }, ctx), "write an added blank line as +")
      expect(yield* readText(target)).toBe("alpha\n\nomega\n")
    }),
  )

  it.instance("keeps empty lines around hunks out of them", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const { ctx } = makeCtx()
      const target = path.join(test.directory, "separated.txt")
      yield* writeText(target, "a\nb\n\nc\nd\n")

      // Read as context, the empty line after +e would move it to the file's blank line instead of the end
      const patchText =
        "*** Begin Patch\n*** Update File: separated.txt\n@@\n-a\n+A\n\n@@\n-d\n+D\n\n@@\n+e\n\n*** End Patch"

      yield* execute({ patchText }, ctx)
      expect(yield* readText(target)).toBe("A\nb\n\nc\nD\ne\n")
    }),
  )

  it.instance("applies under a safety profile the patch shapes it applies without one", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const { ctx } = makeCtx()
      yield* writeText(path.join(test.directory, "shapes.txt"), "one\ntwo\n\nthree\n")

      // With a profile loaded, ToolSafety parses each patch before the tool runs and holds one it cannot parse
      for (const shape of [
        "*** Update File: shapes.txt\n-one\n+ONE",
        "\n*** Update File: shapes.txt\n\n@@\n two\n\n-three\n+THREE\n",
        "*** Update File: shapes.txt\n*** Move to: moved.txt",
        "*** Add File: added.txt\n+a\n\n+b",
      ])
        yield* execute({ patchText: `*** Begin Patch\n${shape}\n*** End Patch` }, ctx).pipe(
          Effect.provideService(ToolSafety.RuntimeProfile, { writeRoots: ["."] }),
        )

      expect(yield* readText(path.join(test.directory, "moved.txt"))).toBe("ONE\ntwo\n\nTHREE\n")
      expect(yield* readText(path.join(test.directory, "added.txt"))).toBe("a\n\nb\n")
      yield* expectReadFailure(path.join(test.directory, "shapes.txt"))
    }),
  )

  it.instance("holds a patch whose file after a context line that reads *** End Patch is never-touch", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const { ctx } = makeCtx()
      const secret = path.join(test.directory, "secret.txt")
      yield* writeText(path.join(test.directory, "format.md"), "intro\n*** End Patch\nold\n")
      yield* writeText(secret, "secret\n")

      // The guard must check every file the tool writes, so both read the patch up to its last *** End Patch
      const patchText =
        "*** Begin Patch\n*** Update File: format.md\n@@\n intro\n *** End Patch\n-old\n+new\n*** Update File: secret.txt\n@@\n-secret\n+leaked\n*** End Patch"

      yield* expectFailure(
        execute({ patchText }, ctx).pipe(
          Effect.provideService(ToolSafety.RuntimeProfile, { neverTouch: ["secret.txt"] }),
        ),
        "Tool safety HOLD: project-never-touch",
      )
      expect(yield* readText(secret)).toBe("secret\n")
      expect(yield* readText(path.join(test.directory, "format.md"))).toBe("intro\n*** End Patch\nold\n")
    }),
  )
})
