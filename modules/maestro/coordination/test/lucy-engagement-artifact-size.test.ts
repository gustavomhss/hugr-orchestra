import { expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { Effect } from "effect"
import { BackendToolkit } from "@orchestra/core/backend-toolkit"
import { expectSpawn } from "@orchestra/core/test/fixture/omni-expect"
import { reply, run, sourcePath, sourceText, text, type Ctx } from "./fixture/lucy-engagement"
import { cache, canonical, decoded, nativeCode, readAll, receipt, request } from "./fixture/lucy-engagement-artifacts"
import { commit, failed, retained, steps } from "./fixture/lucy-engagement-artifact-limits"
import { knownVariant, variantAdapter } from "./fixture/lucy-engagement-variant-adapter"

const MiB = 1024 * 1024

test("a small real locate succeeds before a two-file snapshot crosses the16MiB producer-body bound", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(run((root) => Effect.gen(function* () {
    const padding = "x".repeat(9 * MiB)
    const files = { "src/body-small.txt": "SMALL_BODY_CONTROL\nsmall\n",
      "src/body-a.txt": `LARGE_BODY_CONTROL\n${padding}`, "src/body-b.txt": `LARGE_BODY_CONTROL\n${padding}` }
    const input = { ...request("single-body-size"), revision: yield* commit(root, files) }
    let host: Ctx | undefined
    let positive = false
    const provider = steps([
      [{ id: "small_body", name: "code_locate", input: { terms: ["SMALL_BODY_CONTROL"], paths: ["src/body-small.txt"] } }],
      [{ id: "large_body", name: "code_locate", input: { terms: ["LARGE_BODY_CONTROL"], paths: ["src/body-a.txt", "src/body-b.txt"], limit: 2 } }],
    ], (index, sessionID) => index !== 1 ? Effect.void : Effect.gen(function* () {
      if (!host) return yield* Effect.die("native host not open")
      const native = yield* nativeCode(host, sessionID)
      expect(native).toHaveLength(1)
      expect(native[0]).toMatchObject({ name: "code_locate", status: "completed" })
      expect(native[0].body).toContain("SMALL_BODY_CONTROL")
      const bodies = yield* retained(host, input)
      expect(bodies).toHaveLength(2)
      expect(bodies.every((body) => body.bytes.length < MiB)).toBe(true)
      expect(bodies.some((body) => body.body.snapshot?.includes("SMALL_BODY_CONTROL"))).toBe(true)
      for (const file of ["src/body-a.txt", "src/body-b.txt"]) {
        const bytes = (yield* Effect.promise(() => fs.stat(path.join(root.directory, file)))).size
        expect(bytes).toBeGreaterThan(9 * MiB)
        expect(bytes).toBeLessThan(16 * MiB)
      }
      expect(Buffer.byteLength(padding) * 2).toBeGreaterThan(16 * MiB)
      positive = true
    }).pipe(Effect.orDie))
    yield* root.open((current) => Effect.gen(function* () {
      host = current
      yield* Effect.addFinalizer(() => Effect.promise(() => fs.rm(cache(current, input), { recursive: true, force: true })))
      const output = yield* current.invoke(input)
      expect(positive).toBe(true)
      // No reader access precedes this assertion: baseline must finish the real over-bound producer first.
      yield* failed(current, root, input, output)
    }), { stream: provider.stream }).pipe(
      Effect.provideService(BackendToolkit.Root, path.join(root.global.cache, "body-empty-toolkit")),
    )
  })))
}, 600_000)

test("three real locate captures fit individually before a fourth crosses64MiB of distinct required bodies", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(run((root) => Effect.gen(function* () {
    const padding = "x".repeat(9 * MiB)
    const paths = Array.from({ length: 4 }, (_, index) => `src/aggregate-${index}.txt`)
    const input = { ...request("aggregate-body-size"), revision: yield* commit(root,
      Object.fromEntries(paths.map((file, index) => [file, `AGGREGATE_${index}\n${padding}`]))) }
    let host: Ctx | undefined
    let positive = false
    const provider = steps(paths.map((file, index) => [{ id: `aggregate_${index}`, name: "code_locate",
      input: { terms: [`AGGREGATE_${index}`], paths: [file] } }]), (index, sessionID) => index !== 3 ? Effect.void : Effect.gen(function* () {
      if (!host) return yield* Effect.die("native host not open")
      const native = yield* nativeCode(host, sessionID)
      expect(native).toHaveLength(3)
      expect(native.every((call) => call.status === "completed")).toBe(true)
      const bodies = yield* retained(host, input)
      expect(bodies).toHaveLength(6)
      expect(new Set(bodies.map((body) => body.uri)).size).toBe(6)
      expect(bodies.every((body) => body.bytes.length > 9 * MiB && body.bytes.length < 16 * MiB)).toBe(true)
      expect(bodies.filter((body) => body.body.result === undefined)).toHaveLength(3)
      expect(bodies.filter((body) => body.body.result !== undefined)).toHaveLength(3)
      const bytes = bodies.reduce((sum, body) => sum + body.bytes.length, 0)
      expect(bytes).toBeGreaterThan(54 * MiB)
      expect(bytes).toBeLessThan(64 * MiB)
      // Another selected file produces a distinct snapshot and result, each retaining its9MiB original line.
      expect(bytes + 18 * MiB).toBeGreaterThan(64 * MiB)
      expect(new Set(bodies.map((body) => body.body.source.commit))).toEqual(new Set([input.revision]))
      positive = true
    }).pipe(Effect.orDie))
    yield* root.open((current) => Effect.gen(function* () {
      host = current
      yield* Effect.addFinalizer(() => Effect.promise(() => fs.rm(cache(current, input), { recursive: true, force: true })))
      const output = yield* current.invoke(input)
      expect(positive).toBe(true)
      yield* failed(current, root, input, output)
    }), { stream: provider.stream }).pipe(
      Effect.provideService(BackendToolkit.Root, path.join(root.global.cache, "aggregate-empty-toolkit")),
    )
  })))
}, 600_000)

