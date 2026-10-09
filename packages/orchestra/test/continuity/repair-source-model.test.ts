import { expect } from "bun:test"
import path from "node:path"
import { chmod, lstat, mkdir, realpath, symlink } from "node:fs/promises"
import { Effect } from "effect"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { replay, replayProvider } from "../../script/continuity-bench/complete"
import { prepare } from "../../script/continuity-bench/prepare-capabilities"
import { CaseCapabilities } from "../../script/continuity-bench/case-capabilities"
import { TestInstance } from "../fixture/fixture"
import { it } from "../lib/effect"
import { messages, model } from "./memory-fixture"

it.live("replay provider rejects foreign provider or model instead of substituting approved model", Effect.gen(function* () {
  const provider = replayProvider(model)
  expect(yield* provider.getModel(model.providerID, model.id)).toEqual(model)
  const wrongProvider = yield* provider.getModel(ProviderV2.ID.make("foreign-provider"), model.id).pipe(Effect.exit)
  const wrongModel = yield* provider.getModel(model.providerID, ModelV2.ID.make("foreign-model")).pipe(Effect.exit)
  expect(wrongProvider._tag).toBe("Failure")
  expect(wrongModel._tag).toBe("Failure")
}))

for (const field of ["model", "provider"] as const) it.live(`earlier horizon rejects later ${field} capability; matching horizon captures only earlier source`, Effect.gen(function* () {
  const history = messages(["user", "assistant", "user", "assistant"])
  const later = { ...model, id: field === "model" ? ModelV2.ID.make("later-model") : model.id,
    providerID: field === "provider" ? ProviderV2.ID.make("later-provider") : model.providerID }
  const second = history[2]
  if (second.info.role !== "user") throw new Error("fixture-user-required")
  second.info.model = { providerID: later.providerID, modelID: later.id }
  const wrong = yield* replay({ messages: history, boundary: history[1].info.id, model: later }).pipe(Effect.exit)
  expect(wrong._tag).toBe("Failure")
  if (wrong._tag === "Failure") expect(String(wrong.cause)).toContain("complete-replay-source-model-mismatch")
  const first = yield* replay({ messages: history, boundary: history[1].info.id, model })
  expect(first.result).toEqual({ status: "dry-request-captured" })
  expect(first.requests).toHaveLength(1)
  expect(first.requests[0].model.id).toBe(model.id)
  expect(first.snapshot.sources).toEqual(history.slice(0, 2).map((message) => message.info.id))
  expect(JSON.stringify(first.requests)).not.toContain("turn-2")
  const last = yield* replay({ messages: history, boundary: history[3].info.id, model: later })
  expect(last.result).toEqual({ status: "dry-request-captured" })
  expect(last.requests[0].model).toEqual(later)
}))

const fixture = Effect.gen(function* () {
  const instance = yield* TestInstance
  const root = yield* Effect.promise(() => realpath(instance.directory))
  const write = (name: string, value: unknown) => Effect.promise(async () => {
    const text = JSON.stringify(value)
    const file = path.join(root, name)
    await Bun.write(file, text)
    return { path: file, sha256: CaseCapabilities.hash(text) }
  })
  const history = messages(["user", "assistant"])
  const source = yield* write("source.json", history)
  const horizon = yield* write("horizon.json", { boundaryMessageID: history[1].info.id })
  const catalog = yield* write("catalog.json", { [model.providerID]: { id: model.providerID, name: "Offline fixture", env: [], npm: model.api.npm,
    models: { [model.id]: { id: model.id, name: model.name, release_date: model.release_date, attachment: false, reasoning: false,
      temperature: true, tool_call: true, limit: model.limit } } } })
  const descriptor = (caseID: string) => write("descriptor.json", { caseID, sourceHistoryPath: source.path, sourceHistorySHA256: source.sha256,
    horizonPath: horizon.path, horizonSHA256: horizon.sha256, model: { providerID: model.providerID, modelID: model.id } })
  return { root, write, catalog, descriptor, output: path.join(root, "output") }
})

