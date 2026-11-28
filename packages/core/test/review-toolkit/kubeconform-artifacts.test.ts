import { expect } from "bun:test"
import { createHash } from "node:crypto"
import { access, readFile, readdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { Effect, Exit, Schema } from "effect"
import { BackendToolkit } from "../../src/backend-toolkit"
import type { NativeEngine } from "../../src/backend-toolkit/manifest"
import kubeconform from "../../src/backend-toolkit/packs/kubeconform"
import { detect } from "../../src/backend-toolkit/target"
import { LayerNode } from "../../src/effect/layer-node"
import { AppProcess } from "../../src/process"
import { PinnedArtifact } from "../../src/pinned-artifact"
import { FileDigests } from "../fixture/file-digests"
import { expectSpawn } from "../fixture/omni-expect"
import { tmpdir } from "../fixture/tmpdir"
import { testEffect } from "../lib/effect"

const it = testEffect(LayerNode.compile(AppProcess.node))
const Digest = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/))
const Count = Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0), Schema.isLessThanOrEqualTo(Number.MAX_SAFE_INTEGER))
const Target = Schema.Literals(["darwin-arm64", "darwin-x64", "linux-arm64", "linux-x64", "win32-x64"])
const Sources = Schema.Struct({
  schema: Schema.Literal("kubeconform-preparation-sources-v1"),
  provenance: Schema.Struct({ retentionCommit: Schema.String, measurementSha256: Digest, noticeOriginsSha256: Digest, p0a2Run: Count, p0bRun: Count }),
  id: Schema.Literal("kubeconform"), version: Schema.Literal("0.8.0"), license: Schema.Literal("Apache-2.0"), upstream: Schema.Literal("yannh/kubeconform"),
  targets: Schema.Array(Schema.Struct({ target: Target,
    archive: Schema.Struct({ url: Schema.String, sha256: Digest, bytes: Count }),
    executable: Schema.Struct({ name: Schema.String, sha256: Digest, bytes: Count }),
    floor: Schema.Struct({ macos: Schema.optional(Schema.String) }),
  })),
  notices: Schema.Array(Schema.Struct({ component: Schema.String, version: Schema.String, filename: Schema.String, url: Schema.String,
    sha256: Digest, bytes: Count, gitBlob: Schema.String, artifact: Schema.String })),
})
const sources = Effect.promise(async () => Schema.decodeUnknownSync(Schema.fromJsonString(Sources), { onExcessProperty: "error" })(
  await Bun.file(new URL("../../../../docs/specs/lucy/kubeconform-preparation-sources.json", import.meta.url)).text(),
))
const sri = (hex: string): `sha256-${string}` => `sha256-${Buffer.from(hex, "hex").toString("base64")}`
const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex")
const pin: NativeEngine = kubeconform
const held = Effect.acquireRelease(Effect.promise(tmpdir), (value) => Effect.promise(() => value[Symbol.asyncDispose]()))
const configured = (root: string, manifest: NativeEngine = pin) => <A, E, R>(work: Effect.Effect<A, E, R>) =>
  work.pipe(Effect.provideService(BackendToolkit.Root, root), Effect.provideService(BackendToolkit.Manifest, { kubeconform: manifest }))

function host() {
  const target = detect()
  if (!("target" in target)) throw new Error(`P1 setup has no supported distribution: ${target.unsupported}`)
  return target.target
}

it.live("the existing pack preserves five observed archives and declares the independent executable and 19-origin notice identities", () => Effect.gen(function* () {
  const expected = yield* sources
  expect(expected.targets).toHaveLength(5)
  expect(expected.notices).toHaveLength(19)
  expect(expected.notices.reduce((bytes, notice) => bytes + notice.bytes, 0)).toBe(137_592)
  expect(new Set(expected.notices.map((notice) => notice.component)).size).toBe(10)
  expect(new Set(expected.notices.map((notice) => notice.sha256)).size).toBe(13)
  expect(expected.provenance.retentionCommit).toBe("2709944f940fddd5730d8fdb34dc263ae923d88f")
  expect(pin.id).toBe(expected.id)
  expect(pin.version).toBe(expected.version)
  expect(pin.license).toBe(expected.license)
  expect(pin.upstream).toBe(expected.upstream)
  expect(Object.keys(pin.targets).sort()).toEqual(expected.targets.map((entry) => entry.target).sort())
  for (const observed of expected.targets) {
    expect(pin.targets[observed.target]).toEqual({
      artifact: { url: observed.archive.url, integrity: sri(observed.archive.sha256),
        format: observed.target === "win32-x64" ? "zip" : "tar.gz",
        entries: [{ from: observed.executable.name, to: observed.executable.name, executable: true }] },
      executable: observed.executable.name,
    })
    expect(pin.floor?.[observed.target]).toEqual(observed.floor)
  }
  // These values are observed executable bytes, independent of the manifest under test.
  expect("binaryIntegrity" in pin ? pin.binaryIntegrity : undefined).toEqual(Object.fromEntries(expected.targets.map((entry) => [entry.target, sri(entry.executable.sha256)])))
  expect(pin.notices).toEqual(expected.notices.map((notice) => ({ url: notice.url, integrity: sri(notice.sha256), filename: notice.filename })))
}))

