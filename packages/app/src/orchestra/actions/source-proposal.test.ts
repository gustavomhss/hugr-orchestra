import { describe, expect, test } from "bun:test"
import { Actions } from "@orchestra/schema/actions"
import { Schema } from "effect"
import { canEditSource } from "./requests"
import { defaultBase, deferred, draft, draftInput, fixture, graph, located, nativeVersion, newCommit, reviewForm } from "./source-proposal-fixture"

describe("Actions source proposals", () => {
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
      if (request.method !== "POST" || new URL(request.url).pathname !== "/api/actions/operation/ab_proposal") return undefined
      admissions.push(await request.json())
      if (admissions.length === 1) throw new Error("private-token admission response lost")
      return undefined
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
