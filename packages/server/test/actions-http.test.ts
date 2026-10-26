import "../../../script/test-guard"
import "../../../script/test-omni-control"
import { expect } from "bun:test"
import { Actions } from "@orchestra/schema/actions"
import { Location } from "@orchestra/schema/location"
import { ActionsError } from "@orchestra/core/actions/error"
import { ActionsOperationTable } from "@orchestra/core/actions/operations/sql"
import { ActionsApiError } from "@orchestra/protocol/groups/actions-common"
import { Cause, Effect, Exit, Schema } from "effect"
import { OpenApi } from "effect/unstable/httpapi"
import { intent } from "../../core/test/actions/assembly-fixture"
import { expectSpawn } from "@orchestra/core/test/fixture/omni-expect"
import { Api } from "../src/api"
import { ServerAuth } from "../src/auth"
import {
  actionError,
  github,
  gitlab,
  githubPath,
  httpFixture,
  it,
  jobID,
  runID,
  workspaceID,
} from "./actions-http-fixture"

const create = { remote: "origin", provider: github, projectPath: "acme/widgets" }

it.live("HTTP binding CRUD shares one Location and policy CAS has one winner", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const f = yield* httpFixture()
    expect((yield* Effect.promise(() => f.client.actionsBindings.list())).data).toEqual([])
    const created = yield* Effect.promise(() => f.client.actionsBindings.create(create))
    expect(created.location).toMatchObject({ directory: f.core.directory, workspaceID })
    expect(created.location.project.directory).toBe(f.core.directory)
    expect(created.data).toMatchObject({
      directory: f.core.directory,
      provider: github,
      revision: 1,
      projectID: "1234",
    })
    expect(f.requests.at(-1)?.headers.get("x-configured")).toBe("kept")
    const ref = { bindingID: created.data.id, revision: 1 }
    const second = f.connect()
    expect((yield* Effect.promise(() => second.actionsBindings.get(ref))).data).toEqual(created.data)
    const updated = yield* Effect.promise(() =>
      second.actionsBindings.update({ ...ref, ...create, expectedRevision: 1 }),
    )
    expect(updated.data).toMatchObject({ id: created.data.id, revision: 2 })
    const current = { ...ref, revision: 2 }
    const results = yield* Effect.all(
      ["first", "second"].map((execution) =>
        Effect.tryPromise({
          try: () => f.client.actionsBindings.updatePolicy({ ...current, retentionDays: 7, execution }),
          catch: (error) => error,
        }).pipe(Effect.exit),
      ),
      { concurrency: "unbounded" },
    )
    const winners = results.filter(Exit.isSuccess)
    const losers = results.filter(Exit.isFailure)
    expect(winners).toHaveLength(1)
    expect(losers).toHaveLength(1)
    expect(Schema.decodeUnknownSync(ActionsApiError)(Cause.squash(losers[0].cause)).kind).toBe("binding_stale")
    expect(winners[0].value.data.binding).toEqual({ id: created.data.id, revision: 3 })
    const latest = { ...ref, revision: 3 }
    expect((yield* Effect.promise(() => second.actionsBindings.policy(latest))).data).toEqual(winners[0].value.data)
    const removed = yield* Effect.promise(() => f.client.actionsBindings.remove(latest))
    expect(removed.location).toEqual(created.location)
    expect(removed.data).toBeNull()
    expect((yield* Effect.promise(() => second.actionsBindings.list())).data).toEqual([])
  }),
)

