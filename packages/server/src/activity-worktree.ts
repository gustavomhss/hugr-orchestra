export * as ActivityWorktreeRegistry from "./activity-worktree"

import { ActivityWorktree } from "@orchestra/core/activity-worktree"
import type { ActivityDisk } from "@orchestra/core/activity-disk"
import { Database } from "@orchestra/core/database/database"
import { ProjectTable, ProjectDirectoryTable } from "@orchestra/core/project/sql"
import { and, eq } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"

export class Service extends Context.Service<Service, ActivityWorktree.Monitor>()(
  "@orchestra/server/ActivityWorktreeRegistry",
) {}

export function layer(input: { measure?: typeof ActivityDisk.measure; afterRegistryRead?: () => Promise<void> } = {}) {
  return Layer.effect(
    Service,
    Effect.gen(function* () {
      const database = yield* Database.Service
      return ActivityWorktree.make({
        ...(input.measure !== undefined ? { measure: input.measure } : {}),
        registrations: async () => {
          const rows = await Effect.runPromise(
            database.db
              .select({
                projectID: ProjectDirectoryTable.project_id,
                directory: ProjectDirectoryTable.directory,
                registrationID: ProjectDirectoryTable.registration_id,
              })
              .from(ProjectDirectoryTable)
              .innerJoin(ProjectTable, eq(ProjectTable.id, ProjectDirectoryTable.project_id))
              .where(and(eq(ProjectTable.vcs, "git"), eq(ProjectDirectoryTable.strategy, "git_worktree"))),
          )
          await input.afterRegistryRead?.()
          return rows.map((row) => ({ ...row, strategy: "git_worktree" }))
        },
      })
    }),
  )
}
