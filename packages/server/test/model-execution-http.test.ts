import { expect } from "bun:test"
import { Orchestra } from "@orchestra/client"
import { AgentV2 } from "@orchestra/core/agent"
import { Credential } from "@orchestra/core/credential"
import { Integration } from "@orchestra/core/integration"
import { Mcp } from "@orchestra/core/mcp"
import { ModelExecution } from "@orchestra/core/model-execution"
import { SessionTable } from "@orchestra/core/session/sql"
import { Location } from "@orchestra/schema/location"
import { Session } from "@orchestra/schema/session"
import { eq } from "drizzle-orm"
import { Cause, Context, Deferred, Effect, Exit, Fiber, Schema } from "effect"
import { FetchHttpClient } from "effect/unstable/http"
import { OpenApi } from "effect/unstable/httpapi"
import { tmpdir } from "@orchestra/core/test/fixture/tmpdir"
import { promptServer } from "../../core/test/fixture/mcp-prompts"
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
    expect((yield* fixture.catalog.model.available()).some((model) => model.providerID === "openai")).toBe(true)
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
    expect(decoded.fallback.data).toMatchObject({ providerID: "openai" })
    const credentials = yield* Credential.Service
    expect(yield* credentials.list(Integration.ID.make("openai"))).toHaveLength(1)
    expect(yield* credentials.list(Integration.ID.make("google"))).toHaveLength(1)
    expect(yield* credentials.list(Integration.ID.make("anthropic"))).toEqual([])
    expect(ModelExecutionFixture.state.boots).toBeGreaterThanOrEqual(1)
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
      if (reason === "omitted-agent") {
        ModelExecutionFixture.state.defaultMissing = true
        yield* fixture.agents.transform((draft) => draft.remove(AgentV2.defaultID))
      }
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

it.live("API E6 wire: corrupt direct Session and draft parent policy both return a typed 503", () =>
  Effect.gen(function* () {
    const fixture = yield* ModelExecutionFixture.setup
    yield* fixture.database.db
      .update(SessionTable)
      .set({ subagent_models: '{"detail":"PRIVATE_DIRECT_POLICY"}' })
      .where(eq(SessionTable.id, fixture.session.id))
      .run()
      .pipe(Effect.orDie)
    for (const context of [
      { type: "session", sessionID: fixture.session.id },
      { type: "draft", parentID: fixture.session.id },
    ]) {
      const response = yield* fixture.request("/api/model/execution", { context })
      expect(response.status).toBe(503)
      const body = yield* json(response)
      expect(body).toMatchObject({ _tag: "ServiceUnavailableError", service: "model-execution" })
      expect(JSON.stringify(body)).not.toContain("PRIVATE_DIRECT_POLICY")
    }
    untouched()
  }),
)

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
        const parent =
          failure === "storage"
            ? yield* fixture.sessions.create({ location: fixture.location, agent: AgentV2.defaultID })
            : undefined
        yield* fixture.database.db
          .update(SessionTable)
          .set({ parent_id: parent?.id ?? fixture.session.id })
          .where(eq(SessionTable.id, fixture.session.id))
          .run()
          .pipe(Effect.orDie)
        // Keep the requested Session decodable; the real ancestor-policy reader owns this typed StorageError.
        if (parent)
          yield* fixture.database.db
            .update(SessionTable)
            .set({ subagent_models: '{"secret":"WIRE_CLIENT_PRIVATE_DETAIL"}' })
            .where(eq(SessionTable.id, parent.id))
            .run()
            .pipe(Effect.orDie)
        const before = yield* fixture.snapshot()
        const context = { type: "session" as const, sessionID: fixture.session.id }
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

it.live("API E6 wire: both generated clients send the command and decode its effective model", () =>
  Effect.gen(function* () {
    const fixture = yield* ModelExecutionFixture.setup
    const input = {
      location: { directory: fixture.directory },
      context: { type: "draft" as const, agentID: "maestro" },
      model: ref("openai"),
      command: "model-command",
    }
    const client = Orchestra.make({ baseUrl: fixture.baseUrl })
    const promise = yield* Effect.promise(() => client.models.execution(input))
    const effect = yield* Effect.gen(function* () {
      const { Orchestra } = yield* Effect.promise(() => import("@orchestra/client/effect"))
      const client = yield* Orchestra.make({ baseUrl: fixture.baseUrl })
      return yield* client.models.execution(input)
    }).pipe(Effect.provide(FetchHttpClient.layer))
    const expected = { status: "ready", engine: "claude-code", ref: ref("anthropic", "wire-model", "high") } as const
    expect(promise.data.selection).toEqual(expected)
    expect(effect.data.selection).toEqual(expected)
    untouched()
  }),
)

