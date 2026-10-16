import "../../../script/test-guard"
import "../../../script/test-omni-control"
import { expect } from "bun:test"
import type { Interface } from "@orchestra/core/actions"
import { OutputNative } from "@orchestra/core/actions/output/native"
import { ActionsApiError } from "@orchestra/protocol/groups/actions-common"
import { Actions } from "@orchestra/schema/actions"
import { Location } from "@orchestra/schema/location"
import { Effect, Schema } from "effect"
import { expectSpawn } from "../../core/test/fixture/omni-expect"
import { github, httpFixture, it, runID, workspaceID } from "./actions-http-fixture"

const create = { remote: "origin", provider: github, projectPath: "acme/widgets" }
const resourceFixture = Effect.fnUntraced(function* () {
  const capturedCalls: Parameters<Interface["resources"]>[] = []
  expectSpawn(import.meta.path)
  const http = yield* httpFixture({
    resources: (service) => Effect.fnUntraced(function* (ref: Actions.BindingRef, input: Actions.ResourceListInput) {
      // Capture before validation; omitted keys must not be normalized away by the fixture.
      capturedCalls.push([structuredClone(ref), structuredClone(input)])
      const binding = yield* service.bindings.get(ref)
      yield* OutputNative.checked(binding, () => OutputNative.selection(
        binding, input, Actions.ResourceListInput,
        input.kind === "environments"
          ? ["kind", "resourceID", "runID", "scope", "cursor", "limit"]
          : ["kind", "runID", "cursor", "limit", "query"],
      ))
      return {
        items: [{
          id: "42", bindingID: binding.id, kind: input.kind, name: "bounded fixture", data: {},
          ...(input.scope === undefined ? {} : { scope: input.scope }),
        }],
        total: 1,
        capturedAt: 1,
      }
    }),
  })
  const binding = yield* Effect.promise(() => http.client.actionsBindings.create(create))
  return { ...http, binding, capturedCalls }
})

const page = (response: Response) =>
  response.json().then(Schema.decodeUnknownSync(Location.response(Actions.ResourcePage)))

it.live("HTTP artifact list omits absent optional keys before strict Core selection", () =>
  Effect.gen(function* () {
    const f = yield* resourceFixture()
    const response = yield* Effect.promise(() => f.raw(
      `/api/actions/resource/${f.binding.data.id}?revision=1&kind=artifacts&runID=${runID}`,
    ))
    expect(response.status).toBe(200)
    expect((yield* Effect.promise(() => page(response))).data).toEqual({
      items: [{ id: "42", bindingID: Actions.BindingID.make(f.binding.data.id), kind: "artifacts", name: "bounded fixture", data: {} }],
      total: 1,
      capturedAt: 1,
    })
    expect(f.capturedCalls).toHaveLength(1)
    const capturedInput = f.capturedCalls[0][1]
    expect(Object.keys(capturedInput).sort()).toEqual(["kind", "runID"])
    expect(f.capturedCalls[0]).toEqual([
      { id: Actions.BindingID.make(f.binding.data.id), revision: 1 }, { kind: "artifacts", runID },
    ])
  }),
)

it.live("HTTP project artifact list omits absent runID too", () =>
  Effect.gen(function* () {
    const f = yield* resourceFixture()
    const response = yield* Effect.promise(() => f.raw(
      `/api/actions/resource/${f.binding.data.id}?revision=1&kind=artifacts`,
    ))
    expect(response.status).toBe(200)
    expect((yield* Effect.promise(() => page(response))).data.items).toHaveLength(1)
    expect(f.capturedCalls).toHaveLength(1)
    const capturedInput = f.capturedCalls[0][1]
    expect(Object.keys(capturedInput)).toEqual(["kind"])
    expect(capturedInput).toEqual({ kind: "artifacts" })
  }),
)

Array.of(
  { key: "resourceID", value: "42" },
  { key: "scope", value: "Repository" },
  { key: "ref", value: "main" },
  { key: "ref", value: "" },
).forEach((extra) => {
  it.live(`HTTP artifact list rejects present unsupported filter ${extra.key}=${extra.value} with typed 400`, () =>
    Effect.gen(function* () {
      const f = yield* resourceFixture()
      const query = new URLSearchParams({ revision: "1", kind: "artifacts", runID, [extra.key]: extra.value })
      const response = yield* Effect.promise(() => f.raw(`/api/actions/resource/${f.binding.data.id}?${query}`))
      expect(response.status).toBe(400)
      const body: unknown = yield* Effect.promise(() => response.json())
      const error = Schema.decodeUnknownSync(ActionsApiError, { onExcessProperty: "error" })(body)
      expect(error).toMatchObject({
        kind: "invalid_input",
        message: "CI output selection contains invalid or unsupported fields",
        bindingID: f.binding.data.id,
        provider: "github",
        disposition: "definitely_unsent",
      })
      expect(body).toEqual(Schema.encodeSync(ActionsApiError)(error))
      expect(f.capturedCalls).toHaveLength(1)
      const capturedInput = f.capturedCalls[0][1]
      expect(Object.keys(capturedInput).sort()).toEqual(["kind", "runID", extra.key].sort())
      expect(capturedInput).toEqual({ kind: "artifacts", runID, [extra.key]: extra.value })
    }),
  )
})