it.live("HTTP update rejects conflicting body/query expected revision before provider resolver", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const f = yield* httpFixture()
    const created = yield* Effect.promise(() => f.client.actionsBindings.create(create))
    const ref = { bindingID: created.data.id, revision: 1 }
    const before = f.core.resolutions.length
    const error = yield* Effect.promise(() =>
      actionError(f.client.actionsBindings.update({ ...ref, ...create, expectedRevision: 2 }), "binding_stale"),
    )
    expect(error.message).toBe("Binding update revision differs from the selected revision")
    expect(f.responses.at(-1)?.status).toBe(400)
    expect(f.core.resolutions).toHaveLength(before)
    expect(f.calls).toEqual([])
    expect((yield* Effect.promise(() => f.client.actionsBindings.get(ref))).data).toEqual(created.data)
    expect(
      (yield* Effect.promise(() => f.client.actionsBindings.update({ ...ref, ...create, expectedRevision: 1 }))).data
        .revision,
    ).toBe(2)
  }),
)

it.live("HTTP Location query overrides connection headers and isolates binding/operation access", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const f = yield* httpFixture()
    const first = yield* Effect.promise(() => f.client.actionsBindings.create(create))
    const other = { directory: f.clone, workspace: workspaceID }
    expect((yield* Effect.promise(() => f.client.actionsBindings.list({ location: other }))).data).toEqual([])
    const second = yield* Effect.promise(() => f.client.actionsBindings.create({ ...create, location: other }))
    expect(second.location).toMatchObject({ directory: f.clone, workspaceID })
    expect(second.location.project.id).toBe(first.location.project.id)
    expect(second.data.id).not.toBe(first.data.id)
    const ref = { bindingID: first.data.id, revision: 1, location: other }
    yield* Effect.promise(() => actionError(f.client.actionsBindings.get(ref), "binding_missing"))
    yield* Effect.promise(() => actionError(f.client.actionsRuns.list(ref), "binding_missing"))
    const command = intent(Schema.decodeUnknownSync(Actions.Binding)(first.data), f.core.commit)
    yield* Effect.promise(() =>
      actionError(f.client.actionsOperations.prepare({ ...ref, ...command }), "binding_missing"),
    )
    yield* Effect.promise(() =>
      actionError(
        f.client.actionsOperations.prepare({ bindingID: second.data.id, revision: 1, location: other, ...command }),
        "binding_stale",
      ),
    )
    expect(yield* f.core.database.db.select().from(ActionsOperationTable).all()).toEqual([])
    expect(f.calls).toEqual([])
    const query = f.requests.at(-1)?.url.searchParams
    expect(query?.get("location[directory]")).toBe(f.clone)
    expect(query?.get("location[workspace]")).toBe(workspaceID)
    expect((yield* Effect.promise(() => f.client.actionsBindings.list())).data.map((binding) => binding.id)).toEqual([
      first.data.id,
    ])
  }),
)

