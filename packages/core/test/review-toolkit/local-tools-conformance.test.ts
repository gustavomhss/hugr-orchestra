import { expect } from "bun:test"
import path from "path"
import { mkdir, writeFile } from "fs/promises"
import { Effect } from "effect"
import { LayerNode } from "../../src/effect/layer-node"
import { FSUtil } from "../../src/fs-util"
import { AppProcess } from "../../src/process"
import { ResearchProcess } from "../../src/research-toolkit/process"
import { ToolSafetySandboxRuntime } from "../../src/tool-safety-sandbox-runtime"
import { ReviewLocalCheckScope } from "../../src/review-toolkit/local-check-scope"
import { ReviewLocalReadProcess } from "../../src/review-toolkit/local-read-process"
import { ReviewLocalTools } from "../../src/review-toolkit/local-tools"
import { ReviewScanProjection } from "../../src/review-toolkit/scan-projection"
import type { ReviewScratch } from "../../src/review-toolkit/scratch-copy"
import { FileDigests } from "../fixture/file-digests"
import { expectSpawn } from "../fixture/omni-expect"
import { tmpdir } from "../fixture/tmpdir"
import { testEffect } from "../lib/effect"

const it = testEffect(LayerNode.compile(LayerNode.group([FSUtil.node, AppProcess.node])))
const POLICY = JSON.stringify({ version: 1, shfmt: { indent: 2, language: "bash" }, cargoMachete: { enabled: true } })
const CARGO = '[package]\nname="fixture"\nversion="0.1.0"\nedition="2021"\n[dependencies]\nanyhow="1"\n'
const snapshot = (root: string): ReviewScratch.Snapshot => ({ root, scratch: root, origin: root, kind: "worktree", revision: "a".repeat(40), digest: "b".repeat(64), files: 0, dependencyRoots: [] })
const held = () => Effect.acquireRelease(Effect.promise(tmpdir), (dir) => Effect.promise(() => dir[Symbol.asyncDispose]()))
const write = (root: string, files: Record<string, string>) => Effect.promise(async () => {
  for (const [file, text] of Object.entries(files)) { await mkdir(path.dirname(path.join(root, file)), { recursive: true }); await writeFile(path.join(root, file), text) }
})
const projected = (root: string) => ReviewScanProjection.create({ snapshot: snapshot(root) }).pipe(Effect.map((result) => {
  if (!result.ok) throw new Error(result.reason)
  return result.projection
}))
const basePolicy = (root: string) => Effect.gen(function* () {
  yield* write(root, { [ReviewLocalCheckScope.POLICY_PATH]: POLICY })
  const value = yield* projected(root)
  const result = yield* ReviewLocalCheckScope.read(value)
  if (!result.ok) throw new Error(result.reason)
  return result.configured
})

