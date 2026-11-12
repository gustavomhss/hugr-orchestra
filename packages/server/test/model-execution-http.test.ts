import { expect } from "bun:test"
import { Orchestra } from "@orchestra/client"
import { AgentV2 } from "@orchestra/core/agent"
import { ModelExecution } from "@orchestra/core/model-execution"
import { SessionTable } from "@orchestra/core/session/sql"
import { Location } from "@orchestra/schema/location"
import { Session } from "@orchestra/schema/session"
import { eq } from "drizzle-orm"
import { Cause, Context, Deferred, Effect, Exit, Fiber, Schema } from "effect"
import { FetchHttpClient } from "effect/unstable/http"
import { OpenApi } from "effect/unstable/httpapi"
import { tmpdir } from "@orchestra/core/test/fixture/tmpdir"
import { Api } from "../src/api"
import { ModelExecutionFixture } from "./model-execution-fixture"

const it = ModelExecutionFixture.it
const ref = ModelExecutionFixture.ref
const json = ModelExecutionFixture.json
const untouched = () =>
  expect({
    streams: ModelExecutionFixture.state.streams,
    provider: ModelExecutionFixture.state.provider,
    materializations: ModelExecutionFixture.state.materializations,
    tools: ModelExecutionFixture.state.tools,
  }).toEqual({ streams: 0, provider: 0, materializations: 0, tools: 0 })
const reachable = (fixture: Effect.Success<typeof ModelExecutionFixture.setup>) =>
  Effect.gen(function* () {
    const response = yield* fixture.request("/api/model/execution", {
      context: { type: "draft", agentID: "maestro" },
      model: ref(),
    })
    expect(response.status).toBe(200) // Baseline404 is API RED, never mislabeled an original behavioral regression.
    const wire = yield* Effect.promise(() => import("@orchestra/schema/model-execution"))
    return yield* json(response).pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(Location.response(wire.ModelExecution.Response))),
    )
  })

it.live("CONTROL E6 wire: actual TCP list/default and both imported clients keep the existing catalog contract", () =>
  Effect.gen(function* () {
    const fixture = yield* ModelExecutionFixture.setup
    const before = yield* fixture.snapshot()
    const list = yield* fixture.request("/api/model")
    expect(list.status).toBe(200)
    expect(yield* json(list)).toMatchObject({
      location: { directory: fixture.directory },
      data: expect.arrayContaining([expect.objectContaining({ id: "wire-model", providerID: "openai" })]),
    })
    const promise = Orchestra.make({ baseUrl: fixture.baseUrl })
    const fallback = yield* Effect.promise(() => promise.models.default({ location: { directory: fixture.directory } }))
    expect(fallback.data).toMatchObject({ id: "wire-model", providerID: "openai" })
    const decoded = yield* Effect.gen(function* () {
      const { Orchestra } = yield* Effect.promise(() => import("@orchestra/client/effect"))
      const client = yield* Orchestra.make({ baseUrl: fixture.baseUrl })
      return {
        list: yield* client.models.list({ location: { directory: fixture.directory } }),
        fallback: yield* client.models.default({ location: { directory: fixture.directory } }),
      }
    }).pipe(Effect.provide(FetchHttpClient.layer))
    expect(decoded.list.data.some((model) => model.providerID === "anthropic")).toBe(false)
    expect(decoded.fallback.data?.providerID).toBe("openai")
    expect(yield* fixture.snapshot()).toEqual(before)
    untouched()
  }),
)

it.live(
  "CONTROL E6 wire: real Core describes a secondary registered host while durable admit-only input stays pending",
  () =>
    Effect.gen(function* () {
      const fixture = yield* ModelExecutionFixture.setup
      const before = yield* fixture.snapshot()
      expect(before.inputs).toHaveLength(1)
      expect(before.inputs[0].promoted_seq).toBeNull()
      const core = Context.get(fixture.context, ModelExecution.Service)
      const response = yield* core.describe({
        context: { type: "session", sessionID: fixture.session.id, agentID: "host-seat" },
        model: ref("anthropic"),
      })
      expect(response.selection).toMatchObject({ engine: "claude-code", status: "ready" })
      expect(yield* fixture.snapshot()).toEqual(before)
      untouched()
    }),
)

