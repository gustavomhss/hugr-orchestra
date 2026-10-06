import { expect } from "bun:test"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { Deferred, Effect, Logger } from "effect"
import type { SessionV1 } from "@opencode-ai/core/v1/session"
import { Session } from "@/session/session"
import type { SessionID } from "@/session/schema"
import { SessionContinuity } from "@/continuity/service"
import { it } from "../lib/effect"
import { A, B, FIRST, applyFirst, archiveDirectory, entered, environment, held, jobFor, prepare, seed, terminal } from "./service-fixture"

const memoryFile = (sessionID: SessionID) => path.join(archiveDirectory(sessionID), "memory.json")

// A fresh service instance on the same data directory: the process restarted.
function restarted(sessionID: SessionID, messages: SessionV1.WithParts[]) {
  return SessionContinuity.Service.pipe(
    Effect.flatMap((continuity) => continuity.prepare({ sessionID, messages, canRecall: true })),
    Effect.provide(environment([])),
  )
}

function applied() {
  return Effect.gen(function* () {
    const plan = yield* held(FIRST)
    return yield* Effect.gen(function* () {
      const sessionID = yield* seed()
      const before = yield* applyFirst(sessionID, plan)
      const history = yield* (yield* Session.Service).messages({ sessionID })
      return { sessionID, before, history }
    }).pipe(Effect.provide(environment([plan])))
  })
}

it.instance("applied memory survives a restart", () => Effect.gen(function* () {
  const { sessionID, before, history } = yield* applied()
  expect(existsSync(memoryFile(sessionID))).toBe(true)
  const after = yield* restarted(sessionID, history)
  expect(after.system[0]).toContain(FIRST)
  expect(after).toEqual(before)
}), 30_000)

for (const action of ["invalidate", "forget"] as const) it.instance(`${action} deletes persisted memory`, () => Effect.gen(function* () {
  const plan = yield* held(FIRST)
  const { sessionID, history } = yield* Effect.gen(function* () {
    const sessionID = yield* seed()
    yield* applyFirst(sessionID, plan)
    expect(existsSync(memoryFile(sessionID))).toBe(true)
    yield* (yield* SessionContinuity.Service)[action](sessionID)
    return { sessionID, history: yield* (yield* Session.Service).messages({ sessionID }) }
  }).pipe(Effect.provide(environment([plan])))
  expect(existsSync(memoryFile(sessionID))).toBe(false)
  expect(yield* restarted(sessionID, history)).toEqual({ messages: history, system: [] })
}), 30_000)

const tampered = {
  corrupt: () => "{\"version\":1,",
  foreign: (stored: any) => JSON.stringify({ ...stored, sessionID: "ses_foreign" }),
  "version-3": (stored: any) => JSON.stringify({ ...stored, entry: { ...stored.entry, artifact: { ...stored.entry.artifact, version: 3 } } }),
  "mismatched-artifact": (stored: any) => JSON.stringify({ ...stored, entry: { ...stored.entry, boundary: stored.entry.artifact.tailStart } }),
  "malformed-mask": (stored: any) => JSON.stringify({ ...stored, masks: [["prt_masked", "not-an-archive-reference"]] }),
}
for (const [name, tamper] of Object.entries(tampered)) it.instance(`a ${name} memory file is ignored and deleted`, () => Effect.gen(function* () {
  const { sessionID, history } = yield* applied()
  const file = memoryFile(sessionID)
  writeFileSync(file, tamper(JSON.parse(readFileSync(file, "utf8"))))
  expect(yield* restarted(sessionID, history)).toEqual({ messages: history, system: [] })
  expect(existsSync(file)).toBe(false)
}), 30_000)

it.instance("a failed memory write does not fail the pass", () => Effect.gen(function* () {
  const plan = yield* held(FIRST)
  const events: unknown[] = []
  yield* Effect.gen(function* () {
    const sessionID = yield* seed()
    const hit = yield* entered(plan)
    // A directory where the file belongs makes the atomic write fail.
    mkdirSync(memoryFile(sessionID))
    yield* Deferred.succeed(plan.release, undefined)
    yield* terminal(hit.jobID, "completed", "applied")
    expect((yield* prepare(sessionID)).system[0]).toContain(FIRST)
  }).pipe(Effect.provide(environment([plan])), Effect.provide(Logger.layer([
    Logger.make<unknown, void>((options) => { events.push(options.message) })])))
  expect(events.filter((event) => Array.isArray(event) && event[0] === "continuity memory")).toEqual([
    ["continuity memory", expect.objectContaining({ reason: "archive-unsafe-path" })]])
  expect(JSON.stringify(events)).not.toContain(FIRST)
}), 30_000)

it.instance("a masking-only pass persists its masks", () => Effect.gen(function* () {
  const { sessionID, before, history } = yield* Effect.gen(function* () {
    const sessionID = yield* seed(B, A, "build log line\n".repeat(10_000))
    const history = yield* (yield* Session.Service).messages({ sessionID })
    yield* terminal((yield* jobFor(sessionID, history.at(-1)!.info.id)).id, "completed", "masked")
    return { sessionID, before: yield* prepare(sessionID), history }
  }).pipe(Effect.provide(environment([])))
  expect(JSON.stringify(before.messages)).toContain("masked")
  expect(JSON.parse(readFileSync(memoryFile(sessionID), "utf8")).entry).toBeNull()
  expect(yield* restarted(sessionID, history)).toEqual(before)
}), 60_000)
