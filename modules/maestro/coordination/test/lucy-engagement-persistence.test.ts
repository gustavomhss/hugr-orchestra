import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { Effect } from "effect"
import { Board } from "@orchestra/schema/board"
import { AgentV2 } from "@orchestra/core/agent"
import { BoardProjectTable } from "@orchestra/core/board/sql"
import { Database } from "@orchestra/core/database/database"
import { SessionInputTable, SessionTable } from "@orchestra/core/session/sql"
import { expectSpawn } from "@orchestra/core/test/fixture/omni-expect"
import { ReviewResultV2 } from "../src/v2/governance/review-result"
import { reviewRows } from "./fixture/lucy-pr-entry"
import { reply, run, sourcePath, sourceText, text } from "./fixture/lucy-engagement"

type Envelope = {
  schema: string
  requestID: string
  inputHash: string
  sessionID: string
  status: string
  source: { revision: string; commit: string; sha256: string; files: { path: string; oid: string }[] }
  budget: { startedAt: number; deadlineAt: number }
  reportID: string
  report: ReviewResultV2.Card
  citations: { uri: string; path: string; oid: string; text: string; sha256: string }[]
}

const request = (requestID: string) => ({
  kind: "engagement", requestID, profile: "diligence",
  brief: "Inspect the admitted src declarations and retain exact source evidence.",
  timeBoxMinutes: 5, paths: ["src", sourcePath],
})

function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]"
  if (value !== null && typeof value === "object")
    return "{" + Object.keys(value).sort().map((key) =>
      JSON.stringify(key) + ":" + canonical((value as Record<string, unknown>)[key])).join(",") + "}"
  if (value === null || typeof value === "string" || typeof value === "boolean" ||
    typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value)
  throw new Error("non-JSON report value")
}

const hash = (value: string) => createHash("sha256").update(value, "utf8").digest("hex")

function decoded(result: { type: string; text: string }, input: unknown) {
  expect(result.type, result.text).toBe("text")
  const value = JSON.parse(result.text) as Envelope
  expect(value.schema).toBe("review-engagement-result-v1")
  expect(value.status).toBe("completed")
  expect(value.inputHash).toBe(hash(canonical(input)))
  const { reportID, ...payload } = value
  expect(reportID).toBe(hash(canonical(payload)))
  expect(result.text).toBe(canonical(value))
  for (const citation of value.citations) expect(citation.sha256).toBe(hash(citation.text))
  return value
}

test("completed engagement reopens the actual SQLite store and replays identical report/source/citation bytes without recapture", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(run((root) => Effect.gen(function* () {
    const input = request("durable-report")
    const original = yield* root.open((host) => Effect.gen(function* () {
      const output = yield* host.invoke(input)
      const value = decoded(output, input)
      expect(value.source.commit).toBe(root.head)
      expect(value.source.files.map((file) => file.path)).toEqual([sourcePath])
      expect(value.report.findings).toHaveLength(1)
      expect(value.citations.some((item) => item.path === sourcePath && item.text === sourceText.trimEnd())).toBe(true)
      const sessions = yield* host.db.select().from(SessionTable).all().pipe(Effect.orDie)
      expect(sessions.some((row) => row.id === value.sessionID && row.parent_id === root.parentID)).toBe(true)
      return { output, value, requests: root.requests.length }
    }), { stream: (log, modelRequest) => text(reply(log, modelRequest, { quote: true })) })

    expect((yield* Effect.promise(() => fs.stat(root.filename))).size).toBeGreaterThan(0)
    yield* Effect.promise(() => fs.writeFile(path.join(root.directory, sourcePath), 'export const sharedValue = "LATER-HEAD"\n'))
    yield* root.git("add", "--", sourcePath)
    yield* root.git("commit", "-q", "-m", "move-head-after-completed-report")
    expect(yield* root.git("rev-parse", "HEAD")).not.toBe(root.head)

    const gitCalls: string[][] = []
    let configReads = 0
    yield* root.open((host) => Effect.gen(function* () {
      yield* host.sessions.prompt({ sessionID: root.parentID, prompt: { text: "Ambient parent history after reopening." }, resume: false })
      const admitted = yield* host.db.select().from(SessionInputTable).all().pipe(Effect.orDie)
      const sessions = yield* host.db.select().from(SessionTable).all().pipe(Effect.orDie)
      const parent = sessions.find((row) => row.id === root.parentID)
      if (!parent) return yield* Effect.die("durable parent missing after reopening")
      // Change the actual repository review settings; Config.entries is a separate observation below.
      yield* host.db.insert(BoardProjectTable).values({
        id: Board.ProjectID.create(), key: "REPLAY", name: "Replay", goal: "Changed settings after completion.",
        status: "active", github_state: "off", next_issue_number: 1, next_epic_number: 1,
        repo_project_id: parent.project_id, review_tier: "quick", review_accepted_unavailable: ["no-build"],
      }).run().pipe(Effect.orDie)
      const receipts = yield* reviewRows().pipe(Effect.provideService(Database.Service, host.database))
      const observed = gitCalls.length
      const configBeforeRetry = configReads
      const replayed = yield* host.invoke(input)
      const value = decoded(replayed, input)
      expect(replayed.text).toBe(original.output.text)
      expect(value.source).toEqual(original.value.source)
      expect(value.budget).toEqual(original.value.budget)
      expect(value.citations).toEqual(original.value.citations)
      expect(root.requests.length).toBe(original.requests)
      expect(gitCalls.length).toBe(observed)
      expect(configReads).toBe(configBeforeRetry)
      expect(yield* host.db.select().from(SessionInputTable).all().pipe(Effect.orDie)).toEqual(admitted)
      expect(yield* host.db.select().from(SessionTable).all().pipe(Effect.orDie)).toEqual(sessions)
      expect(yield* reviewRows().pipe(Effect.provideService(Database.Service, host.database))).toEqual(receipts)
      expect(value.report).not.toHaveProperty("verdict")
    }), { onGit: (args) => { gitCalls.push([...args]) }, onConfig: () => { configReads++ } })
  })))
}, 90_000)

test("one request identity hashes every accepted field, preserves optional presence and array order, and is scoped to its parent", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(run((root) => root.open((host) => Effect.gen(function* () {
    const input = request("identity-conflicts")
    const original = decoded(yield* host.invoke(input), input)
    const requests = root.requests.length
    const sessions = yield* host.db.select().from(SessionTable).all().pipe(Effect.orDie)
    const changed = [
      { ...input, brief: input.brief + " Changed." },
      { ...input, profile: "audit" },
      { ...input, timeBoxMinutes: 6 },
      { ...input, revision: "HEAD" },
      { ...input, paths: [...input.paths].reverse() },
      { ...input, paths: ["src"] },
    ]
    for (const value of changed) {
      const rejected = yield* host.invoke(value)
      expect(rejected.type).toBe("error")
      expect(rejected.text).toContain("engagement-request-conflict")
    }
    expect(root.requests.length).toBe(requests)
    expect(yield* host.db.select().from(SessionTable).all().pipe(Effect.orDie)).toEqual(sessions)
    const other = yield* host.sessions.create({
      agent: AgentV2.ID.make("maestro"), location: host.parent.location,
      ...(host.parent.model ? { model: host.parent.model } : {}),
    })
    const independent = decoded(yield* host.invoke(input, "maestro", other.id), input)
    expect(independent.sessionID).not.toBe(original.sessionID)
    expect(independent.reportID).not.toBe(original.reportID)
    expect(independent.source).toEqual(original.source)
  }))))
}, 90_000)
