import { expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { Effect, Schema, Stream } from "effect"
import { GitCli } from "@orchestra/core/git-cli"
import { expectSpawn } from "@orchestra/core/test/fixture/omni-expect"
import { run, sourcePath, sourceText } from "./fixture/lucy-engagement"
import { decoded } from "./fixture/lucy-engagement-artifacts"
import { variantAdapter } from "./fixture/lucy-engagement-variant-adapter"
import { history, request, retained, script } from "./fixture/lucy-history"

test("H09 model history is bounded valid UTF-8 JSON while complete safe bytes remain pageable", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(run((root) => Effect.gen(function* () {
    const large = "// HISTORY-UNICODE-é🙂\n".repeat(4000)
    yield* Effect.promise(() => fs.writeFile(path.join(root.directory, sourcePath), large))
    yield* root.git("add", "--", sourcePath)
    yield* root.git("commit", "-q", "-m", "large historical blob")
    const revision = yield* root.git("rev-parse", "HEAD")
    yield* Effect.promise(() => fs.writeFile(path.join(root.directory, sourcePath), sourceText))
    yield* root.git("add", "--", sourcePath)
    yield* root.git("commit", "-q", "-m", "restore bounded current source")
    const provider = script([{ id: "large", name: "review_history", input: { op: "show", path: sourcePath, rev: revision } }])
    yield* root.open((host) => Effect.gen(function* () {
      const report = decoded(yield* host.invoke(request("history-model-bound", "diligence")))
      const model = (yield* history(host, report, "large")).value
      expect(model.truncated).toBe(true)
      expect(model.complete).toBe(false)
      expect(model.notExamined.length).toBeGreaterThan(0)
      expect(model.text.length).toBeGreaterThan(0)
      expect(large.startsWith(model.text)).toBe(true)
      expect(model.text).not.toContain("\ufffd")
      const evidence = yield* retained(host, report)
      expect(evidence.proofs).toHaveLength(1)
      const proof = evidence.proofs[0]
      expect(proof.proof.result.text).toBe(large)
      expect(proof.proof.result.complete).toBe(true)
      expect(proof.proof.result.truncated).toBe(false)
      expect(proof.artifact.bytes).toBeGreaterThan(32768)
      expect(proof.artifact.complete).toBe(true)
      expect(proof.proof.result.selection).toEqual({ endCommit: revision })
    }), variantAdapter(provider.stream))
  })))
}, 150_000)

test("H09 raw history cap remains explicit and never claims the full oversized ancestor was examined", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(run((root) => Effect.gen(function* () {
    const large = "// HISTORY-RAW-BOUND\n".repeat(260000)
    expect(Buffer.byteLength(large)).toBeGreaterThan(4 * 1024 * 1024)
    yield* Effect.promise(() => fs.writeFile(path.join(root.directory, sourcePath), large))
    yield* root.git("add", "--", sourcePath)
    yield* root.git("commit", "-q", "-m", "oversized historical blob")
    const revision = yield* root.git("rev-parse", "HEAD")
    yield* Effect.promise(() => fs.writeFile(path.join(root.directory, sourcePath), sourceText))
    yield* root.git("add", "--", sourcePath)
    yield* root.git("commit", "-q", "-m", "restore current source")
    const provider = script([{ id: "large", name: "review_history", input: { op: "show", path: sourcePath, rev: revision } }])
    yield* root.open((host) => Effect.gen(function* () {
      const report = decoded(yield* host.invoke(request("history-raw-bound", "diligence")))
      const model = (yield* history(host, report, "large")).value
      expect(model.complete).toBe(false)
      expect(model.truncated).toBe(true)
      expect(model.notExamined.length).toBeGreaterThan(0)
      const evidence = yield* retained(host, report)
      const raw = evidence.proofs[0].proof.result
      expect(Buffer.byteLength(JSON.stringify(raw))).toBeLessThanOrEqual(4 * 1024 * 1024)
      expect(raw.text.length).toBeGreaterThan(0)
      expect(large.startsWith(raw.text)).toBe(true)
      expect(raw.complete).toBe(false)
      expect(raw.truncated).toBe(true)
      expect(raw.notExamined.length).toBeGreaterThan(0)
      expect(evidence.proofs[0].artifact.complete).toBe(false)
    }), variantAdapter(provider.stream))
  })))
}, 180_000)

test("H09 the real ancestry walk retains at most 200 commits and labels the remaining history", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(run((root) => root.open((host) => Effect.gen(function* () {
    const importText = Array.from({ length: 201 }, (_, i) => {
      const content = 'export const sharedValue = "HISTORY-COMMIT-' + i + '"\n'
      const message = "history " + i
      return ["commit refs/heads/main", "mark :" + (i + 1),
        "author Engagement <engagement@example.com> " + (1700000000 + i) + " +0000",
        "committer Engagement <engagement@example.com> " + (1700000000 + i) + " +0000",
        "data " + Buffer.byteLength(message), message,
        "from " + (i === 0 ? root.head : ":" + i),
        "M 100644 inline " + sourcePath, "data " + Buffer.byteLength(content), content, ""].join("\n")
    }).join("") + "done\n"
    const git = yield* GitCli.Service
    const made = yield* git.run(["fast-import", "--quiet", "--done"],
      { cwd: root.directory, stdin: Stream.make(Buffer.from(importText)), timeout: "30 seconds", maxOutputBytes: 4096 })
    expect(made.exitCode, made.stderr.toString("utf8")).toBe(0)
    const input = request("history-commit-bound", "diligence")
    const report = decoded(yield* host.invoke(input))
    const model = (yield* history(host, report, "log")).value
    expect(model.complete).toBe(false)
    expect(model.notExamined.length).toBeGreaterThan(0)
    const evidence = yield* retained(host, report)
    const raw = evidence.proofs[0].proof.result
    const entries = raw.text.trim().split("\n").map((line) => Schema.decodeUnknownSync(Schema.Struct({
      commit: Schema.String, timestamp: Schema.String, authorID: Schema.String,
    }))(JSON.parse(line), { onExcessProperty: "error" }))
    expect(entries).toHaveLength(200)
    expect(new Set(entries.map((entry) => entry.commit)).size).toBe(200)
    expect(entries[0].commit).toBe(report.source?.commit)
    expect(raw.complete).toBe(false)
    expect(raw.notExamined.length).toBeGreaterThan(0)
    expect(evidence.proofs[0].artifact.complete).toBe(false)
  }), variantAdapter(script([{ id: "log", name: "review_history", input: { op: "log", path: sourcePath } }]).stream))))
}, 180_000)

