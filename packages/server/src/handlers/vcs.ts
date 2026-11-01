import { Database } from "@orchestra/core/database/database"
import { GitCli } from "@orchestra/core/git-cli"
import { Location } from "@orchestra/core/location"
import { ProjectV2 } from "@orchestra/core/project"
import { SessionActivity } from "@orchestra/core/session"
import { Vcs } from "@orchestra/core/vcs"
import { Clock, Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../api"
import { response } from "../location"

// The version-control and activity answers the earlier runtime gave, read from git per request in the requested location.
export const VcsHandler = HttpApiBuilder.group(Api, "server.vcs", (handlers) =>
  Effect.gen(function* () {
    const git = yield* GitCli.Service
    const database = yield* Database.Service
    const branches = Effect.fnUntraced(function* (directory: string) {
      const [current, root] = yield* Effect.all([git.cached.branch(directory), git.cached.defaultBranch(directory)], {
        concurrency: 2,
      })
      return { current, root }
    })
    return handlers
      .handle("vcs.get", () =>
        response(
          Effect.gen(function* () {
            const location = yield* Location.Service
            if (location.vcs?.type !== "git") return {}
            const found = yield* branches(location.directory)
            return { branch: found.current, default_branch: found.root?.name }
          }),
        ),
      )
      .handle("vcs.status", () =>
        response(
          Effect.gen(function* () {
            const location = yield* Location.Service
            if (location.vcs?.type !== "git") return []
            return yield* Vcs.status(git, location.directory, location.project.directory)
          }),
        ),
      )
      .handle("vcs.diff", (ctx) =>
        response(
          Effect.gen(function* () {
            const location = yield* Location.Service
            if (location.vcs?.type !== "git") return []
            return yield* Vcs.diff(
              git,
              location.directory,
              ctx.query.mode === "working" ? "git" : "branch",
              ctx.query.mode === "branch" ? yield* branches(location.directory) : {},
              { context: ctx.query.context },
            )
          }),
        ),
      )
      .handle("vcs.activity", (ctx) =>
        response(
          Effect.gen(function* () {
            const location = yield* Location.Service
            const repository = location.vcs?.type === "git"
            return yield* Vcs.activity(
              git,
              location.directory,
              { since: ctx.query.since, until: ctx.query.until },
              repository,
              repository ? yield* git.cached.defaultBranch(location.directory) : undefined,
            )
          }),
        ),
      )
      .handle("vcs.sessionActivity", (ctx) =>
        response(
          Effect.gen(function* () {
            const location = yield* Location.Service
            // Non-git directories share the global project, so they are scoped to their own directory.
            const scope =
              location.project.id === ProjectV2.ID.global
                ? { directory: location.directory }
                : { projectID: location.project.id }
            return yield* SessionActivity.collect({
              scope,
              period: ctx.query.period,
              now: yield* Clock.currentTimeMillis,
            }).pipe(Effect.provideService(Database.Service, database))
          }),
        ),
      )
  }),
)
