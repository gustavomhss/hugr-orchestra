export * as ProjectV2 from "./project"
export * as Project from "./project"

import { asc, eq } from "drizzle-orm"
import { Context, Effect, Layer, Schema } from "effect"
import path from "path"
import { Project as ProjectInfo } from "@orchestra/schema/project"
import { Database } from "./database/database"
import type { EventV2 } from "./event"
import type { GitCli } from "./git-cli"
import { AbsolutePath } from "./schema"
import { FSUtil } from "./fs-util"
import { Git } from "./git"
import { makeGlobalNode } from "./effect/app-node"
import { Hash } from "./util/hash"
import { ProjectDirectories } from "./project/directories"
import { ProjectSchema } from "./project/schema"
import { ProjectTable } from "./project/sql"

export const ID = ProjectSchema.ID
export type ID = ProjectSchema.ID

export const Vcs = ProjectSchema.Vcs
export type Vcs = ProjectSchema.Vcs

/**
 * True for the shared project of a directory outside any repository, whose directory `resolve` sets to the
 * filesystem root: `/`, or a drive root such as `C:\` on Windows. Its directories are the Location's own, not the root.
 */
export const isRoot = (directory: string, paths: path.PlatformPath = path) => paths.parse(directory).root === directory

export class Info extends Schema.Class<Info>("Project.Info")({
  id: ID,
}) {}

export const DirectoriesInput = ProjectDirectories.ListInput
export type DirectoriesInput = typeof DirectoriesInput.Type

export const Directories = ProjectDirectories.ListOutput
export type Directories = typeof Directories.Type

export interface Resolved {
  readonly previous?: ID
  readonly id: ID
  readonly directory: AbsolutePath
  readonly vcs?: Vcs
}

export interface Interface {
  /** Every project this database knows, oldest first. */
  readonly list: () => Effect.Effect<ProjectInfo.Info[]>
  readonly directories: (input: DirectoriesInput) => Effect.Effect<Directories>
  readonly resolve: (input: AbsolutePath) => Effect.Effect<Resolved>
  /**
   * Temporary bridge method for writing the resolved project ID to the repo-local cache.
   *
   * This exists while the legacy project service and this core project
   * service work together: core resolves the ID, while the old service still owns
   * database migration and persistence. The old service should call this after it
   * finishes migrating from `resolve().previous` to `resolve().id`; once project
   * persistence moves into core, this separate bridge method can go away.
   */
  readonly commit: (input: { store: AbsolutePath; id: ID }) => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@orchestra/ProjectV2") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const git = yield* Git.Service
    const projectDirectories = yield* ProjectDirectories.Service
    const db = (yield* Database.Service).db

    const list = Effect.fn("Project.list")(function* () {
      const rows = yield* db.select().from(ProjectTable).orderBy(asc(ProjectTable.time_created)).all().pipe(Effect.orDie)
      return rows.map(toInfo)
    })

    const directories = Effect.fn("Project.directories")(function* (input: DirectoriesInput) {
      return yield* projectDirectories.list(input.projectID)
    })

    const cached = Effect.fnUntraced(function* (dir: string) {
      return yield* fs.readFileString(path.join(dir, "orchestra")).pipe(
        Effect.map((value) => value.trim()),
        Effect.map((value) => (value ? ID.make(value) : undefined)),
        Effect.catch(() => Effect.succeed(undefined)),
      )
    })

    const remote = Effect.fnUntraced(function* (repo: Git.Repository) {
      const origin = yield* git.remote.get(repo)
      if (!origin) return undefined
      const normalized = url(origin)
      if (!normalized) return undefined
      return ID.make(Hash.fast(`git-remote:${normalized}`))
    })

    function url(input: string) {
      const value = input.trim()
      if (!value) return undefined

      try {
        const parsed = new URL(value)
        if (parsed.protocol === "file:") return undefined
        return parts(parsed.hostname, parsed.pathname)
      } catch {
        const scp = value.match(/^([^@/:]+@)?([^/:]+):(.+)$/)
        if (scp) return parts(scp[2], scp[3])
        return undefined
      }
    }

    function parts(host: string, name: string) {
      const pathname = name
        .replace(/^\/+/, "")
        .replace(/\.git\/?$/, "")
        .replace(/\/+$/, "")
      if (!host || !pathname) return undefined
      return `${host.toLowerCase()}/${pathname}`
    }

    const root = Effect.fnUntraced(function* (repo: Git.Repository) {
      const root = (yield* git.history.rootCommits(repo))[0]
      return root ? ID.make(root) : undefined
    })

