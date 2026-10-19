import { expect } from "bun:test"
import path from "node:path"
import { realpath, symlink } from "node:fs/promises"
import { Effect } from "effect"
import { CaseCapabilities } from "../../script/continuity-bench/case-capabilities"
import { replay } from "../../script/continuity-bench/complete"
import { it } from "../lib/effect"
import { TestInstance } from "../fixture/fixture"
import { messages, model } from "./memory-fixture"

const fixture = Effect.gen(function* () {
  const instance = yield* TestInstance
  const root = yield* Effect.promise(() => realpath(instance.directory))
  const history = messages(["user", "assistant"])
  const write = (name: string, value: unknown) => Effect.promise(async () => {
    const text = JSON.stringify(value)
    const file = path.join(root, name)
    await Bun.write(file, text)
    return { path: file, sha256: CaseCapabilities.hash(text) }
  })
  const source = yield* write("source.json", history)
  const horizon = yield* write("horizon.json", { boundaryMessageID: history[1].info.id })
  const selected = yield* write("model.json", model)
  const descriptor = yield* write("descriptor.json", { caseID: "fixture", sourceHistoryPath: source.path, sourceHistorySHA256: source.sha256,
    horizonPath: horizon.path, horizonSHA256: horizon.sha256, model: { providerID: model.providerID, modelID: model.id } })
  const approved = { descriptor, source, horizon, model: selected, providerID: model.providerID, modelID: model.id, boundaryMessageID: history[1].info.id }
  return { root, write, approved, history, manifest: yield* write("capabilities.json", { version: 1, cases: { fixture: approved } }) }
})

it.instance("approved descriptor/path/hash/model/horizon loads; dry success requires actual captured transport request", () => Effect.gen(function* () {
  const f = yield* fixture
  const loaded = yield* Effect.promise(() => CaseCapabilities.load({ manifest: f.manifest, caseID: "fixture" }))
  const dry = yield* replay(loaded)
  expect(dry.requests).toHaveLength(1)
  expect(dry.result).toEqual({ status: "dry-request-captured" })
  const empty = yield* replay({ messages: [], model }).pipe(Effect.exit)
  expect(empty._tag).toBe("Failure")
  const unapproved = yield* Effect.promise(() => CaseCapabilities.load({ manifest: f.manifest, caseID: "gold-renamed" })).pipe(Effect.exit)
  expect(unapproved._tag).toBe("Failure")
}))

for (const member of ["source", "horizon", "model"] as const) it.instance(`renamed or wrong ${member} capability is rejected before foreign source bytes are read`, () => Effect.gen(function* () {
  const f = yield* fixture
  const foreign = yield* f.write("renamed-private.json", "PRIVATE_GOLD_READ_POISON")
  const approved = member === "model" ? { ...f.approved, model: foreign, modelID: "wrong-model" } : { ...f.approved, [member]: foreign }
  const manifest = yield* f.write("wrong-capabilities.json", { version: 1, cases: { fixture: approved } })
  const result = yield* Effect.tryPromise(() => CaseCapabilities.load({ manifest, caseID: "fixture" })).pipe(Effect.exit)
  expect(result._tag).toBe("Failure")
  if (result._tag === "Failure") expect(String(result.cause)).toContain("complete-replay-descriptor-mismatch")
}))

it.instance("gold symlink and hash mutation fail closed before JSON payload parsing", () => Effect.gen(function* () {
  const f = yield* fixture
  const gold = yield* f.write("private-gold.json", "PRIVATE_GOLD_READ_POISON")
  const link = path.join(f.root, "capability-link.json")
  yield* Effect.promise(() => symlink(gold.path, link))
  const linked = yield* Effect.tryPromise(() => CaseCapabilities.read({ path: link, sha256: gold.sha256 })).pipe(Effect.exit)
  expect(linked._tag).toBe("Failure")
  if (linked._tag === "Failure") expect(String(linked.cause)).toContain("complete-replay-capability-path")
  const altered = yield* Effect.tryPromise(() => CaseCapabilities.read({ ...f.manifest, sha256: "0".repeat(64) })).pipe(Effect.exit)
  expect(altered._tag).toBe("Failure")
}))

it.instance("CLI rejects fake windows, missing actual model capabilities and unapproved path options before reads", () => Effect.gen(function* () {
  const f = yield* fixture
  for (const args of [
    ["--mode", "dry", "--window", "200000", "--reserve", "32000", "--output", f.root],
    ["--mode", "dry", "--messages", path.join(f.root, "renamed-gold.json"), "--metadata", "wrong-metadata", "--model", "wrong-model", "--output", f.root],
  ]) {
    const process = Bun.spawn(["bun", "script/continuity-bench/complete.ts", ...args], { cwd: path.resolve(import.meta.dir, "../.."), stdout: "pipe", stderr: "pipe" })
    const stderr = yield* Effect.promise(() => new Response(process.stderr).text())
    expect(yield* Effect.promise(() => process.exited)).toBe(1)
    expect(stderr).toContain("complete-replay-capabilities-model-required")
    expect(stderr).not.toContain("ENOENT")
  }
}), 120_000)
