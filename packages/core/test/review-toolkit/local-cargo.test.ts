import { expect } from "bun:test"
import path from "path"
import { mkdir, readdir, writeFile } from "fs/promises"
import { Effect } from "effect"
import { LayerNode } from "../../src/effect/layer-node"
import { FSUtil } from "../../src/fs-util"
import { AppProcess } from "../../src/process"
import { ToolSafetySandboxRuntime } from "../../src/tool-safety-sandbox-runtime"
import { ReviewLocalCargo } from "../../src/review-toolkit/local-cargo"
import { ReviewLocalCheckScope } from "../../src/review-toolkit/local-check-scope"
import { ReviewLocalReadProcess } from "../../src/review-toolkit/local-read-process"
import { ReviewLocalTools } from "../../src/review-toolkit/local-tools"
import { ReviewScanProjection } from "../../src/review-toolkit/scan-projection"
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
const projected = (root: string) => ReviewScanProjection.create({ snapshot: snapshot(root) }).pipe(Effect.map((result) => {
  if (!result.ok) throw new Error(result.reason)
  return result.projection
}))
const configured = (root: string, policy = POLICY) => Effect.gen(function* () {
  yield* write(root, { [ReviewLocalCheckScope.POLICY_PATH]: policy })
  const projection = yield* projected(root)
  const result = yield* ReviewLocalCheckScope.read(projection)
  if (!result.ok) throw new Error(result.reason)
  return result.configured
})
const input = (projection: ReviewScanProjection.Projection, config: ReviewLocalCheckScope.Configured, scope: "diff" | "files" = "diff", files: readonly string[] = ["Cargo.toml"]): ReviewLocalCheckTypes.Input => ({
  projection,
  configured: config,
  baseProjectionDigest: config.projectionDigest,
  scope,
  files,
})

it.live.skipIf(process.platform !== "linux")("pinned cargo-machete analyzes real projected manifests and confines path influence", () => Effect.gen(function* () {
  expectSpawn(import.meta.path)
  yield* ToolSafetySandboxRuntime.ready()
  const temp = yield* held()
  const toolRoot = path.join(temp.path, "tools")
  const ready = yield* ReviewLocalTools.prepare("cargo-machete").pipe(Effect.provideService(ReviewLocalTools.Root, toolRoot))
  if (!ready.ok) throw new Error(ready.reason)
  expect(process.arch).toBe("x64")
  expect(ready.identity.target).toBe("linux-x64")
  expect(ready.identity.version).toBe("0.9.2")
  const config = yield* configured(path.join(temp.path, "base"))
  const run = (
    request: ReviewLocalCheckTypes.Input,
    execute: typeof ReviewLocalReadProcess.run = ReviewLocalReadProcess.run,
  ) => ReviewLocalCargo.run(request, (processRequest) => Effect.gen(function* () {
    expect(processRequest.args).toEqual(["--no-ignore", "."])
    expect(processRequest.root).toBe(request.projection.root)
    expect(processRequest.executable).toBe(ready.identity.executable)
    return yield* execute(processRequest)
  })).pipe(Effect.provideService(ReviewLocalTools.Root, toolRoot))

  for (const name of ["used", "unused"]) {
    const root = path.join(temp.path, name)
    yield* write(root, {
      "Cargo.toml": '[package]\nname="fixture"\nversion="0.1.0"\nedition="2021"\n[dependencies]\nanyhow="1"\n',
      "src/lib.rs": name === "used" ? "use anyhow::Result;\npub fn ok()->Result<()>{Ok(())}\n" : "pub fn ok(){}\n",
    })
    const projection = yield* projected(root)
    const before = yield* Effect.promise(() => FileDigests.capture(root))
    const copy = yield* Effect.promise(() => FileDigests.capture(projection.root))
    const result = yield* run(input(projection, config))
    expect(result.identity).toEqual(ready.identity)
    expect(result.selection).toBeDefined()
    expect(result.outcome?.failure).toBeUndefined()
    expect(result.outcome?.timedOut || result.outcome?.overflow || result.outcome?.memoryExceeded).toBe(false)
    if (name === "used") {
      expect(result.status).toBe("pass")
      expect(result.outcome?.stdout.data.toString()).toBe("cargo-machete didn't find any unused dependencies in this directory. Good job!\n")
    }
    if (name === "unused") {
      expect(result.status).toBe("fail")
      expect(result.outcome?.stdout.data.toString()).toContain("anyhow")
    }
    expect(yield* Effect.promise(() => FileDigests.capture(root))).toEqual(before)
    expect(yield* Effect.promise(() => FileDigests.capture(projection.root))).toEqual(copy)
  }

  const workspace = path.join(temp.path, "inside-shared")
  yield* write(workspace, {
    "Cargo.toml": '[workspace]\nmembers=["crates/a", "shared"]\n',
    "crates/a/Cargo.toml": '[package]\nname="a"\nversion="0.1.0"\nedition="2021"\n[dependencies]\nshared={path="../../shared"}\n',
    "crates/a/src/lib.rs": "pub fn call(){shared::call()}\n",
    "shared/Cargo.toml": '[package]\nname="shared"\nversion="0.1.0"\nedition="2021"\n[dependencies]\nanyhow="1"\n',
    "shared/src/lib.rs": "pub fn call(){}\n",
  })
  const workspaceProjection = yield* projected(workspace)
  const inside = yield* run(input(workspaceProjection, config))
  expect(inside.identity).toEqual(ready.identity)
  expect(inside.status).toBe("fail")
  expect(inside.outcome?.stdout.data.toString()).toContain("anyhow")
  expect(inside.selection).toBeDefined()

  const denied = yield* run(input(workspaceProjection, config), () => Effect.succeed({ denied: "read-sandbox-unavailable" }))
  expect(denied.status).toBe("not-run")
  expect(denied.reason).toBe("read-sandbox-unavailable")
  expect(denied.identity).toEqual(ready.identity)
  expect(denied.selection).toMatchObject({ flags: ["--no-ignore", "."], coverage: "workspace", projectionDigest: workspaceProjection.digest, policySha256: config.sha256 })
  expect(denied.outcome).toBeUndefined()

  for (const [name, manifest] of [
    ["malformed", "[package\n"],
    ["outside", '[package]\nname="outside"\nversion="0.1.0"\nedition="2021"\n[lib]\npath="../outside.rs"\n'],
  ]) {
    const root = path.join(temp.path, name)
    if (name === "outside") yield* write(temp.path, { "outside.rs": "pub fn outside(){}\n" })
    yield* write(root, { "Cargo.toml": manifest, "src/lib.rs": "pub fn ok(){}\n" })
    const projection = yield* projected(root)
    const rejected = yield* run(input(projection, config), () => Effect.die(new Error("unexpected native execution")))
    expect(rejected.identity).toEqual(ready.identity)
    expect(rejected.selection).toMatchObject({ flags: ["--no-ignore", "."], coverage: "workspace", projectionDigest: projection.digest, policySha256: config.sha256 })
    expect(rejected.status).toBe(name === "malformed" ? "acquisition-error" : "not-run")
    expect(rejected.reason).toBe(name === "malformed" ? "cargo-manifest-invalid" : "cargo-path-outside")
    expect(rejected.outcome).toBeUndefined()
  }
}), 300_000)

