import { InstanceState } from "@/effect/instance-state"
import type { InstanceContext } from "@/project/instance-context"
import { Project } from "@/project/project"
import { ProjectV2 } from "@orchestra/core/project"
import { Database } from "@orchestra/core/database/database"
import { FSUtil } from "@orchestra/core/fs-util"
import { Global } from "@orchestra/core/global"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { Config } from "@/config/config"
import { LeanProject } from "@/session/lean-project"
import { LeanProfilePreferences } from "@/session/lean-profile-preferences"
import { LeanCoverage } from "@orchestra/schema/lean-coverage"
import { LeanDashboard } from "@orchestra/schema/lean-dashboard"
import { LocationServiceMap } from "@orchestra/core/location-services"
import { Location } from "@orchestra/core/location"
import { AbsolutePath } from "@orchestra/core/schema"
import { Effect, Layer } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { InstanceHttpApi } from "../api"
import { ProjectNotFoundError, ServiceUnavailableError } from "../errors"
import { markInstanceForReload } from "../lifecycle"

export const projectHandlers = HttpApiBuilder.group(InstanceHttpApi, "project", (handlers) =>
  Effect.gen(function* () {
    const svc = yield* Project.Service
    const project = yield* ProjectV2.Service
    const config = yield* Config.Service
    const fs = yield* FSUtil.Service
    const global = yield* Global.Service
    const database = yield* Database.Service
    const locations = yield* LocationServiceMap.Service
    const preferences = LeanProfilePreferences.make(fs, global)
    const collector = LeanProject.make(database)

    const owner = Effect.fnUntraced(function* () {
      const context = yield* InstanceState.context
      return { projectID: context.project.id, directory: context.directory }
    })
    const unavailable = (error: LeanProfilePreferences.Unavailable) =>
      new ServiceUnavailableError({ service: "lean", message: error.message })
    const lean = Effect.fn("ProjectHttpApi.lean")(function* () {
      const state = yield* preferences.read(yield* owner())
      const cfg = yield* config.get()
      return yield* collector.read(state, cfg.tool_output?.lean?.enabled !== false)
    }, Effect.mapError(unavailable))
    const leanUpdate = Effect.fn("ProjectHttpApi.leanUpdate")(function* (ctx: { payload: LeanDashboard.Update }) {
      const state = yield* preferences.update(yield* owner(), ctx.payload)
      const cfg = yield* config.get()
      return yield* collector.read(state, cfg.tool_output?.lean?.enabled !== false)
    }, Effect.mapError(unavailable))
    const leanHistory = Effect.fn("ProjectHttpApi.leanHistory")(function* (ctx: { params: { itemID: LeanCoverage.ItemID } }) {
      const state = yield* preferences.read(yield* owner())
      return yield* collector.history(state.scope, ctx.params.itemID)
    }, Effect.mapError(unavailable))

    const list = Effect.fn("ProjectHttpApi.list")(function* () {
      return yield* svc.list()
    })

    const current = Effect.fn("ProjectHttpApi.current")(function* () {
      const ctx = yield* InstanceState.context
      if (ctx.project.id !== ProjectV2.ID.global) return ctx.project
      // A folder that had no git commit when its instance started shares the "global" project. Once a first commit
      // exists (made outside the app too) it has its own identity: resolve again and move the instance onto it.
      const { project: next } = yield* svc.fromDirectory(ctx.directory)
      if (next.id === ProjectV2.ID.global) return ctx.project
      yield* moveProject(ctx, next.worktree, next)
      return next
    })

    const initGit = Effect.fn("ProjectHttpApi.initGit")(function* () {
      const ctx = yield* InstanceState.context
      const next = yield* svc.initGit({ directory: ctx.directory, project: ctx.project })
      if (next.id === ctx.project.id && next.vcs === ctx.project.vcs && next.worktree === ctx.project.worktree)
        return next
      yield* moveProject(ctx, ctx.directory, next)
      return next
    })

    // A Location is cached per directory with the project it was opened under. When the directory's project changes,
    // drop it first (both Ref shapes hash apart), or the reloaded instance and its Location disagree on the project.
    const moveProject = Effect.fnUntraced(function* (
      ctx: InstanceContext,
      worktree: string,
      next: Project.Info,
    ) {
      const directory = AbsolutePath.make(ctx.directory)
      // Started immediately, invalidate drops the cached entry before this request goes on; closing the old services
      // waits for work this request still holds, so it finishes in the background instead of inside the request.
      if (next.id !== ctx.project.id)
        for (const ref of [Location.Ref.make({ directory }), Location.Ref.make({ directory, workspaceID: undefined })])
          yield* locations.invalidate(ref).pipe(Effect.forkDetach({ startImmediately: true }))
      yield* markInstanceForReload(ctx, { directory: ctx.directory, worktree, project: next })
    })

    const update = Effect.fn("ProjectHttpApi.update")(function* (ctx: {
      params: { projectID: ProjectV2.ID }
      payload: Project.UpdatePayload
    }) {
      return yield* svc.update({ ...ctx.payload, projectID: ctx.params.projectID }).pipe(
        Effect.catchTag("Project.NotFoundError", (error) =>
          Effect.fail(
            new ProjectNotFoundError({
              projectID: error.projectID,
              message: `Project not found: ${error.projectID}`,
            }),
          ),
        ),
      )
    })

    const directories = Effect.fn("ProjectHttpApi.directories")((ctx: { params: { projectID: ProjectV2.ID } }) =>
      project.directories({ projectID: ctx.params.projectID }),
    )

    return handlers
      .handle("lean", lean)
      .handle("leanUpdate", leanUpdate)
      .handle("leanHistory", leanHistory)
      .handle("list", list)
      .handle("current", current)
      .handle("initGit", initGit)
      .handle("update", update)
      .handle("directories", directories)
  }),
).pipe(Layer.provide(LayerNode.compile(Global.node)))