it.live("fresh actual distribution preparation atomically includes all independently observed notice bytes", () => Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const expected = yield* sources
  const target = host()
  const observed = expected.targets.find((entry) => entry.target === target)
  if (!observed) throw new Error("P1 expected host distribution missing")
  const temp = yield* held
  const first = yield* BackendToolkit.ensure("kubeconform").pipe(configured(temp.path))
  const directory = path.dirname(first.executable)
  const bytes = yield* Effect.promise(() => readFile(first.executable))
  expect(bytes.byteLength).toBe(observed.executable.bytes)
  expect(digest(bytes)).toBe(observed.executable.sha256)
  expect(yield* PinnedArtifact.installed(directory)).toBe(true)
  expect((yield* BackendToolkit.status("kubeconform").pipe(configured(temp.path)))[0]?.status).toBe("ready")
  // Existing native payload extraction must succeed before the new notice assertion.
  const noticesExist = yield* Effect.promise(() => access(path.join(directory, "notices")).then(() => true, () => false))
  expect(noticesExist).toBe(true)
  if (!noticesExist) throw new Error("P1 expected observed notices absent")
  expect((yield* Effect.promise(() => readdir(path.join(directory, "notices")))).sort()).toEqual(expected.notices.map((entry) => entry.filename).sort())
  for (const notice of expected.notices) {
    const actual = yield* Effect.promise(() => readFile(path.join(directory, "notices", notice.filename)))
    expect(actual.byteLength).toBe(notice.bytes)
    expect(digest(actual)).toBe(notice.sha256)
  }
  const before = yield* Effect.promise(() => FileDigests.capture(temp.path))
  expect(yield* BackendToolkit.ensure("kubeconform").pipe(configured(temp.path))).toEqual(first)
  expect(yield* Effect.promise(() => FileDigests.capture(temp.path))).toEqual(before)
}), 600_000)

it.live("an actual old completed no-notice install stays byte-identical and fails closed under the current declaration", () => Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const expected = yield* sources
  const observed = expected.targets.find((entry) => entry.target === host())
  if (!observed) throw new Error("P1 expected host distribution missing")
  const temp = yield* held
  const legacy: NativeEngine = { ...pin, notices: undefined }
  const installed = yield* BackendToolkit.ensure("kubeconform").pipe(configured(temp.path, legacy))
  const directory = path.dirname(installed.executable)
  expect(digest(yield* Effect.promise(() => readFile(installed.executable)))).toBe(observed.executable.sha256)
  expect(yield* PinnedArtifact.installed(directory)).toBe(true)
  expect(yield* Effect.promise(() => access(path.join(directory, "notices")).then(() => true, () => false))).toBe(false)
  const before = yield* Effect.promise(() => FileDigests.capture(temp.path))
  const states = yield* BackendToolkit.status("kubeconform").pipe(configured(temp.path))
  const result = yield* BackendToolkit.ensure("kubeconform").pipe(configured(temp.path), Effect.exit)
  expect(yield* Effect.promise(() => FileDigests.capture(temp.path))).toEqual(before)
  expect(states[0]?.status).toBe("absent")
  expect(Exit.isFailure(result)).toBe(true)
  if (!Exit.isFailure(result)) throw new Error("P1 old completed cache must not be silently accepted")
  expect(result.cause.reasons).toHaveLength(1)
  for (const reason of result.cause.reasons) {
    if (reason._tag !== "Fail" || !(reason.error instanceof BackendToolkit.NotReady)) throw new Error("P1 expected typed old-cache refusal")
    expect(reason.error.reason).toBe("toolkit-not-ready:failed:kubeconform:notice-missing")
  }
  expect(yield* PinnedArtifact.installed(directory)).toBe(true)
}), 600_000)

it.live("a real installed notice mutation makes the observed distribution unavailable without repairing it", () => Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const expected = yield* sources
  const temp = yield* held
  // The existing generic installer is a positive control independent of the new production notice declaration.
  const complete: NativeEngine = { ...pin, notices: expected.notices.map((notice) => ({
    url: notice.url, integrity: sri(notice.sha256), filename: notice.filename,
  })) }
  const installed = yield* BackendToolkit.ensure("kubeconform").pipe(configured(temp.path, complete))
  const directory = path.dirname(installed.executable)
  const notice = expected.notices.find((entry) => entry.component === "github.com/hashicorp/go-cleanhttp")
  if (!notice) throw new Error("P1 expected MPL origin missing")
  const filename = path.join(directory, "notices", notice.filename)
  expect(digest(yield* Effect.promise(() => readFile(filename)))).toBe(notice.sha256)
  yield* Effect.promise(() => writeFile(filename, "P1-CHANGED-NOTICE\n"))
  const before = yield* Effect.promise(() => FileDigests.capture(temp.path))
  const current = yield* BackendToolkit.status("kubeconform").pipe(configured(temp.path))
  const result = yield* BackendToolkit.ensure("kubeconform").pipe(configured(temp.path), Effect.exit)
  expect(yield* Effect.promise(() => FileDigests.capture(temp.path))).toEqual(before)
  expect(current[0]?.status).toBe("absent")
  expect(Exit.isFailure(result)).toBe(true)
  if (!Exit.isFailure(result)) throw new Error("P1 modified notice must not remain ready")
  for (const reason of result.cause.reasons) {
    if (reason._tag !== "Fail" || !(reason.error instanceof BackendToolkit.NotReady)) throw new Error("P1 expected typed modified-notice refusal")
    expect(reason.error.reason).toBe("toolkit-not-ready:failed:kubeconform:notice-modified")
  }
}), 600_000)