it.live("API E6 wire: MCP command preflight lists only connected metadata and cancels a pending page", () =>
  Effect.gen(function* () {
    const fixture = yield* ModelExecutionFixture.setup
    const before = yield* fixture.snapshot()
    const cursors: (string | undefined)[] = []
    let mode: "ready" | "failed" | "waiting" = "ready"
    const entered = Promise.withResolvers<void>()
    const aborted = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    yield* Effect.addFinalizer(() => Effect.sync(() => release.resolve()))
    const target = promptServer("wire.prompts", async (cursor, signal) => {
      cursors.push(cursor)
      if (cursor === undefined) return { prompts: [], nextCursor: "second" }
      if (mode === "failed") throw new Error("WIRE_PRIVATE_MCP_LIST_FAILURE")
      if (mode === "waiting") {
        signal.addEventListener("abort", () => aborted.resolve(), { once: true })
        entered.resolve()
        await release.promise
        return { prompts: [], nextCursor: "third" }
      }
      return { prompts: [{ name: "wire.greet" }] }
    })
    let unrelatedLists = 0
    const unrelated = promptServer("other", async () => {
      unrelatedLists++
      return { prompts: [{ name: "hello" }] }
    })
    ModelExecutionFixture.state.mcpServers = [target.provided, unrelated.provided]
    const command = "wire_prompts:wire_greet"
    const input = { context: { type: "draft" as const }, model: ref(), command }
    const cold = yield* fixture.request("/api/model/execution", input)
    expect(cold.status).toBe(400)
    expect(yield* json(cold)).toMatchObject({ _tag: "InvalidRequestError", field: "command" })
    expect(target.observed.connections).toBe(0)
    expect(unrelated.observed.connections).toBe(0)

    const mcp = Context.get(fixture.context, Mcp.Service)
    yield* mcp.ready()
    expect((yield* fixture.request("/api/model/execution", input)).status).toBe(200)
    const missing = yield* fixture.request("/api/model/execution", { ...input, command: "wire_prompts:missing" })
    expect(missing.status).toBe(400)
    expect(yield* json(missing)).toMatchObject({ _tag: "InvalidRequestError", field: "command" })
    mode = "failed"
    const failed = yield* fixture.request("/api/model/execution", input)
    expect(failed.status).toBe(503)
    const failure = yield* json(failed)
    expect(failure).toMatchObject({ _tag: "ServiceUnavailableError", service: "model-execution" })
    expect(JSON.stringify(failure)).not.toContain("WIRE_PRIVATE_MCP_LIST_FAILURE")
    expect(unrelatedLists).toBe(0)
    expect(yield* mcp.prompts()).toEqual([{ server: "other", name: "hello" }])

    cursors.length = 0
    mode = "waiting"
    const client = Orchestra.make({ baseUrl: fixture.baseUrl })
    const controller = new AbortController()
    const cancelled = client.models.execution(
      { ...input, location: { directory: fixture.directory } },
      { signal: controller.signal },
    ).then(
      () => false,
      () => true,
    )
    yield* Effect.promise(() => entered.promise).pipe(Effect.timeout("5 seconds"))
    controller.abort()
    expect(yield* Effect.promise(() => cancelled)).toBe(true)
    yield* Effect.promise(() => aborted.promise).pipe(Effect.timeout("5 seconds"))
    release.resolve()
    yield* reachable(fixture)
    expect(cursors).toEqual([undefined, "second"])
    expect(target.observed).toEqual({ connections: 1, gets: 0 })
    expect(unrelatedLists).toBe(1)
    expect(yield* fixture.snapshot()).toEqual(before)
    untouched()
  }),
  20_000,
)

it.live("API E6 wire: a SessionStore query failure becomes a redacted service error", () =>
  Effect.gen(function* () {
    const fixture = yield* ModelExecutionFixture.setup
    yield* reachable(fixture)
    const before = yield* fixture.snapshot()
    const response = yield* Effect.gen(function* () {
      yield* Effect.acquireRelease(
        fixture.database.db.run("ALTER TABLE session RENAME TO unavailable_execution_session"),
        () => fixture.database.db.run("ALTER TABLE unavailable_execution_session RENAME TO session").pipe(Effect.orDie),
      )
      return yield* fixture.request("/api/model/execution", {
        context: { type: "session", sessionID: fixture.session.id },
        model: ref(),
      })
    }).pipe(Effect.scoped)
    expect(response.status).toBe(503)
    expect(yield* json(response)).toEqual({
      _tag: "ServiceUnavailableError",
      message: "Model execution context is unavailable",
      service: "model-execution",
    })
    expect(yield* fixture.snapshot()).toEqual(before)
    untouched()
  }),
)

for (const mode of ["promise", "effect"] as const) {
  it.live(`API E6 wire: ${mode} cancellation interrupts in-flight Server descriptor without execution`, () =>
    Effect.gen(function* () {
      const fixture = yield* ModelExecutionFixture.setup
      yield* reachable(fixture)
      const before = yield* fixture.snapshot()
      const entered = yield* Deferred.make<void>()
      const interrupted = yield* Deferred.make<void>()
      const release = yield* Deferred.make<void>()
      ModelExecutionFixture.state.wait = { entered, interrupted, release }
      yield* Effect.addFinalizer(() => Deferred.succeed(release, undefined))
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
        yield* Deferred.await(entered).pipe(
          Effect.timeoutOrElse({
            duration: "5 seconds",
            orElse: () => Effect.fail(new Error("Server descriptor did not enter")),
          }),
        )
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
        yield* Deferred.await(entered).pipe(
          Effect.timeoutOrElse({
            duration: "5 seconds",
            orElse: () => Effect.fail(new Error("Server descriptor did not enter")),
          }),
        )
        yield* Fiber.interrupt(fiber)
        const exit = yield* Fiber.await(fiber)
        expect(Exit.isFailure(exit)).toBe(true)
        if (Exit.isFailure(exit)) expect(Cause.hasInterruptsOnly(exit.cause)).toBe(true)
      }
      yield* Deferred.await(interrupted).pipe(
        Effect.timeoutOrElse({
          duration: "5 seconds",
          orElse: () => Effect.fail(new Error("Server descriptor did not observe transport cancellation")),
        }),
      )
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
