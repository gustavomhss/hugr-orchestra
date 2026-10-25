export * as ScheduledTaskShared from "./shared"

import { and, desc, eq, inArray } from "drizzle-orm"
import { Effect, Schema } from "effect"
import type { ScheduledTask } from "@orchestra/schema/scheduled-task"
import type { Database } from "../database/database"
import type { AbsolutePath } from "../schema"
import { SessionV2 } from "../session"
import { SessionMessage } from "../session/message"
import { ScheduledTaskModel } from "./model"
import { ScheduledTaskRunTable, ScheduledTaskTable } from "./sql"

export class NotFoundError extends Schema.TaggedErrorClass<NotFoundError>()("ScheduledTask.NotFoundError", {
  id: Schema.String,
}) {}

export class InvalidError extends Schema.TaggedErrorClass<InvalidError>()("ScheduledTask.InvalidError", {
  field: Schema.String,
  message: Schema.String,
}) {}

export class ConflictError extends Schema.TaggedErrorClass<ConflictError>()("ScheduledTask.ConflictError", {
  id: Schema.String,
}) {}

export class RunError extends Schema.TaggedErrorClass<RunError>()("ScheduledTask.RunError", {
  reason: Schema.String,
}) {}

export type Task = typeof ScheduledTaskTable.$inferSelect
export type LegacyTask = Task & { cadence: ScheduledTask.Cadence }
export type RunRow = typeof ScheduledTaskRunTable.$inferSelect
export type Claim = {
  readonly id: string
  readonly task: Task
  readonly sessionID: SessionV2.ID
  readonly messageID: SessionMessage.ID
  readonly prompt: string
}
export type Outcome =
  | { type: "started"; sessionID: SessionV2.ID }
  | { type: "failed"; error: string }
  | { type: "revoked" }
  | { type: "void" }

export const LEGACY = eq(ScheduledTaskTable.policy, "legacy-browser")

export type Store = ReturnType<typeof store>

// The rows both policies share. `lease` marks this process's claims: a restarted process takes its old claims
// over once their lease ends.
export function store(db: Database.Interface["db"], lease: string) {
  const immediate = <A, E>(effect: Effect.Effect<A, E>) =>
    db.transaction(() => effect, { behavior: "immediate" }).pipe(Effect.orDie)

  // A directory-scoped lookup serves the legacy routes, which never see capability rows.
  const find = (id: ScheduledTask.ID, directory?: AbsolutePath) =>
    db
      .select()
      .from(ScheduledTaskTable)
      .where(
        directory
          ? and(eq(ScheduledTaskTable.id, id), eq(ScheduledTaskTable.directory, directory), LEGACY)
          : eq(ScheduledTaskTable.id, id),
      )
      .get()

  const lastRuns = (tasks: Task[]) =>
    tasks.length === 0
      ? Effect.succeed([])
      : db
          .select()
          .from(ScheduledTaskRunTable)
          .where(
            and(
              inArray(
                ScheduledTaskRunTable.task_id,
                tasks.map((task) => task.id),
              ),
              inArray(ScheduledTaskRunTable.state, ["started", "failed"]),
            ),
          )
          .orderBy(desc(ScheduledTaskRunTable.time_settled))
          .all()
          .pipe(Effect.orDie)

  const advance = (task: Task, set: Partial<Task>, now: number) =>
    db
      .update(ScheduledTaskTable)
      .set({ ...set, time_updated: now })
      .where(eq(ScheduledTaskTable.id, task.id))
      .run()

  const claim = Effect.fn("ScheduledTask.claim")(function* (
    task: Task,
    slot: number | undefined,
    now: number,
    manualKey?: string,
  ) {
    // Capability IDs derive from (task, revision, slot) or the manual key, so an edit never reuses a Session.
    const ids =
      task.policy === "capability"
        ? ScheduledTaskModel.slotIDs(
            slot === undefined ? `${task.id}:manual:${manualKey}` : `${task.id}:${task.revision}`,
            slot ?? task.time_created,
          )
        : slot === undefined
          ? undefined
          : ScheduledTaskModel.slotIDs(task.id, slot)
    const claimed = {
      id: crypto.randomUUID(),
      task,
      sessionID: ids ? SessionV2.ID.make(ids.session) : SessionV2.ID.create(),
      messageID: ids ? SessionMessage.ID.make(ids.message) : SessionMessage.ID.create(),
      prompt: task.prompt,
    }
    yield* db
      .insert(ScheduledTaskRunTable)
      .values({
        id: claimed.id,
        task_id: task.id,
        slot: slot ?? null,
        revision: task.revision,
        manual_key: manualKey ?? null,
        state: "running",
        session_id: claimed.sessionID,
        message_id: claimed.messageID,
        prompt: claimed.prompt,
        owner: lease,
        time_claimed: now,
      })
      .run()
    return claimed
  })

  return { db, lease, immediate, find, lastRuns, advance, claim }
}

export function toRun(run: RunRow): ScheduledTask.Run {
  const time = run.time_settled ?? run.time_claimed
  const slot = run.slot === null ? {} : { slot: run.slot }
  if (run.state === "failed") return { outcome: "failed", time, ...slot, error: run.error ?? "" }
  return { outcome: "started", time, ...slot, sessionID: run.session_id }
}
