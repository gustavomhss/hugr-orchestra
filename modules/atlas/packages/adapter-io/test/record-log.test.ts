// @atlas/adapter-io — test/record-log.test.ts  (board, logbook and milestone writers for a bundle's record commit)

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { appendCardEvent, readCard } from "../src/card-log.js"
import { cardLogPath, projectLogPath } from "../src/layout.js"
import { createDurableOrientation } from "../src/orientation-store.js"
import { appendBoardEvent, appendLogbookEntry, appendMilestone, boardLogPath, readBoard } from "../src/record-log.js"

let repo: string
beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "atlas-record-"))
})
afterEach(() => rmSync(repo, { recursive: true, force: true }))

const move = {
  activity: "act_1",
  project: "proj_1",
  issue: "ORC-7",
  actor: "maestro",
  action: "move",
  at: "2026-10-28T12:00:00.000Z",
  before: { status: "todo", order: 1 },
  after: { status: "review", order: 2 },
  text: { reason: "secret reason" },
}

const entry = {
  prId: "#42",
  at: "2026-10-28T12:00:00.000Z",
  territories: ["atlas"],
  shipped: "the board writer",
  decisions: "store before and after as JSON text",
  tradeoffs: "none",
  risks: "none",
  openThreads: "none",
  links: ["#42"],
}

describe("board log", () => {
  it("reads rows in (at, contentHash) order and keeps text only when private", () => {
    appendBoardEvent(repo, move, { redact: false })
    appendBoardEvent(repo, { ...move, activity: "act_0", at: "2026-10-28T10:00:00.000Z" }, { redact: true })

    const read = readBoard(repo)
    expect(read.rejected).toBe(0)
    expect(read.events.map((e) => e.activity)).toEqual(["act_0", "act_1"])
    expect(read.events[1]).toMatchObject({ before: move.before, after: move.after, text: move.text })
    expect(read.events[0]?.text).toBeUndefined()
    expect(read.events[0]?.textHash).toBe(read.events[1]?.textHash)
  })

  it("leaves no free text in a redacted file", () => {
    appendBoardEvent(repo, move, { redact: true })
    expect(readFileSync(boardLogPath(repo), "utf8")).not.toContain("secret reason")
    expect(boardLogPath(repo)).toBe(projectLogPath(repo, "board"))
  })

  it("rejects a line whose status inside before or after was edited", () => {
    appendBoardEvent(repo, move, { redact: false })
    const file = boardLogPath(repo)
    writeFileSync(file, readFileSync(file, "utf8").replace('\\"review\\"', '\\"done\\"'))
    expect(readFileSync(file, "utf8")).toContain('\\"done\\"')
    expect(readBoard(repo)).toMatchObject({ events: [], rejected: 1 })
  })
})

describe("card log status", () => {
  it("rejects a line whose status was edited", () => {
    appendCardEvent(repo, "ORC-7", { kind: "status", status: "review", by: "maestro", at: "2026-10-28T12:00:00.000Z" }, { redact: false })
    expect(readCard(repo, "ORC-7").events[0]).toMatchObject({ kind: "status", status: "review" })
    const file = cardLogPath(repo, "ORC-7")
    writeFileSync(file, readFileSync(file, "utf8").replace('"review"', '"done"'))
    expect(readCard(repo, "ORC-7")).toMatchObject({ events: [], rejected: 1 })
  })
})

describe("logbook", () => {
  const logbook = () => readFileSync(join(repo, ".atlas", "members", "orch", "memory", "logbook.jsonl"), "utf8")

  it("writes one entry per PR and refuses a second", () => {
    expect(appendLogbookEntry(repo, entry, { redact: false }).valid).toBe(true)
    expect(logbook()).toContain("the board writer")
    expect(appendLogbookEntry(repo, { ...entry, shipped: "again" }, { redact: false })).toEqual({
      valid: false,
      reasons: ["logbook entry exists for PR #42"],
    })
  })

  it("refuses an invalid entry and writes nothing", () => {
    expect(appendLogbookEntry(repo, { ...entry, shipped: "x".repeat(281) }, { redact: false }).valid).toBe(false)
    expect(() => logbook()).toThrow()
  })

  it("keeps no prose on a public repository", () => {
    expect(appendLogbookEntry(repo, entry, { redact: true }).valid).toBe(true)
    expect(logbook()).not.toContain("the board writer")
    expect(logbook()).toContain("textHash")
  })
})

describe("milestone", () => {
  it("appends an ids-only label", () => {
    appendMilestone(repo, { card: "ORC-7", pr: 42 })
    expect(readFileSync(createDurableOrientation(repo).path, "utf8")).toContain("ORC-7 landed in #42")
  })
})
