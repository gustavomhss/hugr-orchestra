import { afterEach, describe, expect } from "bun:test"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { FSUtil } from "@orchestra/core/fs-util"
import { $ } from "bun"
import { Effect, Layer } from "effect"
import { HttpClientResponse } from "effect/unstable/http"
import { InstanceRef } from "../../src/effect/instance-ref"
import { InstanceBootstrap } from "../../src/project/bootstrap"
import { InstanceStore } from "../../src/project/instance-store"
import { GlobalBus, type GlobalEvent } from "../../src/bus/global"
import { Snapshot } from "../../src/snapshot"
import { resetDatabase } from "../fixture/db"
import { disposeAllInstances, gitInit, TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { httpApiLayer, requestInDirectory } from "./httpapi-layer"

afterEach(async () => {
  await disposeAllInstances()
  await resetDatabase()
})

const noopBootstrap = Layer.succeed(InstanceBootstrap.Service, InstanceBootstrap.Service.of({ run: Effect.void }))
const testInstanceStore = AppNodeBuilder.build(InstanceStore.node, [[InstanceStore.bootstrapNode, noopBootstrap]])

const it = testEffect(
  Layer.mergeAll(AppNodeBuilder.build(LayerNode.group([FSUtil.node, Snapshot.node])), testInstanceStore, httpApiLayer),
)

function request(directory: string, url: string, init: RequestInit = {}) {
  return requestInDirectory(url, directory, init)
}

function json<T>(response: HttpClientResponse.HttpClientResponse) {
  return response.json.pipe(Effect.map((value) => value as T))
}

function collectGlobalEvents() {
  return Effect.acquireRelease(
    Effect.sync(() => {
      const seen: GlobalEvent[] = []
      const on = (event: GlobalEvent) => {
        seen.push(event)
      }
      GlobalBus.on("event", on)
      return { seen, on }
    }),
    ({ on }) => Effect.sync(() => GlobalBus.off("event", on)),
  )
}

const disposedEvents = (seen: GlobalEvent[], dir: string) =>
  seen.filter((evt) => evt.directory === dir && evt.payload.type === "server.instance.disposed").length

describe("project.initGit endpoint", () => {
  it.instance("initializes git with a first commit and reloads immediately", () =>
    Effect.gen(function* () {
      const tmp = yield* TestInstance
      const events = yield* collectGlobalEvents()

      const init = yield* request(tmp.directory, "/project/git/init", {
        method: "POST",
      })
      const body = yield* json<{ id: string }>(init)
      expect(init.status).toBe(200)
      // The empty first commit gives the folder its project identity right away.
      expect(body).toMatchObject({ vcs: "git", worktree: tmp.directory })
      expect(body.id).toMatch(/^[0-9a-f]{40}$/)
      // Reload behavior: bus emits exactly one server.instance.disposed for the directory.
      expect(disposedEvents(events.seen, tmp.directory)).toBe(1)

      const current = yield* request(tmp.directory, "/project/current")
      expect(current.status).toBe(200)
      expect(yield* json(current)).toMatchObject({ id: body.id, vcs: "git", worktree: tmp.directory })

      const ctx = yield* InstanceStore.use.reload({ directory: tmp.directory })
      const tracked = yield* Snapshot.Service.use((snapshot) => snapshot.track()).pipe(
        Effect.provideService(InstanceRef, ctx),
      )
      expect(tracked).toBeTruthy()
    }),
  )

  it.instance("a first commit made outside the app gives the folder its own project", () =>
    Effect.gen(function* () {
      const tmp = yield* TestInstance
      const before = yield* request(tmp.directory, "/project/current")
      expect(yield* json(before)).toMatchObject({ id: "global" })

      // The person initializes and commits in a terminal while the instance still holds the "global" project.
      yield* Effect.promise(async () => {
        await gitInit(tmp.directory)
        await $`git -c user.name=t -c user.email=t@t commit --allow-empty -m first`.cwd(tmp.directory).quiet()
      })
      const after = yield* request(tmp.directory, "/project/current")
      expect(after.status).toBe(200)
      expect((yield* json<{ id: string }>(after)).id).toMatch(/^[0-9a-f]{40}$/)
    }),
  )

  it.instance(
    "does not reload when the project is already git",
    () =>
      Effect.gen(function* () {
        const tmp = yield* TestInstance
        const events = yield* collectGlobalEvents()

        const init = yield* request(tmp.directory, "/project/git/init", {
          method: "POST",
        })
        expect(init.status).toBe(200)
        expect(yield* json(init)).toMatchObject({
          vcs: "git",
          worktree: tmp.directory,
        })
        expect(disposedEvents(events.seen, tmp.directory)).toBe(0)

        const current = yield* request(tmp.directory, "/project/current")
        expect(current.status).toBe(200)
        expect(yield* json(current)).toMatchObject({
          vcs: "git",
          worktree: tmp.directory,
        })
      }),
    { git: true },
  )
})