it.live.skipIf(process.platform !== "linux")("Cargo prerequisite refusals never execute the native tool", () => Effect.gen(function* () {
  const temp = yield* held()
  const root = path.join(temp.path, "project")
  yield* write(root, { "Cargo.toml": '[package]\nname="fixture"\nversion="0.1.0"\nedition="2021"\n', "src/lib.rs": "pub fn ok(){}\n" })
  const projection = yield* projected(root)
  const enabled = yield* configured(path.join(temp.path, "enabled-base"))
  const disabled = yield* configured(path.join(temp.path, "disabled-base"), JSON.stringify({ version: 1, cargoMachete: { enabled: false } }))
  const disabledInput = input(projection, disabled)
  expect(disabledInput.baseProjectionDigest).toBe(disabled.projectionDigest)
  const noExecution = () => Effect.die(new Error("unexpected native execution"))
  const cases = [
    ["policy mismatch", input(projection, enabled, "diff", [] ) satisfies ReviewLocalCheckTypes.Input, { baseProjectionDigest: "different-base-digest" }, "policy-projection-mismatch"],
    ["disabled policy", disabledInput, {}, "policy-disabled"],
    ["files scope", input(projection, enabled, "files", ["Cargo.toml"]), {}, "scope-workspace-required"],
    ["no Rust manifest or lock change", input(projection, enabled, "diff", []), {}, "scope-no-input"],
  ] as const
  for (const [name, request, override, reason] of cases) {
    const result = yield* ReviewLocalCargo.run({ ...request, ...override }, noExecution)
    expect(result.status, name).toBe("not-run")
    if (reason) expect(result.reason, name).toContain(reason)
    expect(result.outcome, name).toBeUndefined()
  }
}), 300_000)

it.live.skipIf(process.platform !== "linux")("an unprepared empty tool root reports missing identity without acquiring bytes", () => Effect.gen(function* () {
  const temp = yield* held()
  const root = path.join(temp.path, "project")
  const toolRoot = path.join(temp.path, "empty-tools")
  yield* write(root, { "Cargo.toml": '[package]\nname="fixture"\nversion="0.1.0"\nedition="2021"\n' })
  yield* Effect.promise(() => mkdir(toolRoot, { recursive: true }))
  const projection = yield* projected(root)
  const config = yield* configured(path.join(temp.path, "base"))
  const before = yield* Effect.promise(() => readdir(toolRoot, { recursive: true }))
  const result = yield* ReviewLocalCargo.run(input(projection, config)).pipe(Effect.provideService(ReviewLocalTools.Root, toolRoot))
  expect(result.status).toBe("not-run")
  expect(result.identity).toBeUndefined()
  expect(result.reason).toBe("host-tool-unavailable")
  expect(yield* Effect.promise(() => readdir(toolRoot, { recursive: true }))).toEqual(before)
}), 300_000)

it.live.skipIf(process.platform !== "win32")("Windows explicitly refuses Cargo before process execution", () => Effect.gen(function* () {
  const temp = yield* held()
  const root = path.join(temp.path, "project")
  yield* write(root, { "Cargo.toml": '[package]\nname="fixture"\nversion="0.1.0"\nedition="2021"\n' })
  const projection = yield* projected(root)
  const config = yield* configured(path.join(temp.path, "base"))
  const request: ReviewLocalCheckTypes.Input = input(projection, config)
  const result = yield* ReviewLocalCargo.run(request, () => Effect.die(new Error("unexpected native execution")))
  expect(result).toMatchObject({ status: "not-run", reason: "read-sandbox-unsupported-host" })
  expect(result.outcome).toBeUndefined()
}), 300_000)