test("22 real searches with valid large negative globs cannot seal a receipt beyond1MiB", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(run((root) => Effect.gen(function* () {
    const input = request("canonical-receipt-size")
    const query = { pattern: "sharedValue", paths: ["**/*",
      ...Array.from({ length: 4 }, (_, index) => `!**/${"界".repeat(4000)}-${index}.absent`)] }
    expect(query.paths).toHaveLength(5)
    expect(query.paths.every((glob) => glob.length < 8192)).toBe(true)
    expect(JSON.stringify(query).length).toBeLessThan(20_000)
    expect(Buffer.byteLength(canonical(query)) * 22).toBeGreaterThan(MiB)
    const batch = Array.from({ length: 22 }, (_, index) => ({ id: `receipt_${index}`, name: "code_search", input: query }))
    let host: Ctx | undefined
    let positive = false
    const provider = steps([batch.slice(0, 1), batch.slice(1)], (index, sessionID) => index !== 1 ? Effect.void : Effect.gen(function* () {
      if (!host) return yield* Effect.die("native host not open")
      const native = yield* nativeCode(host, sessionID)
      expect(native).toHaveLength(1)
      expect(native[0]).toMatchObject({ name: "code_search", status: "completed" })
      expect(native[0].body).toContain("ENGAGEMENT-IN-SCOPE")
      expect(native[0].body).not.toContain("ENGAGEMENT-OUTSIDE")
      const bodies = yield* retained(host, input)
      expect(bodies).toHaveLength(1)
      expect(bodies[0].bytes.length).toBeLessThan(MiB)
      positive = true
    }).pipe(Effect.orDie))
    const variants = variantAdapter(provider.stream)
    yield* root.open((current) => Effect.gen(function* () {
      host = current
      yield* Effect.addFinalizer(() => Effect.promise(() => fs.rm(cache(current, input), { recursive: true, force: true })))
      const output = yield* current.invoke(input)
      expect(positive, "ripgrep must accept the actual CJK glob argv and return the known source first").toBe(true)
      expect(provider.sessions.size).toBe(1)
      const native = yield* nativeCode(current, [...provider.sessions][0])
      expect(native).toHaveLength(22)
      expect(native.every((call) => call.name === "code_search")).toBe(true)
      expect(native.every((call) => call.status === "completed")).toBe(true)
      expect(variants.proposals).toHaveLength(1)
      expect(variants.verifiers).toEqual([])
      const added = yield* nativeCode(current, variants.proposals[0].sessionID)
      expect(added).toHaveLength(1)
      expect(added[0]).toMatchObject({ name: "code_search", status: "completed" })
      expect(added[0].providerExecuted).not.toBe(true)
      expect(added[0].body).toContain("ENGAGEMENT-IN-SCOPE")
      const bodies = yield* retained(current, input)
      expect(bodies.length).toBeLessThanOrEqual(23)
      expect(bodies.every((body) => body.bytes.length < MiB)).toBe(true)
      expect(bodies.reduce((sum, body) => sum + body.bytes.length, 0)).toBeLessThan(64 * MiB)
      //The22 lead inputs alone exceed1MiB; the later known-instance call is separate and all other quotas stay below their limits.
      yield* failed(current, root, input, output)
    }), variants).pipe(
      Effect.provideService(BackendToolkit.Root, path.join(root.global.cache, "receipt-empty-toolkit")),
    )
  })))
}, 600_000)

test("an actual4096-byte captured citation is exactly one complete public page", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(run((root) => Effect.gen(function* () {
    const prefix = sourceText.trimEnd() + " // "
    const line = prefix + "x".repeat(4096 - Buffer.byteLength(prefix))
    expect(Buffer.byteLength(line)).toBe(4096)
    const input = { ...request("exact-page-citation"), revision: yield* commit(root, { [sourcePath]: line + "\n" }) }
    yield* root.open((host) => Effect.gen(function* () {
      yield* Effect.addFinalizer(() => Effect.promise(() => fs.rm(cache(host, input), { recursive: true, force: true })))
      const report = decoded(yield* host.invoke(input))
      expect(report.status).toBe("completed")
      expect(report.report?.findings).toHaveLength(1)
      expect(report.citations).toHaveLength(1)
      expect(report.citations[0].text).toBe(line)
      expect(Buffer.byteLength(report.citations[0].text)).toBe(4096)
      const evidence = yield* receipt(host, report)
      yield* knownVariant(host, input, evidence)
      const citation = evidence.value.artifacts.find((artifact) => artifact.kind === "citation")
      if (!citation) return yield* Effect.die("actual citation body missing from receipt")
      expect(citation.bytes).toBe(4096)
      const body = yield* readAll(host, evidence.index, citation)
      expect(body.bytes).toEqual(Buffer.from(line))
      expect(body.pages).toHaveLength(1)
      expect(body.pages[0].offset).toBe(0)
      expect(Buffer.from(body.pages[0].data, "base64").length).toBe(4096)
      expect(body.pages[0].next).toBeUndefined()
    }), variantAdapter((log, modelRequest) => text(reply(log, modelRequest, { quote: true })))).pipe(
      Effect.provideService(BackendToolkit.Root, path.join(root.global.cache, "page-empty-toolkit")),
    )
  })))
}, 150_000)
