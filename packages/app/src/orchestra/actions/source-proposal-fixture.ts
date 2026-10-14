import { Actions } from "@orchestra/schema/actions"
import { Schema } from "effect"
import { actionsError, ActionsRequestError, createActionsAPI } from "./api"
import { createActionsCommands, type ActionsPending } from "./commands"
import { initial } from "./contract"
import { createRequestOwner, createSourceDraft } from "./requests"

const directory = "/repo/proposal"
const defaultBase: Actions.SourceBase = { bindingID: Actions.BindingID.make("ab_proposal"), ref: "trunk-observed", commit: "a".repeat(40) }
const newCommit = "c".repeat(40)
const nativeVersion = "d".repeat(40)
const draft = "name: private-proposal\non: workflow_dispatch\njobs: {}\n"
const reviewForm = { branch: "actions-proposal", message: "ci: private-message", title: "Private review title" }
const located = (data: unknown) => Response.json({ location: { directory }, data })
const graph = (source: Actions.Source) => ({ source, state: "complete", jobs: [], diagnostics: ["local projection"] })
const draftInput = Schema.Struct({ base: Actions.SourceBase, path: Schema.String, draft: Schema.String })
function deferred<T>() {
  const value: { resolve?: (value: T) => void } = {}
  const promise = new Promise<T>((resolve) => { value.resolve = resolve })
  return { promise, resolve(result: T) { value.resolve?.(result) } }
}

