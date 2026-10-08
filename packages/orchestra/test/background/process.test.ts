import { describe, expect } from "bun:test"
import { NodeHttpServer } from "@effect/platform-node"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { Flag } from "@orchestra/core/flag/flag"
import { Omni, type Child } from "@orchestra/core/omni"
import { OmniAdoption } from "@orchestra/core/omni-adoption"
import { Effect, Exit, Layer } from "effect"
import { HttpRouter } from "effect/unstable/http"
import { HttpApi, HttpApiBuilder } from "effect/unstable/httpapi"
import { Account } from "../../src/account/account"
import { Auth } from "../../src/auth"
import { BackgroundProcess } from "@/background/process"
import { InstanceRef } from "@/effect/instance-ref"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { Npm } from "@orchestra/core/npm"
import { SessionProjector } from "@orchestra/core/session/projector"
import { SessionProcessApi, SessionProcessPaths } from "@/server/routes/instance/httpapi/groups/session-process"
import { sessionProcessHandlers } from "@/server/routes/instance/httpapi/handlers/session-process"
import { Authorization } from "@/server/routes/instance/httpapi/middleware/authorization"
import { InstanceContextMiddleware } from "@/server/routes/instance/httpapi/middleware/instance-context"
import { schemaErrorLayer } from "@/server/routes/instance/httpapi/middleware/schema-error"
import {
  WorkspaceRouteContext,
  WorkspaceRoutingMiddleware,
} from "@/server/routes/instance/httpapi/middleware/workspace-routing"
import { SessionRunState } from "@/session/run-state"
import { Session } from "@/session/session"
import { alive, gone, reap, sweep, tree } from "../../../core/test/fixture/process-tree"
import { AccountTest } from "../fake/account"
import { AuthTest } from "../fake/auth"
import { NpmTest } from "../fake/npm"
import { TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { requestInDirectory } from "../server/httpapi-layer"

const it = testEffect(
  AppNodeBuilder.build(
    LayerNode.group([BackgroundProcess.node, Session.node, SessionProjector.node, SessionRunState.node]),
    [
      [Auth.node, AuthTest.empty],
      [Account.node, AccountTest.empty],
      [Npm.node, NpmTest.noop],
      [RuntimeFlags.node, RuntimeFlags.layer({ disableDefaultPlugins: true })],
    ],
  ),
)

/** A tree that stays alive until stop(); records how often it was stopped. */
function fake() {
  const state = { alive: true, stops: 0 }
  const child = {
    pid: 4201,
    processes: async () => (state.alive ? [{ pid: 4201, parentPid: null, name: "fake" }] : []),
    stop: async () => {
      state.stops++
      state.alive = false
      return { exitCode: null, signal: "SIGTERM", reason: "killed", success: false }
    },
  } as unknown as Child
  return { child, state }
}

/** The real session process routes, served over HTTP with the test's registry and instance. */
const serve = Effect.gen(function* () {
  const instance = yield* InstanceRef
  if (!instance) throw new Error("Expected test instance")
  const processes = yield* BackgroundProcess.Service
  const routes = HttpApiBuilder.layer(HttpApi.make("orchestra-instance").addHttpApi(SessionProcessApi)).pipe(
    Layer.provide(sessionProcessHandlers),
    Layer.provide(schemaErrorLayer),
    Layer.provide([
      Layer.succeed(BackgroundProcess.Service, processes),
      Layer.succeed(
        Authorization,
        Authorization.of((effect) => effect),
      ),
      Layer.succeed(
        InstanceContextMiddleware,
        InstanceContextMiddleware.of((effect) => effect.pipe(Effect.provideService(InstanceRef, instance))),
      ),
      Layer.succeed(
        WorkspaceRoutingMiddleware,
        WorkspaceRoutingMiddleware.of((effect) =>
          effect.pipe(Effect.provideService(WorkspaceRouteContext, { directory: instance.directory })),
        ),
      ),
    ]),
  )
  return yield* Layer.build(
    HttpRouter.serve(routes, { disableListenLog: true, disableLogger: true }).pipe(
      Layer.provideMerge(NodeHttpServer.layerTest),
    ),
  )
})

describe("background processes", () => {
  it.instance("survive the user's cancel (Esc) and stop when the session is removed", () =>
    Effect.gen(function* () {
      const processes = yield* BackgroundProcess.Service
      const sessions = yield* Session.Service
      const runState = yield* SessionRunState.Service
      const session = yield* sessions.create({})
      const kept = yield* sessions.create({})
      const tree = fake()
      const other = fake()
      yield* processes.register(tree.child, { sessionID: session.id, title: "npm run dev" })
      yield* processes.register(other.child, { sessionID: kept.id, title: "other" })

      yield* runState.cancel(session.id)
      expect(tree.state.stops).toBe(0)
      expect((yield* processes.list(session.id)).map((item) => item.title)).toEqual(["npm run dev"])

      yield* sessions.remove(session.id)
      expect(tree.state.stops).toBe(1)
      expect(yield* processes.list(session.id)).toEqual([])
      expect(other.state.stops).toBe(0)
      expect((yield* processes.list(kept.id)).map((item) => item.title)).toEqual(["other"])
    }),
  )

  it.instance("the shell tool's hook provides adoption only with the omni flag on", () =>
    Effect.gen(function* () {
      const adoptable = yield* BackgroundProcess.adoptable
      const read = Effect.serviceOption(OmniAdoption.Service).pipe(adoptable("ses_hook"))
      const saved = process.env.ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          if (saved === undefined) delete process.env.ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER
          else process.env.ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER = saved
        }),
      )
      process.env.ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER = "0"
      expect((yield* read)._tag).toBe("None")
      process.env.ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER = "1"
      expect(yield* read).toMatchObject({ _tag: "Some", value: { sessionID: "ses_hook", policy: "tool" } })

      // Through the frozen release seam: a successful scope adopts into this registry, an interrupted one stops.
      const processes = yield* BackgroundProcess.Service
      const adopted = fake()
      yield* OmniAdoption.release(adopted.child, Exit.void, { title: "dev", graceMs: 100 }).pipe(adoptable("ses_hook"))
      expect((yield* processes.list("ses_hook")).map((item) => item.title)).toEqual(["dev"])
      const interrupted = fake()
      yield* OmniAdoption.release(interrupted.child, Exit.interrupt(0), { title: "x", graceMs: 100 }).pipe(
        adoptable("ses_hook"),
      )
      expect(interrupted.state.stops).toBe(1)
      expect(yield* processes.list("ses_hook")).toHaveLength(1)
      yield* processes.stopSession("ses_hook")
      expect(adopted.state.stops).toBe(1)
    }),
  )

  // The real omni and the nonce tree: a live tree is listed through the route, then stopped through it, and none of
  // its processes survive.
  const omni = Flag.ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER === "off" ? it.instance.skip : it.instance
  omni(
    "a live omni tree is listed by the route and stopped by it",
    () =>
      Effect.gen(function* () {
        const instance = yield* TestInstance
        const processes = yield* BackgroundProcess.Service
        const sessions = yield* Session.Service
        const session = yield* sessions.create({})
        const fixture = tree(2)
        yield* Effect.addFinalizer(() => Effect.promise(() => reap(fixture.nonce)))

        const binding = yield* Effect.promise(() => Omni.load())
        const child = binding.spawn(fixture.command, fixture.args, { inheritEnv: false, env: Omni.childEnv() })
        // This test spawns through omni directly, not through the spawner; it counts for the positive control.
        Omni.count("spawns")
        const reader = Effect.promise(async () => {
          for await (const line of child.lines()) if (line.text.includes(fixture.ready)) return
          throw new Error("the tree ended before it was ready")
        })
        yield* reader.pipe(Effect.timeout("20 seconds"))
        expect(yield* Effect.promise(() => alive(fixture.nonce))).toBe(fixture.size)

        yield* processes.register(child, { sessionID: session.id, title: "nonce tree" })
        const server = yield* serve
        const request = (path: string, method = "GET") =>
          requestInDirectory(path, instance.directory, { method }).pipe(Effect.provide(server))
        const list = SessionProcessPaths.list.replace(":sessionID", session.id)

        const listed = yield* request(list)
        expect(listed.status).toBe(200)
        const body = (yield* listed.json) as {
          id: string
          pid: number
          title: string
          started: number
          processes: { pid: number }[]
        }[]
        expect(body).toHaveLength(1)
        expect(body[0]).toMatchObject({ pid: child.pid, title: "nonce tree" })
        expect(body[0].started).toBeGreaterThan(0)
        expect(body[0].processes.length).toBeGreaterThanOrEqual(fixture.size)
        expect(body[0].processes.map((item) => item.pid)).toContain(child.pid)

        const stop = (id: string) =>
          request(SessionProcessPaths.stop.replace(":sessionID", session.id).replace(":processID", id), "POST")
        expect((yield* stop("job_missing")).status).toBe(404)
        expect((yield* stop(body[0].id)).status).toBe(200)
        expect(yield* Effect.promise(() => gone(fixture.nonce))).toBe(0)
        expect(yield* Effect.promise(() => sweep(fixture.nonce))).toEqual([])
        expect(((yield* (yield* request(list)).json) as unknown[]).length).toBe(0)
      }),
    60_000,
  )
})
