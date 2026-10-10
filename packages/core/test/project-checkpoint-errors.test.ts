import { expect } from "bun:test"
import { Cause, Effect, Layer } from "effect"
import { Database } from "@orchestra/core/database/database"
import { ProjectCheckpoint } from "@orchestra/core/project/checkpoint"
import { ProjectCheckpointTable } from "@orchestra/core/project/checkpoint.sql"
import { ProjectSchema } from "@orchestra/core/project/schema"
import { ProjectTable } from "@orchestra/core/project/sql"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionSchema } from "@orchestra/core/session/schema"
import { SessionTable } from "@orchestra/core/session/sql"
import { testEffect } from "./lib/effect"

const it = testEffect(ProjectCheckpoint.layer.pipe(Layer.provideMerge(Database.layerFromPath(":memory:"))))

it.live("checkpoint storage sanitizes a proven driver error containing private context", () => Effect.gen(function* () {
  const database = yield* Database.Service
  const store = yield* ProjectCheckpoint.Service
  const projectID = ProjectSchema.ID.make("checkpoint-errors")
  const sessionID = SessionSchema.ID.make("ses_checkpoint_errors")
  const directory = AbsolutePath.make("/checkpoint-errors")
  const secret = "CHECKPOINT_PRIVATE_DRIVER_CONTROL"
  yield* database.db.insert(ProjectTable).values({ id: projectID, worktree: directory, sandboxes: [] }).run()
  yield* database.db.insert(SessionTable).values({ id: sessionID, project_id: projectID, directory,
    slug: "checkpoint-errors", title: "Checkpoint errors", version: "1" }).run()
  yield* database.db.run(`CREATE TRIGGER checkpoint_private BEFORE INSERT ON project_checkpoint
    BEGIN SELECT RAISE(ABORT, '${secret}'); END`)
  const raw = yield* database.db.insert(ProjectCheckpointTable).values({ id: "raw:0", project_id: projectID,
    session_id: sessionID, fork_id: "raw", boundary: "msg_boundary", attempt: 0, directory,
    time_created: 1, digest: "synthetic", payload: JSON.stringify(secret) }).run().pipe(Effect.exit)
  expect(raw._tag).toBe("Failure")
  if (raw._tag !== "Failure") throw new Error("Missing private-error positive control")
  expect(Cause.pretty(raw.cause)).toContain(secret)
  const input = { sessionID, forkID: "saved", boundary: "msg_boundary", attempt: 0 as const, payload: JSON.stringify(secret) }
  const error = yield* store.save(input).pipe(Effect.flip)
  expect(error.reason).toBe("storage")
  expect(String(error)).not.toContain(secret)
  expect(error.message).not.toContain(secret)
  expect(JSON.stringify(error)).not.toContain(secret)
  expect(Reflect.get(error, "cause")).toBeUndefined()
  expect((yield* store.list({ projectID })).items).toEqual([])
  yield* database.db.run("DROP TRIGGER checkpoint_private")
  const saved = yield* store.save(input)
  expect((yield* store.read({ projectID, id: saved.id }))?.payload).toBe(input.payload)
}))
