import { expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { Effect, Schema } from "effect"
import { expectSpawn } from "@orchestra/core/test/fixture/omni-expect"
import { run, outsidePath, outsideText, sourcePath, sourceText } from "./fixture/lucy-engagement"
import { canonical, decoded, digest } from "./fixture/lucy-engagement-artifacts"
import { variantAdapter } from "./fixture/lucy-engagement-variant-adapter"
import { code, completed, history, native, request, retained, script, type Call } from "./fixture/lucy-history"

const metadata = Schema.Struct({ commit: Schema.String, timestamp: Schema.String, authorID: Schema.String })
const lines = (value: string) => value.trim().split("\n").filter(Boolean)
const forbidden = ["HISTORY-LIVE-HEAD", "HISTORY-DIRTY-WORKTREE", "HISTORY-PRIVATE-COMMIT-MESSAGE", outsidePath, "ENGAGEMENT-OUTSIDE"]
const safe = (text: string) => { for (const sentinel of forbidden) expect(text).not.toContain(sentinel) }

for (const profile of ["audit", "diligence"] as const) {
  test(`H01/H03 ${profile}: four real history operations stay on captured source after live HEAD moves`, () => {
    expectSpawn(import.meta.path)
    return Effect.runPromise(run((root) => Effect.gen(function* () {
      const authorID = digest(canonical({ name: "Engagement", email: "engagement@example.com" }))
      const headTime = new Date(yield* root.git("show", "-s", "--format=%cI", root.head)).toISOString()
      const baseTime = new Date(yield* root.git("show", "-s", "--format=%cI", root.base)).toISOString()
      const calls: Call[] = [code,
        { id: "show", name: "review_history", input: { op: "show", path: sourcePath } },
        { id: "head", name: "review_history", input: { op: "show", path: sourcePath, rev: "HEAD" } },
        { id: "ancestor", name: "review_history", input: { op: "show", path: sourcePath, rev: root.base } },
        { id: "log", name: "review_history", input: { op: "log", path: sourcePath } },
        { id: "blame", name: "review_history", input: { op: "blame", path: sourcePath } },
        { id: "pickaxe", name: "review_history", input: { op: "pickaxe", path: sourcePath, pattern: "ENGAGEMENT-IN-SCOPE" } },
        { id: "range", name: "review_history", input: { op: "log", path: sourcePath, range: root.base + ".." + root.head } },
      ]
      const provider = script(calls, Effect.gen(function* () {
        yield* Effect.promise(() => fs.writeFile(path.join(root.directory, sourcePath), 'export const sharedValue = "HISTORY-LIVE-HEAD"\n'))
        yield* root.git("add", "--", sourcePath)
        yield* root.git("commit", "-q", "-m", "HISTORY-PRIVATE-COMMIT-MESSAGE")
        expect(yield* root.git("rev-parse", "HEAD")).not.toBe(root.head)
        yield* Effect.promise(() => fs.writeFile(path.join(root.directory, sourcePath), 'export const sharedValue = "HISTORY-DIRTY-WORKTREE"\n'))
      }))
      yield* root.open((host) => Effect.gen(function* () {
        yield* host.prepareIndex()
        const report = decoded(yield* host.invoke(request("history-four-" + profile, profile)))
        expect(report.status).toBe("completed")
        expect(report.source?.commit).toBe(root.head)
        expect((yield* completed(host, report.sessionID, code.id)).text).toContain("sharedValue")
        for (const id of ["show", "head"]) {
          const { value } = yield* history(host, report, id)
          expect(value.path).toBe(sourcePath)
          expect(value.selection).toEqual({ endCommit: root.head })
          expect(value.text).toBe(sourceText)
          expect(value.complete).toBe(true)
          expect(value.truncated).toBe(false)
          expect(value.notExamined).toEqual([])
        }
        expect((yield* history(host, report, "ancestor")).value.text).toBe('export const sharedValue = "ENGAGEMENT-BASE"\n')
        const log = (yield* history(host, report, "log")).value
        const records = lines(log.text).map((line) => Schema.decodeUnknownSync(metadata)(JSON.parse(line), { onExcessProperty: "error" }))
        expect(records).toEqual([{ commit: root.head, timestamp: headTime, authorID },
          { commit: root.base, timestamp: baseTime, authorID }])
        const blame = (yield* history(host, report, "blame")).value
        const attribution = lines(blame.text).map((line) => Schema.decodeUnknownSync(Schema.Struct({
          line: Schema.Number, text: Schema.String, commit: Schema.String, timestamp: Schema.String, authorID: Schema.String,
        }))(JSON.parse(line), { onExcessProperty: "error" }))
        expect(attribution).toHaveLength(1)
        expect(attribution[0]).toEqual({ line: 1, text: sourceText.trimEnd(), commit: root.head,
          timestamp: headTime, authorID })
        const picked = lines((yield* history(host, report, "pickaxe")).value.text).map((line) =>
          Schema.decodeUnknownSync(metadata)(JSON.parse(line), { onExcessProperty: "error" }))
        expect(picked).toEqual([{ commit: root.head, timestamp: headTime, authorID }])
        const ranged = (yield* history(host, report, "range")).value
        expect(ranged.selection).toEqual({ startCommit: root.base, endCommit: root.head })
        expect(lines(ranged.text).map((line) => Schema.decodeUnknownSync(metadata)(JSON.parse(line)).commit)).toEqual([root.head])
        const evidence = yield* retained(host, report)
        expect(evidence.proofs).toHaveLength(7)
        for (const item of evidence.proofs) safe(item.bytes.toString("utf8"))
        for (const call of yield* native(host, report.sessionID)) if (call.name === "review_history") safe(call.text)
        expect(report.notExamined).not.toContainEqual({ item: "engagement:history", reason: "not-built" })
      }), variantAdapter(provider.stream))
    })))
  }, 150_000)
}

const invalid = [
  { name: "missing path", input: { op: "log" } },
  { name: "outside captured path", input: { op: "show", path: outsidePath } },
  { name: "directory prefix", input: { op: "log", path: "src" } },
  { name: "glob", input: { op: "show", path: "src/*" } },
  { name: "traversal", input: { op: "show", path: "src/../outside/private.ts" } },
  { name: "option path", input: { op: "show", path: "--all" } },
  { name: "branch ref", input: { op: "show", path: sourcePath, rev: "main" } },
  { name: "revision expression", input: { op: "show", path: sourcePath, rev: "HEAD~1" } },
  { name: "option rev", input: { op: "show", path: sourcePath, rev: "--all" } },
  { name: "unknown oid", input: { op: "show", path: sourcePath, rev: "f".repeat(40) } },
  { name: "reflog", input: { op: "show", path: sourcePath, rev: "HEAD@{0}" } },
  { name: "symbolic range", input: { op: "log", path: sourcePath, range: "main..HEAD" } },
] as const

for (const item of invalid) {
  test("H02 refuses " + item.name + " after a positive confined history call", () => {
    expectSpawn(import.meta.path)
    return Effect.runPromise(run((root) => {
      const provider = script([code,
        { id: "positive", name: "review_history", input: { op: "show", path: sourcePath } },
        { id: "negative", name: "review_history", input: item.input },
      ])
      return root.open((host) => Effect.gen(function* () {
        yield* host.prepareIndex()
        const report = decoded(yield* host.invoke(request("refuse-" + item.name.replaceAll(" ", "-"), "diligence")))
        yield* completed(host, report.sessionID, code.id)
        expect((yield* history(host, report, "positive")).value.text).toBe(sourceText)
        const refused = (yield* native(host, report.sessionID)).find((call) => call.toolCallID === "negative")
        expect(refused?.state.status, refused?.text).toBe("error")
        expect(refused?.text).toContain("engagement-history-")
        expect(refused?.text).not.toContain(outsideText.trim())
        const evidence = yield* retained(host, report)
        expect(evidence.proofs).toHaveLength(1)
        expect(evidence.proofs[0].proof.toolCallID).toBe("positive")
      }), variantAdapter(provider.stream))
    }))
  }, 120_000)
}

test("H02 refuses real dangling, nonancestor, future, noncommit and abbreviated objects", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(run((root) => Effect.gen(function* () {
    const tree = yield* root.git("rev-parse", root.head + "^{tree}")
    const dangling = yield* root.git("commit-tree", tree, "-m", "HISTORY-DANGLING-PRIVATE")
    const nonancestor = yield* root.git("commit-tree", tree, "-m", "HISTORY-NONANCESTOR-PRIVATE")
    yield* root.git("branch", "unrelated", nonancestor)
    let future = ""
    const provider = script(() => [code,
      { id: "positive", name: "review_history", input: { op: "show", path: sourcePath } },
      ...[dangling, nonancestor, future, tree, root.base.slice(0, 12), root.base.toUpperCase()].map((rev, i) =>
        ({ id: "bad-" + i, name: "review_history", input: { op: "show", path: sourcePath, rev } })),
    ], Effect.gen(function* () {
      yield* Effect.promise(() => fs.writeFile(path.join(root.directory, sourcePath), "HISTORY-FUTURE-SECRET\n"))
      yield* root.git("add", "--", sourcePath)
      yield* root.git("commit", "-q", "-m", "future")
      future = yield* root.git("rev-parse", "HEAD")
    }))
    yield* root.open((host) => Effect.gen(function* () {
      yield* host.prepareIndex()
      const report = decoded(yield* host.invoke(request("raw-object-boundaries", "diligence")))
      yield* completed(host, report.sessionID, code.id)
      expect((yield* history(host, report, "positive")).value.text).toBe(sourceText)
      const events = yield* native(host, report.sessionID)
      for (let i = 0; i < 6; i++) {
        const item = events.find((call) => call.toolCallID === "bad-" + i)
        expect(item?.state.status, item?.text).toBe("error")
        expect(item?.text).toContain("engagement-history-")
        expect(item?.text).not.toContain("HISTORY-FUTURE-SECRET")
        expect(item?.text).not.toContain("HISTORY-DANGLING-PRIVATE")
      }
      expect((yield* retained(host, report)).proofs).toHaveLength(1)
    }), variantAdapter(provider.stream))
  })))
}, 150_000)