    const resolve = Effect.fn("Project.resolve")(function* (input: AbsolutePath) {
      const repo = yield* git.repo.discover(input)
      if (!repo) return { id: ID.global, directory: AbsolutePath.make(path.parse(input).root), vcs: undefined }

      const previous = yield* cached(repo.commonDirectory)
      const id = (yield* remote(repo)) ?? previous ?? (yield* root(repo))
      return {
        previous,
        id: id ?? ID.global,
        directory: repo.worktree,
        vcs: { type: "git" as const, store: repo.commonDirectory },
      }
    })

    const commit = Effect.fn("Project.commit")(function* (input: { store: AbsolutePath; id: ID }) {
      yield* fs.writeFileString(path.join(input.store, "orchestra"), input.id).pipe(Effect.ignore)
    })

    return Service.of({ list, directories, resolve, commit })
  }),
)

const toInfo = (row: typeof ProjectTable.$inferSelect): ProjectInfo.Info => ({
  id: row.id,
  worktree: row.worktree,
  vcs: row.vcs === "git" ? "git" : undefined,
  name: row.name ?? undefined,
  icon:
    row.icon_url || row.icon_url_override || row.icon_color
      ? {
          url: row.icon_url ?? undefined,
          override: row.icon_url_override ?? undefined,
          color: row.icon_color ?? undefined,
        }
      : undefined,
  commands: row.commands ?? undefined,
  time: { created: row.time_created, updated: row.time_updated, initialized: row.time_initialized ?? undefined },
  sandboxes: row.sandboxes,
})

/**
 * Records a resolved project for the project list with its version control, as opening a directory did on the earlier runtime, and
 * announces a new project or a newly found repository with `project.updated`.
 */
export const record = Effect.fn("Project.record")(function* (
  db: Database.Interface["db"],
  events: EventV2.Interface,
  project: Resolved,
) {
  const existing = yield* db.select().from(ProjectTable).where(eq(ProjectTable.id, project.id)).get().pipe(Effect.orDie)
  const vcs = project.vcs?.type
  if (existing && (!vcs || existing.vcs === vcs)) return
  if (existing) yield* db.update(ProjectTable).set({ vcs }).where(eq(ProjectTable.id, project.id)).run().pipe(Effect.orDie)
  if (!existing)
    yield* db
      .insert(ProjectTable)
      .values({ id: project.id, worktree: project.directory, vcs, sandboxes: [] })
      .onConflictDoNothing()
      .run()
      .pipe(Effect.orDie)
  const row = yield* db.select().from(ProjectTable).where(eq(ProjectTable.id, project.id)).get().pipe(Effect.orDie)
  if (row) yield* events.publish(ProjectInfo.Event.Updated, toInfo(row))
})

/** Renames a project or changes its icon or start command, as the app's project editor does; undefined when unknown. */
export const update = Effect.fn("Project.update")(function* (
  db: Database.Interface["db"],
  events: EventV2.Interface,
  input: {
    readonly projectID: ID
    readonly name?: string
    readonly icon?: { readonly color?: string; readonly override?: string }
    readonly commands?: { readonly start?: string }
  },
) {
  const row = yield* db
    .update(ProjectTable)
    .set({
      name: input.name,
      icon_url_override: input.icon?.override,
      icon_color: input.icon?.color,
      commands: input.commands,
      time_updated: Date.now(),
    })
    .where(eq(ProjectTable.id, input.projectID))
    .returning()
    .get()
    .pipe(Effect.orDie)
  if (!row) return
  const info = toInfo(row)
  yield* events.publish(ProjectInfo.Event.Updated, info)
  return info
})

/**
 * Makes a folder a git repository with an empty first commit, so it has a project identity at once; without
 * a configured git identity the commit is authored as Orchestra. Returns the recorded project.
 */
export const initGit = Effect.fn("Project.initGit")(function* (
  services: {
    readonly db: Database.Interface["db"]
    readonly events: EventV2.Interface
    readonly git: GitCli.Interface
    readonly projects: Interface
  },
  directory: AbsolutePath,
) {
  const init = yield* services.git.run(["init", "--quiet"], { cwd: directory })
  if (init.exitCode !== 0) return yield* Effect.die(new Error(init.stderr.toString().trim() || "git init failed"))
  const first = ["commit", "--allow-empty", "--no-verify", "--quiet", "-m", "Initial commit"]
  const committed = yield* services.git.run(first, { cwd: directory })
  if (committed.exitCode !== 0)
    yield* services.git.run(["-c", "user.name=Orchestra", "-c", "user.email=orchestra@localhost", ...first], {
      cwd: directory,
    })
  const project = yield* services.projects.resolve(directory)
  yield* record(services.db, services.events, project)
  const row = yield* services.db.select().from(ProjectTable).where(eq(ProjectTable.id, project.id)).get().pipe(Effect.orDie)
  return row ? toInfo(row) : undefined
})

export const node = makeGlobalNode({
  service: Service,
  layer: layer,
  deps: [FSUtil.node, Git.node, ProjectDirectories.node, Database.node],
})