it.instance("capability preparation rejects ../case filename before writes; safe case creates private contained outputs", () => Effect.gen(function* () {
  const f = yield* fixture
  const bad = yield* f.descriptor("../case")
  const rejected = yield* Effect.tryPromise(() => prepare({ catalog: f.catalog, descriptors: [bad], output: f.output })).pipe(Effect.exit)
  expect(rejected._tag).toBe("Failure")
  if (rejected._tag === "Failure") expect(String(rejected.cause)).toContain("complete-replay-case-filename")
  expect(yield* Effect.promise(() => Bun.file(path.join(f.root, "case-model.json")).exists())).toBe(false)
  const safe = yield* f.descriptor("safe-case_1")
  const result = yield* Effect.promise(() => prepare({ catalog: f.catalog, descriptors: [safe], output: f.output }))
  expect(result.providerCalls).toBe(0)
  expect(result.capabilities).toBe(path.join(f.output, "capabilities.json"))
  const manifest = yield* Effect.promise(() => CaseCapabilities.read({ path: result.capabilities, sha256: result.sha256 }))
  expect(manifest).toMatchObject({ cases: { "safe-case_1": { model: { path: path.join(f.output, "safe-case_1-model.json") } } } })
  expect((yield* Effect.promise(() => lstat(f.output))).mode & 0o777).toBe(0o700)
  expect((yield* Effect.promise(() => lstat(result.capabilities))).mode & 0o777).toBe(0o600)
  expect((yield* Effect.promise(() => lstat(path.join(f.output, "safe-case_1-model.json")))).mode & 0o777).toBe(0o600)
}))

for (const target of ["symlink", "directory", "public-file", "private-file", "manifest"] as const)
  it.instance(`capability preparation refuses existing ${target} output without overwriting`, () => Effect.gen(function* () {
    const f = yield* fixture
    const descriptor = yield* f.descriptor("safe")
    yield* Effect.promise(() => mkdir(f.output, { mode: 0o700 }))
    const file = path.join(f.output, target === "manifest" ? "capabilities.json" : "safe-model.json")
    if (target === "symlink") {
      const poison = yield* f.write("private-poison.json", "PRIVATE_POISON")
      yield* Effect.promise(() => symlink(poison.path, file))
    }
    if (target === "directory") yield* Effect.promise(() => mkdir(file, { mode: 0o700 }))
    if (["public-file", "private-file", "manifest"].includes(target)) {
      yield* Effect.promise(() => Bun.write(file, "DO_NOT_OVERWRITE"))
      yield* Effect.promise(() => chmod(file, target === "public-file" ? 0o644 : 0o600))
    }
    const result = yield* Effect.tryPromise(() => prepare({ catalog: f.catalog, descriptors: [descriptor], output: f.output })).pipe(Effect.exit)
    expect(result._tag).toBe("Failure")
    if (target !== "directory") expect(yield* Effect.promise(() => Bun.file(file).text())).toContain(target === "symlink" ? "PRIVATE_POISON" : "DO_NOT_OVERWRITE")
    if (target === "directory") expect((yield* Effect.promise(() => lstat(file))).isDirectory()).toBe(true)
  }))

for (const target of ["symlink", "public-directory", "file"] as const)
  it.instance(`capability preparation refuses ${target} output root`, () => Effect.gen(function* () {
    const f = yield* fixture
    const descriptor = yield* f.descriptor("safe")
    if (target === "symlink") yield* Effect.promise(() => symlink(f.root, f.output))
    if (target === "public-directory") {
      yield* Effect.promise(() => mkdir(f.output))
      yield* Effect.promise(() => chmod(f.output, 0o755))
    }
    if (target === "file") yield* Effect.promise(() => Bun.write(f.output, "not-directory"))
    const result = yield* Effect.tryPromise(() => prepare({ catalog: f.catalog, descriptors: [descriptor], output: f.output })).pipe(Effect.exit)
    expect(result._tag).toBe("Failure")
    expect(yield* Effect.promise(() => Bun.file(path.join(f.root, "safe-model.json")).exists())).toBe(false)
  }))
