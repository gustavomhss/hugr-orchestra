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
    const f = yield* httpFixture()
    const unauthenticated = f.connect({ "x-orchestra-directory": encodeURIComponent(f.core.directory) })
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

it.live("HTTP resource/transfer placeholders are absent from assembled contract and focused router", () =>
  Effect.gen(function* () {
    const f = yield* httpFixture()
    const created = yield* Effect.promise(() => f.client.actionsBindings.create(create))
    const paths = Object.keys(OpenApi.fromApi(Api).paths ?? {})
    expect(paths).toContain("/api/actions/binding")
    expect(
      paths.some((path) => path.startsWith("/api/actions/resource") || path.startsWith("/api/actions/transfer")),
    ).toBe(false)
    yield* Effect.forEach(
      [
        `/api/actions/resource/${created.data.id}?revision=1`,
        `/api/actions/transfer/${created.data.id}?revision=1&kind=artifact&id=42`,
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