/** Inject only the HTTP boundary; controllers, schemas and API adapters remain real. */
function fixture(options: { provider?: Actions.ProviderKind; path?: string; existing?: boolean; pending?: ActionsPending;
  respond?: (request: Request) => Response | undefined | Promise<Response | undefined> } = {}) {
  const provider = options.provider ?? "github"
  const path = options.path ?? (provider === "github" ? ".github/workflows/proposal.yml" : ".gitlab/ci/proposal.yml")
  const version = provider === "github" ? nativeVersion : JSON.stringify({ blob_id: nativeVersion, last_commit_id: newCommit })
  const native: Actions.Source = { ...defaultBase, path, version: provider === "github" ? "b".repeat(40)
    : JSON.stringify({ blob_id: "b".repeat(40), last_commit_id: defaultBase.commit }), text: "original native text", editable: false }
  const state = initial()
  state.binding = { id: defaultBase.bindingID, revision: 7, remote: "origin", projectID: "1", projectPath: "owner/repo", directory,
    provider: { kind: provider, hostname: `${provider}.com`, apiOrigin: `https://${provider}.com` } }
  state.capabilities = { status: "ready", value: ["source.branch", "source.write", "source.review"].map((operation) => ({ operation, state: "unknown" as const, observedAt: 1 })) }
  state.workflows = { status: "ready", value: { items: [], capturedAt: 1 } }
  const requests: Request[] = []
  const intents: Actions.OperationIntent[] = []
  const receipts = new Map<Actions.OperationID, Actions.Operation>()
  const saved: Array<ActionsPending | undefined> = []
  const heads = new Map([[defaultBase.ref, defaultBase.commit]])
  const written = { exists: !!options.existing, text: native.text, commit: defaultBase.commit, version: native.version }
  const fetch = Object.assign(async (value: string | URL | Request, init?: RequestInit) => {
    const request = new Request(value, init)
    requests.push(request.clone())
    const custom = await options.respond?.(request.clone())
    if (custom) return custom
    const url = new URL(request.url)
    if (url.pathname.endsWith("/base")) {
      const ref = url.searchParams.get("ref") ?? defaultBase.ref
      const commit = heads.get(ref)
      if (!commit) throw new Error("unobserved native branch")
      return located({ ...defaultBase, ref, commit })
    }
    if (url.pathname.endsWith("/validate-draft")) {
      const body = Schema.decodeUnknownSync(draftInput)(await request.json())
      return located(graph({ ...body.base, path: body.path, text: body.draft, version: "draft:local-projection", editable: false }))
    }
    if (url.pathname.endsWith("/validate")) {
      const body = Schema.decodeUnknownSync(Schema.Struct({ source: Actions.Source, draft: Schema.String }))(await request.json())
      return located(graph({ ...body.source, text: body.draft }))
    }
    if (url.pathname.endsWith("/source")) {
      if (!written.exists) throw new Error("native file read before creation")
      return located({ ...native, ref: url.searchParams.get("ref"), path: url.searchParams.get("path"),
        text: written.text, commit: written.commit, version: written.version })
    }
    if (url.pathname === "/api/actions/operation/ab_proposal" && request.method === "POST") {
      const intent = Schema.decodeUnknownSync(Actions.OperationIntent)(await request.json())
      intents.push(intent)
      const prior = Array.from(receipts.values()).find((item) => item.clientID === intent.clientID)
      if (prior) return located(prior)
      const operation: Actions.Operation = { id: Actions.OperationID.make(`aop_${intents.length}`), bindingID: intent.binding.id,
        clientID: intent.clientID, kind: intent.kind, target: intent.target, state: "prepared", createdAt: 1, updatedAt: 1, expiresAt: 100 }
      receipts.set(operation.id, operation)
      return located(operation)
    }
    if (url.pathname.startsWith("/api/actions/operation/") && request.method === "GET") {
      return located(receipts.get(Actions.OperationID.make(url.pathname.split("/").at(-1) ?? "")))
    }
    const body = Schema.decodeUnknownSync(Schema.Struct({ id: Actions.OperationID, input: Schema.Record(Schema.String, Schema.Json) }))(await request.json())
    const operation = receipts.get(body.id)
    if (!operation || !url.pathname.endsWith(`/${operation.kind.split(".")[1]}`)) throw new Error("execution without exact native lease")
    if (operation.kind === "source.branch") heads.set(String(body.input.branch), defaultBase.commit)
    if (operation.kind === "source.write") {
      if (!heads.has(operation.target.ref ?? "")) throw new Error("write before native branch")
      written.exists = true; written.text = String(body.input.text); written.commit = newCommit; written.version = version
      heads.set(operation.target.ref ?? "", newCommit)
    }
    if (operation.kind === "source.review" && !written.exists) throw new Error("review before native file")
    const resourceID = operation.kind === "source.branch" ? String(body.input.branch) : operation.kind === "source.write" ? newCommit : "31"
    const accepted: Actions.Operation = { ...operation, state: "accepted", updatedAt: 2, result: { resourceID }, reason: "private provider detail" }
    receipts.set(operation.id, accepted)
    return located({ operation: accepted, ...(operation.kind === "source.review" ? { output: { kind: "sourceReview", id: "31",
      url: provider === "github" ? "https://github.com/owner/repo/pull/31" : "https://gitlab.com/owner/repo/-/merge_requests/31" } } : {}) })
  }, { preconnect() {} })
  const api = createActionsAPI({ server: { type: "http", http: { url: "http://localhost:4096", password: "private-token" } }, fetch, directory })
  const owner = createRequestOwner()
  const update = (patch: Partial<typeof state>) => { if (!owner.disposed) Object.assign(state, patch) }
  const editor = createSourceDraft({ api, owner, state: () => state, update,
    error: (cause) => actionsError(typeof cause === "string" ? new ActionsRequestError(cause) : cause) })
  if (options.existing) { state.route = { view: "source", path, ref: native.ref }; editor.install(native) }
  const commands = createActionsCommands({ api, owner, state: () => state, update, editor, pending: options.pending,
    remember: (value) => saved.push(value && structuredClone(value)) })
  const create = () => { commands.dialog({ kind: "create-workflow" }); return commands.submit({ name: "Proposal", path, template: "blank", content: draft }) }
  return { state, owner, editor, commands, requests, intents, receipts, saved, native, written, path, version, create,
    [Symbol.dispose]() { editor.reset(); commands.dispose(); owner.dispose() } }
}

export { defaultBase, newCommit, nativeVersion, draft, reviewForm, located, graph, draftInput, deferred, fixture }
