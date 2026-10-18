import { expect, test } from "bun:test"
import { Actions } from "@orchestra/schema/actions"
import { Schema } from "effect"
import { createActionsAPI } from "./api"
import { createActionsCommands } from "./commands"
import { initial } from "./contract"
import { createRequestOwner } from "./requests"

test.each(["create", "update", "delete"])("GitLab variable %s preserves literal Repository through admission and execution", async (action) => {
  const directory = "/repo/scopes"
  const state = initial()
  const binding: Actions.Binding = { id: Actions.BindingID.make("ab_scopes"), revision: 7, remote: "origin", projectID: "42", projectPath: "org/repo", directory,
    provider: { kind: "gitlab", hostname: "gitlab.com", apiOrigin: "https://gitlab.com/api/v4" } }
  const resource: Actions.Resource = { id: '["TOKEN","Repository","Secret"]', name: "TOKEN", scope: "Repository", kind: "variables", bindingID: binding.id,
    sensitive: true, data: { type: "Secret", redacted: true, resourceVersion: "native-version" } }
  state.binding = binding
  state.route = { view: "resources", resourceKind: "variables" }
  state.resources = { status: "ready", value: { items: action === "create" ? [] : [resource], capturedAt: 1 } }
  state.capabilities = { status: "ready", value: [] }
  const intents: Actions.OperationIntent[] = []
  const executions: Array<typeof Actions.ResourceCommand.Type> = []
  const operationID = Schema.decodeUnknownSync(Actions.OperationID)("aop_scopes")
  const located = (data: unknown) => Response.json({ location: { directory }, data })
  const fetch = Object.assign(async (value: string | URL | Request, init?: RequestInit) => {
    const request = new Request(value, init)
    const path = new URL(request.url).pathname
    if (request.method === "POST" && path === `/api/actions/operation/${binding.id}`) {
      const intent = Schema.decodeUnknownSync(Actions.OperationIntent)(await request.json())
      intents.push(intent)
      return located({ id: operationID, bindingID: binding.id, clientID: intent.clientID, kind: intent.kind,
        target: intent.target, state: "prepared", createdAt: 1, expiresAt: 100, updatedAt: 1 })
    }
    const intent = intents.at(-1)
    if (request.method === "POST" && path === `/api/actions/resource/${binding.id}/variables/${action}` && intent) {
      executions.push(Schema.decodeUnknownSync(Actions.ResourceCommand)(await request.json()))
      return located({ operation: { id: operationID, bindingID: binding.id, clientID: intent.clientID, kind: intent.kind,
        target: intent.target, state: "accepted", createdAt: 1, expiresAt: 100, updatedAt: 2 } })
    }
    throw new Error(`Unexpected scope request: ${request.method} ${path}`)
  }, { preconnect() {} })
  const owner = createRequestOwner()
  const commands = createActionsCommands({ api: createActionsAPI({ server: { type: "http", http: { url: "http://localhost:4096" } }, fetch, directory }),
    owner, state: () => state, update: (patch) => Object.assign(state, patch) })
  using cleanup = { [Symbol.dispose]() { owner.dispose(); commands.dispose() } }
  commands.dialog({ kind: action === "create" ? "create-variable" : action === "update" ? "edit-variable" : "delete-variable",
    ...(action === "create" ? {} : { id: resource.id, scope: resource.scope }) })
  const input = Schema.decodeUnknownSync(Schema.Json)(action === "delete"
    ? { provider: "gitlab", name: "TOKEN", type: "Secret", scope: "Repository" }
    : { provider: "gitlab", name: "TOKEN", type: "Secret", scope: "Repository", value: "replacement", masked: true })
  await commands.submit(input)
  expect(state.commandError).toBeUndefined()
  expect(state.operation?.state).toBe("accepted")
  expect(intents).toHaveLength(1)
  expect(intents[0]).toMatchObject({ kind: action === "create" ? "resource.create" : action === "update" ? "resource.update" : "resource.delete",
    target: { resourceKind: "variables", resourceID: "TOKEN", scope: "Repository" } })
  expect(executions).toEqual([{ id: operationID, input }])
})
