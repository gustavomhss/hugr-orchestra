import { Actions } from "@orchestra/schema/actions"
import { Schema } from "effect"
import { createActionsAPI } from "./api"
import { createActionsCommands, type ActionsPending } from "./commands"
import { initial, type State } from "./contract"
import { createRequestOwner } from "./requests"

const directory = "/repo/native"
export const located = (data: unknown) => Response.json({ location: { directory }, data })

export function deferred<T>() {
  const result: { resolve?: (value: T) => void } = {}
  const promise = new Promise<T>((resolve) => { result.resolve = resolve })
  return { promise, resolve(value: T) { result.resolve?.(value) } }
}

/** Exercise the real API, command owner and receipt handling through one scoped HTTP fixture. */
export function fixture(provider: "github" | "gitlab" = "github", respond?: (request: Request) => Response | void | Promise<Response | void>, pending?: ActionsPending) {
  const state = initial()
  state.binding = { id: Actions.BindingID.make("ab_native"), revision: 7, remote: "origin", projectID: "1", projectPath: "owner/repo", directory,
    provider: { kind: provider, hostname: `${provider}.com`, apiOrigin: `https://${provider}.com` } }
  state.capabilities = { status: "ready", value: [] }
  state.route = { view: "run", runID: "101", ...(provider === "github" ? { attempt: 2 } : {}) }
  state.run = { status: "ready", value: { id: "101", bindingID: state.binding.id, workflowID: "11", name: "CI", ref: "main", commit: "a".repeat(40), event: "push", status: "completed", conclusion: "failure",
    ...(provider === "github" ? { attempt: 2 } : {}) } }
  state.workflows = { status: "ready", value: { items: [{ id: "11", bindingID: state.binding.id, name: "CI", path: ".github/workflows/native.yml", dispatchable: true, state: "active" }], capturedAt: 1 } }
  state.jobs = { status: "ready", value: { items: [{ id: "202", bindingID: state.binding.id, runID: "101", name: "build", status: provider === "github" ? "completed" : "manual", steps: [],
    ...(provider === "github" ? { attempt: 2 } : {}) }], capturedAt: 1 } }
  const requests: Request[] = []
  const intents: Actions.OperationIntent[] = []
  const receipts: Actions.Operation[] = []
  const remembered: Array<ActionsPending | undefined> = []
  const fetch = Object.assign(async (value: string | URL | Request, init?: RequestInit) => {
    const request = new Request(value, init)
    requests.push(request.clone())
    const custom = await respond?.(request.clone())
    if (custom) return custom
    const url = new URL(request.url)
    if (url.pathname.endsWith("/source")) return located({ bindingID: "ab_native", path: url.searchParams.get("path"), ref: url.searchParams.get("ref"),
      commit: "a".repeat(40), version: "b".repeat(40), text: "inputs: {}", editable: false })
    if (url.pathname === "/api/actions/operation/ab_native" && request.method === "POST") {
      const intent = Schema.decodeUnknownSync(Actions.OperationIntent)(await request.json())
      intents.push(intent)
      const operation = Actions.Operation.make({ id: Actions.OperationID.make("aop_native"), bindingID: intent.binding.id,
        clientID: intent.clientID, kind: intent.kind, target: intent.target, state: "prepared", createdAt: 1, expiresAt: 100, updatedAt: 1 })
      receipts.push(operation)
      return located(operation)
    }
    if (url.pathname === "/api/actions/operation/ab_native/aop_native") return located(receipts.at(-1))
    const last = receipts.at(-1)
    if (!last) throw new Error("execution before admission")
    const operation: Actions.Operation = { ...last, state: "accepted", updatedAt: 2, reason: "input secret must not reach UI" }
    receipts.push(operation)
    return located({ operation })
  }, { preconnect: globalThis.fetch.preconnect })
  const api = createActionsAPI({ server: { type: "http", http: { url: "http://localhost:4096" } }, fetch, directory })
  const owner = createRequestOwner()
  const commands = createActionsCommands({ api, owner, state: () => state, update: (patch) => Object.assign(state, patch), pending,
    remember: (value) => remembered.push(value) })
  return { state, requests, intents, receipts, remembered, commands, [Symbol.dispose]() { owner.dispose(); commands.dispose() } }
}

export function runStatus(state: State, status: string) {
  if (!state.run.value) throw new Error("missing fixture run")
  state.run = { status: "ready", value: { ...state.run.value, status } }
}
