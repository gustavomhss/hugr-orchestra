import { expect } from "bun:test"
import path from "path"
import { mkdir, writeFile } from "fs/promises"
import { Effect } from "effect"
import { LayerNode } from "../../src/effect/layer-node"
import { FSUtil } from "../../src/fs-util"
import { AppProcess } from "../../src/process"
import { ToolSafetySandboxRuntime } from "../../src/tool-safety-sandbox-runtime"
import { ReviewLocalCheckScope } from "../../src/review-toolkit/local-check-scope"
import { ReviewLocalReadProcess } from "../../src/review-toolkit/local-read-process"
import { ReviewLocalTools } from "../../src/review-toolkit/local-tools"
import { ReviewScanProjection } from "../../src/review-toolkit/scan-projection"
import { ReviewLocalShfmt } from "../../src/review-toolkit/local-shfmt"
import type { ReviewLocalCheckTypes } from "../../src/review-toolkit/local-check-types"
import type { ReviewScratch } from "../../src/review-toolkit/scratch-copy"
import { FileDigests } from "../fixture/file-digests"
import { expectSpawn } from "../fixture/omni-expect"
import { tmpdir } from "../fixture/tmpdir"
import { testEffect } from "../lib/effect"

const it = testEffect(LayerNode.compile(LayerNode.group([FSUtil.node, AppProcess.node])))
const POLICY = JSON.stringify({ version: 1, shfmt: { indent: 2, language: "bash" }, cargoMachete: { enabled: true } })
const snapshot = (root: string): ReviewScratch.Snapshot => ({ root, scratch: root, origin: root, kind: "worktree", revision: "a".repeat(40), digest: "b".repeat(64), files: 0, dependencyRoots: [] })
const held = () => Effect.acquireRelease(Effect.promise(tmpdir), (dir) => Effect.promise(() => dir[Symbol.asyncDispose]()))
const write = (root: string, files: Record<string, string>) => Effect.promise(async () => {
  for (const [file, text] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true })
    await writeFile(path.join(root, file), text)
  }
})
const projection = (root: string) => ReviewScanProjection.create({ snapshot: snapshot(root) }).pipe(Effect.map((result) => {
  if (!result.ok) throw new Error(result.reason)
  return result.projection
}))
const configured = (root: string, policy = POLICY) => Effect.gen(function* () {
  yield* write(root, { [ReviewLocalCheckScope.POLICY_PATH]: policy })
  const base = yield* projection(root)
  const read = yield* ReviewLocalCheckScope.read(base)
  if (!read.ok) throw new Error(read.reason)
  return { configured: read.configured, baseProjectionDigest: base.digest }
})
const capture = (root: string) => Effect.promise(() => FileDigests.capture(root))
const refuseExecution = () => Effect.die(new Error("unexpected native execution"))

