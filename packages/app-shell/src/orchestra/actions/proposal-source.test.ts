import { describe, expect, test } from "bun:test"
import { Actions } from "@orchestra/schema/actions"
import { ActionsRequestError, createActionsAPI, type ActionsScope } from "./api"
import { readProposalSource } from "./proposal-source"

const target = { bindingID: Actions.BindingID.make("ab_proposal_read"), revision: 7 }
const query = { path: ".gitlab/ci/proposal.yml", ref: "release" }
const base: Actions.SourceBase = { bindingID: target.bindingID, ref: query.ref, commit: "a".repeat(40) }
const source = (ref: string): Actions.Source => ({ bindingID: target.bindingID, path: query.path, ref, commit: base.commit,
  version: "native-file-version", text: "build:\n  script: test", editable: false })

function fixture(reply: Partial<Pick<ReturnType<typeof createActionsAPI>, "sourceBase" | "source">> = {}) {
  const calls: Array<{ method: string; scope: ActionsScope; query: unknown; signal: AbortSignal }> = []
  const api = {
    ...createActionsAPI({ directory: "/repo/proposal-read", server: { type: "http", http: { url: "http://proposal.invalid" } },
      fetch: Object.assign(async () => { throw new Error("Unexpected network request") }, { preconnect() {} }) }),
    sourceBase(scope: ActionsScope, ref: string | undefined, signal: AbortSignal) {
      calls.push({ method: "sourceBase", scope, query: { ref }, signal })
      return reply.sourceBase?.(scope, ref, signal) ?? Promise.resolve(base)
    },
    source(scope: ActionsScope, selection: { path: string; ref: string }, signal: AbortSignal) {
      calls.push({ method: "source", scope, query: selection, signal })
      return reply.source?.(scope, selection, signal) ?? Promise.resolve(source(selection.ref))
    },
  }
  return { api, calls }
}

describe("Actions proposal source proof", () => {
  test.each([true, false])("GitLab branchOnly=%s pins file read to proved head and preserves branch identity", async (branchOnly) => {
    const native = source(base.commit)
    const before = structuredClone(native)
    const scope = fixture({ source: async () => native })
    const signal = new AbortController().signal
    expect(await readProposalSource(scope.api, target, "gitlab", query, signal, branchOnly)).toEqual({ ...native, ref: query.ref })
    expect(scope.calls).toEqual([
      { method: "sourceBase", scope: target, query: { ref: query.ref }, signal },
      { method: "source", scope: target, query: { path: query.path, ref: base.commit }, signal },
    ])
    expect(native).toEqual(before)
  })

  test("strict proposal never treats missing branch as permission to read same-name tag", async () => {
    const cause = { kind: "not_found", message: "Branch absent; tag exists" }
    const scope = fixture({ sourceBase: async () => { throw cause } })
    await expect(readProposalSource(scope.api, target, "gitlab", query, new AbortController().signal)).rejects.toBe(cause)
    expect(scope.calls.map((call) => call.method)).toEqual(["sourceBase"])
  })

  test.each([
    new ActionsRequestError("not_found"), { kind: "not_found", message: "Native branch not found" },
  ])("generic inspection allows tag read only after explicit native not_found %j", async (cause) => {
    const scope = fixture({ sourceBase: async () => { throw cause } })
    const signal = new AbortController().signal
    expect(await readProposalSource(scope.api, target, "gitlab", query, signal, false)).toEqual(source(query.ref))
    expect(scope.calls).toEqual([
      { method: "sourceBase", scope: target, query: { ref: query.ref }, signal },
      { method: "source", scope: target, query, signal },
    ])
  })

  test.each([
    { name: "native sign-in denial", cause: { kind: "not_authenticated", message: "404 Not Found private-token" } },
    { name: "native permission denial", cause: { kind: "permission_denied", message: "not_found" } },
    { name: "server auth denial", cause: { _tag: "UnauthorizedError" } },
    { name: "untyped endpoint 404", cause: { reason: "UnexpectedStatus", cause: { status: 404 } } },
    { name: "untyped endpoint 401", cause: { reason: "UnexpectedStatus", cause: { status: 401 } } },
    { name: "message-only failure", cause: new Error("not_found: 404 Not Found") },
  ])("generic inspection cannot reinterpret $name as missing branch", async (entry) => {
    const scope = fixture({ sourceBase: async () => { throw entry.cause } })
    await expect(readProposalSource(scope.api, target, "gitlab", query, new AbortController().signal, false)).rejects.toBe(entry.cause)
    expect(scope.calls.map((call) => call.method)).toEqual(["sourceBase"])
  })

  test.each([
    { bindingID: Actions.BindingID.make("ab_foreign") }, { ref: "other-branch" },
  ])("foreign branch proof cannot trigger file read %j", async (mismatch) => {
    const scope = fixture({ sourceBase: async () => ({ ...base, ...mismatch }) })
    await expect(readProposalSource(scope.api, target, "gitlab", query, new AbortController().signal)).rejects.toThrow("source_conflict")
    expect(scope.calls.map((call) => call.method)).toEqual(["sourceBase"])
  })

  test.each([
    { bindingID: Actions.BindingID.make("ab_foreign") }, { path: ".gitlab-ci.yml" },
    { ref: query.ref }, { commit: "b".repeat(40) }, { commit: undefined },
  ])("file read cannot replace exact branch-head proof %j", async (mismatch) => {
    const scope = fixture({ source: async () => ({ ...source(base.commit), ...mismatch }) })
    await expect(readProposalSource(scope.api, target, "gitlab", query, new AbortController().signal)).rejects.toThrow("source_conflict")
    expect(scope.calls.map((call) => call.method)).toEqual(["sourceBase", "source"])
    expect(scope.calls[1].query).toEqual({ path: query.path, ref: base.commit })
  })

  test.each([
    { provider: "github" as const, ref: "release" },
    { provider: "gitlab" as const, ref: "A".repeat(40) },
    { provider: "gitlab" as const, ref: "B".repeat(64) },
  ])("$provider immutable/native selection $ref bypasses branch lookup", async (selection) => {
    const native = { ...source(selection.ref), commit: selection.ref }
    const scope = fixture({ source: async () => native, sourceBase: async () => { throw new Error("Unexpected branch lookup") } })
    const signal = new AbortController().signal
    const selected = { path: query.path, ref: selection.ref }
    expect(await readProposalSource(scope.api, target, selection.provider, selected, signal)).toBe(native)
    expect(scope.calls).toEqual([{ method: "source", scope: target, query: selected, signal }])
  })
})