it.live(
  "API E6 wire: prospective Session agent/model carries the current Location and never changes durable selection or input",
  () =>
    Effect.gen(function* () {
      const fixture = yield* ModelExecutionFixture.setup
      const before = yield* fixture.snapshot()
      yield* reachable(fixture)
      const request = yield* fixture.request("/api/model/execution", {
        context: { type: "session", sessionID: fixture.session.id, agentID: "host-seat" },
        model: ref("anthropic", "wire-model", "high"),
      })
      expect(request.status).toBe(200)
      expect(yield* json(request)).toMatchObject({
        location: { directory: fixture.directory },
        data: {
          selection: { ref: ref("anthropic", "wire-model", "high"), engine: "claude-code", status: "ready" },
        },
      })
      const native = yield* fixture.request("/api/model/execution", {
        context: { type: "session", sessionID: fixture.session.id },
        model: ref("google"),
      })
      expect(native.status).toBe(200)
      expect(yield* json(native)).toMatchObject({
        data: { selection: { engine: "orchestra", status: "unsupported", reason: "unsupported-api" } },
      })
      expect(yield* fixture.snapshot()).toEqual(before)
      untouched()
    }),
)

it.live("API E6 wire: secondary host-only model eligibility does not change global list/default", () =>
  Effect.gen(function* () {
    const fixture = yield* ModelExecutionFixture.setup
    yield* reachable(fixture)
    const before = yield* json(yield* fixture.request("/api/model"))
    const fallback = yield* json(yield* fixture.request("/api/model/default"))
    const response = yield* fixture.request("/api/model/execution", {
      context: { type: "draft", agentID: "host-seat" },
      model: ref("anthropic"),
    })
    expect(response.status).toBe(200)
    expect(yield* json(response)).toMatchObject({
      data: {
        selection: { status: "ready", engine: "claude-code" },
        models: expect.arrayContaining([
          expect.objectContaining({ model: expect.objectContaining({ providerID: "anthropic" }), status: "ready" }),
        ]),
      },
    })
    expect(yield* json(yield* fixture.request("/api/model"))).toEqual(before)
    expect(yield* json(yield* fixture.request("/api/model/default"))).toEqual(fallback)
    untouched()
  }),
)

it.live("API E6 wire: explicit missing selection retains its Ref and creates no invented inventory row", () =>
  Effect.gen(function* () {
    const fixture = yield* ModelExecutionFixture.setup
    yield* reachable(fixture)
    const response = yield* fixture.request("/api/model/execution", {
      context: { type: "draft" },
      model: ref("openai", "missing", "high"),
    })
    expect(response.status).toBe(200)
    const wire = yield* Effect.promise(() => import("@orchestra/schema/model-execution"))
    const decoded = yield* json(response).pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(Location.response(wire.ModelExecution.Response))),
    )
    expect(decoded.data.selection).toEqual({
      ref: ref("openai", "missing", "high"),
      engine: "orchestra",
      status: "unavailable",
      reason: "model-missing",
    })
    expect(decoded.data.models.some((entry) => entry.model.id === "missing")).toBe(false)
    untouched()
  }),
)

