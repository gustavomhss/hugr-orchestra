import { expect } from "bun:test"
import { Context, Effect, Layer } from "effect"
import { TestClock } from "effect/testing"
import { AgentV2 } from "@orchestra/core/agent"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { makeGlobalNode } from "@orchestra/core/effect/app-node"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { EventV2 } from "@orchestra/core/event"
import { Location } from "@orchestra/core/location"
import { LocationServiceMap } from "@orchestra/core/location-service-map"
import { buildLocationServiceMap } from "@orchestra/core/location-services"
import { ProjectV2 } from "@orchestra/core/project"
import { AbsolutePath } from "@orchestra/core/schema"
import { ScheduledTask } from "@orchestra/core/scheduled-task"
import { ScheduledTaskRunTable } from "@orchestra/core/scheduled-task/sql"
import { SessionV2 } from "@orchestra/core/session"
import { SessionExecution } from "@orchestra/core/session/execution"
import { SessionInputTable } from "@orchestra/core/session/sql"
import { tmpdir } from "./fixture/tmpdir"
import { testEffect } from "./lib/effect"

type RosterState = {
  default: AgentV2.ID
  rows: { id: AgentV2.ID; hidden: boolean; mode: "primary" | "subagent" }[]
}
class Rosters extends Context.Service<Rosters, Map<string, RosterState>>()("test/ScheduleRosters") {}
const rosters = makeGlobalNode({
  service: Rosters,
  layer: Layer.sync(Rosters, () => new Map()),
  deps: [],
})
const projects = Layer.succeed(
  ProjectV2.Service,
  ProjectV2.Service.of({
    resolve: (directory) => Effect.succeed({ id: ProjectV2.ID.global, directory }),
    directories: () => Effect.succeed([]),
    list: () => Effect.succeed([]),
    commit: () => Effect.void,
  }),
)
const replacements = [
  [ProjectV2.node, projects],
  [SessionExecution.node, SessionExecution.noopLayer],
] as const
const locations = makeGlobalNode({
  service: LocationServiceMap.Service,
  layer: buildLocationServiceMap(replacements).pipe(
    Layer.flatMap((context) =>
      Layer.effect(
        LocationServiceMap.Service,
        Effect.gen(function* () {
          const states = yield* Rosters
          const map = Context.get(context, LocationServiceMap.Service)
          const contextEffect = (ref: Location.Ref) =>
            map.contextEffect(ref).pipe(
              Effect.tap((context) => {
                const service = Context.get(context, AgentV2.Service)
                // Apply after Location initialization so native roster transforms run before this scoped configuration.
                return service.transform((editor) => {
                  const state = states.get(ref.directory)
                  if (!state) return
                  editor.list().forEach((info) => editor.remove(info.id))
                  state.rows.forEach((item) =>
                    editor.update(item.id, (info) => {
                      info.hidden = item.hidden
                      info.mode = item.mode
                    }),
                  )
                  editor.default(state.default)
                })
              }),
            )
          return { ...map, contextEffect, get: (ref) => Layer.effectContext(contextEffect(ref)) }
        }),
      ),
    ),
  ),
  deps: [rosters],
})
const it = testEffect(
  AppNodeBuilder.build(
    LayerNode.group([
      rosters,
      Database.node,
      EventV2.node,
      LocationServiceMap.node,
      SessionExecution.node,
      SessionV2.node,
      ScheduledTask.node,
    ]),
    [...replacements, [LocationServiceMap.node, locations]],
  ),
)
const schedule = {
  name: "Check",
  prompt: "Review",
  cadence: { kind: "interval" as const, minutes: 1 },
  timezone: "UTC",
}
const custom = AgentV2.ID.make("schedule-custom")
const replacement = AgentV2.ID.make("schedule-next")
const start = Date.parse("2032-01-01T12:00:00Z")

it.effect("a Session with omitted agent dispatches its first slot using its Location's custom default", () =>
  Effect.gen(function* () {
    const f = yield* fixture()
    const sessions = yield* SessionV2.Service
    const tasks = yield* ScheduledTask.Service
    const session = yield* sessions.create({ location: f.location })
    expect(session.agent).toBeUndefined()
    const owner = {
      projectID: session.projectID,
      location: f.location,
      sessionID: session.id,
      agentID: (yield* f.agents.select()).id,
    }
    const created = yield* tasks.capability.create(owner, schedule)
    yield* TestClock.setTime(created.next! + 1)
    yield* tasks.tick
    const rows = yield* inputs()
    expect(rows).toHaveLength(1)
    const run = yield* sessions.get(rows[0].session_id)
    expect(run.agent).toBe(custom)
    expect((yield* sessions.get(session.id)).agent).toBeUndefined()
    expect(yield* tasks.capability.get(owner, created.id)).toMatchObject({ runs: 1, enabled: true })
  }),
)

