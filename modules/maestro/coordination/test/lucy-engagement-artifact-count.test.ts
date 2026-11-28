import { expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { Deferred, Effect, Schema, Stream } from "effect"
import { BackendToolkit } from "@orchestra/core/backend-toolkit"
import { ReviewAnalyze } from "@orchestra/core/review-toolkit/analyze"
import { expectSpawn } from "@orchestra/core/test/fixture/omni-expect"
import { reply, run, stage, text, type Controls } from "./fixture/lucy-engagement"
import { cache, canonical, decoded, nativeCode, receipt, request } from "./fixture/lucy-engagement-artifacts"
import { calls, commit, failed, retained } from "./fixture/lucy-engagement-artifact-limits"

test("distinct locate snapshots exceed256 descriptors before the128-CODE-operation limit", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(run((root) => Effect.gen(function* () {
    const filename = "src/descriptor-regions.txt"
    const markers = Array.from({ length: 127 }, (_, index) => `DESCRIPTOR_${String(index + 1).padStart(3, "0")}`)
    const revision = yield* commit(root, { [filename]: markers.map((marker) => marker + "\n\n\n\n\n\n\n").join("") })
    const control = { ...request("descriptor-overhead-control"), revision }
    const input = { ...request("descriptor-limit"), revision }
    const firstLensDone = yield* Deferred.make<void>()
    const lenses: string[] = []
    const turns = new Map<string, number>()
    let lead: string | undefined
    let active = false
    let analyses = 0
    let observed = false
    let observe: (() => Effect.Effect<void>) | undefined
    const locates = (first: number, count: number) => Array.from({ length: count }, (_, index) => ({
      id: `descriptor_${String(first + index).padStart(3, "0")}`, name: "code_locate",
      input: { terms: [markers[first + index - 1]], paths: [filename], limit: 1 },
    }))
    expect(Buffer.byteLength(canonical(locates(1, 127)))).toBeLessThan(32 * 1024)
    const stream: NonNullable<Controls["stream"]> = (log, modelRequest) => {
      if (!active) return text(reply(log, modelRequest, { quote: true }))
      const current = stage(log.text)
      if (current === "entry") {
        if (lead === undefined) {
          lead = log.sessionID
          return calls(locates(1, 45))
        }
        expect(log.sessionID).toBe(lead)
        return text(reply(log, modelRequest, { quote: true }))
      }
      if (current !== "lens") return text(reply(log, modelRequest, { quote: true }))
      if (!turns.has(log.sessionID) && lenses.length < 2) lenses.push(log.sessionID)
      const slot = lenses.indexOf(log.sessionID)
      if (slot < 0) return text(reply(log, modelRequest, { quote: true }))
      const turn = turns.get(log.sessionID) ?? 0
      turns.set(log.sessionID, turn + 1)
      if (turn === 0) return slot === 0 ? calls(locates(46, 42)) : calls(locates(88, 39))
      if (slot === 0) return Stream.unwrap(Deferred.succeed(firstLensDone, undefined).pipe(
        Effect.as(text(reply(log, modelRequest, { quote: true }))),
      ))
      if (turn === 1) return Stream.unwrap(Effect.gen(function* () {
        yield* Deferred.await(firstLensDone)
        if (!observe) return yield* Effect.die("native descriptor boundary observation missing")
        yield* observe()
        return calls(locates(127, 1))
      }))
      return text(reply(log, modelRequest, { quote: true }))
    }
    yield* root.open((host) => Effect.gen(function* () {
      yield* Effect.addFinalizer(() => Effect.promise(async () => {
        await fs.rm(cache(host, control), { recursive: true, force: true })
        await fs.rm(cache(host, input), { recursive: true, force: true })
      }))
      const mini = decoded(yield* host.invoke(control))
      expect(mini.status).toBe("completed")
      const card = mini.report
      if (!card) return yield* Effect.die("completed control card missing")
      expect(card.findings).toHaveLength(1)
      expect(mini.citations).toHaveLength(1)
      expect(card.checks.length).toBeGreaterThan(0)
      expect(card.checks.every((check) => check.status === "not-run" || check.status === "check-unavailable" ||
        check.id === "repo:blast-radius" && check.status === "pass")).toBe(true)
      expect(card.checks.every((check) => check.workspaceExecuted !== true)).toBe(true)
      expect(analyses).toBe(1)
      const normalized = yield* Effect.promise(async () => {
        const directories = (await fs.readdir(cache(host, control))).filter((name) => /^[0-9a-f-]{36}$/.test(name))
        expect(directories).toHaveLength(1)
        const directory = path.join(cache(host, control), directories[0])
        if (card.checks.some((check) => check.id === "repo:blast-radius" && check.status === "pass"))
          expect(JSON.parse(await fs.readFile(path.join(directory, "raw", "blast-radius.json"), "utf8"))).toEqual({
            result: { status: "pass", ranges: {}, queries: 0 }, observations: [],
          })
        return {
          retained: Schema.decodeUnknownSync(Schema.Struct({ total: Schema.Number, unread: Schema.Unknown, items: Schema.Array(Schema.Unknown) }))(
            JSON.parse(await fs.readFile(path.join(directory, "retained.json"), "utf8"))),
          debt: Schema.decodeUnknownSync(Schema.Array(Schema.Unknown))(
            JSON.parse(await fs.readFile(path.join(directory, "debt.json"), "utf8"))),
        }
      })
      expect(normalized.retained.total).toBe(0)
      expect(normalized.retained.items).toEqual([])
      expect(normalized.debt).toEqual([])
      // Baseline has two normalized files and real host check facts. The new receipt is checked only after the bound assertion.
      observe = () => Effect.gen(function* () {
        if (!lead || lenses.length !== 2) return yield* Effect.die("three actual owned Sessions missing")
        const native = (yield* Effect.forEach([lead, ...lenses], (id) => nativeCode(host, id))).flat()
        expect(native).toHaveLength(126)
        expect(native.every((call) => call.name === "code_locate" && call.status === "completed" && call.providerExecuted !== true)).toBe(true)
        expect(new Set(native.map((call) => call.id)).size).toBe(126)
        expect(analyses).toBe(2)
        const bodies = yield* retained(host, input)
        expect(bodies).toHaveLength(252)
        expect(new Set(bodies.map((body) => body.uri)).size).toBe(252)
        expect(bodies.filter((body) => body.body.result === undefined)).toHaveLength(126)
        expect(bodies.filter((body) => body.body.result !== undefined)).toHaveLength(126)
        expect(bodies.every((body) => body.bytes.length < 16 * 1024)).toBe(true)
        expect(bodies.reduce((sum, body) => sum + body.bytes.length, 0)).toBeLessThan(1024 * 1024)
        expect(new Set(bodies.map((body) => body.body.source.commit))).toEqual(new Set([revision]))
        observed = true
      }).pipe(Effect.orDie)
      active = true
      const output = yield* host.invoke(input)
      expect(observed).toBe(true)
      //127 operations stay below128. The next distinct result crosses252 +3 analysis +2 =257 descriptors before final citation.
      yield* failed(host, root, input, output)
      const evidence = yield* receipt(host, mini)
      expect(evidence.value.operations).toHaveLength(1)
      expect(evidence.value.operations[0].kind).toBe("analysis")
      expect(evidence.value.hostProofs).toEqual([])
      expect(evidence.value.citations).toHaveLength(1)
      expect(evidence.value.artifacts.map((artifact) => artifact.kind).sort()).toEqual([
        "analysis-debt", "analysis-result", "analysis-retained", "citation",
      ])
      expect(evidence.value.artifacts).toHaveLength(4)
      expect(evidence.value.operations[0].kind === "analysis" && evidence.value.operations[0].checks.every((check) =>
        check.artifactIDs.length === 0 && check.proofIDs.length === 0)).toBe(true)
    }), { stream }).pipe(
      Effect.provideService(BackendToolkit.Root, path.join(root.global.cache, "descriptor-empty-toolkit")),
      Effect.provideService(ReviewAnalyze.ObserveCatalog, () => { analyses++ }),
    )
  })))
}, 600_000)