Array.of(github, gitlab).forEach((provider) => {
  it.live(`HTTP ${provider.kind} reader serializes nullable metadata, native IDs and pinned source graph`, () =>
    Effect.gen(function* () {
      expectSpawn(import.meta.path)
      const f = yield* httpFixture()
      const binding = yield* Effect.promise(() =>
        f.client.actionsBindings.create({
          ...create,
          provider,
          remote: provider.kind === "github" ? "origin" : "gitlab",
        }),
      )
      const ref = { bindingID: binding.data.id, revision: 1 }
      const workflows = yield* Effect.promise(() => f.client.actionsWorkflows.list({ ...ref, limit: 7 }))
      expect(workflows.location).toEqual(binding.location)
      expect(workflows.data.items[0]).toMatchObject({ name: null, dispatchable: false, dispatchState: "unknown" })
      expect(f.requests.at(-1)?.url.searchParams.get("limit")).toBe("7")
      if (provider.kind === "github") expect(f.calls.at(-1)?.input.query).toEqual({ page: 1, per_page: 7 })
      const runs = yield* Effect.promise(() =>
        f.client.actionsRuns.list({ ...ref, limit: 9, ref: "main", commit: f.core.commit }),
      )
      expect(runs.data.items[0]).toMatchObject({
        id: runID,
        name: null,
        ref: null,
        status: null,
        commit: f.core.commit,
      })
      expect(f.calls.at(-1)?.input.query).toMatchObject({
        per_page: 9,
        page: 1,
        ...(provider.kind === "github"
          ? { branch: "main", head_sha: f.core.commit }
          : { ref: "main", sha: f.core.commit }),
      })
      const run = yield* Effect.promise(() => f.client.actionsRuns.get({ ...ref, runID }))
      expect(run.data).toMatchObject({ id: runID, repositoryID: provider.kind === "github" ? "1234" : "5678" })
      const jobs = yield* Effect.promise(() => f.client.actionsRuns.jobs({ ...ref, runID }))
      expect(jobs.data.items[0]).toMatchObject({ id: jobID, runID, status: null, kind: "job" })
      if (provider.kind === "github") {
        expect(jobs.data.items[0]).toMatchObject({ attempt: 4, runnerID: "0", conclusion: null })
        expect(f.calls.at(-1)?.input.path).toBe(`repositories/1234/actions/runs/${runID}/attempts/4/jobs`)
        yield* Effect.promise(() => f.client.actionsRuns.jobs({ ...ref, runID, attempt: 4 }))
        expect(f.requests.at(-1)?.url.searchParams.get("attempt")).toBe("4")
      }
      const path = provider.kind === "github" ? githubPath : ".gitlab-ci.yml"
      const source = yield* Effect.promise(() => f.client.actionsWorkflows.source({ ...ref, path, ref: "main" }))
      expect(source.data).toMatchObject({ text: f.core.text[provider.kind], commit: f.core.commit, editable: false })
      expect(f.calls.at(-1)?.input.query).toEqual({ ref: f.core.commit })
      const graph = yield* Effect.promise(() => f.client.actionsWorkflows.graph({ ...ref, path, ref: "main" }))
      expect(graph.data.source).toEqual(source.data)
      expect(graph.data.jobs.map((job) => ({ id: job.id, needs: job.needs }))).toEqual([
        { id: "build", needs: [] },
        { id: "test", needs: ["build"] },
      ])
      expect(f.calls.every((call) => call.input.method === "GET")).toBe(true)
      const before = f.calls.length
      const invalid = yield* Effect.promise(() =>
        f.raw(`/api/actions/run/${binding.data.id}?revision=1&limit=not-a-number`),
      )
      expect(invalid.status).toBe(400)
      expect(yield* Effect.promise(() => invalid.json())).toMatchObject({ _tag: "InvalidRequestError" })
      expect(f.calls).toHaveLength(before)
    }),
  )
})

it.live("HTTP admission/readback uses durable identity and stale input fails before provider I/O", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const f = yield* httpFixture()
    const created = yield* Effect.promise(() => f.client.actionsBindings.create(create))
    const binding = Schema.decodeUnknownSync(Actions.Binding)(created.data)
    const ref = { bindingID: binding.id, revision: 1 }
    const command = intent(binding, f.core.commit)
    const prepared = yield* Effect.promise(() => f.client.actionsOperations.prepare({ ...ref, ...command }))
    expect(prepared.data.state).toBe("prepared")
    expect((yield* Effect.promise(() => f.client.actionsOperations.prepare({ ...ref, ...command }))).data).toEqual(
      prepared.data,
    )
    const operation = { ...ref, operationID: prepared.data.id }
    expect((yield* Effect.promise(() => f.client.actionsOperations.get(operation))).data).toEqual(prepared.data)
    yield* f.execute(
      Schema.decodeUnknownSync(Location.Info)(created.location),
      binding,
      Actions.OperationID.make(prepared.data.id),
      { unattributed: true },
    )
    expect((yield* Effect.promise(() => f.client.actionsOperations.reconcile(operation))).data.state).toBe("accepted")
    expect(f.calls).toEqual([])
    const attributed = yield* Effect.promise(() =>
      f.client.actionsOperations.prepare({ ...ref, ...intent(binding, f.core.commit) }),
    )
    yield* f.execute(
      Schema.decodeUnknownSync(Location.Info)(created.location),
      binding,
      Actions.OperationID.make(attributed.data.id),
      { runID },
    )
    Object.assign(f.core.native.github, { head_branch: "main", status: "queued" })
    const confirmed = yield* Effect.promise(() =>
      f.client.actionsOperations.reconcile({ ...ref, operationID: attributed.data.id }),
    )
    expect(confirmed.data).toMatchObject({ id: attributed.data.id, state: "confirmed", result: { runID } })
    const calls = f.calls.length
    const before = yield* f.core.database.db
      .select()
      .from(ActionsOperationTable)
      .orderBy(ActionsOperationTable.id)
      .all()
    yield* Effect.promise(() => f.client.actionsBindings.updatePolicy({ ...ref, execution: "manual" }))
    yield* Effect.promise(() => actionError(f.client.actionsOperations.reconcile(operation), "binding_stale"))
    yield* Effect.promise(() =>
      actionError(f.client.actionsOperations.prepare({ ...ref, revision: 2, ...command }), "binding_stale"),
    )
    expect(f.calls).toHaveLength(calls)
    expect(
      yield* f.core.database.db.select().from(ActionsOperationTable).orderBy(ActionsOperationTable.id).all(),
    ).toEqual(before)
  }),
)

