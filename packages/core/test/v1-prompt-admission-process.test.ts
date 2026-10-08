import { expect } from "bun:test"
import { Effect, Layer, Schema } from "effect"
import path from "node:path"
import { Database } from "@orchestra/core/database/database"
import { EventV2 } from "@orchestra/core/event"
import { EventTable } from "@orchestra/core/event/sql"
import { MessageTable, PartTable } from "@orchestra/core/session/sql"
import { PromptAdmission } from "@orchestra/core/v1/prompt-admission"
import { PromptAdmissionTable } from "@orchestra/core/v1/prompt-admission.sql"
import { SessionV1 } from "@orchestra/core/v1/session"
import { layer, payload, seed, sessionID } from "./fixture/v1-prompt-admission"
import { tmpdir } from "./fixture/tmpdir"
import { it } from "./lib/effect"

const Result = Schema.Struct({
  pid: Schema.Int,
  status: Schema.Literals(["admitted", "already"]),
  notified: Schema.Array(Schema.String),
  snapshot: SessionV1.WithParts,
})

it.live("two processes sharing one DB admit one immutable winner with no losing event or notification", () =>
  Effect.gen(function* () {
    const tmp = yield* Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    )
    const filename = path.join(tmp.path, "contended.sqlite")
    const databaseLayer = layer(filename)
    yield* seed.pipe(Effect.provide(Layer.fresh(databaseLayer)))
    const workers = yield* Effect.forEach(["worker-A", "worker-B"], (label) =>
      Effect.acquireRelease(
        Effect.sync(() =>
          Bun.spawn(
            [process.execPath, path.join(import.meta.dir, "fixture/v1-prompt-admission-worker.ts"), filename, label],
            {
              cwd: path.join(import.meta.dir, ".."),
              stdin: "pipe",
              stdout: "pipe",
              stderr: "pipe",
            },
          ),
        ),
        (child) =>
          Effect.promise(async () => {
            if (child.exitCode === null) child.kill()
            await child.exited
          }),
      ),
    )
    const readers = workers.map((child) => child.stdout.getReader())
    yield* Effect.forEach(readers, (reader) =>
      Effect.gen(function* () {
        const ready = yield* Effect.promise(() => reader.read())
        expect(ready.done).toBe(false)
        expect(new TextDecoder().decode(ready.value)).toBe("ready\n")
      }),
    ).pipe(Effect.timeout("30 seconds"))
    workers.forEach((child) => {
      child.stdin.write("publish\n")
      child.stdin.end()
    })
    const results = yield* Effect.forEach(
      workers,
      (child, index) =>
        Effect.promise(async () => {
          const reader = readers[index]
          if (!reader) throw new Error("Worker reader missing")
          const output: Uint8Array[] = []
          const stderr = new Response(child.stderr).text()
          while (true) {
            const next = await reader.read()
            if (next.done) break
            output.push(next.value)
          }
          expect(await stderr).toBe("")
          expect(await child.exited).toBe(0)
          return Schema.decodeUnknownSync(Schema.fromJsonString(Result))(Buffer.concat(output).toString().trim())
        }),
      { concurrency: "unbounded" },
    ).pipe(Effect.timeout("30 seconds"))
    expect(new Set(results.map((result) => result.pid)).size).toBe(2)
    expect(results.map((result) => result.status).sort()).toEqual(["admitted", "already"])
    const winner = results.find((result) => result.status === "admitted")
    const loser = results.find((result) => result.status === "already")
    if (!winner || !loser) return yield* Effect.die("Expected one winner and one loser")
    expect(winner.notified).toEqual([SessionV1.Event.PromptAdmitted.type])
    expect(loser.notified).toEqual([])
    expect(loser.snapshot).toEqual(winner.snapshot)
    expect(winner.snapshot.info).toMatchObject({
      promptContext: { reminders: [expect.stringMatching(/^worker-[AB]$/)] },
    })
    yield* Effect.gen(function* () {
      const database = yield* Database.Service
      const db = database.db
      expect((yield* PromptAdmission.find(db, payload.messageID))?.snapshot).toEqual(winner.snapshot)
      expect(yield* db.select().from(PromptAdmissionTable).all()).toHaveLength(1)
      expect(yield* db.select().from(MessageTable).all()).toHaveLength(1)
      expect((yield* db.select().from(MessageTable).get())?.data).toMatchObject({
        promptContext: winner.snapshot.info.role === "user" ? winner.snapshot.info.promptContext : undefined,
      })
      expect((yield* db.select().from(PartTable).all()).map((row) => row.data)).toEqual(
        winner.snapshot.parts.map((part) => {
          const { id: _, sessionID: __, messageID: ___, ...data } = part
          return data
        }),
      )
      expect(yield* db.select().from(EventTable).all()).toHaveLength(3)
      expect(yield* EventV2.latestSequence(db, sessionID)).toBe(1)
    }).pipe(Effect.provide(Layer.fresh(databaseLayer)))
  }),
)