it.live("HTTP artifact list retains present name, cursor and numeric limit", () =>
  Effect.gen(function* () {
    const f = yield* resourceFixture()
    const query = new URLSearchParams({
      revision: "1", kind: "artifacts", runID, query: "build + linux", cursor: "opaque:page/2", limit: "7",
    })
    const response = yield* Effect.promise(() => f.raw(`/api/actions/resource/${f.binding.data.id}?${query}`))
    expect(response.status).toBe(200)
    expect((yield* Effect.promise(() => page(response))).data.items).toHaveLength(1)
    expect(f.capturedCalls).toHaveLength(1)
    const capturedInput = f.capturedCalls[0][1]
    expect(Object.keys(capturedInput).sort()).toEqual(["cursor", "kind", "limit", "query", "runID"])
    expect(capturedInput).toEqual({
      kind: "artifacts", runID, query: "build + linux", cursor: "opaque:page/2", limit: 7,
    })
  }),
)

it.live("HTTP artifact list retains empty present query and cursor", () =>
  Effect.gen(function* () {
    const f = yield* resourceFixture()
    const response = yield* Effect.promise(() => f.raw(
      `/api/actions/resource/${f.binding.data.id}?revision=1&kind=artifacts&query=&cursor=`,
    ))
    expect(response.status).toBe(200)
    expect((yield* Effect.promise(() => page(response))).data.items).toHaveLength(1)
    expect(f.capturedCalls).toHaveLength(1)
    const capturedInput = f.capturedCalls[0][1]
    expect(Object.keys(capturedInput).sort()).toEqual(["cursor", "kind", "query"])
    expect(capturedInput).toEqual({ kind: "artifacts", query: "", cursor: "" })
  }),
)

it.live("HTTP environment list retains exact native scope and resourceID", () =>
  Effect.gen(function* () {
    const f = yield* resourceFixture()
    const response = yield* Effect.promise(() => f.raw(
      `/api/actions/resource/${f.binding.data.id}?revision=1&kind=environments&scope=Repository&resourceID=production`,
    ))
    expect(response.status).toBe(200)
    expect((yield* Effect.promise(() => page(response))).data.items[0].scope).toBe("Repository")
    expect(f.capturedCalls).toHaveLength(1)
    const capturedInput = f.capturedCalls[0][1]
    expect(Object.keys(capturedInput).sort()).toEqual(["kind", "resourceID", "scope"])
    expect(capturedInput).toEqual({ kind: "environments", scope: "Repository", resourceID: "production" })
  }),
)

it.live("HTTP resource list keeps binding revision and Location outside ResourceListInput", () =>
  Effect.gen(function* () {
    const f = yield* resourceFixture()
    const location = { directory: f.clone, workspace: workspaceID }
    const binding = yield* Effect.promise(() => f.client.actionsBindings.create({ ...create, location }))
    yield* Effect.promise(() => f.client.actionsBindings.updatePolicy({
      bindingID: binding.data.id, revision: 1, execution: "manual", location,
    }))
    const query = new URLSearchParams({
      revision: "2", kind: "artifacts", runID,
      "location[directory]": f.clone, "location[workspace]": workspaceID,
    })
    const response = yield* Effect.promise(() => f.raw(`/api/actions/resource/${binding.data.id}?${query}`))
    expect(response.status).toBe(200)
    expect((yield* Effect.promise(() => page(response))).location).toMatchObject({
      directory: f.clone, workspaceID,
    })
    expect(f.capturedCalls).toHaveLength(1)
    const capturedInput = f.capturedCalls[0][1]
    expect(Object.keys(capturedInput).sort()).toEqual(["kind", "runID"])
    expect(f.capturedCalls[0]).toEqual([
      { id: Actions.BindingID.make(binding.data.id), revision: 2 }, { kind: "artifacts", runID },
    ])
  }),
)