it.effect("an omitted-agent owner uses a selectable fallback when the configured default is invalid", () =>
  Effect.gen(function* () {
    const f = yield* fixture()
    const sessions = yield* SessionV2.Service
    const tasks = yield* ScheduledTask.Service
    f.state.default = custom
    f.state.rows = [
      { id: custom, hidden: true, mode: "primary" },
      { id: AgentV2.defaultID, hidden: false, mode: "primary" },
    ]
    yield* f.agents.reload()
    const selected = yield* f.agents.select()
    expect(selected.id).toBe(AgentV2.defaultID)
    expect(selected.info).toBeDefined()
    const session = yield* sessions.create({ location: f.location })
    expect(session.agent).toBeUndefined()
    const owner = { projectID: session.projectID, location: f.location, sessionID: session.id, agentID: selected.id }
    const created = yield* tasks.capability.create(owner, schedule)
    yield* TestClock.setTime(created.next! + 1)
    yield* tasks.tick
    const rows = yield* inputs()
    expect(rows).toHaveLength(1)
    expect((yield* sessions.get(rows[0].session_id)).agent).toBe(AgentV2.defaultID)
    expect((yield* sessions.get(session.id)).agent).toBeUndefined()
    expect(yield* tasks.capability.get(owner, created.id)).toMatchObject({ runs: 1, enabled: true })
  }),
)

it.effect("changing the current default revokes an omitted-agent owner without rewriting that Session", () =>
  Effect.gen(function* () {
    const f = yield* fixture()
    const sessions = yield* SessionV2.Service
    const tasks = yield* ScheduledTask.Service
    const session = yield* sessions.create({ location: f.location })
    const owner = { projectID: session.projectID, location: f.location, sessionID: session.id, agentID: custom }
    const created = yield* tasks.capability.create(owner, schedule)
    f.state.default = replacement
    f.state.rows = [{ id: replacement, hidden: false, mode: "primary" }]
    yield* f.agents.reload()
    yield* TestClock.setTime(created.next! + 1)
    yield* tasks.tick
    expect(yield* inputs()).toEqual([])
    expect(yield* tasks.capability.get(owner, created.id)).toMatchObject({
      enabled: false,
      disabledReason: "owner-missing",
    })
    expect((yield* sessions.get(session.id)).agent).toBeUndefined()
  }),
)

for (const unavailable of ["removed", "hidden", "subagent"] as const) {
  it.effect(`a fallback id with no info does not retain an owner whose default became ${unavailable}`, () =>
    Effect.gen(function* () {
      const f = yield* fixture(AgentV2.defaultID)
      const sessions = yield* SessionV2.Service
      const tasks = yield* ScheduledTask.Service
      const session = yield* sessions.create({ location: f.location })
      const owner = {
        projectID: session.projectID,
        location: f.location,
        sessionID: session.id,
        agentID: AgentV2.defaultID,
      }
      const created = yield* tasks.capability.create(owner, schedule)
      f.state.rows =
        unavailable === "removed"
          ? []
          : [
              {
                id: AgentV2.defaultID,
                hidden: unavailable === "hidden",
                mode: unavailable === "subagent" ? "subagent" : "primary",
              },
            ]
      yield* f.agents.reload()
      const selection = yield* f.agents.select()
      expect(selection.id).toBe(owner.agentID)
      expect(selection.info).toBeUndefined()
      yield* TestClock.setTime(created.next! + 1)
      yield* tasks.tick
      expect(yield* inputs()).toEqual([])
      expect(yield* tasks.capability.get(owner, created.id)).toMatchObject({
        enabled: false,
        disabledReason: "owner-missing",
      })
    }),
  )
}

it.effect("an explicit Session agent keeps its owner when the Location's default changes", () =>
  Effect.gen(function* () {
    const f = yield* fixture()
    const sessions = yield* SessionV2.Service
    const tasks = yield* ScheduledTask.Service
    const session = yield* sessions.create({ location: f.location, agent: custom })
    const owner = { projectID: session.projectID, location: f.location, sessionID: session.id, agentID: custom }
    const created = yield* tasks.capability.create(owner, schedule)
    f.state.default = replacement
    f.state.rows = [{ id: replacement, hidden: false, mode: "primary" }]
    yield* f.agents.reload()
    yield* TestClock.setTime(created.next! + 1)
    yield* tasks.tick
    expect(yield* inputs()).toHaveLength(1)
    const db = yield* Database.Service
    expect((yield* db.db.select().from(ScheduledTaskRunTable).all().pipe(Effect.orDie))[0].state).toBe("started")
  }),
)

function fixture(initial = custom) {
  return Effect.gen(function* () {
    yield* TestClock.setTime(start)
    const tmp = yield* Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    )
    const location = Location.Ref.make({ directory: AbsolutePath.make(tmp.path) })
    const locations = yield* LocationServiceMap.Service
    const state: RosterState = {
      default: initial,
      rows: [{ id: initial, hidden: false, mode: "primary" }],
    }
    const states = yield* Rosters
    states.set(location.directory, state)
    const agents = Context.get(yield* locations.contextEffect(location), AgentV2.Service)
    return { location, agents, state }
  })
}
function inputs() {
  return Effect.gen(function* () {
    const database = yield* Database.Service
    return yield* database.db.select().from(SessionInputTable).all().pipe(Effect.orDie)
  })
}