for (const reason of [
  "session-missing",
  "parent-missing",
  "agent-missing",
  "location-mismatch",
  "omitted-agent",
] as const) {
  it.live(`API E6 wire: ${reason} is a safe declared404 for the whole context`, () =>
    Effect.gen(function* () {
      const fixture = yield* ModelExecutionFixture.setup
      yield* reachable(fixture)
      const foreign = yield* Effect.acquireRelease(
        Effect.promise(() => tmpdir()),
        (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
      )
      if (reason === "omitted-agent") yield* fixture.agents.transform((draft) => draft.remove(AgentV2.defaultID))
      const context =
        reason === "session-missing"
          ? { type: "session", sessionID: "ses_wire_missing" }
          : reason === "parent-missing"
            ? { type: "draft", parentID: "ses_wire_parent_missing" }
            : reason === "agent-missing"
              ? { type: "draft", agentID: "wire_missing_agent" }
              : reason === "location-mismatch"
                ? { type: "session", sessionID: fixture.session.id }
                : { type: "draft" }
      const before = yield* fixture.snapshot()
      const response = yield* fixture.request(
        "/api/model/execution",
        { context },
        reason === "location-mismatch" ? foreign.path : fixture.directory,
      )
      expect(response.status).toBe(404)
      const body = yield* json(response)
      expect(body).toMatchObject({
        _tag: "ModelExecutionContextNotFoundError",
        reason: reason === "omitted-agent" ? "agent-missing" : reason,
      })
      expect(body).not.toHaveProperty("cause")
      expect(body).not.toHaveProperty("models")
      expect(body).not.toHaveProperty("engine")
      expect(yield* fixture.snapshot()).toEqual(before)
      untouched()
    }),
  )
}

for (const failure of ["cycle", "missing-parent", "storage"] as const) {
  it.live(`API E6 wire: real ${failure} context failure maps400/503 without leaking raw cause`, () =>
    Effect.gen(function* () {
      const fixture = yield* ModelExecutionFixture.setup
      yield* reachable(fixture)
      const parent = yield* fixture.sessions.create({ location: fixture.location, agent: AgentV2.defaultID })
      yield* fixture.database.db
        .update(SessionTable)
        .set({
          parent_id:
            failure === "cycle"
              ? fixture.session.id
              : failure === "missing-parent"
                ? Session.ID.make("ses_wire_missing_parent")
                : parent.id,
        })
        .where(eq(SessionTable.id, fixture.session.id))
        .run()
        .pipe(Effect.orDie)
      if (failure === "storage")
        yield* fixture.database.db
          .update(SessionTable)
          .set({ subagent_models: '{"secret":"WIRE_PRIVATE_STORAGE_DETAIL"}' })
          .where(eq(SessionTable.id, parent.id))
          .run()
          .pipe(Effect.orDie)
      const before = yield* fixture.snapshot()
      const response = yield* fixture.request("/api/model/execution", {
        context: { type: "session", sessionID: fixture.session.id },
      })
      expect(response.status).toBe(failure === "storage" ? 503 : 400)
      const body = yield* json(response)
      expect(body).toMatchObject(
        failure === "storage"
          ? { _tag: "ServiceUnavailableError" }
          : { _tag: "InvalidRequestError", kind: "invalid-model-execution-context" },
      )
      expect(body).not.toHaveProperty("cause")
      expect(JSON.stringify(body)).not.toContain("WIRE_PRIVATE_STORAGE_DETAIL")
      expect(yield* fixture.snapshot()).toEqual(before)
      untouched()
    }),
  )
}

it.live("API E6 wire: malformed Input is declared400 before any admission", () =>
  Effect.gen(function* () {
    const fixture = yield* ModelExecutionFixture.setup
    yield* reachable(fixture)
    const before = yield* fixture.snapshot()
    for (const context of [{ type: "session" }, { type: "unknown" }, { type: "draft", agentID: false }]) {
      const response = yield* fixture.request("/api/model/execution", { context })
      expect(response.status).toBe(400)
      expect(yield* json(response)).toMatchObject({ _tag: "InvalidRequestError" })
    }
    expect(yield* fixture.snapshot()).toEqual(before)
    untouched()
  }),
)

it.live(
  "API E6 wire: generated Promise and Effect clients round-trip location, variant and missing selection through actual Server",
  () =>
    Effect.gen(function* () {
      const fixture = yield* ModelExecutionFixture.setup
      yield* reachable(fixture)
      const before = yield* fixture.snapshot()
      const client = Orchestra.make({ baseUrl: fixture.baseUrl })
      const input = {
        location: { directory: fixture.directory },
        context: { type: "session" as const, sessionID: fixture.session.id, agentID: "host-seat" },
        model: ref("anthropic", "wire-model", "high"),
      }
      const promise = yield* Effect.promise(() => client.models.execution(input))
      expect(promise.location.directory).toBe(fixture.directory)
      expect(promise.data.selection).toMatchObject({ ref: input.model, status: "ready", engine: "claude-code" })
      const decoded = yield* Effect.gen(function* () {
        const { Orchestra } = yield* Effect.promise(() => import("@orchestra/client/effect"))
        const client = yield* Orchestra.make({ baseUrl: fixture.baseUrl })
        return yield* client.models.execution({ ...input, model: ref("openai", "missing", "high") })
      }).pipe(Effect.provide(FetchHttpClient.layer))
      expect(decoded.data.selection).toMatchObject({
        ref: ref("openai", "missing", "high"),
        status: "unavailable",
        reason: "model-missing",
      })
      expect(decoded.data.models.some((entry) => entry.model.id === "missing")).toBe(false)
      expect(yield* fixture.snapshot()).toEqual(before)
      untouched()
    }),
)

it.live("API E6 wire: both generated clients preserve declared context404 rather than transport/client errors", () =>
  Effect.gen(function* () {
    const fixture = yield* ModelExecutionFixture.setup
    yield* reachable(fixture)
    const input = {
      location: { directory: fixture.directory },
      context: { type: "session" as const, sessionID: fixture.session.id, agentID: "wire_missing_agent" },
    }
    const client = Orchestra.make({ baseUrl: fixture.baseUrl })
    const promise = yield* Effect.promise(() =>
      client.models.execution(input).then(
        () => {
          throw new Error("Expected declared404")
        },
        (error: unknown) => error,
      ),
    )
    expect(promise).toMatchObject({ _tag: "ModelExecutionContextNotFoundError", reason: "agent-missing" })
    const error = yield* Effect.gen(function* () {
      const { Orchestra } = yield* Effect.promise(() => import("@orchestra/client/effect"))
      const client = yield* Orchestra.make({ baseUrl: fixture.baseUrl })
      return yield* client.models.execution(input).pipe(Effect.flip)
    }).pipe(Effect.provide(FetchHttpClient.layer))
    expect(error).toMatchObject({ _tag: "ModelExecutionContextNotFoundError", reason: "agent-missing" })
    untouched()
  }),
)

for (const failure of ["cycle", "storage"] as const) {
  it.live(
    `API E6 wire: both generated clients retain declared ${failure === "cycle" ? 400 : 503} operational errors`,
    () =>
      Effect.gen(function* () {
        const fixture = yield* ModelExecutionFixture.setup
        yield* reachable(fixture)
        yield* fixture.database.db
          .update(SessionTable)
          .set(
            failure === "cycle"
              ? { parent_id: fixture.session.id }
              : { subagent_models: '{"secret":"WIRE_CLIENT_PRIVATE_DETAIL"}' },
          )
          .where(eq(SessionTable.id, fixture.session.id))
          .run()
          .pipe(Effect.orDie)
        const before = yield* fixture.snapshot()
        const context =
          failure === "cycle"
            ? { type: "session" as const, sessionID: fixture.session.id }
            : { type: "draft" as const, parentID: fixture.session.id }
        const input = { location: { directory: fixture.directory }, context }
        const expected =
          failure === "cycle"
            ? { _tag: "InvalidRequestError", kind: "invalid-model-execution-context" }
            : { _tag: "ServiceUnavailableError" }
        const client = Orchestra.make({ baseUrl: fixture.baseUrl })
        const promise = yield* Effect.promise(() =>
          client.models.execution(input).then(
            () => {
              throw new Error("Expected declared operational failure")
            },
            (error: unknown) => error,
          ),
        )
        expect(promise).toMatchObject(expected)
        expect(promise).not.toHaveProperty("cause")
        expect(JSON.stringify(promise)).not.toContain("WIRE_CLIENT_PRIVATE_DETAIL")
        const error = yield* Effect.gen(function* () {
          const { Orchestra } = yield* Effect.promise(() => import("@orchestra/client/effect"))
          const client = yield* Orchestra.make({ baseUrl: fixture.baseUrl })
          return yield* client.models.execution(input).pipe(Effect.flip)
        }).pipe(Effect.provide(FetchHttpClient.layer))
        expect(error).toMatchObject(expected)
        expect(error).not.toHaveProperty("cause")
        expect(JSON.stringify(error)).not.toContain("WIRE_CLIENT_PRIVATE_DETAIL")
        expect(yield* fixture.snapshot()).toEqual(before)
        untouched()
      }),
  )
}

for (const mode of ["promise", "effect"] as const) {
  it.live(`API E6 wire: ${mode} cancellation interrupts in-flight Server descriptor without execution`, () =>
    Effect.gen(function* () {
      const fixture = yield* ModelExecutionFixture.setup
      yield* reachable(fixture)
      const before = yield* fixture.snapshot()
      const entered = yield* Deferred.make<void>()
      const interrupted = yield* Deferred.make<void>()
      ModelExecutionFixture.state.wait = { entered, interrupted }
      const input = {
        location: { directory: fixture.directory },
        context: { type: "draft" as const, agentID: "host-seat" },
        model: ref("anthropic"),
      }
      if (mode === "promise") {
        const client = Orchestra.make({ baseUrl: fixture.baseUrl })
        const controller = new AbortController()
        // Attach rejection handling before abort, so no detached promise can reject unobserved.
        const settled = client.models.execution(input, { signal: controller.signal }).then(
          () => ({ success: true }),
          (error: unknown) => ({ success: false, error }),
        )
        yield* Deferred.await(entered).pipe(Effect.timeout("5 seconds"))
        controller.abort()
        expect(yield* Effect.promise(() => settled)).toMatchObject({ success: false })
      }
      if (mode === "effect") {
        const { Orchestra } = yield* Effect.promise(() => import("@orchestra/client/effect"))
        const operation = Effect.gen(function* () {
          const client = yield* Orchestra.make({ baseUrl: fixture.baseUrl })
          return yield* client.models.execution(input)
        }).pipe(Effect.provide(FetchHttpClient.layer))
        const fiber = yield* operation.pipe(Effect.forkChild)
        yield* Deferred.await(entered).pipe(Effect.timeout("5 seconds"))
        yield* Fiber.interrupt(fiber)
        const exit = yield* Fiber.await(fiber)
        expect(Exit.isFailure(exit)).toBe(true)
        if (Exit.isFailure(exit)) expect(Cause.hasInterruptsOnly(exit.cause)).toBe(true)
      }
      yield* Deferred.await(interrupted).pipe(Effect.timeout("5 seconds"))
      expect(yield* fixture.snapshot()).toEqual(before)
      untouched()
    }),
  )
}

it.live("API E6 wire: Core facade reuses all canonical schemas and Protocol advertises the endpoint identifier", () =>
  Effect.gen(function* () {
    const fixture = yield* ModelExecutionFixture.setup
    yield* reachable(fixture)
    const wire = yield* Effect.promise(() => import("@orchestra/schema/model-execution"))
    for (const name of ["Reason", "Decision", "Input", "Response", "Entry", "Selection"] as const)
      expect(Reflect.get(ModelExecution, name)).toBe(wire.ModelExecution[name])
    const endpoint = Object.values(Api.groups["server.model"].endpoints).find(
      (endpoint) => endpoint.name === "model.execution",
    )
    expect(endpoint).toMatchObject({ path: "/api/model/execution", method: "POST" })
    expect(OpenApi.fromApi(Api).paths["/api/model/execution"]?.post?.operationId).toBe("v2.model.execution")
    untouched()
  }),
)