// Actual analysis conformance is Linux-only. Windows is initialization-qualified, but its read jail refuses.
if (process.platform === "linux") {
  it.live("pinned shfmt under read confinement proves clean, format difference, syntax error and base policy over head EditorConfig", () => Effect.gen(function* () {
    expectSpawn(import.meta.path)
    yield* ToolSafetySandboxRuntime.ready()
    const temp = yield* held()
    const ready = yield* ReviewLocalTools.prepare("shfmt").pipe(Effect.provideService(ReviewLocalTools.Root, path.join(temp.path, "tools")))
    if (!ready.ok) throw new Error(ready.reason)
    expect(ready.identity.version).toBe("3.14.1")
    const configured = yield* basePolicy(path.join(temp.path, "base"))
    for (const [name, text] of [["clean", "if true; then\n  echo ok\nfi\n"], ["format", "if true;then\necho ok\nfi\n"], ["syntax", "if ; then\n"]]) {
      const root = path.join(temp.path, name)
      yield* write(root, { "selected.sh": text, "unselected.sh": "if true;then\necho bad\nfi\n", ".editorconfig": "root=true\n[*]\nindent_style=space\nindent_size=8\n", [ReviewLocalCheckScope.POLICY_PATH]: JSON.stringify({ version: 1 }) })
      const projection = yield* projected(root)
      const selection = ReviewLocalCheckScope.select({ tool: "shfmt", scope: "files", files: ["selected.sh"], projection, configured })
      if (!selection.ok) throw new Error(selection.reason)
      expect(selection.policySha256).toBe(configured.sha256)
      const before = yield* Effect.promise(() => FileDigests.capture(root))
      const copy = yield* Effect.promise(() => FileDigests.capture(projection.root))
      const ran = yield* ReviewLocalReadProcess.run({ executable: ready.identity.executable, args: [...selection.flags, ...selection.files.map((file) => path.join(projection.root, file))], root: projection.root })
      if ("denied" in ran) throw new Error(`conformance missing: ${ran.denied}`)
      expect(ran.outcome.failure).toBeUndefined()
      expect(ran.outcome.timedOut || ran.outcome.overflow || ran.outcome.memoryExceeded).toBe(false)
      expect(ran.outcome.exitCode).toBe(name === "clean" ? 0 : 1)
      if (name === "clean") { expect(ran.outcome.stdout.bytes).toBe(0); expect(ran.outcome.stderr.bytes).toBe(0) }
      if (name === "format") { expect(ran.outcome.stdout.data.toString()).toContain("@@"); expect(ran.outcome.stderr.bytes).toBe(0) }
      if (name === "syntax") expect(ran.outcome.stderr.bytes).toBeGreaterThan(0)
      expect(yield* Effect.promise(() => FileDigests.capture(root))).toEqual(before)
      expect(yield* Effect.promise(() => FileDigests.capture(projection.root))).toEqual(copy)
      console.info("local conformance:", JSON.stringify({ tool: "shfmt", fixture: name, version: ready.identity.version, exitCode: ran.outcome.exitCode, stdout: ran.outcome.stdout.data.toString(), stderr: ran.outcome.stderr.data.toString() }))
    }
  }), 300_000)

  it.live("pinned cargo-machete under read confinement proves used, unused, zero-exit parse error and refusal of outside manifest influence", () => Effect.gen(function* () {
    expectSpawn(import.meta.path)
    yield* ToolSafetySandboxRuntime.ready()
    const temp = yield* held()
    const ready = yield* ReviewLocalTools.prepare("cargo-machete").pipe(Effect.provideService(ReviewLocalTools.Root, path.join(temp.path, "tools")))
    if (!ready.ok) throw new Error(ready.reason)
    expect(ready.identity.version).toBe("0.9.2")
    const configured = yield* basePolicy(path.join(temp.path, "base"))
    for (const name of ["used", "unused", "invalid", "ancestor", "escape"]) {
      const root = path.join(temp.path, name)
      yield* write(root, { "Cargo.toml": name === "invalid" ? "[broken TOML" : CARGO + (name === "escape" ? '[lib]\npath="../escape.rs"\n' : ""), "src/lib.rs": name === "used" ? "use anyhow::Result;\npub fn ok()->Result<()>{Ok(())}\n" : "pub fn ok(){}\n", ".gitignore": "Cargo.toml\nsrc\n", ".ignore": "Cargo.toml\nsrc\n" })
      const projection = yield* projected(root)
      if (name === "ancestor") yield* write(path.dirname(projection.root), { "Cargo.toml": `[workspace]\nmembers=[${JSON.stringify(path.basename(projection.root))}]\n[workspace.metadata.cargo-machete]\nignored=["anyhow"]\n` })
      if (name === "escape") yield* write(path.dirname(projection.root), { "escape.rs": "use anyhow::Result;\npub fn ok()->Result<()>{Ok(())}\n" })
      const selection = ReviewLocalCheckScope.select({ tool: "cargo-machete", scope: "diff", files: ["Cargo.toml"], projection, configured })
      if (!selection.ok) throw new Error(selection.reason)
      const before = yield* Effect.promise(() => FileDigests.capture(root))
      const copy = yield* Effect.promise(() => FileDigests.capture(projection.root))
      if (name === "unused") {
        const ignored = yield* ResearchProcess.run({ command: ready.identity.executable, args: ["."], cwd: projection.root, env: ReviewLocalTools.environment(projection.root), timeoutMs: 30_000, maxBytes: 256 * 1024 })
        expect(ignored.exitCode).toBe(0)
        expect(ignored.stdout.data.toString()).toContain("didn't find any unused dependencies")
      }
      if (name === "ancestor" || name === "escape") {
        // Host-owned synthetic positive control only: proves the outside fixture can alter this pinned CLI without the jail.
        const control = yield* ResearchProcess.run({ command: ready.identity.executable, args: [...selection.flags], cwd: projection.root, env: ReviewLocalTools.environment(projection.root), timeoutMs: 30_000, maxBytes: 256 * 1024 })
        expect(control.exitCode, control.stderr.data.toString()).toBe(0)
        expect(control.stderr.data.toString()).not.toContain("error when handling")
        expect(control.stdout.data.toString()).toContain("didn't find any unused dependencies")
      }
      const ran = yield* ReviewLocalReadProcess.run({ executable: ready.identity.executable, args: selection.flags, root: projection.root })
      if ("denied" in ran) throw new Error(`conformance missing: ${ran.denied}`)
      expect(ran.outcome.failure).toBeUndefined()
      expect(ran.outcome.timedOut || ran.outcome.overflow || ran.outcome.memoryExceeded).toBe(false)
      const stderr = ran.outcome.stderr.data.toString()
      if (name === "used") { expect(ran.outcome.exitCode).toBe(0); expect(stderr).not.toContain("error when handling"); expect(ran.outcome.stdout.data.toString()).toContain("didn't find any unused dependencies") }
      if (name === "unused" || name === "ancestor") { expect(ran.outcome.exitCode, stderr).toBe(1); expect(ran.outcome.stdout.data.toString()).toContain("anyhow") }
      if (name === "invalid") { expect(ran.outcome.exitCode).toBe(0); expect(stderr).toContain("error when handling") }
      if (name === "escape") expect(ran.outcome.exitCode !== 0 || /error|permission denied|no such file/i.test(stderr), stderr).toBe(true)
      expect(yield* Effect.promise(() => FileDigests.capture(root))).toEqual(before)
      expect(yield* Effect.promise(() => FileDigests.capture(projection.root))).toEqual(copy)
      console.info("local conformance:", JSON.stringify({ tool: "cargo-machete", fixture: name, version: ready.identity.version, exitCode: ran.outcome.exitCode, stdout: ran.outcome.stdout.data.toString(), stderr }))
    }
  }), 300_000)
}
