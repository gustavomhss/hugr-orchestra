import { afterEach, describe, expect } from "bun:test"
import { Database } from "@orchestra/core/database/database"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { filesystem } from "@orchestra/core/effect/app-node-platform"
import { EventTable } from "@orchestra/core/event/sql"
import { ProjectTable } from "@orchestra/core/project/sql"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionTable } from "@orchestra/core/session/sql"
import { Effect } from "effect"
import { eq } from "drizzle-orm"
import { Config } from "../../src/config/config"
import { Session } from "../../src/session/session"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Git } from "@/git"
import { SessionID } from "@/session/schema"
import { recordValidation } from "../../src/maestro/validation-record"
import { LEGACY_BACKEND_ID } from "../../src/maestro/roster"
import { disposeAllInstances, TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

afterEach(async () => {
  await disposeAllInstances()
})

const it = testEffect(
  LayerNode.compile(
    LayerNode.group([filesystem, Config.node, Session.node, Database.node, EventV2Bridge.node, Git.node]),
  ),
)

const base = {
  sessionID: "ses_validation",
  planRevisionID: "evt_plan_validation",
  contextRecordID: "evt_context_validation",
  contextHash: "c".repeat(64),
  workCardID: "card_validation",
  workCard: "# Card\nImplement exact behavior.\n",
  routedMemberID: "backend",
  validatorID: "maestro",
  validatorVersion: "validation-v1",
  checks: [{ id: "typecheck", status: "PASS" as const, detail: "clean" }],
}

const prepare = Effect.fn("MaestroValidationLegacyIdTest.prepare")(function* () {
  const test = yield* TestInstance
  const { db } = yield* Database.Service
  const project = yield* db
    .select()
    .from(ProjectTable)
    .where(eq(ProjectTable.worktree, AbsolutePath.make(test.directory)))
    .get()
    .pipe(Effect.orDie)
  if (!project) throw new Error("missing test project")
  yield* db
    .insert(SessionTable)
    .values({
      id: SessionID.make(base.sessionID),
      project_id: project.id,
      slug: base.sessionID,
      directory: test.directory,
      title: "validation",
      version: "test",
      time_created: 1,
      time_updated: 1,
    })
    .onConflictDoNothing()
    .run()
    .pipe(Effect.orDie)
  return { ...base, projectID: project.id }
})

describe("Maestro validation receipt under the former backend id", () => {
  it.instance(
    "routes the former backend id to the backend seat and records it as backend",
    () =>
      Effect.gen(function* () {
        const input = yield* prepare()
        const receipt = yield* recordValidation({ ...input, routedMemberID: LEGACY_BACKEND_ID })
        expect(receipt.routedMemberID).toBe("backend")
        expect(yield* recordValidation(input)).toEqual(receipt)
      }),
    { git: true },
  )

  it.instance(
    "an exact retry of a record routed under the former backend id still matches it",
    () =>
      Effect.gen(function* () {
        const input = yield* prepare()
        const current = yield* recordValidation(input)
        const { db } = yield* Database.Service
        const { id, ...recorded } = current
        // The seat's grant and the roster as an earlier build hashed them, under the former id (at 263a9a27d4).
        const preRename = {
          ...recorded,
          routedMemberID: LEGACY_BACKEND_ID,
          grantHash: "3caa5f971b07cfad4c9647ff7a0ad77d022490d9e0c7cae9f334b7d1412c3928",
          rosterHash: "5a2df5f95e6c6783322fcf59f39af317639f9fdec9ad1a704e4b9ad75661ea3a",
        }
        yield* db.update(EventTable).set({ data: preRename }).where(eq(EventTable.id, id)).run().pipe(Effect.orDie)

        expect(yield* recordValidation(input)).toEqual({ id, ...preRename })
        expect(yield* recordValidation({ ...input, routedMemberID: LEGACY_BACKEND_ID })).toEqual({ id, ...preRename })

        // The former grant hash is accepted only for a record routed under the former id.
        yield* db
          .update(EventTable)
          .set({ data: { ...preRename, routedMemberID: "backend" } })
          .where(eq(EventTable.id, id))
          .run()
          .pipe(Effect.orDie)
        expect(yield* recordValidation(input).pipe(Effect.flip)).toMatchObject({ _tag: "MaestroValidationConflict" })
      }),
    { git: true },
  )
})
