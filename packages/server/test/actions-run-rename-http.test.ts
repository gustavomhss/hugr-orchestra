import "../../../script/test-guard"
import "../../../script/test-omni-control"
import { expect } from "bun:test"
import { expectSpawn } from "@orchestra/core/test/fixture/omni-expect"
import { Effect } from "effect"
import { GitLabCommandFixture } from "../../core/test/actions/gitlab-command-fixture"
import { actionError, gitlab, httpFixture, it } from "./actions-http-fixture"

const runID = "287"
const create = { remote: "gitlab", provider: gitlab, projectPath: "acme/widgets" }

// Handler -> Core operations -> production GitLab command adapter. Only the native GitLab REST replies are fixtures.
const renameFixture = Effect.fnUntraced(function* (version?: string) {
  expectSpawn(import.meta.path)
  const native = GitLabCommandFixture.make({
    ...(version === undefined ? {} : { version }),
    write: () => Effect.succeed({ status: 200, headers: {}, data: { ...GitLabCommandFixture.pipeline, name: "Release" } }),
  })
  const f = yield* httpFixture({
    // The bound project is the command fixture's native project 21.
    native: (base) => ({
      ...base,
      resolve: (_provider, projectPath) => Effect.succeed({ projectID: "21", projectPath, account: "root" }),
      request: native.transport.request,
    }),
  })
  const binding = yield* Effect.promise(() => f.client.actionsBindings.create(create))
  const ref = { bindingID: binding.data.id, revision: 1 }
  const prepared = yield* Effect.promise(() =>
    f.client.actionsOperations.prepare({
      ...ref,
      clientID: crypto.randomUUID(),
      binding: { id: binding.data.id, revision: 1 },
      kind: "run.rename",
      target: { runID },
    }),
  )
  return { ...f, native, ref, prepared: prepared.data }
})

it.live("HTTP run rename sends one native pipeline metadata write and persists the accepted receipt", () =>
  Effect.gen(function* () {
    const f = yield* renameFixture()
    const result = yield* Effect.promise(() =>
      f.client.actionsRuns.rename({
        ...f.ref,
        runID,
        id: f.prepared.id,
        input: { provider: "gitlab", name: "Release" },
      }),
    )
    expect(f.responses.at(-1)?.status).toBe(200)
    expect(result.data.operation).toMatchObject({
      id: f.prepared.id,
      bindingID: f.ref.bindingID,
      kind: "run.rename",
      state: "accepted",
      target: { runID },
      result: { runID },
    })
    expect(f.native.state.writes).toBe(1)
    expect(f.native.requests.at(-1)).toEqual({
      method: "PUT",
      path: "projects/21/pipelines/287/metadata",
      body: { name: "Release" },
    })
    const stored = yield* Effect.promise(() => f.client.actionsOperations.get({ ...f.ref, operationID: f.prepared.id }))
    expect(stored.data).toEqual(result.data.operation)
  }),
)

it.live("HTTP run rename on a GitLab instance older than 16.6 is a typed refusal that sends no write", () =>
  Effect.gen(function* () {
    const f = yield* renameFixture("16.5.0-ee")
    const error = yield* Effect.promise(() =>
      actionError(
        f.client.actionsRuns.rename({
          ...f.ref,
          runID,
          id: f.prepared.id,
          input: { provider: "gitlab", name: "Release" },
        }),
        "capability_unavailable",
      ),
    )
    expect(error.message).toBe("GitLab pipeline name metadata requires native metadata proving GitLab 16.6 or newer")
    expect(error.disposition).toBe("definitely_unsent")
    expect(f.responses.at(-1)?.status).toBe(400)
    expect(f.native.state.writes).toBe(0)
    const stored = yield* Effect.promise(() => f.client.actionsOperations.get({ ...f.ref, operationID: f.prepared.id }))
    expect(stored.data.state).toBe("rejected")
  }),
)
