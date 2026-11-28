import fs from "node:fs/promises"
import path from "node:path"
import { Effect } from "effect"
import { Database } from "@orchestra/core/database/database"
import { ProjectDirectories } from "@orchestra/core/project/directories"
import { ProjectTable } from "@orchestra/core/project/sql"
import { Project } from "@orchestra/core/project"
import { AbsolutePath } from "@orchestra/core/schema"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { tmpdir } from "./tmpdir"
import { testEffect } from "../lib/effect"

export const it = testEffect(AppNodeBuilder.build(LayerNode.group([Database.node, ProjectDirectories.node])))

export const setup = Effect.gen(function* () {
  const root = yield* Effect.acquireRelease(
    Effect.promise(() => tmpdir()),
    (value) => Effect.promise(() => value[Symbol.asyncDispose]()),
  )
  const database = yield* Database.Service
  const registrations = yield* ProjectDirectories.Service
  const projectID = Project.ID.make("worktree-readings")
  const directory = AbsolutePath.make(path.join(root.path, "worktree"))
  yield* Effect.promise(() => fs.mkdir(directory))
  yield* database.db
    .insert(ProjectTable)
    .values({ id: projectID, worktree: directory, vcs: "git", sandboxes: [] })
    .run()
    .pipe(Effect.orDie)
  yield* registrations.create({ projectID, directory, strategy: "git_worktree" })
  return {
    root,
    directory,
    projectID,
    database,
    registrations,
    async load() {
      const projects = await Effect.runPromise(database.db.select({ id: ProjectTable.id }).from(ProjectTable).all())
      return (
        await Promise.all(
          projects.map(async (project) =>
            (await Effect.runPromise(registrations.listRegistrations(project.id))).map((row) => ({
              ...row,
              projectID: project.id,
            })),
          ),
        )
      ).flat()
    },
  }
})

// Deadlock assertions must release their real-I/O gates rather than leave the Effect scope pending.
export function bounded<A>(promise: Promise<A>) {
  const timeout = Promise.withResolvers<never>()
  const timer = setTimeout(() => timeout.reject(new Error("Worktree acceptance barrier did not settle")), 10_000)
  return Promise.race([promise, timeout.promise]).finally(() => clearTimeout(timer))
}

export function entered(ready: Promise<void>, requests: readonly Promise<unknown>[]) {
  return bounded(
    Promise.race([
      ready,
      ...requests.map((request) =>
        request.then(() => {
          throw new Error("Worktree request settled before its barrier")
        }),
      ),
    ]),
  )
}

type Gate = { entered: PromiseWithResolvers<void>; release: PromiseWithResolvers<void> }

export function traced(fixture: Effect.Success<typeof setup>) {
  const next: { gate?: Gate } = {}
  const calls = { active: 0, maximum: 0, succeeded: 0 }
  return {
    calls,
    hold() {
      if (next.gate) throw new Error("Another registry barrier is already scheduled")
      const gate = { entered: Promise.withResolvers<void>(), release: Promise.withResolvers<void>() }
      next.gate = gate
      return gate
    },
    async registrations() {
      calls.active++
      calls.maximum = Math.max(calls.maximum, calls.active)
      try {
        const rows = await fixture.load()
        calls.succeeded++
        const gate = next.gate
        delete next.gate
        if (gate) {
          gate.entered.resolve()
          await gate.release.promise
        }
        return rows
      } finally {
        calls.active--
      }
    },
  }
}