it.live("HTTP Orchestra auth remains distinct from flat provider authentication/permission failures", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const f = yield* httpFixture()
    const unauthenticated = f.connect({})
    const error: unknown = yield* Effect.promise(() =>
      unauthenticated.actionsBindings.list().then(
        () => {
          throw new Error("Expected Orchestra authorization failure")
        },
        (error: unknown) => error,
      ),
    )
    expect(error).toEqual({ _tag: "UnauthorizedError", message: "Authentication required" })
    expect(f.responses.at(-1)?.status).toBe(401)
    expect(f.responses.at(-1)?.headers.get("www-authenticate")).toContain("Basic")
    expect(f.core.resolutions).toEqual([])
    const wrong = f.connect({
      ...f.headers,
      authorization: ServerAuth.header({ username: "orchestra", password: "wrong" }) ?? "",
    })
    yield* Effect.promise(() =>
      wrong.actionsBindings.list().then(
        () => {
          throw new Error("Expected wrong-password failure")
        },
        (error: unknown) => expect(error).toMatchObject({ _tag: "UnauthorizedError" }),
      ),
    )
    const created = yield* Effect.promise(() => f.client.actionsBindings.create(create))
    yield* Effect.forEach(["not_authenticated", "permission_denied"] as const, (kind) =>
      Effect.gen(function* () {
        f.failure.error = new ActionsError({
          kind,
          message: `Native ${kind}`,
          provider: "github",
          bindingID: Actions.BindingID.make(created.data.id),
          disposition: "definitely_unsent",
        })
        const provider = yield* Effect.promise(() =>
          actionError(f.client.actionsRuns.list({ bindingID: created.data.id, revision: 1 }), kind),
        )
        expect(provider).toMatchObject({
          kind,
          provider: "github",
          bindingID: created.data.id,
          disposition: "definitely_unsent",
        })
        expect(f.responses.at(-1)?.status).toBe(400)
      }),
    )
    delete f.failure.error
    expect(
      (yield* Effect.promise(() => f.client.actionsRuns.list({ bindingID: created.data.id, revision: 1 }))).data
        .items[0].id,
    ).toBe(runID)
  }),
)

