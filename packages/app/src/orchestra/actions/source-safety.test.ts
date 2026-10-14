import { describe, expect, test } from "bun:test"
import { Actions } from "@orchestra/schema/actions"
import { sourceDiscardBlocked, sourceDraftDirty } from "./source-draft-ui"
import { defaultBase, deferred, draft, fixture, graph, located, reviewForm } from "./source-proposal-fixture"

describe("Actions source safety", () => {
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

  test("GitHub workflow directory casing rejects before native base reads or draft installation", async () => {
    for (const path of [".GITHUB/workflows/proposal.yml", ".github/WORKFLOWS/proposal.yml", ".GITHUB/WORKFLOWS/proposal.yml", ".GitHub/Workflows/proposal.YAML"]) {
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

  test("GitHub workflow extensions remain case-insensitive under exact lowercase directory", async () => {
    for (const path of [".github/workflows/Proposal.YML", ".github/workflows/Proposal.YaML"]) {
      using scope = fixture({ path })
      await scope.create()
      expect(scope.state.commandError).toBeUndefined()
      expect(scope.state.route).toEqual({ view: "source", path, ref: defaultBase.ref })
      expect(scope.editor.created).toEqual({ path, ref: defaultBase.ref })
      expect(scope.state.draftBase).toEqual(defaultBase)
      expect(scope.state.draft).toBe(draft)
      expect(scope.requests.map((request) => [request.method, new URL(request.url).pathname])).toEqual([
        ["GET", "/api/actions/source/ab_proposal/base"],
      ])
      expect(scope.intents).toEqual([])
    }
  })
})