if (process.platform === "linux") {
  it.live("shfmt checks selected shell bytes using base policy and preserves raw status", () => Effect.scoped(Effect.gen(function* () {
    expectSpawn(import.meta.path)
    yield* ToolSafetySandboxRuntime.ready()
    const temp = yield* held()
    const ready = yield* ReviewLocalTools.prepare("shfmt").pipe(Effect.provideService(ReviewLocalTools.Root, path.join(temp.path, "tools")))
    if (!ready.ok) throw new Error(ready.reason)
    expect(process.arch).toBe("x64")
    expect(ready.identity.target).toBe("linux-x64")
    expect(ready.identity.version).toBe("3.14.1")
    const base = yield* configured(path.join(temp.path, "base"))
    for (const [name, text, status] of [
      ["clean", "if true; then\n  echo ok\nfi\n", "pass"],
      ["diff", "if true;then\necho ok\nfi\n", "fail"],
      ["syntax", "if ; then\n", "acquisition-error"],
    ] as const) {
      const root = path.join(temp.path, name)
      yield* write(root, {
        "selected.sh": text,
        "unselected.sh": "if ; then\n",
        ".editorconfig": "root=true\n[*]\nindent_style=space\nindent_size=8\n",
        [ReviewLocalCheckScope.POLICY_PATH]: JSON.stringify({ version: 1 }),
      })
      const head = yield* projection(root)
      const input: ReviewLocalCheckTypes.Input = {
        projection: head,
        configured: base.configured,
        baseProjectionDigest: base.baseProjectionDigest,
        scope: "files",
        files: ["selected.sh"],
      }
      const beforeSource = yield* capture(root)
      const beforeProjection = yield* capture(head.root)
      const result = yield* ReviewLocalShfmt.run(input).pipe(Effect.provideService(ReviewLocalTools.Root, path.join(temp.path, "tools")))
      expect(result.status).toBe(status)
      expect(result.identity).toEqual(ready.identity)
      expect(result.selection?.policySha256).toBe(base.configured.sha256)
      expect(result.selection?.projectionDigest).toBe(head.digest)
      expect(result.selection?.coverage).toBe("explicit-files")
      expect(result.selection?.files).toEqual(["selected.sh"])
      expect(result.selection?.flags).toEqual(["-d", "-i", "2", "-ln", "bash", "--"])
      expect(result.outcome).toBeDefined()
      expect(yield* capture(root)).toEqual(beforeSource)
      expect(yield* capture(head.root)).toEqual(beforeProjection)
    }
  })), 300_000)

  it.live("refuses bad policy, disabled check, and missing explicit file before execution", () => Effect.scoped(Effect.gen(function* () {
    const temp = yield* held()
    const base = yield* configured(path.join(temp.path, "base"))
    const root = path.join(temp.path, "head")
    yield* write(root, { "present.sh": "echo ok\n", [ReviewLocalCheckScope.POLICY_PATH]: POLICY })
    const head = yield* projection(root)
    const input = (overrides: Partial<ReviewLocalCheckTypes.Input> = {}): ReviewLocalCheckTypes.Input => ({
      projection: head,
      configured: base.configured,
      baseProjectionDigest: base.baseProjectionDigest,
      scope: "files",
      files: ["present.sh"],
      ...overrides,
    })
    expect(yield* ReviewLocalShfmt.run(input({ baseProjectionDigest: "wrong" }), refuseExecution)).toMatchObject({ status: "not-run", reason: "policy-projection-mismatch" })
    const disabled = yield* configured(path.join(temp.path, "disabled"), JSON.stringify({ version: 1 }))
    expect(yield* ReviewLocalShfmt.run(input({ configured: disabled.configured, baseProjectionDigest: disabled.baseProjectionDigest }), refuseExecution)).toMatchObject({ status: "not-run", reason: "policy-disabled" })
    expect(yield* ReviewLocalShfmt.run(input({ files: ["missing.sh"] }), refuseExecution)).toMatchObject({ status: "not-run", reason: "scope-file-unavailable" })
    expect(yield* ReviewLocalShfmt.run(input({ scope: "diff", files: ["notes.md"] }), refuseExecution)).toMatchObject({ status: "not-run", reason: "scope-no-input" })
  })))

  it.live("reports missing prepared identity without acquiring or changing the cache", () => Effect.scoped(Effect.gen(function* () {
    const temp = yield* held()
    const root = path.join(temp.path, "head")
    yield* write(root, { "selected.sh": "echo ok\n" })
    const head = yield* projection(root)
    const base = yield* configured(path.join(temp.path, "base"))
    const cache = path.join(temp.path, "empty-tools")
    yield* Effect.promise(() => mkdir(cache, { recursive: true }))
    const before = yield* capture(cache)
    const input: ReviewLocalCheckTypes.Input = { projection: head, configured: base.configured, baseProjectionDigest: base.baseProjectionDigest, scope: "files", files: ["selected.sh"] }
    const result = yield* ReviewLocalShfmt.run(input, refuseExecution).pipe(Effect.provideService(ReviewLocalTools.Root, cache))
    expect(result).toMatchObject({ status: "not-run" })
    expect(yield* capture(cache)).toEqual(before)
  })))
}

if (process.platform === "win32") {
  it.live("reports Windows analysis as explicitly unsupported without executing", () => Effect.scoped(Effect.gen(function* () {
    const temp = yield* held()
    const root = path.join(temp.path, "head")
    yield* write(root, { "selected.sh": "echo ok\n" })
    const head = yield* projection(root)
    const base = yield* configured(path.join(temp.path, "base"))
    const input: ReviewLocalCheckTypes.Input = { projection: head, configured: base.configured, baseProjectionDigest: base.baseProjectionDigest, scope: "files", files: ["selected.sh"] }
    expect(yield* ReviewLocalShfmt.run(input, refuseExecution)).toEqual({ status: "not-run", reason: "read-sandbox-unsupported-host" })
  })))
}