it.live("HTTP public Actions contract pins selected typed routes while focused router omits resource/transfer", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const f = yield* httpFixture()
    const created = yield* Effect.promise(() => f.client.actionsBindings.create(create))
    const spec = OpenApi.fromApi(Api)
    expect(spec.paths["/api/actions/binding"]?.get).toBeDefined()
    // Representative routes cover all public Actions groups, not every endpoint or live handler.
    ;([
      ["get", "/api/actions/binding/{bindingID}", "Actions.Binding"],
      ["get", "/api/actions/operation/{bindingID}/{operationID}", "Actions.Operation"],
      ["get", "/api/actions/workflow/{bindingID}/source", "Actions.Source"],
      ["get", "/api/actions/run/{bindingID}/{runID}", "Actions.Run"],
      ["post", "/api/actions/job/{bindingID}/{jobID}/retry", "Actions.CommandExecution"],
      ["post", "/api/actions/pipeline/{bindingID}/trigger", "Actions.CommandExecution"],
      ["get", "/api/actions/resource/{bindingID}", "Actions.ResourcePage"],
      ["post", "/api/actions/resource/{bindingID}/{resourceKind}/{action}", "Actions.CommandExecution"],
      ["get", "/api/actions/source/{bindingID}/base", "Actions.SourceBase"],
      ["post", "/api/actions/source/{bindingID}/validate-draft", "Actions.Graph"],
      ["post", "/api/actions/source/{bindingID}/validate", "Actions.Graph"],
      ["post", "/api/actions/source/{bindingID}/{action}", "Actions.CommandExecution"],
      ["get", "/api/actions/transfer/{bindingID}/info", "Actions.TransferInfo"],
      // Raw read stays public even though Client generation omits it for the streaming adapter.
      ["get", "/api/actions/transfer/{bindingID}", "binary"],
    ] as const).forEach((route) => {
      const endpoint = spec.paths[route[1]]?.[route[0]]
      expect(
        endpoint?.responses[200].content?.[route[2] === "binary" ? "application/octet-stream" : "application/json"]?.schema,
        route[1],
      ).toMatchObject(
        route[2] === "binary"
          ? { type: "string", format: "binary" }
          : {
              type: "object",
              required: ["location", "data"],
              properties: {
                location: { $ref: "#/components/schemas/Location.Info" },
                data: { $ref: `#/components/schemas/${route[2]}` },
              },
            },
      )
      expect(endpoint?.responses[400].content?.["application/json"]?.schema, route[1]).toMatchObject({
        anyOf: expect.arrayContaining([{ $ref: "#/components/schemas/ActionsError" }]),
      })
      if (route[2] !== "binary") expect(spec.components.schemas[route[2]], route[2]).toBeDefined()
    })
    expect(spec.components.schemas["Actions.ResourcePage"]).toMatchObject({
      required: ["items", "capturedAt"],
      properties: { items: { type: "array", items: { $ref: "#/components/schemas/Actions.Resource" } } },
    })
    expect(spec.components.schemas["Actions.Resource"]).toMatchObject({
      required: ["id", "bindingID", "kind", "name", "data"],
      properties: { kind: { $ref: "#/components/schemas/Actions.ResourceKind" }, name: { type: "string" } },
    })
    expect(spec.components.schemas["Actions.SourceBase"]).toMatchObject({
      required: ["bindingID", "ref", "commit"],
      properties: { ref: { type: "string" }, commit: { type: "string" } },
    })
    expect(spec.components.schemas["Actions.Source"]).toMatchObject({
      required: ["bindingID", "path", "ref", "version", "text", "editable"],
      properties: { text: { type: "string" }, editable: { type: "boolean" } },
    })
    expect(spec.components.schemas["Actions.Graph"]).toMatchObject({
      required: ["source", "state", "jobs", "diagnostics"],
      properties: {
        source: { $ref: "#/components/schemas/Actions.Source" },
        state: { enum: ["complete", "partial", "unresolved"] },
        jobs: { type: "array", items: { $ref: "#/components/schemas/Actions.GraphJob" } },
      },
    })
    expect(spec.components.schemas["Actions.SourceValidation"]).toMatchObject({
      required: ["source", "draft"],
      properties: { source: { $ref: "#/components/schemas/Actions.Source" }, draft: { type: "string" } },
    })
    expect(spec.components.schemas["Actions.DraftValidation"]).toMatchObject({
      required: ["base", "path", "draft"],
      properties: { base: { $ref: "#/components/schemas/Actions.SourceBase" }, draft: { type: "string" } },
    })
    ;([
      ["/api/actions/source/{bindingID}/validate", "Actions.SourceValidation"],
      ["/api/actions/source/{bindingID}/validate-draft", "Actions.DraftValidation"],
      ["/api/actions/source/{bindingID}/{action}", "Actions.ResourceCommand"],
      ["/api/actions/resource/{bindingID}/{resourceKind}/{action}", "Actions.ResourceCommand"],
    ] as const).forEach((route) => {
      expect(spec.paths[route[0]]?.post?.requestBody?.content["application/json"].schema, route[0]).toEqual({
        $ref: `#/components/schemas/${route[1]}`,
      })
    })
    // Schema.Number's current JSON representation also admits non-finite string literals. The schema `optional`
    // helper decodes the encoded Number to its type side, so the generator emits both sides as one anyOf.
    const number = {
      anyOf: [
        {
          anyOf: [
            { type: "number" },
            { type: "string", enum: ["NaN"] },
            { type: "string", enum: ["Infinity"] },
            { type: "string", enum: ["-Infinity"] },
          ],
        },
        { type: "string", enum: ["Infinity", "-Infinity", "NaN"] },
      ],
    }
    expect(spec.components.schemas["Actions.TransferInfo"]).toMatchObject({
      required: ["filename", "contentType"],
      properties: { filename: { type: "string" }, contentType: { type: "string" }, size: number },
    })
    expect(spec.components.schemas.ActionsError).toMatchObject({
      required: expect.arrayContaining(["_tag", "kind", "message"]),
      properties: {
        _tag: { enum: ["ActionsError"] },
        kind: { $ref: "#/components/schemas/Actions.ErrorKind" },
        message: { type: "string" },
        operationID: { $ref: "#/components/schemas/Actions.OperationID" },
      },
    })
    expect(spec.components.schemas["Actions.CommandExecution"]).toMatchObject({
      required: ["operation"],
      properties: { operation: { $ref: "#/components/schemas/Actions.Operation" } },
    })
    expect(spec.components.schemas["Actions.Operation"]).toMatchObject({
      required: ["id", "bindingID", "clientID", "kind", "state", "target", "createdAt", "expiresAt", "updatedAt"],
      properties: {
        id: { $ref: "#/components/schemas/Actions.OperationID" },
        bindingID: { $ref: "#/components/schemas/Actions.BindingID" },
        kind: { $ref: "#/components/schemas/Actions.OperationKind" },
        state: { enum: ["prepared", "sending", "accepted", "confirmed", "rejected", "outcome_unknown", "expired"] },
        target: { $ref: "#/components/schemas/Actions.OperationTarget" },
        createdAt: number,
        expiresAt: number,
        updatedAt: number,
        result: { $ref: "#/components/schemas/Actions.OperationAcknowledgement" },
      },
    })
    expect(spec.paths["/api/actions/not-mounted"]).toBeUndefined()
    // Default fixture mounts binding/operation/workflow/run only; its 404s do not describe production Api.
    expect(
      (yield* Effect.promise(() => f.client.actionsBindings.get({ bindingID: created.data.id, revision: 1 }))).data,
    ).toEqual(created.data)
    yield* Effect.forEach(
      [
        `/api/actions/resource/${created.data.id}?revision=1&kind=artifacts`,
        `/api/actions/transfer/${created.data.id}?revision=1&kind=artifact&id=42`,
        `/api/actions/transfer/${created.data.id}/info?revision=1&kind=artifact&id=42`,
        "/api/actions/not-mounted",
      ],
      (path) =>
        Effect.gen(function* () {
          const response = yield* Effect.promise(() => f.raw(path))
          expect(response.status).toBe(404)
          yield* Effect.promise(() => response.body?.cancel() ?? Promise.resolve())
        }),
    )
    expect(f.calls).toEqual([])
  }),
)
