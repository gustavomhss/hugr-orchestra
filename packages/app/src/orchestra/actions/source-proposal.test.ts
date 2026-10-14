import { describe, expect, test } from "bun:test"
import { Actions } from "@orchestra/schema/actions"
import { Schema } from "effect"
import { actionsError, ActionsRequestError, createActionsAPI } from "./api"
import { createActionsCommands, type ActionsPending } from "./commands"
import { initial } from "./contract"
import { canEditSource, createRequestOwner, createSourceDraft } from "./requests"
import { sourceDiscardBlocked, sourceDraftDirty } from "./source-draft-ui"

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

describe("Actions source proposals", () => {
  test("GitHub invalid workflow paths reject before installing draft or reading native base", async () => {
    for (const path of ["ci.yml", ".github/workflows/nested/ci.yml", ".github/workflows/proposal.json", ".github/workflows/.yaml", ".github/workflows/../ci.yml", ".github/workflows/\uD800.yml"]) {
      using scope = fixture({ path })
      await scope.create()
      expect(scope.state.commandError?.kind).toBe("invalid_input")
      expect(scope.requests).toEqual([])
      expect(scope.intents).toEqual([])
      expect(scope.editor.created).toBeUndefined()
      expect(scope.state.draftBase).toBeUndefined()
      expect(scope.state.draft).toBe("")
      expect(scope.state.dialog?.kind).toBe("create-workflow")
    }
  })

  test("GitLab new configuration is an exact local file proposal, never catalog/config-slot mutation", async () => {
    for (const path of [".gitlab/ci/proposal.yml", ".gitlab-ci.yml"]) {
      using scope = fixture({ provider: "gitlab", path })
      await scope.create()
      expect(scope.state.route).toEqual({ view: "source", path, ref: defaultBase.ref })
      expect(scope.state.source).toEqual({ status: "idle" })
      expect(scope.state.workflows.value?.items).toEqual([])
      expect(sourceDraftDirty(scope.state)).toBe(true)
      scope.commands.dialog({ kind: "review-source" }); await scope.commands.submit(reviewForm)
      expect(scope.intents.map((item) => [item.kind, item.target.path])).toEqual([
        ["source.branch", path], ["source.write", path], ["source.review", path],
      ])
      expect(scope.requests.filter((item) => new URL(item.url).pathname.endsWith("/source"))
        .map((item) => new URL(item.url).searchParams.get("path"))).toEqual([path])
      expect(scope.state.source.value?.path).toBe(path)
      expect(sourceDraftDirty(scope.state)).toBe(false)
    }
    for (const path of ["ci.yml@other/project", "https://other.test/ci.yml", "/ci.yml", "ci/$CONFIG.yml", "ci/*.yml"]) {
      using scope = fixture({ provider: "gitlab", path })
      await scope.create()
      expect(scope.requests).toEqual([])
      expect(scope.editor.created).toBeUndefined()
      expect(scope.state.commandError?.kind).toBe("invalid_input")
    }
  })

  test("discard restores saved source and cancels validation without installing late projection", async () => {
    const started = deferred<AbortSignal>(); const response = deferred<Response>()
    using scope = fixture({ existing: true, respond(request) {
      if (new URL(request.url).pathname.endsWith("/validate")) { started.resolve(request.signal); return response.promise }
    } })
    expect(sourceDraftDirty(scope.state)).toBe(false)
    scope.editor.edit(draft)
    expect(sourceDraftDirty(scope.state)).toBe(true)
    const validating = scope.editor.validate(); const signal = await started.promise
    scope.state.source = { status: "error", value: scope.native }
    expect(sourceDraftDirty(scope.state)).toBe(true)
    scope.editor.abandon()
    expect(signal.aborted).toBe(true)
    expect(scope.state.draft).toBe(scope.native.text)
    expect(sourceDraftDirty(scope.state)).toBe(false)
    const before = structuredClone(scope.state)
    response.resolve(located(graph({ ...scope.native, text: draft }))); await validating
    expect(scope.state).toEqual(before)
    expect(scope.editor.leave({ view: "library" })).toBe(true)
  })

  test("new-file discard clears only local draft, keeps native state absent and cancels pending lint", async () => {
    const started = deferred<AbortSignal>(); const response = deferred<Response>()
    using scope = fixture({ provider: "gitlab", respond(request) {
      if (new URL(request.url).pathname.endsWith("/validate-draft")) { started.resolve(request.signal); return response.promise }
    } })
    await scope.create()
    const validating = scope.editor.validate(); const signal = await started.promise
    scope.editor.abandon()
    expect(signal.aborted).toBe(true)
    expect(scope.editor.created).toBeUndefined()
    expect(scope.state.draftBase).toBeUndefined()
    expect(scope.state.source).toEqual({ status: "idle" })
    expect(sourceDraftDirty(scope.state)).toBe(false)
    const before = structuredClone(scope.state)
    response.resolve(located(graph({ ...defaultBase, path: scope.path, text: draft, version: "draft:late", editable: false })))
    await validating
    expect(scope.state).toEqual(before)
    expect(scope.intents).toEqual([])
  })

  test("discard refuses sending/unknown leases and ambiguous lost admission without removing recovery state", async () => {
    for (const state of ["sending", "outcome_unknown"] as const) {
      using scope = fixture(); await scope.create()
      scope.state.operation = Actions.Operation.make({ id: Actions.OperationID.make("aop_uncertain"), bindingID: defaultBase.bindingID,
        clientID: "uncertain-client", kind: "source.branch", target: { path: scope.path, ref: defaultBase.ref }, state,
        createdAt: 1, updatedAt: 1, expiresAt: 100 })
      const before = structuredClone(scope.state)
      expect(sourceDiscardBlocked(scope.state)).toBe(true)
      scope.editor.abandon()
      expect(scope.state).toEqual(before)
      expect(scope.editor.created?.path).toBe(scope.path)
      expect(sourceDraftDirty(scope.state)).toBe(true)
    }
    using scope = fixture({ respond(request) {
      if (request.method === "POST" && new URL(request.url).pathname === "/api/actions/operation/ab_proposal")
        throw new Error("admission ACK lost")
    } })
    await scope.create(); scope.commands.dialog({ kind: "review-source" }); await scope.commands.submit(reviewForm)
    expect(scope.state.commandError?.kind).toBe("outcome_unknown")
    expect(scope.saved.at(-1)?.clientID).toBeDefined()
    const before = structuredClone(scope.state)
    scope.editor.abandon()
    expect(scope.state).toEqual(before)
    expect(scope.editor.created?.path).toBe(scope.path)
    expect(sourceDiscardBlocked(scope.state)).toBe(true)
  })

  test("empty catalog observes default branch/head and snapshots form before awaiting", async () => {
    const started = deferred<AbortSignal>()
    const response = deferred<Response>()
    using scope = fixture({ respond(request) { if (new URL(request.url).pathname.endsWith("/base")) { started.resolve(request.signal); return response.promise } } })
    scope.commands.dialog({ kind: "create-workflow" })
    const payload = { name: "Proposal", path: scope.path, template: "blank", content: draft }
    const creating = scope.commands.submit(payload)
    await started.promise
    payload.path = ".github/workflows/edited.yml"; payload.content = "edited after await"
    expect(scope.state.dialog?.kind).toBe("create-workflow")
    expect(scope.state.source.status).toBe("idle")
    response.resolve(located(defaultBase))
    await creating
    expect(scope.state.workflows.value?.items).toEqual([])
    expect(scope.state.route).toEqual({ view: "source", path: scope.path, ref: defaultBase.ref })
    expect(scope.state.draftBase).toEqual(defaultBase)
    expect(scope.state.draft).toBe(draft)
    expect(scope.state.source).toEqual({ status: "idle" })
    expect(scope.editor.base).toBeUndefined()
    expect(scope.state.dialog).toBeUndefined()
    expect(scope.requests.map((item) => item.method)).toEqual(["GET"])
    expect(new URL(scope.requests[0].url).searchParams.has("ref")).toBe(false)
    expect(new URL(scope.requests[0].url).searchParams.get("revision")).toBe("7")
    expect(scope.editor.leave({ view: "library" })).toBe(false)
  })

  test("pending native base reads abort on close, navigation and disposal; ignored abort cannot install", async () => {
    await Promise.all(["close", "navigate", "dispose"].map(async (action) => {
      const started = deferred<AbortSignal>(); const response = deferred<Response>()
      using scope = fixture({ respond(request) { started.resolve(request.signal); return response.promise } })
      const creating = scope.create(); const signal = await started.promise
      if (action === "close") scope.commands.dialog(undefined)
      if (action === "navigate") { scope.owner.reset(); scope.editor.reset(); scope.state.route = { view: "settings" } }
      if (action === "dispose") { scope.commands.dispose(); scope.owner.dispose() }
      const before = structuredClone(scope.state)
      expect(signal.aborted).toBe(true)
      response.resolve(located(defaultBase)); await creating
      expect(scope.state).toEqual(before)
      expect(scope.state.draftBase).toBeUndefined()
      expect(scope.editor.created).toBeUndefined()
    }))
  })

  test("binding ID, revision and route guards reject late reads even without transport cancellation", async () => {
    await Promise.all(["binding", "revision", "route"].map(async (action) => {
      const started = deferred<void>(); const response = deferred<Response>()
      using scope = fixture({ respond() { started.resolve(); return response.promise } })
      const creating = scope.create(); await started.promise
      if (!scope.state.binding) throw new Error("missing binding fixture")
      if (action === "binding") scope.state.binding = { ...scope.state.binding, id: Actions.BindingID.make("ab_other") }
      if (action === "revision") scope.state.binding = { ...scope.state.binding, revision: 8 }
      if (action === "route") scope.state.route = { view: "settings" }
      const before = structuredClone(scope.state)
      response.resolve(located(defaultBase)); await creating
      expect(scope.state).toEqual(before)
    }))
  })

  test("base failure keeps create dialog open and provider detail stays redacted", async () => {
    using scope = fixture({ respond: () => Response.json({ kind: "not_authenticated", message: "private-token provider detail" }, { status: 401 }) })
    await scope.create()
    expect(scope.state.dialog?.kind).toBe("create-workflow")
    expect(scope.state.commandError?.kind).toBe("not_authenticated")
    expect(JSON.stringify(scope.state.commandError)).not.toContain("private-token")
    expect(scope.editor.created).toBeUndefined()
    expect(scope.state.draftBase).toBeUndefined()
  })

  test("Unknown allows local branch edits with editable=false; publish denial and immutable sources stay blocked", async () => {
    using scope = fixture({ existing: true })
    expect(canEditSource(scope.state, scope.native)).toBe(true)
    scope.editor.edit(draft)
    expect(scope.state.draft).toBe(draft)
    scope.state.capabilities.value = [{ operation: "source.review", state: "unavailable", observedAt: 2 }]
    scope.commands.dialog({ kind: "review-source" }); await scope.commands.submit(reviewForm)
    expect(scope.intents).toEqual([])
    expect(scope.state.draft).toBe(draft)
    scope.state.capabilities.value = [{ operation: "source.write", state: "unavailable", observedAt: 2 }]
    scope.editor.edit("blocked"); expect(scope.state.draft).toBe(draft)
    scope.state.capabilities.value = [{ operation: "source.write", state: "available", observedAt: 2 }]
    scope.state.route = { ...scope.state.route, runID: "101" }
    scope.editor.edit("historical"); expect(scope.state.draft).toBe(draft)
    scope.editor.reset(); scope.state.route = { view: "source", path: scope.path, ref: defaultBase.commit }
    scope.editor.install({ ...scope.native, ref: defaultBase.commit, editable: true })
    expect(canEditSource(scope.state, scope.state.source.value)).toBe(false)
    scope.editor.edit("SHA"); expect(scope.state.draft).toBe(scope.native.text)
  })

  test("new draft validates without native file; draft edits abort stale validation", async () => {
    const started = deferred<AbortSignal>(); const response = deferred<Response>()
    using scope = fixture({ respond(request) { if (new URL(request.url).pathname.endsWith("/validate-draft")) { started.resolve(request.signal); return response.promise } } })
    await scope.create()
    const validating = scope.editor.validate(); const signal = await started.promise
    scope.editor.edit("newer draft"); expect(signal.aborted).toBe(true)
    response.resolve(located(graph({ ...defaultBase, path: scope.path, text: draft, version: "draft:old", editable: false })))
    await validating
    expect(scope.state.diagnostics).toEqual([])
    expect(scope.state.graph.status).toBe("idle")
    expect(scope.state.source.status).toBe("idle")
    expect(await scope.requests[1].json()).toEqual({ base: defaultBase, path: scope.path, draft })
  })

  const mismatches: Partial<Actions.Source>[] = [{ bindingID: Actions.BindingID.make("ab_other") }, { ref: "wrong" }, { commit: newCommit },
    { path: "wrong.yml" }, { text: "wrong text" }, { version: nativeVersion }, { version: "draft:" }]
  mismatches.forEach((mismatch) => test(`draft validation rejects identity mismatch ${JSON.stringify(mismatch)}`, async () => {
    using scope = fixture({ async respond(request) {
      if (!new URL(request.url).pathname.endsWith("/validate-draft")) return
      const body = Schema.decodeUnknownSync(draftInput)(await request.json())
      return located(graph({ ...body.base, path: body.path, text: body.draft, version: "draft:projection", editable: false, ...mismatch }))
    } })
    await scope.create(); await scope.editor.validate()
    expect(scope.state.graph.status).toBe("error")
    expect(scope.state.commandError?.kind).toBe("source_conflict")
    expect(scope.state.source.status).toBe("idle")
  }))

  ;(["github", "gitlab"] as const).forEach((provider) => test(`${provider} new file uses three exact leases with head/file readbacks and native ACK`, async () => {
    using scope = fixture({ provider })
    await scope.create(); await scope.editor.validate()
    expect(scope.state.graph.value?.source.version).toBe("draft:local-projection")
    scope.commands.dialog({ kind: "review-source" }); await scope.commands.submit(reviewForm)
    expect(scope.intents.map((item) => item.kind)).toEqual(["source.branch", "source.write", "source.review"])
    expect(new Set(scope.intents.map((item) => item.clientID)).size).toBe(3)
    scope.intents.forEach((item) => expect(item.clientID).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/))
    expect(scope.intents[0]).toMatchObject({ binding: { id: defaultBase.bindingID, revision: 7 }, target: { path: scope.path, ref: defaultBase.ref, resourceID: reviewForm.branch }, expected: { commit: defaultBase.commit } })
    expect(scope.intents[1]).toMatchObject({ target: { path: scope.path, ref: reviewForm.branch }, expected: { commit: defaultBase.commit } })
    expect(scope.intents[0].expected?.sourceVersion).toBeUndefined(); expect(scope.intents[1].expected?.sourceVersion).toBeUndefined()
    expect(scope.intents[2]).toMatchObject({ target: { path: scope.path, ref: reviewForm.branch, resourceID: defaultBase.ref }, expected: { commit: newCommit, sourceVersion: scope.version } })
    expect(scope.requests.map((item) => `${item.method} ${new URL(item.url).pathname.split("/").at(-1)}`)).toEqual([
      "GET base", "POST validate-draft", "POST ab_proposal", "POST branch", "GET base", "POST ab_proposal", "POST write", "GET source", "POST ab_proposal", "POST review",
    ])
    expect(await scope.requests[6].json()).toEqual({ id: "aop_2", input: { provider, mode: "create", text: draft, message: reviewForm.message } })
    expect(scope.state.draftBase).toBeUndefined(); expect(scope.state.source.value?.version).toBe(scope.version)
    expect(scope.state.commandOutput).toMatchObject({ kind: "sourceReview", id: "31" })
    expect(scope.state.operation?.reason).toBeUndefined()
    ;[draft, reviewForm.message, reviewForm.title, "private-token", "draftBase", "sourceReview"].forEach((value) => expect(JSON.stringify(scope.saved)).not.toContain(value))
    expect(scope.saved.at(-1)).toBeUndefined()
    scope.commands.dialog(undefined); expect(scope.state.commandOutput).toBeUndefined()
  }))

  test("updates retain exact native baseline and validation identity, despite unknown edit permission", async () => {
    using scope = fixture({ existing: true })
    scope.editor.edit(draft); await scope.editor.validate()
    expect(scope.state.graph.value?.source.version).toBe(scope.native.version)
    expect(await scope.requests[0].json()).toEqual({ source: scope.native, draft })
    scope.commands.dialog({ kind: "review-source" }); await scope.commands.submit(reviewForm)
    expect(scope.intents[0].expected).toEqual({ commit: defaultBase.commit, sourceVersion: scope.native.version })
    expect(scope.intents[1].expected).toEqual({ commit: defaultBase.commit, sourceVersion: scope.native.version })
    const write = scope.requests.find((item) => new URL(item.url).pathname.endsWith("/write"))
    expect(write && await write.json()).toMatchObject({ input: { mode: "update", text: draft } })
  })

  test("missing observed base cannot admit first mutation; branch readback conflict reuses same UUID", async () => {
    using missing = fixture(); await missing.create(); missing.state.draftBase = undefined
    missing.commands.dialog({ kind: "review-source" }); await missing.commands.submit(reviewForm)
    expect(missing.intents).toEqual([])
    const proof = { fail: true }
    using scope = fixture({ respond(request) {
      const url = new URL(request.url)
      if (proof.fail && url.pathname.endsWith("/base") && url.searchParams.get("ref") === reviewForm.branch)
        return located({ ...defaultBase, ref: reviewForm.branch, commit: newCommit })
    } })
    await scope.create(); scope.commands.dialog({ kind: "review-source" }); await scope.commands.submit(reviewForm)
    expect(scope.intents.map((item) => item.kind)).toEqual(["source.branch"])
    expect(scope.state.commandError?.kind).toBe("source_conflict")
    const branchID = scope.intents[0].clientID
    proof.fail = false; await scope.commands.submit(reviewForm)
    expect(scope.intents.map((item) => item.kind)).toEqual(["source.branch", "source.write", "source.review"])
    expect(scope.intents[0].clientID).toBe(branchID)
    expect(scope.requests.filter((item) => new URL(item.url).pathname.endsWith("/branch"))).toHaveLength(1)
  })

  test("unknown send and late receipt cannot advance/re-admit; explicit recovery reuses write lease", async () => {
    using scope = fixture({ respond(request) {
      if (!new URL(request.url).pathname.endsWith("/write")) return
      const intent = scope.intents.at(-1); const operation = intent && Array.from(scope.receipts.values()).find((item) => item.clientID === intent.clientID)
      if (!operation) throw new Error("missing write lease")
      scope.written.exists = true; scope.written.text = draft; scope.written.commit = newCommit; scope.written.version = nativeVersion
      scope.receipts.set(operation.id, { ...operation, state: "outcome_unknown" })
      return Response.json({ kind: "outcome_unknown", operationID: operation.id, message: "private-token lost ACK" }, { status: 400 })
    } })
    await scope.create(); scope.commands.dialog({ kind: "review-source" }); await scope.commands.submit(reviewForm)
    const intent = scope.intents[1]; const pending = scope.saved.at(-1); const operation = pending?.operationID && scope.receipts.get(pending.operationID)
    if (!operation || !pending) throw new Error("missing pending write")
    expect(pending.phases?.map((item) => item.kind)).toEqual(["source.branch"])
    scope.receipts.set(operation.id, { ...operation, state: "prepared" })
    await scope.commands.refreshReceipt(); await scope.commands.submit(reviewForm)
    expect(scope.state.commandError?.kind).toBe("outcome_unknown")
    expect(scope.intents).toHaveLength(2)
    scope.receipts.set(operation.id, { ...operation, state: "accepted", result: { resourceID: newCommit } })
    await scope.commands.refreshReceipt()
    expect(scope.intents).toHaveLength(2)
    expect(scope.state.dialog?.kind).toBe("review-source")
    await scope.commands.submit(reviewForm)
    expect(scope.intents.map((item) => item.kind)).toEqual(["source.branch", "source.write", "source.review"])
    expect(scope.intents[1].clientID).toBe(intent.clientID)
    expect(scope.requests.filter((item) => new URL(item.url).pathname.endsWith("/write"))).toHaveLength(1)
    using restored = fixture({ pending, existing: true, respond: () => located({ ...operation, state: "accepted", result: { resourceID: newCommit } }) })
    await restored.commands.refreshReceipt(); restored.editor.edit(draft)
    restored.commands.dialog({ kind: "review-source" }); await restored.commands.submit(reviewForm)
    expect(restored.state.commandError?.kind).toBe("outcome_unknown")
    expect(restored.intents).toEqual([])
    expect(restored.requests.map((item) => item.method)).toEqual(["GET"])
  })

  test("lost branch admission requires explicit same-UUID recovery, never automatic execution", async () => {
    const admissions: unknown[] = []
    using scope = fixture({ async respond(request) {
      if (request.method !== "POST" || new URL(request.url).pathname !== "/api/actions/operation/ab_proposal") return
      admissions.push(await request.json())
      if (admissions.length === 1) throw new Error("private-token admission response lost")
    } })
    await scope.create(); scope.commands.dialog({ kind: "review-source" }); await scope.commands.submit(reviewForm)
    expect(scope.state.commandError?.kind).toBe("outcome_unknown")
    await scope.commands.submit(reviewForm)
    expect(admissions).toHaveLength(1)
    await scope.commands.refreshReceipt(true)
    expect(admissions).toHaveLength(2); expect(admissions[1]).toEqual(admissions[0])
    expect(scope.requests.filter((item) => new URL(item.url).pathname.endsWith("/branch"))).toEqual([])
    await scope.commands.submit(reviewForm)
    expect(scope.intents.map((item) => item.kind)).toEqual(["source.branch", "source.write", "source.review"])
    expect(scope.requests.filter((item) => new URL(item.url).pathname.endsWith("/branch"))).toHaveLength(1)
  })

  test("native write readback and review ACK failures cannot publish draft", async () => {
    await Promise.all(["file", "ack"].map(async (failure) => {
      using scope = fixture({ respond(request) {
        const url = new URL(request.url)
        if (failure === "file" && url.pathname.endsWith("/source")) return located({ ...scope.native, ref: reviewForm.branch,
          text: draft, commit: newCommit, version: "draft:not-native" })
        if (failure === "ack" && url.pathname.endsWith("/review")) {
          const intent = scope.intents.at(-1); const operation = intent && Array.from(scope.receipts.values()).find((item) => item.clientID === intent.clientID)
          if (!operation) throw new Error("missing review lease")
          return located({ operation: { ...operation, state: "accepted", result: { unattributed: true } } })
        }
      } })
      await scope.create(); scope.commands.dialog({ kind: "review-source" }); await scope.commands.submit(reviewForm)
      expect(scope.state.dialog?.kind).toBe("review-source")
      expect(scope.state.draftBase).toEqual(defaultBase)
      expect(scope.state.source.status).toBe("idle")
      expect(scope.state.commandError?.kind).toBe(failure === "file" ? "source_conflict" : "outcome_unknown")
      expect(scope.intents.map((item) => item.kind)).toEqual(failure === "file" ? ["source.branch", "source.write"] : ["source.branch", "source.write", "source.review"])
    }))
  })
})
